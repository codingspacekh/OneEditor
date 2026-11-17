// M23 step 5 (GB5, GN2): zoom blur on 12 megapixels within GN2's 3 s, done as one-sided halvings
// (each pass averages the picture with itself scaled out from the centre, one sample read between
// pixels instead of two) and the whole moved back in at the end. Checked here against the streak
// averaged directly — 1024 samples along each pixel's line to the centre — on hard-edged squares,
// a ramp and stripes, a picture with see-through parts and a mask: within 2.5 levels on average
// (the old two-sided halvings: 1.7–2.8; the new 1.6–2.1), a few dozen at the most on the
// squares' edges, where a streak's samples fall either side of the edge. With the centre off the
// picture the edge facing it differs the most (the whole is moved in from past the edge). (The
// time on 12 megapixels is measured in tests/e2e/pixels-performance.spec.ts: 5.3 s before, 2.5 s
// now in Node.)
import { describe, expect, it, vi } from 'vitest';
import type { Point } from '../../../../../src/core/animation/geometry.ts';
import { zoomBlur } from '../../../../../src/core/graphics/pixels/filters.ts';
import {
  bitmapFromRGBA,
  maskFromBytes,
  readRegion,
  type Raster,
} from '../../../../../src/core/graphics/pixels/raster.ts';

// The reference streaks are slow on a busy computer running every file at once (coverage).
vi.setConfig({ testTimeout: 90_000 });

const W = 160;
const H = 100;

/** Squares of dark and light, a ramp and fine stripes: detail a blur drawn wrongly would show. */
function photo(holes: boolean): Raster<4> {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      px[i] = ((x >> 3) + (y >> 3)) & 1 ? 230 : 20;
      px[i + 1] = (y * 255) / H;
      px[i + 2] = (x * 7) & 255;
      px[i + 3] = holes && Math.hypot(x - 120, y - 30) < 12 ? 0 : 255;
    }
  return bitmapFromRGBA(W, H, px);
}

function ramp(): Raster<1> {
  const px = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = (x * 255) / W;
  return maskFromBytes(W, H, px);
}

/** Each pixel the mean of 1024 bilinear samples (premultiplied) along its streak, edges repeated. */
function direct(r: Raster, centre: Point, amount: number): Float64Array {
  const c = r.channels;
  const src = readRegion(r);
  const pre = new Float64Array(src.length);
  for (let i = 0; i < src.length; i += c)
    for (let ch = 0; ch < c; ch++)
      pre[i + ch] = c === 4 && ch < 3 ? (src[i + ch]! * src[i + 3]!) / 255 : src[i + ch]!;
  const a = amount / 100;
  const span = Math.log((1 + a / 2) / (1 - a / 2));
  const N = 1024;
  const out = new Float64Array(src.length);
  const clamp = (v: number, last: number) => (v < 0 ? 0 : v > last ? last : v);
  const acc = new Float64Array(c);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      acc.fill(0);
      for (let j = 0; j < N; j++) {
        const k = Math.exp(-span / 2 + ((j + 0.5) * span) / N);
        const u = centre.x + (x + 0.5 - centre.x) * k - 0.5;
        const v = centre.y + (y + 0.5 - centre.y) * k - 0.5;
        const x0 = Math.floor(u);
        const y0 = Math.floor(v);
        const fx = u - x0;
        const fy = v - y0;
        // (No arrays made per sample: 16 million samples, slow under coverage otherwise.)
        const xa = clamp(x0, W - 1);
        const xb = clamp(x0 + 1, W - 1);
        const ya = clamp(y0, H - 1) * W;
        const yb = clamp(y0 + 1, H - 1) * W;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        for (let ch = 0; ch < c; ch++)
          acc[ch] =
            acc[ch]! +
            pre[(ya + xa) * c + ch]! * w00 +
            pre[(ya + xb) * c + ch]! * w10 +
            pre[(yb + xa) * c + ch]! * w01 +
            pre[(yb + xb) * c + ch]! * w11;
      }
      const o = (y * W + x) * c;
      const alpha = c === 4 ? acc[3]! / N : 255;
      for (let ch = 0; ch < c; ch++)
        out[o + ch] =
          c === 4 && ch < 3 ? (alpha < 0.5 ? 0 : ((acc[ch]! / N) * 255) / alpha) : acc[ch]! / N;
    }
  return out;
}

/** The mean and the 99th percentile of the differences, over the pixels that show. */
function difference(r: Raster, centre: Point, amount: number) {
  const got = readRegion(zoomBlur(r, centre, amount));
  const want = direct(r, centre, amount);
  const c = r.channels;
  const d: number[] = [];
  for (let i = 0; i < got.length; i += c) {
    if (c === 4 && want[i + 3]! < 250) continue; // a see-through edge: its colour means little
    for (let ch = 0; ch < c; ch++) d.push(Math.abs(got[i + ch]! - want[i + ch]!));
  }
  d.sort((a, b) => a - b);
  return { mean: d.reduce((s, v) => s + v, 0) / d.length, p99: d[Math.floor(d.length * 0.99)]! };
}

describe('GN2 (M23): zoom blur, faster, is still the streak averaged', () => {
  for (const [what, raster, centre, amount] of [
    ['a photo, the centre a little off the middle', photo(false), { x: 70.3, y: 45.6 }, 60],
    ['a photo at the most', photo(false), { x: 70.3, y: 45.6 }, 100],
    ['a photo, a small amount', photo(false), { x: 30, y: 70 }, 15],
    ['a picture with a see-through hole', photo(true), { x: 80, y: 50 }, 50],
    ['the centre off the picture', photo(false), { x: -40, y: 130 }, 40],
    ['a mask', ramp(), { x: 100, y: 20 }, 70],
  ] as const)
    it(`GN2 (M23): ${what}: within 2.5 levels on average`, () => {
      const { mean, p99 } = difference(raster, centre, amount);
      expect(mean).toBeLessThanOrEqual(raster.channels === 1 ? 0.5 : 2.5);
      // 99 in 100 within 30 levels (the centre off the picture: 45), the squares' edges the most.
      expect(p99).toBeLessThanOrEqual(centre.x < 0 ? 45 : raster.channels === 1 ? 2 : 30);
    });
});
