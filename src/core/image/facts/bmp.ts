// GL2 (M23): a BMP's facts — its size (a negative height is a picture stored top row first), dpi
// (pixels a metre), depth and palette, and see-through pixels: a 16- or 32-bit BMP with an alpha
// mask is looked at pixel by pixel; a plain 32-bit one's fourth byte is officially unused, so it
// counts only when some pixels use it.
import { EditError } from '../../model/errors.ts';
import type { Found } from './types.ts';

const DAMAGED = 'This BMP file is damaged.';

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
const i32 = (b: Uint8Array, at: number) => u32(b, at) | 0;

const COMPRESSION: Record<number, string> = {
  0: 'none',
  1: 'RLE (8-bit)',
  2: 'RLE (4-bit)',
  3: 'none',
  4: 'JPEG',
  5: 'PNG',
  6: 'none',
};

/** The alpha of each pixel (as `mask` picks it out): 'used' if any is below full. */
function scanAlpha(
  b: Uint8Array,
  offset: number,
  width: number,
  height: number,
  bits: 16 | 32,
  mask: number,
  plain: boolean,
): Found['seeThrough'] {
  const stride = Math.ceil((width * bits) / 32) * 4;
  if (offset + stride * height > b.length) throw new EditError(DAMAGED);
  let zero = true;
  let below = false;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = offset + y * stride + (x * bits) / 8;
      const a = ((bits === 32 ? u32(b, at) : u16(b, at)) & mask) >>> 0;
      if (a !== 0) zero = false;
      if (a !== mask) below = true;
    }
  // A plain 32-bit BMP whose fourth byte is 0 everywhere does not use it: every pixel is solid.
  if (plain && zero) return 'none';
  return below ? 'used' : 'unused';
}

export function bmpFacts(b: Uint8Array): Found {
  if (b.length < 26) throw new EditError(DAMAGED);
  const offset = u32(b, 10);
  const header = u32(b, 14);
  if (header === 12) {
    // The old OS/2 header: no compression, no resolution.
    const bits = u16(b, 24);
    return {
      width: u16(b, 18),
      height: u16(b, 20),
      depth: bits,
      ...(bits <= 8 ? { palette: 1 << bits } : {}),
      seeThrough: 'none',
      compression: 'none',
    };
  }
  if (header < 40 || b.length < 54) throw new EditError(DAMAGED);
  const width = i32(b, 18);
  const tall = i32(b, 22);
  const height = Math.abs(tall);
  const bits = u16(b, 28);
  const compression = u32(b, 30);
  const ppmX = i32(b, 38);
  const ppmY = i32(b, 42);
  const colours = u32(b, 46);
  if (!(width > 0) || !(height > 0) || ![1, 4, 8, 16, 24, 32].includes(bits))
    throw new EditError(DAMAGED);
  // The alpha mask follows the colour masks: in a V3+ header, or after the header for
  // BI_ALPHABITFIELDS (6).
  const masked = header >= 56 || compression === 6;
  const mask = masked && b.length >= 70 ? u32(b, 66) : 0;
  let seeThrough: Found['seeThrough'] = 'none';
  if ((bits === 16 || bits === 32) && mask !== 0 && [3, 6].includes(compression))
    seeThrough = scanAlpha(b, offset, width, height, bits, mask, false);
  else if (bits === 32 && compression === 0)
    seeThrough = scanAlpha(b, offset, width, height, 32, 0xff000000, true);
  return {
    width,
    height,
    ...(ppmX > 0 && ppmY > 0
      ? { dpi: { x: Math.round(ppmX * 0.0254), y: Math.round(ppmY * 0.0254) } }
      : {}),
    depth: bits,
    ...(bits <= 8 ? { palette: colours || 1 << bits } : {}),
    seeThrough,
    compression: COMPRESSION[compression] ?? `type ${compression}`,
  };
}
