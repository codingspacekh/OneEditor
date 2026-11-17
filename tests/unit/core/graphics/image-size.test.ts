// M21 GB6, G8: Image size (every layer scaled: pixels resampled, objects, outlines and letters
// scaled), Canvas size (the 9-point anchor, the new area transparent or a colour, shrinking crops),
// crop to a box and trim / crop to content (transparent or plain edges: O/N/19 Pearl), the pixels
// left off the canvas dropped.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createLayer,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import type {
  AnimationDoc,
  Layer,
  RectObject,
  TextObject,
} from '../../../../src/core/animation/types.ts';
import {
  ANCHORS,
  anchorOffset,
  canvasOffset,
  checkedSize,
  contentBox,
  pxToSize,
  sizeToPx,
  cropImage,
  resizeCanvas,
  resizeImage,
  scaledSize,
} from '../../../../src/core/graphics/image-size.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  readRegion,
} from '../../../../src/core/graphics/pixels/raster.ts';

const RED = [220, 20, 20, 255] as const;
const WHITE = [255, 255, 255, 255] as const;

function image(layers: Layer[], width = 100, height = 80, background = 'none'): AnimationDoc {
  const base = createAnimation({ name: 'Image' });
  return {
    ...base,
    stage: { width, height, background, fps: 24, length: 1 },
    graphic: { dpi: 96, units: 'px' },
    layers,
    guides: { x: [50], y: [40] },
  };
}

/** A pixel layer: a red box drawn on a bitmap placed at (x, y). */
function photo(x = 0, y = 0, w = 100, h = 80, box = { x: 10, y: 10, width: 20, height: 20 }) {
  return createLayer('Photo', {
    pixels: { bitmap: fillRect(createBitmap(w, h), box, RED), x, y },
  });
}

describe('M21 GB6: Image size', () => {
  it('M21 GB6: proportions kept from a new width (workbook Task 3.5: 640 px wide)', () => {
    expect(scaledSize({ width: 1600, height: 1200 }, { width: 640 })).toEqual({
      width: 640,
      height: 480,
    });
    expect(scaledSize({ width: 4000, height: 3000 }, { height: 2250 })).toEqual({
      width: 3000,
      height: 2250,
    });
    expect(scaledSize({ width: 3, height: 1 }, { width: 1 })).toEqual({ width: 1, height: 1 });
  });

  it('M21 GB6: every layer scales: pixels resampled and placed, objects, outlines and text', () => {
    const rect: RectObject = {
      ...createRect({ x: 10, y: 20, width: 30, height: 10 }),
      stroke: { colour: '#000000', width: 2, dash: 'solid' },
    };
    const text: TextObject = createText('Hi', { x: 50, y: 40, size: 20 });
    const vectors = createLayer('Shapes', { objects: [rect, text] });
    const mask = fillRect(createMask(50, 40), { x: 0, y: 0, width: 25, height: 40 }, 255);
    const layer = createLayer('Photo', {
      pixels: {
        bitmap: fillRect(createBitmap(50, 40), { x: 0, y: 0, width: 50, height: 40 }, RED),
        x: 20,
        y: 10,
        mask,
      },
    });
    const doc = image([layer, vectors]);
    const out = resizeImage(doc, { width: 200, height: 160, method: 'nearest' });
    expect(out.stage).toMatchObject({ width: 200, height: 160 });
    const p = out.layers[0]!.pixels!;
    expect([p.x, p.y, p.bitmap.width, p.bitmap.height]).toEqual([40, 20, 100, 80]);
    expect([p.mask!.width, p.mask!.height]).toEqual([100, 80]);
    expect(pixelAt(p.mask!, 49, 0)).toBe(255);
    expect(pixelAt(p.mask!, 50, 0)).toBe(0);
    const [r, t] = out.layers[1]!.objects as [RectObject, TextObject];
    expect([r.x, r.y, r.width, r.height, r.stroke!.width]).toEqual([20, 40, 60, 20, 4]);
    expect([t.x, t.y, t.size]).toEqual([100, 80, 40]);
    expect(out.guides).toEqual({ x: [100], y: [80] });
    // The document it came from is untouched.
    expect(doc.layers[0]!.pixels!.bitmap.width).toBe(50);
  });

  it('M21 GB6: sizes are exact (J/22 Balloon1 at 3000 × 2250) and the same size changes nothing', () => {
    const doc = image([photo(0, 0, 400, 300)], 400, 300);
    const out = resizeImage(doc, { width: 3000, height: 2250, method: 'bicubic' });
    expect(out.layers[0]!.pixels!.bitmap).toMatchObject({ width: 3000, height: 2250 });
    expect(resizeImage(doc, { width: 400, height: 300, method: 'bicubic' })).toBe(doc);
  });

  it('M21 GB6: refuses sizes a canvas cannot have', () => {
    const doc = image([photo()]);
    expect(() => resizeImage(doc, { width: 9000, height: 80, method: 'nearest' })).toThrow(/8192/);
    expect(() => resizeImage(doc, { width: 4, height: 80, method: 'nearest' })).toThrow();
  });
});

describe('M21 GB6: Canvas size', () => {
  it('M21 GB6: the nine anchors move the picture by none, half or all of the change', () => {
    expect(ANCHORS).toHaveLength(9);
    expect(
      anchorOffset('top-left', { width: 100, height: 80 }, { width: 140, height: 100 }),
    ).toEqual({ dx: 0, dy: 0 });
    expect(anchorOffset('centre', { width: 100, height: 80 }, { width: 140, height: 100 })).toEqual(
      {
        dx: 20,
        dy: 10,
      },
    );
    expect(
      anchorOffset('bottom-right', { width: 100, height: 80 }, { width: 140, height: 100 }),
    ).toEqual({ dx: 40, dy: 20 });
    expect(anchorOffset('left', { width: 100, height: 80 }, { width: 60, height: 41 })).toEqual({
      dx: 0,
      dy: -19,
    });
  });

  it('M21 GB6: a bigger canvas: everything moves by the anchor, the new area a colour', () => {
    const rect = createRect({ x: 10, y: 10, width: 5, height: 5 });
    const doc = image([photo(), createLayer('Shapes', { objects: [rect] })]);
    const out = resizeCanvas(doc, {
      width: 140,
      height: 100,
      anchor: 'centre',
      background: '#00ff00',
    });
    expect(out.stage).toMatchObject({ width: 140, height: 100, background: '#00ff00' });
    expect(out.layers[0]!.pixels).toMatchObject({ x: 20, y: 10 });
    expect(out.layers[0]!.pixels!.bitmap).toBe(doc.layers[0]!.pixels!.bitmap);
    expect(out.layers[1]!.objects[0]).toMatchObject({ x: 30, y: 20 });
    expect(out.guides).toEqual({ x: [70], y: [50] });
    // Transparent stays transparent when no colour is given.
    expect(
      resizeCanvas(doc, { width: 140, height: 100, anchor: 'top-left' }).stage.background,
    ).toBe('none');
  });

  it('M21 GB6, G8: a smaller canvas crops: the pixels off it are dropped', () => {
    const doc = image([photo()]);
    const out = resizeCanvas(doc, { width: 40, height: 40, anchor: 'top-left' });
    const p = out.layers[0]!.pixels!;
    expect([p.x, p.y, p.bitmap.width, p.bitmap.height]).toEqual([0, 0, 40, 40]);
    expect(pixelAt(p.bitmap, 15, 15)).toEqual([...RED]);
    // A layer left entirely off the canvas keeps one empty pixel.
    const off = resizeCanvas(image([photo(0, 0, 100, 80, { x: 70, y: 60, width: 5, height: 5 })]), {
      width: 20,
      height: 20,
      anchor: 'bottom-right',
    });
    expect(off.layers[0]!.pixels!.bitmap.width).toBeGreaterThan(0);
  });
});

describe('M21 G8: crop and trim', () => {
  it('M21 G8: crops to a typed box: pixel layers move with the objects and are cut to it', () => {
    const rect = createRect({ x: 30, y: 30, width: 5, height: 5 });
    const mask = createMask(100, 80);
    const layer = { ...photo(), pixels: { ...photo().pixels!, mask } };
    const doc = image([layer, createLayer('Shapes', { objects: [rect] })]);
    const out = cropImage(doc, { x: 10, y: 10, width: 30, height: 20 });
    expect(out.stage).toMatchObject({ width: 30, height: 20 });
    const p = out.layers[0]!.pixels!;
    expect([p.x, p.y, p.bitmap.width, p.bitmap.height]).toEqual([0, 0, 30, 20]);
    expect([p.mask!.width, p.mask!.height]).toEqual([30, 20]);
    expect(pixelAt(p.bitmap, 0, 0)).toEqual([...RED]);
    expect(out.layers[1]!.objects[0]).toMatchObject({ x: 20, y: 20 });
  });

  it('M21 G8: crop to content: the bounds of the pixels and the objects together', () => {
    const rect = createRect({ x: 60, y: 50, width: 10, height: 5 });
    const doc = image([photo(), createLayer('Shapes', { objects: [rect] })]);
    // B7: the rectangle's 2 px outline reaches 1 px further (to 71, 56).
    expect(contentBox(doc)).toEqual({ x: 10, y: 10, width: 61, height: 46 });
    // A hidden layer does not count; nothing drawn: null.
    const hidden = image([{ ...photo(), visible: false }]);
    expect(contentBox(hidden)).toBeNull();
  });

  it('M21 G8: trim plain edges: a white border counts as empty when asked (O/N/19 Pearl)', () => {
    // A pearl on white: the bitmap is all opaque, white round a red middle.
    const bitmap = fillRect(
      fillRect(createBitmap(100, 80), { x: 0, y: 0, width: 100, height: 80 }, WHITE),
      { x: 30, y: 20, width: 40, height: 30 },
      RED,
    );
    // JPEG white is not quite white: within the tolerance it is still the border.
    const near = fillRect(bitmap, { x: 0, y: 79, width: 100, height: 1 }, [250, 252, 249, 255]);
    const doc = image([createLayer('Pearl', { pixels: { bitmap: near, x: 0, y: 0 } })]);
    expect(contentBox(doc)).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(contentBox(doc, { plain: true })).toEqual({ x: 30, y: 20, width: 40, height: 30 });
    const cropped = cropImage(doc, contentBox(doc, { plain: true })!);
    expect(cropped.stage).toMatchObject({ width: 40, height: 30 });
    expect(readRegion(cropped.layers[0]!.pixels!.bitmap).every((v, i) => v === RED[i % 4])).toBe(
      true,
    );
  });

  it('M21 G8: trim plain edges on a white canvas with only shapes on it uses the shapes', () => {
    const rect = createRect({ x: 20, y: 25, width: 30, height: 20 });
    const doc = image([createLayer('Shapes', { objects: [rect] })], 100, 80, '#ffffff');
    // B7: with its 2 px outline's outer half.
    expect(contentBox(doc, { plain: true })).toEqual({ x: 19, y: 24, width: 32, height: 22 });
  });

  it('M21 G8: a hidden part of a layer mask is not content; content is kept to the canvas', () => {
    const mask = fillRect(createMask(100, 80), { x: 0, y: 0, width: 15, height: 80 }, 255);
    const masked = createLayer('Photo', {
      pixels: { ...photo().pixels!, mask },
    });
    expect(contentBox(image([masked]))).toEqual({ x: 10, y: 10, width: 5, height: 20 });
    // A bitmap reaching off the canvas: only the part on it.
    const off = photo(-15, -15);
    expect(contentBox(image([off]))).toEqual({ x: 0, y: 0, width: 15, height: 15 });
  });
});

describe('M21 GB6: sizes in px, %, cm, mm and in', () => {
  it('M21 GB6: converts a typed size to px and back (D4: px with a dpi)', () => {
    expect(sizeToPx(50, '%', 96, 640)).toBe(320);
    expect(sizeToPx(2.54, 'cm', 300, 0)).toBeCloseTo(300);
    expect(sizeToPx(1, 'in', 72, 0)).toBe(72);
    expect(sizeToPx(10, 'px', 300, 0)).toBe(10);
    expect(pxToSize(320, '%', 96, 640)).toBe(50);
    expect(pxToSize(1, '%', 96, 3)).toBe(33.3);
    expect(pxToSize(300, 'cm', 300, 0)).toBe(2.54);
    expect(pxToSize(300, 'mm', 300, 0)).toBe(25.4);
  });

  it('M21 GB6: a size is whole px from 16 to 8192 a side, or the reason', () => {
    expect(checkedSize(640.4, 480)).toEqual({ width: 640, height: 480, error: null });
    expect(checkedSize(9000, 480).error).toMatch(/width must come to between 16 and 8192/);
    expect(checkedSize(100, 3).error).toMatch(/height/);
    expect(checkedSize(NaN, 100).error).toMatch(/\?/);
  });

  it('M21 G8: a typed offset moves the picture instead of the anchor (a crop to a box)', () => {
    const change = {
      width: 30,
      height: 20,
      anchor: 'centre' as const,
      offset: { dx: -10, dy: -5 },
    };
    expect(canvasOffset(change, { width: 100, height: 80 })).toEqual({ dx: -10, dy: -5 });
    const doc = image([photo()]);
    const out = resizeCanvas(doc, change);
    const p = out.layers[0]!.pixels!;
    expect([p.x, p.y, p.bitmap.width, p.bitmap.height]).toEqual([0, 0, 30, 20]);
    expect(pixelAt(p.bitmap, 0, 5)).toEqual([...RED]);
  });
});

describe('M21 G8: trim, the edge cases', () => {
  it('M21 G8: a layer left wholly off the canvas keeps one empty pixel', () => {
    const doc = image([photo(500, 500)]);
    const out = cropImage(doc, { x: 0, y: 0, width: 20, height: 20 });
    expect(out.layers[0]!.pixels).toMatchObject({ x: 0, y: 0 });
    expect(out.layers[0]!.pixels!.bitmap).toMatchObject({ width: 1, height: 1, tiles: [null] });
  });

  it('M21 G8: the plain colour is the top-left pixel seen: through transparent and hidden pixels', () => {
    const white = (x = 0, y = 0) =>
      fillRect(createBitmap(100, 80), { x, y, width: 100 - x, height: 80 - y }, WHITE);
    const red = fillRect(white(), { x: 40, y: 30, width: 10, height: 10 }, RED);
    const under = createLayer('Under', { pixels: { bitmap: red, x: 0, y: 0 } });
    // Above it: a layer transparent at the corner, and one whose mask hides the corner.
    const above = createLayer('Above', {
      pixels: { bitmap: white(1, 1), x: 0, y: 0 },
    });
    const masked = createLayer('Masked', {
      pixels: {
        bitmap: white(),
        x: 0,
        y: 0,
        mask: fillRect(createMask(100, 80), { x: 50, y: 50, width: 50, height: 30 }, 255),
      },
    });
    const doc = image([under, above, masked]);
    // White is still the plain colour, read from the layer under them: only the red box is left.
    expect(contentBox(doc, { plain: true })).toEqual({ x: 40, y: 30, width: 10, height: 10 });
    // Transparent edges alone: the white layers count.
    expect(contentBox(doc)).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });

  it('M21 G8: a see-through corner or a transparent canvas trims transparent edges only', () => {
    const half = fillRect(
      createBitmap(100, 80),
      { x: 0, y: 0, width: 100, height: 80 },
      [255, 255, 255, 128],
    );
    const doc = image([createLayer('Glass', { pixels: { bitmap: half, x: 0, y: 0 } })]);
    expect(contentBox(doc, { plain: true })).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(contentBox(image([photo()]), { plain: true })).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
    // A background that is not a #rrggbb colour is not a plain edge either.
    expect(contentBox(image([photo(0, 0, 100, 80)], 100, 80, 'red'), { plain: true })).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it('M21 G8: nothing but the plain colour: nothing to trim to; big bitmaps skip empty tiles', () => {
    const allWhite = fillRect(createBitmap(100, 80), { x: 0, y: 0, width: 100, height: 80 }, WHITE);
    expect(
      contentBox(image([createLayer('Paper', { pixels: { bitmap: allWhite, x: 0, y: 0 } })]), {
        plain: true,
      }),
    ).toBeNull();
    // 600 × 600: the dot is in one tile of nine; the mask hides another tile wholly.
    const big = fillRect(
      fillRect(createBitmap(600, 600), { x: 300, y: 300, width: 4, height: 4 }, RED),
      { x: 10, y: 10, width: 4, height: 4 },
      RED,
    );
    const mask = fillRect(createMask(600, 600), { x: 256, y: 256, width: 344, height: 344 }, 255);
    const layer = createLayer('Big', { pixels: { bitmap: big, x: 0, y: 0, mask } });
    expect(contentBox(image([layer], 600, 600))).toEqual({ x: 300, y: 300, width: 4, height: 4 });
  });
});
