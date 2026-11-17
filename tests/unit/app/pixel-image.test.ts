// M21 GB6, G8: Graphics mode's Image size, Canvas size, crop, trim and Reduce colours — each one
// undo step, the selection resized, shifted or cropped with the image, Reduce colours refused on a
// locked layer or a vector one.
import { describe, expect, it } from 'vitest';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import type { Layer } from '../../../src/core/animation/types.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  readRegion,
} from '../../../src/core/graphics/pixels/raster.ts';
import { testApp } from '../../helpers/test-app.ts';

const RED = [220, 20, 20, 255];

function setup(extra: Partial<Layer> = {}) {
  const t = testApp();
  const g = t.app.graphics;
  const photo = createLayer('Photo', {
    pixels: {
      bitmap: fillRect(
        fillRect(
          createBitmap(100, 80),
          { x: 0, y: 0, width: 100, height: 80 },
          [255, 255, 255, 255],
        ),
        { x: 30, y: 20, width: 40, height: 30 },
        RED,
      ),
      x: 0,
      y: 0,
    },
    ...extra,
  });
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
    pixelSelection: fillRect(createMask(100, 80), { x: 40, y: 30, width: 10, height: 10 }, 255),
  }));
  const doc = () => g.store.get().history.present;
  const sel = () => g.store.get().pixelSelection!;
  return { ...t, g, doc, sel, photo };
}

describe('M21 GB6: Image size in Graphics mode', () => {
  it('M21 GB6: resizes the whole image and the selection with it, as one undo step', () => {
    const s = setup();
    const steps = s.g.store.get().history.past.length;
    expect(s.g.resizeImage({ width: 200, height: 160, method: 'bilinear', dpi: 300 })).toBeNull();
    expect(s.doc().stage).toMatchObject({ width: 200, height: 160 });
    expect(s.doc().graphic?.dpi).toBe(300);
    expect(s.doc().layers[0]!.pixels!.bitmap.width).toBe(200);
    expect([s.sel().width, s.sel().height]).toEqual([200, 160]);
    expect(pixelAt(s.sel(), 90, 70)).toBe(255);
    expect(s.g.store.get().history.past.length).toBe(steps + 1);
    s.g.undo();
    expect(s.doc().stage.width).toBe(100);
  });

  it('M21 GB6: nearest keeps the selection hard; a size that cannot be refused', () => {
    const s = setup();
    expect(s.g.resizeImage({ width: 300, height: 240, method: 'nearest' })).toBeNull();
    expect(new Set(readRegion(s.sel()))).toEqual(new Set([0, 255]));
    expect(s.g.resizeImage({ width: 9000, height: 240, method: 'nearest' })).toMatch(/8192/);
  });

  it('M21 GB6: change only the resolution: the pixels stay', () => {
    const s = setup();
    const bitmap = s.doc().layers[0]!.pixels!.bitmap;
    expect(s.g.setResolution(300)).toBeNull();
    expect(s.doc().graphic?.dpi).toBe(300);
    expect(s.doc().layers[0]!.pixels!.bitmap).toBe(bitmap);
    expect(s.g.setResolution(5)).toMatch(/resolution/);
  });
});

describe('M21 GB6: Canvas size in Graphics mode', () => {
  it('M21 GB6: a bigger canvas round the middle: the picture and the selection move by half', () => {
    const s = setup();
    expect(
      s.g.resizeCanvas({ width: 140, height: 100, anchor: 'centre', background: '#000000' }),
    ).toBeNull();
    expect(s.doc().stage).toMatchObject({ width: 140, height: 100, background: '#000000' });
    expect(s.doc().layers[0]!.pixels).toMatchObject({ x: 20, y: 10 });
    expect([s.sel().width, s.sel().height]).toEqual([140, 100]);
    expect(pixelAt(s.sel(), 60, 40)).toBe(255);
    expect(pixelAt(s.sel(), 40, 30)).toBe(0);
  });
});

describe('M21 G8: crop and trim in Graphics mode', () => {
  it('M21 G8: trim plain edges crops the white round the picture (O/N/19 Pearl)', () => {
    const s = setup();
    expect(s.g.trimCanvas(true)).toBe(true);
    expect(s.doc().stage).toMatchObject({ width: 40, height: 30 });
    expect(s.doc().layers[0]!.pixels!.bitmap.width).toBe(40);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Trim plain edges');
    // The selection, cut with it, is at the same place on the picture.
    expect([s.sel().width, s.sel().height]).toEqual([40, 30]);
    expect(pixelAt(s.sel(), 10, 10)).toBe(255);
  });

  it('M21 G8: crop to content with only transparent edges; nothing drawn: a message', () => {
    const s = setup();
    expect(s.g.trimCanvas(false)).toBe(true);
    expect(s.doc().stage).toMatchObject({ width: 100, height: 80 });
    const empty = setup({ visible: false });
    expect(empty.g.trimCanvas(false)).toBe(false);
    expect(empty.g.store.get().message?.text).toMatch(/nothing drawn/);
  });

  it('M21 G8: crop to a typed box; a box too small is refused with the reason', () => {
    const s = setup();
    expect(s.g.cropToBox({ x: 30, y: 20, width: 40, height: 30 })).toBeNull();
    expect(s.doc().stage).toMatchObject({ width: 40, height: 30 });
    expect(pixelAt(s.doc().layers[0]!.pixels!.bitmap, 0, 0)).toEqual(RED);
  });

  it('M21 G8: Fit to drawing moves pixel layers and drops their pixels off the canvas', () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, layerId: s.doc().layers[1]!.id }));
    s.g.addShape('rect', { x: 10, y: 10, width: 20, height: 20 });
    s.g.select([]);
    s.g.cropCanvas('drawing');
    // B7: the rectangle with its 2 px outline: 9 to 31.
    expect(s.doc().stage).toMatchObject({ width: 22, height: 22 });
    const p = s.doc().layers[0]!.pixels!;
    expect([p.x, p.y, p.bitmap.width, p.bitmap.height]).toEqual([0, 0, 22, 22]);
  });
});

describe('M21 GB6: Reduce colours in Graphics mode', () => {
  it('M21 GB6: reduces the current pixel layer as one undo step', () => {
    const s = setup();
    expect(s.g.reduceColours({ to: 'grey', dither: false })).toBeNull();
    expect(pixelAt(s.doc().layers[0]!.pixels!.bitmap, 35, 25)).toEqual([80, 80, 80, 255]);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Reduce to greyscale');
    expect(s.g.reduceColours({ to: 2, dither: true })).toBeNull();
  });

  it('M21 GB6: refused on a locked layer and on a vector layer', () => {
    const locked = setup({ locked: true });
    expect(locked.g.reduceColours({ to: 16, dither: false })).toMatch(/locked/i);
    const s = setup();
    s.g.store.update((st) => ({ ...st, layerId: s.doc().layers[1]!.id }));
    expect(s.g.reduceColours({ to: 16, dither: false })).toMatch(/pixel layer/);
  });
});
