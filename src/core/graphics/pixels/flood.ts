// M21: the pixels like a clicked one, for the magic wand (GB2), the paint bucket (GB3) and colour
// select (GB2). A pixel is alike when each of its channels, alpha too, is within `tolerance`
// (0–255) of the colour's; contiguous: only those reached through alike pixels, side by side.
import { maskFromBytes, pixelAt, readRegion, type Bitmap, type Mask } from './raster.ts';

export interface FloodOptions {
  /** 0–255: how far each channel may be from the clicked pixel's. */
  tolerance: number;
  /** Only the pixels joined to the clicked one (true), or every alike pixel in the image. */
  contiguous: boolean;
}

const close = (
  data: Uint8ClampedArray,
  i: number,
  colour: readonly number[],
  tolerance: number,
): boolean =>
  Math.abs(data[i]! - colour[0]!) <= tolerance &&
  Math.abs(data[i + 1]! - colour[1]!) <= tolerance &&
  Math.abs(data[i + 2]! - colour[2]!) <= tolerance &&
  Math.abs(data[i + 3]! - colour[3]!) <= tolerance;

/** The pixels alike to the one at (x, y) as a mask (255 selected) of the bitmap's size. */
export function floodMask(bitmap: Bitmap, x: number, y: number, options: FloodOptions): Mask {
  const { width, height } = bitmap;
  const out = new Uint8ClampedArray(width * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return maskFromBytes(width, height, out);
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  const colour = pixelAt(bitmap, sx, sy);
  const data = readRegion(bitmap);
  const t = options.tolerance;
  if (!options.contiguous) {
    for (let p = 0; p < width * height; p++) if (close(data, p * 4, colour, t)) out[p] = 255;
    return maskFromBytes(width, height, out);
  }
  // Which pixels are alike, worked out once in one pass (1: alike, 0: not); then a scanline
  // fill: each run of alike pixels on a row is filled at once, and the rows above and below it
  // are searched for runs to fill next.
  const like = new Uint8Array(width * height);
  const [r, g, b, a] = colour;
  if (t === 0) {
    // Exactly the colour: four bytes compared as one number.
    const words = new Uint32Array(data.buffer, data.byteOffset, like.length);
    const want = words[sy * width + sx]!;
    for (let p = 0; p < like.length; p++) if (words[p] === want) like[p] = 1;
  } else
    for (let p = 0, i = 0; p < like.length; p++, i += 4)
      if (
        Math.abs(data[i]! - r) <= t &&
        Math.abs(data[i + 1]! - g) <= t &&
        Math.abs(data[i + 2]! - b) <= t &&
        Math.abs(data[i + 3]! - a) <= t
      )
        like[p] = 1;
  const stack: number[] = [sy * width + sx];
  while (stack.length > 0) {
    const start = stack.pop()!;
    if (like[start] !== 1) continue;
    const row = start - (start % width);
    let left = start;
    while (left > row && like[left - 1] === 1) left--;
    let right = start;
    while (right < row + width - 1 && like[right + 1] === 1) right++;
    // Filled pixels are marked 2 so they are not taken again.
    like.fill(2, left, right + 1);
    out.fill(255, left, right + 1);
    for (let side = 0; side < 2; side++) {
      const offset = side === 0 ? -width : width;
      const from = left + offset;
      if (from < 0 || from >= like.length) continue;
      let inRun = false;
      for (let q = from; q <= right + offset; q++) {
        const ok = like[q] === 1;
        if (ok && !inRun) stack.push(q);
        inRun = ok;
      }
    }
  }
  return maskFromBytes(width, height, out);
}

/**
 * GB2 colour select: every pixel whose channels are each within `tolerance` of the colour;
 * `soft`: the selection fades from full at the colour to none at the tolerance (fuzziness), as
 * Photoshop's Color Range, so a recolour blends at the edges (sky between leaves).
 */
export function similarMask(
  bitmap: Bitmap,
  colour: readonly number[],
  { tolerance, soft = false }: { tolerance: number; soft?: boolean },
): Mask {
  const { width, height } = bitmap;
  const data = readRegion(bitmap);
  const out = new Uint8ClampedArray(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const far = Math.max(
      Math.abs(data[i]! - colour[0]!),
      Math.abs(data[i + 1]! - colour[1]!),
      Math.abs(data[i + 2]! - colour[2]!),
      Math.abs(data[i + 3]! - (colour[3] ?? 255)),
    );
    if (far > tolerance) continue;
    out[p] = soft && tolerance > 0 ? Math.round(255 * (1 - far / (tolerance + 1))) : 255;
  }
  return maskFromBytes(width, height, out);
}
