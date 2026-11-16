// M21 step 3 (GB2, G8, G13): what is done with a selection on a pixel layer — its pixels copied
// (or cut) to a new layer, deleted to transparent, faded to a percentage (G13), made the layer's
// mask, and the layer's own pixels selected; the image cropped to the selection (G8, every layer
// moving with it). A layer lies anywhere on the image (its x, y); the selection is image-sized.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createLayer,
  createRect,
} from '../../../../../src/core/animation/factory.ts';
import type { AnimationDoc, PixelContent } from '../../../../../src/core/animation/types.ts';
import { createGraphic } from '../../../../../src/core/graphics/document.ts';
import {
  copySelected,
  cropToSelection,
  fadeSelected,
  layerMaskFromSelection,
  selectionFromLayer,
} from '../../../../../src/core/graphics/pixels/cutout.ts';
import {
  contentBounds,
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import { rectMask } from '../../../../../src/core/graphics/pixels/selection.ts';

/** A 20 × 10 red layer at (5, 5) on a 40 × 30 image. */
const red = (): PixelContent => ({
  bitmap: fillRect(createBitmap(20, 10), { x: 0, y: 0, width: 20, height: 10 }, [255, 0, 0, 255]),
  x: 5,
  y: 5,
});

describe('M21 GB2: copying the selected pixels', () => {
  it('copies just the selected part, at its place on the image', () => {
    const sel = rectMask(40, 30, { x: 0, y: 0, width: 10, height: 8 });
    const copy = copySelected(red(), sel)!;
    expect(copy).toMatchObject({ x: 5, y: 5 });
    expect(copy.bitmap).toMatchObject({ width: 5, height: 3 });
    expect(pixelAt(copy.bitmap, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it('copies a feathered pixel partly see-through', () => {
    const sel = fillRect(createMask(40, 30), { x: 6, y: 6, width: 1, height: 1 }, 102);
    const copy = copySelected(red(), sel)!;
    expect(copy).toMatchObject({ x: 6, y: 6 });
    expect(pixelAt(copy.bitmap, 0, 0)).toEqual([255, 0, 0, 102]);
  });

  it('copies only the part that shows: the selection’s clear part cut off', () => {
    const half: PixelContent = {
      bitmap: fillRect(createBitmap(20, 10), { x: 0, y: 0, width: 10, height: 10 }, [9, 9, 9, 255]),
      x: 0,
      y: 0,
    };
    const copy = copySelected(half, rectMask(20, 10, { x: 5, y: 0, width: 15, height: 10 }))!;
    expect(copy).toMatchObject({ x: 5, y: 0 });
    expect(copy.bitmap).toMatchObject({ width: 5, height: 10 });
  });

  it('has nothing to copy where the layer is transparent or not selected', () => {
    expect(copySelected(red(), rectMask(40, 30, { x: 30, y: 20, width: 5, height: 5 }))).toBeNull();
    const clear = { bitmap: createBitmap(20, 10), x: 5, y: 5 };
    expect(copySelected(clear, rectMask(40, 30, { x: 0, y: 0, width: 40, height: 30 }))).toBeNull();
  });
});

describe('M21 GB2, G13: deleting and fading the selected pixels', () => {
  it('deletes to transparent (Delete), only inside the selection', () => {
    const sel = rectMask(40, 30, { x: 0, y: 0, width: 10, height: 30 });
    const after = fadeSelected(red(), sel, 0);
    expect(pixelAt(after.bitmap, 4, 0)).toEqual([255, 0, 0, 0]);
    expect(pixelAt(after.bitmap, 5, 0)).toEqual([255, 0, 0, 255]);
    expect(contentBounds(after.bitmap)).toEqual({ x: 5, y: 0, width: 15, height: 10 });
  });

  it('G13: fades the selection to a percentage of its opacity', () => {
    const sel = rectMask(40, 30, { x: 0, y: 0, width: 40, height: 30 });
    expect(pixelAt(fadeSelected(red(), sel, 0.4).bitmap, 3, 3)).toEqual([255, 0, 0, 102]);
    // Half selected: halfway to the faded alpha.
    const half = fillRect(createMask(40, 30), { x: 5, y: 5, width: 1, height: 1 }, 128);
    expect(pixelAt(fadeSelected(red(), half, 0).bitmap, 0, 0)[3]).toBe(127);
  });

  it('fades only the selected pixels of a big layer, tile by tile', () => {
    const big: PixelContent = {
      bitmap: fillRect(
        createBitmap(600, 10),
        { x: 0, y: 0, width: 300, height: 10 },
        [0, 0, 255, 255],
      ),
      x: 0,
      y: 0,
    };
    // Two corners selected: the tiles between have nothing selected; the clear right half
    // stays as it is.
    let sel = rectMask(600, 10, { x: 0, y: 0, width: 2, height: 2 });
    sel = fillRect(sel, { x: 590, y: 0, width: 10, height: 10 }, 255);
    const after = fadeSelected(big, sel, 0);
    expect(pixelAt(after.bitmap, 0, 0)[3]).toBe(0);
    expect(pixelAt(after.bitmap, 1, 3)[3]).toBe(255);
    expect(pixelAt(after.bitmap, 299, 0)[3]).toBe(255);
    // Nothing to fade where it is transparent already.
    const clear = { bitmap: createBitmap(10, 10), x: 0, y: 0 };
    expect(fadeSelected(clear, rectMask(10, 10, { x: 0, y: 0, width: 10, height: 10 }), 0)).toBe(
      clear,
    );
  });

  it('leaves the pixels alone when the selection misses the layer', () => {
    const p = red();
    expect(fadeSelected(p, rectMask(40, 30, { x: 30, y: 20, width: 5, height: 5 }), 0)).toBe(p);
  });
});

describe('M21 GB2: layer masks and the layer’s pixels', () => {
  it('makes the selection the layer’s mask, on the layer’s own pixels', () => {
    const sel = rectMask(40, 30, { x: 0, y: 0, width: 10, height: 30 });
    const p = red();
    const masked = layerMaskFromSelection(p, sel);
    expect(masked.mask).toMatchObject({ width: 20, height: 10 });
    expect(contentBounds(masked.mask!)).toEqual({ x: 0, y: 0, width: 5, height: 10 });
    expect(masked.bitmap).toBe(p.bitmap);
  });

  it('selects the layer’s pixels from its alpha, through its mask', () => {
    const p = red();
    const sel = selectionFromLayer(p, 40, 30);
    expect(contentBounds(sel)).toEqual({ x: 5, y: 5, width: 20, height: 10 });
    const masked = {
      ...p,
      mask: fillRect(createMask(20, 10), { x: 0, y: 0, width: 4, height: 2 }, 255),
    };
    expect(contentBounds(selectionFromLayer(masked, 40, 30))).toEqual({
      x: 5,
      y: 5,
      width: 4,
      height: 2,
    });
  });
});

describe('M21 G8: crop the image to the selection', () => {
  it('makes the selection’s bounds the image, every layer moved with it', () => {
    const base = createGraphic({
      name: 'Pearl',
      size: { width: 40, height: 30, units: 'px', dpi: 72 },
      background: '#ffffff',
    });
    const photo = createLayer('Photo', { pixels: red() });
    const shapes = createLayer('Shapes', {
      objects: [createRect({ x: 20, y: 20, width: 5, height: 5 })],
    });
    const doc: AnimationDoc = { ...base, layers: [photo, shapes] };
    const sel = rectMask(40, 30, { x: 2, y: 3, width: 30, height: 20 });
    const out = cropToSelection(doc, sel);
    expect(out.stage).toMatchObject({ width: 30, height: 20 });
    expect(out.layers[0]!.pixels).toMatchObject({ x: 3, y: 2 });
    expect(out.layers[1]!.objects[0]).toMatchObject({ x: 18, y: 17 });
  });

  it('refuses with nothing selected', () => {
    const doc = createAnimation({ name: 'A' });
    expect(() => cropToSelection(doc, createMask(1280, 720))).toThrow('Select');
  });
});
