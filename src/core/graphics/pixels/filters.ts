// M22 step 4 (GB5, GN2): the blur and sharpen filters on a pixel layer (or its mask): Gaussian
// blur (a true Gaussian for a small radius, three box blurs — the same as selection.ts's feather —
// for a large one, so a radius of 20 costs no more than a radius of 2), motion blur (a streak
// along a line at an angle: a moving car), zoom blur (streaks out from a centre: rushing towards
// it) and sharpen (an unsharp mask: the difference from a blurred copy added back). Each is a pure
// function to pixels of the same size, on premultiplied colour so a soft or transparent edge keeps
// its own colour and never goes dark; a tile that comes out as it was is the very same tile (undo
// keeps only what changed, GN1). They run in the pixel worker (jobs.ts); the Gaussian works in
// strips of 256 rows, so a 12-megapixel photo needs tens of MB more, not hundreds.
import type { Point } from '../../animation/geometry.ts';
import {
  bitmapFromRGBA,
  maskFromBytes,
  readRegion,
  TILE,
  tilesAcross,
  type Raster,
} from './raster.ts';
import { gaussBoxes } from './selection.ts';

type Tiles = (Uint8ClampedArray | null)[];

// ---- what the filters share ----

/** Two tiles of the same place (so the same length) hold the same bytes. */
function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0 && a.length % 4 === 0) {
    const x = new Uint32Array(a.buffer, a.byteOffset, a.length / 4);
    const y = new Uint32Array(b.buffer, b.byteOffset, b.length / 4);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * A result's tiles as a raster of `before`'s size, each tile that holds the same bytes as
 * `before`'s the very tile of `before`; `before` itself when every one does.
 */
export function keepSame<C extends 1 | 4>(before: Raster<C>, tiles: Tiles): Raster<C> {
  let same = true;
  const out = tiles.map((t, i) => {
    const old = before.tiles[i] ?? null;
    if (t === old || (t && old && sameBytes(t, old))) return old;
    same = false;
    return t;
  });
  return same ? before : { ...before, tiles: out };
}

/** Rows of a raster's width (row-major bytes) as the tiles of those rows. */
export function stripTiles(channels: 1 | 4, width: number, rows: number, bytes: Uint8ClampedArray) {
  return (channels === 4 ? bitmapFromRGBA(width, rows, bytes) : maskFromBytes(width, rows, bytes))
    .tiles as Tiles;
}

/** Whole-raster bytes (row-major) back into a raster, sharing the tiles that did not change. */
export function fromBytes<C extends 1 | 4>(before: Raster<C>, bytes: Uint8ClampedArray): Raster<C> {
  return keepSame(before, stripTiles(before.channels, before.width, before.height, bytes));
}

/** True when every tile of rows [from, to) is empty (all zero). */
function rowsEmpty(r: Raster, from: number, to: number): boolean {
  const across = tilesAcross(r);
  for (let ty = Math.floor(from / TILE); ty * TILE < to; ty++)
    for (let tx = 0; tx < across; tx++) if (r.tiles[ty * across + tx]) return false;
  return true;
}

/** Bytes as floats, a bitmap's colours multiplied by their alpha (0–255). */
function premultiplied(src: Uint8ClampedArray, c: 1 | 4): Float32Array {
  const f = new Float32Array(src.length);
  if (c === 1) {
    f.set(src);
    return f;
  }
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]!;
    const k = a / 255;
    f[i] = src[i]! * k;
    f[i + 1] = src[i + 1]! * k;
    f[i + 2] = src[i + 2]! * k;
    f[i + 3] = a;
  }
  return f;
}

/** `count` floats from `start` back to bytes, a bitmap's colours divided by their alpha. */
function unpremultiplied(f: Float32Array, c: 1 | 4, start: number, count: number) {
  const out = new Uint8ClampedArray(count);
  if (c === 1) {
    for (let i = 0; i < count; i++) out[i] = f[start + i]!;
    return out;
  }
  for (let i = 0; i < count; i += 4) {
    const k = start + i;
    const a = Math.min(255, f[k + 3]!);
    if (a < 0.5) continue; // transparent: all zero
    const s = 255 / a;
    out[i] = Math.min(a, f[k]!) * s;
    out[i + 1] = Math.min(a, f[k + 1]!) * s;
    out[i + 2] = Math.min(a, f[k + 2]!) * s;
    out[i + 3] = a;
  }
  return out;
}

// ---- Gaussian blur ----

/** The largest radius (px) a blur takes. */
export const MAX_BLUR = 250;

interface Passes {
  /** A true Gaussian's weights (a small radius), or null: box blurs. */
  kernel: Float32Array | null;
  /** The half-widths of the box blurs done one after the other. */
  boxes: number[];
  /** How far (px) one pixel reaches: the rows a strip needs above and below it. */
  reach: number;
}

function passesFor(sigma: number): Passes {
  if (sigma < 2) {
    const k = Math.max(1, Math.ceil(3 * sigma));
    const w = new Float32Array(2 * k + 1);
    let total = 0;
    for (let i = -k; i <= k; i++) {
      const v = Math.exp(-(i * i) / (2 * sigma * sigma));
      w[i + k] = v;
      total += v;
    }
    for (let i = 0; i < w.length; i++) w[i]! /= total;
    return { kernel: w, boxes: [], reach: k };
  }
  const boxes = gaussBoxes(sigma).filter((r) => r >= 1);
  return { kernel: null, boxes, reach: boxes.reduce((n, r) => n + r, 0) };
}

/** A box blur of half-width r along each row of c interleaved channels, the ends repeated. */
function boxRows(src: Float32Array, dst: Float32Array, w: number, h: number, c: number, r: number) {
  const inv = 1 / (2 * r + 1);
  const last = w - 1;
  if (c === 4) {
    // RGBA (nearly always): the four channels together, one pass along the row.
    for (let y = 0; y < h; y++) {
      const base = y * w * 4;
      let t0 = src[base]! * (r + 1);
      let t1 = src[base + 1]! * (r + 1);
      let t2 = src[base + 2]! * (r + 1);
      let t3 = src[base + 3]! * (r + 1);
      for (let i = 1; i <= r; i++) {
        const p = base + (i < last ? i : last) * 4;
        t0 += src[p]!;
        t1 += src[p + 1]!;
        t2 += src[p + 2]!;
        t3 += src[p + 3]!;
      }
      for (let x = 0; x < w; x++) {
        const o = base + x * 4;
        dst[o] = t0 * inv;
        dst[o + 1] = t1 * inv;
        dst[o + 2] = t2 * inv;
        dst[o + 3] = t3 * inv;
        const add = base + (x + r + 1 < last ? x + r + 1 : last) * 4;
        const sub = base + (x - r > 0 ? x - r : 0) * 4;
        t0 += src[add]! - src[sub]!;
        t1 += src[add + 1]! - src[sub + 1]!;
        t2 += src[add + 2]! - src[sub + 2]!;
        t3 += src[add + 3]! - src[sub + 3]!;
      }
    }
    return;
  }
  for (let y = 0; y < h; y++) {
    const base = y * w * c;
    for (let ch = 0; ch < c; ch++) {
      const at = base + ch;
      let total = src[at]! * (r + 1);
      for (let i = 1; i <= r; i++) total += src[at + (i < last ? i : last) * c]!;
      for (let x = 0; x < w; x++) {
        dst[at + x * c] = total * inv;
        const add = x + r + 1;
        const sub = x - r;
        total += src[at + (add < last ? add : last) * c]! - src[at + (sub > 0 ? sub : 0) * c]!;
      }
    }
  }
}

/** The same down the columns, a whole row at a time (as the memory lies), the ends repeated. */
function boxColumns(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  c: number,
  r: number,
) {
  const span = w * c;
  const inv = 1 / (2 * r + 1);
  const last = h - 1;
  const total = new Float64Array(span);
  for (let i = 0; i < span; i++) total[i] = src[i]! * (r + 1);
  for (let k = 1; k <= r; k++) {
    const row = (k < last ? k : last) * span;
    for (let i = 0; i < span; i++) total[i]! += src[row + i]!;
  }
  for (let y = 0; y < h; y++) {
    const base = y * span;
    const add = (y + r + 1 < last ? y + r + 1 : last) * span;
    const sub = (y - r > 0 ? y - r : 0) * span;
    for (let i = 0; i < span; i++) {
      dst[base + i] = total[i]! * inv;
      total[i]! += src[add + i]! - src[sub + i]!;
    }
  }
}

/** A true Gaussian along each row, the ends repeated. */
function kernelRows(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  c: number,
  kernel: Float32Array,
) {
  const k = (kernel.length - 1) / 2;
  const last = w - 1;
  const taps = kernel.length;
  for (let y = 0; y < h; y++) {
    const base = y * w * c;
    for (let x = 0; x < w; x++) {
      const o = base + x * c;
      if (c === 4 && x >= k && x + k <= last) {
        // Inside the row (nearly every pixel): the taps need no clamping.
        let v0 = 0;
        let v1 = 0;
        let v2 = 0;
        let v3 = 0;
        let p = o - k * 4;
        for (let j = 0; j < taps; j++, p += 4) {
          const wj = kernel[j]!;
          v0 += wj * src[p]!;
          v1 += wj * src[p + 1]!;
          v2 += wj * src[p + 2]!;
          v3 += wj * src[p + 3]!;
        }
        dst[o] = v0;
        dst[o + 1] = v1;
        dst[o + 2] = v2;
        dst[o + 3] = v3;
        continue;
      }
      for (let ch = 0; ch < c; ch++) {
        let v = 0;
        for (let j = -k; j <= k; j++) {
          const p = x + j;
          v += kernel[j + k]! * src[base + (p < 0 ? 0 : p > last ? last : p) * c + ch]!;
        }
        dst[o + ch] = v;
      }
    }
  }
}

/** The same down the columns, a row at a time. */
function kernelColumns(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  c: number,
  kernel: Float32Array,
) {
  const k = (kernel.length - 1) / 2;
  const span = w * c;
  const last = h - 1;
  for (let y = 0; y < h; y++) {
    const base = y * span;
    dst.fill(0, base, base + span);
    for (let j = -k; j <= k; j++) {
      const p = y + j;
      const row = (p < 0 ? 0 : p > last ? last : p) * span;
      const wj = kernel[j + k]!;
      for (let i = 0; i < span; i++) dst[base + i]! += wj * src[row + i]!;
    }
  }
}

/**
 * GB5: Gaussian blur of `radius` px (the curve's standard deviation, as Photoshop's radius), the
 * edge pixels repeated beyond the edge (a photo's border does not fade); a layer mask is blurred
 * as well. Nothing, or a plain colour, comes back as it was.
 */
export function gaussianBlur<C extends 1 | 4>(r: Raster<C>, radius: number): Raster<C> {
  if (!(radius > 0)) return r;
  const p = passesFor(Math.min(radius, MAX_BLUR));
  const { width: W, height: H, channels: c } = r;
  const across = tilesAcross(r);
  const tiles: Tiles = [];
  for (let first = 0; first < H; first += TILE) {
    const last = Math.min(H, first + TILE);
    const from = Math.max(0, first - p.reach);
    const to = Math.min(H, last + p.reach);
    if (rowsEmpty(r, from, to)) {
      for (let i = 0; i < across; i++) tiles.push(null);
      continue;
    }
    const rows = to - from;
    const a = premultiplied(readRegion(r, { x: 0, y: from, width: W, height: rows }), c);
    const b = new Float32Array(a.length);
    if (p.kernel) {
      kernelRows(a, b, W, rows, c, p.kernel);
      kernelColumns(b, a, W, rows, c, p.kernel);
    } else
      for (const box of p.boxes) {
        boxRows(a, b, W, rows, c, box);
        boxColumns(b, a, W, rows, c, box);
      }
    const bytes = unpremultiplied(a, c, (first - from) * W * c, (last - first) * W * c);
    tiles.push(...stripTiles(c, W, last - first, bytes));
  }
  return keepSame(r, tiles);
}

// ---- motion blur ----

/** The longest streak (px) a motion or zoom blur makes. */
export const MAX_DISTANCE = 2000;

/**
 * GB5: motion blur: each pixel the average of those along a line through it at `angle` degrees
 * (0 across, 90 up and down, counted anticlockwise as Photoshop's), `distance` px long. Each line
 * of pixels is stepped once along, the sum of the pixels in reach kept as it goes (so a long
 * streak costs no more than a short one); near the edges only the pixels there are averaged.
 */
export function motionBlur<C extends 1 | 4>(
  r: Raster<C>,
  angle: number,
  distance: number,
): Raster<C> {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad);
  const alongX = Math.abs(dx) >= Math.abs(dy);
  const half = Math.round((Math.min(distance, MAX_DISTANCE) * Math.abs(alongX ? dx : dy)) / 2);
  if (!(half >= 1)) return r;
  const { width: W, height: H, channels: c } = r;
  const src = readRegion(r);
  const out = new Uint8ClampedArray(src.length);
  // Lines are stepped along x (mostly across) or along y; `shift` is how far each step is off.
  const steps = alongX ? W : H;
  const lines = alongX ? H : W;
  const slope = alongX ? dy / dx : dx / dy;
  const shift = new Int32Array(steps);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < steps; i++) {
    shift[i] = Math.round(i * slope);
    lo = Math.min(lo, shift[i]!);
    hi = Math.max(hi, shift[i]!);
  }
  const line = new Int32Array(steps);
  for (let o = -hi; o < lines - lo; o++) {
    let n = 0;
    for (let i = 0; i < steps; i++) {
      const q = o + shift[i]!;
      if (q < 0 || q >= lines) continue;
      line[n++] = (alongX ? q * W + i : i * W + q) * c;
    }
    // Each step moves at most one line over, so every line in this range has pixels.
    streak(src, out, line, n, half, c);
  }
  return fromBytes(r, out);
}

/** Along one line of n pixels (byte offsets): each the average of those within `half` steps. */
function streak(
  src: Uint8ClampedArray,
  out: Uint8ClampedArray,
  line: Int32Array,
  n: number,
  half: number,
  c: number,
): void {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  let count = 0;
  const add = (k: number, sign: number) => {
    if (c === 4) {
      const a = src[k + 3]! * sign;
      sr += src[k]! * a;
      sg += src[k + 1]! * a;
      sb += src[k + 2]! * a;
      sa += a;
    } else sa += src[k]! * sign;
    count += sign;
  };
  for (let j = 0; j < Math.min(half, n - 1) + 1; j++) add(line[j]!, 1);
  for (let j = 0; j < n; j++) {
    const k = line[j]!;
    if (c === 4) {
      if (sa > 0.5) {
        out[k] = sr / sa;
        out[k + 1] = sg / sa;
        out[k + 2] = sb / sa;
        out[k + 3] = sa / count;
      }
    } else out[k] = sa / count;
    if (j + half + 1 < n) add(line[j + half + 1]!, 1);
    if (j - half >= 0) add(line[j - half]!, -1);
  }
}

// ---- zoom blur ----

/**
 * For one zoom pass at `scale` about `cx`: for each x, the first of the two columns its sample
 * reads (as an offset of `n` values a pixel, the edges repeated), the second, and their weights
 * times `share` (the sample's part of the pixel's new value). The same down the whole picture.
 */
function zoomColumns(
  W: number,
  n: number,
  cx: number,
  scale: number,
  share: number,
  cols: ZoomColumns,
): void {
  const last = W - 1;
  for (let x = 0; x < W; x++) {
    const u = cx + (x + 0.5 - cx) * scale - 0.5;
    const i = Math.floor(u);
    const g = u - i;
    cols.c0[x] = (i < 0 ? 0 : i > last ? last : i) * n;
    cols.c1[x] = (i + 1 < 0 ? 0 : i + 1 > last ? last : i + 1) * n;
    cols.g0[x] = share * (1 - g);
    cols.g1[x] = share * g;
  }
}

type ZoomColumns = { c0: Int32Array; c1: Int32Array; g0: Float64Array; g1: Float64Array };

const zoomColumnsFor = (W: number): ZoomColumns => ({
  c0: new Int32Array(W),
  c1: new Int32Array(W),
  g0: new Float64Array(W),
  g1: new Float64Array(W),
});

/** The two rows a zoom sample of row `y` reads (as offsets), and how far it is between them. */
function zoomRows(y: number, H: number, rowLength: number, cy: number, scale: number) {
  const v = cy + (y + 0.5 - cy) * scale - 0.5;
  const ri = Math.floor(v);
  const last = H - 1;
  return {
    r0: (ri < 0 ? 0 : ri > last ? last : ri) * rowLength,
    r1: (ri + 1 < 0 ? 0 : ri + 1 > last ? last : ri + 1) * rowLength,
    fy: v - ri,
  };
}

/**
 * One zoom pass: each pixel of `to` is half the same pixel of `from` and half the bilinear
 * sample of `from` scaled by `scale` about the centre (edges repeated). `n` values a pixel: 1 (a
 * mask), 3 (an opaque photo: its alpha left out) or 4 (premultiplied RGBA).
 */
function zoomPass(
  from: Uint16Array,
  to: Uint16Array,
  W: number,
  H: number,
  n: 1 | 3 | 4,
  centre: Point,
  scale: number,
  cols: ZoomColumns,
): void {
  zoomColumns(W, n, centre.x, scale, 0.5, cols);
  const { c0, c1, g0, g1 } = cols;
  const rowLength = W * n;
  for (let y = 0; y < H; y++) {
    const { r0, r1, fy } = zoomRows(y, H, rowLength, centre.y, scale);
    const iy = 1 - fy;
    let o = y * rowLength;
    for (let x = 0; x < W; x++, o += n) {
      const a = g0[x]!;
      const b = g1[x]!;
      const w00 = a * iy;
      const w10 = b * iy;
      const w01 = a * fy;
      const w11 = b * fy;
      const p00 = r0 + c0[x]!;
      const p10 = r0 + c1[x]!;
      const p01 = r1 + c0[x]!;
      const p11 = r1 + c1[x]!;
      // Written out channel by channel, for speed (GN2).
      to[o] =
        from[p00]! * w00 +
        from[p10]! * w10 +
        from[p01]! * w01 +
        from[p11]! * w11 +
        from[o]! * 0.5 +
        0.5;
      if (n === 1) continue;
      to[o + 1] =
        from[p00 + 1]! * w00 +
        from[p10 + 1]! * w10 +
        from[p01 + 1]! * w01 +
        from[p11 + 1]! * w11 +
        from[o + 1]! * 0.5 +
        0.5;
      to[o + 2] =
        from[p00 + 2]! * w00 +
        from[p10 + 2]! * w10 +
        from[p01 + 2]! * w01 +
        from[p11 + 2]! * w11 +
        from[o + 2]! * 0.5 +
        0.5;
      if (n === 4)
        to[o + 3] =
          from[p00 + 3]! * w00 +
          from[p10 + 3]! * w10 +
          from[p01 + 3]! * w01 +
          from[p11 + 3]! * w11 +
          from[o + 3]! * 0.5 +
          0.5;
    }
  }
}

/**
 * The last zoom pass: each pixel of `to` the mean of the bilinear samples of `from` scaled by
 * `inner` and by `outer` about the centre (the edges repeated).
 */
function zoomLastPass(
  from: Uint16Array,
  to: Uint16Array,
  W: number,
  H: number,
  n: 1 | 3 | 4,
  centre: Point,
  inner: number,
  outer: number,
  cols: [ZoomColumns, ZoomColumns],
): void {
  const [ci, co] = cols;
  zoomColumns(W, n, centre.x, inner, 0.5, ci);
  zoomColumns(W, n, centre.x, outer, 0.5, co);
  const rowLength = W * n;
  for (let y = 0; y < H; y++) {
    const i = zoomRows(y, H, rowLength, centre.y, inner);
    const u = zoomRows(y, H, rowLength, centre.y, outer);
    let o = y * rowLength;
    for (let x = 0; x < W; x++, o += n) {
      const p00 = i.r0 + ci.c0[x]!;
      const p10 = i.r0 + ci.c1[x]!;
      const p01 = i.r1 + ci.c0[x]!;
      const p11 = i.r1 + ci.c1[x]!;
      const q00 = u.r0 + co.c0[x]!;
      const q10 = u.r0 + co.c1[x]!;
      const q01 = u.r1 + co.c0[x]!;
      const q11 = u.r1 + co.c1[x]!;
      const w00 = ci.g0[x]! * (1 - i.fy);
      const w10 = ci.g1[x]! * (1 - i.fy);
      const w01 = ci.g0[x]! * i.fy;
      const w11 = ci.g1[x]! * i.fy;
      const z00 = co.g0[x]! * (1 - u.fy);
      const z10 = co.g1[x]! * (1 - u.fy);
      const z01 = co.g0[x]! * u.fy;
      const z11 = co.g1[x]! * u.fy;
      for (let ch = 0; ch < n; ch++)
        to[o + ch] =
          from[p00 + ch]! * w00 +
          from[p10 + ch]! * w10 +
          from[p01 + ch]! * w01 +
          from[p11 + ch]! * w11 +
          from[q00 + ch]! * z00 +
          from[q10 + ch]! * z10 +
          from[q01 + ch]! * z01 +
          from[q11 + ch]! * z11 +
          0.5;
    }
  }
}

/**
 * GB5: zoom blur: each pixel streaked along the line to `centre` (raster px), the streak
 * `amount` % of its distance from the centre long (so the centre stays sharp and the edges rush
 * past). Done as repeated halvings: each pass averages every pixel with the picture scaled out
 * about the centre, by half as much as the last pass did, so after n passes each pixel is the
 * average of 2ⁿ evenly spaced samples along the outer part of its streak (about a pixel apart);
 * a last pass moves the whole back in by half the streak, so it is centred on the pixel. M23
 * (GN2): one sample read between pixels a pass, not two (the other is the pixel itself), and an
 * opaque photo's alpha left out: within 3 s on 12 megapixels.
 */
export function zoomBlur<C extends 1 | 4>(r: Raster<C>, centre: Point, amount: number): Raster<C> {
  const a = Math.min(100, amount) / 100;
  if (!(a > 0)) return r;
  const { width: W, height: H, channels: c } = r;
  // The streak runs from (1 − a/2) to (1 + a/2) of the distance, evenly on a log scale.
  const span = Math.log((1 + a / 2) / (1 - a / 2));
  const far = Math.max(
    ...[
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ].map(([x, y]) => Math.hypot(x! - centre.x, y! - centre.y)),
  );
  const longest = Math.min(MAX_DISTANCE, far * (Math.exp(span / 2) - Math.exp(-span / 2)));
  if (longest < 1) return r;
  // Samples about 1.5 px apart: the bilinear sampling fills in between.
  const passes = Math.min(12, Math.max(1, Math.ceil(Math.log2(longest / 1.5))));
  const src = readRegion(r);
  let opaque = c === 4;
  for (let i = 3; opaque && i < src.length; i += 4) if (src[i] !== 255) opaque = false;
  const n = c === 1 ? 1 : opaque ? 3 : 4;
  const count = W * H;
  // Premultiplied, 256 steps a level (enough for a dozen passes without banding).
  let from = new Uint16Array(count * n);
  if (n === 1) for (let i = 0; i < count; i++) from[i] = src[i]! * 256;
  else if (n === 3)
    for (let i = 0, j = 0; j < from.length; i += 4, j += 3) {
      from[j] = src[i]! * 256;
      from[j + 1] = src[i + 1]! * 256;
      from[j + 2] = src[i + 2]! * 256;
    }
  else
    for (let i = 0; i < src.length; i += 4) {
      const al = src[i + 3]!;
      const k = (al * 256) / 255;
      from[i] = Math.round(src[i]! * k);
      from[i + 1] = Math.round(src[i + 1]! * k);
      from[i + 2] = Math.round(src[i + 2]! * k);
      from[i + 3] = al * 256;
    }
  let to = new Uint16Array(count * n);
  const cols: [ZoomColumns, ZoomColumns] = [zoomColumnsFor(W), zoomColumnsFor(W)];
  // The first passes one-sided (outwards), the whole moved in by as much at the last.
  let moved = span / 2 ** (passes + 1);
  for (let k = 1; k < passes; k++) {
    const step = span / 2 ** (k + 1);
    moved += step;
    zoomPass(from, to, W, H, n, centre, Math.exp(2 * step), cols[0]);
    [from, to] = [to, from];
  }
  const last = span / 2 ** (passes + 1);
  zoomLastPass(from, to, W, H, n, centre, Math.exp(-moved), Math.exp(2 * last - moved), cols);
  const bytes = new Uint8ClampedArray(src.length);
  if (n === 1) for (let i = 0; i < count; i++) bytes[i] = to[i]! / 256;
  else if (n === 3)
    for (let i = 0, j = 0; j < to.length; i += 4, j += 3) {
      bytes[i] = to[j]! / 256;
      bytes[i + 1] = to[j + 1]! / 256;
      bytes[i + 2] = to[j + 2]! / 256;
      bytes[i + 3] = 255;
    }
  else
    for (let i = 0; i < src.length; i += 4) {
      const al = to[i + 3]!;
      if (al < 128) continue;
      bytes[i] = (to[i]! * 255) / al;
      bytes[i + 1] = (to[i + 1]! * 255) / al;
      bytes[i + 2] = (to[i + 2]! * 255) / al;
      bytes[i + 3] = al / 256;
    }
  return fromBytes(r, bytes);
}

// ---- sharpen ----

export interface SharpenSettings {
  /** How much of the difference from the blurred copy is added back, %. */
  amount: number;
  /** The blur's radius, px: small for fine detail, larger for a bolder look. */
  radius: number;
  /** Differences smaller than this (0–255) are left alone, so noise and skin stay smooth. */
  threshold: number;
}

/**
 * GB5: sharpen as an unsharp mask: each colour moved away from the same pixel of a blurred copy
 * by `amount` % of the difference, where the difference is at least `threshold`; the alpha is
 * kept (a transparent pixel stays transparent). Edges get a little darker on their dark side and
 * lighter on their light side, so they look crisper.
 */
export function unsharpMask<C extends 1 | 4>(r: Raster<C>, s: SharpenSettings): Raster<C> {
  if (!(s.amount > 0) || !(s.radius > 0)) return r;
  const blurred = gaussianBlur(r, s.radius);
  if (blurred === r) return r;
  const k = s.amount / 100;
  const c = r.channels;
  const colours = c === 4 ? 3 : 1;
  const threshold = Math.max(0, s.threshold);
  const tiles = r.tiles.map((t, i) => {
    const b = blurred.tiles[i] ?? null;
    if (!t || t === b) return t;
    const out = t.slice();
    for (let p = 0; p < t.length; p += c) {
      if (c === 4 && t[p + 3] === 0) continue;
      for (let ch = 0; ch < colours; ch++) {
        const d = t[p + ch]! - (b ? b[p + ch]! : 0);
        if (d !== 0 && Math.abs(d) >= threshold) out[p + ch] = t[p + ch]! + k * d;
      }
    }
    return out;
  });
  return keepSame(r, tiles);
}
