// M22 step 3 (GB5, D8): retouching in Graphics mode's app — the clone stamp's source (Alt-click),
// aligned or not, copying from this layer or every visible layer; the heal brush matching the
// surroundings on pointer up; blur, sharpen and smudge strokes; red eye by a click or a box; each
// one undo step, inside the selection, on the layer's pixels or its mask, refused on a locked,
// hidden or vector layer; and the settings, refused out of range.
import { describe, expect, it } from 'vitest';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import type { Layer } from '../../../src/core/animation/types.ts';
import {
  bitmapFromRGBA,
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Bitmap,
} from '../../../src/core/graphics/pixels/raster.ts';
import { blurSigma, sharpenSigma } from '../../../src/app/animation/retouch.ts';
import { DEFAULT_RETOUCH } from '../../../src/core/graphics/pixels/retouch-options.ts';
import { testApp } from '../../helpers/test-app.ts';

/** Every pixel tells where it is: r = x, g = y, b = 7, opaque (100 × 80). */
function coords(): Bitmap {
  const data = new Uint8ClampedArray(100 * 80 * 4);
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 100; x++) data.set([x, y, 7, 255], (y * 100 + x) * 4);
  return bitmapFromRGBA(100, 80, data);
}

function setup(extra: Partial<Layer> = {}, bitmap: Bitmap = coords()) {
  const t = testApp();
  const g = t.app.graphics;
  const photo = createLayer('Photo', { pixels: { bitmap, x: 0, y: 0 }, ...extra });
  const shapes = createLayer('Shapes');
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, width: 100, height: 80 },
        layers: [photo, shapes],
      }),
    }),
    layerId: photo.id,
  }));
  const doc = () => g.store.get().history.present;
  const pixels = () => doc().layers.find((l) => l.id === photo.id)!.pixels!;
  const steps = () => g.store.get().history.past.length;
  const label = () => g.store.get().history.past.at(-1)!.label;
  const message = () => g.store.get().message?.text;
  return { ...t, g, doc, pixels, steps, label, message, photo, shapes };
}

describe('M22 GB5: the clone stamp in the app', () => {
  it('copies from the source Alt-clicked, shown as painted, one undo step', () => {
    const s = setup();
    s.g.setTool('clone');
    s.g.setRetouchBrush({ size: 6, hardness: 100 });
    s.g.setCloneSource({ x: 20, y: 30 });
    const before = s.steps();
    const stroke = s.g.startRetouch({ x: 60, y: 30 })!;
    stroke.to({ x: 70, y: 30 });
    stroke.hold(100);
    const shown = stroke.shown().layers.find((l) => l.id === s.photo.id)!.pixels!.bitmap;
    expect(pixelAt(shown, 65, 30)).toEqual([25, 30, 7, 255]);
    expect(pixelAt(s.pixels().bitmap, 65, 30)).toEqual([65, 30, 7, 255]);
    expect(stroke.finish()).toBe(true);
    expect(s.steps()).toBe(before + 1);
    expect(s.label()).toBe('Clone stamp');
    expect(pixelAt(s.pixels().bitmap, 70, 30)).toEqual([30, 30, 7, 255]);
    s.g.undo();
    expect(pixelAt(s.pixels().bitmap, 70, 30)).toEqual([70, 30, 7, 255]);
  });

  it('aligned keeps the first stroke’s offset; not aligned starts each stroke at the source', () => {
    const s = setup();
    s.g.setTool('clone');
    s.g.setRetouchBrush({ size: 4, hardness: 100 });
    s.g.setCloneSource({ x: 10, y: 10 });
    s.g.startRetouch({ x: 50, y: 10 })!.finish();
    // Aligned: the next stroke copies from 40 px to its left too.
    s.g.startRetouch({ x: 80, y: 50 })!.finish();
    expect(pixelAt(s.pixels().bitmap, 80, 50)).toEqual([40, 50, 7, 255]);
    expect(s.g.cloneSourceFor({ x: 90, y: 60 })).toEqual({ x: 50, y: 60 });
    // Not aligned: from the source again.
    expect(s.g.setRetouch({ aligned: false })).toBeNull();
    expect(s.g.retouchOptions().offset).toBeUndefined();
    expect(s.g.cloneSourceFor({ x: 90, y: 60 })).toEqual({ x: 10, y: 10 });
    s.g.startRetouch({ x: 80, y: 70 })!.finish();
    expect(pixelAt(s.pixels().bitmap, 80, 70)).toEqual([10, 10, 7, 255]);
    // While painting the source follows the pointer.
    expect(s.g.cloneSourceFor({ x: 81, y: 70 }, true)).toEqual({ x: 11, y: 10 });
    expect(s.g.cloneSourceFor(null)).toEqual({ x: 10, y: 10 });
    // A new source starts the offset again.
    s.g.setRetouch({ aligned: true });
    s.g.setCloneSource({ x: 5.4, y: 5.6 });
    expect(s.g.retouchOptions().source).toEqual({ x: 5, y: 6 });
    expect(s.g.retouchOptions().offset).toBeUndefined();
  });

  it('without a source says to Alt-click first', () => {
    const s = setup();
    s.g.setTool('heal');
    expect(s.g.cloneSourceFor({ x: 1, y: 1 })).toBeNull();
    expect(s.g.startRetouch({ x: 10, y: 10 })).toBeNull();
    expect(s.message()).toMatch(/Alt-click/);
  });

  it('copies from every visible pixel layer as seen when asked', () => {
    const s = setup(
      {},
      fillRect(createBitmap(100, 80), { x: 0, y: 0, width: 100, height: 80 }, [255, 255, 255, 255]),
    );
    const top = createLayer('Red', {
      pixels: {
        bitmap: fillRect(
          createBitmap(20, 20),
          { x: 0, y: 0, width: 20, height: 20 },
          [255, 0, 0, 255],
        ),
        x: 0,
        y: 0,
      },
    });
    s.g.store.update((st) => ({
      ...st,
      history: execute(st.history, {
        label: 'Add',
        apply: (d) => ({ ...d, layers: [d.layers[0]!, top, ...d.layers.slice(1)] }),
      }),
    }));
    s.g.setTool('clone');
    s.g.setRetouchBrush({ size: 4, hardness: 100 });
    s.g.setCloneSource({ x: 10, y: 10 });
    // This layer only: white copied.
    s.g.startRetouch({ x: 60, y: 10 })!.finish();
    expect(pixelAt(s.pixels().bitmap, 60, 10)).toEqual([255, 255, 255, 255]);
    expect(s.g.setRetouch({ sample: 'all' })).toBeNull();
    s.g.setCloneSource({ x: 10, y: 10 });
    s.g.startRetouch({ x: 60, y: 50 })!.finish();
    expect(pixelAt(s.pixels().bitmap, 60, 50)).toEqual([255, 0, 0, 255]);
  });

  it('on the layer mask copies the mask', () => {
    const mask = fillRect(createMask(100, 80), { x: 50, y: 0, width: 50, height: 80 }, 255);
    const s = setup({ pixels: { bitmap: coords(), x: 0, y: 0, mask } });
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    s.g.setTool('clone');
    s.g.setRetouchBrush({ size: 4, hardness: 100 });
    s.g.setRetouch({ sample: 'all' }); // a mask copies its own grey whatever this says
    s.g.setCloneSource({ x: 10, y: 10 });
    expect(s.g.startRetouch({ x: 70, y: 10 })!.finish()).toBe(true);
    expect(pixelAt(s.pixels().mask!, 70, 10)).toBe(0);
    expect(pixelAt(s.pixels().bitmap, 70, 10)).toEqual([70, 10, 7, 255]);
  });
});

describe('M22 GB5: the heal brush in the app', () => {
  it('matches the copy to the light round the stroke on pointer up', () => {
    // Left half grey 80, right half grey 200.
    const b = fillRect(
      fillRect(createBitmap(100, 80), { x: 0, y: 0, width: 50, height: 80 }, [80, 80, 80, 255]),
      { x: 50, y: 0, width: 50, height: 80 },
      [200, 200, 200, 255],
    );
    const s = setup({}, b);
    s.g.setTool('heal');
    s.g.setRetouchBrush({ size: 16, hardness: 50 });
    s.g.setCloneSource({ x: 20, y: 40 });
    const stroke = s.g.startRetouch({ x: 75, y: 30 })!;
    stroke.to({ x: 75, y: 50 });
    // While painted it is the clone: dark.
    const shown = stroke.shown().layers.find((l) => l.id === s.photo.id)!.pixels!.bitmap;
    expect(pixelAt(shown, 75, 40)[0]).toBeLessThan(100);
    expect(stroke.finish()).toBe(true);
    expect(s.label()).toBe('Heal');
    expect(Math.abs(pixelAt(s.pixels().bitmap, 75, 40)[0] - 200)).toBeLessThan(4);
  });

  it('a stroke wholly outside the selection is no undo step', () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, pixelSelection: createMask(100, 80) }));
    s.g.setTool('heal');
    s.g.setCloneSource({ x: 10, y: 10 });
    const before = s.steps();
    expect(s.g.startRetouch({ x: 50, y: 50 })!.finish()).toBe(false);
    expect(s.steps()).toBe(before);
  });
});

describe('M22 GB5: blur, sharpen and smudge in the app', () => {
  /** A vertical edge: black left, white right. */
  const edge = () =>
    fillRect(
      fillRect(createBitmap(100, 80), { x: 0, y: 0, width: 100, height: 80 }, [0, 0, 0, 255]),
      { x: 50, y: 0, width: 50, height: 80 },
      [255, 255, 255, 255],
    );

  it('the blur brush softens an edge where it goes, at its strength', () => {
    const s = setup({}, edge());
    s.g.setTool('blur-brush');
    expect(s.g.setRetouch({ strength: { 'blur-brush': 100 } })).toBeNull();
    s.g.setRetouchBrush({ size: 20, hardness: 100 });
    s.g.startRetouch({ x: 50, y: 20 })!.finish();
    expect(s.label()).toBe('Blur brush');
    const v = pixelAt(s.pixels().bitmap, 50, 20)[0];
    expect(v).toBeGreaterThan(130);
    expect(v).toBeLessThan(255);
    expect(pixelAt(s.pixels().bitmap, 50, 70)[0]).toBe(255);
  });

  it('the sharpen brush makes the edge steeper', () => {
    // A ramp from black at x = 40 to white at x = 60.
    const data = new Uint8ClampedArray(100 * 80 * 4);
    for (let y = 0; y < 80; y++)
      for (let x = 0; x < 100; x++) {
        const v = Math.max(0, Math.min(255, ((x - 40) / 20) * 255));
        data.set([v, v, v, 255], (y * 100 + x) * 4);
      }
    const s = setup({}, bitmapFromRGBA(100, 80, data));
    s.g.setTool('sharpen-brush');
    s.g.setRetouch({ strength: { 'sharpen-brush': 100 } });
    s.g.setRetouchBrush({ size: 40, hardness: 100 });
    s.g.startRetouch({ x: 50, y: 20 })!.finish();
    expect(s.label()).toBe('Sharpen brush');
    expect(pixelAt(s.pixels().bitmap, 41, 20)[0]).toBeLessThan(12); // 12 before
    expect(pixelAt(s.pixels().bitmap, 59, 20)[0]).toBeGreaterThan(243); // 242 before
    expect(Math.abs(pixelAt(s.pixels().bitmap, 50, 20)[0] - 128)).toBeLessThanOrEqual(1);
  });

  it('the smudge brush drags the black into the white', () => {
    const s = setup({}, edge());
    s.g.setTool('smudge');
    s.g.setRetouch({ strength: { smudge: 90 } });
    s.g.setRetouchBrush({ size: 10, hardness: 100 });
    const stroke = s.g.startRetouch({ x: 45, y: 20 })!;
    stroke.to({ x: 65, y: 20 });
    stroke.finish();
    expect(s.label()).toBe('Smudge');
    expect(pixelAt(s.pixels().bitmap, 58, 20)[0]).toBeLessThan(200);
  });

  it('the blur and sharpen radii follow the brush size', () => {
    expect(blurSigma(5)).toBe(1);
    expect(blurSigma(40)).toBe(4);
    expect(blurSigma(2500)).toBe(25);
    expect(sharpenSigma(10)).toBe(1);
    expect(sharpenSigma(60)).toBe(2);
    expect(sharpenSigma(500)).toBe(3);
  });

  it('a tool that is not a retouching brush starts nothing; refused on locked, hidden, vector', () => {
    const s = setup();
    s.g.setTool('paintbrush');
    expect(s.g.startRetouch({ x: 1, y: 1 })).toBeNull();
    s.g.setTool('blur-brush');
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    expect(s.g.startRetouch({ x: 10, y: 10 })).toBeNull();
    expect(s.message()).toBe('Choose a pixel layer first.');
    const locked = setup({ locked: true });
    locked.g.setTool('smudge');
    expect(locked.g.startRetouch({ x: 10, y: 10 })).toBeNull();
    expect(locked.message()).toBe('Photo is locked. Unlock it to change it.');
    const hidden = setup({ visible: false });
    expect(hidden.g.redEyeAt({ x: 10, y: 10 })).toBe(false);
  });
});

describe('M22 GB5: red eye in the app', () => {
  /** Skin with a red pupil of radius 5 at (30, 30). */
  function face(): Bitmap {
    const data = new Uint8ClampedArray(100 * 80 * 4);
    for (let y = 0; y < 80; y++)
      for (let x = 0; x < 100; x++)
        data.set(
          Math.hypot(x + 0.5 - 30, y + 0.5 - 30) < 5 ? [210, 30, 30, 255] : [225, 175, 145, 255],
          (y * 100 + x) * 4,
        );
    return bitmapFromRGBA(100, 80, data);
  }

  it('a click darkens the red pupil, one undo step; the skin stays', () => {
    const s = setup({}, face());
    expect(s.g.redEyeAt({ x: 30, y: 30 })).toBe(true);
    expect(s.label()).toBe('Red eye');
    expect(pixelAt(s.pixels().bitmap, 30, 30)[0]).toBeLessThan(30);
    expect(pixelAt(s.pixels().bitmap, 30, 40)).toEqual([225, 175, 145, 255]);
  });

  it('a box dragged over the eye works on the ellipse in it; a tiny drag is a click', () => {
    const s = setup({}, face());
    s.g.setRetouch({ darken: 100, pupilSize: 4 });
    expect(s.g.redEyeAt({ x: 22, y: 22 }, { x: 38, y: 38 })).toBe(true);
    expect(pixelAt(s.pixels().bitmap, 33, 30)).toEqual([0, 0, 0, 255]);
    const t = setup({}, face());
    t.g.setRetouch({ pupilSize: 4 });
    t.g.redEyeAt({ x: 30, y: 30 }, { x: 31, y: 31 });
    // The 4 px circle only: the pupil's edge still red.
    expect(pixelAt(t.pixels().bitmap, 34, 30)[0]).toBe(210);
  });

  it('says so when there is no red, and is refused on a mask', () => {
    const s = setup();
    expect(s.g.redEyeAt({ x: 30, y: 30 })).toBe(false);
    expect(s.message()).toMatch(/No red pupil/);
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    expect(s.g.redEyeAt({ x: 30, y: 30 })).toBe(false);
    expect(s.message()).toMatch(/not its mask/);
  });
});

describe('M22 GB5: the retouching settings in the app', () => {
  it('start as the defaults and refuse what is out of range, in words', () => {
    const s = setup();
    expect(s.g.retouchOptions()).toEqual(DEFAULT_RETOUCH);
    expect(s.g.setRetouch({ pupilSize: 0 })).toMatch(/2 to 500/);
    expect(s.g.setRetouch({ strength: { smudge: 200 } })).toMatch(/1 to 100/);
    // The clone stamp's brush when no retouching tool is chosen.
    expect(s.g.setRetouchBrush({ size: 0 })).toMatch(/size/);
    expect(s.g.setRetouchBrush({ size: 12 })).toBeNull();
    expect(s.g.retouchOptions().brushes.clone.size).toBe(12);
    s.g.setTool('smudge');
    s.g.setRetouchBrush({ size: 14 });
    expect(s.g.retouchOptions().brushes.smudge.size).toBe(14);
    expect(s.g.setRetouch({ aligned: true })).toBeNull();
  });
});
