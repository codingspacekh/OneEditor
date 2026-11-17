// M21 (GB4, GB3, D3): what the brush, the paint bucket and the gradient share — a colour laid on
// one pixel of a bitmap (over what is there, as the canvas's source-over) or of a layer mask (its
// grey: black hides, white shows), the eraser taking alpha away, and the selection read for the
// part of the image a tile covers. Pure TypeScript on the tiles' typed arrays, no objects a pixel.
import { readRegion, type Mask, type Rect } from './raster.ts';

/** A colour's grey (Rec. 601), the value it paints on a layer mask. */
export const greyOf = (colour: readonly number[]): number =>
  Math.round(0.299 * colour[0]! + 0.587 * colour[1]! + 0.114 * colour[2]!);

/**
 * Lays `a` (0–1) of the colour on the pixel at byte `k` of a tile: over it (a bitmap, 4 bytes a
 * pixel), or moving a mask's byte towards `grey`; erasing takes `a` of the alpha away (a mask:
 * moves it towards 0). A pixel erased to nothing becomes all zero, so an emptied tile is null.
 */
export function blendPixel(
  tile: Uint8ClampedArray,
  k: number,
  channels: 1 | 4,
  colour: readonly number[],
  grey: number,
  a: number,
  erase: boolean,
): void {
  if (channels === 1) {
    const v = tile[k]!;
    tile[k] = v + ((erase ? 0 : grey) - v) * a;
    return;
  }
  const da = tile[k + 3]! / 255;
  if (erase) {
    const left = da * (1 - a) * 255;
    if (left < 0.5) tile.fill(0, k, k + 4);
    else tile[k + 3] = left;
    return;
  }
  const out = a + da * (1 - a);
  if (out <= 0) return;
  const keep = (da * (1 - a)) / out;
  const put = a / out;
  tile[k] = colour[0]! * put + tile[k]! * keep;
  tile[k + 1] = colour[1]! * put + tile[k + 1]! * keep;
  tile[k + 2] = colour[2]! * put + tile[k + 2]! * keep;
  tile[k + 3] = out * 255;
}

/**
 * The selection's bytes over a tile of a layer placed at (x, y) on the image: null when there is
 * no selection (all of it may be painted).
 */
export function selectionOver(
  selection: Mask | undefined,
  at: Rect,
  x: number,
  y: number,
): Uint8ClampedArray | null {
  if (!selection) return null;
  return readRegion(selection, { x: at.x + x, y: at.y + y, width: at.width, height: at.height });
}

/** Every byte zero. */
export function isEmpty(data: Uint8ClampedArray): boolean {
  for (let i = 0; i < data.length; i++) if (data[i] !== 0) return false;
  return true;
}

/** "#rrggbb" as [r, g, b] (0–255). */
export function rgbOf(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}
