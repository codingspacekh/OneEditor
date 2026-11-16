// M21 (GB4, D3, GN2): the brush engine of the paintbrush, pencil, eraser and airbrush. A stroke is
// dabs along the pointer's path, `spacing` % of the brush's size apart; each dab is a stamp of the
// brush's shape (round with its hardness's soft edge, square, star, or round dabs scattered at
// random, seeded so a test sees the same each time) laid at its `flow` into the stroke's own
// coverage; the stroke is then put on the layer once, at its `opacity`, as Photoshop does, so dabs
// overlapping within one stroke never go past the opacity. The pencil is hard and aliased (a 1 px
// pencil sets exactly one pixel); the eraser takes alpha away (on a layer mask: paints black); the
// airbrush keeps adding while it is held still. Painting stays inside the selection (weighted by
// it) and on the layer's bitmap where the layer is on the image. Only the tiles under the dabs are
// made again, so a stroke on a 12-megapixel photo follows the pointer (GN2) and its undo step
// keeps only those tiles (GN1). M22 (GB5): the retouching brushes use the same engine — a
// `painter` lays copied, blurred or sharpened pixels instead of one colour, `onDab` hears each dab
// (the smudge brush), and a stroke tells its weights and can be painted again (the heal brush).
import { EditError } from '../../model/errors.ts';
import { blendPixel, greyOf, isEmpty, selectionOver } from './paint.ts';
import { TILE, tileRect, tilesAcross, tilesDown, type Mask, type Raster } from './raster.ts';

export type BrushShape = 'round' | 'square' | 'star' | 'scatter';
export const BRUSH_SHAPES: readonly BrushShape[] = ['round', 'square', 'star', 'scatter'];

export interface BrushSettings {
  /** Across, in image px (1–2500). */
  size: number;
  /** % (0–100): how much of the dab is solid before its edge fades (100: a hard edge). */
  hardness: number;
  /** % (1–100): the most one stroke puts on, however often it goes over a place. */
  opacity: number;
  /** % (1–100): how much each dab puts on (low: builds up as the stroke goes over). */
  flow: number;
  /** % of the size (1–500) between dabs. */
  spacing: number;
  shape: BrushShape;
  /** Pen pressure makes the dab smaller (a pen tablet; the mouse presses fully). */
  pressureSize: boolean;
  /** Pen pressure makes the dab lighter. */
  pressureFlow: boolean;
}

export const DEFAULT_BRUSH: BrushSettings = {
  size: 20,
  hardness: 0,
  opacity: 100,
  flow: 100,
  spacing: 25,
  shape: 'round',
  pressureSize: true,
  pressureFlow: false,
};

const LIMITS: [keyof BrushSettings, string, number, number, string][] = [
  ['size', 'size', 1, 2500, 'px'],
  ['hardness', 'hardness', 0, 100, '%'],
  ['opacity', 'opacity', 1, 100, '%'],
  ['flow', 'flow', 1, 100, '%'],
  ['spacing', 'spacing', 1, 500, '%'],
];

/** Refuses settings out of their range, saying the range. */
export function checkBrush(b: BrushSettings): void {
  for (const [key, name, min, max, unit] of LIMITS) {
    const v = b[key] as number;
    if (!Number.isFinite(v) || v < min || v > max)
      throw new EditError(`The ${name} is ${min} to ${max} ${unit}.`);
  }
  if (!BRUSH_SHAPES.includes(b.shape)) throw new EditError('Choose a brush shape.');
}

/** A five-pointed star's inner points, as a share of its outer (a regular star: 0.382). */
const STAR_INNER = 0.382;
const SIN36 = Math.sin(Math.PI / 5);
const COS36 = Math.cos(Math.PI / 5);
const DEG = 180 / Math.PI;

/** How far a star's edge is from its middle, as a share of its points', at a direction. */
function starReach(dx: number, dy: number): number {
  // 0° straight up, then clockwise; folded into the 0–36° between a point and the next dip.
  let a = Math.atan2(dx, -dy) * DEG;
  if (a < 0) a += 360;
  a %= 72;
  const phi = (Math.min(a, 72 - a) * Math.PI) / 180;
  return (
    (STAR_INNER * SIN36) /
    (STAR_INNER * SIN36 * Math.cos(phi) + (1 - STAR_INNER * COS36) * Math.sin(phi))
  );
}

/**
 * How much of a dab (0–1) is at a pixel whose centre is (dx, dy) from the dab's, for a dab of
 * radius r and hardness 0–1. Aliased (the pencil): all or nothing. Otherwise the edge is smoothed
 * over one pixel, and inside it the dab fades from hardness × the edge's distance outwards along a
 * cosine (a soft brush: full in the middle, half half way out, nothing at the edge).
 */
export function dabValue(
  shape: BrushShape,
  dx: number,
  dy: number,
  r: number,
  hardness: number,
  aliased: boolean,
): number {
  let d: number;
  let edge = r;
  if (shape === 'square') d = Math.max(Math.abs(dx), Math.abs(dy));
  else {
    d = Math.sqrt(dx * dx + dy * dy);
    if (shape === 'star') edge = r * starReach(dx, dy);
  }
  if (aliased) return d <= edge + 1e-9 ? 1 : 0;
  const smooth = Math.min(1, Math.max(0, edge - d + 0.5));
  if (smooth === 0 || hardness >= 1) return smooth;
  const inner = edge * hardness;
  if (d <= inner) return smooth;
  const t = Math.min(1, (d - inner) / (edge - inner));
  return Math.min(smooth, 0.5 * (1 + Math.cos(Math.PI * t)));
}

export interface StrokePoint {
  /** On the image, in image px. */
  x: number;
  y: number;
  /** A pen's pressure, 0–1 (absent: full). */
  pressure?: number;
}

/**
 * M22 (GB5): lays `a` (0–1) of something other than one colour on the pixel at byte `k` of a tile
 * copy (which holds the pixel as it was before the stroke); (x, y) is the pixel on the target.
 */
export type PixelPainter = (
  out: Uint8ClampedArray,
  k: number,
  x: number,
  y: number,
  a: number,
) => void;

/** M22 (GB5): how much of a stroke (0–1: opacity × coverage × selection) is on each pixel of a box. */
export interface StrokeWeights {
  /** The box on the target, target px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Row by row. */
  values: Float32Array;
}

export interface StrokeOptions {
  /** What is painted: a pixel layer's bitmap, or its layer mask. */
  target: Raster;
  /** Where the target's top-left pixel is on the image. */
  x: number;
  y: number;
  brush: BrushSettings;
  /** 0–255 each; on a layer mask its grey is painted. */
  colour: readonly [number, number, number];
  /** The eraser: alpha taken away (on a layer mask: black painted). */
  erase?: boolean;
  /** The pencil: every pixel all or nothing. */
  aliased?: boolean;
  /** The image's selection: painting only inside it, weighted by it. */
  selection?: Mask;
  /** The scatter's random throws (the same seed scatters the same way). */
  seed?: number;
  /** M22 (GB5): lays something other than `colour` (the clone stamp, the blur brush…). */
  painter?: PixelPainter;
  /** M22 (GB5): told of each dab before it is laid, its centre on the target and its size. */
  onDab?: (cx: number, cy: number, size: number) => void;
}

export interface Stroke {
  /** Dabs from the last point to this one. */
  to(p: StrokePoint): void;
  /** The airbrush held still for `ms`: a dab at the last point every AIRBRUSH_MS. */
  hold(ms: number): void;
  /** The target with the stroke so far on it: only the tiles dabbed are new arrays. */
  result(): Raster;
  /** How many dabs were laid (a scattered dab counts once). */
  readonly dabs: number;
  /** M22 (GB5): the stroke's weights over the box it covers, or null before it covers a pixel. */
  weights(): StrokeWeights | null;
  /** M22 (GB5): the whole stroke laid again with another painter at the next result. */
  repaint(painter: PixelPainter): void;
}

/** The airbrush adds a dab this often while held still. */
export const AIRBRUSH_MS = 40;
/** Dabs no closer than this, in image px, whatever the spacing. */
const MIN_STEP = 0.25;
/** A scattered dab is this many round dabs, thrown up to the brush's size away. */
const SCATTER_COUNT = 3;

/** A small seeded random number generator (mulberry32): 0 ≤ n < 1. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Starts a stroke with a dab at `first`. */
export function createStroke(options: StrokeOptions, first: StrokePoint): Stroke {
  const { target, brush, colour, selection } = options;
  let painter = options.painter;
  const erase = options.erase ?? false;
  const aliased = options.aliased ?? false;
  const channels = target.channels;
  const grey = greyOf(colour);
  const hardness = brush.hardness / 100;
  const opacity = brush.opacity / 100;
  const rand = random(options.seed ?? 1);
  const across = tilesAcross(target);
  const down = tilesDown(target);
  /** The stroke's own coverage (0–1) on each tile it has dabbed. */
  const coverage = new Map<number, Float32Array>();
  /** The tiles dabbed since the last result, and the part of each (x0, y0, x1, y1 in the tile). */
  const dirty = new Map<number, [number, number, number, number]>();
  const selections = new Map<number, Uint8ClampedArray | null>();
  let current: Raster = target;
  let last = first;
  /** How far along the path since the last dab. */
  let travelled = 0;
  let held = 0;
  let dabs = 0;

  const sizeAt = (p: StrokePoint) =>
    brush.pressureSize && p.pressure !== undefined
      ? Math.max(1, brush.size * p.pressure)
      : brush.size;
  const flowAt = (p: StrokePoint) =>
    (brush.flow / 100) * (brush.pressureFlow && p.pressure !== undefined ? p.pressure : 1);

  /** One stamp of `shape` centred at (cx, cy) on the target, laid at `flow` into the coverage. */
  function stamp(shape: BrushShape, cx: number, cy: number, size: number, flow: number): void {
    let r = size / 2;
    if (aliased) {
      // The pencil's dab sits on whole pixels: an odd size centred on one, an even on a corner.
      const n = Math.max(1, Math.round(size));
      r = n / 2;
      cx = n % 2 === 1 ? Math.floor(cx) + 0.5 : Math.round(cx);
      cy = n % 2 === 1 ? Math.floor(cy) + 0.5 : Math.round(cy);
    }
    const x0 = Math.max(0, Math.floor(cx - r - 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1));
    const x1 = Math.min(target.width, Math.ceil(cx + r + 1));
    const y1 = Math.min(target.height, Math.ceil(cy + r + 1));
    if (x1 <= x0 || y1 <= y0) return;
    for (let ty = Math.floor(y0 / TILE); ty < Math.min(down, Math.ceil(y1 / TILE)); ty++)
      for (let tx = Math.floor(x0 / TILE); tx < Math.min(across, Math.ceil(x1 / TILE)); tx++) {
        const i = ty * across + tx;
        const at = tileRect(target, i);
        let cov = coverage.get(i);
        if (!cov) {
          cov = new Float32Array(at.width * at.height);
          coverage.set(i, cov);
        }
        let touched = false;
        const py0 = Math.max(y0, at.y);
        const px0 = Math.max(x0, at.x);
        const py1 = Math.min(y1, at.y + at.height);
        const px1 = Math.min(x1, at.x + at.width);
        for (let y = py0; y < py1; y++) {
          const dy = y + 0.5 - cy;
          const row = (y - at.y) * at.width - at.x;
          for (let x = px0; x < px1; x++) {
            const v = dabValue(shape, x + 0.5 - cx, dy, r, hardness, aliased);
            if (v <= 0) continue;
            const k = row + x;
            const c = cov[k]!;
            cov[k] = c + (1 - c) * flow * v;
            touched = true;
          }
        }
        if (!touched) continue;
        const part = dirty.get(i);
        const [lx0, ly0, lx1, ly1] = [px0 - at.x, py0 - at.y, px1 - at.x, py1 - at.y];
        dirty.set(
          i,
          part
            ? [
                Math.min(part[0], lx0),
                Math.min(part[1], ly0),
                Math.max(part[2], lx1),
                Math.max(part[3], ly1),
              ]
            : [lx0, ly0, lx1, ly1],
        );
      }
  }

  /** A dab at a point on the image. */
  function dab(p: StrokePoint): void {
    dabs++;
    const size = sizeAt(p);
    const flow = flowAt(p);
    const cx = p.x - options.x;
    const cy = p.y - options.y;
    options.onDab?.(cx, cy, size);
    if (brush.shape !== 'scatter') {
      stamp(brush.shape, cx, cy, size, flow);
      return;
    }
    for (let n = 0; n < SCATTER_COUNT; n++) {
      const ox = (rand() * 2 - 1) * size;
      const oy = (rand() * 2 - 1) * size;
      const s = size * (0.3 + 0.7 * rand());
      stamp('round', cx + ox, cy + oy, s, flow);
    }
  }

  function selectionFor(i: number): Uint8ClampedArray | null {
    if (!selections.has(i))
      selections.set(i, selectionOver(selection, tileRect(target, i), options.x, options.y));
    return selections.get(i)!;
  }

  /** The tiles the stroke has put paint on (the rest are the target's own). */
  const painted = new Set<number>();

  /**
   * Tile `i` with the stroke's coverage on it: the tile as last shown, its dabbed part made again
   * from the target's own pixels (a stroke is laid once on what was there, never on itself).
   */
  function compose(i: number, [x0, y0, x1, y1]: [number, number, number, number]) {
    const before = target.tiles[i] ?? null;
    const shown = current.tiles[i] ?? null;
    const cov = coverage.get(i)!;
    const sel = selectionFor(i);
    const { width, x: ax, y: ay } = tileRect(target, i);
    const out = shown ? shown.slice() : new Uint8ClampedArray(cov.length * channels);
    let any = false;
    for (let y = y0; y < y1; y++)
      for (let p = y * width + x0, end = y * width + x1; p < end; p++) {
        const c = cov[p]!;
        if (c === 0) continue;
        const a = opacity * c * (sel ? sel[p]! / 255 : 1);
        if (a <= 0) continue;
        const k = p * channels;
        if (before) for (let ch = 0; ch < channels; ch++) out[k + ch] = before[k + ch]!;
        else out.fill(0, k, k + channels);
        if (painter) painter(out, k, ax + p - y * width, ay + y, a);
        else blendPixel(out, k, channels, colour, grey, a, erase);
        any = true;
      }
    if (any) painted.add(i);
    if (!painted.has(i)) return before;
    // Only taking paint away (the eraser, black on a mask) can empty a tile.
    return (erase || channels === 1 || painter) && isEmpty(out) ? null : out;
  }

  dab(first);

  return {
    to(p) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const p0 = last.pressure;
      const p1 = p.pressure;
      const step = Math.max(MIN_STEP, (sizeAt(last) * brush.spacing) / 100);
      let along = step - travelled;
      while (along <= length + 1e-9) {
        const t = length === 0 ? 1 : along / length;
        dab({
          x: last.x + dx * t,
          y: last.y + dy * t,
          ...(p0 !== undefined || p1 !== undefined
            ? { pressure: (p0 ?? 1) + ((p1 ?? 1) - (p0 ?? 1)) * t }
            : {}),
        });
        along += step;
      }
      travelled = length - (along - step);
      last = p;
      held = 0;
    },
    hold(ms) {
      held += ms;
      while (held >= AIRBRUSH_MS) {
        held -= AIRBRUSH_MS;
        dab(last);
      }
    },
    result() {
      if (dirty.size === 0) return current;
      const tiles = [...current.tiles];
      for (const [i, part] of dirty) tiles[i] = compose(i, part);
      dirty.clear();
      current = tiles.some((t, i) => t !== target.tiles[i]) ? { ...target, tiles } : target;
      return current;
    },
    get dabs() {
      return dabs;
    },
    weights() {
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const i of coverage.keys()) {
        const at = tileRect(target, i);
        x0 = Math.min(x0, at.x);
        y0 = Math.min(y0, at.y);
        x1 = Math.max(x1, at.x + at.width);
        y1 = Math.max(y1, at.y + at.height);
      }
      if (x0 === Infinity) return null;
      const width = x1 - x0;
      const values = new Float32Array(width * (y1 - y0));
      let [bx0, by0, bx1, by1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [i, cov] of coverage) {
        const at = tileRect(target, i);
        const sel = selectionFor(i);
        for (let y = 0; y < at.height; y++)
          for (let x = 0; x < at.width; x++) {
            const p = y * at.width + x;
            const w = opacity * cov[p]! * (sel ? sel[p]! / 255 : 1);
            if (w <= 0) continue;
            const gx = at.x + x;
            const gy = at.y + y;
            values[(gy - y0) * width + gx - x0] = w;
            bx0 = Math.min(bx0, gx);
            by0 = Math.min(by0, gy);
            bx1 = Math.max(bx1, gx + 1);
            by1 = Math.max(by1, gy + 1);
          }
      }
      if (bx0 === Infinity) return null;
      // Cut down to the pixels the stroke is on.
      const w = bx1 - bx0;
      const cut = new Float32Array(w * (by1 - by0));
      for (let y = by0; y < by1; y++)
        cut.set(
          values.subarray((y - y0) * width + bx0 - x0, (y - y0) * width + bx1 - x0),
          (y - by0) * w,
        );
      return { x: bx0, y: by0, width: w, height: by1 - by0, values: cut };
    },
    repaint(next) {
      painter = next;
      for (const i of coverage.keys()) {
        const at = tileRect(target, i);
        dirty.set(i, [0, 0, at.width, at.height]);
      }
    },
  };
}
