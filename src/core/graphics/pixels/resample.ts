// M21 GB6: Image size's resampling — a bitmap (or a mask) made a new size in pixels by nearest
// neighbour (hard pixels: pixel art, a QR code), bilinear (smooth) or bicubic (Catmull-Rom,
// a = −0.5: sharper; what Photoshop and GIMP use by default). Separable: each row is resampled
// across, then the columns down, with the filter widened when shrinking so every source pixel
// counts (a checkerboard halved is grey, not stripes). A bitmap's colours are resampled
// premultiplied by their alpha, so a transparent edge does not go dark. The work is done in
// strips of 256 output rows, so a 12-megapixel photo needs a few tens of MB more, not hundreds,
// and the output's empty tiles stay null. A pure function of its inputs: it can run in the pixel
// worker unchanged.
import { bitmapFromRGBA, maskFromBytes, readRegion, TILE, type Raster } from './raster.ts';
import type { Bitmap, Mask } from './raster.ts';

export type ResampleMethod = 'nearest' | 'bilinear' | 'bicubic';

export const RESAMPLE_METHODS: readonly ResampleMethod[] = ['bicubic', 'bilinear', 'nearest'];

export const RESAMPLE_NAMES: Readonly<Record<ResampleMethod, string>> = {
  bicubic: 'Bicubic (smooth, sharper: photos)',
  bilinear: 'Bilinear (smooth)',
  nearest: 'Nearest neighbour (hard edges: pixel art)',
};

/** The filters: how far each reaches (in source pixels, at 1:1) and its weight at a distance. */
const FILTERS: Record<
  Exclude<ResampleMethod, 'nearest'>,
  { support: number; at(x: number): number }
> = {
  bilinear: {
    support: 1,
    at: (x) => {
      const d = Math.abs(x);
      return d < 1 ? 1 - d : 0;
    },
  },
  bicubic: {
    support: 2,
    // Keys' cubic with a = −0.5 (Catmull-Rom).
    at: (x) => {
      const a = -0.5;
      const d = Math.abs(x);
      if (d < 1) return ((a + 2) * d - (a + 3)) * d * d + 1;
      if (d < 2) return (((d - 5) * d + 8) * d - 4) * a;
      return 0;
    },
  },
};

interface Taps {
  /** The first source pixel each output pixel reads. */
  start: Int32Array;
  /** How many it reads. */
  count: Int32Array;
  /** `max` weights per output pixel, normalised to add up to 1. */
  weights: Float32Array;
  max: number;
}

/**
 * The weights of each output pixel on the source pixels along one axis (as Pillow's): the output
 * pixel's centre mapped into the source, and the filter widened by the scale when shrinking.
 */
function tapsOf(inSize: number, outSize: number, method: Exclude<ResampleMethod, 'nearest'>): Taps {
  const filter = FILTERS[method];
  const scale = inSize / outSize;
  const widen = Math.max(1, scale);
  const support = filter.support * widen;
  const max = Math.ceil(support) * 2 + 1;
  const start = new Int32Array(outSize);
  const count = new Int32Array(outSize);
  const weights = new Float32Array(outSize * max);
  for (let i = 0; i < outSize; i++) {
    const centre = (i + 0.5) * scale;
    const from = Math.max(0, Math.floor(centre - support + 0.5));
    const to = Math.min(inSize, Math.floor(centre + support + 0.5));
    let total = 0;
    const at = i * max;
    for (let x = from; x < to; x++) {
      const w = filter.at((x - centre + 0.5) / widen);
      weights[at + x - from] = w;
      total += w;
    }
    if (total !== 0) for (let k = 0; k < to - from; k++) weights[at + k]! /= total;
    start[i] = from;
    count[i] = to - from;
  }
  return { start, count, weights, max };
}

function checkSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError(`A picture must be at least 1 × 1 whole px (not ${width} × ${height}).`);
}

/** The source rows a strip of output rows reads: [from, to). */
function rowsFor(taps: Taps, first: number, last: number): [number, number] {
  let from = Infinity;
  let to = 0;
  for (let y = first; y < last; y++) {
    from = Math.min(from, taps.start[y]!);
    to = Math.max(to, taps.start[y]! + taps.count[y]!);
  }
  return [from, Math.max(from, to)];
}

/** One strip of output rows by a filter, as bytes (unpremultiplied for a bitmap). */
function filteredStrip(
  r: Raster,
  across: Taps,
  down: Taps,
  outW: number,
  first: number,
  last: number,
): Uint8ClampedArray {
  const c = r.channels;
  const premultiply = c === 4;
  const [from, to] = rowsFor(down, first, last);
  const rows = to - from;
  const src = readRegion(r, { x: 0, y: from, width: r.width, height: rows });
  // Each source row resampled across into floats (premultiplied colours).
  const row = new Float32Array(r.width * c);
  const wide = new Float32Array(outW * rows * c);
  for (let j = 0; j < rows; j++) {
    const base = j * r.width * c;
    if (premultiply)
      for (let x = 0; x < r.width * 4; x += 4) {
        const a = src[base + x + 3]!;
        const k = a / 255;
        row[x] = src[base + x]! * k;
        row[x + 1] = src[base + x + 1]! * k;
        row[x + 2] = src[base + x + 2]! * k;
        row[x + 3] = a;
      }
    else for (let x = 0; x < r.width; x++) row[x] = src[base + x]!;
    const out = j * outW * c;
    for (let i = 0; i < outW; i++) {
      const s = across.start[i]! * c;
      const n = across.count[i]!;
      const w0 = i * across.max;
      if (c === 4) {
        let v0 = 0;
        let v1 = 0;
        let v2 = 0;
        let v3 = 0;
        for (let k = 0; k < n; k++) {
          const w = across.weights[w0 + k]!;
          const p = s + k * 4;
          v0 += row[p]! * w;
          v1 += row[p + 1]! * w;
          v2 += row[p + 2]! * w;
          v3 += row[p + 3]! * w;
        }
        const o = out + i * 4;
        wide[o] = v0;
        wide[o + 1] = v1;
        wide[o + 2] = v2;
        wide[o + 3] = v3;
      } else {
        let v = 0;
        for (let k = 0; k < n; k++) v += row[s + k]! * across.weights[w0 + k]!;
        wide[out + i] = v;
      }
    }
  }
  // Then down each column, a whole row at a time.
  const span = outW * c;
  const bytes = new Uint8ClampedArray((last - first) * span);
  const acc = new Float32Array(span);
  for (let y = first; y < last; y++) {
    acc.fill(0);
    const s = down.start[y]! - from;
    const n = down.count[y]!;
    for (let k = 0; k < n; k++) {
      const w = down.weights[y * down.max + k]!;
      const at = (s + k) * span;
      for (let i = 0; i < span; i++) acc[i]! += wide[at + i]! * w;
    }
    const o = (y - first) * span;
    if (premultiply)
      for (let i = 0; i < span; i += 4) {
        const a = Math.min(255, acc[i + 3]!);
        if (a < 0.5) continue; // transparent: all zero
        const k = 255 / a;
        bytes[o + i] = Math.min(a, acc[i]!) * k;
        bytes[o + i + 1] = Math.min(a, acc[i + 1]!) * k;
        bytes[o + i + 2] = Math.min(a, acc[i + 2]!) * k;
        bytes[o + i + 3] = a;
      }
    else for (let i = 0; i < span; i++) bytes[o + i] = acc[i]!;
  }
  return bytes;
}

/** One strip of output rows by nearest neighbour: each output pixel a copy of one source pixel. */
function nearestStrip(
  r: Raster,
  outW: number,
  outH: number,
  first: number,
  last: number,
): Uint8ClampedArray {
  const c = r.channels;
  const sy = (y: number) => Math.min(r.height - 1, Math.floor(((y + 0.5) * r.height) / outH));
  const from = sy(first);
  const rows = sy(last - 1) - from + 1;
  const src = readRegion(r, { x: 0, y: from, width: r.width, height: rows });
  const columns = new Int32Array(outW);
  for (let x = 0; x < outW; x++)
    columns[x] = Math.min(r.width - 1, Math.floor(((x + 0.5) * r.width) / outW));
  const bytes = new Uint8ClampedArray((last - first) * outW * c);
  if (c === 4) {
    const from32 = new Uint32Array(src.buffer, src.byteOffset, src.length / 4);
    const to32 = new Uint32Array(bytes.buffer);
    for (let y = first; y < last; y++) {
      const s = (sy(y) - from) * r.width;
      const o = (y - first) * outW;
      for (let x = 0; x < outW; x++) to32[o + x] = from32[s + columns[x]!]!;
    }
  } else
    for (let y = first; y < last; y++) {
      const s = (sy(y) - from) * r.width;
      const o = (y - first) * outW;
      for (let x = 0; x < outW; x++) bytes[o + x] = src[s + columns[x]!]!;
    }
  return bytes;
}

function resample<C extends 1 | 4>(
  r: Raster<C>,
  width: number,
  height: number,
  method: ResampleMethod,
): Raster<C> {
  checkSize(width, height);
  if (width === r.width && height === r.height) return r;
  const across = method === 'nearest' ? null : tapsOf(r.width, width, method);
  const down = method === 'nearest' ? null : tapsOf(r.height, height, method);
  const tiles: (Uint8ClampedArray | null)[] = [];
  // Strips one tile high: each strip's tiles are the output's tiles of that row.
  for (let first = 0; first < height; first += TILE) {
    const last = Math.min(height, first + TILE);
    const bytes =
      across && down
        ? filteredStrip(r, across, down, width, first, last)
        : nearestStrip(r, width, height, first, last);
    const strip =
      r.channels === 4
        ? bitmapFromRGBA(width, last - first, bytes)
        : maskFromBytes(width, last - first, bytes);
    tiles.push(...strip.tiles);
  }
  return { width, height, channels: r.channels, tiles };
}

/** GB6: the bitmap at a new size in whole px (the same size: the very same bitmap). */
export const resampleBitmap = (
  b: Bitmap,
  width: number,
  height: number,
  method: ResampleMethod,
): Bitmap => resample(b, width, height, method);

/** GB6: a layer mask or the selection at a new size. */
export const resampleMask = (
  m: Mask,
  width: number,
  height: number,
  method: ResampleMethod,
): Mask => resample(m, width, height, method);
