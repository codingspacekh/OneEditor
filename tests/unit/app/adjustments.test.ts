// M22 step 2 (GB3): the adjustments in Graphics mode's app — done through the one way to apply a
// pixel operation (the current pixel layer or its mask, inside the selection, one undo step,
// through the pixel worker), previewed live and taken away, refused on a mask when they change
// colours; and the colour under a point of the image, for Replace colour's eyedropper.
import { describe, expect, it, vi } from 'vitest';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import { defaultSettings } from '../../../src/core/graphics/pixels/adjust.ts';
import { IN_PROCESS_PIXELS } from '../../../src/core/graphics/pixels/jobs.ts';
import { createBitmap, fillRect, pixelAt } from '../../../src/core/graphics/pixels/raster.ts';
import { testApp } from '../../helpers/test-app.ts';

function setup() {
  const t = testApp();
  const g = t.app.graphics;
  // 100 × 80: red, with a transparent strip down the right.
  const photo = createLayer('Photo', {
    pixels: {
      bitmap: fillRect(
        createBitmap(100, 80),
        { x: 0, y: 0, width: 90, height: 80 },
        [200, 0, 0, 255],
      ),
      x: 10,
      y: 5,
    },
  });
  const shapes = createLayer('Shapes');
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, width: 120, height: 100 },
        layers: [photo, shapes],
      }),
    }),
    layerId: photo.id,
  }));
  const pixels = () => g.store.get().history.present.layers.find((l) => l.id === photo.id)!.pixels!;
  return { ...t, g, pixels, photo, shapes };
}

describe('M22 GB3: an adjustment in the app', () => {
  it('M22 GB3: is one undo step named after it, on the current pixel layer', async () => {
    const s = setup();
    const steps = s.g.store.get().history.past.length;
    expect(await s.g.adjust('invert', {})).toBe(true);
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([55, 255, 255, 255]);
    expect(s.g.store.get().history.past.length).toBe(steps + 1);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Invert');
    s.g.undo();
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([200, 0, 0, 255]);
  });

  it('M22 GB3: runs in the pixel worker', async () => {
    const s = setup();
    // The test app's worker is the page's: the job asked of it is "adjust".
    const spy = vi.spyOn(IN_PROCESS_PIXELS, 'run');
    await s.g.adjust('hueSaturation', { ...defaultSettings('hueSaturation'), hue: 120 });
    expect(spy.mock.calls.some(([job]) => job === 'adjust')).toBe(true);
    spy.mockRestore();
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([0, 200, 0, 255]);
  });

  it('M22 GB3: kept inside the selection', async () => {
    const s = setup();
    // The selection is in image px: the layer starts at (10, 5).
    s.g.selectRect({ x: 10, y: 5, width: 20, height: 20 }, { antiAlias: false });
    await s.g.adjust('greyscale', {});
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([60, 60, 60, 255]);
    expect(pixelAt(s.pixels().bitmap, 50, 50)).toEqual([200, 0, 0, 255]);
  });

  it('M22 GB3: on the layer mask, levels work; the colour adjustments are refused, saying why', async () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    expect(await s.g.adjust('levels', { ...defaultSettings('levels'), outWhite: 100 })).toBe(true);
    expect(pixelAt(s.pixels().mask!, 5, 5)).toBe(100);
    expect(await s.g.adjust('hueSaturation', defaultSettings('hueSaturation'))).toBe(false);
    expect(s.g.store.get().message?.text).toMatch(/Hue \/ saturation.*mask/);
  });

  it('M22 GB3: refused on a vector layer', async () => {
    const s = setup();
    s.g.selectLayer(s.shapes.id);
    expect(await s.g.adjust('invert', {})).toBe(false);
    expect(s.g.store.get().message?.text).toMatch(/pixel layer/);
  });
});

describe('M22 GB3, GN2: the live preview of an adjustment', () => {
  it('M22 GB3: shows on the stage, leaves the document, and goes with null', async () => {
    const s = setup();
    const before = s.g.store.get().history.present;
    await s.g.previewAdjust('threshold', { level: 50 });
    expect(pixelAt(s.g.pixelPreview()!.pixels.bitmap, 5, 5)).toEqual([255, 255, 255, 255]);
    expect(s.g.store.get().history.present).toBe(before);
    await s.g.previewAdjust('threshold', null);
    expect(s.g.pixelPreview()).toBeUndefined();
  });

  it('M22 GB3: a preview refused on a mask shows nothing', async () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    await s.g.previewAdjust('greyscale', {});
    expect(s.g.pixelPreview()).toBeUndefined();
  });

  it('M22 GB3: applying takes the preview away', async () => {
    const s = setup();
    await s.g.previewAdjust('invert', {});
    expect(s.g.pixelPreview()).toBeDefined();
    await s.g.adjust('invert', {});
    expect(s.g.pixelPreview()).toBeUndefined();
  });
});

describe('M22 GB3: the colour under a point (Replace colour’s eyedropper)', () => {
  it('M22 GB3: the current pixel layer’s colour there, as it is in the document', async () => {
    const s = setup();
    expect(s.g.colourUnder({ x: 15.6, y: 9.2 })).toBe('#c80000');
    // The preview does not change what is picked.
    await s.g.previewAdjust('invert', {});
    expect(s.g.colourUnder({ x: 15, y: 9 })).toBe('#c80000');
    // Transparent there, off the layer, or not a pixel layer: nothing.
    expect(s.g.colourUnder({ x: 105, y: 9 })).toBeNull();
    expect(s.g.colourUnder({ x: 2, y: 2 })).toBeNull();
    s.g.selectLayer(s.shapes.id);
    expect(s.g.colourUnder({ x: 15, y: 9 })).toBeNull();
  });
});
