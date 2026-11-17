// M23 step 5 (GN2, GN1): Image size, Reduce colours and the pixel transforms as pixel jobs, so a
// 12-megapixel image resized or a layer turned never stalls the window. Resampling answers with
// the whole raster (another size: no tile of the old one fits); a transform answers with each of
// the layer's rasters as a patch on the one it was given, so the tiles it did not change (a
// whole-pixel move keeps them all, selected pixels moved keep those far from them) stay the very
// tiles the document holds — undo keeps only what changed (GN1); reducing colours answers with
// the tiles it changed. The same answers in the page as from the worker.
import { describe, expect, it } from 'vitest';
import type { PixelContent } from '../../../../../src/core/animation/types.ts';
import {
  answerPixelJob,
  patchFrom,
  pixelsFromAnswer,
  rasterFrom,
  runPixelJob,
} from '../../../../../src/core/graphics/pixels/jobs.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  readRegion,
  type Bitmap,
  type Raster,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import { reduceColours } from '../../../../../src/core/graphics/pixels/reduce-colours.ts';
import { resampleBitmap, resampleMask } from '../../../../../src/core/graphics/pixels/resample.ts';
import {
  matrixFor,
  pixelsBox,
  transformPixels,
  transformSelected,
  translation,
} from '../../../../../src/core/graphics/pixels/transform.ts';

/** Two rasters' pixels the same (compared as bytes: toEqual is slow on big arrays). */
const samePixels = (a: Raster, b: Raster) =>
  Buffer.from(readRegion(a).buffer).equals(Buffer.from(readRegion(b).buffer));

/** 600 × 300: a red square on white at the top left, blue at the bottom right. */
function picture(): Bitmap {
  let b = fillRect(
    createBitmap(600, 300),
    { x: 0, y: 0, width: 600, height: 300 },
    [255, 255, 255, 255],
  );
  b = fillRect(b, { x: 20, y: 20, width: 60, height: 60 }, [255, 0, 0, 255]);
  return fillRect(b, { x: 500, y: 200, width: 60, height: 60 }, [0, 0, 255, 255]);
}

const layer = (): PixelContent => ({
  bitmap: picture(),
  x: 10,
  y: 5,
  mask: fillRect(createMask(600, 300), { x: 0, y: 0, width: 300, height: 300 }, 255),
});

describe('GN2 (M23): Image size as a pixel job', () => {
  it('GN2 (M23): a bitmap and a mask resampled to another size, as resampling in the page does', () => {
    const b = picture();
    const out = runPixelJob('resample', { raster: b, width: 300, height: 150, method: 'bicubic' });
    expect(samePixels(out, resampleBitmap(b, 300, 150, 'bicubic'))).toBe(true);
    const m = layer().mask!;
    const half = runPixelJob('resample', { raster: m, width: 300, height: 150, method: 'nearest' });
    expect(half.channels).toBe(1);
    expect(samePixels(half, resampleMask(m, 300, 150, 'nearest'))).toBe(true);
  });

  it('GN2 (M23): from the worker, the new raster’s tiles handed over, each buffer once', () => {
    const { reply, transfer } = answerPixelJob({
      id: 1,
      job: 'resample',
      input: { raster: picture(), width: 1000, height: 500, method: 'bilinear' },
    });
    expect(reply).toMatchObject({ id: 1, ok: true });
    const tiles = (reply as { result: Bitmap }).result.tiles.filter((t) => t);
    expect(transfer).toHaveLength(new Set(tiles.map((t) => t!.buffer)).size);
    expect(transfer.length).toBeGreaterThan(0);
  });
});

describe('GN2 (M23): Reduce colours as a pixel job', () => {
  it('GN2 (M23): the tiles it changed, put back the same as reducing in the page', () => {
    const b = picture();
    const patch = runPixelJob('reduceColours', { bitmap: b, to: 2, dither: false });
    const after = rasterFrom(b, patch);
    expect(samePixels(after, reduceColours(b, { to: 2, dither: false }))).toBe(true);
  });
});

describe('GN2 GN1 (M23): a transform as a pixel job', () => {
  it('GN2 (M23): turned and scaled: the same pixels as in the page', () => {
    const p = layer();
    const matrix = matrixFor(pixelsBox(p), { rotate: 30, width: 400 });
    const answer = runPixelJob('transform', { pixels: p, matrix, method: 'bicubic' });
    const got = pixelsFromAnswer(p, answer).pixels;
    const want = transformPixels(p, matrix, 'bicubic');
    expect([got.x, got.y]).toEqual([want.x, want.y]);
    expect(samePixels(got.bitmap, want.bitmap)).toBe(true);
    expect(samePixels(got.mask!, want.mask!)).toBe(true);
  });

  it('GN1 (M23): moved by whole px, every tile stays the very tile the document holds', () => {
    const p = layer();
    const answer = runPixelJob('transform', {
      pixels: p,
      matrix: translation(7, -3),
      method: 'nearest',
    });
    expect(answer.pixels.bitmap.changes).toEqual([]);
    const { pixels } = pixelsFromAnswer(p, answer);
    expect([pixels.x, pixels.y]).toEqual([17, 2]);
    pixels.bitmap.tiles.forEach((t, i) => expect(t).toBe(p.bitmap.tiles[i]));
    expect(pixels.mask).toBe(p.mask);
    // Nothing to do: the very pixels back.
    const still = runPixelJob('transform', {
      pixels: p,
      matrix: translation(0, 0),
      method: 'nearest',
    });
    expect(pixelsFromAnswer(p, still).pixels).toBe(p);
  });

  it('GN1 GN2 (M23): only the selected pixels moved, the selection with them; far tiles shared', () => {
    const p = { bitmap: picture(), x: 0, y: 0 };
    const selection = fillRect(createMask(600, 300), { x: 20, y: 20, width: 60, height: 60 }, 255);
    const matrix = translation(100, 0);
    const answer = runPixelJob('transform', { pixels: p, matrix, method: 'nearest', selection });
    const got = pixelsFromAnswer(p, answer, selection);
    const want = transformSelected(p, selection, matrix, 'nearest');
    expect(samePixels(got.pixels.bitmap, want.pixels.bitmap)).toBe(true);
    expect(samePixels(got.selection!, want.selection)).toBe(true);
    expect(pixelAt(got.pixels.bitmap, 150, 50)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(got.selection!, 150, 50)).toBe(255);
    // The bottom-right tiles, far from the square, are the document's own.
    expect(got.pixels.bitmap.tiles.at(-1)).toBe(p.bitmap.tiles.at(-1));
    // From the worker only the new tiles go back.
    const { transfer } = answerPixelJob({
      id: 2,
      job: 'transform',
      input: { pixels: p, matrix, method: 'nearest', selection },
    });
    const changed =
      answer.pixels.bitmap.changes.filter(([, t]) => t).length +
      (answer.selection?.changes.filter(([, t]) => t).length ?? 0);
    expect(transfer.length).toBeLessThanOrEqual(changed);
    expect(transfer.length).toBeGreaterThan(0);
  });

  it('GN2 (M23): a patch for another size holds every tile; put back, it makes that raster', () => {
    const b = picture();
    const small = resampleBitmap(b, 100, 50, 'bilinear');
    const patch = patchFrom(b, small);
    expect([patch.width, patch.height]).toEqual([100, 50]);
    expect(samePixels(rasterFrom(b, patch), small)).toBe(true);
    expect(rasterFrom(b, patchFrom(b, b))).toBe(b);
    // Emptied tiles come back empty.
    const clear = createBitmap(600, 300);
    expect(rasterFrom(b, patchFrom(b, clear)).tiles.every((t) => t === null)).toBe(true);
  });
});
