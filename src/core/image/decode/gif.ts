// G11, D5 (M23): reading a GIF's first picture as RGBA, on its whole screen (what is outside
// the picture, and its see-through colour, see-through): our own GIFs and any other — a local or
// global colour table, interlaced rows, a Graphic Control Extension's see-through colour, other
// extensions (comments, the NETSCAPE loop) passed over.
import { EditError } from '../../model/errors.ts';
import { gifLzwDecode } from '../lzw.ts';
import type { DecodedBitmap } from './index.ts';

export const GIF_DAMAGED = 'This GIF file is damaged or not a GIF.';

const damaged = (): never => {
  throw new EditError(GIF_DAMAGED);
};

export const isGif = (b: Uint8Array): boolean =>
  b.length >= 13 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;

/** The rows of an interlaced picture in the order they are stored: every 8th from 0, from 4, … */
function interlacedRows(height: number): number[] {
  const rows: number[] = [];
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ] as const)
    for (let y = start; y < height; y += step) rows.push(y);
  return rows;
}

/** G11 (M23): a GIF's first picture as RGBA. Refuses (EditError) a file that is not one. */
export function decodeGif(bytes: Uint8Array): DecodedBitmap {
  if (!isGif(bytes)) damaged();
  const u16 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8);
  const width = u16(6);
  const height = u16(8);
  if (!(width > 0) || !(height > 0)) damaged();
  const flags = bytes[10]!;
  let at = 13;
  let global: Uint8Array | null = null;
  if (flags & 0x80) {
    const n = 3 * 2 ** ((flags & 7) + 1);
    global = bytes.subarray(at, at + n);
    at += n;
  }
  let transparent = -1;
  const skipBlocks = () => {
    while (at < bytes.length && bytes[at] !== 0) at += bytes[at]! + 1;
    at++;
  };
  while (at < bytes.length) {
    const kind = bytes[at]!;
    if (kind === 0x21) {
      // An extension: the Graphic Control one names the see-through colour.
      if (bytes[at + 1] === 0xf9 && bytes[at + 2]! >= 4 && bytes[at + 3]! & 1)
        transparent = bytes[at + 6]!;
      at += 2;
      skipBlocks();
    } else if (kind === 0x2c) {
      const left = u16(at + 1);
      const top = u16(at + 3);
      const w = u16(at + 5);
      const h = u16(at + 7);
      const local = bytes[at + 9]!;
      at += 10;
      let table = global;
      if (local & 0x80) {
        const n = 3 * 2 ** ((local & 7) + 1);
        table = bytes.subarray(at, at + n);
        at += n;
      }
      if (!table) damaged();
      const minBits = bytes[at++]!;
      if (minBits < 1 || minBits > 11) damaged();
      // The image data: sub-blocks joined.
      const start = at;
      let length = 0;
      while (at < bytes.length && bytes[at] !== 0) {
        length += bytes[at]!;
        at += bytes[at]! + 1;
      }
      const data = new Uint8Array(length);
      for (let p = start, q = 0; p < at;) {
        const n = bytes[p]!;
        data.set(bytes.subarray(p + 1, p + 1 + n), q);
        q += n;
        p += n + 1;
      }
      const indices = gifLzwDecode(data, minBits, w * h);
      const out = new Uint8ClampedArray(width * height * 4);
      const rows = local & 0x40 ? interlacedRows(h) : null;
      const colours = table!.length / 3;
      for (let j = 0; j < h; j++) {
        const y = top + (rows ? rows[j]! : j);
        if (y >= height) continue;
        for (let x = 0; x < w; x++) {
          const k = j * w + x;
          if (k >= indices.length || left + x >= width) continue;
          const i = indices[k]!;
          if (i === transparent || i >= colours) continue;
          const o = (y * width + left + x) * 4;
          out[o] = table![i * 3]!;
          out[o + 1] = table![i * 3 + 1]!;
          out[o + 2] = table![i * 3 + 2]!;
          out[o + 3] = 255;
        }
      }
      return { width, height, data: out, format: 'gif' };
    } else break;
  }
  return damaged();
}
