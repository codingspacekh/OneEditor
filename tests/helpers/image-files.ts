// GL2 (M23): tiny picture files written byte by byte for the image-facts tests — a GIF, BMP,
// TIFF and JPEG made here, not by the app's own writers, so a mistake in a writer cannot hide the
// same mistake in the reader.
import { deflateSync } from 'node:zlib';
import { crc32 } from '../../src/core/image/dpi.ts';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];

/** GIF LZW (codes least significant bit first), the way giflib-style encoders write it. */
export function gifLzw(indices: readonly number[], minSize: number): number[] {
  const clear = 1 << minSize;
  const eoi = clear + 1;
  let size = minSize + 1;
  let next = eoi + 1;
  let table = new Map<number, number>();
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  const put = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  put(clear);
  let prefix = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    put(prefix);
    if (next === 4096) {
      put(clear);
      size = minSize + 1;
      next = eoi + 1;
      table = new Map();
    } else {
      if (next >= 1 << size) size++;
      table.set(key, next++);
    }
    prefix = k;
  }
  put(prefix);
  put(eoi);
  if (bits > 0) out.push(acc & 255);
  return out;
}

/** TIFF LZW (most significant bit first, the code size growing one code early). */
export function tiffLzw(data: readonly number[]): number[] {
  let size = 9;
  let next = 258;
  let table = new Map<number, number>();
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  const put = (code: number) => {
    acc = (acc << size) | code;
    bits += size;
    while (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  };
  put(256);
  let prefix = data[0]!;
  for (let i = 1; i < data.length; i++) {
    const k = data[i]!;
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    put(prefix);
    table.set(key, next++);
    if (next === 4094) {
      put(256);
      size = 9;
      next = 258;
      table = new Map();
    } else if (next === 1 << size) size++;
    prefix = k;
  }
  put(prefix);
  put(257);
  if (bits > 0) out.push((acc << (8 - bits)) & 255);
  return out;
}

export interface GifFrame {
  /** One palette index a pixel, the frame's width × height. */
  indices: number[];
  width?: number;
  height?: number;
  /** In hundredths of a second. */
  delay?: number;
  transparent?: number;
  /** A palette of its own (rgb triples). */
  local?: number[];
}

export function gifFile(o: {
  width: number;
  height: number;
  /** rgb triples; the table's size is the next power of two. */
  palette?: number[];
  frames: GifFrame[];
  loop?: boolean;
}): Uint8Array {
  const tableBits = (colours: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, colours))));
  const table = (rgb: number[]) => {
    const n = tableBits(rgb.length / 3);
    const full = [...rgb];
    while (full.length < 3 * (1 << n)) full.push(0);
    return { n, full };
  };
  const bytes: number[] = [...ascii('GIF89a'), ...le16(o.width), ...le16(o.height)];
  const global = o.palette ? table(o.palette) : null;
  bytes.push(global ? 0x80 | 0x70 | (global.n - 1) : 0, 0, 0);
  if (global) bytes.push(...global.full);
  if (o.loop) bytes.push(0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (const f of o.frames) {
    if (f.delay !== undefined || f.transparent !== undefined)
      bytes.push(
        0x21,
        0xf9,
        4,
        f.transparent !== undefined ? 1 : 0,
        ...le16(f.delay ?? 0),
        f.transparent ?? 0,
        0,
      );
    const local = f.local ? table(f.local) : null;
    bytes.push(0x2c, 0, 0, 0, 0, ...le16(f.width ?? o.width), ...le16(f.height ?? o.height));
    bytes.push(local ? 0x80 | (local.n - 1) : 0);
    if (local) bytes.push(...local.full);
    const minSize = Math.max(2, (local ?? global)!.n);
    const data = gifLzw(f.indices, minSize);
    bytes.push(minSize);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

/**
 * A bottom-up BMP: `pixels` are the rows' bytes as the file keeps them (each row padded to 4
 * bytes here), BGR(A) or palette indices.
 */
export function bmpFile(o: {
  width: number;
  height: number;
  bits: 1 | 4 | 8 | 16 | 24 | 32;
  rows: number[][];
  palette?: number[];
  dpi?: number;
  /** A BITMAPV4HEADER with this alpha mask (BI_BITFIELDS). */
  alphaMask?: number;
  topDown?: boolean;
}): Uint8Array {
  const v4 = o.alphaMask !== undefined;
  const headerSize = v4 ? 108 : 40;
  const palette = o.palette ?? [];
  const stride = Math.ceil((o.width * o.bits) / 32) * 4;
  const pixels: number[] = [];
  for (const row of o.rows) {
    const padded = [...row];
    while (padded.length < stride) padded.push(0);
    pixels.push(...padded);
  }
  const offset = 14 + headerSize + palette.length;
  const ppm = o.dpi ? Math.round(o.dpi / 0.0254) : 0;
  const header = [
    ...le32(headerSize),
    ...le32(o.width),
    ...le32(o.topDown ? -o.height : o.height),
    ...le16(1),
    ...le16(o.bits),
    ...le32(v4 ? 3 : 0),
    ...le32(pixels.length),
    ...le32(ppm),
    ...le32(ppm),
    ...le32(palette.length / 4),
    ...le32(0),
  ];
  if (v4) {
    header.push(...le32(0x00ff0000), ...le32(0x0000ff00), ...le32(0x000000ff));
    header.push(...le32(o.alphaMask!), ...ascii('BGRs'));
    while (header.length < headerSize) header.push(0);
  }
  return new Uint8Array([
    ...ascii('BM'),
    ...le32(offset + pixels.length),
    0,
    0,
    0,
    0,
    ...le32(offset),
    ...header,
    ...palette,
    ...pixels,
  ]);
}

type TiffValue = { tag: number; type: 3 | 4 | 5; values: number[] };

/** A little-endian TIFF of one strip: the tags are put in order, a rational as [numerator, denominator]. */
export function tiffFile(o: {
  width: number;
  height: number;
  bitsPerSample: number[];
  photometric: number;
  /** The strip's bytes as stored (already compressed when `compression` says so). */
  strip: number[];
  compression?: number;
  dpi?: number;
  /** 3: centimetres. */
  unit?: 2 | 3;
  extraSamples?: number[];
  predictor?: number;
  colourMap?: number[];
  bigEndian?: boolean;
}): Uint8Array {
  const tags: TiffValue[] = [
    { tag: 256, type: 4, values: [o.width] },
    { tag: 257, type: 4, values: [o.height] },
    { tag: 258, type: 3, values: o.bitsPerSample },
    { tag: 259, type: 3, values: [o.compression ?? 1] },
    { tag: 262, type: 3, values: [o.photometric] },
    { tag: 273, type: 4, values: [0] }, // the strip's offset, filled in below
    { tag: 277, type: 3, values: [o.bitsPerSample.length] },
    { tag: 278, type: 4, values: [o.height] },
    { tag: 279, type: 4, values: [o.strip.length] },
  ];
  if (o.dpi) {
    tags.push({ tag: 282, type: 5, values: [o.dpi, 1] }, { tag: 283, type: 5, values: [o.dpi, 1] });
    tags.push({ tag: 296, type: 3, values: [o.unit ?? 2] });
  }
  if (o.predictor) tags.push({ tag: 317, type: 3, values: [o.predictor] });
  if (o.colourMap) tags.push({ tag: 320, type: 3, values: o.colourMap });
  if (o.extraSamples) tags.push({ tag: 338, type: 3, values: o.extraSamples });
  const be = !!o.bigEndian;
  const u16 = (n: number) => (be ? be16(n) : le16(n));
  const u32 = (n: number) => (be ? [...le32(n)].reverse() : le32(n));
  const size = (t: TiffValue) => (t.type === 3 ? 2 : 4) * t.values.length;
  const ifdSize = 2 + tags.length * 12 + 4;
  let extra = 8 + ifdSize;
  const out: number[] = [...(be ? ascii('MM') : ascii('II')), ...u16(42), ...u32(8)];
  const later: number[] = [];
  const stripAt = extra + tags.filter((t) => size(t) > 4).reduce((n, t) => n + size(t), 0);
  tags.find((t) => t.tag === 273)!.values = [stripAt];
  out.push(...u16(tags.length));
  for (const t of tags) {
    out.push(
      ...u16(t.tag),
      ...u16(t.type),
      ...u32(t.type === 5 ? t.values.length / 2 : t.values.length),
    );
    const bytes = t.values.flatMap((v) => (t.type === 3 ? u16(v) : u32(v)));
    if (bytes.length <= 4) {
      while (bytes.length < 4) bytes.push(0);
      out.push(...bytes);
    } else {
      out.push(...u32(extra));
      later.push(...bytes);
      extra += bytes.length;
    }
  }
  out.push(...u32(0), ...later, ...o.strip);
  return new Uint8Array(out);
}

/** libjpeg's standard luminance table, in natural (row by row) order. */
export const IJG_LUMINANCE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

/** The luminance table libjpeg makes at a quality, in the zigzag order a file keeps. */
export function ijgTable(quality: number): number[] {
  const scale = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2;
  return ZIGZAG.map((i) =>
    Math.min(255, Math.max(1, Math.floor((IJG_LUMINANCE[i]! * scale + 50) / 100))),
  );
}

/** A JPEG's headers (no picture data is needed to read its facts). */
export function jpegFile(o: {
  width: number;
  height: number;
  /** The luminance table, zigzag order. */
  table: number[];
  components?: 1 | 3;
  /** JFIF density in dpi (units 1), or in dots a cm (units 2). */
  jfif?: { units: 0 | 1 | 2; x: number; y: number };
  /** An Exif block with this resolution (dpi). */
  exifDpi?: number;
  progressive?: boolean;
}): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  if (o.jfif)
    bytes.push(
      0xff,
      0xe0,
      ...be16(16),
      ...ascii('JFIF'),
      0,
      1,
      1,
      o.jfif.units,
      ...be16(o.jfif.x),
      ...be16(o.jfif.y),
      0,
      0,
    );
  if (o.exifDpi) {
    // An Exif block: a big-endian TIFF with XResolution, YResolution and ResolutionUnit.
    const tiff = [
      ...ascii('MM'),
      0,
      42,
      0,
      0,
      0,
      8,
      0,
      3,
      ...[1, 26, 0, 5, 0, 0, 0, 1, 0, 0, 0, 50],
      ...[1, 27, 0, 5, 0, 0, 0, 1, 0, 0, 0, 58],
      ...[1, 40, 0, 3, 0, 0, 0, 1, 0, 2, 0, 0],
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      o.exifDpi,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      o.exifDpi,
      0,
      0,
      0,
      1,
    ];
    const data = [...ascii('Exif'), 0, 0, ...tiff];
    bytes.push(0xff, 0xe1, ...be16(data.length + 2), ...data);
  }
  bytes.push(0xff, 0xdb, ...be16(67), 0, ...o.table);
  const comps = o.components ?? 3;
  bytes.push(0xff, o.progressive ? 0xc2 : 0xc0, ...be16(8 + 3 * comps), 8, ...be16(o.height));
  bytes.push(...be16(o.width), comps);
  for (let c = 0; c < comps; c++) bytes.push(c + 1, 0x11, 0);
  bytes.push(0xff, 0xda, ...be16(6 + 2 * comps), comps);
  for (let c = 0; c < comps; c++) bytes.push(c + 1, 0);
  bytes.push(0, 63, 0, 0x12, 0x34, 0xff, 0xd9);
  return new Uint8Array(bytes);
}

export const text = (s: string) => new TextEncoder().encode(s);

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function pngChunk(type: string, data: number[]): number[] {
  const body = [...ascii(type), ...data];
  return [...be32(data.length), ...body, ...be32(crc32(new Uint8Array(body)))];
}

/** A PNG of any colour type, its rows given unfiltered (a 0 filter byte is put before each). */
export function pngFile(o: {
  width: number;
  height: number;
  depth: number;
  /** 0 grey, 2 RGB, 3 palette, 4 grey + alpha, 6 RGBA. */
  type: number;
  rows: number[][];
  palette?: number[];
  trns?: number[];
  interlaced?: boolean;
}): Uint8Array {
  const header = [...be32(o.width), ...be32(o.height), o.depth, o.type, 0, 0, o.interlaced ? 1 : 0];
  const raw = o.rows.flatMap((r) => [0, ...r]);
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...pngChunk('IHDR', header),
    ...(o.palette ? pngChunk('PLTE', o.palette) : []),
    ...(o.trns ? pngChunk('tRNS', o.trns) : []),
    ...pngChunk('IDAT', [...deflateSync(new Uint8Array(raw))]),
    ...pngChunk('IEND', []),
  ]);
}

/** zlib's deflate, as a TIFF's deflate strips keep it. */
export const zlib = (data: number[]): number[] => [...deflateSync(new Uint8Array(data))];
