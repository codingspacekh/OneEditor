// GL2 (M23): the facts of a picture file — a PNG, JPG, GIF, BMP, TIFF, SVG or PDF — that the
// papers' tasks ask about: the format (by what is inside, not the name: a JPEG renamed .png is
// still a JPEG), the pixel size, the dpi and the printed size it gives, the colour depth, whether
// any pixel is see-through, a JPEG's quality, a GIF's frames, an SVG's units, viewBox and bitmaps
// ("must not contain bitmap elements"), a PDF's page. Read from the bytes alone: the task checker
// (T6) and Learn ▸ Inspect (T1) use it, in the app and in the acceptance tests. Pure.
import { EditError } from '../model/errors.ts';
import { webCompression, type Compression } from './deflate.ts';
import { isPng, pngDpi } from './dpi.ts';
import { bmpFacts } from './facts/bmp.ts';
import { gifFacts } from './facts/gif.ts';
import { jpegFacts } from './facts/jpeg.ts';
import { tiffFacts } from './facts/tiff.ts';
import type { Found, ImageFacts, ImageFormat } from './facts/types.ts';
import { pdfFacts, svgFacts } from './facts/vector.ts';
import { decodePng } from './png.ts';

export type { ImageFacts, ImageFormat, PrintSize, SeeThrough } from './facts/types.ts';

/** What each extension names (the seven formats' usual and other spellings). */
const EXTENSIONS: Record<string, ImageFormat> = {
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpg',
  jpe: 'jpg',
  jfif: 'jpg',
  gif: 'gif',
  bmp: 'bmp',
  dib: 'bmp',
  tif: 'tiff',
  tiff: 'tiff',
  svg: 'svg',
  pdf: 'pdf',
};

/** GL2: a file name that names one of the seven formats (so the checker reads it as a picture). */
export const isImageName = (name: string): boolean => extensionOf(name) in EXTENSIONS;

export const NOT_AN_IMAGE = 'This file is not a PNG, JPG, GIF, BMP, TIFF, SVG or PDF picture.';

const extensionOf = (name: string) => /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

const starts = (b: Uint8Array, bytes: readonly number[], at = 0) =>
  bytes.every((v, i) => b[at + i] === v);

/** The format from the first bytes (a PDF's or SVG's text may come after a few others). */
export function sniffFormat(b: Uint8Array): ImageFormat | null {
  if (isPng(b)) return 'png';
  if (starts(b, [0xff, 0xd8, 0xff])) return 'jpg';
  if (starts(b, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (starts(b, [0x42, 0x4d]) && b.length >= 26) return 'bmp';
  if (starts(b, [0x49, 0x49, 42, 0]) || starts(b, [0x4d, 0x4d, 0, 42])) return 'tiff';
  const head = new TextDecoder('latin1').decode(b.subarray(0, 4096));
  if (head.includes('%PDF-')) return 'pdf';
  if (/^\s*(?:\uFEFF|\u00EF\u00BB\u00BF)?\s*</.test(head) && /<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

/** A PNG's header facts, and its see-through pixels (decoded and looked at when it can hold them). */
async function pngFacts(b: Uint8Array, compression: Compression): Promise<Found> {
  const u32 = (at: number) =>
    ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
  if (b.length < 33) throw new EditError('This PNG file is damaged.');
  const width = u32(16);
  const height = u32(20);
  const bits = b[24]!;
  const type = b[25]!;
  const interlaced = b[28] === 1;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type] ?? 1;
  let palette: number | undefined;
  let trns = false;
  for (let at = 8; at + 12 <= b.length;) {
    const length = u32(at);
    const kind = String.fromCharCode(...b.subarray(at + 4, at + 8));
    if (kind === 'PLTE') palette = Math.floor(length / 3);
    if (kind === 'tRNS') trns = true;
    if (kind === 'IDAT' || kind === 'IEND') break;
    at += 12 + length;
  }
  let seeThrough: Found['seeThrough'] = 'none';
  if (type === 4 || type === 6 || trns) {
    if (interlaced) seeThrough = 'possible';
    else {
      let decoded;
      try {
        decoded = await decodePng(b, compression);
      } catch (error) {
        throw new EditError((error as Error).message);
      }
      seeThrough = 'unused';
      const { data } = decoded;
      for (let i = 3; i < data.length; i += 4)
        if (data[i]! < 255) {
          seeThrough = 'used';
          break;
        }
    }
  }
  const dpi = pngDpi(b);
  return {
    width,
    height,
    ...(dpi ? { dpi } : {}),
    depth: bits * channels,
    ...(type === 3 && palette ? { palette } : {}),
    ...(type === 0 || type === 4 ? { grey: true } : {}),
    seeThrough,
    compression: 'deflate (lossless)',
  };
}

/**
 * GL2: what a picture file holds. `fileName` is only for its extension (said when it disagrees
 * with what is inside). Throws an EditError, in words, for a file that is not one of the seven or
 * is damaged.
 */
export async function imageFacts(
  bytes: Uint8Array,
  fileName: string,
  compression: Compression = webCompression,
): Promise<ImageFacts> {
  const format = sniffFormat(bytes);
  if (!format) throw new EditError(NOT_AN_IMAGE);
  const text = () => new TextDecoder(format === 'pdf' ? 'latin1' : 'utf-8').decode(bytes);
  const found: Found =
    format === 'png'
      ? await pngFacts(bytes, compression)
      : format === 'jpg'
        ? jpegFacts(bytes)
        : format === 'gif'
          ? gifFacts(bytes)
          : format === 'bmp'
            ? bmpFacts(bytes)
            : format === 'tiff'
              ? await tiffFacts(bytes, compression)
              : format === 'svg'
                ? svgFacts(text())
                : pdfFacts(text());
  const extension = extensionOf(fileName);
  const says = EXTENSIONS[extension];
  // A bitmap's printed size: its pixels at its dpi.
  const { width, height, dpi } = found;
  const print =
    found.print ??
    (width && height && dpi && dpi.x > 0 && dpi.y > 0
      ? {
          widthIn: width / dpi.x,
          heightIn: height / dpi.y,
          widthCm: (width / dpi.x) * 2.54,
          heightCm: (height / dpi.y) * 2.54,
          from: 'dpi' as const,
        }
      : undefined);
  return {
    ...found,
    ...(print ? { print } : {}),
    format,
    kind: format === 'svg' || format === 'pdf' ? 'vector' : 'bitmap',
    extension,
    ...(says && says !== format ? { extensionSays: says } : {}),
    sizeBytes: bytes.length,
  };
}
