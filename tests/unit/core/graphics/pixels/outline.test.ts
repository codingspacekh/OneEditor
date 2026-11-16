// M21 step 3 (GB2): the selection's outline for the marching ants — the edges between selected
// and unselected pixels as SVG path runs (each pixel edge merged into the longest straight run),
// cheap enough to make again whenever the selection changes on a 12-megapixel photo.
import { describe, expect, it } from 'vitest';
import { createMask, fillRect } from '../../../../../src/core/graphics/pixels/raster.ts';
import { maskOutline } from '../../../../../src/core/graphics/pixels/outline.ts';
import { selectAllMask } from '../../../../../src/core/graphics/pixels/selection.ts';

describe('M21 GB2: the selection outline', () => {
  it('outlines a rectangle with four runs', () => {
    const m = fillRect(createMask(10, 10), { x: 2, y: 3, width: 4, height: 2 }, 255);
    const o = maskOutline(m);
    expect(o.runs).toBe(4);
    expect(o.d).toBe('M2 3H6M2 5H6M2 3V5M6 3V5');
  });

  it('has nothing to outline when nothing is selected', () => {
    expect(maskOutline(createMask(5, 5))).toEqual({ d: '', runs: 0 });
  });

  it('outlines along the image’s edge, and a hole inside', () => {
    let m = selectAllMask(6, 6);
    m = fillRect(m, { x: 2, y: 2, width: 2, height: 2 }, 0);
    const o = maskOutline(m);
    expect(o.runs).toBe(8);
    expect(o.d).toContain('M0 0H6');
    expect(o.d).toContain('M2 2H4');
  });

  it('counts a pixel at least half selected as selected (a feathered edge)', () => {
    let m = fillRect(createMask(4, 1), { x: 0, y: 0, width: 1, height: 1 }, 127);
    expect(maskOutline(m).runs).toBe(0);
    m = fillRect(m, { x: 0, y: 0, width: 1, height: 1 }, 128);
    expect(maskOutline(m).runs).toBe(4);
  });

  it('stays quick on a 4128 × 2322 photo with a big selection', () => {
    const m = fillRect(createMask(4128, 2322), { x: 100, y: 100, width: 3900, height: 2100 }, 255);
    const start = performance.now();
    expect(maskOutline(m).runs).toBe(4);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
