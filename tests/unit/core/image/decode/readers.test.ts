// M23 / G11, D5: our readers take what our writers make (writers.test.ts) and the files other
// programs save — BMP's other headers, 16-bit, masks, run-length compression and rows from the top;
// GIF's local tables, interlacing and pictures smaller than the screen; TIFF's Motorola byte
// order, PackBits, Deflate, 16-bit samples, white as 0 and premultiplied alpha — and refuse in
// words what they cannot read.
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { webCompression } from '../../../../../src/core/image/deflate.ts';
import { decodeBmp } from '../../../../../src/core/image/decode/bmp.ts';
import { decodeGif } from '../../../../../src/core/image/decode/gif.ts';
import { bitmapFormatOf, decodeBitmap } from '../../../../../src/core/image/decode/index.ts';
import { decodeTiff } from '../../../../../src/core/image/decode/tiff.ts';
import { encodePng } from '../../../../../src/core/image/png.ts';
import { gifLzwEncode, tiffLzwEncode } from '../../../../../src/core/image/lzw.ts';
import { EditError } from '../../../../../src/core/model/errors.ts';

const px = (d: Uint8ClampedArray, i: number) => [...d.subarray(i * 4, i * 4 + 4)];

// ---- BMP ----

interface BmpParts {
  header?: 12 | 40 | 56 | 108;
  width: number;
  height: number;
  bits: number;
  method?: number;
  masks?: number[];
  colours?: number[][];
  /** The pixel bytes as stored (rows already in the file's order and padded). */
  pixels: number[];
  ppm?: number;
}

function bmp(p: BmpParts): Uint8Array {
  const header = p.header ?? 40;
  const core = header === 12;
  const masksAfter = header === 40 && p.masks ? p.masks.length * 4 : 0;
  const entry = core ? 3 : 4;
  const table = (p.colours ?? []).length * entry;
  const offset = 14 + header + masksAfter + table;
  const out = new Uint8Array(offset + p.pixels.length);
  const v = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  v.setUint32(2, out.length, true);
  v.setUint32(10, offset, true);
  v.setUint32(14, header, true);
  if (core) {
    v.setUint16(18, p.width, true);
    v.setInt16(20, p.height, true);
    v.setUint16(22, 1, true);
    v.setUint16(24, p.bits, true);
  } else {
    v.setInt32(18, p.width, true);
    v.setInt32(22, p.height, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, p.bits, true);
    v.setUint32(30, p.method ?? 0, true);
    v.setInt32(38, p.ppm ?? 0, true);
    v.setInt32(42, p.ppm ?? 0, true);
    v.setUint32(46, p.colours?.length ?? 0, true);
    p.masks?.forEach((m, i) => v.setUint32(54 + i * 4, m, true));
  }
  (p.colours ?? []).forEach(([r, g, b], i) => {
    const at = 14 + header + masksAfter + i * entry;
    out[at] = b!;
    out[at + 1] = g!;
    out[at + 2] = r!;
  });
  out.set(p.pixels, offset);
  return out;
}

describe('G11 (M23): reading a BMP', () => {
  it('rows from the top (a negative height); the OS/2 header and its 3-byte colours', () => {
    const top = decodeBmp(
      bmp({ width: 1, height: -2, bits: 24, pixels: [0, 0, 255, 0, 255, 0, 0, 0] }),
    );
    expect(px(top.data, 0)).toEqual([255, 0, 0, 255]);
    expect(px(top.data, 1)).toEqual([0, 0, 255, 255]);
    expect(top.dpi).toBeUndefined();
    const os2 = decodeBmp(
      bmp({
        header: 12,
        width: 2,
        height: 1,
        bits: 1,
        colours: [
          [0, 0, 0],
          [255, 255, 255],
        ],
        pixels: [0b01000000, 0, 0, 0],
      }),
    );
    expect(px(os2.data, 0)).toEqual([0, 0, 0, 255]);
    expect(px(os2.data, 1)).toEqual([255, 255, 255, 255]);
  });

  it('16 bits: 5-5-5 by default, or 5-6-5 by its masks', () => {
    const plain = decodeBmp(bmp({ width: 1, height: 1, bits: 16, pixels: [0x00, 0x7c, 0, 0] }));
    expect(px(plain.data, 0)).toEqual([255, 0, 0, 255]);
    const masked = decodeBmp(
      bmp({
        width: 1,
        height: 1,
        bits: 16,
        method: 3,
        masks: [0xf800, 0x07e0, 0x001f],
        pixels: [0xe0, 0x07, 0, 0],
      }),
    );
    expect(px(masked.data, 0)).toEqual([0, 255, 0, 255]);
  });

  it('32 bits: alpha all 0 means a program that did not use it (opaque); masks with alpha', () => {
    const unused = decodeBmp(bmp({ width: 1, height: 1, bits: 32, pixels: [10, 20, 30, 0] }));
    expect(px(unused.data, 0)).toEqual([30, 20, 10, 255]);
    const alpha = decodeBmp(
      bmp({
        header: 56,
        width: 1,
        height: 1,
        bits: 32,
        method: 3,
        masks: [0xff0000, 0xff00, 0xff, 0xff000000],
        pixels: [10, 20, 30, 128],
        ppm: 3780,
      }),
    );
    expect(px(alpha.data, 0)).toEqual([30, 20, 10, 128]);
    expect(alpha.dpi).toBe(96);
    const six = decodeBmp(
      bmp({
        width: 1,
        height: 1,
        bits: 32,
        method: 6,
        masks: [0xff, 0xff00, 0xff0000, 0xff000000],
        pixels: [10, 20, 30, 40],
      }),
    );
    expect(px(six.data, 0)).toEqual([10, 20, 30, 40]);
  });

  it('run-length compressed 8- and 4-bit pixels', () => {
    const colours = [
      [0, 0, 0],
      [255, 0, 0],
      [0, 255, 0],
    ];
    // Bottom row: a run of 2 × entry 1, then a literal run of 3 (2, 1, 2) padded; end of line;
    // top row: a skip (delta) of 1 right, then 1 × entry 2; end of bitmap.
    const rle8 = decodeBmp(
      bmp({
        width: 5,
        height: 2,
        bits: 8,
        method: 1,
        colours,
        pixels: [2, 1, 0, 3, 2, 1, 2, 0, 0, 0, 0, 2, 1, 0, 1, 2, 0, 1],
      }),
    );
    expect(px(rle8.data, 5 + 0)).toEqual([255, 0, 0, 255]);
    expect(px(rle8.data, 5 + 2)).toEqual([0, 255, 0, 255]);
    expect(px(rle8.data, 5 + 3)).toEqual([255, 0, 0, 255]);
    expect(px(rle8.data, 1)).toEqual([0, 255, 0, 255]);
    expect(px(rle8.data, 0)).toEqual([0, 0, 0, 255]);
    const rle4 = decodeBmp(
      bmp({
        width: 5,
        height: 1,
        bits: 4,
        method: 2,
        colours,
        pixels: [2, 0x12, 0, 3, 0x21, 0x10, 0, 1],
      }),
    );
    expect([0, 1, 2, 3, 4].map((i) => px(rle4.data, i)[0])).toEqual([255, 0, 0, 255, 255]);
  });

  it('refuses a file that is not a BMP, is cut short or is compressed another way', () => {
    expect(() => decodeBmp(new Uint8Array(40))).toThrow(/not a BMP/);
    const whole = bmp({ width: 2, height: 2, bits: 24, pixels: new Array<number>(16).fill(0) });
    expect(() => decodeBmp(whole.slice(0, 60))).toThrow(EditError);
    expect(() =>
      decodeBmp(bmp({ width: 1, height: 1, bits: 24, method: 4, pixels: [0, 0, 0, 0] })),
    ).toThrow(/uncompressed/);
    expect(() => decodeBmp(bmp({ width: 1, height: 1, bits: 7, pixels: [0, 0, 0, 0] }))).toThrow(
      EditError,
    );
    expect(() => decodeBmp(bmp({ width: 0, height: 1, bits: 24, pixels: [] }))).toThrow(EditError);
    const odd = bmp({ width: 1, height: 1, bits: 24, pixels: [0, 0, 0, 0] });
    new DataView(odd.buffer).setUint32(14, 20, true);
    expect(() => decodeBmp(odd)).toThrow(EditError);
  });
});

// ---- GIF ----

function gif(parts: {
  width: number;
  height: number;
  global?: number[][];
  frame: { left?: number; top?: number; width: number; height: number; local?: number[][] };
  indices: number[];
  interlaced?: boolean;
  extensions?: number[][];
  minBits?: number;
}): Uint8Array {
  const u16 = (n: number) => [n & 255, n >> 8];
  const table = (t: number[][]) => {
    const bits = Math.max(1, Math.ceil(Math.log2(t.length)));
    const full = new Array<number>(3 * 2 ** bits).fill(0);
    t.flat().forEach((v, i) => (full[i] = v));
    return { bits, full };
  };
  const g = parts.global ? table(parts.global) : null;
  const l = parts.frame.local ? table(parts.frame.local) : null;
  const minBits = parts.minBits ?? Math.max(2, (l ?? g)!.bits);
  const data = gifLzwEncode(Uint8Array.from(parts.indices), minBits);
  const blocks: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const part = [...data.subarray(i, i + 255)];
    blocks.push(part.length, ...part);
  }
  return Uint8Array.from([
    ...[...'GIF89a'].map((c) => c.charCodeAt(0)),
    ...u16(parts.width),
    ...u16(parts.height),
    g ? 0x80 | (g.bits - 1) : 0,
    0,
    0,
    ...(g ? g.full : []),
    ...(parts.extensions ?? []).flat(),
    0x2c,
    ...u16(parts.frame.left ?? 0),
    ...u16(parts.frame.top ?? 0),
    ...u16(parts.frame.width),
    ...u16(parts.frame.height),
    (l ? 0x80 | (l.bits - 1) : 0) | (parts.interlaced ? 0x40 : 0),
    ...(l ? l.full : []),
    minBits,
    ...blocks,
    0,
    0x3b,
  ]);
}

describe('G11 (M23): reading a GIF', () => {
  const rgb = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
  ];

  it('a picture smaller than its screen, in its place; a local colour table; a comment passed over', () => {
    const comment = [0x21, 0xfe, 3, 0x68, 0x69, 0x21, 0];
    const loop = [0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0];
    const g = decodeGif(
      gif({
        width: 3,
        height: 3,
        frame: { left: 1, top: 1, width: 2, height: 2, local: rgb },
        indices: [0, 1, 2, 3],
        extensions: [comment, loop],
      }),
    );
    expect(px(g.data, 0)[3]).toBe(0); // outside the picture: see-through
    expect(px(g.data, 4)).toEqual([255, 0, 0, 255]);
    expect(px(g.data, 8)).toEqual([255, 255, 255, 255]);
  });

  it('interlaced rows put back in order; the see-through colour', () => {
    const control = [0x21, 0xf9, 4, 1, 0, 0, 3, 0];
    // Rows 0..4 stored as 0, 4, 2, 1, 3.
    const stored = [0, 3, 2, 1, 3];
    const g = decodeGif(
      gif({
        width: 1,
        height: 5,
        global: rgb,
        frame: { width: 1, height: 5 },
        indices: stored,
        interlaced: true,
        extensions: [control],
      }),
    );
    expect([0, 1, 2, 3, 4].map((y) => px(g.data, y))).toEqual([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });

  it('refuses a file that is not a GIF, has no colours or no picture', () => {
    expect(() => decodeGif(new Uint8Array(20))).toThrow(/not a GIF/);
    const noTable = gif({
      width: 1,
      height: 1,
      frame: { width: 1, height: 1 },
      indices: [0],
      minBits: 2,
    });
    expect(() => decodeGif(noTable)).toThrow(EditError);
    const head = gif({
      width: 1,
      height: 1,
      global: rgb,
      frame: { width: 1, height: 1 },
      indices: [0],
    });
    expect(() => decodeGif(Uint8Array.from([...head.subarray(0, 25), 0x3b]))).toThrow(EditError);
    const zero = head.slice();
    zero[6] = 0;
    expect(() => decodeGif(zero)).toThrow(EditError);
    const badBits = head.slice();
    badBits[13 + 12 + 10] = 12;
    expect(() => decodeGif(badBits)).toThrow(EditError);
  });
});

// ---- TIFF ----

type Tag = [tag: number, type: number, values: number[]];

/** A TIFF of one strip of `strip`; RATIONAL values are given as [numerator, denominator]. */
function tiff(tags: Tag[], strip: Uint8Array, little = true): Uint8Array {
  const size = (t: number) => (t === 3 ? 2 : t === 5 ? 4 : t === 1 || t === 2 || t === 7 ? 1 : 4);
  const stripTags: Tag[] = [
    [273, 4, [0]],
    [279, 4, [strip.length]],
  ];
  const all = [...tags, ...stripTags].sort((a, b) => a[0] - b[0]);
  const dir = 8;
  let extra = dir + 2 + all.length * 12 + 4;
  const blobs: { at: number; tag: Tag }[] = [];
  for (const t of all) {
    const bytes = t[2].length * size(t[1]);
    if (bytes > 4) {
      blobs.push({ at: extra, tag: t });
      extra += bytes + (bytes & 1);
    }
  }
  const stripAt = extra;
  const out = new Uint8Array(stripAt + strip.length);
  const v = new DataView(out.buffer);
  out.set(little ? [0x49, 0x49, 42, 0] : [0x4d, 0x4d, 0, 42]);
  v.setUint32(4, dir, little);
  v.setUint16(dir, all.length, little);
  const put = (at: number, type: number, values: number[]) =>
    values.forEach((n, i) => {
      const s = size(type);
      if (s === 1) out[at + i] = n;
      else if (s === 2) v.setUint16(at + i * 2, n, little);
      else v.setUint32(at + i * 4, n, little);
    });
  all.forEach((t, i) => {
    const at = dir + 2 + i * 12;
    const values = t[0] === 273 ? [stripAt] : t[2];
    v.setUint16(at, t[0], little);
    v.setUint16(at + 2, t[1], little);
    v.setUint32(at + 4, t[1] === 5 ? values.length / 2 : values.length, little);
    const blob = blobs.find((b) => b.tag === t);
    if (blob) {
      v.setUint32(at + 8, blob.at, little);
      put(blob.at, t[1], values);
    } else put(at + 8, t[1], values);
  });
  out.set(strip, stripAt);
  return out;
}

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const base = (
  w: number,
  h: number,
  bits: number[],
  photometric: number,
  more: Tag[] = [],
): Tag[] => [
  [256, LONG, [w]],
  [257, LONG, [h]],
  [258, SHORT, bits],
  [262, SHORT, [photometric]],
  [277, SHORT, [bits.length]],
  [278, LONG, [h]],
  ...more,
];

describe('G11 (M23): reading a TIFF', () => {
  it('Motorola byte order (MM), 16-bit RGB samples, the resolution in cm', async () => {
    const strip = Uint8Array.from([0xff, 0xff, 0x80, 0x00, 0x00, 0x00]);
    const t = await decodeTiff(
      tiff(
        base(1, 1, [16, 16, 16], 2, [
          [282, RATIONAL, [118, 1]],
          [283, RATIONAL, [118, 1]],
          [296, SHORT, [3]],
        ]),
        strip,
        false,
      ),
      webCompression,
    );
    expect(px(t.data, 0)).toEqual([255, 128, 0, 255]);
    expect(t.dpi).toBe(300);
  });

  it('PackBits; white as 0; 2 bits a sample; no resolution unit', async () => {
    // 4 pixels of 2 bits: 0, 1, 2, 3 in one byte, sent as a literal run; then a repeated byte.
    const packed = Uint8Array.from([0, 0b00011011, 0xff, 0x00]);
    const t = await decodeTiff(
      tiff(
        base(4, 2, [2], 0, [
          [259, SHORT, [32773]],
          [282, RATIONAL, [72, 1]],
          [296, SHORT, [1]],
        ]),
        packed,
      ),
      webCompression,
    );
    expect([0, 1, 2, 3].map((i) => px(t.data, i)[0])).toEqual([255, 170, 85, 0]);
    expect(px(t.data, 4)[0]).toBe(255);
    expect(t.dpi).toBeUndefined();
  });

  it('Deflate with the predictor; premultiplied (associated) alpha made straight again', async () => {
    const rows = Uint8Array.from([100, 50, 0, 128, 0, 0, 0, 0]); // 2 px, the second = the first
    const t = await decodeTiff(
      tiff(
        base(2, 1, [8, 8, 8, 8], 2, [
          [259, SHORT, [8]],
          [317, SHORT, [2]],
          [338, SHORT, [1]],
        ]),
        Uint8Array.from(deflateSync(rows)),
      ),
      webCompression,
    );
    expect(px(t.data, 0)).toEqual([199, 100, 0, 128]);
    expect(px(t.data, 1)).toEqual([199, 100, 0, 128]);
  });

  it('LZW with the predictor on 16-bit samples; an extra sample that is not alpha', async () => {
    const rows = Uint8Array.from([0x10, 0x00, 0x05, 0, 0x01, 0x00, 0x05, 0]); // grey + extra
    const t = await decodeTiff(
      tiff(
        base(2, 1, [16, 16], 1, [
          [259, SHORT, [5]],
          [317, SHORT, [2]],
          [338, SHORT, [0]],
        ]),
        tiffLzwEncode(rows),
        false,
      ),
      webCompression,
    );
    expect(px(t.data, 0)).toEqual([16, 16, 16, 255]);
    expect(px(t.data, 1)).toEqual([17, 17, 17, 255]);
  });

  it('a palette (ColorMap) of 4-bit indices', async () => {
    const map = new Array<number>(48).fill(0);
    map[1] = 0xffff; // entry 1 red
    map[16 + 2] = 0xffff; // entry 2 green
    const t = await decodeTiff(
      tiff(base(2, 1, [4], 3, [[320, SHORT, map]]), Uint8Array.of(0x12)),
      webCompression,
    );
    expect(px(t.data, 0)).toEqual([255, 0, 0, 255]);
    expect(px(t.data, 1)).toEqual([0, 255, 0, 255]);
  });

  it('refuses in words what it cannot read', async () => {
    const one = Uint8Array.of(0);
    const refused = (tags: Tag[]) => decodeTiff(tiff(tags, one), webCompression);
    await expect(refused(base(1, 1, [8], 1, [[322, LONG, [16]]]))).rejects.toThrow(/tiles/);
    await expect(refused(base(1, 1, [8], 1, [[284, SHORT, [2]]]))).rejects.toThrow(/planes/);
    await expect(refused(base(1, 1, [8], 1, [[339, SHORT, [3]]]))).rejects.toThrow(/floating/);
    await expect(refused(base(1, 1, [8, 8, 8, 8], 5))).rejects.toThrow(/CMYK/);
    await expect(refused(base(1, 1, [8], 6))).rejects.toThrow(/unusual/);
    await expect(refused(base(1, 1, [12], 1))).rejects.toThrow(/12 bits/);
    await expect(refused(base(1, 1, [8], 1, [[259, SHORT, [7]]]))).rejects.toThrow(/JPEG/);
    await expect(refused(base(1, 1, [4], 1, [[317, SHORT, [2]]]))).rejects.toThrow(/predictor/);
    await expect(refused(base(1, 1, [8], 3))).rejects.toThrow(/damaged/);
    await expect(refused(base(1, 1, [8], 2))).rejects.toThrow(/damaged/);
    await expect(refused(base(0, 1, [8], 1))).rejects.toThrow(/damaged/);
    await expect(refused(base(1, 1, [8], 1, [[259, SHORT, [8]]]))).rejects.toThrow(/damaged/);
    await expect(decodeTiff(new Uint8Array(8), webCompression)).rejects.toThrow(/not a TIFF/);
    const cut = tiff(base(1, 1, [8], 1), one).slice(0, 20);
    await expect(decodeTiff(cut, webCompression)).rejects.toThrow(EditError);
    const far = Uint8Array.from([0x49, 0x49, 42, 0, 0xff, 0xff, 0, 0]);
    await expect(decodeTiff(far, webCompression)).rejects.toThrow(EditError);
  });

  it('a field of an unknown type is passed over; one past the end is damage', async () => {
    const tags = base(1, 1, [8], 1, [[700, 13, [1]]]);
    const t = await decodeTiff(tiff(tags, Uint8Array.of(9)), webCompression);
    expect(px(t.data, 0)).toEqual([9, 9, 9, 255]);
    const bytes = tiff(base(1, 1, [8], 1, [[305, 2, [65, 66, 67, 68, 69, 0]]]), Uint8Array.of(9));
    const v = new DataView(bytes.buffer);
    // The Software field's values said to be far away.
    for (let i = 0; i < v.getUint16(8, true); i++)
      if (v.getUint16(10 + i * 12, true) === 305) v.setUint32(10 + i * 12 + 8, 1e6, true);
    await expect(decodeTiff(bytes, webCompression)).rejects.toThrow(EditError);
  });
});

describe('G11 (M23): decodeBitmap finds the format from the first bytes', () => {
  it('reads a PNG, and refuses a damaged PNG or another file in words', async () => {
    const png = await encodePng(
      { width: 1, height: 1, channels: 4, data: Uint8Array.of(1, 2, 3, 4) },
      webCompression,
      { dpi: 150 },
    );
    expect(bitmapFormatOf(png)).toBe('png');
    expect(await decodeBitmap(png, webCompression)).toMatchObject({ format: 'png', dpi: 150 });
    await expect(decodeBitmap(png.slice(0, 30), webCompression)).rejects.toThrow(EditError);
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
    expect(bitmapFormatOf(jpeg)).toBeNull();
    await expect(decodeBitmap(jpeg, webCompression)).rejects.toThrow(/not a PNG, GIF, BMP or TIFF/);
  });
});
