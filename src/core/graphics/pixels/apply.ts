// M22 (GB3, GB5, GN2): what every adjustment and filter shares. Its result is kept only inside the
// selection — a feathered edge blends the result into the pixels as they were, and a tile with
// nothing selected stays the very same (so undo keeps only what changed, GN1). And a big layer's
// reduced copy, for a live preview that keeps up with the sliders: the copy says how many image
// px each of its pixels covers, and the stage draws it at the layer's own size.
import type { PixelContent } from '../../animation/types.ts';
import { resampleBitmap, resampleMask } from './resample.ts';
import { readRegion, tileRect, type Raster } from './raster.ts';
import type { Mask } from './raster.ts';

/**
 * `after` (the result of an operation on `before`, the same size) kept where the selection is:
 * `x`, `y` is where the raster's top-left pixel lies on the image (the selection is the image's
 * size). No selection: the whole result.
 */
export function withinSelection<R extends Raster>(
  before: R,
  after: R,
  selection: Mask | undefined,
  x: number,
  y: number,
): R {
  if (
    after.width !== before.width ||
    after.height !== before.height ||
    after.channels !== before.channels
  )
    throw new RangeError('The result is not the size of the pixels it was made from.');
  if (!selection) return after;
  const c = before.channels;
  let changed = false;
  const tiles = before.tiles.map((old, i) => {
    const now = after.tiles[i] ?? null;
    if (now === old) return old;
    const at = tileRect(before, i);
    const sel = readRegion(selection, {
      x: x + at.x,
      y: y + at.y,
      width: at.width,
      height: at.height,
    });
    let any = false;
    let all = true;
    for (let p = 0; p < sel.length; p++) {
      if (sel[p] !== 0) any = true;
      if (sel[p] !== 255) all = false;
    }
    if (!any) return old;
    changed = true;
    if (all) return now;
    const out = new Uint8ClampedArray(at.width * at.height * c);
    for (let p = 0; p < sel.length; p++) {
      const s = sel[p]! / 255;
      for (let k = p * c; k < p * c + c; k++) {
        const a = old ? old[k]! : 0;
        const b = now ? now[k]! : 0;
        out[k] = a + (b - a) * s;
      }
    }
    return out.some((v) => v !== 0) ? out : null;
  });
  return changed ? ({ ...before, tiles } as R) : before;
}

/**
 * GN2: a layer's pixels reduced to about `maxPixels` (bilinear), for a quick preview; `scale` is
 * how many image px each reduced pixel covers. A layer already that small comes back as it is.
 */
export function reducedCopy(
  content: PixelContent,
  maxPixels: number,
): PixelContent & { scale?: number } {
  const { width, height } = content.bitmap;
  if (width * height <= maxPixels) return content;
  const k = Math.sqrt(maxPixels / (width * height));
  let w = Math.max(1, Math.floor(width * k));
  let h = Math.max(1, Math.floor(height * k));
  while (w * h > maxPixels) w > h ? w-- : h--;
  return {
    bitmap: resampleBitmap(content.bitmap, w, h, 'bilinear'),
    x: content.x,
    y: content.y,
    ...(content.mask ? { mask: resampleMask(content.mask, w, h, 'bilinear') } : {}),
    scale: width / w,
  };
}
