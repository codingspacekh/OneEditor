// G11, D5 (M23): reading a Windows bitmap (BMP) as RGBA: what our writer makes (1, 4, 8, 24 bits
// with BITMAPINFOHEADER; 32 bits with BITMAPV4HEADER masks) and what Paint, Photoshop and other
// programs save — the OS/2 header, 16-bit (5-5-5 or masks), 32-bit without alpha, rows from the
// top (a negative height) and the run-length compressed 4- and 8-bit kinds. The resolution
// (pixels a metre) comes back in dpi.
import { EditError } from '../../model/errors.ts';
import type { DecodedBitmap } from './index.ts';

export const BMP_DAMAGED = 'This BMP file is damaged or not a BMP.';

const damaged = (why = BMP_DAMAGED): never => {
  throw new EditError(why);
};

export const isBmp = (b: Uint8Array): boolean => b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d;

/** A mask's shift and its largest value: 0x00ff0000 → 16, 255. */
function maskInfo(mask: number): { shift: number; max: number } {
  if (mask === 0) return { shift: 0, max: 0 };
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift++;
  return { shift, max: mask >>> shift };
}

/** Decodes the run-length compressed (BI_RLE8, BI_RLE4) pixels into indices, rows from the bottom. */
function runLength(
  bytes: Uint8Array,
  at: number,
  width: number,
  height: number,
  four: boolean,
): Uint8Array {
  const out = new Uint8Array(width * height);
  let x = 0;
  let y = 0;
  const put = (v: number) => {
    if (x < width && y < height) out[y * width + x] = v;
    x++;
  };
  while (at + 1 < bytes.length && y < height) {
    const n = bytes[at]!;
    const v = bytes[at + 1]!;
    at += 2;
    if (n > 0) {
      for (let i = 0; i < n; i++) put(four ? (i & 1 ? v & 15 : v >> 4) : v);
    } else if (v === 0) {
      x = 0;
      y++;
    } else if (v === 1) break;
    else if (v === 2) {
      x += bytes[at]!;
      y += bytes[at + 1]!;
      at += 2;
    } else {
      // v literal pixels, padded to a whole number of 2 bytes.
      const used = four ? Math.ceil(v / 2) : v;
      for (let i = 0; i < v; i++) {
        const b = bytes[at + (four ? i >> 1 : i)] ?? 0;
        put(four ? (i & 1 ? b & 15 : b >> 4) : b);
      }
      at += used + (used & 1);
    }
  }
  return out;
}

/** G11 (M23): a BMP's pixels as RGBA. Refuses (EditError) a file that is not one. */
export function decodeBmp(bytes: Uint8Array): DecodedBitmap {
  if (!isBmp(bytes)) damaged();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = view.getUint32(10, true);
  const header = view.getUint32(14, true);
  const core = header === 12;
  if (!core && header < 40) damaged();
  if (14 + header > bytes.length) damaged();
  const width = core ? view.getUint16(18, true) : view.getInt32(18, true);
  const rawHeight = core ? view.getInt16(20, true) : view.getInt32(22, true);
  const bits = core ? view.getUint16(24, true) : view.getUint16(28, true);
  const method = core ? 0 : view.getUint32(30, true);
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  if (!(width > 0) || !(height > 0) || width * height > 1 << 28) damaged();
  if (![1, 4, 8, 16, 24, 32].includes(bits)) damaged();
  // BI_RGB 0, BI_RLE8 1, BI_RLE4 2, BI_BITFIELDS 3, BI_ALPHABITFIELDS 6.
  if (![0, 1, 2, 3, 6].includes(method))
    damaged('This BMP is compressed in a way OneEditor cannot read: save it again uncompressed.');
  const ppm = core ? 0 : view.getInt32(38, true);
  // The colour table: 3 bytes an entry in the OS/2 header, else 4 (blue, green, red, unused).
  const entrySize = core ? 3 : 4;
  const colours =
    bits <= 8 ? (!core && view.getUint32(46, true) > 0 ? view.getUint32(46, true) : 2 ** bits) : 0;
  const fields = method === 3 || method === 6;
  // After a 40-byte header, the masks come before the colour table.
  const table = 14 + header + (header === 40 && fields ? (method === 6 ? 16 : 12) : 0);
  if (table + colours * entrySize > bytes.length || offset > bytes.length) damaged();
  // The masks: in the header (V2 and later, 52 bytes and more) or just after a 40-byte one.
  // Without masks: 16 bits are 5-5-5; 24 and 32 are blue, green, red (and perhaps alpha).
  const masks = fields
    ? [0, 1, 2, 3].map((i) =>
        i < 3 || header >= 56 || method === 6 ? view.getUint32(54 + i * 4, true) : 0,
      )
    : bits === 16
      ? [0x7c00, 0x03e0, 0x001f, 0]
      : [0xff0000, 0xff00, 0xff, bits === 32 ? 0xff000000 : 0];
  const out = new Uint8ClampedArray(width * height * 4);
  const rowOf = (y: number) => (topDown ? y : height - 1 - y);
  if (bits <= 8) {
    const palette = new Uint8Array(colours * 3);
    for (let i = 0; i < colours; i++) {
      palette[i * 3] = bytes[table + i * entrySize + 2]!;
      palette[i * 3 + 1] = bytes[table + i * entrySize + 1]!;
      palette[i * 3 + 2] = bytes[table + i * entrySize]!;
    }
    const stride = Math.ceil((width * bits) / 32) * 4;
    const rle =
      method === 1 || method === 2 ? runLength(bytes, offset, width, height, method === 2) : null;
    if (!rle && offset + stride * height > bytes.length) damaged();
    for (let y = 0; y < height; y++) {
      const src = rowOf(y);
      for (let x = 0; x < width; x++) {
        let i: number;
        if (rle) i = rle[(height - 1 - y) * width + x]!;
        else {
          const byte = bytes[offset + src * stride + Math.floor((x * bits) / 8)]!;
          i = bits === 8 ? byte : (byte >> (8 - bits - ((x * bits) % 8))) & ((1 << bits) - 1);
        }
        const o = (y * width + x) * 4;
        const p = Math.min(i, colours - 1) * 3;
        out[o] = palette[p]!;
        out[o + 1] = palette[p + 1]!;
        out[o + 2] = palette[p + 2]!;
        out[o + 3] = 255;
      }
    }
  } else {
    const per = bits / 8;
    const stride = Math.ceil((width * bits) / 32) * 4;
    if (offset + stride * height > bytes.length) damaged();
    const [r, g, b, a] = masks.map(maskInfo) as [
      ReturnType<typeof maskInfo>,
      ReturnType<typeof maskInfo>,
      ReturnType<typeof maskInfo>,
      ReturnType<typeof maskInfo>,
    ];
    const scale = (v: number, m: { max: number }) =>
      m.max === 255 ? v : m.max ? Math.round((v * 255) / m.max) : 0;
    let anyAlpha = false;
    for (let y = 0; y < height; y++) {
      const row = offset + rowOf(y) * stride;
      for (let x = 0; x < width; x++) {
        const at = row + x * per;
        const v =
          per === 2
            ? view.getUint16(at, true)
            : per === 3
              ? bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)
              : view.getUint32(at, true);
        const o = (y * width + x) * 4;
        out[o] = scale((v & masks[0]!) >>> r.shift, r);
        out[o + 1] = scale((v & masks[1]!) >>> g.shift, g);
        out[o + 2] = scale((v & masks[2]!) >>> b.shift, b);
        const alpha = a.max ? scale((v & masks[3]!) >>> a.shift, a) : 255;
        if (alpha) anyAlpha = true;
        out[o + 3] = alpha;
      }
    }
    // Alpha all 0 is a program that did not use it (most 32-bit BMPs): opaque.
    if (a.max && !anyAlpha) for (let i = 3; i < out.length; i += 4) out[i] = 255;
  }
  const dpi = ppm > 0 ? Math.round(ppm * 0.0254) : undefined;
  return { width, height, data: out, format: 'bmp', ...(dpi ? { dpi } : {}) };
}
