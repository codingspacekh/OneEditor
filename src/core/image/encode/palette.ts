// G11, G9, D5 (M23): an image's pixels as palette indices, for a file of 1, 4 or 8 bits a pixel
// (2, 16 or 256 colours). The palette is the image's own colours found by median cut, or evenly
// spaced greys; each pixel takes the nearest entry, dithered (Floyd–Steinberg) or not — the same
// as Image ▸ Reduce colours (core/graphics/pixels/reduce-colours.ts). When see-through parts are
// kept, a pixel less than half opaque becomes the one see-through entry (index 0: a GIF or a
// palette PNG holds a pixel fully see-through or not at all); the others are put on the
// background colour first, so a soft edge looks as it does on it.
import { hexToRgb } from '../../colour.ts';
import { medianCut, paletteIndices } from '../../graphics/pixels/reduce-colours.ts';
import { onBackground, type EncodeOptions, type RgbaImage } from './index.ts';

export interface IndexedImage {
  width: number;
  height: number;
  /** One palette entry a pixel, rows from the top. */
  indices: Uint8Array;
  /** RGB, 3 bytes an entry; at most 2 ** depth entries. */
  palette: Uint8Array;
  /** The see-through entry (0), or -1 when every pixel shows. */
  transparent: number;
  /**
   * The palette is all 2 ** depth evenly spaced greys, darkest first, with no see-through entry:
   * an index is the grey's level (as a greyscale PNG or TIFF keeps it).
   */
  grey: boolean;
}

/** `count` greys from black to white, evenly spaced (one: black). */
export function greys(count: number): Uint8Array {
  const out = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++)
    out[i * 3] =
      out[i * 3 + 1] =
      out[i * 3 + 2] =
        count > 1 ? Math.round((i * 255) / (count - 1)) : 0;
  return out;
}

/** M23: the image as palette indices at `options.depth` (1, 4 or 8 bits). */
export function toIndexed(
  image: RgbaImage,
  options: Pick<EncodeOptions, 'depth' | 'palette' | 'dither' | 'transparent' | 'background'>,
): IndexedImage {
  const { width, height } = image;
  const entries = 2 ** options.depth;
  const flat = onBackground(image, options.background).data;
  let seeThrough = false;
  if (options.transparent) {
    const src = image.data;
    for (let i = 3; i < src.length; i += 4)
      if (src[i]! < 128) {
        flat[i] = 0;
        seeThrough = true;
      }
  }
  const colours = entries - (seeThrough ? 1 : 0);
  let palette: Uint8Array;
  if (options.palette === 'greys') {
    // The brightness the eye sees (ITU-R BT.601), as Reduce colours makes greys.
    for (let i = 0; i < flat.length; i += 4)
      flat[i] =
        flat[i + 1] =
        flat[i + 2] =
          0.299 * flat[i]! + 0.587 * flat[i + 1]! + 0.114 * flat[i + 2]!;
    palette = greys(colours);
  } else {
    palette = medianCut(flat, colours);
    // A picture all see-through still needs a colour.
    if (palette.length === 0) palette = new Uint8Array(3);
  }
  const indices = paletteIndices(flat, width, height, palette, options.dither);
  if (!seeThrough)
    return {
      width,
      height,
      indices,
      palette,
      transparent: -1,
      grey: options.palette === 'greys',
    };
  // Entry 0 is see-through (shown as the background where it is not understood).
  const withClear = new Uint8Array(palette.length + 3);
  const { r, g, b } = hexToRgb(options.background);
  withClear.set([r, g, b], 0);
  withClear.set(palette, 3);
  for (let k = 0; k < indices.length; k++) indices[k] = flat[k * 4 + 3] === 0 ? 0 : indices[k]! + 1;
  return { width, height, indices, palette: withClear, transparent: 0, grey: false };
}

/** Indices packed `bits` to a byte (1, 2, 4 or 8), each row starting a new byte. */
export function packRows(
  indices: Uint8Array,
  width: number,
  height: number,
  bits: number,
): Uint8Array {
  const stride = Math.ceil((width * bits) / 8);
  if (bits === 8) return indices;
  const out = new Uint8Array(stride * height);
  const perByte = 8 / bits;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const at = y * stride;
    for (let x = 0; x < width; x++)
      out[at + Math.floor(x / perByte)]! |= indices[row + x]! << (8 - bits * ((x % perByte) + 1));
  }
  return out;
}
