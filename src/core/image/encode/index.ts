// G11, G10, D5 (M23): one way to write a bitmap file — PNG, GIF, BMP or TIFF — from the image's
// pixels, at the colour depth asked for, with the resolution inside. The pixels come straight
// (not premultiplied) from the renderer; see-through parts go on the background when the file
// cannot keep them. JPG is not here: the canvas makes it (its quality), and dpi.ts writes the
// resolution in. Each format's own writer is in this folder: png (palette, grey, RGB, RGBA),
// gif (palette, LZW, one see-through colour), bmp (1, 4, 8, 24, 32 bits), tiff (none or LZW).
import { hexToRgb } from '../../colour.ts';
import {
  colourDepth,
  keepsTransparency,
  type ColourDepth,
  type GraphicExportOptions,
  type TiffCompression,
} from '../../graphics/export.ts';
import { EditError } from '../../model/errors.ts';
import type { Compression } from '../deflate.ts';
import { encodeBmpFile } from './bmp.ts';
import { encodeGifFile } from './gif.ts';
import { encodePngFile } from './png.ts';
import { encodeTiffFile } from './tiff.ts';

/** Pixels in rows from the top, 4 bytes a pixel, RGBA not premultiplied (as ImageData). */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type BitmapFormat = 'png' | 'gif' | 'bmp' | 'tiff';

/** Everything a writer needs, the defaults filled in. */
export interface EncodeOptions {
  depth: ColourDepth;
  /** 1, 4 and 8 bits: the image's own colours or greys. */
  palette: 'colours' | 'greys';
  dither: boolean;
  /** See-through pixels kept (32 bits: alpha; a palette: one see-through entry). */
  transparent: boolean;
  /** What see-through parts go on when they are not kept, as #rrggbb. */
  background: string;
  /** The resolution written into the file. */
  dpi: number;
  /** TIFF only. */
  tiff: TiffCompression;
}

/** An export's options with the defaults filled in, checked; `dpi` is the image's. */
export function encodeOptions(
  options: GraphicExportOptions & { format: BitmapFormat },
  dpi: number,
): EncodeOptions {
  const depth = colourDepth(options);
  const background = options.background ?? '#ffffff';
  if (!/^#[0-9a-f]{6}$/i.test(background))
    throw new EditError(`The background must be a colour like #ffffff, not “${background}”.`);
  return {
    depth,
    // 1 bit is black and white (as Paint, Photoshop and GIMP make it): the image's own two
    // colours, median cut, lose most pictures to one flat shape.
    palette: options.palette ?? (depth === 1 ? 'greys' : 'colours'),
    dither: options.dither ?? true,
    transparent: keepsTransparency(options),
    background: background.toLowerCase(),
    dpi,
    tiff: options.tiff ?? 'lzw',
  };
}

/**
 * The image on a plain colour: every pixel fully opaque, the see-through ones mixed with it as
 * they show on the canvas (what a JPG, a 24-bit BMP or TIFF holds).
 */
export function onBackground(image: RgbaImage, background: string): RgbaImage {
  const { r, g, b } = hexToRgb(background);
  const src = image.data;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]!;
    if (a === 255) {
      out[i] = src[i]!;
      out[i + 1] = src[i + 1]!;
      out[i + 2] = src[i + 2]!;
    } else {
      const k = a / 255;
      out[i] = src[i]! * k + r * (1 - k);
      out[i + 1] = src[i + 1]! * k + g * (1 - k);
      out[i + 2] = src[i + 2]! * k + b * (1 - k);
    }
    out[i + 3] = 255;
  }
  return { width: image.width, height: image.height, data: out };
}

/** One format's writer. */
export type BitmapEncoder = (
  image: RgbaImage,
  options: EncodeOptions,
  compression: Compression,
) => Promise<Uint8Array>;

/** D5 (M23): each format's own writer. */
const ENCODERS: Record<BitmapFormat, BitmapEncoder> = {
  png: encodePngFile,
  gif: encodeGifFile,
  bmp: encodeBmpFile,
  tiff: encodeTiffFile,
};

/** G11 (M23): a bitmap file of these pixels (refused when it is not at least 1 × 1 px). */
export function encodeBitmap(
  format: BitmapFormat,
  image: RgbaImage,
  options: EncodeOptions,
  compression: Compression,
): Promise<Uint8Array> {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    return Promise.reject(
      new EditError(`A picture must be at least 1 × 1 px, not ${width} × ${height}.`),
    );
  if (data.length !== width * height * 4)
    return Promise.reject(new RangeError('The pixels do not fill the picture.'));
  return ENCODERS[format](image, options, compression);
}
