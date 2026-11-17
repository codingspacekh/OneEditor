// GC2, G11 (M23): about how big an export's file will be, before it is made, for the export
// dialog: exact for a file that is not compressed (a BMP, a TIFF without compression: header,
// colour table and every pixel's bits), otherwise the pixels' bits shrunk by what the format's
// compression usually does to a photo or to a drawing of flat colours — lossless (PNG's deflate,
// GIF's and TIFF's LZW) a little for a photo and a lot for flat colour, lossy (JPG) by its quality.
import type { ColourDepth, GraphicFormat, TiffCompression } from '../../graphics/export.ts';
import { bmpStride } from './bmp.ts';

export interface SizeGuess {
  bytes: number;
  /** True when the file is not compressed: the size is what it will be. */
  exact: boolean;
}

/** How much of the pixels' bits a lossless format usually keeps: [photo, flat drawing]. */
const LOSSLESS: Readonly<Record<string, readonly [number, number]>> = {
  'png-full': [0.5, 0.03],
  'png-palette': [0.7, 0.05],
  gif: [0.8, 0.07],
  'tiff-full': [0.75, 0.06],
  'tiff-palette': [0.8, 0.08],
};

/**
 * M23: about how big a `width` × `height` px file is in `format` at `depth` bits a pixel, for a
 * photo (`photo`: it has pixel layers or pictures) or a drawing. Null for SVG and PDF (shapes,
 * not pixels).
 */
export function estimateFileSize(
  format: GraphicFormat,
  size: { width: number; height: number },
  options: { depth: ColourDepth; tiff?: TiffCompression; quality?: number; photo: boolean },
): SizeGuess | null {
  const { width, height } = size;
  const { depth, photo } = options;
  const palette = depth <= 8 ? 2 ** depth : 0;
  const raw = Math.ceil((width * depth) / 8) * height;
  const share = (key: string) => LOSSLESS[key]![photo ? 0 : 1];
  switch (format) {
    case 'svg':
    case 'pdf':
      return null;
    case 'bmp':
      return {
        bytes: 14 + (depth === 32 ? 108 : 40) + palette * 4 + bmpStride(width, depth) * height,
        exact: true,
      };
    case 'tiff':
      if (options.tiff === 'none') return { bytes: 200 + palette * 6 + raw, exact: true };
      return {
        bytes: Math.round(
          200 + palette * 6 + raw * share(depth > 8 ? 'tiff-full' : 'tiff-palette'),
        ),
        exact: false,
      };
    case 'gif':
      return { bytes: Math.round(30 + palette * 3 + raw * share('gif')), exact: false };
    case 'png':
      return {
        bytes: Math.round(60 + palette * 3 + raw * share(depth > 8 ? 'png-full' : 'png-palette')),
        exact: false,
      };
    case 'jpg': {
      // Bits a pixel: a photo at quality 90 about 2.3, a flat drawing about 0.8.
      const q = (options.quality ?? 90) / 100;
      const bits = photo ? 0.3 + 2.7 * q ** 3 : 0.1 + 0.9 * q ** 3;
      return { bytes: Math.round(600 + (width * height * bits) / 8), exact: false };
    }
  }
}

/** "about 1.2 MB", "4.0 KB", "350 bytes": a size for the dialog. */
export function sizeWords(guess: SizeGuess): string {
  const { bytes } = guess;
  const amount =
    bytes >= 1e6
      ? `${(bytes / 1e6).toFixed(1)} MB`
      : bytes >= 1e3
        ? `${(bytes / 1e3).toFixed(bytes >= 1e5 ? 0 : 1)} KB`
        : `${bytes} bytes`;
  return guess.exact ? amount : `about ${amount}`;
}
