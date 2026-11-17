// M23 step 5 (GB2, M21 follow-up): Undo puts the pixel selection back. The selection is kept
// beside the document (not saved, not an undo step of its own), but an edit that moved it with the
// picture — Image size, Canvas size, crop, the selected pixels transformed, cut or copied to a new
// layer — has it back as it was when that edit is undone, and as the edit left it when redone.
// An edit that did not touch it (a stroke, Delete) leaves whatever selection there is now.
import { describe, expect, it } from 'vitest';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Mask,
} from '../../../src/core/graphics/pixels/raster.ts';
import { selectedBounds } from '../../../src/core/graphics/pixels/selection.ts';
import { testApp } from '../../helpers/test-app.ts';

function setup() {
  const t = testApp();
  const g = t.app.graphics;
  const photo = createLayer('Photo', {
    pixels: {
      bitmap: fillRect(
        createBitmap(100, 80),
        { x: 0, y: 0, width: 100, height: 80 },
        [200, 100, 50, 255],
      ),
      x: 0,
      y: 0,
    },
  });
  const selection = fillRect(createMask(100, 80), { x: 40, y: 30, width: 10, height: 10 }, 255);
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, width: 100, height: 80 },
        layers: [photo, createLayer('Shapes')],
      }),
    }),
    layerId: photo.id,
    pixelSelection: selection,
  }));
  const sel = (): Mask | undefined => g.store.get().pixelSelection;
  const bounds = () => (sel() ? selectedBounds(sel()!) : null);
  return { ...t, g, selection, sel, bounds, photo };
}

describe('GB2 (M23): undo puts the pixel selection back', () => {
  it('GB2 (M23): Image size: undone, the selection is the old size again; redone, resized', () => {
    const s = setup();
    expect(s.g.resizeImage({ width: 200, height: 160, method: 'nearest' })).toBeNull();
    expect(s.bounds()).toEqual({ x: 80, y: 60, width: 20, height: 20 });
    s.g.undo();
    expect(s.g.store.get().history.present.stage.width).toBe(100);
    expect(s.sel()).toBe(s.selection);
    s.g.redo();
    expect(s.bounds()).toEqual({ x: 80, y: 60, width: 20, height: 20 });
    expect([s.sel()!.width, s.sel()!.height]).toEqual([200, 160]);
  });

  it('GB2 (M23): Canvas size and Crop to selection: the selection as it was before each', () => {
    const s = setup();
    expect(s.g.resizeCanvas({ width: 120, height: 80, anchor: 'right' })).toBeNull();
    expect(s.bounds()).toEqual({ x: 60, y: 30, width: 10, height: 10 });
    s.g.cropToPixelSelection();
    expect(s.sel()).toBeUndefined();
    expect(s.g.store.get().history.present.stage.width).toBeLessThan(120);
    s.g.undo();
    expect(s.bounds()).toEqual({ x: 60, y: 30, width: 10, height: 10 });
    s.g.undo();
    expect(s.sel()).toBe(s.selection);
    s.g.redo();
    s.g.redo();
    expect(s.sel()).toBeUndefined();
  });

  it('GB2 G3 (M23): the selected pixels moved: undone, the selection is where it was', () => {
    const s = setup();
    expect(s.g.transformPixelLayer({ x: 10, y: 5, reference: 'top-left' })).toBeNull();
    expect(s.bounds()).toEqual({ x: 10, y: 5, width: 10, height: 10 });
    s.g.undo();
    expect(s.sel()).toBe(s.selection);
    s.g.redo();
    expect(s.bounds()).toEqual({ x: 10, y: 5, width: 10, height: 10 });
  });

  it('GB2 (M23): Layer via Cut drops the selection; undone, it is back', () => {
    const s = setup();
    s.g.cutSelectionToLayer();
    expect(s.sel()).toBeUndefined();
    s.g.undo();
    expect(s.sel()).toBe(s.selection);
    const layer = s.g.store.get().history.present.layers[0]!;
    expect(pixelAt(layer.pixels!.bitmap, 45, 35)).toEqual([200, 100, 50, 255]);
  });

  it('GB2 (M23): an edit that leaves the selection alone leaves the one made since on undo', () => {
    const s = setup();
    s.g.fadePixelSelection(50);
    s.g.selectRect({ x: 0, y: 0, width: 5, height: 5 });
    const since = s.sel();
    s.g.undo();
    expect(s.sel()).toBe(since);
  });

  it('GB2 (M23): an edit undone and another done instead: undoing that one keeps the selection', () => {
    const s = setup();
    expect(s.g.resizeImage({ width: 200, height: 160, method: 'nearest' })).toBeNull();
    s.g.undo();
    expect(s.sel()).toBe(s.selection);
    // From the same picture, an edit that does not move the selection; then a new selection.
    s.g.fadePixelSelection(50);
    s.g.selectRect({ x: 0, y: 0, width: 5, height: 5 });
    const since = s.sel();
    s.g.undo();
    expect(s.sel()).toBe(since);
    // Nothing more to undo or redo past the start: the selection stays.
    s.g.redo();
    s.g.redo();
    expect(s.sel()).toBe(since);
  });
});
