// G11, D5 (M23): one way to read a bitmap file back to its pixels — PNG, GIF, BMP or TIFF, the
// format found from the file's first bytes — so a file the app wrote (or any other) can be shown
// in the page (Chromium cannot show a TIFF), compared with what was exported, and checked. JPEG
// is decoded by the page (the renderer), not here.
import { EditError } from '../../model/errors.ts';
import type { Compression } from '../deflate.ts';
import { isPng } from '../dpi.ts';
import { decodePng } from '../png.ts';
import { decodeBmp, isBmp } from './bmp.ts';
import { decodeGif, isGif } from './gif.ts';
import { decodeTiff, isTiff } from './tiff.ts';

export interface DecodedBitmap {
  width: number;
  height: number;
  /** RGBA, rows from the top, not premultiplied (as ImageData). */
  data: Uint8ClampedArray;
  /** The resolution the file gives, if any (a GIF gives none). */
  dpi?: number;
  format: 'png' | 'gif' | 'bmp' | 'tiff';
}

/** The bitmap format of a file, from its first bytes; null for any other. */
export function bitmapFormatOf(bytes: Uint8Array): DecodedBitmap['format'] | null {
  if (isPng(bytes)) return 'png';
  if (isGif(bytes)) return 'gif';
  if (isBmp(bytes)) return 'bmp';
  if (isTiff(bytes)) return 'tiff';
  return null;
}

/**
 * M23: a PNG, GIF (its first picture), BMP or TIFF file's pixels as RGBA. Refuses (EditError, in
 * words) a file that is none of them, or damaged.
 */
export async function decodeBitmap(
  bytes: Uint8Array,
  compression: Compression,
): Promise<DecodedBitmap> {
  switch (bitmapFormatOf(bytes)) {
    case 'png':
      try {
        return { ...(await decodePng(bytes, compression)), format: 'png' };
      } catch (error) {
        throw new EditError((error as Error).message);
      }
    case 'gif':
      return decodeGif(bytes);
    case 'bmp':
      return decodeBmp(bytes);
    case 'tiff':
      return decodeTiff(bytes, compression);
    default:
      throw new EditError('This is not a PNG, GIF, BMP or TIFF file.');
  }
}
