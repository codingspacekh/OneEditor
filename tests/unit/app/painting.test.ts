// M21 step 4 (GB4, GB3, GN2): painting in Graphics mode's app — a stroke previewed as it is
// painted and kept as one undo step on pointer up, in the foreground colour, on the layer's
// pixels or its layer mask, inside the selection; Shift for a straight line from the last point;
// the airbrush held still; the brush settings and presets; the paint bucket and the gradient run
// as pixel jobs (through the PixelWorker port) and kept as one undo step each; refused on a
// locked, hidden or vector layer.
import { describe, expect, it, vi } from 'vitest';
import { createAnimationApp, GRAPHIC_KIND } from '../../../src/app/animation.ts';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import type { Layer } from '../../../src/core/animation/types.ts';
import { IN_PROCESS_PIXELS } from '../../../src/core/graphics/pixels/jobs.ts';
import { BUILT_IN_PRESETS, DEFAULT_PAINT } from '../../../src/core/graphics/pixels/presets.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  sharedBytes,
} from '../../../src/core/graphics/pixels/raster.ts';
import type { PixelWorker } from '../../../src/core/ports.ts';
import { testApp } from '../../helpers/test-app.ts';

const WHITE = [255, 255, 255, 255];

function setup(
  extra: Partial<Layer> = {},
  pixelWorker?: PixelWorker,
  size = { width: 100, height: 80 },
) {
  const t = testApp();
  const g = pixelWorker
    ? createAnimationApp({
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
        pixelWorker,
      })
    : t.app.graphics;
  const photo = createLayer('Photo', {
    pixels: {
      bitmap: fillRect(createBitmap(100, 80), { x: 0, y: 0, width: 100, height: 80 }, WHITE),
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
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, ...size },
        layers: [photo, shapes],
      }),
    }),
    layerId: photo.id,
  }));
  const doc = () => g.store.get().history.present;
  const pixels = () => doc().layers.find((l) => l.id === photo.id)!.pixels!;
  const steps = () => g.store.get().history.past.length;
  return { ...t, g, doc, pixels, steps, photo, shapes };
}

describe('M21 GB4: a stroke in the app', () => {
  it('is shown as it is painted and kept as one undo step when the pointer is let go', () => {
    const s = setup();
    s.g.setTool('paintbrush');
    s.g.setPaintColours({ foreground: '#ff0000' });
    s.g.setBrush({ size: 10, hardness: 100 });
    const before = s.steps();
    const stroke = s.g.startStroke({ x: 10, y: 10 })!;
    stroke.to({ x: 40, y: 10 });
    const shown = stroke.shown();
    const layer = shown.layers.find((l) => l.id === s.photo.id)!;
    expect(pixelAt(layer.pixels!.bitmap, 30, 10)).toEqual([255, 0, 0, 255]);
    // The document itself is not changed until the pointer is let go.
    expect(pixelAt(s.pixels().bitmap, 30, 10)).toEqual(WHITE);
    expect(stroke.finish()).toBe(true);
    expect(s.steps()).toBe(before + 1);
    expect(pixelAt(s.pixels().bitmap, 30, 10)).toEqual([255, 0, 0, 255]);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Paintbrush stroke');
    s.g.undo();
    expect(pixelAt(s.pixels().bitmap, 30, 10)).toEqual(WHITE);
  });

  it('the pencil, the eraser and the airbrush each with their own brush', () => {
    const s = setup();
    s.g.setTool('pencil');
    expect(s.g.paintOptions().brushes.pencil.size).toBe(1);
    const dot = s.g.startStroke({ x: 5.5, y: 5.5 })!;
    dot.finish();
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(s.pixels().bitmap, 6, 5)).toEqual(WHITE);
    s.g.setTool('eraser');
    s.g.setBrush({ size: 4, hardness: 100 });
    s.g.startStroke({ x: 50, y: 50 })!.finish();
    expect(pixelAt(s.pixels().bitmap, 50, 50)[3]).toBe(0);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Eraser stroke');
    s.g.setTool('airbrush');
    const air = s.g.startStroke({ x: 70, y: 40 })!;
    air.to({ x: 70, y: 40 });
    const once = pixelAt(air.shown().layers[0]!.pixels!.bitmap, 70, 40);
    air.hold(400);
    const held = pixelAt(air.shown().layers[0]!.pixels!.bitmap, 70, 40);
    expect(held[0]).toBeLessThan(once[0]);
    air.finish();
  });

  it('a stroke that changes nothing is no undo step', () => {
    const s = setup();
    s.g.setTool('paintbrush');
    s.g.store.update((st) => ({ ...st, pixelSelection: createMask(100, 80) }));
    const before = s.steps();
    expect(s.g.startStroke({ x: 10, y: 10 })!.finish()).toBe(false);
    expect(s.steps()).toBe(before);
  });

  it('Shift draws a straight line from where the last stroke ended', () => {
    const s = setup();
    s.g.setTool('pencil');
    s.g.startStroke({ x: 10.5, y: 20.5 })!.finish();
    s.g.startStroke({ x: 60.5, y: 20.5 }, { straight: true })!.finish();
    for (const x of [10, 30, 45, 60])
      expect(pixelAt(s.pixels().bitmap, x, 20)).toEqual([0, 0, 0, 255]);
    // With no stroke before, a Shift-click is a dot.
    const t = setup();
    t.g.setTool('pencil');
    t.g.startStroke({ x: 60.5, y: 20.5 }, { straight: true })!.finish();
    expect(pixelAt(t.pixels().bitmap, 59, 20)).toEqual(WHITE);
  });

  it('stays inside the selection and keeps every other tile of a big photo', () => {
    const s = setup(
      {
        pixels: {
          bitmap: fillRect(
            createBitmap(1000, 600),
            { x: 0, y: 0, width: 1000, height: 600 },
            WHITE,
          ),
          x: 0,
          y: 0,
        },
      },
      undefined,
      { width: 1000, height: 600 },
    );
    s.g.store.update((st) => ({
      ...st,
      pixelSelection: fillRect(createMask(1000, 600), { x: 0, y: 0, width: 20, height: 600 }, 255),
    }));
    s.g.setTool('paintbrush');
    s.g.setBrush({ size: 10, hardness: 100 });
    const before = s.pixels().bitmap;
    const stroke = s.g.startStroke({ x: 10, y: 10 })!;
    stroke.to({ x: 30, y: 10 });
    stroke.finish();
    const after = s.pixels().bitmap;
    expect(pixelAt(after, 10, 10)[1]).toBe(0);
    expect(pixelAt(after, 25, 10)).toEqual(WHITE);
    // 1000 × 600 px is 4 × 3 tiles: only the one painted is new.
    expect(sharedBytes(before, after)).toBe(1000 * 600 * 4 - 256 * 256 * 4);
  });

  it('a selection made on an image of another size is not used', () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, pixelSelection: createMask(10, 10) }));
    s.g.setTool('pencil');
    s.g.startStroke({ x: 50.5, y: 50.5 })!.finish();
    expect(pixelAt(s.pixels().bitmap, 50, 50)).toEqual([0, 0, 0, 255]);
  });

  it('on the layer mask: black hides; a layer with no mask gets one, all shown elsewhere', () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    s.g.setTool('pencil');
    s.g.setBrush({ size: 2 });
    s.g.startStroke({ x: 50, y: 50 })!.finish();
    const mask = s.pixels().mask!;
    expect(pixelAt(mask, 50, 50)).toBe(0);
    expect(pixelAt(mask, 10, 10)).toBe(255);
    expect(pixelAt(s.pixels().bitmap, 50, 50)).toEqual(WHITE);
    // The eraser on the mask hides too.
    s.g.setTool('eraser');
    s.g.setPaintColours({ foreground: '#ffffff' });
    s.g.setBrush({ size: 2, hardness: 100 });
    s.g.startStroke({ x: 20.5, y: 20.5 })!.finish();
    expect(pixelAt(s.pixels().mask!, 20, 20)).toBeLessThan(60);
  });

  it('paints where the layer is on the image', () => {
    const s = setup({
      pixels: {
        bitmap: fillRect(createBitmap(20, 20), { x: 0, y: 0, width: 20, height: 20 }, WHITE),
        x: 50,
        y: 30,
      },
    });
    s.g.setTool('pencil');
    s.g.startStroke({ x: 55.5, y: 35.5 })!.finish();
    expect(pixelAt(s.pixels().bitmap, 5, 5)).toEqual([0, 0, 0, 255]);
  });

  it('is refused, in words, on a vector, locked or hidden layer', () => {
    const s = setup();
    s.g.setTool('paintbrush');
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    expect(s.g.startStroke({ x: 10, y: 10 })).toBeNull();
    expect(s.g.store.get().message?.text).toBe('Choose a pixel layer first.');
    const locked = setup({ locked: true });
    locked.g.setTool('paintbrush');
    expect(locked.g.startStroke({ x: 10, y: 10 })).toBeNull();
    expect(locked.g.store.get().message?.text).toBe('Photo is locked. Unlock it to change it.');
    const hidden = setup({ visible: false });
    hidden.g.setTool('paintbrush');
    expect(hidden.g.startStroke({ x: 10, y: 10 })).toBeNull();
    // Not a painting tool: nothing.
    s.g.setTool('select');
    expect(s.g.startStroke({ x: 10, y: 10 })).toBeNull();
  });
});

describe('M21 GB4: the settings, colours and presets', () => {
  it('changes a tool’s brush, refusing what is out of range', () => {
    const s = setup();
    s.g.setTool('paintbrush');
    expect(s.g.setBrush({ size: 55 })).toBeNull();
    expect(s.g.paintOptions().brushes.paintbrush.size).toBe(55);
    expect(s.g.paintOptions().brushes.eraser.size).toBe(DEFAULT_PAINT.brushes.eraser.size);
    expect(s.g.setBrush({ hardness: 300 })).toBe('The hardness is 0 to 100 %.');
    expect(s.g.setBrush({ size: 7 }, 'eraser')).toBeNull();
    expect(s.g.paintOptions().brushes.eraser.size).toBe(7);
    // With no brush tool chosen, the paintbrush's.
    s.g.setTool('select');
    expect(s.g.setBrush({ flow: 30 })).toBeNull();
    expect(s.g.paintOptions().brushes.paintbrush.flow).toBe(30);
  });

  it('the foreground and background: set, swapped, reset', () => {
    const s = setup();
    expect(s.g.setPaintColours({ foreground: '#123456', background: '#ABCDEF' })).toBeNull();
    expect(s.g.paintOptions()).toMatchObject({ foreground: '#123456', background: '#abcdef' });
    expect(s.g.setPaintColours({ foreground: 'red' })).toBe('Type a colour such as #F4C8EE.');
    s.g.swapPaintColours();
    expect(s.g.paintOptions()).toMatchObject({ foreground: '#abcdef', background: '#123456' });
    s.g.resetPaintColours();
    expect(s.g.paintOptions()).toMatchObject({ foreground: '#000000', background: '#ffffff' });
  });

  it('a preset chooses its tool and its brush', () => {
    const s = setup();
    s.g.applyBrushPreset(BUILT_IN_PRESETS.find((p) => p.name === 'Pencil 1 px')!);
    expect(s.g.store.get().tool).toBe('pencil');
    expect(s.g.paintOptions().brushes.pencil.size).toBe(1);
    const scatter = BUILT_IN_PRESETS.find((p) => p.brush.shape === 'scatter')!;
    s.g.applyBrushPreset(scatter);
    expect(s.g.store.get().tool).toBe('paintbrush');
    expect(s.g.paintOptions().brushes.paintbrush.shape).toBe('scatter');
  });

  it('the bucket’s and the gradient’s options', () => {
    const s = setup();
    expect(s.g.setBucket({ tolerance: 10, contiguous: false })).toBeNull();
    expect(s.g.paintOptions().bucket).toEqual({ tolerance: 10, contiguous: false, opacity: 100 });
    expect(s.g.setBucket({ tolerance: 300 })).toBe('The tolerance is 0 to 255.');
    expect(s.g.setBucket({ opacity: 0 })).toBe('The opacity is 1 to 100 %.');
    expect(s.g.setGradientTool({ kind: 'radial', opacity: 50 })).toBeNull();
    expect(s.g.paintOptions().gradient).toMatchObject({ kind: 'radial', opacity: 50 });
    expect(s.g.setGradientTool({ opacity: 101 })).toBe('The opacity is 1 to 100 %.');
    expect(s.g.setGradientTool({ stops: [{ at: 50, colour: 'green' }] })).toBe(
      'Type a colour such as #F4C8EE.',
    );
    expect(s.g.setGradientTool({ stops: [{ at: 50, colour: '#00FF00' }] })).toBeNull();
    expect(s.g.paintOptions().gradient.stops).toEqual([{ at: 50, colour: '#00ff00' }]);
  });
});

describe('M21 GB3: the bucket and the gradient in the app', () => {
  it('the bucket fills through the pixel worker as one undo step', async () => {
    const run = vi.fn(IN_PROCESS_PIXELS.run);
    const s = setup({}, { run });
    s.g.setPaintColours({ foreground: '#00ff00' });
    const before = s.steps();
    expect(await s.g.fillAt({ x: 5, y: 5 })).toBe(true);
    expect(run).toHaveBeenCalledWith('bucket', expect.objectContaining({ tolerance: 32 }));
    expect(pixelAt(s.pixels().bitmap, 99, 79)).toEqual([0, 255, 0, 255]);
    expect(s.steps()).toBe(before + 1);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Paint bucket');
    // Filling again with the same colour changes nothing.
    expect(await s.g.fillAt({ x: 5, y: 5 })).toBe(false);
    expect(s.steps()).toBe(before + 1);
  });

  it('the bucket on the layer mask, and refused on a vector layer', async () => {
    const s = setup();
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    expect(await s.g.fillAt({ x: 5, y: 5 })).toBe(true);
    expect(pixelAt(s.pixels().mask!, 5, 5)).toBe(0);
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    expect(await s.g.fillAt({ x: 5, y: 5 })).toBe(false);
    expect(s.g.store.get().message?.text).toBe('Choose a pixel layer first.');
  });

  it('the gradient from the foreground to the background along the line dragged', async () => {
    const s = setup();
    s.g.setPaintColours({ foreground: '#ff0000', background: '#0000ff' });
    expect(await s.g.gradientFill({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);
    expect(pixelAt(s.pixels().bitmap, 0, 40)[0]).toBeGreaterThan(250);
    expect(pixelAt(s.pixels().bitmap, 99, 40)[2]).toBeGreaterThan(250);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Gradient');
    // A click without a drag is refused in words.
    expect(await s.g.gradientFill({ x: 3, y: 3 }, { x: 3, y: 3 })).toBe(false);
    expect(s.g.store.get().message?.text).toBe('Drag a line for the gradient.');
  });

  it('a change to the layer while the job ran is not overwritten', async () => {
    let release: () => void = () => {};
    const slow: PixelWorker = {
      run: (job, input) =>
        new Promise((resolve) => {
          release = () => void IN_PROCESS_PIXELS.run(job, input).then(resolve);
        }),
    };
    const s = setup({}, slow);
    const filling = s.g.fillAt({ x: 5, y: 5 });
    s.g.setTool('pencil');
    s.g.startStroke({ x: 50.5, y: 50.5 })!.finish();
    release();
    expect(await filling).toBe(false);
    expect(s.g.store.get().message?.text).toBe(
      'The layer changed while it was being filled. Fill again.',
    );
  });
});
