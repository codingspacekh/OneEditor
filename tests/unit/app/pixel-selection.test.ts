// M21 step 3 (GB2, G8, G13) in the app: the pixel selection kept beside the document (not saved,
// not an undo step), made by shape, lasso, wand, colour, from shapes and text or from a layer's
// pixels, combined and changed; and what is done with it on the current pixel layer, each one
// undo step, refused on a locked or hidden layer: copy or cut to a new layer, delete, fade, crop
// to it, a layer mask from it. Gate tasks: O/N/19 Pearl (crop, background transparent), O/N/23
// CastleLayer (part removed to transparent), M/25 Tier (cut by the template's piece).
import { afterEach, describe, expect, it } from 'vitest';
import { createHistory } from '../../../src/app/history.ts';
import { createLayer, createRect, createText } from '../../../src/core/animation/factory.ts';
import { setGlyphSource } from '../../../src/core/graphics/glyphs.ts';
import { fakeGlyphSource, fakeWidths } from '../../helpers/fake-glyphs.ts';
import type { Layer, PixelContent } from '../../../src/core/animation/types.ts';
import {
  contentBounds,
  createBitmap,
  fillRect,
  pixelAt,
} from '../../../src/core/graphics/pixels/raster.ts';
import { testApp } from '../../helpers/test-app.ts';

/** A white 100 × 60 photo with a red 20 × 20 square at (40, 20), on the 1280 × 720 image. */
function photo(): PixelContent {
  let bitmap = fillRect(
    createBitmap(100, 60),
    { x: 0, y: 0, width: 100, height: 60 },
    [255, 255, 255, 255],
  );
  bitmap = fillRect(bitmap, { x: 40, y: 20, width: 20, height: 20 }, [255, 0, 0, 255]);
  return { bitmap, x: 10, y: 10 };
}

function setup(extra: Partial<Layer> = {}) {
  const t = testApp();
  const g = t.app.graphics;
  const layer = createLayer('Photo', { pixels: photo(), ...extra });
  const shapes = createLayer('Shapes', {
    objects: [createRect({ x: 50, y: 30, width: 20, height: 20 })],
  });
  g.store.update((s) => ({
    ...s,
    history: createHistory({ ...s.history.present, layers: [layer, shapes] }),
    layerId: layer.id,
  }));
  const doc = () => g.store.get().history.present;
  const sel = () => g.pixelSelection();
  const bounds = () => {
    const m = sel();
    return m ? contentBounds(m) : null;
  };
  const pixels = (id = layer.id) => doc().layers.find((l) => l.id === id)!.pixels!;
  const message = () => g.store.get().message?.text ?? '';
  return { ...t, g, layer, shapes, doc, sel, bounds, pixels, message };
}

afterEach(() => setGlyphSource(null));

describe('M21 GB2: making a selection', () => {
  it('selects a rectangle and an ellipse, beside the document (not an undo step)', () => {
    const s = setup();
    const before = s.doc();
    s.g.selectRect({ x: 10, y: 10, width: 30, height: 20 });
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 30, height: 20 });
    expect(s.doc()).toBe(before);
    s.g.selectEllipse({ x: 0, y: 0, width: 50, height: 50 }, { mode: 'add' });
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    expect(s.g.hasPixelSelection()).toBe(true);
  });

  it('subtracts and intersects; a selection made empty is no selection', () => {
    const s = setup();
    s.g.selectRect({ x: 0, y: 0, width: 100, height: 100 });
    s.g.selectRect({ x: 50, y: 0, width: 50, height: 100 }, { mode: 'subtract' });
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 50, height: 100 });
    s.g.selectRect({ x: 40, y: 0, width: 50, height: 10 }, { mode: 'intersect' });
    expect(s.bounds()).toEqual({ x: 40, y: 0, width: 10, height: 10 });
    s.g.selectRect({ x: 0, y: 0, width: 100, height: 100 }, { mode: 'subtract' });
    expect(s.sel()).toBeUndefined();
  });

  it('feathers a new selection as it is made', () => {
    const s = setup();
    s.g.selectRect({ x: 20, y: 20, width: 40, height: 40 }, { feather: 6 });
    const m = s.sel()!;
    expect(pixelAt(m, 40, 40)).toBe(255);
    expect(pixelAt(m, 20, 40)).toBeGreaterThan(0);
    expect(pixelAt(m, 20, 40)).toBeLessThan(255);
  });

  it('selects a lasso’s polygon', () => {
    const s = setup();
    s.g.selectLasso([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 0, y: 40 },
    ]);
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(pixelAt(s.sel()!, 35, 35)).toBe(0);
  });

  it('the magic wand selects the clicked colour on the layer, at the layer’s place', () => {
    const s = setup();
    s.g.selectByWand({ x: 55, y: 35 }, { tolerance: 10, contiguous: true });
    expect(s.bounds()).toEqual({ x: 50, y: 30, width: 20, height: 20 });
    // The white round it, not the red.
    s.g.selectByWand({ x: 12, y: 12 }, { tolerance: 10, contiguous: true });
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 100, height: 60 });
    expect(pixelAt(s.sel()!, 55, 35)).toBe(0);
  });

  it('the wand can sample another picture (all layers) given to it', () => {
    const s = setup();
    const sample = { bitmap: photo().bitmap, x: 0, y: 0 };
    s.g.selectByWand({ x: 45, y: 25 }, { tolerance: 0, contiguous: false, sample });
    expect(s.bounds()).toEqual({ x: 40, y: 20, width: 20, height: 20 });
  });

  it('colour select: every pixel like the clicked one, soft with fuzziness', () => {
    const s = setup();
    s.g.selectByColour({ x: 55, y: 35 }, { fuzziness: 40 });
    expect(s.bounds()).toEqual({ x: 50, y: 30, width: 20, height: 20 });
    expect(pixelAt(s.sel()!, 55, 35)).toBe(255);
  });

  it('the wand and colour select need a pixel layer', () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    s.g.selectByWand({ x: 55, y: 35 }, { tolerance: 10, contiguous: true });
    expect(s.message()).toMatch(/pixel layer/);
    expect(s.sel()).toBeUndefined();
  });

  it('selects from the selected shape (its area), or says to select one', () => {
    const s = setup();
    expect(s.g.selectFromObjects()).toMatch(/Select the shapes/);
    s.g.select([s.shapes.objects[0]!.id]);
    expect(s.g.selectFromObjects()).toBeNull();
    expect(s.bounds()).toEqual({ x: 50, y: 30, width: 20, height: 20 });
  });

  it('selects from text: its letters, read from the font the first time (M/25 template text)', async () => {
    const s = setup();
    const text = createText('o', { x: 200, y: 100, size: 100 });
    s.g.store.update((st) => ({
      ...st,
      history: createHistory({
        ...st.history.present,
        layers: [
          st.history.present.layers[0]!,
          { ...st.history.present.layers[1]!, objects: [text] },
        ],
      }),
    }));
    s.g.select([text.id]);
    // Without the fonts' outlines (not in the app) it says why.
    expect(s.g.selectFromObjects()).toMatch(/fonts that come with OneEditor/);
    setGlyphSource(fakeGlyphSource(), (t, str) => fakeWidths(t.size)(str));
    expect(s.g.selectFromObjects()).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    const b = s.bounds()!;
    // The letter's outline (a square with a square counter), not the text's box.
    expect(b.width).toBeLessThan(text.width);
    expect(b.x).toBeGreaterThan(text.x);
    const m = s.sel()!;
    expect(pixelAt(m, Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2))).toBe(0);
  });

  it('selects the layer’s pixels (from its alpha), all, none, and inverts', () => {
    const s = setup();
    s.g.selectLayerPixels();
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 100, height: 60 });
    s.g.selectAllPixels();
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    s.g.selectRect({ x: 0, y: 0, width: 1280, height: 360 });
    s.g.invertPixelSelection();
    expect(s.bounds()).toEqual({ x: 0, y: 360, width: 1280, height: 360 });
    s.g.deselectPixels();
    expect(s.sel()).toBeUndefined();
    // Inverting nothing selects everything.
    s.g.invertPixelSelection();
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it('feathers, grows, shrinks and smooths the selection', () => {
    const s = setup();
    s.g.selectRect({ x: 100, y: 100, width: 50, height: 50 });
    s.g.growPixelSelection(5);
    expect(s.bounds()).toEqual({ x: 95, y: 95, width: 60, height: 60 });
    s.g.growPixelSelection(-10);
    expect(s.bounds()).toEqual({ x: 105, y: 105, width: 40, height: 40 });
    s.g.smoothPixelSelection(2);
    expect(pixelAt(s.sel()!, 105, 105)).toBe(0);
    s.g.featherPixelSelection(4);
    expect(pixelAt(s.sel()!, 105, 125)).toBeLessThan(255);
    // With nothing selected they say so.
    s.g.deselectPixels();
    s.g.growPixelSelection(3);
    expect(s.message()).toMatch(/Select part of the image first/);
  });

  it('a selection left from an image of another size is not used', () => {
    const s = setup();
    s.g.selectAllPixels();
    s.g.store.update((st) => ({
      ...st,
      history: createHistory({
        ...st.history.present,
        stage: { ...st.history.present.stage, width: 640 },
      }),
    }));
    expect(s.g.pixelSelection()).toBeUndefined();
  });

  it('the magnetic lasso’s path follows the layer’s edges', () => {
    const s = setup();
    // The red square's left edge is at x 50 on the image.
    const path = s.g.magneticPath({ x: 48, y: 31 }, { x: 48, y: 48 });
    expect(path.length).toBeGreaterThanOrEqual(2);
    for (const p of path.slice(1, -1)) expect(Math.abs(p.x - 50)).toBeLessThanOrEqual(1);
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    expect(s.g.magneticPath({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });
});

describe('M21 GB2, G8, G13: cut-outs on the current pixel layer', () => {
  it('copies the selection to a new layer above (Layer via Copy), one undo step', () => {
    const s = setup();
    s.g.selectRect({ x: 50, y: 30, width: 20, height: 20 });
    s.g.copySelectionToLayer();
    const doc = s.doc();
    expect(doc.layers.map((l) => l.name)).toEqual(['Photo', 'Layer 3', 'Shapes']);
    const added = doc.layers[1]!;
    expect(added.pixels).toMatchObject({ x: 50, y: 30 });
    expect(pixelAt(added.pixels!.bitmap, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(s.g.store.get().layerId).toBe(added.id);
    expect(s.sel()).toBeUndefined();
    // The photo is as it was.
    expect(s.pixels()).toEqual(photo());
    s.g.undo();
    expect(s.doc().layers).toHaveLength(2);
  });

  it('cuts the selection to a new layer (Layer via Cut): gone from the photo', () => {
    const s = setup();
    s.g.selectRect({ x: 50, y: 30, width: 20, height: 20 });
    s.g.cutSelectionToLayer();
    expect(s.doc().layers).toHaveLength(3);
    expect(pixelAt(s.pixels().bitmap, 45, 25)[3]).toBe(0);
    s.g.undo();
    expect(pixelAt(s.pixels().bitmap, 45, 25)[3]).toBe(255);
  });

  it('says so when nothing selected shows on the layer', () => {
    const s = setup();
    s.g.copySelectionToLayer();
    expect(s.message()).toMatch(/Select part of the image first/);
    s.g.selectRect({ x: 600, y: 600, width: 10, height: 10 });
    s.g.copySelectionToLayer();
    expect(s.message()).toMatch(/Nothing selected shows/);
    expect(s.doc().layers).toHaveLength(2);
  });

  it('O/N/23 CastleLayer: deletes the selected pixels to transparent (Remove background)', () => {
    const s = setup();
    s.g.selectByWand({ x: 12, y: 12 }, { tolerance: 10, contiguous: true });
    expect(s.g.deleteSelectedPixels()).toBe(true);
    const p = s.pixels();
    expect(pixelAt(p.bitmap, 0, 0)[3]).toBe(0);
    expect(pixelAt(p.bitmap, 45, 25)).toEqual([255, 0, 0, 255]);
    // The selection stays, to do more with.
    expect(s.sel()).toBeDefined();
    expect(s.g.store.get().history.past.at(-1)?.label).toBe('Delete selected pixels');
  });

  it('Delete without a selection or off a pixel layer does nothing here (false)', () => {
    const s = setup();
    expect(s.g.deleteSelectedPixels()).toBe(false);
    s.g.selectAllPixels();
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    expect(s.g.deleteSelectedPixels()).toBe(false);
  });

  it('is refused on a locked or hidden layer', () => {
    for (const extra of [{ locked: true }, { visible: false }]) {
      const s = setup(extra);
      s.g.selectAllPixels();
      s.g.deleteSelectedPixels();
      expect(s.message()).toMatch(/locked|hidden/);
      expect(s.pixels()).toEqual(photo());
    }
  });

  it('G13: fades the selection to a percentage', () => {
    const s = setup();
    s.g.selectAllPixels();
    s.g.fadePixelSelection(40);
    expect(pixelAt(s.pixels().bitmap, 0, 0)[3]).toBe(102);
    expect(s.g.store.get().history.past.at(-1)?.label).toBe('Fade selection to 40%');
  });

  it('O/N/19 Pearl: crops the image to the selection, every layer with it', () => {
    const s = setup();
    s.g.selectRect({ x: 50, y: 30, width: 20, height: 20 });
    s.g.cropToPixelSelection();
    expect(s.doc().stage).toMatchObject({ width: 20, height: 20 });
    expect(s.pixels()).toMatchObject({ x: -40, y: -20 });
    expect(s.doc().layers[1]!.objects[0]).toMatchObject({ x: 0, y: 0 });
    expect(s.sel()).toBeUndefined();
    s.g.undo();
    expect(s.doc().stage).toMatchObject({ width: 1280, height: 720 });
  });

  it('makes a layer mask from the selection', () => {
    const s = setup();
    s.g.selectRect({ x: 10, y: 10, width: 50, height: 60 });
    s.g.maskFromPixelSelection();
    const mask = s.pixels().mask!;
    expect(mask).toMatchObject({ width: 100, height: 60 });
    expect(contentBounds(mask)).toEqual({ x: 0, y: 0, width: 50, height: 60 });
  });
});
