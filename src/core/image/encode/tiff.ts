// G11, G10, D5 (M23): a baseline TIFF (little-endian, "II"), as print shops and scanners use: 24
// bits RGB; 32 bits RGB and alpha (ExtraSamples: unassociated alpha, so the colours are as they
// are, not premultiplied); 8 bits a palette of 256 colours (a ColorMap) or 256 greys; 1 bit black
// and white (or a palette of 2 colours). Not compressed, or LZW (lossless; the full-colour and
// grey rows with the horizontal predictor, which makes a photo's bytes smaller). The resolution
// is inside (XResolution, YResolution in pixels an inch). Strips of about 64 KB each.
import { tiffLzwEncode } from '../lzw.ts';
import { joinBytes } from '../png.ts';
import { onBackground, type EncodeOptions, type RgbaImage } from './index.ts';
import { packRows, toIndexed } from './palette.ts';

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

interface Entry {
  tag: number;
  type: number;
  values: readonly number[];
}

/** The samples a pixel and their bytes, rows from the top; and how a reader is to see them. */
function samplesOf(image: RgbaImage, options: EncodeOptions) {
  const { width, height } = image;
  const { depth } = options;
  if (depth === 32 || depth === 24) {
    const spp = depth / 8;
    const src = depth === 32 ? image.data : onBackground(image, options.background).data;
    const bytes =
      spp === 4
        ? new Uint8Array(src.buffer, src.byteOffset, src.length)
        : new Uint8Array(width * height * 3);
    if (spp === 3)
      for (let p = 0, q = 0; q < bytes.length; p += 4, q += 3) {
        bytes[q] = src[p]!;
        bytes[q + 1] = src[p + 1]!;
        bytes[q + 2] = src[p + 2]!;
      }
    return { bytes, spp, bits: 8, photometric: 2, rowBytes: width * spp, colourMap: null };
  }
  const indexed = toIndexed(image, { ...options, transparent: false });
  const bytes = packRows(indexed.indices, width, height, depth);
  const rowBytes = Math.ceil((width * depth) / 8);
  if (indexed.grey)
    // BlackIsZero: the index is the grey's level.
    return { bytes, spp: 1, bits: depth, photometric: 1, rowBytes, colourMap: null };
  // A ColorMap: all the reds, then the greens, then the blues, 16 bits each.
  const n = 2 ** depth;
  const map: number[] = new Array<number>(n * 3).fill(0);
  for (let i = 0; i < indexed.palette.length / 3; i++)
    for (let c = 0; c < 3; c++) map[c * n + i] = indexed.palette[i * 3 + c]! * 257;
  return { bytes, spp: 1, bits: depth, photometric: 3, rowBytes, colourMap: map };
}

/** Horizontal differencing (Predictor 2) of 8-bit samples, a row at a time. */
function predicted(bytes: Uint8Array, rowBytes: number, spp: number): Uint8Array {
  const out = bytes.slice();
  for (let row = 0; row < out.length; row += rowBytes)
    for (let i = row + rowBytes - 1; i >= row + spp; i--) out[i] = (out[i]! - out[i - spp]!) & 0xff;
  return out;
}

/** G11 (M23): the TIFF of these pixels. */
export function encodeTiffFile(image: RgbaImage, options: EncodeOptions): Promise<Uint8Array> {
  const { width, height } = image;
  const lzw = options.tiff === 'lzw';
  const s = samplesOf(image, options);
  const predict = lzw && s.bits === 8 && s.photometric !== 3;
  const data = predict ? predicted(s.bytes, s.rowBytes, s.spp) : s.bytes;
  const rowsPerStrip = Math.max(1, Math.min(height, Math.floor(65536 / s.rowBytes)));
  const strips: Uint8Array[] = [];
  for (let y = 0; y < height; y += rowsPerStrip) {
    const part = data.subarray(y * s.rowBytes, Math.min(height, y + rowsPerStrip) * s.rowBytes);
    strips.push(lzw ? tiffLzwEncode(part) : part);
  }
  const entries: Entry[] = [
    { tag: 256, type: LONG, values: [width] },
    { tag: 257, type: LONG, values: [height] },
    { tag: 258, type: SHORT, values: new Array<number>(s.spp).fill(s.bits) },
    { tag: 259, type: SHORT, values: [lzw ? 5 : 1] },
    { tag: 262, type: SHORT, values: [s.photometric] },
    { tag: 273, type: LONG, values: [] }, // strip offsets, filled in below
    { tag: 277, type: SHORT, values: [s.spp] },
    { tag: 278, type: LONG, values: [rowsPerStrip] },
    { tag: 279, type: LONG, values: strips.map((p) => p.length) },
    { tag: 282, type: RATIONAL, values: [Math.round(options.dpi * 100), 100] },
    { tag: 283, type: RATIONAL, values: [Math.round(options.dpi * 100), 100] },
    { tag: 284, type: SHORT, values: [1] }, // chunky: R G B A, R G B A …
    { tag: 296, type: SHORT, values: [2] }, // inches
    ...(predict ? [{ tag: 317, type: SHORT, values: [2] }] : []),
    ...(s.colourMap ? [{ tag: 320, type: SHORT, values: s.colourMap }] : []),
    ...(s.spp === 4 ? [{ tag: 338, type: SHORT, values: [2] }] : []), // unassociated alpha
  ];
  entries[5]!.values = new Array<number>(strips.length).fill(0);
  // The header, the directory, its values too long to fit in an entry, then the strips.
  const size = (e: Entry) => e.values.length * (e.type === SHORT ? 2 : 4);
  const dirBytes = 2 + entries.length * 12 + 4;
  let extra = 8 + dirBytes;
  const placed = entries.map((e) => {
    const bytes = size(e);
    if (bytes <= 4) return -1;
    const at = extra;
    extra += bytes + (bytes & 1);
    return at;
  });
  let stripAt = extra;
  entries[5]!.values = strips.map((p) => {
    const at = stripAt;
    stripAt += p.length;
    return at;
  });
  const head = new Uint8Array(extra);
  const view = new DataView(head.buffer);
  head.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);
  const put = (at: number, type: number, values: readonly number[]) => {
    values.forEach((v, i) => {
      if (type === SHORT) view.setUint16(at + i * 2, v, true);
      else view.setUint32(at + i * 4, v, true);
    });
  };
  entries.forEach((e, i) => {
    const at = 10 + i * 12;
    view.setUint16(at, e.tag, true);
    view.setUint16(at + 2, e.type, true);
    view.setUint32(at + 4, e.type === RATIONAL ? e.values.length / 2 : e.values.length, true);
    const where = placed[i]!;
    if (where < 0) put(at + 8, e.type, e.values);
    else {
      view.setUint32(at + 8, where, true);
      put(where, e.type, e.values);
    }
  });
  view.setUint32(10 + entries.length * 12, 0, true); // no next directory
  return Promise.resolve(joinBytes([head, ...strips]));
}
