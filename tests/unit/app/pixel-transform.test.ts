// M21 G3 in the app: the current pixel layer, or the selected pixels on it, moved, scaled, turned,
// flipped and skewed — each one undo step, the selection following the selected pixels, refused
// on a locked or hidden layer, on a vector layer and outside Graphics mode; a drag shown as it
// goes (the lifted pixels on a layer of their own) and kept as one step when let go. Gate tasks:
// O/N/23 (Ocean moved, scaled and flipped into Castle's hole), workbook Task 3.4 (placed, turned).
import { describe, expect, it } from 'vitest';
import { createHistory } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import type { Layer, PixelContent } from '../../../src/core/animation/types.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
} from '../../../src/core/graphics/pixels/raster.ts';
import { selectedBounds } from '../../../src/core/graphics/pixels/selection.ts';
import { testApp } from '../../helpers/test-app.ts';

const RED = [255, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

/** A white 40 × 20 photo with a red 10 × 10 at its top left, placed at (100, 50). */
function photo(): PixelContent {
  const white = fillRect(createBitmap(40, 20), { x: 0, y: 0, width: 40, height: 20 }, WHITE);
  return { bitmap: fillRect(white, { x: 0, y: 0, width: 10, height: 10 }, RED), x: 100, y: 50 };
}

function setup(extra: Partial<Layer> = {}) {
  const t = testApp();
  const g = t.app.graphics;
  const layer = createLayer('Ocean', { pixels: photo(), ...extra });
  const shapes = createLayer('Shapes');
  g.store.update((s) => ({
    ...s,
    history: createHistory({ ...s.history.present, layers: [layer, shapes] }),
    layerId: layer.id,
  }));
  const doc = () => g.store.get().history.present;
  const pixels = () => doc().layers.find((l) => l.id === layer.id)!.pixels!;
  const steps = () => g.store.get().history.past.length;
  const message = () => g.store.get().message?.text ?? '';
  const box = () => {
    const p = pixels();
    return { x: p.x, y: p.y, width: p.bitmap.width, height: p.bitmap.height };
  };
  return { ...t, g, layer, shapes, doc, pixels, steps, message, box };
}

describe('M21 G3: transforming a pixel layer in the app', () => {
  it('M21 G3: moves the layer by whole px as one undo step, keeping its very pixels', () => {
    const s = setup();
    const before = s.pixels().bitmap;
    expect(s.g.movePixelLayer(-30, 12.4)).toBe(true);
    expect(s.box()).toEqual({ x: 70, y: 62, width: 40, height: 20 });
    expect(s.pixels().bitmap).toBe(before);
    expect(s.steps()).toBe(1);
    expect(s.g.store.get().history.past[0]!.label).toBe('Move pixels');
    s.g.undo();
    expect(s.box().x).toBe(100);
  });

  it('M21 G3: typed values: the reference point at an X / Y, a size kept in proportion', () => {
    const s = setup();
    expect(s.g.pixelTransformBox()).toEqual({ x: 100, y: 50, width: 40, height: 20 });
    // "Bottom edge at Y = 300": reference bottom.
    expect(s.g.transformPixelLayer({ reference: 'bottom', y: 300 })).toBeNull();
    expect(s.box()).toEqual({ x: 100, y: 280, width: 40, height: 20 });
    expect(
      s.g.transformPixelLayer({
        reference: 'top-left',
        width: 80,
        keepProportions: true,
        method: 'nearest',
      }),
    ).toBeNull();
    expect(s.box()).toEqual({ x: 100, y: 280, width: 80, height: 40 });
    expect(pixelAt(s.pixels().bitmap, 19, 19)).toEqual(RED);
    expect(pixelAt(s.pixels().bitmap, 20, 20)).toEqual(WHITE);
    expect(s.steps()).toBe(2);
    expect(s.g.transformPixelLayer({ width: 0 })).toMatch(/more than 0 px/);
    expect(s.g.transformPixelLayer({ skewY: 89 })).toMatch(/skew/);
    expect(s.steps()).toBe(2);
    // Nothing typed changes nothing: no undo step.
    expect(s.g.transformPixelLayer({})).toBeNull();
    expect(s.steps()).toBe(2);
  });

  it('M21 G3: flips in place and turns a quarter exactly; any angle resampled', () => {
    const s = setup();
    s.g.flipPixels('horizontal');
    expect(s.box()).toEqual({ x: 100, y: 50, width: 40, height: 20 });
    expect(pixelAt(s.pixels().bitmap, 39, 0)).toEqual(RED);
    s.g.flipPixels('vertical');
    expect(pixelAt(s.pixels().bitmap, 39, 19)).toEqual(RED);
    expect(s.g.store.get().history.past.map((p) => p.label)).toEqual([
      'Flip horizontal',
      'Flip vertical',
    ]);
    s.g.rotatePixels(90);
    // Turned about its centre (120, 60): 20 × 40.
    expect(s.box()).toEqual({ x: 110, y: 40, width: 20, height: 40 });
    expect(pixelAt(s.pixels().bitmap, 0, 39)).toEqual(RED);
    s.g.rotatePixels(45, 'bilinear');
    // 60 / √2 = 42.4 px across, centred on 120: 98.8 to 141.2, rounded out.
    expect(s.box()).toMatchObject({ x: 98, width: 44 });
    expect(s.steps()).toBe(4);
  });

  it('M21 G3: with pixels selected only they move, and the selection follows', () => {
    const s = setup();
    s.g.selectRect({ x: 100, y: 50, width: 10, height: 10 });
    expect(s.g.pixelTransformBox()).toEqual({ x: 100, y: 50, width: 10, height: 10 });
    s.g.movePixelLayer(20, 5);
    expect(s.box()).toEqual({ x: 100, y: 50, width: 40, height: 20 });
    expect(pixelAt(s.pixels().bitmap, 0, 0)[3]).toBe(0);
    expect(pixelAt(s.pixels().bitmap, 25, 10)).toEqual(RED);
    expect(selectedBounds(s.g.pixelSelection()!)).toEqual({ x: 120, y: 55, width: 10, height: 10 });
    expect(s.g.store.get().history.past[0]!.label).toBe('Move pixels (selected pixels)');
    // Flipped where they are now.
    s.g.flipPixels('vertical');
    expect(selectedBounds(s.g.pixelSelection()!)).toEqual({ x: 120, y: 55, width: 10, height: 10 });
    expect(s.steps()).toBe(2);
  });

  it('M21 G3: refused on a locked or hidden layer, a vector layer and outside Graphics mode', () => {
    const locked = setup({ locked: true });
    expect(locked.g.movePixelLayer(1, 0)).toBe(false);
    expect(locked.message()).toMatch(/locked/);
    const hidden = setup({ visible: false });
    expect(hidden.g.transformPixelLayer({ rotate: 10 })).toMatch(/hidden/);
    hidden.g.rotatePixels(10);
    expect(hidden.message()).toMatch(/hidden/);
    const vector = setup();
    vector.g.store.update((st) => ({ ...st, layerId: vector.shapes.id }));
    expect(vector.g.pixelTransformBox()).toBeNull();
    vector.g.flipPixels('horizontal');
    expect(vector.message()).toBe('Choose a pixel layer first.');
    const t = testApp();
    expect(t.app.animation.movePixelLayer(1, 1)).toBe(false);
    expect(t.app.animation.store.get().message?.text).toBe('Pixel layers are for Graphics mode.');
    expect(t.app.animation.startPixelMove()).toBeNull();
  });

  it('M21 G3: a selection on another image size is stale: the whole layer moves', () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, pixelSelection: createMask(10, 10) }));
    s.g.movePixelLayer(5, 0);
    expect(s.box().x).toBe(105);
  });
});

describe('M21 G3: dragging a pixel layer', () => {
  it('M21 G3: the layer shown where it goes, then one undo step when let go', () => {
    const s = setup();
    const move = s.g.startPixelMove()!;
    const shown = move.shown(10.4, -5);
    expect(shown.layers[0]!.pixels).toMatchObject({ x: 110, y: 45 });
    expect(s.steps()).toBe(0);
    expect(move.finish(0, 0)).toBe(false);
    expect(move.finish(10.4, -5)).toBe(true);
    expect(s.box()).toMatchObject({ x: 110, y: 45 });
    expect(s.steps()).toBe(1);
  });

  it('M21 G3: selected pixels lifted onto a layer of their own while they move', () => {
    const s = setup();
    s.g.selectRect({ x: 100, y: 50, width: 10, height: 10 });
    const move = s.g.startPixelMove()!;
    const shown = move.shown(20, 0);
    expect(shown.layers).toHaveLength(3);
    expect(shown.layers[1]!.id).toBe(`${s.layer.id}:moving`);
    expect(shown.layers[1]!.pixels).toMatchObject({ x: 120, y: 50 });
    expect(pixelAt(shown.layers[0]!.pixels!.bitmap, 0, 0)[3]).toBe(0);
    expect(move.finish(20, 0)).toBe(true);
    expect(s.doc().layers).toHaveLength(2);
    expect(pixelAt(s.pixels().bitmap, 20, 0)).toEqual(RED);
  });

  it('M21 G3: no drag on a locked layer or where the selection shows nothing', () => {
    const locked = setup({ locked: true });
    expect(locked.g.startPixelMove()).toBeNull();
    expect(locked.message()).toMatch(/locked/);
    const s = setup();
    s.g.selectRect({ x: 600, y: 400, width: 10, height: 10 });
    expect(s.g.startPixelMove()).toBeNull();
    expect(s.message()).toMatch(/Nothing selected/);
    const vector = setup();
    vector.g.store.update((st) => ({ ...st, layerId: vector.shapes.id }));
    expect(vector.g.startPixelMove()).toBeNull();
  });
});
