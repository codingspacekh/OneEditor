// M21 G3: transforming pixels — the matrices built from typed values (X / Y of the 9 reference
// points, W × H, rotation about a point, flips, skews); whole-pixel moves keeping the very tiles,
// quarter turns and flips copying pixels exactly, the layer mask going with them; resampled turns
// and scales on premultiplied colours (edges never dark), shrinking without shimmer; the selected
// pixels lifted, transformed and put back with the selection following; a large photo.
import { describe, expect, it } from 'vitest';
import type { PixelContent } from '../../../../../src/core/animation/types.ts';
import {
  bitmapFromRGBA,
  createBitmap,
  createMask,
  fillRect,
  maskFromBytes,
  pixelAt,
  readRegion,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import { selectedBounds } from '../../../../../src/core/graphics/pixels/selection.ts';
import {
  applyMatrix,
  chain,
  flipping,
  IDENTITY,
  invert,
  isIdentity,
  matrixFor,
  MAX_SIDE,
  multiply,
  pasteOver,
  pixelsBox,
  referencePoint,
  rotation,
  scaling,
  skewing,
  snapped,
  tapWeights,
  transformedBounds,
  transformPixels,
  transformSelected,
  translation,
} from '../../../../../src/core/graphics/pixels/transform.ts';
import { ANCHORS } from '../../../../../src/core/graphics/image-size.ts';
import { FILTERS } from '../../../../../src/core/graphics/pixels/resample.ts';

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

/** A 3 × 2 of six different colours, so where each pixel goes is plain. */
function six(): PixelContent {
  const px = [
    [10, 0, 0, 255],
    [20, 0, 0, 255],
    [30, 0, 0, 255],
    [40, 0, 0, 255],
    [50, 0, 0, 255],
    [60, 0, 0, 255],
  ];
  return { bitmap: bitmapFromRGBA(3, 2, new Uint8ClampedArray(px.flat())), x: 4, y: 7 };
}
const reds = (p: PixelContent) => {
  const d = readRegion(p.bitmap);
  const out: number[][] = [];
  for (let y = 0; y < p.bitmap.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < p.bitmap.width; x++) row.push(d[(y * p.bitmap.width + x) * 4]!);
    out.push(row);
  }
  return out;
};
const flat = (w: number, h: number, colour = RED, x = 0, y = 0): PixelContent => ({
  bitmap: fillRect(createBitmap(w, h), { x: 0, y: 0, width: w, height: h }, colour),
  x,
  y,
});

describe('M21 G3: the matrices', () => {
  it('M21 G3: chains, inverts and applies (the first step given is done first)', () => {
    const m = chain(translation(10, 0), scaling(2, 3));
    expect(applyMatrix(m, { x: 1, y: 1 })).toEqual({ x: 22, y: 3 });
    const back = applyMatrix(invert(m), { x: 22, y: 3 });
    expect(back.x).toBeCloseTo(1);
    expect(back.y).toBeCloseTo(1);
    expect(multiply(IDENTITY, m)).toEqual(m);
    expect(() => invert(scaling(0, 1))).toThrow(/line/);
  });

  it('M21 G3: turns clockwise on screen, exactly at quarter turns, about a point', () => {
    expect(rotation(90, { x: 0, y: 0 })).toEqual({ a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 });
    expect(rotation(-270, { x: 0, y: 0 })).toEqual(rotation(90, { x: 0, y: 0 }));
    expect(applyMatrix(rotation(180, { x: 5, y: 5 }), { x: 0, y: 0 })).toEqual({ x: 10, y: 10 });
    const p = applyMatrix(rotation(45, { x: 0, y: 0 }), { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(Math.SQRT1_2);
    expect(p.y).toBeCloseTo(Math.SQRT1_2);
    // AN25's skew: x' = x − tan(skewX)·y.
    expect(applyMatrix(skewing(45, 0, { x: 0, y: 0 }), { x: 0, y: 10 }).x).toBeCloseTo(-10);
    expect(applyMatrix(flipping('vertical', { x: 0, y: 5 }), { x: 3, y: 0 })).toEqual({
      x: 3,
      y: 10,
    });
  });

  it('M21 G3: the 9 reference points of a box, in reading order', () => {
    const box = { x: 10, y: 20, width: 100, height: 50 };
    expect(ANCHORS.map((a) => referencePoint(box, a))).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
      { x: 110, y: 20 },
      { x: 10, y: 45 },
      { x: 60, y: 45 },
      { x: 110, y: 45 },
      { x: 10, y: 70 },
      { x: 60, y: 70 },
      { x: 110, y: 70 },
    ]);
  });

  it('M21 G3: bounds are rounded out to whole px, a hair over a whole number not one more', () => {
    const box = { x: 0, y: 0, width: 10, height: 10 };
    expect(transformedBounds(box, translation(0.5, 0))).toEqual({
      x: 0,
      y: 0,
      width: 11,
      height: 10,
    });
    expect(transformedBounds(box, translation(1e-9, -1e-9))).toEqual(box);
  });

  it('M21 G3: "bottom edge at Y = 1900": the reference point moved to a typed X / Y', () => {
    const box = { x: 100, y: 200, width: 400, height: 300 };
    const m = matrixFor(box, { reference: 'bottom', y: 1900 });
    expect(applyMatrix(m, { x: 300, y: 500 })).toEqual({ x: 300, y: 1900 });
    expect(transformedBounds(box, m)).toEqual({ x: 100, y: 1600, width: 400, height: 300 });
    const tl = matrixFor(box, { reference: 'top-left', x: 0, y: 0 });
    expect(transformedBounds(box, tl)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('M21 G3: a new size about the reference point, proportions kept from one side', () => {
    const box = { x: 0, y: 0, width: 400, height: 300 };
    const m = matrixFor(box, { reference: 'top-left', width: 200, keepProportions: true });
    expect(transformedBounds(box, m)).toEqual({ x: 0, y: 0, width: 200, height: 150 });
    const h = matrixFor(box, { reference: 'centre', height: 600, keepProportions: true });
    expect(transformedBounds(box, h)).toEqual({ x: -200, y: -150, width: 800, height: 600 });
    const free = matrixFor(box, { reference: 'top-left', width: 100 });
    expect(transformedBounds(box, free)).toEqual({ x: 0, y: 0, width: 100, height: 300 });
  });

  it('M21 G3: turned about the centre by default; flipped in place; refuses impossible numbers', () => {
    const box = { x: 0, y: 0, width: 40, height: 20 };
    expect(transformedBounds(box, matrixFor(box, { rotate: 90 }))).toEqual({
      x: 10,
      y: -10,
      width: 20,
      height: 40,
    });
    expect(transformedBounds(box, matrixFor(box, { flipHorizontal: true }))).toEqual(box);
    expect(applyMatrix(matrixFor(box, { flipVertical: true }), { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 20,
    });
    expect(() => matrixFor(box, { width: 0 })).toThrow(/more than 0 px/);
    expect(() => matrixFor(box, { height: -5 })).toThrow(/height/);
    expect(() => matrixFor(box, { skewX: 85 })).toThrow(/−80° and 80°/);
    expect(() => matrixFor(box, { rotate: Number.NaN })).toThrow(/number/);
  });

  it('M21 G3: rounding errors snapped off: a quarter turn exact and on whole px', () => {
    const m = snapped({ a: 1e-17, b: 1, c: -1, d: -2e-17, e: 10.5, f: 3.0000001 });
    expect(m).toEqual({ a: 0, b: 1, c: -1, d: 0, e: 11, f: 3 });
    // A move alone is in whole px, as a layer's place is: lossless.
    expect(snapped(translation(2.0000000001, 1.4))).toEqual(translation(2, 1));
    const scaled = snapped({ ...scaling(2, 1), e: 0.5, f: 1.0000000001 });
    expect([scaled.e, scaled.f]).toEqual([0.5, 1]);
    expect(isIdentity(snapped(translation(1e-9, 0)))).toBe(true);
  });
});

describe('M21 G3: the sampling kernels', () => {
  it('M21 G3: the taps’ weights are resample’s bilinear and Catmull-Rom kernels', () => {
    const w = new Float64Array(4);
    for (const t of [0, 0.1, 0.25, 0.5, 0.8, 0.99]) {
      tapWeights(4, t, w);
      [t + 1, t, t - 1, t - 2].forEach((d, k) =>
        expect(w[k]).toBeCloseTo(FILTERS.bicubic.at(d), 12),
      );
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      tapWeights(2, t, w);
      expect(w[0]).toBeCloseTo(FILTERS.bilinear.at(t), 12);
      expect(w[1]).toBeCloseTo(FILTERS.bilinear.at(t - 1), 12);
    }
  });
});

describe('M21 G3: transforming a layer’s pixels', () => {
  it('M21 G3: a whole-pixel move keeps the very same tiles; nothing at all keeps the pixels', () => {
    const p = { ...six(), mask: createMask(3, 2) };
    const moved = transformPixels(p, translation(5, -3), 'bicubic');
    expect(moved.bitmap).toBe(p.bitmap);
    expect(moved.mask).toBe(p.mask);
    expect([moved.x, moved.y]).toEqual([9, 4]);
    expect(transformPixels(p, IDENTITY, 'bicubic')).toBe(p);
  });

  it('M21 G3: a quarter turn copies the pixels exactly, whatever the method', () => {
    const p = six();
    const turned = transformPixels(p, rotation(90, { x: 4, y: 7 }), 'bicubic');
    // Clockwise: the left column becomes the top row, read upwards.
    expect(reds(turned)).toEqual([
      [40, 10],
      [50, 20],
      [60, 30],
    ]);
    expect([turned.x, turned.y]).toEqual([2, 7]);
    const half = transformPixels(p, matrixFor(pixelsBox(p), { rotate: 180 }), 'bilinear');
    expect(reds(half)).toEqual([
      [60, 50, 40],
      [30, 20, 10],
    ]);
    expect(pixelsBox(half)).toEqual(pixelsBox(p));
    // About an odd box's centre a quarter turn lands on whole px (half a pixel over at most).
    const round = transformPixels(p, matrixFor(pixelsBox(p), { rotate: -90 }), 'bicubic');
    expect(reds(round)).toEqual([
      [30, 60],
      [20, 50],
      [10, 40],
    ]);
    expect(Number.isInteger(round.x) && Number.isInteger(round.y)).toBe(true);
  });

  it('M21 G3: flips mirror the pixels exactly, in place; the layer mask goes with them', () => {
    const mask = maskFromBytes(3, 2, new Uint8ClampedArray([255, 128, 0, 0, 0, 0]));
    const p = { ...six(), mask };
    const h = transformPixels(p, matrixFor(pixelsBox(p), { flipHorizontal: true }), 'bicubic');
    expect(reds(h)).toEqual([
      [30, 20, 10],
      [60, 50, 40],
    ]);
    expect([...readRegion(h.mask!)]).toEqual([0, 128, 255, 0, 0, 0]);
    expect(pixelsBox(h)).toEqual(pixelsBox(p));
    const v = transformPixels(p, matrixFor(pixelsBox(p), { flipVertical: true }), 'nearest');
    expect(reds(v)).toEqual([
      [40, 50, 60],
      [10, 20, 30],
    ]);
    expect([...readRegion(v.mask!)]).toEqual([0, 0, 0, 255, 128, 0]);
  });

  it('M21 G3: nearest doubles each pixel (pixel art stays hard)', () => {
    const p = six();
    const big = transformPixels(
      p,
      matrixFor(pixelsBox(p), { reference: 'top-left', width: 6, height: 4 }),
      'nearest',
    );
    expect(pixelsBox(big)).toEqual({ x: 4, y: 7, width: 6, height: 4 });
    expect(reds(big)).toEqual([
      [10, 10, 20, 20, 30, 30],
      [10, 10, 20, 20, 30, 30],
      [40, 40, 50, 50, 60, 60],
      [40, 40, 50, 50, 60, 60],
    ]);
  });

  it('M21 G3: a turned photo keeps its colour to the edges, which fade out, never darken', () => {
    for (const method of ['bilinear', 'bicubic'] as const) {
      const p = flat(40, 40, [200, 120, 40, 255], 10, 10);
      const turned = transformPixels(p, matrixFor(pixelsBox(p), { rotate: 30 }), method);
      // 40 px turned 30°: 54.6 px across, centred where it was (30): 2.7 to 57.3, rounded out.
      expect(pixelsBox(turned)).toEqual({ x: 2, y: 2, width: 56, height: 56 });
      const d = readRegion(turned.bitmap);
      let partly = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]!;
        if (a === 0) continue;
        if (a < 250) partly++;
        // Premultiplied: a see-through edge is the same colour, not mixed with black.
        expect(Math.abs(d[i]! - 200)).toBeLessThanOrEqual(2);
        expect(Math.abs(d[i + 1]! - 120)).toBeLessThanOrEqual(2);
        expect(Math.abs(d[i + 2]! - 40)).toBeLessThanOrEqual(2);
      }
      expect(partly).toBeGreaterThan(40);
      // The middle is solid, the corners of the new box empty.
      expect(pixelAt(turned.bitmap, 27, 27)).toEqual([200, 120, 40, 255]);
      expect(pixelAt(turned.bitmap, 0, 0)[3]).toBe(0);
    }
  });

  it('M21 G3: shrinking blends every pixel (a checkerboard halved is grey, not stripes)', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const v = (x + y) % 2 ? 255 : 0;
        data.set([v, v, v, 255], (y * 64 + x) * 4);
      }
    const p: PixelContent = { bitmap: bitmapFromRGBA(64, 64, data), x: 0, y: 0 };
    const small = transformPixels(
      p,
      matrixFor(pixelsBox(p), { reference: 'top-left', width: 16, height: 16 }),
      'bicubic',
    );
    expect(pixelsBox(small)).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    const d = readRegion(small.bitmap);
    for (let i = 0; i < d.length; i += 4) expect(Math.abs(d[i]! - 128)).toBeLessThanOrEqual(12);
    // Shrunk and turned too: still grey.
    const turned = transformPixels(
      p,
      chain(scaling(0.25, 0.25), rotation(20, { x: 8, y: 8 })),
      'bilinear',
    );
    expect(Math.abs(pixelAt(turned.bitmap, 9, 9)[0] - 128)).toBeLessThanOrEqual(16);
  });

  it('M21 G3: a skew slants the pixels; the layer mask edges stay where the pixels are', () => {
    const p = {
      ...flat(20, 20, BLUE),
      mask: fillRect(createMask(20, 20), { x: 0, y: 0, width: 20, height: 20 }, 255),
    };
    const k = transformPixels(p, matrixFor(pixelsBox(p), { skewX: 45 }), 'bilinear');
    expect(k.bitmap.width).toBe(40);
    expect(k.mask!.width).toBe(40);
    // The mask is the pixels' size and shows them all (its edge pixels spread outward).
    expect(pixelAt(k.mask!, 20, 10)).toBe(255);
    expect(pixelAt(k.bitmap, 20, 10)).toEqual(BLUE);
  });

  it('M21 G3: nearest turns a layer mask with its pixels, its edge spread outward', () => {
    const p = {
      ...flat(10, 10, BLUE),
      mask: fillRect(createMask(10, 10), { x: 0, y: 0, width: 10, height: 10 }, 200),
    };
    const turned = transformPixels(p, matrixFor(pixelsBox(p), { rotate: 30 }), 'nearest');
    expect([turned.mask!.width, turned.mask!.height]).toEqual([
      turned.bitmap.width,
      turned.bitmap.height,
    ]);
    expect(pixelAt(turned.mask!, 0, 0)).toBe(200);
    expect(pixelAt(turned.bitmap, 0, 0)[3]).toBe(0);
  });

  it('M21 G3: refuses pixels too big to hold', () => {
    const p = flat(100, 100);
    expect(() => transformPixels(p, scaling(MAX_SIDE / 50, 1), 'nearest')).toThrow(
      /16384 px a side/,
    );
  });

  it('M21 GN1: a large photo turns across many tiles; a whole-pixel move keeps every tile', () => {
    // How fast a 12-megapixel photo goes is for the built app (tests/e2e), not under coverage.
    const data = new Uint8ClampedArray(1600 * 1200 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = i & 255;
      data[i + 1] = (i >> 8) & 255;
      data[i + 3] = 255;
    }
    const p: PixelContent = { bitmap: bitmapFromRGBA(1600, 1200, data), x: 0, y: 0 };
    const turned = transformPixels(p, matrixFor(pixelsBox(p), { rotate: 15 }), 'bicubic');
    expect(turned.bitmap.width).toBeGreaterThan(1600);
    const moved = transformPixels(p, translation(-300, 25), 'bicubic');
    expect([moved.x, moved.y]).toEqual([-300, 25]);
    expect(moved.bitmap.tiles.every((t, i) => t === p.bitmap.tiles[i])).toBe(true);
  }, 60_000);
});

describe('M21 G3: transforming the selected pixels', () => {
  /** White 20 × 10 at (0, 0) with a red 4 × 4 at (2, 2); the red selected. */
  function setup() {
    const p: PixelContent = {
      bitmap: fillRect(
        fillRect(createBitmap(20, 10), { x: 0, y: 0, width: 20, height: 10 }, [255, 255, 255, 255]),
        { x: 2, y: 2, width: 4, height: 4 },
        RED,
      ),
      x: 0,
      y: 0,
    };
    const selection = fillRect(createMask(40, 30), { x: 2, y: 2, width: 4, height: 4 }, 255);
    return { p, selection };
  }

  it('M21 G3: moves only the selected pixels, the hole they leave transparent; the selection follows', () => {
    const { p, selection } = setup();
    const out = transformSelected(p, selection, translation(10, 3), 'bicubic');
    expect(pixelsBox(out.pixels)).toEqual(pixelsBox(p));
    expect(pixelAt(out.pixels.bitmap, 3, 3)[3]).toBe(0);
    expect(pixelAt(out.pixels.bitmap, 13, 6)).toEqual(RED);
    expect(pixelAt(out.pixels.bitmap, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(selectedBounds(out.selection)).toEqual({ x: 12, y: 5, width: 4, height: 4 });
    expect([out.selection.width, out.selection.height]).toEqual([40, 30]);
    expect(transformSelected(p, selection, IDENTITY, 'bicubic')).toEqual({ pixels: p, selection });
  });

  it('M21 G3: turned and flipped in place; the layer grows to hold what goes past its edge', () => {
    const { p, selection } = setup();
    const out = transformSelected(
      p,
      selection,
      matrixFor({ x: 2, y: 2, width: 4, height: 4 }, { reference: 'top-left', x: 18, y: 8 }),
      'nearest',
    );
    expect(pixelsBox(out.pixels)).toEqual({ x: 0, y: 0, width: 22, height: 12 });
    expect(pixelAt(out.pixels.bitmap, 21, 11)).toEqual(RED);
    expect(pixelAt(out.pixels.bitmap, 21, 0)).toEqual([0, 0, 0, 0]);
    expect(selectedBounds(out.selection)).toEqual({ x: 18, y: 8, width: 4, height: 4 });
    const turned = transformSelected(
      p,
      selection,
      matrixFor({ x: 2, y: 2, width: 4, height: 4 }, { rotate: 90 }),
      'bicubic',
    );
    expect(pixelAt(turned.pixels.bitmap, 2, 2)).toEqual(RED);
    expect(selectedBounds(turned.selection)).toEqual({ x: 2, y: 2, width: 4, height: 4 });
  });

  it('M21 G3: a soft selection lifts partly; nothing selected that shows is refused', () => {
    const { p } = setup();
    const soft = fillRect(createMask(40, 30), { x: 2, y: 2, width: 4, height: 4 }, 128);
    const out = transformSelected(p, soft, translation(10, 0), 'bilinear');
    // Half stays behind, half goes.
    expect(pixelAt(out.pixels.bitmap, 3, 3)[3]).toBeGreaterThan(100);
    expect(pixelAt(out.pixels.bitmap, 3, 3)[3]).toBeLessThan(140);
    expect(pixelAt(out.pixels.bitmap, 13, 3)[0]).toBe(255);
    const off = fillRect(createMask(40, 30), { x: 30, y: 20, width: 4, height: 4 }, 255);
    expect(() => transformSelected(p, off, translation(1, 0), 'bilinear')).toThrow(
      /Nothing selected/,
    );
  });
});

describe('M21 G3: pixels put over a layer', () => {
  it('M21 G3: only the tiles under them change; a mask grows showing the new area', () => {
    const base = { ...flat(300, 10, [255, 255, 255, 255]), mask: createMask(300, 10) };
    const top = flat(2, 2, BLUE, 290, 4);
    const out = pasteOver(base, top);
    expect(out.bitmap.tiles[0]).toBe(base.bitmap.tiles[0]);
    expect(pixelAt(out.bitmap, 291, 5)).toEqual(BLUE);
    const grown = pasteOver(base, flat(2, 2, BLUE, -2, 0));
    expect(pixelsBox(grown)).toEqual({ x: -2, y: 0, width: 302, height: 10 });
    expect(pixelAt(grown.mask!, 0, 0)).toBe(255);
    expect(pixelAt(grown.mask!, 2, 0)).toBe(0);
    expect(pixelAt(grown.bitmap, 0, 1)).toEqual(BLUE);
  });
});
