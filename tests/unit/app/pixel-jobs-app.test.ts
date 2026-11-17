// M23 step 5 (GN2): on a big image (a megapixel or more) Image size, Reduce colours and the pixel
// transforms run in the pixel worker, so the window is never stalled: the call answers at once
// (a refusal it can know then, or null), "Image size…" shows meanwhile, and the one undo step is
// made when the worker answers — with the same pixels as in the page, the selection moved with
// them and put back by Undo. A change made meanwhile is refused in words; a smaller image, or a
// whole-pixel move of the layer, is done at once as before.
import { describe, expect, it, vi } from 'vitest';
import { createAnimationApp, GRAPHIC_KIND } from '../../../src/app/animation.ts';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import type { Layer } from '../../../src/core/animation/types.ts';
import { resizeImage } from '../../../src/core/graphics/image-size.ts';
import { IN_PROCESS_PIXELS } from '../../../src/core/graphics/pixels/jobs.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  readRegion,
  type Raster,
} from '../../../src/core/graphics/pixels/raster.ts';
import { reduceColours } from '../../../src/core/graphics/pixels/reduce-colours.ts';
import { selectedBounds } from '../../../src/core/graphics/pixels/selection.ts';
import {
  matrixFor,
  pixelsBox,
  transformPixels,
} from '../../../src/core/graphics/pixels/transform.ts';
import type { PixelWorker } from '../../../src/core/ports.ts';
import { testApp } from '../../helpers/test-app.ts';

/** Two rasters' pixels the same (compared as bytes: toEqual is slow on a megapixel). */
const samePixels = (a: Raster, b: Raster) =>
  Buffer.from(readRegion(a).buffer).equals(Buffer.from(readRegion(b).buffer));

const W = 1200;
const H = 900;
const RED = [220, 20, 20, 255];

function setup(extra: Partial<Layer> = {}) {
  const t = testApp();
  const run = vi.fn(IN_PROCESS_PIXELS.run);
  const g = createAnimationApp({
    dialogs: t.dialogs,
    files: {
      read: async () => '',
      write: async () => {},
      remove: async () => {},
      copy: async () => {},
      saveImage: async () => '',
      saveSound: async () => '',
      writeBytes: async () => {},
      readBytes: async () => new Uint8Array(),
    },
    paths: { proxies: '/c', recovery: '/c/r.mve', snapshots: '/c', learn: '/c' },
    engine: t.engine,
    kind: GRAPHIC_KIND,
    pixelWorker: { run: run as PixelWorker['run'] },
  });
  const white = fillRect(
    createBitmap(W, H),
    { x: 0, y: 0, width: W, height: H },
    [255, 255, 255, 255],
  );
  const photo = createLayer('Photo', {
    pixels: { bitmap: fillRect(white, { x: 100, y: 100, width: 50, height: 40 }, RED), x: 0, y: 0 },
    ...extra,
  });
  const selection = fillRect(createMask(W, H), { x: 100, y: 100, width: 50, height: 40 }, 255);
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, width: W, height: H },
        layers: [photo, createLayer('Shapes')],
      }),
    }),
    layerId: photo.id,
  }));
  const doc = () => g.store.get().history.present;
  const pixels = () => doc().layers.find((l) => l.id === photo.id)!.pixels!;
  const steps = () => g.store.get().history.past.length;
  const jobs = () => run.mock.calls.map(([job]) => job);
  const select = () => g.store.update((s) => ({ ...s, pixelSelection: selection }));
  return { g, doc, pixels, steps, jobs, select, selection, photo, run };
}

describe('GN2 (M23): Image size on a big image, in the pixel worker', () => {
  it('GN2 (M23): answers at once, shows it is busy, then one undo step with the same pixels', async () => {
    const s = setup();
    s.select();
    const before = s.doc();
    const size = { width: 600, height: 450, method: 'bicubic' as const };
    expect(s.g.resizeImage(size)).toBeNull();
    // Not done yet: the worker has it.
    expect(s.doc()).toBe(before);
    expect(s.g.store.get().busy).toBe('Image size…');
    await s.g.pixelWork();
    expect(s.g.store.get().busy).toBeNull();
    expect(s.jobs()).toEqual(['resample', 'resample']);
    expect(s.steps()).toBe(2);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Image size');
    expect(s.doc().stage).toMatchObject({ width: 600, height: 450 });
    expect(samePixels(s.pixels().bitmap, resizeImage(before, size).layers[0]!.pixels!.bitmap)).toBe(
      true,
    );
    // The selection went with the picture (its edge soft, bilinear); Undo puts it back.
    const moved = s.g.store.get().pixelSelection!;
    expect([moved.width, moved.height]).toEqual([600, 450]);
    expect([pixelAt(moved, 60, 60), pixelAt(moved, 40, 40), pixelAt(moved, 80, 60)]).toEqual([
      255, 0, 0,
    ]);
    s.g.undo();
    expect(s.g.store.get().pixelSelection).toBe(s.selection);
  });

  it('GN2 (M23): a size that cannot be is refused at once, nothing sent to the worker', async () => {
    const s = setup();
    expect(s.g.resizeImage({ width: 9000, height: 240, method: 'nearest' })).toMatch(/8192/);
    expect(s.g.resizeImage({ width: W, height: H, method: 'nearest' })).toBeNull();
    await s.g.pixelWork();
    expect(s.jobs()).toEqual([]);
    expect(s.steps()).toBe(1);
  });

  it('GN2 (M23): the layer changed meanwhile: refused in words, no step made', async () => {
    const s = setup();
    expect(s.g.resizeImage({ width: 600, height: 450, method: 'bilinear' })).toBeNull();
    // Delete pressed with a selection before the worker answers: the layer is not what it was.
    s.select();
    expect(s.g.deleteSelectedPixels()).toBe(true);
    await s.g.pixelWork();
    expect(s.g.store.get().message?.text).toMatch(/changed while it was being worked on/);
    expect(s.doc().stage.width).toBe(W);
  });

  it('GN2 (M23): a small image is resized at once, in the page', () => {
    const s = setup({
      pixels: { bitmap: createBitmap(100, 80), x: 0, y: 0 },
    });
    expect(s.g.resizeImage({ width: 50, height: 40, method: 'nearest' })).toBeNull();
    expect(s.doc().stage.width).toBe(50);
    expect(s.jobs()).toEqual([]);
  });
});

describe('GN2 (M23): Reduce colours on a big layer, in the pixel worker', () => {
  it('GN2 (M23): one undo step when the worker answers, the same as in the page', async () => {
    const s = setup();
    const before = s.pixels().bitmap;
    expect(s.g.reduceColours({ to: 2, dither: true })).toBeNull();
    expect(s.pixels().bitmap).toBe(before);
    await s.g.pixelWork();
    expect(s.jobs()).toEqual(['reduceColours']);
    expect(samePixels(s.pixels().bitmap, reduceColours(before, { to: 2, dither: true }))).toBe(
      true,
    );
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Reduce to 2 colours');
  });

  it('GN2 (M23): refused at once on a locked layer', async () => {
    const s = setup({ locked: true });
    expect(s.g.reduceColours({ to: 16, dither: false })).toMatch(/locked/i);
    await s.g.pixelWork();
    expect(s.jobs()).toEqual([]);
  });
});

describe('GN2 (M23): transforms of a big layer, in the pixel worker', () => {
  it('GN2 (M23): turned: the same pixels as in the page, one undo step', async () => {
    const s = setup();
    const before = s.pixels();
    expect(s.g.transformPixelLayer({ rotate: 30, method: 'bilinear' })).toBeNull();
    expect(s.pixels()).toBe(before);
    await s.g.pixelWork();
    expect(s.jobs()).toEqual(['transform']);
    const want = transformPixels(before, matrixFor(pixelsBox(before), { rotate: 30 }), 'bilinear');
    expect([s.pixels().x, s.pixels().y]).toEqual([want.x, want.y]);
    expect(samePixels(s.pixels().bitmap, want.bitmap)).toBe(true);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Transform pixels');
  });

  it('GN2 GB2 (M23): the selected pixels flipped: the selection with them, and back on undo', async () => {
    const s = setup();
    s.select();
    s.g.flipPixels('horizontal');
    await s.g.pixelWork();
    expect(s.jobs()).toEqual(['transform']);
    expect(pixelAt(s.pixels().bitmap, 120, 120)).toEqual(RED);
    expect(selectedBounds(s.g.store.get().pixelSelection!)).toEqual({
      x: 100,
      y: 100,
      width: 50,
      height: 40,
    });
    s.g.undo();
    expect(s.g.store.get().pixelSelection).toBe(s.selection);
  });

  it('GN2 (M23): the layer moved by whole px is done at once, its very tiles kept', () => {
    const s = setup();
    const before = s.pixels();
    expect(s.g.movePixelLayer(5, 7)).toBe(true);
    expect(s.jobs()).toEqual([]);
    expect([s.pixels().x, s.pixels().y]).toEqual([5, 7]);
    s.pixels().bitmap.tiles.forEach((t, i) => expect(t).toBe(before.bitmap.tiles[i]));
  });

  it('GN2 (M23): nothing selected shows on the layer: said when the worker answers', async () => {
    const s = setup({
      pixels: { bitmap: createBitmap(W, H), x: 0, y: 0 },
    });
    s.select();
    expect(s.g.transformPixelLayer({ rotate: 10 })).toBeNull();
    await s.g.pixelWork();
    expect(s.g.store.get().message?.text).toMatch(/Nothing selected shows on this layer/);
    expect(s.steps()).toBe(1);
  });

  it('GN2 (M23): refused at once on a hidden layer and for values that cannot be', async () => {
    expect(setup({ visible: false }).g.transformPixelLayer({ rotate: 10 })).toMatch(/hidden/i);
    expect(setup().g.transformPixelLayer({ width: 0 })).toMatch(/more than 0/);
  });
});

describe('GN2 (M23): saving while pixel work is under way', () => {
  it('GN2 (M23): waits for the worker, so the file holds the step being made', async () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, path: '/work/Photo.mveg' }));
    expect(s.g.resizeImage({ width: 600, height: 450, method: 'bilinear' })).toBeNull();
    await s.g.save();
    expect(s.doc().stage).toMatchObject({ width: 600, height: 450 });
    expect(s.g.store.get().saved).toBe(s.doc());
  });
});
