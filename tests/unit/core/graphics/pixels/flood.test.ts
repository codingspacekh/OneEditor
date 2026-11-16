// M21 (GB2 magic wand, GB3 paint bucket): the pixels like the one clicked — each channel (alpha
// too) within the tolerance of it — that touch it through such pixels (contiguous, 4 neighbours)
// or anywhere in the image; as a mask of the bitmap's size.
import { describe, expect, it } from 'vitest';
import { floodMask, similarMask } from '../../../../../src/core/graphics/pixels/flood.ts';
import {
  bitmapFromRGBA,
  contentBounds,
  createBitmap,
  fillRect,
  pixelAt,
} from '../../../../../src/core/graphics/pixels/raster.ts';

/** 6 × 3: white, with a red column at x 2 splitting it, and a nearly white pixel at (5, 0). */
function picture() {
  let b = fillRect(createBitmap(6, 3), { x: 0, y: 0, width: 6, height: 3 }, [255, 255, 255, 255]);
  b = fillRect(b, { x: 2, y: 0, width: 1, height: 3 }, [255, 0, 0, 255]);
  return fillRect(b, { x: 5, y: 0, width: 1, height: 1 }, [250, 250, 250, 255]);
}

describe('M21 GB2 / GB3: flood select', () => {
  it('selects the touching pixels within the tolerance (contiguous)', () => {
    const m = floodMask(picture(), 0, 0, { tolerance: 0, contiguous: true });
    expect(contentBounds(m)).toEqual({ x: 0, y: 0, width: 2, height: 3 });
    expect(pixelAt(m, 1, 2)).toBe(255);
    expect(pixelAt(m, 3, 0)).toBe(0);
  });

  it('selects every such pixel anywhere when not contiguous', () => {
    const exact = floodMask(picture(), 0, 0, { tolerance: 0, contiguous: false });
    expect([pixelAt(exact, 4, 1), pixelAt(exact, 5, 0), pixelAt(exact, 2, 0)]).toEqual([255, 0, 0]);
    const loose = floodMask(picture(), 0, 0, { tolerance: 5, contiguous: false });
    expect(pixelAt(loose, 5, 0)).toBe(255);
  });

  it('starting outside the bitmap selects nothing', () => {
    const m = floodMask(picture(), 9, 9, { tolerance: 0, contiguous: true });
    expect(contentBounds(m)).toBeNull();
  });

  it('fills a large transparent area quickly (a 12-megapixel layer)', () => {
    const b = createBitmap(4128, 2322);
    const started = performance.now();
    const m = floodMask(b, 10, 10, { tolerance: 0, contiguous: true });
    expect(performance.now() - started).toBeLessThan(3000);
    expect(contentBounds(m)).toEqual({ x: 0, y: 0, width: 4128, height: 2322 });
  });

  it('colour select: every pixel near a colour, its fuzziness fading the edge', () => {
    const data = new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 235, 255, 0, 0, 0, 255]);
    const b = bitmapFromRGBA(3, 1, data);
    const hard = similarMask(b, [0, 0, 255, 255], { tolerance: 30 });
    expect([pixelAt(hard, 0, 0), pixelAt(hard, 1, 0), pixelAt(hard, 2, 0)]).toEqual([255, 255, 0]);
    const soft = similarMask(b, [0, 0, 255, 255], { tolerance: 30, soft: true });
    expect(pixelAt(soft, 0, 0)).toBe(255);
    expect(pixelAt(soft, 1, 0)).toBeGreaterThan(0);
    expect(pixelAt(soft, 1, 0)).toBeLessThan(255);
  });
});
