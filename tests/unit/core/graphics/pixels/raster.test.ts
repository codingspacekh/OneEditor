// M21 step 1 (D3, GN1): the tiled raster under every pixel layer, mask and selection — 256 × 256
// tiles (smaller at the right and bottom edges), a tile that is all zero kept as null, and every
// edit copying only the tiles it touches, so an undo step costs only the tiles it changed.
import { describe, expect, it } from 'vitest';
import {
  TILE,
  bitmapFromRGBA,
  contentBounds,
  createBitmap,
  createMask,
  cropRaster,
  editRegion,
  fillRect,
  maskFromAlpha,
  pixelAt,
  rasterBytes,
  readRegion,
  sharedBytes,
  tileRect,
  tilesAcross,
  tilesDown,
  translateRaster,
  writeRegion,
  type Bitmap,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const solid = (w: number, h: number, rgba: [number, number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  new Uint32Array(data.buffer).fill(new Uint32Array(new Uint8ClampedArray(rgba).buffer)[0]!);
  return data;
};

/** Byte for byte (toEqual on a large typed array is slow). */
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe('M21 GN1: a tiled raster', () => {
  it('splits an image into 256 px tiles, the last ones cut to the edge', () => {
    const b = createBitmap(600, 300);
    expect(TILE).toBe(256);
    expect([tilesAcross(b), tilesDown(b)]).toEqual([3, 2]);
    expect(b.tiles).toHaveLength(6);
    expect(b.tiles.every((t) => t === null)).toBe(true);
    expect(tileRect(b, 2)).toEqual({ x: 512, y: 0, width: 88, height: 256 });
    expect(tileRect(b, 5)).toEqual({ x: 512, y: 256, width: 88, height: 44 });
    expect(rasterBytes(b)).toBe(0);
  });

  it('refuses a raster with no pixels or of an impossible size', () => {
    expect(() => createBitmap(0, 10)).toThrow();
    expect(() => createBitmap(10.5, 10)).toThrow();
    expect(() => createMask(10, -1)).toThrow();
  });

  it('round-trips RGBA pixels, keeping wholly transparent tiles as null', () => {
    const w = 300;
    const h = 270;
    const data = new Uint8ClampedArray(w * h * 4);
    // One red pixel in the second tile across, the rest transparent.
    data.set([255, 0, 0, 255], (10 * w + 280) * 4);
    const b = bitmapFromRGBA(w, h, data);
    expect(b.tiles.map((t) => t !== null)).toEqual([false, true, false, false]);
    expect(pixelAt(b, 280, 10)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(b, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(same(readRegion(b), data)).toBe(true);
    expect(rasterBytes(b)).toBe(44 * 256 * 4);
  });

  it('refuses pixels of the wrong length', () => {
    expect(() => bitmapFromRGBA(2, 2, new Uint8ClampedArray(15))).toThrow();
  });

  it('reads any region, outside the raster as zero', () => {
    const b = bitmapFromRGBA(4, 4, solid(4, 4, [1, 2, 3, 4]));
    const r = readRegion(b, { x: 2, y: 2, width: 4, height: 3 });
    expect(r).toHaveLength(4 * 3 * 4);
    expect([...r.slice(0, 8)]).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    expect([...r.slice(8, 16)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...r.slice(32)]).toEqual(new Array(16).fill(0));
  });

  it('writes a region by copying only the tiles it touches (copy on write)', () => {
    const before = bitmapFromRGBA(600, 600, solid(600, 600, [9, 9, 9, 255]));
    const after = writeRegion(
      before,
      { x: 250, y: 10, width: 10, height: 5 },
      solid(10, 5, [200, 0, 0, 255]),
    );
    expect(pixelAt(after, 255, 12)).toEqual([200, 0, 0, 255]);
    expect(pixelAt(before, 255, 12)).toEqual([9, 9, 9, 255]);
    // Tiles 0 and 1 (across the 256 line) changed; the other seven are the very same arrays.
    const kept = after.tiles.map((t, i) => t === before.tiles[i]);
    expect(kept).toEqual([false, false, true, true, true, true, true, true, true]);
    expect(sharedBytes(before, after)).toBe(rasterBytes(after) - 2 * 256 * 256 * 4);
  });

  it('gives back the raster itself when nothing changes', () => {
    const b = bitmapFromRGBA(10, 10, solid(10, 10, [5, 5, 5, 255]));
    expect(writeRegion(b, { x: 2, y: 2, width: 3, height: 3 }, solid(3, 3, [5, 5, 5, 255]))).toBe(
      b,
    );
    expect(writeRegion(b, { x: 20, y: 20, width: 3, height: 3 }, solid(3, 3, [1, 1, 1, 1]))).toBe(
      b,
    );
    expect(editRegion(b, { x: 0, y: 0, width: 10, height: 10 }, () => false)).toBe(b);
  });

  it('edits pixels in place on copies of the tiles, a tile left all zero becoming null', () => {
    const b = bitmapFromRGBA(300, 10, solid(300, 10, [7, 7, 7, 255]));
    const cleared = editRegion(b, { x: 256, y: 0, width: 44, height: 10 }, (data) => {
      data.fill(0);
      return true;
    });
    expect(cleared.tiles[1]).toBeNull();
    expect(cleared.tiles[0]).toBe(b.tiles[0]);
    // The callback is given each tile's part of the region and where it is in the image.
    const seen: { x: number; y: number; width: number; height: number }[] = [];
    editRegion(b, { x: 250, y: 2, width: 10, height: 3 }, (_d, at) => {
      seen.push(at);
      return false;
    });
    expect(seen).toEqual([
      { x: 0, y: 0, width: 256, height: 10 },
      { x: 256, y: 0, width: 44, height: 10 },
    ]);
  });

  it('fills a rectangle, clipped to the raster', () => {
    const m = fillRect(createMask(300, 300), { x: -10, y: 250, width: 30, height: 100 }, 255);
    expect(pixelAt(m, 0, 299)).toBe(255);
    expect(pixelAt(m, 19, 250)).toBe(255);
    expect(pixelAt(m, 20, 250)).toBe(0);
    expect(m.tiles.map((t) => t !== null)).toEqual([true, false, true, false]);
    const b = fillRect(createBitmap(4, 4), { x: 1, y: 1, width: 2, height: 2 }, [10, 20, 30, 255]);
    expect(pixelAt(b, 1, 2)).toEqual([10, 20, 30, 255]);
  });

  it('finds the bounds of what is not transparent (crop to content: O/N/19 pearl)', () => {
    const data = new Uint8ClampedArray(600 * 400 * 4);
    data.set([1, 1, 1, 1], (100 * 600 + 300) * 4);
    data.set([1, 1, 1, 1], (350 * 600 + 520) * 4);
    const b = bitmapFromRGBA(600, 400, data);
    expect(contentBounds(b)).toEqual({ x: 300, y: 100, width: 221, height: 251 });
    expect(contentBounds(createBitmap(5, 5))).toBeNull();
    expect(
      contentBounds(fillRect(createMask(5, 5), { x: 1, y: 2, width: 1, height: 1 }, 3)),
    ).toEqual({
      x: 1,
      y: 2,
      width: 1,
      height: 1,
    });
  });

  it('crops to a rectangle, which may reach past the raster (transparent there)', () => {
    const b = bitmapFromRGBA(4, 4, solid(4, 4, [1, 2, 3, 255]));
    const c = cropRaster(b, { x: 2, y: -1, width: 4, height: 2 });
    expect([c.width, c.height]).toEqual([4, 2]);
    expect(pixelAt(c, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(c, 0, 1)).toEqual([1, 2, 3, 255]);
    expect(pixelAt(c, 2, 1)).toEqual([0, 0, 0, 0]);
  });

  it('moves pixels by whole px within the same size', () => {
    const b = fillRect(createMask(300, 4), { x: 0, y: 0, width: 1, height: 1 }, 255);
    const moved = translateRaster(b, 290, 3);
    expect(pixelAt(moved, 290, 3)).toBe(255);
    expect(pixelAt(moved, 0, 0)).toBe(0);
  });

  it('makes a mask from a bitmap’s alpha (a selection from a layer’s pixels)', () => {
    const data = solid(2, 1, [0, 0, 0, 0]);
    data[7] = 128;
    const m = maskFromAlpha(bitmapFromRGBA(2, 1, data));
    expect(m.channels).toBe(1);
    expect([pixelAt(m, 0, 0), pixelAt(m, 1, 0)]).toEqual([0, 128]);
  });

  it('keeps 50 brush-sized undo steps of a 12-megapixel photo within GN1', () => {
    const w = 4128;
    const h = 2322;
    let b: Bitmap = bitmapFromRGBA(w, h, solid(w, h, [80, 120, 160, 255]));
    const steps: Bitmap[] = [b];
    for (let i = 0; i < 50; i++) {
      b = writeRegion(
        b,
        { x: 40 * i, y: 30 * i, width: 60, height: 60 },
        solid(60, 60, [i, 0, 0, 255]),
      );
      steps.push(b);
    }
    // Every distinct tile once: the photo plus at most 4 tiles per stroke.
    const distinct = new Set(steps.flatMap((s) => s.tiles));
    const bytes = [...distinct].reduce((n, t) => n + (t?.byteLength ?? 0), 0);
    expect(bytes).toBeLessThan(rasterBytes(b) + 50 * 4 * TILE * TILE * 4);
  });
});
