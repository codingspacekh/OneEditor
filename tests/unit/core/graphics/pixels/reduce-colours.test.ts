// M21 GB6: Image ▸ Reduce colours — a median-cut palette of 2, 16 or 256 colours, Floyd–Steinberg
// dithering on or off, greyscale, and the estimate of the file size before and after.
import { describe, expect, it } from 'vitest';
import {
  bitmapFromRGBA,
  createBitmap,
  fillRect,
  readRegion,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import {
  colourStats,
  medianCut,
  quantise,
  reduceColours,
  sizeEstimate,
} from '../../../../../src/core/graphics/pixels/reduce-colours.ts';

const rgba = (...px: number[][]) => new Uint8ClampedArray(px.flat());
const coloursOf = (d: Uint8ClampedArray) => {
  const seen = new Set<string>();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return seen;
};

describe('M21 GB6: median cut', () => {
  it('M21 GB6: keeps the colours exactly when there are no more than asked', () => {
    const d = rgba([0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]);
    const p = medianCut(d, 2);
    expect(p.length).toBe(6);
    const pairs = [[...p.subarray(0, 3)], [...p.subarray(3, 6)]].sort((a, b) => a[0]! - b[0]!);
    expect(pairs).toEqual([
      [0, 0, 0],
      [255, 255, 255],
    ]);
  });

  it('M21 GB6: splits the widest, most used box first; transparent pixels do not count', () => {
    // Many reds, a few dark reds, some blue: two colours are red-ish and blue.
    const px: number[][] = [];
    for (let i = 0; i < 40; i++) px.push([250, 10, 10, 255]);
    for (let i = 0; i < 40; i++) px.push([10, 10, 250, 255]);
    for (let i = 0; i < 20; i++) px.push([0, 255, 0, 0]);
    const p = medianCut(rgba(...px), 2);
    expect(p.length).toBe(6);
    const colours = [[...p.subarray(0, 3)], [...p.subarray(3, 6)]].sort((a, b) => a[2]! - b[2]!);
    expect(colours).toEqual([
      [250, 10, 10],
      [10, 10, 250],
    ]);
    // Fewer colours than asked: only those.
    expect(medianCut(rgba([1, 2, 3, 255]), 256).length).toBe(3);
    expect(medianCut(rgba([1, 2, 3, 0]), 16).length).toBe(0);
  });

  it('M21 GB6: 16 colours from a smooth gradient: 16 different ones, spread over it', () => {
    const px: number[][] = [];
    for (let i = 0; i < 256; i++) px.push([i, i, i, 255]);
    const p = medianCut(rgba(...px), 16);
    expect(p.length).toBe(48);
    const greys = [...Array(16).keys()].map((k) => p[k * 3]!).sort((a, b) => a - b);
    expect(new Set(greys).size).toBe(16);
    expect(greys[0]).toBeLessThan(16);
    expect(greys[15]).toBeGreaterThan(240);
  });
});

describe('M21 GB6: quantising and dithering', () => {
  const BW = new Uint8Array([0, 0, 0, 255, 255, 255]);
  const grey = fillRect(
    createBitmap(16, 16),
    { x: 0, y: 0, width: 16, height: 16 },
    [96, 96, 96, 255],
  );

  it('M21 GB6: without dithering each pixel becomes its nearest palette colour', () => {
    const d = readRegion(quantise(grey, BW, false));
    expect(coloursOf(d)).toEqual(new Set(['0,0,0']));
  });

  it('M21 GB6: Floyd–Steinberg mixes the two to keep the grey (as many white dots as it takes)', () => {
    const d = readRegion(quantise(grey, BW, true));
    expect(coloursOf(d)).toEqual(new Set(['0,0,0', '255,255,255']));
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i]!;
    const mean = sum / (16 * 16);
    expect(Math.abs(mean - 96)).toBeLessThan(8);
  });

  it('M21 GB6: alpha stays as it was; transparent pixels stay transparent', () => {
    const b = bitmapFromRGBA(2, 1, rgba([200, 30, 30, 128], [0, 0, 0, 0]));
    const d = readRegion(quantise(b, new Uint8Array([255, 0, 0, 0, 0, 255]), true));
    expect([...d]).toEqual([255, 0, 0, 128, 0, 0, 0, 0]);
  });

  it('M21 GB6: reduceColours to 2, 16, 256 or greyscale', () => {
    const data = new Uint8ClampedArray(64 * 4 * 4);
    for (let i = 0; i < 64 * 4; i++) data.set([(i % 64) << 2, (i * 7) & 255, 128, 255], i * 4);
    const b = bitmapFromRGBA(64, 4, data);
    for (const to of [2, 16, 256] as const)
      for (const dither of [false, true]) {
        const d = readRegion(reduceColours(b, { to, dither }));
        expect(coloursOf(d).size).toBeLessThanOrEqual(to);
      }
    const red = bitmapFromRGBA(1, 1, rgba([255, 0, 0, 255]));
    expect([...readRegion(reduceColours(red, { to: 'grey', dither: false }))]).toEqual([
      76, 76, 76, 255,
    ]);
    // Nothing shows: nothing to change.
    expect(readRegion(reduceColours(createBitmap(3, 3), { to: 16, dither: true }))).toEqual(
      new Uint8ClampedArray(36),
    );
    // Already within the count: the same pixels.
    const two = bitmapFromRGBA(2, 1, rgba([0, 0, 0, 255], [255, 255, 255, 255]));
    expect(readRegion(reduceColours(two, { to: 2, dither: true }))).toEqual(readRegion(two));
  });
});

describe('M21 GB6: the file size before and after (an estimate)', () => {
  it('M21 GB6: counts the colours and whether any pixel is see-through', () => {
    const b = bitmapFromRGBA(3, 1, rgba([1, 2, 3, 255], [1, 2, 3, 255], [9, 9, 9, 100]));
    expect(colourStats(b)).toEqual({ colours: 2, transparent: true, pixels: 3 });
    expect(colourStats(createBitmap(2, 2))).toEqual({ colours: 0, transparent: true, pixels: 4 });
    const gap = bitmapFromRGBA(2, 1, rgba([5, 5, 5, 255], [0, 0, 0, 0]));
    expect(colourStats(gap)).toEqual({ colours: 1, transparent: true, pixels: 2 });
  });

  it('M21 GB6: 24-bit (32 with alpha) before; 1, 4 or 8 bits a pixel and the palette after', () => {
    const opaque = { colours: 5000, transparent: false, pixels: 100 * 100 };
    expect(sizeEstimate(opaque, 100, 100, 256)).toEqual({
      before: 30_000,
      after: 10_000 + 768,
      beforeBits: 24,
      afterBits: 8,
    });
    expect(sizeEstimate(opaque, 100, 100, 2)).toMatchObject({ after: 13 * 100 + 6, afterBits: 1 });
    expect(sizeEstimate(opaque, 100, 100, 16)).toMatchObject({
      after: 50 * 100 + 48,
      afterBits: 4,
    });
    expect(sizeEstimate(opaque, 100, 100, 'grey')).toMatchObject({ after: 10_000, afterBits: 8 });
    const seeThrough = { ...opaque, transparent: true };
    expect(sizeEstimate(seeThrough, 100, 100, 256)).toMatchObject({
      before: 40_000,
      beforeBits: 32,
      after: 10_000 + 1024,
    });
    expect(sizeEstimate(seeThrough, 100, 100, 'grey')).toMatchObject({
      after: 20_000,
      afterBits: 16,
    });
  });
});
