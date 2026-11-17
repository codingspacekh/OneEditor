// G11, G10, D5 (M23): a Windows bitmap (BMP), not compressed: every pixel stored, rows from the
// bottom up, each padded to a whole number of 4 bytes. 24 bits: blue, green, red; 32: with alpha,
// in a BITMAPV4HEADER whose masks say where each channel is (so programs that read alpha do, and
// the rest show the colours); 8, 4 or 1 bits: a colour table of 256, 16 or 2 entries (a BMP has
// no see-through entry: see-through parts go on the background). The resolution is inside as
// pixels a metre.
import type { EncodeOptions, RgbaImage } from './index.ts';
import { onBackground } from './index.ts';
import { packRows, toIndexed } from './palette.ts';

/** Row bytes padded to 4. */
export const bmpStride = (width: number, bits: number): number =>
  Math.ceil((width * bits) / 32) * 4;

/** G11 (M23): the BMP of these pixels. */
export function encodeBmpFile(image: RgbaImage, options: EncodeOptions): Promise<Uint8Array> {
  const { width, height } = image;
  const { depth } = options;
  const v4 = depth === 32;
  const infoSize = v4 ? 108 : 40;
  const colours = depth <= 8 ? 2 ** depth : 0;
  const stride = bmpStride(width, depth);
  const offset = 14 + infoSize + colours * 4;
  const out = new Uint8Array(offset + stride * height);
  const view = new DataView(out.buffer);
  out[0] = 0x42; // "BM"
  out[1] = 0x4d;
  view.setUint32(2, out.length, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, infoSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive: the bottom row first
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, depth, true);
  view.setUint32(30, v4 ? 3 : 0, true); // BI_BITFIELDS or BI_RGB
  view.setUint32(34, stride * height, true);
  const ppm = Math.round(options.dpi / 0.0254);
  view.setInt32(38, ppm, true);
  view.setInt32(42, ppm, true);
  view.setUint32(46, colours, true);
  view.setUint32(50, 0, true); // all colours important
  if (v4) {
    view.setUint32(54, 0x00ff0000, true); // red
    view.setUint32(58, 0x0000ff00, true); // green
    view.setUint32(62, 0x000000ff, true); // blue
    view.setUint32(66, 0xff000000, true); // alpha
    view.setUint32(70, 0x73524742, true); // "sRGB"
  }
  if (depth <= 8) {
    const indexed = toIndexed(image, { ...options, transparent: false });
    const table = 14 + infoSize;
    const n = indexed.palette.length / 3;
    for (let i = 0; i < n; i++) {
      out[table + i * 4] = indexed.palette[i * 3 + 2]!;
      out[table + i * 4 + 1] = indexed.palette[i * 3 + 1]!;
      out[table + i * 4 + 2] = indexed.palette[i * 3]!;
    }
    const packed = packRows(indexed.indices, width, height, depth);
    const rowBytes = Math.ceil((width * depth) / 8);
    for (let y = 0; y < height; y++)
      out.set(
        packed.subarray(y * rowBytes, (y + 1) * rowBytes),
        offset + (height - 1 - y) * stride,
      );
    return Promise.resolve(out);
  }
  const src = depth === 32 ? image.data : onBackground(image, options.background).data;
  const bytes = depth / 8;
  for (let y = 0; y < height; y++) {
    let at = offset + (height - 1 - y) * stride;
    let p = y * width * 4;
    for (let x = 0; x < width; x++, p += 4, at += bytes) {
      out[at] = src[p + 2]!;
      out[at + 1] = src[p + 1]!;
      out[at + 2] = src[p]!;
      if (bytes === 4) out[at + 3] = src[p + 3]!;
    }
  }
  return Promise.resolve(out);
}
