// M21 step 3 (GB2): the maths of a pixel selection, a mask the image's size (255 selected, 0 not,
// between: partly, as a feathered edge). Shapes are rasterised anti-aliased (rectangle, ellipse,
// a lasso's polygon, a vector object's outline with the even-odd or nonzero rule); selections are
// combined as Shift (add), Alt (subtract) and Shift+Alt (intersect) do; and the whole selection is
// inverted, feathered (a blur), grown or shrunk (by a distance) and smoothed. Typed arrays only,
// tile by tile where a tile can be decided alone, so a 4128 × 2322 photo stays quick.
import type { Point } from '../../animation/geometry.ts';
import {
  createMask,
  cropRaster,
  intersect,
  readRegion,
  TILE,
  tilesAcross,
  tileRect,
  type Mask,
  type Rect,
} from './raster.ts';

/** How a new selection joins the one there is (none, Shift, Alt, Shift+Alt). */
export type SelectMode = 'new' | 'add' | 'subtract' | 'intersect';
export const SELECT_MODES: readonly SelectMode[] = ['new', 'add', 'subtract', 'intersect'];

export type FillRule = 'nonzero' | 'evenodd';

export const isEmptyMask = (m: Mask): boolean => m.tiles.every((t) => t === null);

const zero = (data: Uint8ClampedArray): boolean => {
  for (let i = 0; i < data.length; i++) if (data[i] !== 0) return false;
  return true;
};

/** A mask made tile by tile: `make` returns a tile's bytes (or null: all zero). */
function mapTiles(like: Mask, make: (i: number, size: number) => Uint8ClampedArray | null): Mask {
  const tiles = like.tiles.map((_, i) => {
    const at = tileRect(like, i);
    const t = make(i, at.width * at.height);
    return t && !zero(t) ? t : null;
  });
  return { width: like.width, height: like.height, channels: 1, tiles };
}

/**
 * `bytes` (region-sized, row by row) put into the mask: as raster.writeRegion, but without
 * comparing each tile with what it was (a selection is not an undo step), so a whole photo's
 * selection is put in at once.
 */
export function putRegion(m: Mask, region: Rect, bytes: Uint8ClampedArray): Mask {
  const inside = intersect(region, { x: 0, y: 0, width: m.width, height: m.height });
  if (!inside) return m;
  const across = tilesAcross(m);
  const tiles = [...m.tiles];
  const right = inside.x + inside.width;
  const bottom = inside.y + inside.height;
  for (let ty = Math.floor(inside.y / TILE); ty * TILE < bottom; ty++)
    for (let tx = Math.floor(inside.x / TILE); tx * TILE < right; tx++) {
      const i = ty * across + tx;
      const at = tileRect(m, i);
      const part = intersect(at, inside)!;
      const old = tiles[i] ?? null;
      const whole = part.width === at.width && part.height === at.height;
      const tile = old && !whole ? old.slice() : new Uint8ClampedArray(at.width * at.height);
      for (let y = part.y; y < part.y + part.height; y++) {
        const from = (y - region.y) * region.width + (part.x - region.x);
        tile.set(bytes.subarray(from, from + part.width), (y - at.y) * at.width + part.x - at.x);
      }
      tiles[i] = zero(tile) ? null : tile;
    }
  return { ...m, tiles };
}

/**
 * The smallest rectangle round every pixel not 0 (null: none), as raster.contentBounds but
 * quicker: each row of a tile is looked at only from its ends inwards.
 */
export function selectedBounds(m: Mask): Rect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  m.tiles.forEach((tile, i) => {
    if (!tile) return;
    const at = tileRect(m, i);
    const w = at.width;
    for (let y = 0; y < at.height; y++) {
      const row = y * w;
      let a = 0;
      while (a < w && tile[row + a] === 0) a++;
      if (a === w) continue;
      let b = w - 1;
      while (tile[row + b] === 0) b--;
      if (at.x + a < left) left = at.x + a;
      if (at.x + b > right) right = at.x + b;
      if (at.y + y < top) top = at.y + y;
      if (at.y + y > bottom) bottom = at.y + y;
    }
  });
  return left === Infinity
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function sameSize(a: Mask, b: Mask): void {
  if (a.width !== b.width || a.height !== b.height)
    throw new RangeError('The selections are not the same size.');
}

/** Everything selected. Full tiles of one size share one array (a raster never changes one). */
export function selectAllMask(width: number, height: number): Mask {
  const shared = new Map<number, Uint8ClampedArray>();
  return mapTiles(createMask(width, height), (_, size) => {
    let t = shared.get(size);
    if (!t) shared.set(size, (t = new Uint8ClampedArray(size).fill(255)));
    return t;
  });
}

/** A mask the image's size with `m` (a layer's, say) placed with its top left at (x, y). */
export const placeMask = (m: Mask, x: number, y: number, width: number, height: number): Mask =>
  cropRaster(m, { x: -Math.round(x), y: -Math.round(y), width, height });

/** The new selection joined to the old as the mode says. */
export function combineMasks(base: Mask | undefined, next: Mask, mode: SelectMode): Mask {
  if (mode === 'new' || (!base && mode === 'add')) return next;
  if (!base) return createMask(next.width, next.height);
  sameSize(base, next);
  return mapTiles(base, (i, size) => {
    const a = base.tiles[i] ?? null;
    const b = next.tiles[i] ?? null;
    if (mode === 'add') {
      if (!a || !b) return a ?? b;
      const out = new Uint8ClampedArray(size);
      for (let k = 0; k < size; k++) out[k] = a[k]! > b[k]! ? a[k]! : b[k]!;
      return out;
    }
    if (mode === 'subtract') {
      if (!a || !b) return a;
      const out = new Uint8ClampedArray(size);
      for (let k = 0; k < size; k++) out[k] = Math.round((a[k]! * (255 - b[k]!)) / 255);
      return out;
    }
    if (!a || !b) return null;
    const out = new Uint8ClampedArray(size);
    for (let k = 0; k < size; k++) out[k] = a[k]! < b[k]! ? a[k]! : b[k]!;
    return out;
  });
}

/** Each pixel of one times the other (a layer's alpha seen through its layer mask). */
export function multiplyMasks(a: Mask, b: Mask): Mask {
  sameSize(a, b);
  return mapTiles(a, (i, size) => {
    const x = a.tiles[i] ?? null;
    const y = b.tiles[i] ?? null;
    if (!x || !y) return null;
    const out = new Uint8ClampedArray(size);
    for (let k = 0; k < size; k++) out[k] = Math.round((x[k]! * y[k]!) / 255);
    return out;
  });
}

/** What was not selected is, and the other way round. */
export function invertMask(m: Mask): Mask {
  return mapTiles(m, (i, size) => {
    const t = m.tiles[i] ?? null;
    const out = new Uint8ClampedArray(size).fill(255);
    if (t) for (let k = 0; k < size; k++) out[k] = 255 - t[k]!;
    return out;
  });
}

// ---- shapes ----

interface Edge {
  /** Top and bottom (y0 < y1), x at the top, and the step in x for each step in y. */
  y0: number;
  y1: number;
  x0: number;
  slope: number;
  /** +1 going down, −1 going up (for the nonzero rule). */
  dir: number;
}

/** Sub-rows a pixel row is sampled at when anti-aliased (across, the cover is worked out exactly). */
const SUB_ROWS = 5;

/**
 * The area inside closed polygons (each ring closes back to its first point) as a mask the
 * image's size. Anti-aliased: a pixel on the edge is selected as much as it is covered; else a
 * pixel is in when its centre is. Self-crossing rings and holes follow the fill rule.
 */
export function polygonMask(
  width: number,
  height: number,
  rings: readonly (readonly Point[])[],
  { rule = 'nonzero', antiAlias = true }: { rule?: FillRule; antiAlias?: boolean } = {},
): Mask {
  const blank = createMask(width, height);
  const edges: Edge[] = [];
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      left = Math.min(left, a.x);
      right = Math.max(right, a.x);
      top = Math.min(top, a.y);
      bottom = Math.max(bottom, a.y);
      if (a.y === b.y || !Number.isFinite(a.y + b.y + a.x + b.x)) continue;
      const down = b.y > a.y;
      const [p, q] = down ? [a, b] : [b, a];
      edges.push({
        y0: p.y,
        y1: q.y,
        x0: p.x,
        slope: (q.x - p.x) / (q.y - p.y),
        dir: down ? 1 : -1,
      });
    }
  }
  if (edges.length === 0) return blank;
  const region = intersect(
    {
      x: Math.floor(left),
      y: Math.floor(top),
      width: Math.ceil(right) - Math.floor(left) + 1,
      height: Math.ceil(bottom) - Math.floor(top) + 1,
    },
    { x: 0, y: 0, width, height },
  );
  if (!region) return blank;
  edges.sort((a, b) => a.y0 - b.y0);
  const { x: rx, y: ry, width: rw, height: rh } = region;
  const out = new Uint8ClampedArray(rw * rh);
  // Per row: the part pixels' cover, and steps in the cover of whole pixels (summed across).
  const cover = new Float32Array(rw + 1);
  const steps = new Float32Array(rw + 1);
  const subs = antiAlias ? SUB_ROWS : 1;
  const weight = 1 / subs;
  let next = 0;
  let active: Edge[] = [];
  const xs: number[] = [];
  const dirs: number[] = [];
  const order: number[] = [];
  const span = (from: number, to: number) => {
    const a = Math.max(rx, from) - rx;
    const b = Math.min(rx + rw, to) - rx;
    if (b <= a) return;
    if (!antiAlias) {
      // The pixels whose centres are inside.
      const i0 = Math.ceil(a - 0.5);
      const i1 = Math.ceil(b - 0.5);
      if (i1 > i0) {
        steps[i0] = steps[i0]! + 1;
        steps[i1] = steps[i1]! - 1;
      }
      return;
    }
    const ia = Math.floor(a);
    const ib = Math.floor(b);
    if (ia === ib) {
      cover[ia] = cover[ia]! + (b - a) * weight;
      return;
    }
    cover[ia] = cover[ia]! + (ia + 1 - a) * weight;
    steps[ia + 1] = steps[ia + 1]! + weight;
    steps[ib] = steps[ib]! - weight;
    if (ib < rw) cover[ib] = cover[ib]! + (b - ib) * weight;
  };
  for (let row = 0; row < rh; row++) {
    cover.fill(0);
    steps.fill(0);
    for (let s = 0; s < subs; s++) {
      const y = ry + row + (s + 0.5) / subs;
      while (next < edges.length && edges[next]!.y0 <= y) active.push(edges[next++]!);
      active = active.filter((e) => e.y1 > y);
      xs.length = 0;
      dirs.length = 0;
      for (const e of active) {
        xs.push(e.x0 + (y - e.y0) * e.slope);
        dirs.push(e.dir);
      }
      order.length = 0;
      for (let i = 0; i < xs.length; i++) order.push(i);
      order.sort((i, j) => xs[i]! - xs[j]!);
      let winding = 0;
      let from = 0;
      for (const i of order) {
        const was = rule === 'nonzero' ? winding !== 0 : (winding & 1) === 1;
        winding += rule === 'nonzero' ? dirs[i]! : 1;
        const is = rule === 'nonzero' ? winding !== 0 : (winding & 1) === 1;
        if (!was && is) from = xs[i]!;
        else if (was && !is) span(from, xs[i]!);
      }
    }
    let run = 0;
    const base = row * rw;
    for (let i = 0; i < rw; i++) {
      run += steps[i]!;
      const v = cover[i]! + run;
      out[base + i] = v >= 1 ? 255 : Math.round(v * 255);
    }
  }
  return putRegion(blank, region, out);
}

const corners = (r: Rect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

/** GB2 rectangular marquee. */
export const rectMask = (width: number, height: number, r: Rect, antiAlias = true): Mask =>
  polygonMask(width, height, [corners(r)], { antiAlias });

/** The points round an ellipse, close enough that a 4000 px one is smooth (one every ~2 px). */
export function ellipsePoints(r: Rect): Point[] {
  const rx = r.width / 2;
  const ry = r.height / 2;
  const around = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.max(32, Math.min(4096, Math.ceil(around / 2)));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { x: r.x + rx + rx * Math.cos(a), y: r.y + ry + ry * Math.sin(a) };
  });
}

/** GB2 elliptical marquee. */
export const ellipseMask = (width: number, height: number, r: Rect, antiAlias = true): Mask =>
  polygonMask(width, height, [ellipsePoints(r)], { antiAlias });

// ---- changing the whole selection ----

/** The bounds of what is selected, `pad` px bigger each way, kept on the image. */
function padded(m: Mask, pad: number): Rect | null {
  const b = selectedBounds(m);
  if (!b) return null;
  return intersect(
    { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad },
    { x: 0, y: 0, width: m.width, height: m.height },
  );
}

/** A box blur of half-width `r` along each row, the row's end pixels repeated beyond it. */
function blurRows(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const size = 2 * r + 1;
  const last = w - 1;
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let total = src[base]! * (r + 1);
    for (let i = 1; i <= r; i++) total += src[base + (i < last ? i : last)]!;
    for (let x = 0; x < w; x++) {
      dst[base + x] = total / size;
      const add = x + r + 1;
      const sub = x - r;
      total += src[base + (add < last ? add : last)]! - src[base + (sub > 0 ? sub : 0)]!;
    }
  }
}

/** The same down each column, a row at a time (as the memory lies), the end rows repeated. */
function blurColumns(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const size = 2 * r + 1;
  const last = h - 1;
  const total = new Float32Array(w);
  for (let x = 0; x < w; x++) total[x] = src[x]! * (r + 1);
  for (let i = 1; i <= r; i++) {
    const row = (i < last ? i : last) * w;
    for (let x = 0; x < w; x++) total[x] = total[x]! + src[row + x]!;
  }
  for (let y = 0; y < h; y++) {
    const base = y * w;
    const add = (y + r + 1 < last ? y + r + 1 : last) * w;
    const sub = (y - r > 0 ? y - r : 0) * w;
    for (let x = 0; x < w; x++) {
      dst[base + x] = total[x]! / size;
      total[x] = total[x]! + (src[add + x]! - src[sub + x]!);
    }
  }
}

/** Half-widths of three box blurs that together are close to a Gaussian blur of this sigma. */
function gaussBoxes(sigma: number): number[] {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2);
}

/** The selection's area (padded) blurred by these box half-widths in turn. */
function blurred(m: Mask, radii: readonly number[]): { region: Rect; values: Float32Array } | null {
  const pad = radii.reduce((n, r) => n + r, 0) + 1;
  const region = padded(m, pad);
  if (!region) return null;
  const values = new Float32Array(readRegion(m, region));
  const spare = new Float32Array(values.length);
  for (const r of radii) {
    if (r < 1) continue;
    blurRows(values, spare, region.width, region.height, r);
    blurColumns(spare, values, region.width, region.height, r);
  }
  return { region, values };
}

/**
 * GB2 Feather: the selection's edge blurred over about `radius` px (a Gaussian blur of sigma
 * radius / 2, as three box blurs), so a cut-out fades out instead of stopping at once.
 */
export function featherMask(m: Mask, radius: number): Mask {
  if (radius <= 0) return m;
  const done = blurred(m, gaussBoxes(radius / 2));
  if (!done) return m;
  const out = new Uint8ClampedArray(done.values.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(done.values[i]!);
  return putRegion(m, done.region, out);
}

/**
 * GB2 Smooth: each pixel selected when most of the pixels within `radius` of it are, so specks
 * go, jagged edges and sharp corners round, and the edge is sharp (0 or 255).
 */
export function smoothMask(m: Mask, radius: number): Mask {
  const r = Math.round(radius);
  if (r <= 0) return m;
  const done = blurred(m, [r]);
  if (!done) return m;
  const out = new Uint8ClampedArray(done.values.length);
  for (let i = 0; i < out.length; i++) out[i] = done.values[i]! >= 127.5 ? 255 : 0;
  return putRegion(m, done.region, out);
}

/** Far: no source pixel at all (finite, so the distance sums stay numbers). */
const FAR = 1e20;

/** 1D squared distance transform (Felzenszwalb & Huttenlocher) of `f` into `d`. */
function distance1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  const cross = (q: number, p: number) => (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
  for (let q = 1; q < n; q++) {
    let s = cross(q, v[k]!);
    while (s <= z[k]!) s = cross(q, v[--k]!);
    v[++k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const p = v[k]!;
    d[q] = (q - p) * (q - p) + f[p]!;
  }
}

/**
 * Each pixel's squared distance to the nearest source pixel (`sources[i]` 1; ≥ FAR: none). Down
 * the columns the distance to a source is counted in two sweeps of whole rows (as the memory
 * lies); then each row is one exact 1D transform.
 */
function distances(w: number, h: number, sources: Uint8Array): Float32Array {
  const grid = new Float32Array(w * h);
  for (let x = 0; x < w; x++) grid[x] = sources[x] ? 0 : FAR;
  for (let y = 1; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) grid[row + x] = sources[row + x] ? 0 : grid[row - w + x]! + 1;
  }
  for (let y = h - 2; y >= 0; y--) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const below = grid[row + w + x]! + 1;
      if (below < grid[row + x]!) grid[row + x] = below;
    }
  }
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]!;
    grid[i] = g >= FAR / 2 ? FAR : g * g;
  }
  const f = new Float64Array(w);
  const d = new Float64Array(w);
  const v = new Int32Array(w);
  const z = new Float64Array(w + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = grid[row + x]!;
    distance1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[row + x] = d[x]!;
  }
  return grid;
}

/**
 * GB2 Grow (px > 0) or Shrink (px < 0): every pixel within that distance of the selection is
 * added, or every selected pixel within it of an unselected one dropped (at least half selected
 * counts as selected; corners round as a distance does). The image's edge is not an edge of the
 * selection, so a selection reaching it does not shrink from it.
 */
export function growMask(m: Mask, px: number): Mask {
  const r = Math.round(Math.abs(px));
  if (r === 0) return m;
  const grow = px > 0;
  const region = padded(m, grow ? r + 1 : 1);
  if (!region) return m;
  const bytes = readRegion(m, region);
  const reach = r * r;
  const sources = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) sources[i] = bytes[i]! >= 128 === grow ? 1 : 0;
  const d = distances(region.width, region.height, sources);
  const out = new Uint8ClampedArray(bytes.length);
  for (let i = 0; i < out.length; i++)
    out[i] = grow ? (d[i]! <= reach ? 255 : bytes[i]!) : d[i]! > reach ? bytes[i]! : 0;
  return putRegion(m, region, out);
}
