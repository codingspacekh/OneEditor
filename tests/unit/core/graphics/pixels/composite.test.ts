// G2 (M21): the W3C Compositing and Blending formulas the merges use — known answers, worked by
// hand from the formulas at the top of composite.ts (the ones the canvas draws the stage with).
import { describe, expect, it } from 'vitest';
import {
  alphaOf,
  blendColour,
  compositeOnto,
  multiplyMasks,
} from '../../../../../src/core/graphics/pixels/composite.ts';
import type { BlendMode } from '../../../../../src/core/animation/types.ts';

/** One source pixel put down on one backdrop pixel. */
function put(
  backdrop: number[],
  source: number[],
  blend: BlendMode = 'normal',
  opacity = 1,
  mask?: number,
): number[] {
  const out = new Uint8ClampedArray(backdrop);
  compositeOnto(out, new Uint8ClampedArray(source), {
    blend,
    opacity,
    ...(mask !== undefined ? { mask: new Uint8ClampedArray([mask]) } : {}),
  });
  return [...out];
}

describe('M21 G2: source over (normal), opacity and masks', () => {
  it('fades by the opacity: red at 50 % over blue is purple', () => {
    expect(put([0, 0, 255, 255], [255, 0, 0, 255], 'normal', 0.5)).toEqual([128, 0, 128, 255]);
  });

  it('keeps the colour on a transparent backdrop, with the alpha it had', () => {
    expect(put([0, 0, 0, 0], [255, 0, 0, 128])).toEqual([255, 0, 0, 128]);
    // Two half-transparent layers make three quarters, two thirds of it the one on top.
    expect(put([0, 0, 255, 128], [255, 0, 0, 128])).toEqual([170, 0, 85, 192]);
  });

  it('shows the source only as much as its mask does', () => {
    expect(put([0, 0, 255, 255], [255, 0, 0, 255], 'normal', 1, 128)).toEqual([128, 0, 127, 255]);
    expect(put([0, 0, 255, 255], [255, 0, 0, 255], 'normal', 1, 0)).toEqual([0, 0, 255, 255]);
  });

  it('changes nothing for an opacity of 0 or a transparent source', () => {
    expect(put([1, 2, 3, 4], [255, 255, 255, 255], 'multiply', 0)).toEqual([1, 2, 3, 4]);
    expect(put([1, 2, 3, 4], [255, 255, 255, 0], 'screen')).toEqual([1, 2, 3, 4]);
  });

  it('refuses pictures of two sizes', () => {
    expect(() => compositeOnto(new Uint8ClampedArray(4), new Uint8ClampedArray(8))).toThrow(
      /same number/,
    );
  });
});

describe('M21 G2: the nine blend modes', () => {
  it('multiply: darker, as two slides on a light box', () => {
    expect(put([255, 0, 128, 255], [128, 128, 128, 255], 'multiply')).toEqual([128, 0, 64, 255]);
  });

  it('screen: lighter', () => {
    expect(put([128, 128, 128, 255], [128, 128, 128, 255], 'screen')).toEqual([192, 192, 192, 255]);
  });

  it('overlay: multiply on the dark parts of the backdrop, screen on the light', () => {
    expect(put([64, 192, 128, 255], [255, 0, 255, 255], 'overlay')).toEqual([128, 129, 255, 255]);
  });

  it('darken and lighten: the darker or lighter of each channel', () => {
    expect(put([150, 100, 50, 255], [100, 200, 50, 255], 'darken')).toEqual([100, 100, 50, 255]);
    expect(put([150, 100, 50, 255], [100, 200, 50, 255], 'lighten')).toEqual([150, 200, 50, 255]);
  });

  it('difference: how far apart the channels are', () => {
    expect(put([50, 200, 0, 255], [200, 50, 0, 255], 'difference')).toEqual([150, 150, 0, 255]);
  });

  it('colour: the hue and saturation of the source at the brightness of the backdrop', () => {
    // SetLum(red, Lum(grey 128)): (1.20, 0.20, 0.20) clipped into range → (1, 0.289, 0.289).
    expect(put([128, 128, 128, 255], [255, 0, 0, 255], 'colour')).toEqual([255, 74, 74, 255]);
    // Onto black, every colour is black (ClipColor's lower branch).
    expect(put([0, 0, 0, 255], [0, 0, 255, 255], 'colour')).toEqual([0, 0, 0, 255]);
  });

  it('luminosity: the brightness of the source with the colour of the backdrop', () => {
    expect(put([255, 0, 0, 255], [128, 128, 128, 255], 'luminosity')).toEqual([255, 74, 74, 255]);
  });

  it('blends only where there is backdrop: half there, half the plain source', () => {
    // Cs' = (1 − 0.502)·red + 0.502·multiply(green, red) = (0.498, 0, 0).
    expect(put([0, 255, 0, 128], [255, 0, 0, 255], 'multiply')).toEqual([127, 0, 0, 255]);
    // No backdrop at all: the source as it is.
    expect(put([0, 0, 0, 0], [10, 20, 30, 255], 'difference')).toEqual([10, 20, 30, 255]);
  });

  it('gives B(Cb, Cs) on its own for each mode', () => {
    const b = (mode: BlendMode) => [...blendColour(mode, [0.25, 0.5, 1], [0.5, 0.5, 0])];
    expect(b('normal')).toEqual([0.5, 0.5, 0]);
    expect(b('multiply')).toEqual([0.125, 0.25, 0]);
    expect(b('screen')).toEqual([0.625, 0.75, 1]);
    expect(b('overlay')).toEqual([0.25, 0.5, 1]);
    expect(b('darken')).toEqual([0.25, 0.5, 0]);
    expect(b('lighten')).toEqual([0.5, 0.5, 1]);
    expect(b('difference')).toEqual([0.25, 0, 1]);
    const lum = ([r, g, bl]: number[]) => 0.3 * r! + 0.59 * g! + 0.11 * bl!;
    expect(lum(b('colour'))).toBeCloseTo(lum([0.25, 0.5, 1]), 9);
    expect(lum(b('luminosity'))).toBeCloseTo(lum([0.5, 0.5, 0]), 9);
  });
});

describe('M21 G2: masks', () => {
  it('multiplies two masks, either of which may be absent', () => {
    expect(multiplyMasks(null, undefined)).toBeNull();
    const a = new Uint8ClampedArray([255, 128, 0]);
    expect(multiplyMasks(a, null)).toBe(a);
    expect(multiplyMasks(null, a)).toBe(a);
    expect([...multiplyMasks(a, new Uint8ClampedArray([128, 128, 255]))!]).toEqual([128, 64, 0]);
  });

  it('takes a picture’s alpha', () => {
    expect([...alphaOf(new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]))]).toEqual([4, 8]);
  });
});
