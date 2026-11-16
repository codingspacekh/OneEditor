// M22 step 1 (GB3, GB5, GN2): an adjustment or filter in Graphics mode's app — done on the current
// pixel layer (or its mask while that is edited), kept only inside the selection, one undo step,
// refused on a locked or vector layer; previewed live on a reduced copy of a big layer, the stage
// showing the preview until it is applied or taken away.
import { describe, expect, it } from 'vitest';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import type { Layer } from '../../../src/core/animation/types.ts';
import {
  createBitmap,
  editRegion,
  fillRect,
  pixelAt,
  type Raster,
} from '../../../src/core/graphics/pixels/raster.ts';
import { testApp } from '../../helpers/test-app.ts';

/** Inverts every colour channel (a mask's one channel). */
const invert = (r: Raster): Raster =>
  editRegion(r, { x: 0, y: 0, width: r.width, height: r.height }, (tile) => {
    const step = r.channels;
    for (let i = 0; i < tile.length; i++) if (step === 1 || i % 4 !== 3) tile[i] = 255 - tile[i]!;
    return true;
  });

function setup(size = { width: 100, height: 80 }, extra: Partial<Layer> = {}) {
  const t = testApp();
  const g = t.app.graphics;
  const photo = createLayer('Photo', {
    pixels: {
      bitmap: fillRect(
        createBitmap(size.width, size.height),
        { x: 0, y: 0, ...size },
        [200, 100, 0, 255],
      ),
      x: 0,
      y: 0,
    },
    ...extra,
  });
  const shapes = createLayer('Shapes');
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({ ...d, stage: { ...d.stage, ...size }, layers: [photo, shapes] }),
    }),
    layerId: photo.id,
  }));
  const doc = () => g.store.get().history.present;
  const pixels = () => doc().layers.find((l) => l.id === photo.id)!.pixels!;
  return { ...t, g, doc, pixels, photo, shapes };
}

describe('M22: an operation on the pixels', () => {
  it('is one undo step on the current layer', async () => {
    const s = setup();
    const steps = s.g.store.get().history.past.length;
    expect(await s.g.applyPixelOperation('Invert', invert)).toBe(true);
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([55, 155, 255, 255]);
    expect(s.g.store.get().history.past.length).toBe(steps + 1);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Invert');
    s.g.undo();
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([200, 100, 0, 255]);
  });

  it('is kept only inside the selection', async () => {
    const s = setup();
    s.g.selectRect({ x: 0, y: 0, width: 10, height: 10 }, { antiAlias: false });
    await s.g.applyPixelOperation('Invert', invert);
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([55, 155, 255, 255]);
    expect(pixelAt(s.pixels().bitmap, 50, 50)).toEqual([200, 100, 0, 255]);
  });

  it('works on the layer mask while it is edited', async () => {
    const s = setup({ width: 100, height: 80 });
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    await s.g.applyPixelOperation('Invert', invert);
    // A layer with no mask shows everything (255): inverted, it hides everything.
    expect(pixelAt(s.pixels().mask!, 5, 5)).toBe(0);
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([200, 100, 0, 255]);
  });

  it('is refused on a locked layer and a vector layer, saying why', async () => {
    const locked = setup(undefined, { locked: true });
    expect(await locked.g.applyPixelOperation('Invert', invert)).toBe(false);
    expect(locked.g.store.get().message?.kind).toBe('error');
    const s = setup();
    s.g.selectLayer(s.shapes.id);
    expect(await s.g.applyPixelOperation('Invert', invert)).toBe(false);
    expect(s.g.store.get().message?.text).toMatch(/pixel layer/);
  });

  it('changing nothing is no undo step', async () => {
    const s = setup();
    const steps = s.g.store.get().history.past.length;
    expect(await s.g.applyPixelOperation('Nothing', (r) => r)).toBe(false);
    expect(s.g.store.get().history.past.length).toBe(steps);
  });

  it('an error in the operation is shown and leaves the layer', async () => {
    const s = setup();
    const before = s.pixels().bitmap;
    expect(
      await s.g.applyPixelOperation('Broken', () => {
        throw new Error('nope');
      }),
    ).toBe(false);
    expect(s.pixels().bitmap).toBe(before);
    expect(s.g.store.get().message?.kind).toBe('error');
    expect(s.g.store.get().busy).toBeNull();
  });
});

describe('M22 GN2: the live preview', () => {
  it('shows a small layer at its own size until taken away; the document is untouched', async () => {
    const s = setup();
    const before = s.doc();
    await s.g.previewPixelOperation(invert);
    const shown = s.g.pixelPreview()!;
    expect(shown.layerId).toBe(s.photo.id);
    expect(shown.pixels.scale).toBeUndefined();
    expect(pixelAt(shown.pixels.bitmap, 5, 5)).toEqual([55, 155, 255, 255]);
    expect(s.doc()).toBe(before);
    await s.g.previewPixelOperation(null);
    expect(s.g.pixelPreview()).toBeUndefined();
  });

  it('works on a reduced copy of a big layer, inside the selection, and goes when applied', async () => {
    const s = setup({ width: 2000, height: 1500 });
    s.g.selectRect({ x: 0, y: 0, width: 1000, height: 1500 }, { antiAlias: false });
    let seen = 0;
    await s.g.previewPixelOperation((r, place) => {
      seen = place.scale;
      return invert(r);
    });
    const shown = s.g.pixelPreview()!;
    expect(shown.pixels.scale).toBeGreaterThan(1.5);
    expect(seen).toBe(shown.pixels.scale);
    expect(shown.pixels.bitmap.width * shown.pixels.bitmap.height).toBeLessThanOrEqual(1_000_000);
    const w = shown.pixels.bitmap.width;
    expect(pixelAt(shown.pixels.bitmap, 10, 10)[0]).toBe(55);
    expect(pixelAt(shown.pixels.bitmap, w - 10, 10)[0]).toBe(200);
    await s.g.applyPixelOperation('Invert', invert);
    expect(s.g.pixelPreview()).toBeUndefined();
    expect(pixelAt(s.pixels().bitmap, 1500, 10)[0]).toBe(200);
    expect(pixelAt(s.pixels().bitmap, 500, 10)[0]).toBe(55);
  });

  it('an older preview that answers late is dropped', async () => {
    const s = setup();
    let release: () => void = () => {};
    const slow = s.g.previewPixelOperation(
      (r) => new Promise<Raster>((done) => (release = () => done(invert(r)))),
    );
    await s.g.previewPixelOperation((r) => r);
    release();
    await slow;
    expect(pixelAt(s.g.pixelPreview()!.pixels.bitmap, 5, 5)).toEqual([200, 100, 0, 255]);
  });

  it('a preview on a layer it may not change shows nothing', async () => {
    const s = setup();
    s.g.selectLayer(s.shapes.id);
    await s.g.previewPixelOperation(invert);
    expect(s.g.pixelPreview()).toBeUndefined();
  });
});
