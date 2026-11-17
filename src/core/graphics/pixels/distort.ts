// M22 step 4 (GB5, GN2): the distortions of a pixel layer (or its mask), each to pixels of the
// same size: twirl (turned most at a centre and less further out: the workbook's motion swirl),
// bulge and pinch (magnified, or shrunk, inside a circle: O/N/21's lens), perspective (the four
// corners moved: a projective map, so the far side is foreshortened as in a photo) and warp (a
// 4 × 4 mesh of points, the picture following a smooth surface through them). Each output pixel's
// centre is mapped back to where it comes from and sampled there with transform.ts's bicubic
// weights, on premultiplied colours (a soft edge never darkens). Twirl and bulge only read and
// write the circle's box, so the tiles outside it stay the very same (GN1). Pure functions: they
// run in the pixel worker (jobs.ts).
import type { Point } from '../../animation/geometry.ts';
import { EditError } from '../../model/errors.ts';
import { fromBytes } from './filters.ts';
import { intersect, readRegion, writeRegion, type Raster, type Rect } from './raster.ts';
import { tapWeights } from './transform.ts';

// ---- sampling ----

/**
 * Pixels read from a raster: `box` (raster px) of it, row-major. Beyond the box the nearest edge
 * pixel is read, so a magnified edge stays sharp; where a picture ends inside the output (a
 * perspective's or warp's sides) the filter cuts it itself.
 */
interface Source {
  data: Uint8ClampedArray;
  box: Rect;
  channels: 1 | 4;
}

/** The sampler's scratch arrays, made once per filter. */
interface Scratch {
  wx: Float64Array;
  wy: Float64Array;
  xs: Int32Array;
  ys: Int32Array;
}

const scratch = (): Scratch => ({
  wx: new Float64Array(4),
  wy: new Float64Array(4),
  xs: new Int32Array(4),
  ys: new Int32Array(4),
});

/** Taps off the box: the edge pixel. */
function edgeTaps(first: number, size: number, at: Int32Array): void {
  for (let k = 0; k < 4; k++) {
    const p = first + k;
    at[k] = p < 0 ? 0 : p >= size ? size - 1 : p;
  }
}

/**
 * The bicubic sample at (sx, sy) (raster px; pixel k covers k to k + 1) written to `out` at
 * byte `o`, its alpha (a mask's value) times `cover` (0–1: how much of the pixel the picture
 * covers): a bitmap's colours weighed by their alpha, transparent where hardly anything shows.
 */
function sample(
  s: Source,
  sx: number,
  sy: number,
  out: Uint8ClampedArray,
  o: number,
  t: Scratch,
  cover = 1,
) {
  const W = s.box.width;
  const H = s.box.height;
  const u = sx - s.box.x - 0.5;
  const v = sy - s.box.y - 0.5;
  const bx = Math.floor(u);
  const by = Math.floor(v);
  tapWeights(4, u - bx, t.wx);
  tapWeights(4, v - by, t.wy);
  const x0 = bx - 1;
  const y0 = by - 1;
  const inside = x0 >= 0 && y0 >= 0 && x0 + 4 <= W && y0 + 4 <= H;
  if (!inside) {
    edgeTaps(x0, W, t.xs);
    edgeTaps(y0, H, t.ys);
  }
  const d = s.data;
  const { wx, wy, xs, ys } = t;
  if (s.channels === 1) {
    let value = 0;
    for (let ky = 0; ky < 4; ky++) {
      const row = (inside ? y0 + ky : ys[ky]!) * W;
      for (let kx = 0; kx < 4; kx++)
        value += d[row + (inside ? x0 + kx : xs[kx]!)]! * wx[kx]! * wy[ky]!;
    }
    out[o] = value * cover;
    return;
  }
  let vr = 0;
  let vg = 0;
  let vb = 0;
  let va = 0;
  if (inside) {
    const w0 = wx[0]!;
    const w1 = wx[1]!;
    const w2 = wx[2]!;
    const w3 = wx[3]!;
    for (let ky = 0; ky < 4; ky++) {
      const p = ((y0 + ky) * W + x0) * 4;
      const a0 = w0 * d[p + 3]!;
      const a1 = w1 * d[p + 7]!;
      const a2 = w2 * d[p + 11]!;
      const a3 = w3 * d[p + 15]!;
      const wyk = wy[ky]!;
      vr += (d[p]! * a0 + d[p + 4]! * a1 + d[p + 8]! * a2 + d[p + 12]! * a3) * wyk;
      vg += (d[p + 1]! * a0 + d[p + 5]! * a1 + d[p + 9]! * a2 + d[p + 13]! * a3) * wyk;
      vb += (d[p + 2]! * a0 + d[p + 6]! * a1 + d[p + 10]! * a2 + d[p + 14]! * a3) * wyk;
      va += (a0 + a1 + a2 + a3) * wyk;
    }
  } else
    for (let ky = 0; ky < 4; ky++) {
      const py = ys[ky]!;
      const wyk = wy[ky]!;
      for (let kx = 0; kx < 4; kx++) {
        const p = (py * W + xs[kx]!) * 4;
        const w = wx[kx]! * wyk * d[p + 3]!;
        vr += d[p]! * w;
        vg += d[p + 1]! * w;
        vb += d[p + 2]! * w;
        va += w;
      }
    }
  if (va < 0.5) {
    out.fill(0, o, o + 4);
    return;
  }
  out[o] = vr / va;
  out[o + 1] = vg / va;
  out[o + 2] = vb / va;
  out[o + 3] = va * cover;
}

const wholeOf = (r: Raster): Rect => ({ x: 0, y: 0, width: r.width, height: r.height });

/**
 * The pixels inside a circle remapped: `from(x, y, to)` puts where the pixel centre (x, y) comes
 * from in `to` and says whether it moves at all. Only the circle's box is read and written.
 */
function remapCircle<C extends 1 | 4>(
  r: Raster<C>,
  centre: Point,
  radius: number,
  from: (x: number, y: number, to: { x: number; y: number }) => boolean,
): Raster<C> {
  const whole = wholeOf(r);
  const box = intersect(
    {
      x: Math.floor(centre.x - radius) - 1,
      y: Math.floor(centre.y - radius) - 1,
      width: Math.ceil(2 * radius) + 3,
      height: Math.ceil(2 * radius) + 3,
    },
    whole,
  );
  if (!box) return r;
  // Where it reads: the box and the bicubic's reach round it (the edge pixels beyond the layer).
  const read = intersect(
    { x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 },
    whole,
  )!;
  const src: Source = { data: readRegion(r, read), box: read, channels: r.channels };
  const out = readRegion(r, box);
  const c = r.channels;
  const t = scratch();
  const to = { x: 0, y: 0 };
  for (let y = 0; y < box.height; y++)
    for (let x = 0; x < box.width; x++)
      if (from(box.x + x + 0.5, box.y + y + 0.5, to))
        sample(src, to.x, to.y, out, (y * box.width + x) * c, t);
  return writeRegion(r, box, out);
}

// ---- twirl ----

export interface TwirlSettings {
  /** Raster px. */
  centre: Point;
  /** How far out it turns, px. */
  radius: number;
  /** The turn at the centre, degrees, clockwise (negative: anticlockwise). */
  angle: number;
}

/** The largest twirl (degrees either way), as Photoshop's. */
export const MAX_TWIRL = 999;

function twirlInto(
  centre: Point,
  radius: number,
  angle: number,
): (x: number, y: number, to: { x: number; y: number }) => boolean {
  const rad = (Math.max(-MAX_TWIRL, Math.min(MAX_TWIRL, angle)) * Math.PI) / 180;
  const r2 = radius * radius;
  return (x, y, to) => {
    const dx = x - centre.x;
    const dy = y - centre.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r2) return false;
    const fall = 1 - Math.sqrt(d2) / radius;
    const turn = rad * fall * fall;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    // Turned back: the picture at (x, y) came from `turn` anticlockwise of it.
    to.x = centre.x + dx * cos + dy * sin;
    to.y = centre.y - dx * sin + dy * cos;
    return true;
  };
}

/**
 * Where the twirl's output point `p` comes from: turned back by the angle × (1 − d / radius)², so
 * the centre turns the most and the rim not at all; null outside the circle.
 */
export function twirlSource(centre: Point, radius: number, angle: number, p: Point): Point | null {
  const to = { x: 0, y: 0 };
  return twirlInto(centre, radius, angle)(p.x, p.y, to) ? to : null;
}

/** GB5: twirl (the workbook's motion swirl): the pixels inside the circle turned round its centre. */
export function twirl<C extends 1 | 4>(r: Raster<C>, s: TwirlSettings): Raster<C> {
  if (s.angle === 0 || !(s.radius > 0)) return r;
  return remapCircle(r, s.centre, s.radius, twirlInto(s.centre, s.radius, s.angle));
}

// ---- bulge and pinch ----

export interface BulgeSettings {
  /** Raster px. */
  centre: Point;
  radius: number;
  /** −100 (pinched in) to 100 (bulged out: magnified most at the centre), %. */
  amount: number;
}

function bulgeInto(
  centre: Point,
  radius: number,
  amount: number,
): (x: number, y: number, to: { x: number; y: number }) => boolean {
  const a = Math.max(-1, Math.min(1, amount / 100));
  const r2 = radius * radius;
  return (x, y, to) => {
    const dx = x - centre.x;
    const dy = y - centre.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r2) return false;
    const fall = 1 - Math.sqrt(d2) / radius;
    const k = 1 - a * fall * fall;
    to.x = centre.x + dx * k;
    to.y = centre.y + dy * k;
    return true;
  };
}

/**
 * Where the bulge's output point `p` comes from: d (1 − a (1 − d / radius)²) from the centre, so
 * the middle is magnified 1 / (1 − a) times (2× at 50 %) and the rim not at all; null outside.
 */
export function bulgeSource(centre: Point, radius: number, amount: number, p: Point): Point | null {
  const to = { x: 0, y: 0 };
  return bulgeInto(centre, radius, amount)(p.x, p.y, to) ? to : null;
}

/** GB5: bulge (a lens: magnified inside the circle) or pinch (a negative amount). */
export function bulge<C extends 1 | 4>(r: Raster<C>, s: BulgeSettings): Raster<C> {
  if (s.amount === 0 || !(s.radius > 0)) return r;
  return remapCircle(r, s.centre, s.radius, bulgeInto(s.centre, s.radius, s.amount));
}

// ---- perspective ----

/** Top left, top right, bottom right, bottom left (raster px). */
export type Corners = readonly [Point, Point, Point, Point];

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Why four corners cannot be a perspective (crossed, folded in, or flat), or null. */
export function cornersProblem(q: readonly Point[]): string | null {
  if (q.length !== 4 || q.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return 'Give four corners, each an X and a Y.';
  const turns = q.map((p, i) => cross(p, q[(i + 1) % 4]!, q[(i + 2) % 4]!));
  const size = Math.max(1, ...q.map((p) => Math.hypot(p.x - q[0]!.x, p.y - q[0]!.y)));
  if (turns.some((t) => Math.abs(t) < 1e-6 * size * size))
    return 'Three corners are in a line: the corners must not cross, and must make four sides.';
  if (!(turns.every((t) => t > 0) || turns.every((t) => t < 0)))
    return 'The corners must not cross or fold in: drag them so they make four sides that bulge out.';
  return null;
}

/**
 * The projective map from the unit square to the four corners (Heckbert's): (u, v) →
 * ((a u + b v + c) / w, (d u + e v + f) / w), w = g u + h v + 1.
 */
function squareToQuad(q: Corners): number[] {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12)
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0];
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
  ];
}

/**
 * GB5: perspective: the layer's rectangle drawn between four corners (raster px) as a flat
 * picture seen at an angle; outside the four sides it is transparent, and what goes past the
 * layer's edges is cut off (the layer keeps its size). Corners that cross are refused.
 */
export function perspective<C extends 1 | 4>(r: Raster<C>, corners: readonly Point[]): Raster<C> {
  const problem = cornersProblem(corners);
  if (problem) throw new EditError(problem);
  const q = corners as Corners;
  const { width: W, height: H, channels: c } = r;
  const rest: Corners = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  if (q.every((p, i) => Math.abs(p.x - rest[i]!.x) < 1e-9 && Math.abs(p.y - rest[i]!.y) < 1e-9))
    return r;
  const [a, b, cc, d, e, f, g, h] = squareToQuad(q) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  // The inverse (the adjugate of [[a b c] [d e f] [g h 1]]): a point → (u, v) on the square.
  const A = e - f * h;
  const B = cc * h - b;
  const C = b * f - cc * e;
  const D = f * g - d;
  const E = a - cc * g;
  const F = cc * d - a * f;
  const G = d * h - e * g;
  const Hh = b * g - a * h;
  const I = a * e - b * d;
  const src: Source = { data: readRegion(r), box: wholeOf(r), channels: c };
  const out = new Uint8ClampedArray(W * H * c);
  const t = scratch();
  // The four sides as lines: a pixel centre's distance inside each, in output px (a side is
  // smooth: a pixel it crosses is partly covered).
  const turn = Math.sign(cross(q[0], q[1], q[2]));
  const sides = q.map((p, i) => {
    const n = q[(i + 1) % 4]!;
    const len = Math.hypot(n.x - p.x, n.y - p.y);
    return { x: p.x, y: p.y, dx: (turn * (n.x - p.x)) / len, dy: (turn * (n.y - p.y)) / len };
  });
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(W, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H, Math.ceil(Math.max(...ys)));
  for (let y = y0; y < y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x < x1; x++) {
      const px = x + 0.5;
      let cover = 1;
      for (const e of sides) {
        const inside = 0.5 + e.dx * (py - e.y) - e.dy * (px - e.x);
        if (inside < cover) cover = inside;
      }
      if (cover <= 0) continue;
      const w = G * px + Hh * py + I;
      const u = (A * px + B * py + C) / w;
      const v = (D * px + E * py + F) / w;
      sample(src, u * W, v * H, out, (y * W + x) * c, t, cover);
    }
  }
  return fromBytes(r, out);
}

// ---- warp ----

/** The mesh's points a side. */
export const MESH = 4;

/** The warp mesh at rest on a box: 4 × 4 points a third of the way apart, row by row. */
export function restMesh(width: number, height: number, x = 0, y = 0): Point[] {
  const points: Point[] = [];
  for (let j = 0; j < MESH; j++)
    for (let i = 0; i < MESH; i++)
      points.push({ x: x + (i * width) / (MESH - 1), y: y + (j * height) / (MESH - 1) });
  return points;
}

/** Why a mesh cannot be used, or null. */
export function meshProblem(points: readonly Point[]): string | null {
  if (points.length !== MESH * MESH) return `A warp mesh has ${MESH * MESH} points.`;
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return 'Each point of the mesh needs an X and a Y.';
  return null;
}

/**
 * The surface through the mesh: Catmull-Rom splines (transform.ts's bicubic weights) across and
 * down, the mesh carried on straight one step beyond its edges, so it passes through every point
 * and the mesh at rest is the picture as it is.
 */
function meshSurface(points: readonly Point[]): (u: number, v: number, to: Point) => void {
  const n = MESH + 2;
  const gx = new Float64Array(n * n);
  const gy = new Float64Array(n * n);
  const at = (i: number, j: number) => j * n + i;
  for (let j = 0; j < MESH; j++)
    for (let i = 0; i < MESH; i++) {
      gx[at(i + 1, j + 1)] = points[j * MESH + i]!.x;
      gy[at(i + 1, j + 1)] = points[j * MESH + i]!.y;
    }
  for (const g of [gx, gy]) {
    for (let j = 1; j <= MESH; j++) {
      g[at(0, j)] = 2 * g[at(1, j)]! - g[at(2, j)]!;
      g[at(n - 1, j)] = 2 * g[at(n - 2, j)]! - g[at(n - 3, j)]!;
    }
    for (let i = 0; i < n; i++) {
      g[at(i, 0)] = 2 * g[at(i, 1)]! - g[at(i, 2)]!;
      g[at(i, n - 1)] = 2 * g[at(i, n - 2)]! - g[at(i, n - 3)]!;
    }
  }
  const wu = new Float64Array(4);
  const wv = new Float64Array(4);
  const cells = MESH - 1;
  return (u, v, to) => {
    const su = Math.min(cells - 1, Math.floor(u * cells));
    const sv = Math.min(cells - 1, Math.floor(v * cells));
    tapWeights(4, u * cells - su, wu);
    tapWeights(4, v * cells - sv, wv);
    let x = 0;
    let y = 0;
    for (let b = 0; b < 4; b++)
      for (let a = 0; a < 4; a++) {
        const w = wu[a]! * wv[b]!;
        const k = at(su + a, sv + b);
        x += gx[k]! * w;
        y += gy[k]! * w;
      }
    to.x = x;
    to.y = y;
  };
}

/**
 * GB5: warp: the picture bent to follow its 4 × 4 mesh of points (raster px, row by row; at rest
 * restMesh), as a stretchy sheet pinned at each point. The surface is cut into small triangles,
 * each drawn from its part of the picture; outside the mesh it is transparent, and what goes past
 * the layer's edges is cut off.
 */
export function warp<C extends 1 | 4>(r: Raster<C>, points: readonly Point[]): Raster<C> {
  const problem = meshProblem(points);
  if (problem) throw new EditError(problem);
  const { width: W, height: H, channels: c } = r;
  const rest = restMesh(W, H);
  if (
    points.every((p, i) => Math.abs(p.x - rest[i]!.x) < 1e-9 && Math.abs(p.y - rest[i]!.y) < 1e-9)
  )
    return r;
  const surface = meshSurface(points);
  // Triangles about 12 source px across (at most 192 a side): close to the smooth surface.
  const n = Math.min(192, Math.max(MESH - 1, Math.ceil(Math.max(W, H) / 12)));
  const vx = new Float64Array((n + 1) * (n + 1));
  const vy = new Float64Array((n + 1) * (n + 1));
  const p: Point = { x: 0, y: 0 };
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      surface(i / n, j / n, p);
      vx[j * (n + 1) + i] = p.x;
      vy[j * (n + 1) + i] = p.y;
    }
  const src: Source = { data: readRegion(r), box: wholeOf(r), channels: c };
  const out = new Uint8ClampedArray(W * H * c);
  const t = scratch();
  const corner = (i: number, j: number): [number, number, number, number] => {
    const k = j * (n + 1) + i;
    return [vx[k]!, vy[k]!, (i / n) * W, (j / n) * H];
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = corner(i, j);
      const b = corner(i + 1, j);
      const cc = corner(i + 1, j + 1);
      const d = corner(i, j + 1);
      triangle(a, b, cc, src, out, W, H, t);
      triangle(a, cc, d, src, out, W, H, t);
    }
  return fromBytes(r, out);
}

/**
 * One triangle of the warp: each pixel whose centre is inside where it is drawn (x, y) sampled
 * from where it comes from (sx, sy), the same mix of its three corners.
 */
function triangle(
  p0: readonly number[],
  p1: readonly number[],
  p2: readonly number[],
  src: Source,
  out: Uint8ClampedArray,
  W: number,
  H: number,
  t: Scratch,
): void {
  const [x0, y0, s0, t0] = p0 as [number, number, number, number];
  const [x1, y1, s1, t1] = p1 as [number, number, number, number];
  const [x2, y2, s2, t2] = p2 as [number, number, number, number];
  const ax = x1 - x0;
  const ay = y1 - y0;
  const bx = x2 - x0;
  const by = y2 - y0;
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-9) return;
  const left = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const right = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const top = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const bottom = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const eps = -1e-9;
  for (let y = top; y <= bottom; y++) {
    const py = y + 0.5 - y0;
    for (let x = left; x <= right; x++) {
      const px = x + 0.5 - x0;
      // How far along each side from corner 0: the triangle's own coordinates.
      const l1 = (px * by - py * bx) / det;
      const l2 = (ax * py - ay * px) / det;
      if (l1 < eps || l2 < eps || l1 + l2 > 1 - eps) continue;
      const sx = s0 + l1 * (s1 - s0) + l2 * (s2 - s0);
      const sy = t0 + l1 * (t1 - t0) + l2 * (t2 - t0);
      sample(src, sx, sy, out, (y * W + x) * src.channels, t);
    }
  }
}
