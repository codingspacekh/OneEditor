// M21 step 4 (GB4): the brush engine's known answers — a 1 px pencil sets one pixel, a hard round
// dab covers πr², a soft dab is full at its centre and nothing at its edge, the opacity caps a
// whole stroke however its dabs overlap, painting stays inside the selection (weighted by it) and
// the layer's place, the eraser, the mask, square and star shapes, scatter (seeded), spacing, pen
// pressure and the airbrush building up while held still.
import { describe, expect, it } from 'vitest';
import {
  BRUSH_SHAPES,
  DEFAULT_BRUSH,
  checkBrush,
  createStroke,
  dabValue,
  type BrushSettings,
  type StrokeOptions,
} from '../../../../../src/core/graphics/pixels/brush.ts';
import {
  bitmapFromRGBA,
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  readRegion,
  sharedBytes,
  type Bitmap,
  type Mask,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const brush = (change: Partial<BrushSettings> = {}): BrushSettings => ({
  ...DEFAULT_BRUSH,
  hardness: 100,
  opacity: 100,
  flow: 100,
  spacing: 25,
  ...change,
});
const RED = [255, 0, 0] as const;
const stroke = (target: Bitmap | Mask, change: Partial<StrokeOptions> = {}) =>
  ({ target, x: 0, y: 0, brush: brush(), colour: RED, ...change }) as StrokeOptions;

/** How many pixels have alpha above 0, and the sum of the alphas / 255. */
function cover(b: Bitmap): { count: number; area: number } {
  const data = readRegion(b);
  let count = 0;
  let area = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 0) count++;
    area += data[i]! / 255;
  }
  return { count, area };
}

describe('M21 GB4: the pencil', () => {
  it('a 1 px pencil sets exactly the one pixel under the pointer, exactly the colour', () => {
    const s = createStroke(
      stroke(createBitmap(20, 20), { brush: brush({ size: 1 }), aliased: true }),
      { x: 5.7, y: 3.2 },
    );
    const out = s.result() as Bitmap;
    expect(pixelAt(out, 5, 3)).toEqual([255, 0, 0, 255]);
    expect(cover(out).count).toBe(1);
  });

  it('a 1 px pencil line has no gaps and no soft edge', () => {
    const s = createStroke(
      stroke(createBitmap(30, 10), { brush: brush({ size: 1 }), aliased: true }),
      { x: 2.5, y: 4.5 },
    );
    s.to({ x: 22.5, y: 4.5 });
    const out = s.result() as Bitmap;
    for (let x = 2; x <= 22; x++) expect(pixelAt(out, x, 4)).toEqual([255, 0, 0, 255]);
    expect(cover(out).count).toBe(21);
  });

  it('a 3 px pencil is a 3 × 3 block, all or nothing', () => {
    const s = createStroke(
      stroke(createBitmap(10, 10), { brush: brush({ size: 3 }), aliased: true }),
      { x: 5.2, y: 5.9 },
    );
    const out = s.result() as Bitmap;
    expect(cover(out)).toEqual({ count: 9, area: 9 });
    expect(pixelAt(out, 4, 4)[3]).toBe(255);
    expect(pixelAt(out, 6, 6)[3]).toBe(255);
  });

  it('paints over what is there with the colour exactly', () => {
    const blue = fillRect(
      createBitmap(4, 4),
      { x: 0, y: 0, width: 4, height: 4 },
      [0, 0, 255, 255],
    );
    const s = createStroke(stroke(blue, { brush: brush({ size: 1 }), aliased: true }), {
      x: 1,
      y: 1,
    });
    expect(pixelAt(s.result() as Bitmap, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(s.result() as Bitmap, 2, 1)).toEqual([0, 0, 255, 255]);
  });
});

describe('M21 GB4: dabs', () => {
  it('a hard round dab covers about πr²', () => {
    const s = createStroke(stroke(createBitmap(100, 100), { brush: brush({ size: 20 }) }), {
      x: 50,
      y: 50,
    });
    const { area } = cover(s.result() as Bitmap);
    expect(area).toBeGreaterThan(Math.PI * 100 - 3);
    expect(area).toBeLessThan(Math.PI * 100 + 3);
  });

  it('a soft dab is full at its centre, half way out about half, and nothing at its edge', () => {
    const s = createStroke(
      stroke(createBitmap(60, 60), { brush: brush({ size: 21, hardness: 0 }) }),
      { x: 30.5, y: 30.5 },
    );
    const out = s.result() as Bitmap;
    expect(pixelAt(out, 30, 30)[3]).toBe(255);
    const half = pixelAt(out, 35, 30)[3];
    expect(half).toBeGreaterThan(115);
    expect(half).toBeLessThan(155);
    expect(pixelAt(out, 40, 30)[3]).toBeLessThan(5);
    expect(pixelAt(out, 41, 30)[3]).toBe(0);
    // Its colour stays the colour where it is only partly there.
    expect(pixelAt(out, 35, 30).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it('the value of a dab: hardness sets where the fall starts', () => {
    expect(dabValue('round', 0, 0, 10, 0, false)).toBe(1);
    expect(dabValue('round', 10.6, 0, 10, 1, false)).toBe(0);
    expect(dabValue('round', 4, 0, 10, 0.5, false)).toBe(1);
    expect(dabValue('round', 7.5, 0, 10, 0.5, false)).toBeCloseTo(0.5, 5);
    expect(dabValue('round', 10, 0, 10, 0.5, true)).toBe(1);
    expect(dabValue('round', 10.01, 0, 10, 0.5, true)).toBe(0);
  });

  it('a square dab fills its square; a star has points and gaps between them', () => {
    expect(dabValue('square', 9, 9, 10, 1, true)).toBe(1);
    expect(dabValue('round', 9, 9, 10, 1, true)).toBe(0);
    const sq = createStroke(
      stroke(createBitmap(40, 40), { brush: brush({ size: 10, shape: 'square' }) }),
      { x: 20, y: 20 },
    );
    expect(cover(sq.result() as Bitmap)).toEqual({ count: 100, area: 100 });
    // A star's top point is straight up; between two points (36° round) it is in only near the
    // middle.
    expect(dabValue('star', 0, -9, 10, 1, true)).toBe(1);
    expect(
      dabValue('star', 9 * Math.sin(Math.PI / 5), -9 * Math.cos(Math.PI / 5), 10, 1, true),
    ).toBe(0);
    expect(dabValue('star', 0, 3, 10, 1, true)).toBe(1);
    const star = createStroke(
      stroke(createBitmap(60, 60), { brush: brush({ size: 40, shape: 'star' }) }),
      { x: 30, y: 30 },
    );
    const { area } = cover(star.result() as Bitmap);
    // A five-pointed star with its inner points at 0.382 of the outer: about 0.3 of the circle.
    expect(area).toBeGreaterThan(0.25 * Math.PI * 400);
    expect(area).toBeLessThan(0.4 * Math.PI * 400);
  });

  it('knows its shapes', () => {
    expect(BRUSH_SHAPES).toEqual(['round', 'square', 'star', 'scatter']);
  });
});

describe('M21 GB4: a stroke', () => {
  it('never goes past its opacity, however its dabs overlap (one stroke, as Photoshop)', () => {
    const s = createStroke(
      stroke(createBitmap(60, 20), { brush: brush({ size: 10, opacity: 50 }) }),
      {
        x: 10,
        y: 10,
      },
    );
    s.to({ x: 50, y: 10 });
    s.to({ x: 10, y: 10 });
    const out = s.result() as Bitmap;
    for (const x of [10, 20, 30, 49]) expect(pixelAt(out, x, 10)[3]).toBe(128);
  });

  it('builds up with a low flow, still to no more than the opacity', () => {
    const s = createStroke(
      stroke(createBitmap(60, 20), { brush: brush({ size: 10, flow: 20, opacity: 80 }) }),
      { x: 30, y: 10 },
    );
    const once = pixelAt(s.result() as Bitmap, 30, 10)[3];
    expect(once).toBe(Math.round(255 * 0.8 * 0.2));
    for (let i = 0; i < 300; i++) s.to({ x: 30 + (i % 2), y: 10 });
    expect(pixelAt(s.result() as Bitmap, 30, 10)[3]).toBe(204);
  });

  it('puts dabs at its spacing along the pointer’s path, carried across moves', () => {
    const s = createStroke(
      stroke(createBitmap(200, 20), { brush: brush({ size: 4, spacing: 500 }) }),
      { x: 10, y: 10 },
    );
    s.to({ x: 25, y: 10 });
    s.to({ x: 52, y: 10 });
    const out = s.result() as Bitmap;
    // Every 20 px: at 10, 30 and 50, nothing between.
    for (const x of [10, 30, 50]) expect(pixelAt(out, x, 10)[3]).toBe(255);
    for (const x of [20, 40]) expect(pixelAt(out, x, 10)[3]).toBe(0);
    expect(s.dabs).toBe(3);
  });

  it('is limited to the selection, weighted by it', () => {
    let sel = fillRect(createMask(40, 40), { x: 0, y: 0, width: 20, height: 40 }, 255);
    sel = fillRect(sel, { x: 20, y: 0, width: 10, height: 40 }, 128);
    const s = createStroke(
      stroke(createBitmap(40, 40), { brush: brush({ size: 40, shape: 'square' }), selection: sel }),
      { x: 20, y: 20 },
    );
    const out = s.result() as Bitmap;
    expect(pixelAt(out, 5, 5)[3]).toBe(255);
    expect(pixelAt(out, 25, 5)[3]).toBe(128);
    expect(pixelAt(out, 35, 5)[3]).toBe(0);
  });

  it('with nothing selected paints nothing and gives the same bitmap back', () => {
    const target = createBitmap(40, 40);
    const s = createStroke(stroke(target, { selection: createMask(40, 40) }), { x: 20, y: 20 });
    expect(s.result()).toBe(target);
  });

  it('paints where the layer is: its place on the image counts, outside it nothing', () => {
    // A 20 × 20 layer at (100, 50) on the image; the selection is the image's.
    const sel = fillRect(createMask(200, 200), { x: 100, y: 50, width: 5, height: 20 }, 255);
    const s = createStroke(
      stroke(createBitmap(20, 20), {
        x: 100,
        y: 50,
        brush: brush({ size: 1 }),
        aliased: true,
        selection: sel,
      }),
      { x: 102.5, y: 55.5 },
    );
    s.to({ x: 140, y: 55.5 });
    const out = s.result() as Bitmap;
    expect(pixelAt(out, 2, 5)[3]).toBe(255);
    expect(pixelAt(out, 4, 5)[3]).toBe(255);
    expect(pixelAt(out, 5, 5)[3]).toBe(0);
    expect(cover(out).count).toBe(3);
  });

  it('changes only the tiles it touched (a stroke on a big photo shares the rest)', () => {
    const photo = bitmapFromRGBA(1024, 1024, new Uint8ClampedArray(1024 * 1024 * 4).fill(9));
    const s = createStroke(stroke(photo, { brush: brush({ size: 20 }) }), { x: 100, y: 100 });
    s.to({ x: 140, y: 100 });
    const out = s.result();
    expect(sharedBytes(photo, out)).toBe(15 * 256 * 256 * 4);
    // A second look with no new dabs is the very same bitmap.
    expect(s.result()).toBe(out);
    s.to({ x: 600, y: 100 });
    const later = s.result();
    expect(later.tiles[4]).toBe(photo.tiles[4]);
    expect(later.tiles[2]).not.toBe(photo.tiles[2]);
    // A move within one tile makes only that tile again.
    s.to({ x: 620, y: 100 });
    const last = s.result();
    expect(last.tiles[0]).toBe(later.tiles[0]);
    expect(last.tiles[2]).not.toBe(later.tiles[2]);
  });

  it('pen pressure scales the size and the flow when asked', () => {
    const big = createStroke(
      stroke(createBitmap(100, 100), { brush: brush({ size: 40, pressureSize: true }) }),
      { x: 50, y: 50, pressure: 0.25 },
    );
    const { area } = cover(big.result() as Bitmap);
    expect(area).toBeGreaterThan(Math.PI * 25 - 3);
    expect(area).toBeLessThan(Math.PI * 25 + 3);
    const light = createStroke(
      stroke(createBitmap(100, 100), {
        brush: brush({ size: 10, pressureSize: false, pressureFlow: true }),
      }),
      { x: 50, y: 50, pressure: 0.5 },
    );
    expect(pixelAt(light.result() as Bitmap, 50, 50)[3]).toBe(128);
    // Without the options, pressure changes nothing.
    const plain = createStroke(
      stroke(createBitmap(100, 100), { brush: brush({ pressureSize: false }) }),
      { x: 50, y: 50, pressure: 0.1 },
    );
    expect(pixelAt(plain.result() as Bitmap, 50, 50)[3]).toBe(255);
  });

  it('pressure along a move goes from the last point’s to the new one’s (full where none)', () => {
    const s = createStroke(
      stroke(createBitmap(100, 20), {
        brush: brush({ size: 10, pressureSize: false, pressureFlow: true }),
      }),
      { x: 10, y: 10 },
    );
    s.to({ x: 50, y: 10, pressure: 0.2 });
    s.to({ x: 90, y: 10 });
    const out = s.result() as Bitmap;
    expect(pixelAt(out, 10, 10)[3]).toBe(255);
    expect(pixelAt(out, 70, 10)[3]).toBeGreaterThan(pixelAt(out, 50, 10)[3]);
  });

  it('scatters its dabs, the same way each time for the same seed', () => {
    const make = (seed: number) => {
      const s = createStroke(
        stroke(createBitmap(200, 200), { brush: brush({ size: 10, shape: 'scatter' }), seed }),
        { x: 100, y: 100 },
      );
      s.to({ x: 140, y: 100 });
      return readRegion(s.result());
    };
    const a = make(7);
    const same = (b: Uint8ClampedArray) => a.every((v, i) => v === b[i]);
    expect(same(make(7))).toBe(true);
    expect(same(make(8))).toBe(false);
    // The dabs are thrown off the line: some paint lands well above or below it.
    let off = 0;
    for (let y = 0; y < 200; y++)
      for (let x = 0; x < 200; x++)
        if (Math.abs(y - 100) > 6 && a[(y * 200 + x) * 4 + 3]! > 0) off++;
    expect(off).toBeGreaterThan(0);
  });
});

describe('M21 GB4: the eraser, the mask and the airbrush', () => {
  it('the eraser lowers the alpha, a whole erase leaving the tile empty', () => {
    const full = fillRect(
      createBitmap(20, 20),
      { x: 0, y: 0, width: 20, height: 20 },
      [1, 2, 3, 255],
    );
    const half = createStroke(
      stroke(full, { brush: brush({ size: 40, shape: 'square', opacity: 50 }), erase: true }),
      { x: 10, y: 10 },
    );
    expect(pixelAt(half.result() as Bitmap, 3, 3)).toEqual([1, 2, 3, 128]);
    const all = createStroke(
      stroke(full, { brush: brush({ size: 40, shape: 'square' }), erase: true }),
      { x: 10, y: 10 },
    );
    expect(all.result().tiles[0]).toBeNull();
  });

  it('on a layer mask paints the colour’s grey: black hides, white shows; the eraser hides', () => {
    const mask = fillRect(createMask(10, 10), { x: 0, y: 0, width: 10, height: 10 }, 255);
    const black = createStroke(
      stroke(mask, { brush: brush({ size: 2 }), colour: [0, 0, 0], aliased: true }),
      { x: 5, y: 5 },
    );
    expect(pixelAt(black.result() as Mask, 5, 5)).toBe(0);
    expect(pixelAt(black.result() as Mask, 1, 1)).toBe(255);
    const grey = createStroke(
      stroke(createMask(10, 10), {
        brush: brush({ size: 2 }),
        colour: [128, 128, 128],
        aliased: true,
      }),
      { x: 5, y: 5 },
    );
    expect(pixelAt(grey.result() as Mask, 5, 5)).toBe(128);
    const erase = createStroke(
      stroke(mask, { brush: brush({ size: 2 }), erase: true, aliased: true }),
      {
        x: 5,
        y: 5,
      },
    );
    expect(pixelAt(erase.result() as Mask, 5, 5)).toBe(0);
  });

  it('the airbrush keeps adding paint while held still, a dab each 40 ms', () => {
    const s = createStroke(stroke(createBitmap(40, 40), { brush: brush({ size: 10, flow: 10 }) }), {
      x: 20,
      y: 20,
    });
    const before = pixelAt(s.result() as Bitmap, 20, 20)[3];
    s.hold(30);
    expect(s.dabs).toBe(1);
    s.hold(30);
    expect(s.dabs).toBe(2);
    s.hold(400);
    expect(s.dabs).toBe(12);
    expect(pixelAt(s.result() as Bitmap, 20, 20)[3]).toBeGreaterThan(before * 5);
  });
});

describe('M21 GB4: the settings', () => {
  it('refuses settings out of their range, in words', () => {
    expect(() => checkBrush(brush())).not.toThrow();
    expect(() => checkBrush(brush({ size: 0 }))).toThrow('The size is 1 to 2500 px.');
    expect(() => checkBrush(brush({ hardness: 120 }))).toThrow('The hardness is 0 to 100 %.');
    expect(() => checkBrush(brush({ opacity: 0 }))).toThrow('The opacity is 1 to 100 %.');
    expect(() => checkBrush(brush({ flow: Number.NaN }))).toThrow('The flow is 1 to 100 %.');
    expect(() => checkBrush(brush({ spacing: 0 }))).toThrow('The spacing is 1 to 500 %.');
    expect(() => checkBrush(brush({ shape: 'blob' as never }))).toThrow('Choose a brush shape.');
  });
});
