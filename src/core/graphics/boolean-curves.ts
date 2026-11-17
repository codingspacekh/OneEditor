// G1 (from the Graphics benchmark, 2026-11-17): Union, Cut out, Intersect and Exclude that keep
// the shapes' curves. The outlines are cut into fine straight pieces for the clipping (as before),
// but every piece remembers the curve (segment) it came from and where along it (t). The clipped
// rings are then walked: a run of pieces along one segment becomes the exact part of that Bézier
// curve between where the run starts and ends (de Casteljau), a straight side stays straight, and
// the shapes' own anchors stay anchors. Three circles joined are a handful of curves again, not
// ~200 short sides; a bite out of an apple keeps the apple's curves and the bite's. Pure.
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import type { Point } from '../animation/geometry.ts';
import type { PathPoint } from '../animation/types.ts';

/** One segment of an outline: a cubic Bézier curve, or a straight line. */
interface Segment {
  a: Point;
  c1: Point;
  c2: Point;
  b: Point;
  straight: boolean;
  /** The fine pieces' t values, 0 to 1 (the samples along it). */
  ts: number[];
}

interface Tag {
  seg: number;
  t: number;
}

const lerp = (p: Point, q: Point, t: number): Point => ({
  x: p.x + (q.x - p.x) * t,
  y: p.y + (q.y - p.y) * t,
});

function pointAt(s: Segment, t: number): Point {
  if (s.straight) return lerp(s.a, s.b, t);
  const u = 1 - t;
  return {
    x: u * u * u * s.a.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.b.x,
    y: u * u * u * s.a.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.b.y,
  };
}

/** The part of a curve between t0 and t1 (t0 < t1), as its four points. */
function subCurve(s: Segment, t0: number, t1: number): [Point, Point, Point, Point] {
  // Split at t1 and keep the first part, then split that at t0 / t1 and keep the second part.
  const split = (p: [Point, Point, Point, Point], t: number) => {
    const [p0, p1, p2, p3] = p;
    const a = lerp(p0, p1, t);
    const b = lerp(p1, p2, t);
    const c = lerp(p2, p3, t);
    const d = lerp(a, b, t);
    const e = lerp(b, c, t);
    const f = lerp(d, e, t);
    return {
      first: [p0, a, d, f] as [Point, Point, Point, Point],
      second: [f, e, c, p3] as [Point, Point, Point, Point],
    };
  };
  const head =
    t1 >= 1
      ? ([s.a, s.c1, s.c2, s.b] as [Point, Point, Point, Point])
      : split([s.a, s.c1, s.c2, s.b], t1).first;
  return t0 <= 0 ? head : split(head, t0 / t1).second;
}

/** How many fine pieces a curve is cut into: about 1.5 px long, 16 to 400. */
function piecesOf(a: Point, c1: Point, c2: Point, b: Point): number {
  const hull =
    Math.hypot(c1.x - a.x, c1.y - a.y) +
    Math.hypot(c2.x - c1.x, c2.y - c1.y) +
    Math.hypot(b.x - c2.x, b.y - c2.y);
  return Math.max(16, Math.min(400, Math.ceil(hull / 1.5)));
}

/** The rings (outline and holes, on the stage, with handles) of every shape, back to front. */
export type ShapeRings = PathPoint[][];

export type BooleanHow = 'union' | 'difference' | 'intersection' | 'xor';

const key = (x: number, y: number) => `${x},${y}`;

/**
 * The shapes combined, each result a list of rings (its outline, then its holes) as anchors on
 * the stage with their curves. `how` as polygon-clipping's operations, the first shape the back.
 */
export function combineCurves(shapes: readonly ShapeRings[], how: BooleanHow): PathPoint[][][] {
  const segments: Segment[] = [];
  const tags = new Map<string, Tag[]>();
  /** Every fine piece: its ends and the segment and t's it lies along (for crossing points). */
  const pieces: { p: Point; q: Point; seg: number; t0: number; t1: number }[] = [];
  const tag = (p: Point, t: Tag) => {
    const k = key(p.x, p.y);
    const list = tags.get(k);
    if (list) list.push(t);
    else tags.set(k, [t]);
  };

  const polygons: Polygon[] = shapes.map((rings) =>
    rings
      .filter((r) => r.length >= 2)
      .map((ring): Ring => {
        const out: [number, number][] = [];
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const straight = !a.out && !b.in;
          const c1 = a.out ?? a;
          const c2 = b.in ?? b;
          const n = straight ? 1 : piecesOf(a, c1, c2, b);
          const seg: Segment = {
            a: { x: a.x, y: a.y },
            c1: { x: c1.x, y: c1.y },
            c2: { x: c2.x, y: c2.y },
            b: { x: b.x, y: b.y },
            straight,
            ts: Array.from({ length: n + 1 }, (_, s) => s / n),
          };
          const id = segments.push(seg) - 1;
          let prev = seg.a;
          for (let s = 0; s < n; s++) {
            const t = s / n;
            const p = s === 0 ? seg.a : pointAt(seg, t);
            tag(p, { seg: id, t });
            out.push([p.x, p.y]);
            const q = s === n - 1 ? seg.b : pointAt(seg, (s + 1) / n);
            pieces.push({ p: s === 0 ? seg.a : prev, q, seg: id, t0: t, t1: (s + 1) / n });
            prev = q;
          }
          tag(seg.b, { seg: id, t: 1 });
        }
        return out;
      }),
  );
  const [first, ...rest] = polygons as [Polygon, ...Polygon[]];
  const result: MultiPolygon = polygonClipping[how](first, ...rest);
  return result.map((polygon) => polygon.map((ring) => curvedRing(ring, segments, tags, pieces)));
}

/** Where a point lies along the segments: known samples, or a crossing on a fine piece. */
function tagsOf(
  p: Point,
  tags: Map<string, Tag[]>,
  pieces: { p: Point; q: Point; seg: number; t0: number; t1: number }[],
): Tag[] {
  const known = tags.get(key(p.x, p.y));
  if (known) return known;
  const found: Tag[] = [];
  for (const piece of pieces) {
    const dx = piece.q.x - piece.p.x;
    const dy = piece.q.y - piece.p.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const f = ((p.x - piece.p.x) * dx + (p.y - piece.p.y) * dy) / len2;
    if (f < -1e-9 || f > 1 + 1e-9) continue;
    const ex = piece.p.x + dx * f - p.x;
    const ey = piece.p.y + dy * f - p.y;
    const scale = Math.max(1, Math.abs(p.x), Math.abs(p.y));
    if (ex * ex + ey * ey <= (1e-7 * scale) ** 2)
      found.push({
        seg: piece.seg,
        t: piece.t0 + (piece.t1 - piece.t0) * Math.min(1, Math.max(0, f)),
      });
  }
  return found;
}

/** The step between two of a segment's samples. */
const stepOf = (s: Segment) => 1 / (s.ts.length - 1);

/** One clipped ring (closed: its first point again at its end) as anchors with curves. */
function curvedRing(
  ring: Ring,
  segments: Segment[],
  tags: Map<string, Tag[]>,
  pieces: { p: Point; q: Point; seg: number; t0: number; t1: number }[],
): PathPoint[] {
  const pts = ring.map(([x, y]) => ({ x, y }));
  if (pts.length > 1 && pts[0]!.x === pts.at(-1)!.x && pts[0]!.y === pts.at(-1)!.y) pts.pop();
  const n = pts.length;
  const at = pts.map((p) => tagsOf(p, tags, pieces));
  // Each side (i → i + 1): the segment it runs along and the t at both ends, or null (straight).
  const sides = pts.map((p, i) => {
    const q = pts[(i + 1) % n]!;
    let best: { seg: number; t0: number; t1: number; err: number } | null = null;
    for (const a of at[i]!)
      for (const b of at[(i + 1) % n]!) {
        if (a.seg !== b.seg) continue;
        const s = segments[a.seg]!;
        const dt = Math.abs(b.t - a.t);
        if (dt === 0 || dt > stepOf(s) + 1e-9) continue;
        // Two crossings on one sample's piece of two curves: the flatter (nearer) one.
        const mid = pointAt(s, (a.t + b.t) / 2);
        const err = Math.hypot(mid.x - (p.x + q.x) / 2, mid.y - (p.y + q.y) / 2);
        if (!best || err < best.err) best = { seg: a.seg, t0: a.t, t1: b.t, err };
      }
    return best;
  });
  const sameRun = (i: number, j: number) => {
    const a = sides[i];
    const b = sides[j];
    return (
      !!a &&
      !!b &&
      a.seg === b.seg &&
      Math.sign(a.t1 - a.t0) === Math.sign(b.t1 - b.t0) &&
      Math.abs(a.t1 - b.t0) < 1e-9
    );
  };
  // Start at a side that begins a run (or anywhere if the ring is one run).
  let start = 0;
  for (let i = 0; i < n; i++)
    if (!sameRun((i - 1 + n) % n, i)) {
      start = i;
      break;
    }
  const anchors: PathPoint[] = [];
  /** The handle each run arrives with at the next anchor (undefined: a straight run). */
  const arriving: (Point | undefined)[] = [];
  let i = start;
  let walked = 0;
  while (walked < n) {
    const from = i;
    let to = (i + 1) % n;
    walked++;
    while (walked < n && sameRun((to - 1 + n) % n, to)) {
      to = (to + 1) % n;
      walked++;
    }
    const p = pts[from]!;
    const q = pts[to]!;
    const first = sides[from];
    const last = sides[(to - 1 + n) % n];
    const anchor: PathPoint = { x: p.x, y: p.y };
    anchors.push(anchor);
    arriving.push(undefined);
    if (first && last && !segments[first.seg]!.straight) {
      const s = segments[first.seg]!;
      const [t0, t1] = [first.t0, last.t1];
      const [c0, c1, c2, c3] =
        t0 < t1
          ? subCurve(s, t0, t1)
          : (subCurve(s, t1, t0).reverse() as [Point, Point, Point, Point]);
      // The ends are the ring's own points (a crossing lies on the fine piece, a hair off the curve).
      anchor.out = { x: c1.x + p.x - c0.x, y: c1.y + p.y - c0.y };
      arriving[arriving.length - 1] = { x: c2.x + q.x - c3.x, y: c2.y + q.y - c3.y };
    }
    i = to;
  }
  // Each run's arriving handle belongs to the next anchor.
  return anchors.map((a, k) => {
    const handle = arriving[(k - 1 + anchors.length) % anchors.length];
    return handle ? { ...a, in: handle } : a;
  });
}
