// M22 step 1 (GB3, GB5): what every adjustment and filter shares — its result kept only inside
// the selection (a feathered edge blends), the tiles it did not change still the very same; and a
// reduced copy of a big layer for a quick live preview (GN2: ≤ 0.5 s on a 12-megapixel photo).
import { describe, expect, it } from 'vitest';
import { reducedCopy, withinSelection } from '../../../../../src/core/graphics/pixels/apply.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Bitmap,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const grey = (w: number, h: number, v: number): Bitmap =>
  fillRect(createBitmap(w, h), { x: 0, y: 0, width: w, height: h }, [v, v, v, 255]);

describe('M22: a result kept inside the selection', () => {
  it('takes the whole result where there is no selection', () => {
    const before = grey(300, 10, 100);
    const after = grey(300, 10, 200);
    expect(withinSelection(before, after, undefined, 0, 0)).toBe(after);
  });

  it('keeps the result only where selected, blending a soft edge, other tiles untouched', () => {
    const before = grey(600, 10, 100);
    const after = grey(600, 10, 200);
    // Selected: x 0–9 fully, x 10 half; the image is the layer's size, the layer at (0, 0).
    let sel = fillRect(createMask(600, 10), { x: 0, y: 0, width: 10, height: 10 }, 255);
    sel = fillRect(sel, { x: 10, y: 0, width: 1, height: 10 }, 128);
    const out = withinSelection(before, after, sel, 0, 0);
    expect(pixelAt(out, 5, 5)).toEqual([200, 200, 200, 255]);
    expect(pixelAt(out, 10, 5)[0]).toBe(150);
    expect(pixelAt(out, 11, 5)).toEqual([100, 100, 100, 255]);
    // Tiles 1 and 2 hold nothing selected: still the very tiles of the layer.
    expect(out.tiles[1]).toBe(before.tiles[1]);
    expect(out.tiles[2]).toBe(before.tiles[2]);
  });

  it('reads the selection where the layer lies on the image', () => {
    const before = grey(10, 10, 0);
    const after = grey(10, 10, 255);
    // The layer at (100, 50): the selection's pixel (102, 53) is the layer's (2, 3).
    const sel = fillRect(createMask(200, 100), { x: 102, y: 53, width: 1, height: 1 }, 255);
    const out = withinSelection(before, after, sel, 100, 50);
    expect(pixelAt(out, 2, 3)[0]).toBe(255);
    expect(pixelAt(out, 3, 3)[0]).toBe(0);
  });

  it('works on a layer mask too (one channel)', () => {
    const before = fillRect(createMask(4, 1), { x: 0, y: 0, width: 4, height: 1 }, 255);
    const after = createMask(4, 1);
    const sel = fillRect(createMask(4, 1), { x: 0, y: 0, width: 2, height: 1 }, 255);
    const out = withinSelection(before, after, sel, 0, 0);
    expect([pixelAt(out, 0, 0), pixelAt(out, 3, 0)]).toEqual([0, 255]);
  });

  it('refuses results of another size', () => {
    expect(() => withinSelection(grey(4, 4, 0), grey(5, 4, 0), undefined, 0, 0)).toThrow();
  });
});

describe('M22 GN2: a reduced copy for the live preview', () => {
  it('leaves a small layer as it is', () => {
    const p = { bitmap: grey(100, 50, 9), x: 3, y: 4 };
    expect(reducedCopy(p, 1_000_000)).toBe(p);
  });

  it('shrinks a big layer to about the pixels asked, saying how many image px each covers', () => {
    const p = { bitmap: grey(4000, 3000, 9), x: 10, y: 20 };
    const r = reducedCopy(p, 1_000_000);
    expect(r.scale).toBeCloseTo(4000 / r.bitmap.width, 5);
    expect(r.bitmap.width * r.bitmap.height).toBeLessThanOrEqual(1_000_000);
    expect(r.bitmap.width * r.bitmap.height).toBeGreaterThan(900_000);
    expect([r.x, r.y]).toEqual([10, 20]);
    expect(pixelAt(r.bitmap, 5, 5)).toEqual([9, 9, 9, 255]);
  });
});
