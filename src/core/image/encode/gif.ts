// G11, D5 (M23): a still GIF (GIF89a): at most 256 colours (8 bits), 16 (4) or 2 (1) in its
// colour table, found by median cut or greys, dithered or not; the pixels LZW-compressed
// (lossless: nothing more is lost once the colours are chosen); one see-through colour, named in
// a Graphic Control Extension. A GIF holds no resolution: it opens at 72 or 96 dpi everywhere.
import { gifLzwEncode } from '../lzw.ts';
import { joinBytes } from '../png.ts';
import type { EncodeOptions, RgbaImage } from './index.ts';
import { toIndexed } from './palette.ts';

const u16 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff];

/** The LZW data in sub-blocks of at most 255 bytes, ended by an empty one. */
function subBlocks(data: Uint8Array): Uint8Array {
  const blocks = Math.ceil(data.length / 255);
  const out = new Uint8Array(data.length + blocks + 1);
  let at = 0;
  for (let i = 0; i < data.length; i += 255) {
    const part = data.subarray(i, i + 255);
    out[at++] = part.length;
    out.set(part, at);
    at += part.length;
  }
  out[at] = 0;
  return out;
}

/** G11 (M23): the GIF of these pixels. */
export function encodeGifFile(image: RgbaImage, options: EncodeOptions): Promise<Uint8Array> {
  const { width, height } = image;
  const indexed = toIndexed(image, options);
  // The colour table holds 2 ** bits entries, at least 2.
  const bits = Math.max(1, options.depth);
  const table = new Uint8Array(3 * 2 ** bits);
  table.set(indexed.palette.subarray(0, table.length));
  const screen = [...u16(width), ...u16(height), 0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0];
  const control =
    indexed.transparent >= 0
      ? // Graphic Control Extension: no disposal, no delay, a see-through colour.
        [0x21, 0xf9, 4, 0x01, 0, 0, indexed.transparent, 0]
      : [];
  const descriptor = [0x2c, 0, 0, 0, 0, ...u16(width), ...u16(height), 0];
  const minBits = Math.max(2, bits);
  return Promise.resolve(
    joinBytes([
      new TextEncoder().encode('GIF89a'),
      Uint8Array.from(screen),
      table,
      Uint8Array.from(control),
      Uint8Array.from(descriptor),
      Uint8Array.of(minBits),
      subBlocks(gifLzwEncode(indexed.indices, minBits)),
      Uint8Array.of(0x3b),
    ]),
  );
}
