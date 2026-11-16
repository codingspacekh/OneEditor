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
  // Scanline fill: each run of alike pixels on a row is filled at once, and the rows above and
  // below it are searched for runs to fill next.
  const stack: number[] = [sx, sy];
  const alike = (px: number, py: number) => {
    const p = py * width + px;
    return out[p] === 0 && close(data, p * 4, colour, t);
  };
  while (stack.length > 0) {
    const py = stack.pop()!;
    const px0 = stack.pop()!;
    if (!alike(px0, py)) continue;
    let left = px0;
    while (left > 0 && alike(left - 1, py)) left--;
    let right = px0;
    while (right < width - 1 && alike(right + 1, py)) right++;
    out.fill(255, py * width + left, py * width + right + 1);
    for (const ny of [py - 1, py + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (let nx = left; nx <= right; nx++) {
        const ok = alike(nx, ny);
        if (ok && !inRun) stack.push(nx, ny);
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
