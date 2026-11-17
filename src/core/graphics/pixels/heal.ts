// M22 (GB5, D8): the heal brush's second half. The stroke is first a clone (the source's texture
// copied over what is removed); when the pointer is let go, the colour and light of the copy are
// matched to the destination's surroundings: along the stroke's border the difference between
// what was there and what was copied is measured, and that difference is spread smoothly over the
// inside (a membrane: Laplace's equation, solved coarse to fine with Gauss–Seidel sweeps), then
// added to the copy. The texture of the source stays; its brightness and tint become those
// around the stroke, so the seams vanish on sky, sea, sand and walls (Pérez et al., "Poisson
// image editing", 2003 — the guidance field being the source's own gradients).
import type { StrokeWeights } from './brush.ts';
import type { PixelSource } from './retouch.ts';
import { readRegion, type Mask, type Raster } from './raster.ts';

/** A grid point's part in the solve. */
const VOID = 0; // outside the image, or transparent: no say (its neighbours ignore it)
const KNOWN = 1; // round the stroke: the difference is measured here
const INSIDE = 2; // under the stroke: the difference is worked out here

/**
 * Gauss–Seidel sweeps, over-relaxed, at each level of the coarse-to-fine solve; fewer on a big
 * level (started near the answer, they leave it within a level or two of 0–255: unseen), so a
 * stroke over a whole balloon on a 12-megapixel photo heals in well under a second (GN2).
 */
const SWEEPS = 40;
const BIG_LEVEL = 50_000;
const BIG_SWEEPS = 12;
const OMEGA = 1.8;
/** A level this small is solved outright (many sweeps). */
const SMALLEST = 24;
const OUTRIGHT = 800;

/**
 * Sweeps over the inside points; `values` holds `n` numbers a point. Each inside point's
 * neighbours that have a say are worked out once (`flags`: left, right, up, down).
 */
function sweep(
  w: number,
  h: number,
  state: Uint8Array,
  values: Float32Array,
  n: number,
  inside: Int32Array,
  times: number,
  tolerance = 0,
): void {
  const flags = new Uint8Array(inside.length);
  const share = new Float32Array(inside.length);
  for (let j = 0; j < inside.length; j++) {
    const p = inside[j]!;
    const x = p % w;
    let f = 0;
    if (x > 0 && state[p - 1] !== VOID) f |= 1;
    if (x < w - 1 && state[p + 1] !== VOID) f |= 2;
    if (p >= w && state[p - w] !== VOID) f |= 4;
    if (p < w * (h - 1) && state[p + w] !== VOID) f |= 8;
    flags[j] = f;
    const count = (f & 1) + ((f >> 1) & 1) + ((f >> 2) & 1) + ((f >> 3) & 1);
    share[j] = count ? 1 / count : 0;
  }
  const up = w * n;
  for (let t = 0; t < times; t++) {
    let most = 0;
    for (let j = 0; j < inside.length; j++) {
      const f = flags[j]!;
      if (f === 0) continue;
      const k = inside[j]! * n;
      const s = share[j]!;
      for (let c = 0; c < n; c++) {
        const q = k + c;
        let sum = 0;
        if (f & 1) sum += values[q - n]!;
        if (f & 2) sum += values[q + n]!;
        if (f & 4) sum += values[q - up]!;
        if (f & 8) sum += values[q + up]!;
        const change = OMEGA * (sum * s - values[q]!);
        values[q] = values[q]! + change;
        if (change > most) most = change;
        else if (-change > most) most = -change;
      }
    }
    if (most < tolerance) return;
  }
}

/** How far round each border point its differences are averaged, px. */
const BORDER_MEAN = 3;

/**
 * Each KNOWN point's values replaced by the mean of the KNOWN points within `r` (a box): on a
 * busy texture (leaves, sand) the difference between destination and copy jumps from pixel to
 * pixel, and only its colour and light, not its noise, should be spread inside.
 */
export function smoothKnown(
  w: number,
  h: number,
  state: Uint8Array,
  values: Float32Array,
  n: number,
  r: number,
): void {
  // Summed-area tables of the known values and of how many are known.
  const W = w + 1;
  const sums = new Float64Array(W * (h + 1) * n);
  const counts = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const q = (y + 1) * W + x + 1;
      const known = state[p] === KNOWN ? 1 : 0;
      counts[q] = known + counts[q - 1]! + counts[q - W]! - counts[q - W - 1]!;
      for (let c = 0; c < n; c++)
        sums[q * n + c] =
          (known ? values[p * n + c]! : 0) +
          sums[(q - 1) * n + c]! +
          sums[(q - W) * n + c]! -
          sums[(q - W - 1) * n + c]!;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (state[p] !== KNOWN) continue;
      const [ax, ay] = [Math.max(0, x - r), Math.max(0, y - r)];
      const [bx, by] = [Math.min(w, x + r + 1), Math.min(h, y + r + 1)];
      const [a, b, cq, d] = [ay * W + ax, ay * W + bx, by * W + ax, by * W + bx];
      const count = counts[d]! - counts[b]! - counts[cq]! + counts[a]!;
      for (let c = 0; c < n; c++)
        values[p * n + c] =
          (sums[d * n + c]! - sums[b * n + c]! - sums[cq * n + c]! + sums[a * n + c]!) / count;
    }
}

const insideOf = (state: Uint8Array): Int32Array => {
  let count = 0;
  for (let p = 0; p < state.length; p++) if (state[p] === INSIDE) count++;
  const out = new Int32Array(count);
  for (let p = 0, j = 0; p < state.length; p++) if (state[p] === INSIDE) out[j++] = p;
  return out;
};

/**
 * Laplace's equation on the INSIDE points, with the KNOWN points' values held: a smooth surface
 * through the border's values. Solved on a grid half the size first (a point there is known
 * where any of its four is, at their mean, so a border one pixel wide is kept; else inside where
 * any is), which starts the sweeps here near the answer.
 */
export function solveMembrane(
  w: number,
  h: number,
  state: Uint8Array,
  values: Float32Array,
  n: number,
): void {
  const inside = insideOf(state);
  if (inside.length === 0) return;
  if (Math.min(w, h) <= SMALLEST) {
    sweep(w, h, state, values, n, inside, OUTRIGHT, 0.01);
    return;
  }
  const cw = Math.ceil(w / 2);
  const ch = Math.ceil(h / 2);
  const cstate = new Uint8Array(cw * ch);
  const cvalues = new Float32Array(cw * ch * n);
  const counts = new Uint8Array(cw * ch);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const q = (y >> 1) * cw + (x >> 1);
      if (state[p] === KNOWN) {
        cstate[q] = KNOWN;
        for (let c = 0; c < n; c++) cvalues[q * n + c]! += values[p * n + c]!;
        counts[q]!++;
      } else if (state[p] === INSIDE && cstate[q] === VOID) cstate[q] = INSIDE;
    }
  for (let q = 0; q < cw * ch; q++)
    if (cstate[q] === KNOWN) for (let c = 0; c < n; c++) cvalues[q * n + c]! /= counts[q]!;
  solveMembrane(cw, ch, cstate, cvalues, n);
  for (const p of inside) {
    const q = (Math.floor(p / w) >> 1) * cw + ((p % w) >> 1);
    for (let c = 0; c < n; c++) values[p * n + c] = cvalues[q * n + c]!;
  }
  sweep(w, h, state, values, n, inside, inside.length > BIG_LEVEL ? BIG_SWEEPS : SWEEPS);
}

/** A border difference this far (levels) from the rest's plane is a stray; never less. */
const STRAY = 60;
/** …and at least this many times the border's usual spread (its median distance). */
const STRAY_SPREAD = 4 * 1.4826;
/** Strays are left out only while they are fewer than this share of the border. */
const STRAYS_AT_MOST = 0.4;

const medianOf = (xs: Float32Array): number => {
  if (xs.length === 0) return 0;
  const sorted = Float32Array.from(xs).sort();
  return sorted[sorted.length >> 1]!;
};

/**
 * B5: border points whose difference between destination and copy is far out of line with the
 * rest of the border's (a plane through them: the light changes evenly across a sky) have no say.
 * There the copy or the destination is something else — the source's border on the object being
 * removed (a big brush with the source near it), a lamp post beside the stroke — and spread
 * inside, that difference is a glare or a smear. Fitted robustly: first round the medians, then a
 * plane through the points kept, twice. Nothing is left out if the strays would be too many.
 */
export function leaveOutStrays(w: number, state: Uint8Array, values: Float32Array, n: number) {
  const known: number[] = [];
  for (let p = 0; p < state.length; p++) if (state[p] === KNOWN) known.push(p);
  if (known.length < 16) return;
  const m = known.length;
  // The fit, a channel: v ≈ a + b x + c y (b = c = 0 at first: the medians).
  const fit = Array.from({ length: n }, (_, c) => {
    const vs = new Float32Array(m);
    for (let j = 0; j < m; j++) vs[j] = values[known[j]! * n + c]!;
    return [medianOf(vs), 0, 0];
  });
  const residual = new Float32Array(m);
  const keep = new Uint8Array(m).fill(1);
  const measure = () => {
    for (let j = 0; j < m; j++) {
      const p = known[j]!;
      const [x, y] = [p % w, Math.floor(p / w)];
      let r = 0;
      for (let c = 0; c < n; c++) {
        const [a, b, cc] = fit[c]!;
        r = Math.max(r, Math.abs(values[p * n + c]! - (a! + b! * x + cc! * y)));
      }
      residual[j] = r;
    }
    const kept = residual.filter((_, j) => keep[j] === 1);
    const limit = Math.max(STRAY, STRAY_SPREAD * medianOf(kept));
    for (let j = 0; j < m; j++) keep[j] = residual[j]! <= limit ? 1 : 0;
  };
  const refit = () => {
    for (let c = 0; c < n; c++) {
      // Least squares over the points kept: the normal equations, 3 × 3.
      let [s1, sx, sy, sxx, sxy, syy, sv, sxv, syv] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let j = 0; j < m; j++) {
        if (!keep[j]) continue;
        const p = known[j]!;
        const [x, y, v] = [p % w, Math.floor(p / w), values[p * n + c]!];
        s1++;
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
        syy += y * y;
        sv += v;
        sxv += x * v;
        syv += y * v;
      }
      const det = (a: number[]) =>
        a[0]! * (a[4]! * a[8]! - a[5]! * a[7]!) -
        a[1]! * (a[3]! * a[8]! - a[5]! * a[6]!) +
        a[2]! * (a[3]! * a[7]! - a[4]! * a[6]!);
      const A = [s1, sx, sy, sx, sxx, sxy, sy, sxy, syy];
      const d = det(A);
      if (s1 < 3 || Math.abs(d) < 1e-6) continue; // a line of points: keep the medians
      fit[c] = [
        det([sv, sx, sy, sxv, sxx, sxy, syv, sxy, syy]) / d,
        det([s1, sv, sy, sx, sxv, sxy, sy, syv, syy]) / d,
        det([s1, sx, sv, sx, sxx, sxv, sy, sxy, syv]) / d,
      ];
    }
  };
  measure();
  for (let round = 0; round < 2; round++) {
    refit();
    measure();
  }
  let strays = 0;
  for (let j = 0; j < m; j++) if (!keep[j]) strays++;
  if (strays === 0 || strays > STRAYS_AT_MOST * m) return;
  for (let j = 0; j < m; j++) if (!keep[j]) state[known[j]!] = VOID;
}

/** The healed pixels over a box of the target, to be laid as a clone's are. */
export interface Healed {
  x: number;
  y: number;
  width: number;
  height: number;
  channels: 1 | 4;
  /** Row by row; RGBA: the colour healed, the source's alpha. */
  data: Uint8ClampedArray;
}

/**
 * GB5: the heal of a stroke on `target` (placed at `place` on the image) that copied `source` at
 * `offset`: over the stroke's box, the copy with the difference between the destination and the
 * copy spread smoothly in from the stroke's border. A transparent destination has no say, nor
 * has what is outside the selection: a selection drawn round the part to heal keeps the heal
 * from borrowing the colour of what is next to it (a lamp post beside the rubbish).
 */
export function healStroke(
  target: Raster,
  place: { x: number; y: number },
  source: PixelSource,
  offset: { dx: number; dy: number },
  weights: StrokeWeights,
  selection?: Mask,
): Healed {
  const c = target.channels;
  if (source.channels !== c) throw new RangeError('The source and the layer differ.');
  const n = c === 4 ? 3 : 1;
  // The box and a band round it (the border, averaged over BORDER_MEAN px), inside the target.
  const m = BORDER_MEAN + 1;
  const x0 = Math.max(0, weights.x - m);
  const y0 = Math.max(0, weights.y - m);
  const x1 = Math.min(target.width, weights.x + weights.width + m);
  const y1 = Math.min(target.height, weights.y + weights.height + m);
  const w = x1 - x0;
  const h = y1 - y0;
  const dest = readRegion(target, { x: x0, y: y0, width: w, height: h });
  const sel = selection
    ? readRegion(selection, { x: x0 + place.x, y: y0 + place.y, width: w, height: h })
    : null;
  const copy = new Uint8ClampedArray(w * h * c);
  const dx = place.x + Math.round(offset.dx);
  const dy = place.y + Math.round(offset.dy);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) source.read(x0 + x + dx, y0 + y + dy, copy, (y * w + x) * c);

  const state = new Uint8Array(w * h);
  const values = new Float32Array(w * h * n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const gx = x0 + x - weights.x;
      const gy = y0 + y - weights.y;
      const inBox = gx >= 0 && gy >= 0 && gx < weights.width && gy < weights.height;
      if (sel && sel[p] === 0) continue; // VOID
      if (inBox && weights.values[gy * weights.width + gx]! > 0) {
        // B4: under the stroke, a pixel on a feathered selection's soft edge (less than half
        // selected) is mostly kept as it was, so the heal is matched to it there, as round the
        // stroke: without it, strokes that cover the whole feathered selection have no border
        // inside it, and the copy shows (a lighter disc, a rim). A hard edge stays a wall: a
        // selection drawn tight round the rubbish does not borrow the rubbish.
        if (!sel || sel[p]! >= 128) {
          state[p] = INSIDE;
          continue;
        }
      }
      if (c === 4 && (dest[p * 4 + 3] === 0 || copy[p * 4 + 3] === 0)) continue; // VOID
      state[p] = KNOWN;
      for (let ch = 0; ch < n; ch++) values[p * n + ch] = dest[p * c + ch]! - copy[p * c + ch]!;
    }
  leaveOutStrays(w, state, values, n);
  smoothKnown(w, h, state, values, n, BORDER_MEAN);
  solveMembrane(w, h, state, values, n);

  // The box of the stroke itself: the copy plus the difference.
  const data = new Uint8ClampedArray(weights.width * weights.height * c);
  for (let y = 0; y < weights.height; y++)
    for (let x = 0; x < weights.width; x++) {
      const p = (weights.y + y - y0) * w + (weights.x + x - x0);
      const k = (y * weights.width + x) * c;
      for (let ch = 0; ch < n; ch++) data[k + ch] = copy[p * c + ch]! + values[p * n + ch]!;
      if (c === 4) data[k + 3] = copy[p * 4 + 3]!;
    }
  return { ...weights, channels: c, data };
}

/** The healed pixels as a source (in the target's own coordinates). */
export function healedSource(healed: Healed): PixelSource {
  const { x, y, width, height, channels: c, data } = healed;
  return {
    channels: c,
    read(px, py, out, k) {
      const rx = px - x;
      const ry = py - y;
      if (rx < 0 || ry < 0 || rx >= width || ry >= height) {
        out.fill(0, k, k + c);
        return;
      }
      const j = (ry * width + rx) * c;
      for (let ch = 0; ch < c; ch++) out[k + ch] = data[j + ch]!;
    },
  };
}
