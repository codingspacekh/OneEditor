// GV6 (M19): the geometry of an SVG file — its transforms (matrix, translate, scale, rotate about
// a point, skewX, skewY, composed) and its path data (every command, M L H V C S Q T A Z, given
// relative or absolute, with implicit repeats), read into outlines of lines, cubic curves and
// elliptical arcs. Arcs and quadratic curves become cubic Bézier curves, the only curves the
// app's paths have. Pure.

export interface Pt {
  x: number;
  y: number;
}

/** An affine transform [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f (as in SVG). */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** p × q: q's step first, then p's (as the SVG transform list "p q"). */
export function multiply(p: Matrix, q: Matrix): Matrix {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

export const apply = (m: Matrix, p: Pt): Pt => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

/** The step back; null when there is none (squashed flat). */
export function invert([a, b, c, d, e, f]: Matrix): Matrix | null {
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export const translation = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

/** A turn of `deg` degrees clockwise on screen (as SVG's rotate). */
export function rotation(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
}

/** How much the transform scales areas, as a length: what a line's width is multiplied by. */
export const scaleOf = (m: Matrix): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Every number in a list: "1,2 -3.5.5e1" → [1, 2, -3.5, 5]. */
export const numbersIn = (text: string): number[] => (text.match(NUMBER) ?? []).map(Number);

/** A `transform` attribute as one matrix; anything it cannot read is left out. */
export function parseTransform(text: string | undefined): Matrix {
  let m = IDENTITY;
  if (!text) return m;
  const step = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (let s = step.exec(text); s; s = step.exec(text)) {
    const v = numbersIn(s[2]!);
    let t: Matrix | null = null;
    switch (s[1]) {
      case 'matrix':
        if (v.length >= 6) t = v.slice(0, 6) as Matrix;
        break;
      case 'translate':
        if (v.length >= 1) t = translation(v[0]!, v[1] ?? 0);
        break;
      case 'scale':
        if (v.length >= 1) t = [v[0]!, 0, 0, v[1] ?? v[0]!, 0, 0];
        break;
      case 'rotate':
        if (v.length >= 1) {
          const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
          t = multiply(translation(cx, cy), multiply(rotation(v[0]!), translation(-cx, -cy)));
        }
        break;
      case 'skewX':
        if (v.length >= 1) t = [1, 0, Math.tan((v[0]! * Math.PI) / 180), 1, 0, 0];
        break;
      default: // skewY
        if (v.length >= 1) t = [1, Math.tan((v[0]! * Math.PI) / 180), 0, 1, 0, 0];
    }
    if (t) m = multiply(m, t);
  }
  return m;
}

/** An elliptical arc as SVG gives it, from `from` to `to`, with its centre worked out. */
export interface ArcSeg {
  kind: 'A';
  from: Pt;
  to: Pt;
  rx: number;
  ry: number;
  /** The ellipse's turn, degrees. */
  rot: number;
  centre: Pt;
  /** Where it starts and how far it goes round, radians (the ellipse's own angles). */
  start: number;
  sweep: number;
}

export type Seg = { kind: 'L'; to: Pt } | { kind: 'C'; c1: Pt; c2: Pt; to: Pt } | ArcSeg;

/** One piece of a path: from `start`, closed back to it by Z or left open. */
export interface SubPath {
  start: Pt;
  segs: Seg[];
  closed: boolean;
}

const TAU = 2 * Math.PI;

/**
 * SVG's arc from endpoints (implementation notes F.6.5): the centre and the angles; radii too
 * small to reach are scaled up as a browser does. Null when a radius is 0 (a straight line).
 */
function arcOf(
  from: Pt,
  to: Pt,
  rx0: number,
  ry0: number,
  rot: number,
  large: boolean,
  sweepFlag: boolean,
): ArcSeg | null {
  let [rx, ry] = [Math.abs(rx0), Math.abs(ry0)];
  if (rx < 1e-12 || ry < 1e-12) return null;
  const phi = (rot * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweepFlag ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const centre = {
    x: cos * cx1 - sin * cy1 + (from.x + to.x) / 2,
    y: sin * cx1 + cos * cy1 + (from.y + to.y) / 2,
  };
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let sweep = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweepFlag && sweep > 0) sweep -= TAU;
  else if (sweepFlag && sweep < 0) sweep += TAU;
  return { kind: 'A', from, to, rx, ry, rot, centre, start, sweep };
}

/** An arc as cubic curves, a quarter turn or less each. */
export function arcCubics(a: ArcSeg): { c1: Pt; c2: Pt; to: Pt }[] {
  const phi = (a.rot * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const at = (t: number): Pt => ({
    x: a.centre.x + a.rx * Math.cos(t) * cos - a.ry * Math.sin(t) * sin,
    y: a.centre.y + a.rx * Math.cos(t) * sin + a.ry * Math.sin(t) * cos,
  });
  const along = (t: number): Pt => ({
    x: -a.rx * Math.sin(t) * cos - a.ry * Math.cos(t) * sin,
    y: -a.rx * Math.sin(t) * sin + a.ry * Math.cos(t) * cos,
  });
  const pieces = Math.max(1, Math.ceil(Math.abs(a.sweep) / (Math.PI / 2) - 1e-9));
  const piece = a.sweep / pieces;
  const k = (4 / 3) * Math.tan(piece / 4);
  const out: { c1: Pt; c2: Pt; to: Pt }[] = [];
  for (let i = 0; i < pieces; i++) {
    const [t0, t1] = [a.start + piece * i, a.start + piece * (i + 1)];
    const [p0, p1, d0, d1] = [at(t0), at(t1), along(t0), along(t1)];
    out.push({
      c1: { x: p0.x + k * d0.x, y: p0.y + k * d0.y },
      c2: { x: p1.x - k * d1.x, y: p1.y - k * d1.y },
      // The last piece ends exactly where the file says.
      to: i === pieces - 1 ? a.to : p1,
    });
  }
  return out;
}

const COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/;
const NUMBER_AT = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

/**
 * Path data as outlines. As a browser does, it draws up to the first thing it cannot read and
 * stops there.
 */
export function parsePathData(d: string): SubPath[] {
  const subs: SubPath[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++;
  };
  const number = (): number | null => {
    skip();
    NUMBER_AT.lastIndex = i;
    const m = NUMBER_AT.exec(d);
    if (!m) return null;
    i = NUMBER_AT.lastIndex;
    return Number(m[0]);
  };
  const flag = (): boolean | null => {
    skip();
    const c = d[i];
    if (c !== '0' && c !== '1') return null;
    i++;
    return c === '1';
  };
  const startsNumber = () => {
    skip();
    return i < d.length && /[-+.\d]/.test(d[i]!);
  };
  let current: SubPath | null = null;
  let at: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  /** The last curve's second control point, for S and T (reflected). */
  let lastCubic: Pt | null = null;
  let lastQuad: Pt | null = null;
  const sub = (): SubPath => {
    if (!current) {
      current = { start: at, segs: [], closed: false };
      subs.push(current);
    }
    return current;
  };
  const cubic = (c1: Pt, c2: Pt, to: Pt) => {
    sub().segs.push({ kind: 'C', c1, c2, to });
    at = to;
    lastCubic = c2;
  };
  const quad = (q: Pt, to: Pt) => {
    const from = at;
    cubic(
      { x: from.x + (2 / 3) * (q.x - from.x), y: from.y + (2 / 3) * (q.y - from.y) },
      { x: to.x + (2 / 3) * (q.x - to.x), y: to.y + (2 / 3) * (q.y - to.y) },
      to,
    );
    lastCubic = null;
    lastQuad = q;
  };
  const line = (to: Pt) => {
    sub().segs.push({ kind: 'L', to });
    at = to;
  };
  let command = '';
  outer: while (i < d.length) {
    skip();
    if (i >= d.length) break;
    if (COMMAND.test(d[i]!)) command = d[i++]!;
    else if (!command || command === 'Z' || command === 'z') break;
    const rel = command === command.toLowerCase();
    const ox = rel ? at.x : 0;
    const oy = rel ? at.y : 0;
    const pt = (): Pt | null => {
      const x = number();
      const y = x === null ? null : number();
      return x === null || y === null ? null : { x: ox + x, y: oy + y };
    };
    const wasCubic = lastCubic as Pt | null;
    const wasQuad = lastQuad as Pt | null;
    lastCubic = null;
    lastQuad = null;
    switch (command.toUpperCase()) {
      case 'M': {
        const p = pt();
        if (!p) break outer;
        at = start = p;
        current = { start: p, segs: [], closed: false };
        subs.push(current);
        // Pairs after a move are lines.
        command = rel ? 'l' : 'L';
        break;
      }
      case 'Z':
        if (current) {
          current.closed = true;
          current = null;
        }
        at = start;
        continue;
      case 'L': {
        const p = pt();
        if (!p) break outer;
        line(p);
        break;
      }
      case 'H': {
        const x = number();
        if (x === null) break outer;
        line({ x: (rel ? at.x : 0) + x, y: at.y });
        break;
      }
      case 'V': {
        const y = number();
        if (y === null) break outer;
        line({ x: at.x, y: (rel ? at.y : 0) + y });
        break;
      }
      case 'C': {
        const [c1, c2, p] = [pt(), pt(), pt()];
        if (!c1 || !c2 || !p) break outer;
        cubic(c1, c2, p);
        break;
      }
      case 'S': {
        const [c2, p] = [pt(), pt()];
        if (!c2 || !p) break outer;
        const c1 = wasCubic ? { x: 2 * at.x - wasCubic.x, y: 2 * at.y - wasCubic.y } : at;
        cubic(c1, c2, p);
        break;
      }
      case 'Q': {
        const [q, p] = [pt(), pt()];
        if (!q || !p) break outer;
        quad(q, p);
        break;
      }
      case 'T': {
        const p = pt();
        if (!p) break outer;
        quad(wasQuad ? { x: 2 * at.x - wasQuad.x, y: 2 * at.y - wasQuad.y } : at, p);
        break;
      }
      default: {
        // A: rx ry turn large-arc sweep x y (the flags may be written without spaces: "0 01").
        const [rx, ry, rot] = [number(), number(), number()];
        const [large, sweep] = [rx === null || ry === null || rot === null ? null : flag(), flag()];
        const p = large === null || sweep === null ? null : pt();
        if (!p) break outer;
        const from = at;
        if (Math.abs(p.x - from.x) < 1e-12 && Math.abs(p.y - from.y) < 1e-12) break;
        const arc = arcOf(from, p, rx!, ry!, rot!, large!, sweep!);
        if (arc) {
          sub().segs.push(arc);
          at = p;
        } else line(p);
      }
    }
    // Another set of numbers repeats the command.
    if (!startsNumber() && i < d.length && !COMMAND.test(d[i]!)) break;
  }
  return subs;
}
