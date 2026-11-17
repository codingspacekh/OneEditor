// M21 step 4 (GB3, G12): the paint bucket (tolerance, contiguous or every alike pixel, inside the
// selection, on the layer where it is on the image, or on its mask) and the gradient tool (a line
// dragged: linear or radial, through the fill's stops, at an opacity, on the layer or the
// selection), with known answers.
import { describe, expect, it } from 'vitest';
import {
  bucketFill,
  gradientFill,
  gradientStops,
} from '../../../../../src/core/graphics/pixels/fills.ts';
import { greyOf, rgbOf } from '../../../../../src/core/graphics/pixels/paint.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Bitmap,
  type Mask,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const WHITE = [255, 255, 255, 255];
/** 20 × 10: white, with a black wall at x = 10 cutting it in two. */
function walled(): Bitmap {
  let b = fillRect(createBitmap(20, 10), { x: 0, y: 0, width: 20, height: 10 }, WHITE);
  b = fillRect(b, { x: 10, y: 0, width: 1, height: 10 }, [0, 0, 0, 255]);
  return b;
}

describe('M21 GB3: the paint bucket', () => {
  it('fills the alike pixels joined to the one clicked with the colour', () => {
    const out = bucketFill({
      target: walled(),
      sample: walled(),
      x: 0,
      y: 0,
      at: { x: 3, y: 3 },
      tolerance: 0,
      contiguous: true,
      colour: [0, 128, 0],
      opacity: 1,
    }) as Bitmap;
    expect(pixelAt(out, 0, 0)).toEqual([0, 128, 0, 255]);
    expect(pixelAt(out, 9, 9)).toEqual([0, 128, 0, 255]);
    expect(pixelAt(out, 10, 5)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(out, 15, 5)).toEqual(WHITE);
  });

  it('not contiguous: every alike pixel of the layer', () => {
    const out = bucketFill({
      target: walled(),
      sample: walled(),
      x: 0,
      y: 0,
      at: { x: 3, y: 3 },
      tolerance: 0,
      contiguous: false,
      colour: [0, 128, 0],
      opacity: 1,
    }) as Bitmap;
    expect(pixelAt(out, 15, 5)).toEqual([0, 128, 0, 255]);
    expect(pixelAt(out, 10, 5)).toEqual([0, 0, 0, 255]);
  });

  it('the tolerance lets in colours that are near; its opacity lays the colour over', () => {
    const b = fillRect(walled(), { x: 0, y: 0, width: 5, height: 10 }, [240, 240, 240, 255]);
    const near = bucketFill({
      target: b,
      sample: b,
      x: 0,
      y: 0,
      at: { x: 7, y: 3 },
      tolerance: 0,
      contiguous: true,
      colour: [0, 0, 0],
      opacity: 0.5,
    }) as Bitmap;
    expect(pixelAt(near, 2, 2)).toEqual([240, 240, 240, 255]);
    expect(pixelAt(near, 7, 2)).toEqual([128, 128, 128, 255]);
    const wider = bucketFill({
      target: b,
      sample: b,
      x: 0,
      y: 0,
      at: { x: 7, y: 3 },
      tolerance: 20,
      contiguous: true,
      colour: [0, 0, 0],
      opacity: 1,
    }) as Bitmap;
    expect(pixelAt(wider, 2, 2)).toEqual([0, 0, 0, 255]);
  });

  it('fills only inside the selection, weighted by it, where the layer is on the image', () => {
    // The layer sits at (100, 0) on a 200 × 50 image; the left half of it is selected.
    const sel = fillRect(createMask(200, 50), { x: 100, y: 0, width: 5, height: 10 }, 255);
    const out = bucketFill({
      target: walled(),
      sample: walled(),
      x: 100,
      y: 0,
      at: { x: 103, y: 3 },
      tolerance: 0,
      contiguous: true,
      colour: [0, 0, 255],
      opacity: 1,
      selection: sel,
    }) as Bitmap;
    expect(pixelAt(out, 4, 4)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(out, 5, 4)).toEqual(WHITE);
  });

  it('a click off the layer, or on nothing selected, changes nothing', () => {
    const b = walled();
    const base = {
      target: b,
      sample: b,
      x: 0,
      y: 0,
      tolerance: 0,
      contiguous: true,
      colour: [0, 0, 0] as const,
      opacity: 1,
    };
    expect(bucketFill({ ...base, at: { x: 50, y: 3 } })).toBe(b);
    expect(bucketFill({ ...base, at: { x: 3, y: 3 }, selection: createMask(20, 10) })).toBe(b);
  });

  it('on a layer mask: the picture’s alike region painted with the colour’s grey', () => {
    const mask = fillRect(createMask(20, 10), { x: 0, y: 0, width: 20, height: 10 }, 255);
    const out = bucketFill({
      target: mask,
      sample: walled(),
      x: 0,
      y: 0,
      at: { x: 3, y: 3 },
      tolerance: 0,
      contiguous: true,
      colour: [0, 0, 0],
      opacity: 1,
    }) as Mask;
    expect(pixelAt(out, 3, 3)).toBe(0);
    expect(pixelAt(out, 15, 3)).toBe(255);
  });
});

describe('M21 GB3: the gradient tool', () => {
  const stops = gradientStops('#000000', '#ffffff');

  it('linear: the first colour before the line’s start, the last after its end, mixed between', () => {
    const out = gradientFill({
      target: createBitmap(101, 3),
      x: 0,
      y: 0,
      from: { x: 0.5, y: 1 },
      to: { x: 100.5, y: 1 },
      kind: 'linear',
      stops,
      opacity: 1,
    }) as Bitmap;
    expect(pixelAt(out, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(out, 100, 2)).toEqual([255, 255, 255, 255]);
    const mid = pixelAt(out, 50, 1);
    expect(mid[0]).toBeGreaterThanOrEqual(126);
    expect(mid[0]).toBeLessThanOrEqual(129);
    expect(mid[3]).toBe(255);
  });

  it('follows the line’s direction (top to bottom here)', () => {
    const out = gradientFill({
      target: createBitmap(4, 11),
      x: 0,
      y: 0,
      from: { x: 2, y: 0.5 },
      to: { x: 2, y: 10.5 },
      kind: 'linear',
      stops,
      opacity: 1,
    }) as Bitmap;
    expect(pixelAt(out, 0, 0)[0]).toBe(0);
    expect(pixelAt(out, 3, 0)[0]).toBe(0);
    expect(pixelAt(out, 0, 10)[0]).toBe(255);
  });

  it('radial: from the line’s start outwards to its length', () => {
    const out = gradientFill({
      target: createBitmap(41, 41),
      x: 0,
      y: 0,
      from: { x: 20.5, y: 20.5 },
      to: { x: 40.5, y: 20.5 },
      kind: 'radial',
      stops,
      opacity: 1,
    }) as Bitmap;
    expect(pixelAt(out, 20, 20)[0]).toBe(0);
    expect(pixelAt(out, 0, 0)[0]).toBe(255);
    const half = pixelAt(out, 20, 30)[0];
    expect(half).toBeGreaterThanOrEqual(126);
    expect(half).toBeLessThanOrEqual(129);
  });

  it('goes through the colours between at their places', () => {
    const three = gradientStops('#ff0000', '#0000ff', [{ at: 50, colour: '#00ff00' }]);
    const out = gradientFill({
      target: createBitmap(101, 1),
      x: 0,
      y: 0,
      from: { x: 0.5, y: 0 },
      to: { x: 100.5, y: 0 },
      kind: 'linear',
      stops: three,
      opacity: 1,
    }) as Bitmap;
    expect(pixelAt(out, 50, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(out, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(out, 100, 0)).toEqual([0, 0, 255, 255]);
  });

  it('at an opacity, over what is there, inside the selection only', () => {
    const white = fillRect(createBitmap(10, 10), { x: 0, y: 0, width: 10, height: 10 }, WHITE);
    const sel = fillRect(createMask(10, 10), { x: 0, y: 0, width: 5, height: 10 }, 255);
    const out = gradientFill({
      target: white,
      x: 0,
      y: 0,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0.001 },
      kind: 'linear',
      stops: gradientStops('#000000', '#000000'),
      opacity: 0.5,
      selection: sel,
    }) as Bitmap;
    expect(pixelAt(out, 2, 5)).toEqual([128, 128, 128, 255]);
    expect(pixelAt(out, 7, 5)).toEqual(WHITE);
    expect(out.tiles[0]).not.toBe(white.tiles[0]);
  });

  it('on a layer mask: greys from the colours (a mask fading the layer out)', () => {
    const out = gradientFill({
      target: createMask(101, 1),
      x: 0,
      y: 0,
      from: { x: 0.5, y: 0 },
      to: { x: 100.5, y: 0 },
      kind: 'linear',
      stops: gradientStops('#ffffff', '#000000'),
      opacity: 1,
    }) as Mask;
    expect(pixelAt(out, 0, 0)).toBe(255);
    expect(pixelAt(out, 100, 0)).toBe(0);
  });

  it('a line of no length is refused', () => {
    expect(() =>
      gradientFill({
        target: createBitmap(4, 4),
        x: 0,
        y: 0,
        from: { x: 1, y: 1 },
        to: { x: 1, y: 1 },
        kind: 'linear',
        stops,
        opacity: 1,
      }),
    ).toThrow('Drag a line for the gradient.');
  });

  it('a colour between at the very start takes over from there', () => {
    const out = gradientFill({
      target: createBitmap(10, 1),
      x: 0,
      y: 0,
      from: { x: 0, y: 0 },
      to: { x: 10, y: 0 },
      kind: 'linear',
      stops: gradientStops('#000000', '#ff0000', [{ at: 0, colour: '#ff0000' }]),
      opacity: 1,
    }) as Bitmap;
    expect(pixelAt(out, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it('reads colours as hex (anything else is black) and paints their grey on a mask', () => {
    expect(rgbOf('#FF8000')).toEqual([255, 128, 0]);
    expect(rgbOf('orange')).toEqual([0, 0, 0]);
    expect(greyOf([255, 255, 255])).toBe(255);
    expect(greyOf([255, 0, 0])).toBe(76);
  });

  it('its stops: the first and last colours with the ones between in order', () => {
    expect(
      gradientStops('#000000', '#ffffff', [
        { at: 75, colour: '#ff0000' },
        { at: 25, colour: '#00ff00' },
      ]),
    ).toEqual([
      { offset: 0, rgb: [0, 0, 0] },
      { offset: 0.25, rgb: [0, 255, 0] },
      { offset: 0.75, rgb: [255, 0, 0] },
      { offset: 1, rgb: [255, 255, 255] },
    ]);
  });
});
