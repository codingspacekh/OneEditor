// M21 G3: transforming a pixel layer, or the selected pixels on one — moved, scaled, turned,
// flipped, skewed — by an affine matrix in image px, built from the numbers a student types (X / Y
// of one of 9 reference points, W × H, °, skew, flips). Each output pixel's centre is mapped back
// into the source and sampled there — nearest (pixel art), bilinear or bicubic (Catmull-Rom, the
// kernels of resample.ts) — on premultiplied colours, transparent outside, so a turned photo's
// edges are smooth and never dark. Shrinking first resamples the source to about the new size
// (resample.ts widens its filter, so a photo made small does not shimmer), then the rest of the
// matrix. Whole-pixel moves keep the very same tiles (only the place changes); exact turns of 90°
// and 180° and flips copy pixels (no resampling: lossless) and land on whole pixels. The layer
// mask goes with the same matrix. With a selection, only the selected pixels are lifted (cut with
// the selection's soft edge), transformed and put back over the rest, and the selection follows.
// Pure functions of their inputs, a strip of 256 output rows at a time, so they can run in the
// pixel worker (jobs.ts) later — as whole rasters, not patches: a transform changes every tile.
import type { Point } from '../../animation/geometry.ts';
import type { PixelContent } from '../../animation/types.ts';
import { EditError } from '../../model/errors.ts';
import { ANCHORS, type Anchor } from '../image-size.ts';
import { compositeOnto } from './composite.ts';
import { copySelected, fadeSelected } from './cutout.ts';
import {
  bitmapFromRGBA,
  createMask,
  cropRaster,
  fillRect,
  maskFromBytes,
  readRegion,
  TILE,
  writeRegion,
  type Bitmap,
  type Mask,
  type Raster,
  type Rect,
} from './raster.ts';
import { FILTERS, resampleBitmap, resampleMask, type ResampleMethod } from './resample.ts';
import { placeMask, selectedBounds } from './selection.ts';

/** (x, y) → (a·x + c·y + e, b·x + d·y + f), as the canvas's setTransform. */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `m` after `n`: a point goes through `n` first. */
export const multiply = (m: Matrix, n: Matrix): Matrix => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});

/** The matrices one after the other: the first given is done first. */
export const chain = (...steps: Matrix[]): Matrix =>
  steps.reduce((done, next) => multiply(next, done), IDENTITY);

export function invert(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12)
    throw new EditError('That would flatten the pixels into a line. Change the numbers.');
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export const applyMatrix = (m: Matrix, p: Point): Point => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});

export const translation = (dx: number, dy: number): Matrix => ({ ...IDENTITY, e: dx, f: dy });

/** A linear step done about a point (it stays where it is). */
const about = (m: Matrix, p: Point): Matrix =>
  chain(translation(-p.x, -p.y), m, translation(p.x, p.y));

export const scaling = (sx: number, sy: number, at: Point = { x: 0, y: 0 }): Matrix =>
  about({ ...IDENTITY, a: sx, d: sy }, at);

/** cos and sin of a turn in degrees, exact at every quarter turn (no 6e-17 for cos 90°). */
function cosSin(degrees: number): [number, number] {
  const quarter = degrees / 90;
  if (Number.isInteger(quarter)) {
    const q = ((quarter % 4) + 4) % 4;
    return (
      [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as const
    )[q]!.slice() as [number, number];
  }
  const r = (degrees * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

/** Turned by `degrees` clockwise on screen (y points down) about a point, as objects turn. */
export function rotation(degrees: number, at: Point): Matrix {
  const [cos, sin] = cosSin(degrees);
  return about({ a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }, at);
}

/** AN25's skews: x' = x − tan(skewX)·y, y' = y + tan(skewY)·x, about a point. */
export function skewing(xDegrees: number, yDegrees: number, at: Point): Matrix {
  const tan = (deg: number) => (deg === 0 ? 0 : Math.tan((deg * Math.PI) / 180));
  return about({ ...IDENTITY, b: tan(yDegrees), c: -tan(xDegrees) }, at);
}

export type FlipAxis = 'horizontal' | 'vertical';

/** Mirrored left to right (horizontal) or top to bottom (vertical) about a point. */
export const flipping = (axis: FlipAxis, at: Point): Matrix =>
  axis === 'horizontal' ? scaling(-1, 1, at) : scaling(1, -1, at);

/** One of the 9 reference points of a box: a corner, an edge's middle or the centre. */
export function referencePoint(box: Rect, anchor: Anchor): Point {
  const i = ANCHORS.indexOf(anchor);
  return {
    x: box.x + (box.width * (i % 3)) / 2,
    y: box.y + (box.height * Math.floor(i / 3)) / 2,
  };
}

/** Where a box goes, rounded out to whole px (a hair over a whole number is not one more px). */
export function transformedBounds(box: Rect, m: Matrix): Rect {
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ].map((p) => applyMatrix(m, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.floor(Math.min(...xs) + 1e-6);
  const y = Math.floor(Math.min(...ys) + 1e-6);
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(Math.max(...xs) - 1e-6) - x),
    height: Math.max(1, Math.ceil(Math.max(...ys) - 1e-6) - y),
  };
}

/** The numbers typed in Properties ▸ Pixel layer, about the box they are measured on. */
export interface TransformValues {
  /** The point of the box X and Y give, and that stays put as it is scaled, turned or skewed. */
  reference?: Anchor;
  /** Where the reference point goes, image px (absent: where it is). */
  x?: number;
  y?: number;
  /** The new size in px (absent: as it is; with keepProportions, from the other side). */
  width?: number;
  height?: number;
  keepProportions?: boolean;
  /** Degrees clockwise. */
  rotate?: number;
  /** Degrees, −80 to 80 (as an object's). */
  skewX?: number;
  skewY?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}

export const MAX_SKEW = 80;

function checkLength(name: string, v: number | undefined): void {
  if (v !== undefined && !(Number.isFinite(v) && v > 0))
    throw new EditError(`The ${name} must be more than 0 px.`);
}

/**
 * The matrix for typed values on a box (the layer's pixels or the selection's bounds): scaled,
 * skewed, flipped and turned about the reference point (the centre by default), as an object is,
 * then the reference point moved to X, Y. "Bottom edge at Y = 1900": reference bottom, Y 1900.
 */
export function matrixFor(box: Rect, v: TransformValues): Matrix {
  checkLength('width', v.width);
  checkLength('height', v.height);
  for (const n of [v.x, v.y, v.rotate])
    if (n !== undefined && !Number.isFinite(n)) throw new EditError('Type a number.');
  for (const k of [v.skewX, v.skewY])
    if (k !== undefined && !(Number.isFinite(k) && Math.abs(k) <= MAX_SKEW))
      throw new EditError(`A skew must be between −${MAX_SKEW}° and ${MAX_SKEW}°.`);
  let sx = v.width === undefined ? 1 : v.width / box.width;
  let sy = v.height === undefined ? 1 : v.height / box.height;
  if (v.keepProportions && v.width !== undefined && v.height === undefined) sy = sx;
  if (v.keepProportions && v.height !== undefined && v.width === undefined) sx = sy;
  const ref = referencePoint(box, v.reference ?? 'centre');
  const origin = { x: 0, y: 0 };
  return chain(
    translation(-ref.x, -ref.y),
    scaling(sx, sy),
    skewing(v.skewX ?? 0, v.skewY ?? 0, origin),
    scaling(v.flipHorizontal ? -1 : 1, v.flipVertical ? -1 : 1),
    rotation(v.rotate ?? 0, origin),
    translation(v.x ?? ref.x, v.y ?? ref.y),
  );
}

// ---- what kind of matrix it is ----

const near = (v: number, to: number, by = 1e-9) => Math.abs(v - to) < by;

/** Quarter turns and flips only (each of a b c d −1, 0 or 1, one non-zero a row). */
function isTurnOrFlip(m: Matrix): boolean {
  const unit = (v: number) => near(Math.abs(v), 1);
  const zero = (v: number) => near(v, 0);
  return (
    (zero(m.b) && zero(m.c) && unit(m.a) && unit(m.d)) ||
    (zero(m.a) && zero(m.d) && unit(m.b) && unit(m.c))
  );
}

/**
 * The matrix with rounding errors taken off: a quarter turn, a flip or a move alone made exact and
 * landing on whole px (its move rounded: at most half a pixel, as a layer's place is in whole px),
 * so it copies pixels; any other's move a hair off whole px made whole.
 */
export function snapped(m: Matrix): Matrix {
  const whole = (v: number) => (near(v, Math.round(v), 1e-6) ? Math.round(v) : v);
  if (isTurnOrFlip(m))
    return {
      a: Math.round(m.a) + 0,
      b: Math.round(m.b) + 0,
      c: Math.round(m.c) + 0,
      d: Math.round(m.d) + 0,
      e: Math.round(m.e) + 0,
      f: Math.round(m.f) + 0,
    };
  return { ...m, e: whole(m.e), f: whole(m.f) };
}

const isWholeMove = (m: Matrix): boolean =>
  m.a === 1 &&
  m.b === 0 &&
  m.c === 0 &&
  m.d === 1 &&
  Number.isInteger(m.e) &&
  Number.isInteger(m.f);

export const isIdentity = (m: Matrix): boolean => isWholeMove(m) && m.e === 0 && m.f === 0;

/** Pixels copied, not resampled: a whole-pixel move, quarter turn or flip landing on whole px. */
const isExact = (m: Matrix): boolean =>
  isTurnOrFlip(m) &&
  Number.isInteger(m.a) &&
  Number.isInteger(m.b) &&
  Number.isInteger(m.e) &&
  Number.isInteger(m.f);

// ---- sampling ----

/** At most 16384 px a side and 64 megapixels (a 12-megapixel photo turned is about 20). */
export const MAX_SIDE = 16384;
export const MAX_AREA = 64 * 1024 * 1024;

function checkResult(box: Rect): void {
  if (box.width > MAX_SIDE || box.height > MAX_SIDE || box.width * box.height > MAX_AREA)
    throw new EditError(
      `That would make the pixels ${box.width} × ${box.height} px: at most ${MAX_SIDE} px a side and 64 megapixels. Make them smaller.`,
    );
}

type Edge = 'zero' | 'clamp';

/**
 * The weights of 2 taps (bilinear) or 4 (bicubic: resample.ts's Catmull-Rom, written out as its
 * polynomials in t, as quick as can be) for a sample point `t` (0–1) past the tap before it.
 */
export function tapWeights(taps: number, t: number, w: Float64Array): void {
  if (taps === 2) {
    w[0] = 1 - t;
    w[1] = t;
    return;
  }
  const t2 = t * t;
  const t3 = t2 * t;
  w[0] = 0.5 * (-t3 + 2 * t2 - t);
  w[1] = 0.5 * (3 * t3 - 5 * t2 + 2);
  w[2] = 0.5 * (-3 * t3 + 4 * t2 + t);
  w[3] = 0.5 * (t3 - t2);
}

/**
 * A pixel from premultiplied sums (colours weighed by weight × alpha, `va` the alpha): its
 * colours unpremultiplied; transparent (left zero) when hardly anything shows.
 */
function put(
  bytes: Uint8ClampedArray,
  k: number,
  vr: number,
  vg: number,
  vb: number,
  va: number,
): void {
  if (va < 0.5) return;
  bytes[k] = vr / va;
  bytes[k + 1] = vg / va;
  bytes[k + 2] = vb / va;
  bytes[k + 3] = va;
}

/** 4 × 4 taps all inside the source, from (x0, y0): premultiplied, into the pixel at byte k. */
function inside4(
  d: Uint8ClampedArray,
  W: number,
  x0: number,
  y0: number,
  wx: Float64Array,
  wy: Float64Array,
  bytes: Uint8ClampedArray,
  k: number,
): void {
  const w0 = wx[0]!;
  const w1 = wx[1]!;
  const w2 = wx[2]!;
  const w3 = wx[3]!;
  let vr = 0;
  let vg = 0;
  let vb = 0;
  let va = 0;
  for (let ky = 0; ky < 4; ky++) {
    const p = ((y0 + ky) * W + x0) * 4;
    const a0 = w0 * d[p + 3]!;
    const a1 = w1 * d[p + 7]!;
    const a2 = w2 * d[p + 11]!;
    const a3 = w3 * d[p + 15]!;
    const wy0 = wy[ky]!;
    vr += (d[p]! * a0 + d[p + 4]! * a1 + d[p + 8]! * a2 + d[p + 12]! * a3) * wy0;
    vg += (d[p + 1]! * a0 + d[p + 5]! * a1 + d[p + 9]! * a2 + d[p + 13]! * a3) * wy0;
    vb += (d[p + 2]! * a0 + d[p + 6]! * a1 + d[p + 10]! * a2 + d[p + 14]! * a3) * wy0;
    va += (a0 + a1 + a2 + a3) * wy0;
  }
  put(bytes, k, vr, vg, vb, va);
}

/** 2 × 2 taps all inside the source (bilinear), as inside4. */
function inside2(
  d: Uint8ClampedArray,
  W: number,
  x0: number,
  y0: number,
  wx: Float64Array,
  wy: Float64Array,
  bytes: Uint8ClampedArray,
  k: number,
): void {
  const w0 = wx[0]!;
  const w1 = wx[1]!;
  const p = (y0 * W + x0) * 4;
  const q = p + W * 4;
  const a0 = w0 * d[p + 3]!;
  const a1 = w1 * d[p + 7]!;
  const b0 = w0 * d[q + 3]!;
  const b1 = w1 * d[q + 7]!;
  const t = wy[0]!;
  const u = wy[1]!;
  put(
    bytes,
    k,
    (d[p]! * a0 + d[p + 4]! * a1) * t + (d[q]! * b0 + d[q + 4]! * b1) * u,
    (d[p + 1]! * a0 + d[p + 5]! * a1) * t + (d[q + 1]! * b0 + d[q + 5]! * b1) * u,
    (d[p + 2]! * a0 + d[p + 6]! * a1) * t + (d[q + 2]! * b0 + d[q + 6]! * b1) * u,
    (a0 + a1) * t + (b0 + b1) * u,
  );
}

/**
 * The output pixels of a row whose sample point can reach inside the source: i with
 * lo < s0 + i·step < hi on both axes (a pixel or two to spare; the samplers check each tap).
 */
function span(
  s0: number,
  step: number,
  lo: number,
  hi: number,
  n: number,
  into: [number, number],
): void {
  if (step === 0) {
    if (!(s0 > lo && s0 < hi)) into[1] = into[0];
    return;
  }
  let from = (lo - s0) / step;
  let to = (hi - s0) / step;
  if (from > to) [from, to] = [to, from];
  into[0] = Math.max(into[0], Math.floor(from));
  into[1] = Math.min(into[1], Math.ceil(to) + 1, n);
}

interface Placed<C extends 1 | 4> {
  raster: Raster<C>;
  x: number;
  y: number;
}

/**
 * A raster whose top-left pixel is at (x, y) on the image through `m`, resampled into the box it
 * goes to. `edge`: outside the source is transparent (pixels, a selection) or the nearest edge
 * pixel (a layer mask: the layer's own edge then fades once, not twice).
 */
function transformRaster<C extends 1 | 4>(
  r: Raster<C>,
  x: number,
  y: number,
  m: Matrix,
  method: ResampleMethod,
  edge: Edge,
): Placed<C> {
  if (isWholeMove(m)) return { raster: r, x: x + m.e, y: y + m.f };
  /** Source px (each pixel k covering k to k + 1) → image px. */
  let local = multiply(m, translation(x, y));
  let src: Raster<C> = r;
  if (isExact(local)) method = 'nearest';
  else if (method !== 'nearest') {
    // Shrinking: first to about the new size with resample's widened filter.
    const kx = Math.min(1, Math.hypot(local.a, local.b));
    const ky = Math.min(1, Math.hypot(local.c, local.d));
    const w = Math.max(1, Math.round(r.width * kx));
    const h = Math.max(1, Math.round(r.height * ky));
    if (w !== r.width || h !== r.height) {
      src = (
        r.channels === 4
          ? resampleBitmap(r as Bitmap, w, h, method)
          : resampleMask(r as Mask, w, h, method)
      ) as Raster<C>;
      local = multiply(local, scaling(r.width / w, r.height / h));
    }
  }
  const out = transformedBounds({ x: 0, y: 0, width: src.width, height: src.height }, local);
  checkResult(out);
  const inv = invert(local);
  const c = src.channels;
  const W = src.width;
  const H = src.height;
  const data = readRegion(src);
  const filter = method === 'nearest' ? null : FILTERS[method];
  const support = filter?.support ?? 0;
  // How far outside the source a sample point still picks up some of it.
  const reach = support === 0 ? 0 : support - 0.5;
  const taps = support * 2;
  const xs = new Int32Array(4);
  const ys = new Int32Array(4);
  const wx = new Float64Array(4);
  const wy = new Float64Array(4);
  const src32 = c === 4 ? new Uint32Array(data.buffer, data.byteOffset, data.length / 4) : null;
  const range: [number, number] = [0, 0];
  const tiles: (Uint8ClampedArray | null)[] = [];

  const weigh = (frac: number, w: Float64Array) => tapWeights(taps, frac, w);
  /** Taps off the source: the edge pixel (a mask), or none (−1). */
  function edgeTaps(first: number, size: number, at: Int32Array): void {
    for (let k = 0; k < taps; k++) {
      const p = first + k;
      at[k] = p >= 0 && p < size ? p : edge === 'clamp' ? (p < 0 ? 0 : size - 1) : -1;
    }
  }

  for (let first = 0; first < out.height; first += TILE) {
    const last = Math.min(out.height, first + TILE);
    const bytes = new Uint8ClampedArray((last - first) * out.width * c);
    const out32 = c === 4 ? new Uint32Array(bytes.buffer) : null;
    for (let j = first; j < last; j++) {
      const cy = out.y + j + 0.5;
      const cx = out.x + 0.5;
      const sx0 = inv.a * cx + inv.c * cy + inv.e;
      const sy0 = inv.b * cx + inv.d * cy + inv.f;
      range[0] = 0;
      range[1] = out.width;
      if (edge === 'zero') {
        span(sx0, inv.a, -reach - 1e-9, W + reach + 1e-9, out.width, range);
        span(sy0, inv.b, -reach - 1e-9, H + reach + 1e-9, out.width, range);
      }
      const row = (j - first) * out.width;
      for (let i = range[0]; i < range[1]; i++) {
        const sx = sx0 + inv.a * i;
        const sy = sy0 + inv.b * i;
        const o = row + i;
        if (!filter) {
          let px = Math.floor(sx);
          let py = Math.floor(sy);
          if (px < 0 || px >= W || py < 0 || py >= H) {
            if (edge === 'zero') continue;
            px = Math.min(W - 1, Math.max(0, px));
            py = Math.min(H - 1, Math.max(0, py));
          }
          if (out32) out32[o] = src32![py * W + px]!;
          else bytes[o] = data[py * W + px]!;
          continue;
        }
        const u = sx - 0.5;
        const v = sy - 0.5;
        const bx = Math.floor(u);
        const by = Math.floor(v);
        weigh(u - bx, wx);
        weigh(v - by, wy);
        const x0 = bx - support + 1;
        const y0 = by - support + 1;
        // Inside the source (nearly every pixel): the taps need no checking.
        const inside = x0 >= 0 && y0 >= 0 && x0 + taps <= W && y0 + taps <= H;
        if (!inside) {
          edgeTaps(x0, W, xs);
          edgeTaps(y0, H, ys);
        }
        if (c === 4 && inside) {
          // Nearly every pixel: the taps written out (each row across, then down).
          if (taps === 4) inside4(data, W, x0, y0, wx, wy, bytes, o * 4);
          else inside2(data, W, x0, y0, wx, wy, bytes, o * 4);
        } else if (c === 4) {
          let vr = 0;
          let vg = 0;
          let vb = 0;
          let va = 0;
          for (let ky = 0; ky < taps; ky++) {
            const py = ys[ky]!;
            if (py < 0) continue;
            const wyk = wy[ky]!;
            for (let kx = 0; kx < taps; kx++) {
              const px = xs[kx]!;
              if (px < 0) continue;
              const p = (py * W + px) * 4;
              const w = wx[kx]! * wyk * data[p + 3]!;
              vr += data[p]! * w;
              vg += data[p + 1]! * w;
              vb += data[p + 2]! * w;
              va += w;
            }
          }
          put(bytes, o * 4, vr, vg, vb, va);
        } else {
          let value = 0;
          for (let ky = 0; ky < taps; ky++) {
            const py = inside ? y0 + ky : ys[ky]!;
            if (py < 0) continue;
            const wyk = wy[ky]!;
            for (let kx = 0; kx < taps; kx++) {
              const px = inside ? x0 + kx : xs[kx]!;
              if (px >= 0) value += data[py * W + px]! * wx[kx]! * wyk;
            }
          }
          bytes[o] = value;
        }
      }
    }
    const strip =
      c === 4
        ? bitmapFromRGBA(out.width, last - first, bytes)
        : maskFromBytes(out.width, last - first, bytes);
    tiles.push(...strip.tiles);
  }
  return {
    raster: { width: out.width, height: out.height, channels: src.channels, tiles },
    x: out.x,
    y: out.y,
  };
}

/** The box a layer's pixels cover on the image. */
export const pixelsBox = (p: PixelContent): Rect => ({
  x: p.x,
  y: p.y,
  width: p.bitmap.width,
  height: p.bitmap.height,
});

/**
 * G3: a layer's pixels (and its mask) through `m`, resampled by `method`; the pixels themselves
 * when nothing changes, the same tiles at a new place for a whole-pixel move.
 */
export function transformPixels(p: PixelContent, m: Matrix, method: ResampleMethod): PixelContent {
  const t = snapped(m);
  if (isIdentity(t)) return p;
  const pixels = transformRaster(p.bitmap, p.x, p.y, t, method, 'zero');
  return {
    bitmap: pixels.raster,
    x: pixels.x,
    y: pixels.y,
    ...(p.mask ? { mask: transformRaster(p.mask, p.x, p.y, t, method, 'clamp').raster } : {}),
  };
}

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/**
 * `top` (pixels without a mask) put down over `base` as they are; the base grows to hold them
 * (its mask showing the new area), and only the tiles under them change when it does not.
 */
export function pasteOver(base: PixelContent, top: PixelContent): PixelContent {
  const from = pixelsBox(base);
  const box = union(from, pixelsBox(top));
  let target = base;
  if (box.width !== from.width || box.height !== from.height) {
    const local = { ...box, x: box.x - base.x, y: box.y - base.y };
    let mask: Mask | undefined;
    if (base.mask) {
      const all = fillRect(
        createMask(box.width, box.height),
        { x: 0, y: 0, width: box.width, height: box.height },
        255,
      );
      mask = writeRegion(
        all,
        { x: -local.x, y: -local.y, width: base.mask.width, height: base.mask.height },
        readRegion(base.mask),
      );
    }
    target = {
      bitmap: cropRaster(base.bitmap, local),
      x: box.x,
      y: box.y,
      ...(mask ? { mask } : {}),
    };
  }
  const region = {
    x: top.x - target.x,
    y: top.y - target.y,
    width: top.bitmap.width,
    height: top.bitmap.height,
  };
  const under = readRegion(target.bitmap, region);
  compositeOnto(under, readRegion(top.bitmap));
  return { ...target, bitmap: writeRegion(target.bitmap, region, under) };
}

/**
 * G3 with a selection: only the selected pixels (a partly selected pixel partly) lifted,
 * transformed and put back over the rest of the layer; the selection (image-sized) goes with them
 * (bilinear, so a soft edge stays soft; nearest keeps it hard). Refused when nothing selected
 * shows on the layer.
 */
export function transformSelected(
  p: PixelContent,
  selection: Mask,
  m: Matrix,
  method: ResampleMethod,
): { pixels: PixelContent; selection: Mask } {
  const t = snapped(m);
  if (isIdentity(t)) return { pixels: p, selection };
  const lifted = copySelected(p, selection);
  if (!lifted)
    throw new EditError('Nothing selected shows on this layer: it is transparent there.');
  const pixels = pasteOver(fadeSelected(p, selection, 0), transformPixels(lifted, t, method));
  const b = selectedBounds(selection)!;
  const moved = transformRaster(
    cropRaster(selection, b),
    b.x,
    b.y,
    t,
    method === 'nearest' ? 'nearest' : 'bilinear',
    'zero',
  );
  return {
    pixels,
    selection: placeMask(moved.raster, moved.x, moved.y, selection.width, selection.height),
  };
}
