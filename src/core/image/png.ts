// D9 (M21): our own PNG writer and reader, so a pixel layer and its mask are kept in the .mveg
// file exactly (lossless, 8 bits a channel, not premultiplied), without a canvas: core stays pure
// and testable, and a 12-megapixel layer is written and read in well under the GN3 budget (the
// deflate itself is the platform's, deflate.ts). The writer makes RGBA (a bitmap) or grey (a mask)
// with the Paeth filter on every row; the reader takes any non-interlaced PNG a student might
// have (grey, grey + alpha, RGB, RGBA, palette with or without transparency; 1, 2, 4, 8 or 16
// bits; the five row filters) and gives RGBA.
import type { Compression } from './deflate.ts';
import { crc32, isPng, pngDpi } from './dpi.ts';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Pixels as ImageData keeps them: rows from the top, `channels` bytes a pixel. */
export interface PngImage {
  width: number;
  height: number;
  /** 4: RGBA; 1: grey (a mask). M23: 3: RGB (a 24-bit export). */
  channels: 1 | 3 | 4;
  data: Uint8ClampedArray | Uint8Array;
}

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, 8 bits a channel, not premultiplied. */
  data: Uint8ClampedArray;
  /** The resolution the file gives (pHYs), if any. */
  dpi?: number;
}

export const PNG_DAMAGED = 'This PNG file is damaged or not a PNG.';

const putU32 = (b: Uint8Array, at: number, n: number): void => {
  b[at] = (n >>> 24) & 0xff;
  b[at + 1] = (n >>> 16) & 0xff;
  b[at + 2] = (n >>> 8) & 0xff;
  b[at + 3] = n & 0xff;
};

const u32 = (b: Uint8Array, at: number): number =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

/** One PNG chunk: its length, type, data and CRC. M23: the bitmap writers' too (encode/png.ts). */
export function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  putU32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  putU32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/**
 * A PNG of an image given a band of rows at a time (`rows(y, count)`: those rows' bytes), so a
 * tiled bitmap is never copied whole before it is filtered. `dpi` writes a pHYs chunk.
 */
export async function encodePngRows(
  width: number,
  height: number,
  channels: 1 | 3 | 4,
  rows: (y: number, count: number) => Uint8Array | Uint8ClampedArray,
  compression: Compression,
  { band = 256, dpi }: { band?: number; dpi?: number } = {},
): Promise<Uint8Array> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError(`A PNG must be at least 1 × 1 whole px (not ${width} × ${height}).`);
  const stride = width * channels;
  const filtered = new Uint8Array((stride + 1) * height);
  let previous: Uint8Array | Uint8ClampedArray = new Uint8Array(stride);
  for (let y0 = 0; y0 < height; y0 += band) {
    const count = Math.min(band, height - y0);
    const data = rows(y0, count);
    if (data.length !== stride * count) throw new RangeError('The rows do not fill the band.');
    for (let j = 0; j < count; j++) {
      const row = data.subarray(j * stride, (j + 1) * stride);
      const at = (y0 + j) * (stride + 1) + 1;
      // Paeth: the best of the five for photos, and good for flat colour.
      filtered[at - 1] = 4;
      for (let i = 0; i < channels; i++) filtered[at + i] = (row[i]! - previous[i]!) & 0xff;
      for (let i = channels; i < stride; i++) {
        const a = row[i - channels]!;
        const b = previous[i]!;
        const c = previous[i - channels]!;
        const p = a + b - c;
        const pa = p > a ? p - a : a - p;
        const pb = p > b ? p - b : b - p;
        const pc = p > c ? p - c : c - p;
        filtered[at + i] = (row[i]! - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      // Kept apart: the next band may come in the same array.
      previous = j === count - 1 ? row.slice() : row;
    }
  }
  const header = new Uint8Array(13);
  putU32(header, 0, width);
  putU32(header, 4, height);
  header[8] = 8; // bits a channel
  header[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0; // RGBA, RGB or grey
  const parts = [Uint8Array.from(SIGNATURE), chunk('IHDR', header)];
  if (dpi !== undefined) parts.push(physChunk(dpi));
  parts.push(chunk('IDAT', await compression.deflate(filtered)), chunk('IEND', new Uint8Array()));
  return joinBytes(parts);
}

/** G10: a pHYs chunk: the resolution as pixels a metre. */
export function physChunk(dpi: number): Uint8Array {
  const phys = new Uint8Array(9);
  const ppm = Math.round(dpi / 0.0254);
  putU32(phys, 0, ppm);
  putU32(phys, 4, ppm);
  phys[8] = 1; // pixels per metre
  return chunk('pHYs', phys);
}

/** The parts one after another. */
export function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const PNG_SIGNATURE: readonly number[] = SIGNATURE;

/** A PNG of a whole image held in one array. */
export const encodePng = (
  image: PngImage,
  compression: Compression,
  options?: { dpi?: number },
): Promise<Uint8Array> => {
  const stride = image.width * image.channels;
  return encodePngRows(
    image.width,
    image.height,
    image.channels,
    (y, count) => image.data.subarray(y * stride, (y + count) * stride),
    compression,
    options,
  );
};

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

const damaged = (why = PNG_DAMAGED): never => {
  throw new RangeError(why);
};

/** Undoes the five row filters in place: `data` is rows of 1 filter byte + `stride` bytes. */
function unfilter(data: Uint8Array, height: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    const from = y * (stride + 1) + 1;
    const at = y * stride;
    const up = at - stride;
    switch (filter) {
      case 0:
        out.set(data.subarray(from, from + stride), at);
        break;
      case 1:
        for (let i = 0; i < stride; i++)
          out[at + i] = data[from + i]! + (i >= bpp ? out[at + i - bpp]! : 0);
        break;
      case 2:
        for (let i = 0; i < stride; i++) out[at + i] = data[from + i]! + (y > 0 ? out[up + i]! : 0);
        break;
      case 3:
        for (let i = 0; i < stride; i++) {
          const left = i >= bpp ? out[at + i - bpp]! : 0;
          const above = y > 0 ? out[up + i]! : 0;
          out[at + i] = data[from + i]! + ((left + above) >> 1);
        }
        break;
      case 4:
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? out[at + i - bpp]! : 0;
          const b = y > 0 ? out[up + i]! : 0;
          const c = y > 0 && i >= bpp ? out[up + i - bpp]! : 0;
          const p = a + b - c;
          const pa = p > a ? p - a : a - p;
          const pb = p > b ? p - b : b - p;
          const pc = p > c ? p - c : c - p;
          out[at + i] = data[from + i]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        break;
      default:
        damaged();
    }
  }
  return out;
}

/** Reads any non-interlaced PNG as RGBA. Rejects (RangeError) a file that is not one. */
export async function decodePng(png: Uint8Array, compression: Compression): Promise<DecodedPng> {
  if (!isPng(png)) damaged();
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = -1;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let at = 8;
  let ended = false;
  while (at + 12 <= png.length && !ended) {
    const length = u32(png, at);
    const end = at + 12 + length;
    if (end > png.length) damaged();
    const kind = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (crc32(png, at + 4, at + 8 + length) !== u32(png, at + 8 + length)) damaged();
    const data = png.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      width = u32(data, 0);
      height = u32(data, 4);
      depth = data[8]!;
      type = data[9]!;
      if (data[10] !== 0 || data[11] !== 0) damaged();
      if (data[12] !== 0)
        damaged('This PNG is interlaced: save it again without interlacing to open it.');
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') transparency = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') ended = true;
    at = end;
  }
  if (!(width > 0) || !(height > 0) || !DEPTHS[type]?.includes(depth) || idat.length === 0)
    damaged();
  if (type === 3 && !palette) damaged();
  const joined = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
  let k = 0;
  for (const p of idat) {
    joined.set(p, k);
    k += p.length;
  }
  let inflated: Uint8Array;
  try {
    inflated = await compression.inflate(joined);
  } catch {
    return damaged();
  }
  const channels = CHANNELS[type]!;
  const bits = channels * depth;
  const stride = Math.ceil((width * bits) / 8);
  if (inflated.length < (stride + 1) * height) damaged();
  const raw = unfilter(inflated, height, stride, Math.max(1, bits >> 3));
  const rgba = toRGBA(raw, width, height, type, depth, stride, palette, transparency);
  const dpi = pngDpi(png);
  return { width, height, data: rgba, ...(dpi ? { dpi: dpi.x } : {}) };
}

/** The unfiltered rows as RGBA, 8 bits a channel (16-bit samples keep their high byte). */
function toRGBA(
  raw: Uint8Array,
  width: number,
  height: number,
  type: number,
  depth: number,
  stride: number,
  palette: Uint8Array | null,
  trns: Uint8Array | null,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  // The usual photos and our own files, quickly: 8-bit RGBA as it is, 8-bit RGB with opaque alpha.
  if (depth === 8 && type === 6) {
    for (let y = 0; y < height; y++)
      out.set(raw.subarray(y * stride, (y + 1) * stride), y * width * 4);
    return out;
  }
  if (depth === 8 && type === 2 && !trns) {
    for (let p = 0, q = 0; p < width * height; p++, q += 3) {
      out[p * 4] = raw[q]!;
      out[p * 4 + 1] = raw[q + 1]!;
      out[p * 4 + 2] = raw[q + 2]!;
      out[p * 4 + 3] = 255;
    }
    return out;
  }
  const wide = depth === 16;
  // A sample at its own depth (for the transparent colour of tRNS), and as 8 bits.
  const sample = (row: number, i: number): number => {
    if (wide) return (raw[row + i * 2]! << 8) | raw[row + i * 2 + 1]!;
    if (depth === 8) return raw[row + i]!;
    const perByte = 8 / depth;
    const byte = raw[row + Math.floor(i / perByte)]!;
    const shift = 8 - depth * ((i % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scale = (v: number): number =>
    wide ? v >> 8 : depth === 8 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  const key16 = (i: number): number =>
    trns && trns.length >= i * 2 ? (trns[i * 2 - 2]! << 8) | trns[i * 2 - 1]! : -1;
  // tRNS for grey or RGB: the one colour that is see-through, at the image's own depth.
  const greyKey = type === 0 ? key16(1) : -1;
  const rgbKey = type === 2 && trns && trns.length >= 6 ? [key16(1), key16(2), key16(3)] : null;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      switch (type) {
        case 0: {
          const v = sample(row, x);
          out[o] = out[o + 1] = out[o + 2] = scale(v);
          out[o + 3] = v === greyKey ? 0 : 255;
          break;
        }
        case 2: {
          const r = sample(row, x * 3);
          const g = sample(row, x * 3 + 1);
          const b = sample(row, x * 3 + 2);
          out[o] = scale(r);
          out[o + 1] = scale(g);
          out[o + 2] = scale(b);
          out[o + 3] = rgbKey && r === rgbKey[0] && g === rgbKey[1] && b === rgbKey[2] ? 0 : 255;
          break;
        }
        case 3: {
          const i = sample(row, x);
          if (i * 3 + 2 >= palette!.length) damaged();
          out[o] = palette![i * 3]!;
          out[o + 1] = palette![i * 3 + 1]!;
          out[o + 2] = palette![i * 3 + 2]!;
          out[o + 3] = trns && i < trns.length ? trns[i]! : 255;
          break;
        }
        case 4: {
          const v = scale(sample(row, x * 2));
          out[o] = out[o + 1] = out[o + 2] = v;
          out[o + 3] = scale(sample(row, x * 2 + 1));
          break;
        }
        default: {
          for (let c = 0; c < 4; c++) out[o + c] = scale(sample(row, x * 4 + c));
        }
      }
    }
  }
  return out;
}
