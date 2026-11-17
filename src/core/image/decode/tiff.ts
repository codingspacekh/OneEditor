// G11, D5 (M23): reading a TIFF's first image as RGBA, so it can be shown in the app (Chromium
// cannot show a TIFF) and checked: what our writer makes, and the baseline files scanners,
// cameras and other programs save — either byte order ("II" Intel or "MM" Motorola); not
// compressed, LZW, PackBits or Deflate; the horizontal predictor; black and white, greys (black
// or white as 0), a palette, RGB; 1, 2, 4, 8 or 16 bits a sample; alpha associated
// (premultiplied) or not. Tiles, separate colour planes, CMYK and floating-point samples are
// refused in words. The resolution comes back in dpi.
import { EditError } from '../../model/errors.ts';
import type { Compression } from '../deflate.ts';
import { tiffLzwDecode } from '../lzw.ts';
import type { DecodedBitmap } from './index.ts';

export const TIFF_DAMAGED = 'This TIFF file is damaged or not a TIFF.';

const damaged = (why = TIFF_DAMAGED): never => {
  throw new EditError(why);
};

const cannot = (what: string): never =>
  damaged(`This TIFF ${what}, which OneEditor cannot read: save it again as an ordinary TIFF.`);

export const isTiff = (b: Uint8Array): boolean =>
  b.length >= 8 &&
  ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42));

/** Bytes of each value of a field type: BYTE, ASCII, SHORT, LONG, RATIONAL, … DOUBLE. */
const TYPE_SIZE: Record<number, number> = {
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
  11: 4,
  12: 8,
};

/** PackBits (Apple's run-length compression): `count` bytes. */
function unpackBits(data: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count);
  let at = 0;
  let o = 0;
  while (at < data.length && o < count) {
    const n = (data[at++]! << 24) >> 24;
    if (n >= 0) {
      const part = data.subarray(at, at + n + 1);
      out.set(part.subarray(0, count - o), o);
      o += part.length;
      at += n + 1;
    } else if (n !== -128) {
      const v = data[at++]!;
      for (let i = 0; i < 1 - n && o < count; i++) out[o++] = v;
    }
  }
  return out;
}

/** G11 (M23): a TIFF's first image as RGBA. Refuses (EditError) one it cannot read. */
export async function decodeTiff(
  bytes: Uint8Array,
  compression: Compression,
): Promise<DecodedBitmap> {
  if (!isTiff(bytes)) damaged();
  const little = bytes[0] === 0x49;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const ifd = u32(4);
  if (ifd + 2 > bytes.length) damaged();
  const count = u16(ifd);
  if (ifd + 2 + count * 12 > bytes.length) damaged();
  const tags = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    const tag = u16(at);
    const type = u16(at + 2);
    const n = u32(at + 4);
    const size = TYPE_SIZE[type];
    if (!size) continue;
    const where = n * size <= 4 ? at + 8 : u32(at + 8);
    if (where + n * size > bytes.length) damaged();
    const values: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = where + k * size;
      if (type === 3 || type === 8) values.push(u16(p));
      else if (type === 4 || type === 9) values.push(u32(p));
      else if (type === 5 || type === 10) values.push(u32(p) / (u32(p + 4) || 1));
      else if (size === 1) values.push(bytes[p]!);
      else values.push(0);
    }
    tags.set(tag, values);
  }
  const one = (tag: number, fallback: number): number => tags.get(tag)?.[0] ?? fallback;
  const width = one(256, 0);
  const height = one(257, 0);
  if (!(width > 0) || !(height > 0) || width * height > 1 << 28) damaged();
  if (tags.has(322)) cannot('is stored in tiles');
  if (one(284, 1) !== 1) cannot('keeps its colours in separate planes');
  if (one(339, 1) === 3) cannot('has floating-point samples');
  const spp = one(277, 1);
  const bits = one(258, 1);
  if (![1, 2, 4, 8, 16].includes(bits)) cannot(`has ${bits} bits a sample`);
  const photometric = one(262, spp >= 3 ? 2 : 1);
  if (photometric === 5) cannot('is in CMYK (for printing presses)');
  if (![0, 1, 2, 3].includes(photometric)) cannot('stores its colours in an unusual way');
  const colourSamples = photometric === 2 ? 3 : 1;
  if (spp < colourSamples) damaged();
  const method = one(259, 1);
  if (![1, 5, 8, 32946, 32773].includes(method))
    cannot('is compressed in a way (such as JPEG inside a TIFF)');
  const predictor = one(317, 1);
  const offsets = tags.get(273);
  const counts = tags.get(279);
  if (!offsets || !counts || offsets.length !== counts.length) damaged();
  const rowsPerStrip = Math.min(height, one(278, height));
  const rowBytes = Math.ceil((width * spp * bits) / 8);
  const raw = new Uint8Array(rowBytes * height);
  for (let s = 0; s < offsets!.length; s++) {
    const want = Math.min(rowsPerStrip, height - s * rowsPerStrip) * rowBytes;
    if (want <= 0) break;
    const start = offsets![s]!;
    const strip = bytes.subarray(start, Math.min(bytes.length, start + counts![s]!));
    let plain: Uint8Array;
    if (method === 1) plain = strip;
    else if (method === 5) plain = tiffLzwDecode(strip, want);
    else if (method === 32773) plain = unpackBits(strip, want);
    else plain = await compression.inflate(strip).catch(() => damaged());
    raw.set(plain.subarray(0, want), s * rowsPerStrip * rowBytes);
  }
  // A sample's value at its own depth, and as 8 bits.
  const sampleAt = (row: number, i: number): number => {
    if (bits === 8) return raw[row + i]!;
    if (bits === 16)
      return little
        ? raw[row + i * 2]! | (raw[row + i * 2 + 1]! << 8)
        : (raw[row + i * 2]! << 8) | raw[row + i * 2 + 1]!;
    const bit = i * bits;
    return (raw[row + (bit >> 3)]! >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
  };
  const top = (1 << bits) - 1;
  // The horizontal predictor: each sample stored as the difference from the one to its left.
  if (predictor === 2) {
    if (bits === 8)
      for (let row = 0; row < raw.length; row += rowBytes)
        for (let i = spp; i < rowBytes; i++)
          raw[row + i] = (raw[row + i]! + raw[row + i - spp]!) & 0xff;
    else if (bits === 16)
      for (let row = 0; row < raw.length; row += rowBytes)
        for (let i = spp; i < width * spp; i++) {
          const v = (sampleAt(row, i) + sampleAt(row, i - spp)) & 0xffff;
          const [hi, lo] = [v >> 8, v & 0xff];
          raw[row + i * 2] = little ? lo : hi;
          raw[row + i * 2 + 1] = little ? hi : lo;
        }
    else cannot(`uses the predictor on ${bits}-bit samples`);
  }
  const map = tags.get(320);
  if (photometric === 3 && (!map || map.length < 3 * 2 ** bits)) damaged();
  // ExtraSamples: 1 associated alpha, 2 unassociated; 0 (or none) something else, not shown.
  const extra = tags.get(338)?.[0] ?? 0;
  const alphaAt = spp > colourSamples && (extra === 1 || extra === 2) ? colourSamples : -1;
  const out = new Uint8ClampedArray(width * height * 4);
  const to8 = (v: number) => (bits === 8 ? v : bits === 16 ? v >> 8 : Math.round((v * 255) / top));
  const n = map ? 2 ** bits : 0;
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * spp;
      if (photometric === 2) {
        out[o] = to8(sampleAt(row, s));
        out[o + 1] = to8(sampleAt(row, s + 1));
        out[o + 2] = to8(sampleAt(row, s + 2));
      } else if (photometric === 3) {
        const i = sampleAt(row, s);
        out[o] = map![i]! >> 8;
        out[o + 1] = map![n + i]! >> 8;
        out[o + 2] = map![2 * n + i]! >> 8;
      } else {
        const v = to8(sampleAt(row, s));
        out[o] = out[o + 1] = out[o + 2] = photometric === 0 ? 255 - v : v;
      }
      const a = alphaAt >= 0 ? to8(sampleAt(row, s + alphaAt)) : 255;
      out[o + 3] = a;
      // Associated alpha: the colours were multiplied by it.
      if (extra === 1 && a > 0 && a < 255)
        for (let c = 0; c < 3; c++) out[o + c] = Math.round((out[o + c]! * 255) / a);
    }
  }
  const resolution = tags.get(282)?.[0];
  const unit = one(296, 2);
  const dpi =
    resolution && unit !== 1 ? Math.round(unit === 3 ? resolution * 2.54 : resolution) : undefined;
  return { width, height, data: out, format: 'tiff', ...(dpi ? { dpi } : {}) };
}
