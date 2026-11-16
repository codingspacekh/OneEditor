// M21 step 1 (G2, GB1): a pixel layer is drawn where it lies on the image, in the layers' order
// with the vector layers, at its opacity and in its blend mode; its bitmap and layer mask are
// handed to the canvas as they are, named by the layer (the canvas keeps one picture per layer
// and puts into it only the tiles that changed: adapters/canvas/bitmaps.ts).
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createLayer,
  createRect,
} from '../../../../../src/core/animation/factory.ts';
import { drawStage, type StageCanvas } from '../../../../../src/core/animation/draw.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  type Bitmap,
  type Mask,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import type { AnimationDoc, Layer } from '../../../../../src/core/animation/types.ts';

interface Drawn {
  bitmap: Bitmap;
  x: number;
  y: number;
  key: string;
  mask?: Mask;
}

function recorder(canDraw = true) {
  const calls: string[] = [];
  const drawn: Drawn[] = [];
  const target: Record<string, unknown> = {};
  if (canDraw)
    target.drawBitmap = (bitmap: Bitmap, x: number, y: number, key: string, mask?: Mask) => {
      drawn.push({ bitmap, x, y, key, mask });
      calls.push(`drawBitmap(${x},${y},${key})`);
    };
  const ctx = new Proxy(target, {
    get(_t, key: string) {
      if (key in target) return target[key];
      if (['withLayer', 'measureText', 'drawBitmap'].includes(key)) return undefined;
      return (...args: unknown[]) => {
        calls.push(`${key}(${args.map((a) => (typeof a === 'number' ? a : '…')).join(',')})`);
        if (key.startsWith('create')) return { addColorStop: () => {} };
        return undefined;
      };
    },
    set(_t, key: string, value: unknown) {
      target[key] = value;
      calls.push(`${key}=${String(value)}`);
      return true;
    },
  }) as unknown as StageCanvas;
  return { ctx, calls, drawn };
}

function image(layers: Layer[]): AnimationDoc {
  const doc = createAnimation({ name: 'Pearl' });
  return { ...doc, stage: { ...doc.stage, width: 600, height: 400 }, layers };
}

describe('M21 G2 / GB1: pixel layers on the stage', () => {
  const bitmap = fillRect(
    createBitmap(300, 100),
    { x: 0, y: 0, width: 300, height: 100 },
    [255, 0, 0, 255],
  );

  it('draws the bitmap where it lies, named by its layer, after the layers below', () => {
    const below = createLayer('Below', {
      objects: [createRect({ x: 0, y: 0, width: 10, height: 10 })],
    });
    const mask = createMask(300, 100);
    const photo = createLayer('Photo', { pixels: { bitmap, x: 50, y: -20, mask } });
    const { ctx, calls, drawn } = recorder();
    drawStage(ctx, image([below, photo]));
    expect(drawn).toEqual([{ bitmap, x: 50, y: -20, key: photo.id, mask }]);
    expect(calls.findIndex((c) => c.startsWith('fill('))).toBeLessThan(
      calls.findIndex((c) => c.startsWith('drawBitmap')),
    );
  });

  it('leaves out hidden pixel layers', () => {
    const { ctx, drawn } = recorder();
    drawStage(
      ctx,
      image([createLayer('Hidden', { visible: false, pixels: { bitmap, x: 0, y: 0 } })]),
    );
    expect(drawn).toEqual([]);
  });

  it('draws a layer’s opacity and blend mode, then puts the canvas back', () => {
    const { ctx, calls } = recorder();
    const photo = createLayer('Photo', {
      opacity: 0.5,
      blend: 'colour',
      pixels: { bitmap, x: 0, y: 0 },
    });
    drawStage(ctx, image([photo]));
    const at = calls.indexOf(`drawBitmap(0,0,${photo.id})`);
    const before = calls.slice(calls.lastIndexOf('save()', at), at);
    expect(before).toEqual(['save()', 'globalAlpha=0.5', 'globalCompositeOperation=color']);
    expect(calls[at + 1]).toBe('restore()');
  });

  it('draws nothing of the pixels on a canvas that cannot (the HTML player)', () => {
    const { ctx, calls } = recorder(false);
    drawStage(ctx, image([createLayer('Photo', { pixels: { bitmap, x: 0, y: 0 } })]));
    expect(calls.some((c) => c.includes('drawBitmap') || c.startsWith('save'))).toBe(false);
  });
});
