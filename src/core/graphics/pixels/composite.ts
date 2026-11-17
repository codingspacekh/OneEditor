// G2 (M21): how a layer's pixels mix with what is below them, in pure TypeScript, for merge down,
// merge visible and flatten. These are the W3C Compositing and Blending Level 1 formulas, which
// the browser's canvas uses for globalCompositeOperation (and SVG for mix-blend-mode), so a merge
// gives the picture the stage showed, to the rounding of the canvas's 8-bit premultiplied pixels:
// checked against Chromium's canvas in Electron (2026-11-17, 400 random pixel pairs per mode,
// partly see-through and at random opacities), every mode within 2 levels where the result is
// opaque and within 3 weighted by its alpha. Colours are not premultiplied (as ImageData), 0–255.
//
// Source over with a blend (§5.8, §10): with αs the source's alpha times the layer's opacity and
// mask, αb the backdrop's,
//   Cs' = (1 − αb)·Cs + αb·B(Cb, Cs)        the source's colour, blended where there is backdrop
//   αo  = αs + αb·(1 − αs)
//   Co  = (αs·Cs' + αb·Cb·(1 − αs)) / αo
// B for the separable modes (each channel): normal Cs; multiply Cb·Cs; screen Cb + Cs − Cb·Cs;
// overlay HardLight(Cs, Cb) (multiply or screen by the backdrop); darken min; lighten max;
// difference |Cb − Cs|. The non-separable ones (§10.2): colour SetLum(Cs, Lum(Cb)), luminosity
// SetLum(Cb, Lum(Cs)), Lum = 0.3 R + 0.59 G + 0.11 B, with ClipColor keeping the result in range.
import type { BlendMode } from '../../animation/types.ts';

const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;

/** W3C SetLum (with ClipColor): the colour (r, g, b) at luminosity `l`, into `out`. */
function setLum(r: number, g: number, b: number, l: number, out: Float64Array): void {
  const d = l - lum(r, g, b);
  r += d;
  g += d;
  b += d;
  const L = lum(r, g, b);
  const n = Math.min(r, g, b);
  const x = Math.max(r, g, b);
  if (n < 0) {
    r = L + ((r - L) * L) / (L - n);
    g = L + ((g - L) * L) / (L - n);
    b = L + ((b - L) * L) / (L - n);
  }
  if (x > 1) {
    r = L + ((r - L) * (1 - L)) / (x - L);
    g = L + ((g - L) * (1 - L)) / (x - L);
    b = L + ((b - L) * (1 - L)) / (x - L);
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

/** One channel of a separable blend mode, backdrop and source 0–1. */
function separable(mode: BlendMode, cb: number, cs: number): number {
  switch (mode) {
    case 'multiply':
      return cb * cs;
    case 'screen':
      return cb + cs - cb * cs;
    case 'overlay':
      // HardLight(Cs, Cb) with the backdrop as the light.
      return cb <= 0.5 ? cs * 2 * cb : cs + (2 * cb - 1) - cs * (2 * cb - 1);
    case 'darken':
      return Math.min(cb, cs);
    case 'lighten':
      return Math.max(cb, cs);
    case 'difference':
      return Math.abs(cb - cs);
    default:
      return cs;
  }
}

/** B(Cb, Cs) for every mode, into `out` (r, g, b, 0–1). */
export function blendColour(
  mode: BlendMode,
  backdrop: readonly [number, number, number],
  source: readonly [number, number, number],
  out: Float64Array = new Float64Array(3),
): Float64Array {
  const [br, bg, bb] = backdrop;
  const [sr, sg, sb] = source;
  if (mode === 'colour') setLum(sr, sg, sb, lum(br, bg, bb), out);
  else if (mode === 'luminosity') setLum(br, bg, bb, lum(sr, sg, sb), out);
  else {
    out[0] = separable(mode, br, sr);
    out[1] = separable(mode, bg, sg);
    out[2] = separable(mode, bb, sb);
  }
  return out;
}

export interface CompositeOptions {
  /** How the source's colours mix with the backdrop's. Absent: normal. */
  blend?: BlendMode;
  /** The source's opacity, 0–1 (a layer's). Absent: 1. */
  opacity?: number;
  /**
   * How much of each source pixel shows, 0–255, one byte a pixel (a layer mask, or a clipping
   * mask's base, or both multiplied together). Absent: all of it.
   */
  mask?: Uint8ClampedArray | Uint8Array | null;
}

/**
 * Puts `source` down onto `backdrop` in place: both RGBA, not premultiplied, the same number of
 * pixels. The formulas at the top of this file.
 */
export function compositeOnto(
  backdrop: Uint8ClampedArray,
  source: Uint8ClampedArray | Uint8Array,
  { blend = 'normal', opacity = 1, mask = null }: CompositeOptions = {},
): void {
  if (source.length !== backdrop.length)
    throw new RangeError('The two pictures must have the same number of pixels.');
  if (opacity <= 0) return;
  const blended = new Float64Array(3);
  const strength = opacity / 255;
  for (let p = 0, i = 0; i < backdrop.length; p++, i += 4) {
    let as = source[i + 3]! * strength;
    if (mask) as *= mask[p]! / 255;
    if (as <= 0) continue;
    const ab = backdrop[i + 3]! / 255;
    const ao = as + ab * (1 - as);
    const sr = source[i]! / 255;
    const sg = source[i + 1]! / 255;
    const sb = source[i + 2]! / 255;
    const br = backdrop[i]! / 255;
    const bg = backdrop[i + 1]! / 255;
    const bb = backdrop[i + 2]! / 255;
    let r = sr;
    let g = sg;
    let b = sb;
    if (blend !== 'normal' && ab > 0) {
      if (blend === 'colour') setLum(sr, sg, sb, lum(br, bg, bb), blended);
      else if (blend === 'luminosity') setLum(br, bg, bb, lum(sr, sg, sb), blended);
      else {
        blended[0] = separable(blend, br, sr);
        blended[1] = separable(blend, bg, sg);
        blended[2] = separable(blend, bb, sb);
      }
      r = (1 - ab) * sr + ab * blended[0]!;
      g = (1 - ab) * sg + ab * blended[1]!;
      b = (1 - ab) * sb + ab * blended[2]!;
    }
    const under = ab * (1 - as);
    backdrop[i] = Math.round(((as * r + under * br) / ao) * 255);
    backdrop[i + 1] = Math.round(((as * g + under * bg) / ao) * 255);
    backdrop[i + 2] = Math.round(((as * b + under * bb) / ao) * 255);
    backdrop[i + 3] = Math.round(ao * 255);
  }
}

/** Two masks multiplied (either may be absent: all shown); null when both are. */
export function multiplyMasks(
  a: Uint8ClampedArray | Uint8Array | null | undefined,
  b: Uint8ClampedArray | Uint8Array | null | undefined,
): Uint8ClampedArray | Uint8Array | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.round((a[i]! * b[i]!) / 255);
  return out;
}

/** An RGBA picture's alpha, one byte a pixel (what a clipping mask's base shows). */
export function alphaOf(rgba: Uint8ClampedArray | Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let p = 0; p < out.length; p++) out[p] = rgba[p * 4 + 3]!;
  return out;
}
