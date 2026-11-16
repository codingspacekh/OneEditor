// M21 GB6: Image size's resampling — known answers for nearest and bilinear on a 2 × 2, flat
// colours staying flat under bicubic, transparent edges not going dark (premultiplied), exact
// sizes (Balloon1 at 3000 × 2250), masks, and a 12-megapixel photo in seconds.
import { describe, expect, it } from 'vitest';
import {
  bitmapFromRGBA,
  createBitmap,
  fillRect,
  maskFromBytes,
  readRegion,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import {
  RESAMPLE_METHODS,
  resampleBitmap,
  resampleMask,
} from '../../../../../src/core/graphics/pixels/resample.ts';

const rgba = (...px: number[][]) => new Uint8ClampedArray(px.flat());
/** A 2 × 2: red, green / blue, white, all opaque. */
const quad = bitmapFromRGBA(
  2,
  2,
  rgba([255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255]),
);
const pixel = (data: Uint8ClampedArray, width: number, x: number, y: number) => [
  ...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
];

describe('M21 GB6: resampling', () => {
  it('M21 GB6: nearest doubles each pixel of a 2 × 2 into a 4 × 4', () => {
    const out = resampleBitmap(quad, 4, 4, 'nearest');
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    const d = readRegion(out);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++)
        expect(pixel(d, 4, x, y)).toEqual(pixel(readRegion(quad), 2, x >> 1, y >> 1));
  });

  it('M21 GB6: bilinear 2 × 2 → 4 × 4 blends a quarter and three quarters between the edges', () => {
    const row = bitmapFromRGBA(2, 1, rgba([0, 0, 0, 255], [200, 100, 40, 255]));
    const out = readRegion(resampleBitmap(row, 4, 1, 'bilinear'));
    expect(pixel(out, 4, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(out, 4, 1, 0)).toEqual([50, 25, 10, 255]);
    expect(pixel(out, 4, 2, 0)).toEqual([150, 75, 30, 255]);
    expect(pixel(out, 4, 3, 0)).toEqual([200, 100, 40, 255]);
    const square = readRegion(resampleBitmap(quad, 4, 4, 'bilinear'));
    // The middle of the top row: red and green blended; the corners stay their own colours.
    expect(pixel(square, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(square, 4, 3, 3)).toEqual([255, 255, 255, 255]);
    expect(pixel(square, 4, 1, 0)).toEqual([191, 64, 0, 255]);
  });

  it('M21 GB6: a flat colour stays flat under every method, up and down', () => {
    const flat = fillRect(
      createBitmap(37, 23),
      { x: 0, y: 0, width: 37, height: 23 },
      [12, 200, 99, 255],
    );
    for (const method of RESAMPLE_METHODS)
      for (const [w, h] of [
        [101, 7],
        [5, 61],
        [37, 23],
      ] as const) {
        const d = readRegion(resampleBitmap(flat, w, h, method));
        for (let i = 0; i < d.length; i += 4)
          expect([d[i], d[i + 1], d[i + 2], d[i + 3]]).toEqual([12, 200, 99, 255]);
      }
  });

  it('M21 GB6: a transparent edge does not darken a white shape (premultiplied)', () => {
    // A white square in the middle of transparent black: every pixel that shows is white.
    const b = fillRect(
      createBitmap(8, 8),
      { x: 2, y: 2, width: 4, height: 4 },
      [255, 255, 255, 255],
    );
    for (const method of ['bicubic', 'bilinear'] as const)
      for (const size of [5, 13, 20]) {
        const d = readRegion(resampleBitmap(b, size, size, method));
        let partly = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          if (d[i + 3]! < 255) partly++;
          expect(d[i]).toBeGreaterThanOrEqual(254);
          expect(d[i + 1]).toBeGreaterThanOrEqual(254);
          expect(d[i + 2]).toBeGreaterThanOrEqual(254);
        }
        expect(partly).toBeGreaterThan(0);
      }
  });

  it('M21 GB6: bicubic keeps a hard edge without colours outside the range (no ringing past 0–255)', () => {
    const row = bitmapFromRGBA(
      4,
      1,
      rgba([0, 0, 0, 255], [0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255]),
    );
    const d = readRegion(resampleBitmap(row, 16, 1, 'bicubic'));
    // Catmull-Rom overshoots, but the bytes are clamped and the far ends keep their colours.
    expect(pixel(d, 16, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(d, 16, 15, 0)).toEqual([255, 255, 255, 255]);
    for (let x = 1; x < 16; x++) expect(d[x * 4]!).toBeGreaterThanOrEqual(d[(x - 1) * 4]! - 20);
  });

  it('M21 GB6: shrinking averages (a checkerboard halved becomes grey, not aliased)', () => {
    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const v = (x + y) % 2 ? 255 : 0;
        data.set([v, v, v, 255], (y * 16 + x) * 4);
      }
    const board = bitmapFromRGBA(16, 16, data);
    for (const method of ['bilinear', 'bicubic'] as const) {
      const d = readRegion(resampleBitmap(board, 4, 4, method));
      for (let i = 0; i < d.length; i += 4) {
        expect(Math.abs(d[i]! - 128)).toBeLessThanOrEqual(12);
        expect(d[i + 3]).toBe(255);
      }
    }
  });

  it('M21 GB6: sizes are exact, across tiles (J/22 Balloon1 at 3000 × 2250)', () => {
    const b = fillRect(
      createBitmap(600, 450),
      { x: 100, y: 100, width: 200, height: 100 },
      [200, 30, 30, 255],
    );
    const out = resampleBitmap(b, 3000, 2250, 'bicubic');
    expect([out.width, out.height]).toEqual([3000, 2250]);
    // Empty tiles stay empty (null); the red box's middle is red at five times the size.
    expect(out.tiles[0]).toBeNull();
    expect(readRegion(out, { x: 1000, y: 750, width: 1, height: 1 })).toEqual(
      new Uint8ClampedArray([200, 30, 30, 255]),
    );
  });

  it('M21 GB6: masks (layer masks, the selection) resample with one channel', () => {
    const m = maskFromBytes(2, 1, new Uint8ClampedArray([0, 200]));
    expect([...readRegion(resampleMask(m, 4, 1, 'bilinear'))]).toEqual([0, 50, 150, 200]);
    expect([...readRegion(resampleMask(m, 4, 2, 'nearest'))]).toEqual([
      0, 0, 200, 200, 0, 0, 200, 200,
    ]);
    const flat = maskFromBytes(3, 3, new Uint8ClampedArray(9).fill(255));
    expect([...readRegion(resampleMask(flat, 7, 2, 'bicubic'))].every((v) => v === 255)).toBe(true);
  });

  it('M21 GB6: the same size comes back as it is; a size below 1 px is refused', () => {
    expect(resampleBitmap(quad, 2, 2, 'bicubic')).toBe(quad);
    expect(() => resampleBitmap(quad, 0, 2, 'bicubic')).toThrow();
    expect(() => resampleBitmap(quad, 2.5, 2, 'nearest')).toThrow();
  });

  it('M21 GN1: a 12-megapixel photo resamples in seconds', () => {
    const data = new Uint8ClampedArray(4000 * 3000 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = i & 255;
      data[i + 1] = (i >> 8) & 255;
      data[i + 3] = 255;
    }
    const photo = bitmapFromRGBA(4000, 3000, data);
    const started = performance.now();
    const out = resampleBitmap(photo, 3000, 2250, 'bicubic');
    const ms = performance.now() - started;
    expect([out.width, out.height]).toEqual([3000, 2250]);
    expect(ms).toBeLessThan(15_000);
  }, 60_000);
});
