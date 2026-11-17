// GL2 (M23): a TIFF's facts from its first page's tags — size, dpi (an inch or a centimetre),
// bits a pixel, palette, compression — and see-through pixels: with an alpha channel
// (ExtraSamples 1 or 2) of 8 bits, stored in strips not compressed, LZW, deflate or PackBits
// (with or without the horizontal predictor), every pixel's alpha is looked at; another kind
// (tiles, JPEG inside, 16 bits) is said to be able to hold see-through pixels, not checked.
// The tag reader also serves a JPEG's Exif block (jpeg.ts).
import { EditError } from '../../model/errors.ts';
import type { Compression } from '../deflate.ts';
import type { Found } from './types.ts';

const DAMAGED = 'This TIFF file is damaged.';

const SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
};

/** The first directory's tags as numbers (a rational as one number), or null if not a TIFF. */
export function tiffTags(b: Uint8Array): Map<number, number[]> | null {
  if (b.length < 8) return null;
  const le = b[0] === 0x49 && b[1] === 0x49;
  if (!le && !(b[0] === 0x4d && b[1] === 0x4d)) return null;
  const u16 = (at: number) => (le ? b[at]! | (b[at + 1]! << 8) : (b[at]! << 8) | b[at + 1]!);
  const u32 = (at: number) =>
    (le
      ? b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)
      : (b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > b.length) return null;
  const tags = new Map<number, number[]>();
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > b.length) break;
    const tag = u16(at);
    const type = u16(at + 2);
    const n = u32(at + 4);
    const size = SIZES[type];
    if (!size || n > 1 << 20) continue;
    const start = n * size <= 4 ? at + 8 : u32(at + 8);
    if (start + n * size > b.length) continue;
    const values: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = start + k * size;
      if (type === 3 || type === 8) values.push(u16(p));
      else if (type === 4 || type === 9) values.push(u32(p));
      else if (type === 5 || type === 10) {
        const d = u32(p + 4);
        values.push(d ? u32(p) / d : 0);
      } else values.push(b[p]!);
    }
    tags.set(tag, values);
  }
  return tags;
}

/** TIFF LZW (codes most significant bit first, growing one code early) into `expected` bytes. */
export function tiffLzwDecode(data: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  const length = new Uint32Array(4096);
  for (let i = 0; i < 256; i++) {
    prefix[i] = -1;
    suffix[i] = i;
    first[i] = i;
    length[i] = 1;
  }
  let o = 0;
  const write = (code: number) => {
    const n = length[code]!;
    for (let c = code, i = o + n - 1; c >= 0; c = prefix[c]!, i--)
      if (i < expected) out[i] = suffix[c]!;
    o += n;
  };
  let size = 9;
  let next = 258;
  let prev = -1;
  let acc = 0;
  let bits = 0;
  let at = 0;
  while (o < expected) {
    while (bits < size && at < data.length) {
      acc = ((acc << 8) | data[at++]!) >>> 0;
      bits += 8;
    }
    if (bits < size) break;
    const code = (acc >>> (bits - size)) & ((1 << size) - 1);
    bits -= size;
    acc &= (1 << bits) - 1;
    if (code === 256) {
      size = 9;
      next = 258;
      prev = -1;
      continue;
    }
    if (code === 257) break;
    if (prev < 0) {
      if (code > 255) break;
    } else if (code > next) break;
    else if (next < 4096) {
      prefix[next] = prev;
      suffix[next] = code < next ? first[code]! : first[prev]!;
      first[next] = first[prev]!;
      length[next] = length[prev]! + 1;
      next++;
      if (next + 1 === 1 << size && size < 12) size++;
    }
    write(code);
    prev = code;
  }
  return out;
}

/** PackBits (Apple's run lengths) into `expected` bytes. */
function packBits(data: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let o = 0;
  let at = 0;
  while (o < expected && at < data.length) {
    const n = (data[at++]! << 24) >> 24;
    if (n >= 0) {
      out.set(data.subarray(at, at + n + 1).subarray(0, expected - o), o);
      o += n + 1;
      at += n + 1;
    } else if (n !== -128) {
      out.fill(data[at++]!, o, Math.min(expected, o + 1 - n));
      o += 1 - n;
    }
  }
  return out;
}

const COMPRESSION: Record<number, string> = {
  1: 'none',
  2: 'CCITT (fax)',
  5: 'LZW',
  6: 'JPEG',
  7: 'JPEG',
  8: 'deflate (ZIP)',
  32773: 'PackBits',
  32946: 'deflate (ZIP)',
};

export async function tiffFacts(b: Uint8Array, compression: Compression): Promise<Found> {
  const tags = tiffTags(b);
  const one = (tag: number, fallback?: number) => tags?.get(tag)?.[0] ?? fallback;
  const width = one(256);
  const height = one(257);
  if (!tags || !width || !height) throw new EditError(DAMAGED);
  const samples = one(277, 1)!;
  const bits = tags.get(258) ?? Array(samples).fill(1);
  const depth = bits.length === samples ? bits.reduce((n, v) => n + v, 0) : bits[0]! * samples;
  const photometric = one(262, 1)!;
  const method = one(259, 1)!;
  const xres = one(282);
  const yres = one(283) ?? xres;
  const unit = one(296, 2);
  const perInch = unit === 3 ? 2.54 : unit === 2 ? 1 : 0;
  const dpi =
    xres && yres && perInch
      ? { x: Math.round(xres * perInch), y: Math.round(yres * perInch) }
      : undefined;
  const extra = tags.get(338) ?? [];
  const alphaAt = extra.findIndex((e) => e === 1 || e === 2);
  let seeThrough: Found['seeThrough'] = 'none';
  if (alphaAt >= 0) {
    seeThrough = 'possible';
    const sample = samples - extra.length + alphaAt;
    const strips = tags.get(273);
    const counts = tags.get(279);
    const rows = one(278, height)!;
    const chunky = one(284, 1) === 1;
    const predictor = one(317, 1);
    const eight = bits.every((v) => v === 8);
    if (strips && counts && chunky && eight && [1, 5, 8, 32773, 32946].includes(method)) {
      seeThrough = 'unused';
      const stride = width * samples;
      for (let s = 0; s < strips.length && seeThrough === 'unused'; s++) {
        const stored = b.subarray(strips[s]!, strips[s]! + (counts[s] ?? 0));
        const lines = Math.min(rows, height - s * rows);
        const expected = lines * stride;
        let raw: Uint8Array;
        if (method === 1) raw = stored;
        else if (method === 5) raw = tiffLzwDecode(stored, expected);
        else if (method === 32773) raw = packBits(stored, expected);
        else {
          try {
            raw = await compression.inflate(stored);
          } catch {
            throw new EditError(DAMAGED);
          }
        }
        for (let y = 0; y < lines; y++) {
          let alpha = 0;
          for (let x = 0; x < width; x++) {
            const v = raw[y * stride + x * samples + sample] ?? 255;
            // Horizontal differencing keeps each sample as the change from the one on its left.
            alpha = predictor === 2 ? (x === 0 ? v : (alpha + v) & 255) : v;
            if (alpha < 255) {
              seeThrough = 'used';
              break;
            }
          }
          if (seeThrough === 'used') break;
        }
      }
    }
  }
  const palette = photometric === 3 ? 1 << bits[0]! : undefined;
  return {
    width,
    height,
    ...(dpi ? { dpi } : {}),
    depth,
    ...(palette ? { palette } : {}),
    ...(photometric <= 1 ? { grey: true } : {}),
    seeThrough,
    compression: COMPRESSION[method] ?? `type ${method}`,
  };
}
