// G11, G10, D5 (M23): a PNG at the colour depth chosen, the resolution inside (pHYs). 32 bits:
// RGBA (alpha kept); 24: RGB, see-through parts on the background; 8, 4 or 1 bits: a palette of
// 256, 16 or 2 colours (PLTE) with one see-through entry (tRNS), or greys (colour type 0) when
// the palette is the evenly spaced greys and nothing is see-through. Lossless: deflate (the
// platform's, deflate.ts); the full-colour rows Paeth-filtered, the palette rows not (as the
// PNG specification advises).
import type { Compression } from '../deflate.ts';
import { chunk, encodePngRows, joinBytes, physChunk, PNG_SIGNATURE } from '../png.ts';
import { onBackground, type EncodeOptions, type RgbaImage } from './index.ts';
import { packRows, toIndexed } from './palette.ts';

const u32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];

/** G11 (M23): the PNG of these pixels. */
export async function encodePngFile(
  image: RgbaImage,
  options: EncodeOptions,
  compression: Compression,
): Promise<Uint8Array> {
  const { width, height } = image;
  const { depth, dpi } = options;
  if (depth === 32)
    return encodePngRows(width, height, 4, rowsOf(image.data, width * 4), compression, { dpi });
  if (depth === 24) {
    const flat = onBackground(image, options.background).data;
    const rgb = new Uint8Array(width * height * 3);
    for (let p = 0, q = 0; q < rgb.length; p += 4, q += 3) {
      rgb[q] = flat[p]!;
      rgb[q + 1] = flat[p + 1]!;
      rgb[q + 2] = flat[p + 2]!;
    }
    return encodePngRows(width, height, 3, rowsOf(rgb, width * 3), compression, { dpi });
  }
  const indexed = toIndexed(image, options);
  const stride = Math.ceil((width * depth) / 8);
  const packed = packRows(indexed.indices, width, height, depth);
  // Filter 0 (none) on every row.
  const rows = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++)
    rows.set(packed.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const header = Uint8Array.from([
    ...u32(width),
    ...u32(height),
    depth,
    indexed.grey ? 0 : 3,
    0,
    0,
    0,
  ]);
  const parts = [Uint8Array.from(PNG_SIGNATURE), chunk('IHDR', header)];
  if (!indexed.grey) {
    parts.push(chunk('PLTE', indexed.palette));
    // Entry 0 fully see-through; the rest (left out) opaque.
    if (indexed.transparent === 0) parts.push(chunk('tRNS', Uint8Array.of(0)));
  }
  parts.push(
    physChunk(dpi),
    chunk('IDAT', await compression.deflate(rows)),
    chunk('IEND', new Uint8Array()),
  );
  return joinBytes(parts);
}

const rowsOf =
  (data: Uint8Array | Uint8ClampedArray, stride: number) =>
  (y: number, count: number): Uint8Array | Uint8ClampedArray =>
    data.subarray(y * stride, (y + count) * stride);
