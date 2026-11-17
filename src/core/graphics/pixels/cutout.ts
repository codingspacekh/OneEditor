// M21 step 3 (GB2, G8, G13): what is done with the selection on a pixel layer — the selected
// pixels copied out (to a new layer: Layer via Copy / Cut), deleted to transparent (Delete,
// Remove background), faded to a percentage of their opacity (G13 Edit ▸ Fade selection), made
// the layer's mask; the layer's own pixels selected (from its alpha); and the image cropped to
// the selection's bounds (G8 Crop to selection: every layer moves with the image). The selection
// is image-sized; a layer's pixels lie anywhere on the image (its x, y), so the selection is
// first cut to the layer's own rectangle. Pure; the app makes each one undo step.
import type { AnimationDoc, PixelContent } from '../../animation/types.ts';
import { EditError } from '../../model/errors.ts';
import { cropImage } from '../image-size.ts';
import {
  bitmapFromRGBA,
  contentBounds,
  cropRaster,
  editRegion,
  maskFromAlpha,
  readRegion,
  TILE,
  tilesAcross,
  type Mask,
} from './raster.ts';
import { multiplyMasks, placeMask, selectedBounds } from './selection.ts';

/** The selection on the layer's own pixels (its bitmap's size, at its place). */
export const selectionOnLayer = (selection: Mask, p: PixelContent): Mask =>
  cropRaster(selection, { x: p.x, y: p.y, width: p.bitmap.width, height: p.bitmap.height });

/**
 * The selected pixels as a layer's pixels at the same place on the image (a feathered pixel
 * partly see-through), cut to what is not transparent; null when nothing selected shows.
 */
export function copySelected(p: PixelContent, selection: Mask): PixelContent | null {
  const local = selectionOnLayer(selection, p);
  const b = selectedBounds(local);
  if (!b) return null;
  const data = readRegion(p.bitmap, b);
  const keep = readRegion(local, b);
  for (let i = 0; i < keep.length; i++)
    data[i * 4 + 3] = Math.round((data[i * 4 + 3]! * keep[i]!) / 255);
  const bitmap = bitmapFromRGBA(b.width, b.height, data);
  const shows = contentBounds(bitmap);
  if (!shows) return null;
  const sameSize = shows.width === b.width && shows.height === b.height;
  return {
    bitmap: sameSize ? bitmap : cropRaster(bitmap, shows),
    x: p.x + b.x + shows.x,
    y: p.y + b.y + shows.y,
  };
}

/**
 * G13: the selected pixels' opacity times `keep` (0: deleted to transparent, 0.5: half as
 * opaque); a partly selected pixel partly so. The pixels themselves when the selection misses.
 */
export function fadeSelected(p: PixelContent, selection: Mask, keep: number): PixelContent {
  const local = selectionOnLayer(selection, p);
  const b = selectedBounds(local);
  if (!b) return p;
  const lose = 1 - Math.max(0, Math.min(1, keep));
  const across = tilesAcross(local);
  const bitmap = editRegion(p.bitmap, b, (tile, at, part) => {
    const m = local.tiles[(at.y / TILE) * across + at.x / TILE];
    if (!m) return false;
    let changed = false;
    for (let y = part.y - at.y; y < part.y - at.y + part.height; y++)
      for (let x = part.x - at.x; x < part.x - at.x + part.width; x++) {
        const k = y * at.width + x;
        const s = m[k]!;
        if (s === 0) continue;
        const a = tile[k * 4 + 3]!;
        const next = Math.round(a * (1 - (s / 255) * lose));
        if (next !== a) {
          tile[k * 4 + 3] = next;
          changed = true;
        }
      }
    return changed;
  });
  return bitmap === p.bitmap ? p : { ...p, bitmap };
}

/** GB2: the selection as the layer's mask (shown where selected), replacing any mask it had. */
export const layerMaskFromSelection = (p: PixelContent, selection: Mask): PixelContent => ({
  ...p,
  mask: selectionOnLayer(selection, p),
});

/** GB2 Select ▸ Layer pixels: what the layer shows (its alpha, through its mask), image-sized. */
export function selectionFromLayer(p: PixelContent, width: number, height: number): Mask {
  const alpha = maskFromAlpha(p.bitmap);
  return placeMask(p.mask ? multiplyMasks(alpha, p.mask) : alpha, p.x, p.y, width, height);
}

/**
 * G8 Crop to selection: the image becomes the selection's bounds (at least 16 px a side); every
 * layer moves with it, pixel layers by their place (document.canvasAround moves them; their
 * pixels outside the new image are kept, as a picture's are, so the canvas can grow again).
 */
export function cropToSelection(doc: AnimationDoc, selection: Mask): AnimationDoc {
  const b = selectedBounds(selection);
  if (!b) throw new EditError('Select the part of the image to crop to first.');
  // Benchmark G7: the cropped pixels deleted, as every other crop does (a photo kept whole off
  // the canvas was enlarged by Image size afterwards: 112 megapixels for a 3000 × 2250 picture).
  return cropImage(doc, b);
}
