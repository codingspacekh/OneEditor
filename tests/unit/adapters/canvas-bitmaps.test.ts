// M21 step 1 (G2, GB1, GN2): a pixel layer on a browser canvas — one picture per layer, into which
// only the tiles that changed since it was last drawn are put again; a layer mask laid over a copy.
// jsdom has no OffscreenCanvas or ImageData: stand-ins record what is done (the pixels: e2e).
import { describe, expect, it } from 'vitest';
import { createBitmapCache, type PictureCanvas } from '../../../src/adapters/canvas/bitmaps.ts';
import { createBitmap, createMask, fillRect } from '../../../src/core/graphics/pixels/raster.ts';

function fakes() {
  const log: string[] = [];
  let made = 0;
  const makeCanvas = (width: number, height: number): PictureCanvas => {
    const name = `c${++made}`;
    log.push(`${name} ${width}×${height}`);
    const ctx = {
      globalCompositeOperation: 'source-over',
      putImageData: (d: { w: number; h: number; a: number }, x: number, y: number) =>
        log.push(`${name}.put(${d.w}×${d.h} at ${x},${y} alpha ${d.a})`),
      clearRect: (x: number, y: number, w: number, h: number) =>
        log.push(`${name}.clear(${x},${y},${w},${h})`),
      drawImage: (image: PictureCanvas) =>
        log.push(
          `${name}.draw(${(image as unknown as { name: string }).name}) ${ctx.globalCompositeOperation}`,
        ),
      save: () => {},
      restore: () => {},
    };
    return { width, height, name, getContext: () => ctx } as unknown as PictureCanvas;
  };
  const makeImageData = (data: Uint8ClampedArray, w: number, h: number) => ({ w, h, a: data[3] });
  return { log, makeCanvas, makeImageData };
}

const red = (w: number, h: number) =>
  fillRect(createBitmap(w, h), { x: 0, y: 0, width: w, height: h }, [255, 0, 0, 200]);

describe('M21 GN2: one picture per pixel layer, tiles put in as they change', () => {
  it('puts every tile in the first time, then only the tiles that changed', () => {
    const { log, makeCanvas, makeImageData } = fakes();
    const cache = createBitmapCache({ makeCanvas, makeImageData });
    const first = red(300, 10);
    cache.picture(first, 'L1');
    expect(log).toEqual([
      'c1 300×10',
      'c1.put(256×10 at 0,0 alpha 200)',
      'c1.put(44×10 at 256,0 alpha 200)',
    ]);
    log.length = 0;
    // The same bitmap again: nothing to do.
    cache.picture(first, 'L1');
    expect(log).toEqual([]);
    // A stroke in the second tile; then erased to nothing.
    const stroked = fillRect(first, { x: 280, y: 0, width: 2, height: 2 }, [0, 0, 255, 255]);
    cache.picture(stroked, 'L1');
    const erased = fillRect(stroked, { x: 256, y: 0, width: 44, height: 10 }, [0, 0, 0, 0]);
    cache.picture(erased, 'L1');
    // Undo: back to the first bitmap, its second tile put in again.
    cache.picture(first, 'L1');
    expect(log).toEqual([
      'c1.put(44×10 at 256,0 alpha 200)',
      'c1.clear(256,0,44,10)',
      'c1.put(44×10 at 256,0 alpha 200)',
    ]);
  });

  it('makes a new picture when the bitmap changes size', () => {
    const { log, makeCanvas, makeImageData } = fakes();
    const cache = createBitmapCache({ makeCanvas, makeImageData });
    cache.picture(red(10, 10), 'L1');
    cache.picture(red(20, 10), 'L1');
    expect(log.filter((l) => l.includes('×') && !l.includes('put'))).toEqual([
      'c1 10×10',
      'c2 20×10',
    ]);
  });

  it('lays the layer mask over a copy, made again only when either changes', () => {
    const { log, makeCanvas, makeImageData } = fakes();
    const cache = createBitmapCache({ makeCanvas, makeImageData });
    const bitmap = red(10, 10);
    const mask = fillRect(createMask(10, 10), { x: 0, y: 0, width: 5, height: 10 }, 255);
    cache.picture(bitmap, 'L1', mask);
    expect(log).toEqual([
      'c1 10×10',
      'c1.put(10×10 at 0,0 alpha 200)',
      'c2 10×10',
      // The mask's tile as black with its values as alpha.
      'c2.put(10×10 at 0,0 alpha 255)',
      'c3 10×10',
      'c3.draw(c1) copy',
      'c3.draw(c2) destination-in',
    ]);
    log.length = 0;
    cache.picture(bitmap, 'L1', mask);
    expect(log).toEqual([]);
  });

  it('keeps only the most recently drawn layers', () => {
    const { makeCanvas, makeImageData } = fakes();
    const cache = createBitmapCache({ makeCanvas, makeImageData, limit: 2 });
    cache.picture(red(1, 1), 'A');
    cache.picture(red(1, 1), 'B');
    cache.picture(red(2, 1), 'A');
    cache.picture(red(1, 1), 'C');
    expect(cache.keys().sort()).toEqual(['A', 'C']);
  });
});
