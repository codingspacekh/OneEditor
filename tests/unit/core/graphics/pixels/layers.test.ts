// M21: finding a pixel layer and changing its pixels, refused where a layer's contents may not
// change (locked, hidden) or the layer holds vectors.
import { describe, expect, it } from 'vitest';
import { createAnimation, createLayer } from '../../../../../src/core/animation/factory.ts';
import {
  changePixels,
  isPixelLayer,
  pixelLayerOf,
} from '../../../../../src/core/graphics/pixels/layers.ts';
import { createBitmap, fillRect } from '../../../../../src/core/graphics/pixels/raster.ts';
import type { AnimationDoc, Layer } from '../../../../../src/core/animation/types.ts';

const bitmap = createBitmap(10, 10);
const photo = createLayer('Photo', { pixels: { bitmap, x: 0, y: 0 } });
const doc = (layers: Layer[]): AnimationDoc => ({ ...createAnimation({ name: 'A' }), layers });

describe('M21: pixel layers', () => {
  it('tells pixel layers from vector ones', () => {
    expect(isPixelLayer(photo)).toBe(true);
    expect(isPixelLayer(createLayer('Shapes'))).toBe(false);
    expect(isPixelLayer(undefined)).toBe(false);
    const vectors = createLayer('Shapes');
    expect(() => pixelLayerOf(doc([vectors]), vectors.id)).toThrow('Choose a pixel layer first.');
    expect(pixelLayerOf(doc([photo]), photo.id)).toBe(photo);
  });

  it('replaces the pixels as one change, or gives the doc back when nothing changes', () => {
    const d = doc([photo]);
    expect(changePixels(d, photo.id, (p) => p)).toBe(d);
    const painted = fillRect(bitmap, { x: 0, y: 0, width: 2, height: 2 }, [1, 2, 3, 255]);
    const after = changePixels(d, photo.id, (p) => ({ ...p, bitmap: painted }));
    expect(after.layers[0]!.pixels!.bitmap).toBe(painted);
    expect(d.layers[0]!.pixels!.bitmap).toBe(bitmap);
  });

  it('refuses on a locked layer', () => {
    const locked = { ...photo, locked: true };
    expect(() => changePixels(doc([locked]), locked.id, (p) => ({ ...p, x: 1 }))).toThrow();
  });
});
