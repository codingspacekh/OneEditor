// M22 step 4 (GB5): the blur and sharpen filters, each the same size as the pixels it is given and
// worked on premultiplied colour (a soft edge stays its own colour, never darker): Gaussian blur
// (a true Gaussian for small radii, three box blurs for large ones), motion blur along a line,
// zoom blur out from a centre and sharpen (an unsharp mask). Known answers on small rasters.
import { describe, expect, it } from 'vitest';
import {
  gaussianBlur,
  motionBlur,
  unsharpMask,
  zoomBlur,
} from '../../../../../src/core/graphics/pixels/filters.ts';
import {
  bitmapFromRGBA,
  createBitmap,
  createMask,
  fillRect,
  maskFromBytes,
  pixelAt,
  readRegion,
  type Bitmap,
  type Mask,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const all = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const opaque = (w: number, h: number, v: number): Bitmap =>
  fillRect(createBitmap(w, h), all(w, h), [v, v, v, 255]);
/** A black photo with one white pixel. */
const dot = (w: number, h: number, x: number, y: number): Bitmap =>
  fillRect(opaque(w, h, 0), { x, y, width: 1, height: 1 }, [255, 255, 255, 255]);
const red = (b: Bitmap, x: number, y: number) => pixelAt(b, x, y)[0];
/** A mask whose value is its x (a ramp left to right). */
const ramp = (w: number, h: number): Mask => {
  const bytes = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bytes[y * w + x] = x;
  return maskFromBytes(w, h, bytes);
};

describe('M22 GB5: Gaussian blur', () => {
  it('M22 GB5: a plain photo stays the same, its tiles the very same (nothing for undo to keep)', () => {
    const b = opaque(300, 300, 120);
    const out = gaussianBlur(b, 6);
    expect(out).toBe(b);
    expect(gaussianBlur(b, 0)).toBe(b);
  });

  it('M22 GB5: a small radius is a true Gaussian: one white pixel spreads as e^(−d²/2σ²)', () => {
    const out = gaussianBlur(dot(21, 21, 10, 10), 1);
    // 255 × g(0)², 255 × g(0) g(1), 255 × g(1)² with g the normal curve of σ 1.
    expect(red(out, 10, 10)).toBeCloseTo(40.6, -0.5);
    expect(red(out, 11, 10)).toBeCloseTo(24.6, -0.5);
    expect(red(out, 11, 11)).toBeCloseTo(14.9, -0.5);
    expect(red(out, 10, 9)).toBe(red(out, 10, 11));
    expect(red(out, 15, 10)).toBe(0);
  });

  it('M22 GB5: a large radius (three box blurs) spreads a line over σ² of variance, its total kept', () => {
    // A white column at x = 50 on black: the row across is a normal curve of σ 8.
    const w = 101;
    const b = fillRect(
      opaque(w, 20, 0),
      { x: 50, y: 0, width: 1, height: 20 },
      [255, 255, 255, 255],
    );
    const out = gaussianBlur(b, 8);
    let total = 0;
    let moment = 0;
    for (let x = 0; x < w; x++) {
      const v = red(out, x, 10)!;
      total += v;
      moment += v * (x - 50) ** 2;
    }
    expect(total).toBeGreaterThan(245);
    expect(total).toBeLessThan(265);
    expect(Math.sqrt(moment / total)).toBeCloseTo(8, -0.3);
    // Symmetric, and the same down every row (the image's own edge rows repeated, not black).
    expect(red(out, 45, 10)).toBe(red(out, 55, 10));
    expect(red(out, 50, 0)).toBe(red(out, 50, 10));
  });

  it('M22 GB5: across the strips it is worked in (256 rows), the result is seamless', () => {
    // A white row at y = 256: the column down is symmetric about it.
    const b = fillRect(
      opaque(8, 600, 0),
      { x: 0, y: 256, width: 8, height: 1 },
      [255, 255, 255, 255],
    );
    const out = gaussianBlur(b, 20);
    for (const d of [1, 10, 30, 50]) expect(red(out, 4, 256 - d)).toBe(red(out, 4, 256 + d));
    expect(red(out, 4, 256)).toBeGreaterThan(0);
  });

  it('M22 GB5: a red square on transparent keeps its red where its edge is soft (premultiplied)', () => {
    const b = fillRect(
      createBitmap(40, 40),
      { x: 15, y: 15, width: 10, height: 10 },
      [255, 0, 0, 255],
    );
    const out = gaussianBlur(b, 3);
    const edge = pixelAt(out, 13, 20);
    expect(edge[3]).toBeGreaterThan(10);
    expect(edge[3]).toBeLessThan(245);
    expect(edge.slice(0, 3)).toEqual([255, 0, 0]);
    // Far away it is still transparent, all zero.
    expect(pixelAt(out, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it('M22 GB5: a layer mask (one channel) is blurred too', () => {
    const m = fillRect(createMask(30, 1), { x: 15, y: 0, width: 15, height: 1 }, 255);
    const out = gaussianBlur(m, 2);
    expect(pixelAt(out, 14, 0)).toBeGreaterThan(50);
    expect(pixelAt(out, 14, 0)).toBeLessThan(200);
    expect(pixelAt(out, 0, 0)).toBe(0);
    expect(pixelAt(out, 29, 0)).toBe(255);
  });

  it('M22 GB5: empty (transparent) parts stay empty tiles', () => {
    const b = fillRect(
      createBitmap(600, 600),
      { x: 10, y: 10, width: 5, height: 5 },
      [0, 0, 255, 255],
    );
    const out = gaussianBlur(b, 4);
    expect(out.tiles[3]).toBeNull();
    expect(out.tiles[8]).toBeNull();
  });
});

describe('M22 GB5: motion blur', () => {
  it('M22 GB5: at 0° a white pixel streaks across, over the distance, and not up or down', () => {
    const out = motionBlur(dot(21, 21, 10, 10), 0, 4);
    for (const x of [8, 9, 10, 11, 12]) expect(red(out, x, 10)).toBe(51);
    expect(red(out, 7, 10)).toBe(0);
    expect(red(out, 13, 10)).toBe(0);
    expect(red(out, 10, 9)).toBe(0);
  });

  it('M22 GB5: at 90° it streaks up and down; at 45° up to the right', () => {
    const up = motionBlur(dot(21, 21, 10, 10), 90, 4);
    expect([red(up, 10, 8), red(up, 10, 12), red(up, 11, 10)]).toEqual([51, 51, 0]);
    const slant = motionBlur(dot(21, 21, 10, 10), 45, 4);
    // 4 px along 45° is about 3 px across: three pixels of 85 on the diagonal.
    expect([red(slant, 11, 9), red(slant, 9, 11), red(slant, 10, 10)]).toEqual([85, 85, 85]);
    expect(red(slant, 11, 11)).toBe(0);
    // Steep angles step down the rows.
    const steep = motionBlur(dot(21, 21, 10, 10), 120, 20);
    expect(red(steep, 10, 10)).toBeGreaterThan(0);
    expect(red(steep, 10 - 3, 10 - 5)).toBeGreaterThan(0);
  });

  it('M22 GB5: a plain photo stays plain to its edges; a mask is blurred too', () => {
    const b = opaque(50, 30, 90);
    expect(motionBlur(b, 30, 25)).toBe(b);
    const m = fillRect(createMask(20, 1), { x: 10, y: 0, width: 10, height: 1 }, 255);
    expect(pixelAt(motionBlur(m, 0, 2), 9, 0)).toBe(85);
    expect(motionBlur(m, 0, 0)).toBe(m);
  });

  it('M22 GB5: transparent pixels do not darken a coloured streak', () => {
    const b = fillRect(createBitmap(20, 3), { x: 10, y: 1, width: 1, height: 1 }, [0, 200, 0, 255]);
    const p = pixelAt(motionBlur(b, 0, 4), 8, 1);
    expect(p).toEqual([0, 200, 0, 51]);
  });
});

describe('M22 GB5: zoom blur', () => {
  it('M22 GB5: the centre stays sharp; further out the streak is longer, along the line to the centre', () => {
    // A white ring of dots on black, the centre a white pixel.
    let b = dot(101, 101, 50, 50);
    b = fillRect(b, { x: 90, y: 50, width: 1, height: 1 }, [255, 255, 255, 255]);
    const out = zoomBlur(b, { x: 50.5, y: 50.5 }, 30);
    expect(red(out, 50, 50)).toBe(255);
    // The dot at x 90 (40 px out) is spread along the row, not up or down.
    expect(red(out, 90, 50)).toBeLessThan(100);
    expect(red(out, 86, 50)).toBeGreaterThan(0);
    expect(red(out, 94, 50)).toBeGreaterThan(0);
    expect(red(out, 90, 45)).toBe(0);
  });

  it('M22 GB5: a plain photo stays plain; no amount, no change; a mask works', () => {
    const b = opaque(40, 40, 77);
    expect(zoomBlur(b, { x: 20, y: 20 }, 50)).toBe(b);
    expect(zoomBlur(dot(9, 9, 4, 4), { x: 0, y: 0 }, 0).tiles).toEqual(dot(9, 9, 4, 4).tiles);
    const r = ramp(64, 4);
    const out = zoomBlur(r, { x: 32, y: 2 }, 20);
    // A straight ramp averaged along itself stays about the same.
    expect(Math.abs(pixelAt(out, 50, 2) - 50)).toBeLessThanOrEqual(1);
  });
});

describe('M22 GB5: sharpen (unsharp mask)', () => {
  it('M22 GB5: an edge between grey 100 and 200 gets darker and lighter just beside it', () => {
    const b = fillRect(
      opaque(40, 4, 100),
      { x: 20, y: 0, width: 20, height: 4 },
      [200, 200, 200, 255],
    );
    const out = unsharpMask(b, { amount: 100, radius: 2, threshold: 0 });
    expect(red(out, 19, 2)).toBeLessThan(100);
    expect(red(out, 20, 2)).toBeGreaterThan(200);
    // Away from the edge: unchanged, alpha kept.
    expect(pixelAt(out, 2, 2)).toEqual([100, 100, 100, 255]);
    expect(pixelAt(out, 37, 2)).toEqual([200, 200, 200, 255]);
  });

  it('M22 GB5: the threshold leaves small differences (noise, skin) alone', () => {
    const b = fillRect(
      opaque(40, 4, 100),
      { x: 20, y: 0, width: 20, height: 4 },
      [110, 110, 110, 255],
    );
    expect(unsharpMask(b, { amount: 200, radius: 2, threshold: 20 })).toBe(b);
    expect(unsharpMask(b, { amount: 0, radius: 2, threshold: 0 })).toBe(b);
  });

  it('M22 GB5: transparent pixels stay transparent; a mask is sharpened too', () => {
    const b = bitmapFromRGBA(3, 1, new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0]));
    const out = unsharpMask(b, { amount: 100, radius: 1, threshold: 0 });
    expect(pixelAt(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(out, 1, 0)).toEqual([255, 0, 0, 255]);
    const m = fillRect(createMask(20, 1), { x: 10, y: 0, width: 10, height: 1 }, 200);
    const sharp = unsharpMask(m, { amount: 100, radius: 1, threshold: 0 });
    expect(pixelAt(sharp, 10, 0)).toBeGreaterThan(200);
    expect(readRegion(sharp).length).toBe(20);
  });
});

describe('M22 GB5: the filters at their edges', () => {
  it('M22 GB5: a blur wider than a tiny mask repeats its edge pixels', () => {
    const m = maskFromBytes(2, 1, new Uint8ClampedArray([0, 200]));
    const out = gaussianBlur(m, 3);
    expect(pixelAt(out, 0, 0)).toBeGreaterThan(0);
    expect(pixelAt(out, 1, 0)).toBeLessThan(200);
    // A mask tile of an odd number of bytes, unchanged: the very same tile.
    const odd = maskFromBytes(3, 1, new Uint8ClampedArray([9, 9, 9]));
    expect(gaussianBlur(odd, 5)).toBe(odd);
  });

  it('M22 GB5: zoom blur with the centre off the picture, past an edge or with almost nothing to do', () => {
    const b = fillRect(dot(40, 40, 20, 20), { x: 5, y: 30, width: 4, height: 4 }, [255, 0, 0, 255]);
    for (const centre of [
      { x: -50, y: -50 },
      { x: 150, y: 150 },
    ]) {
      const out = zoomBlur(b, centre, 60);
      expect(out).not.toBe(b);
      expect(pixelAt(out, 0, 0)[3]).toBe(255);
    }
    // A mask, its centre on the top edge, the streak reaching past the bottom.
    const r = ramp(64, 4);
    expect(pixelAt(zoomBlur(r, { x: 32, y: 0 }, 100), 32, 3)).toBeGreaterThanOrEqual(31);
    // A tiny picture and a small amount: streaks under a pixel, nothing changes.
    const tiny = dot(3, 3, 1, 1);
    expect(zoomBlur(tiny, { x: 1.5, y: 1.5 }, 1)).toBe(tiny);
  });

  it('M22 GB5: zoom blur keeps transparent pixels transparent', () => {
    const b = fillRect(
      createBitmap(40, 40),
      { x: 15, y: 15, width: 10, height: 10 },
      [0, 0, 255, 255],
    );
    const out = zoomBlur(b, { x: 20, y: 20 }, 40);
    expect(pixelAt(out, 1, 1)).toEqual([0, 0, 0, 0]);
    const edge = pixelAt(out, 25, 20);
    if (edge[3] > 0) expect(edge.slice(0, 3)).toEqual([0, 0, 255]);
  });

  it('M22 GB5: sharpen leaves a plain photo as it is; a faint mask with nothing left after the blur still sharpens', () => {
    const b = opaque(30, 30, 80);
    expect(unsharpMask(b, { amount: 100, radius: 3, threshold: 0 })).toBe(b);
    const faint = maskFromBytes(3, 1, new Uint8ClampedArray([0, 1, 0]));
    const out = unsharpMask(faint, { amount: 100, radius: 3, threshold: 0 });
    expect(pixelAt(out, 1, 0)).toBe(2);
  });
});
