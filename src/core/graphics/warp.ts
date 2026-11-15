// GV4, G3 (M19): shapes bent by their envelope. A shape's outline (and holes) is taken as Bézier
// segments in its own box — a rectangle's sides, an ellipse's four quarters (or its arc), a
// star's or polygon's sides, a path's curves — and each is cut into short pieces (by length, so
// a long straight side bends as smoothly as a short one) before it is mapped. Each mapped piece
// is fitted with one Bézier curve whose ends and directions are the bent curve's own, so the
// result is smooth with few points. A group is bent as one: every part in the group's box (and
// a part's own envelope first). The live envelope is drawn as its applied shape (drawn.ts and
// svg-export.ts get it from `bentForDrawing`); *Apply* keeps that shape as plain paths.
import { localOutline, toStage, type Point } from '../animation/geometry.ts';
import type {
  AnimObject,
  EllipseObject,
  Envelope,
  GroupObject,
  PathObject,
  PathPoint,
  RectObject,
} from '../animation/types.ts';
import { MAX_PIVOT } from '../animation/rules.ts';
import { EditError } from '../model/errors.ts';
import { boxMap, isFlat, validateEnvelope } from './envelope.ts';

/** A cubic Bézier segment (a straight one has its control points at the thirds). */
interface Seg {
  a: Point;
  c1: Point;
  c2: Point;
  b: Point;
}

/** An outline (or a hole, or an open line) as segments end to end. */
interface Ring {
  segs: Seg[];
  closed: boolean;
}

/** A shape's outline as path points: what a bent shape becomes. */
export interface WarpedRing {
  points: PathPoint[];
  closed: boolean;
}

/** What is bent: a shape's rings, or a group's parts, in one box's coordinates. */
type Tree =
  | { kind: 'shape'; source: AnimObject; rings: Ring[] }
  | { kind: 'group'; source: GroupObject; children: Tree[] };

type PointMap = (p: Point) => Point;

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const line = (a: Point, b: Point): Seg => ({ a, c1: lerp(a, b, 1 / 3), c2: lerp(a, b, 2 / 3), b });

function at(s: Seg, t: number): Point {
  const u = 1 - t;
  const [k0, k1, k2, k3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: k0 * s.a.x + k1 * s.c1.x + k2 * s.c2.x + k3 * s.b.x,
    y: k0 * s.a.y + k1 * s.c1.y + k2 * s.c2.y + k3 * s.b.y,
  };
}

const closedRing = (pts: readonly Point[]): Ring => ({
  segs: pts.map((p, i) => line(p, pts[(i + 1) % pts.length]!)),
  closed: true,
});

/** A path's anchors as segments: a curve where either end has a handle, else a straight side. */
function pathRing(points: readonly PathPoint[], closed: boolean): Ring {
  const count = closed ? points.length : points.length - 1;
  const segs: Seg[] = [];
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const [p, q] = [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
    ];
    segs.push(a.out || b.in ? { a: p, c1: a.out ?? p, c2: b.in ?? q, b: q } : line(p, q));
  }
  return { segs, closed };
}

/**
 * An elliptical arc of the box from `start` to `start + sweep` degrees (clockwise, 0 at the
 * right), in pieces of at most 90° (each a cubic, within 0.03 % of the ellipse).
 */
function arcSegs(w: number, h: number, start: number, sweep: number): Seg[] {
  const n = Math.max(1, Math.ceil(sweep / 90 - 1e-9));
  const step = ((sweep / n) * Math.PI) / 180;
  const k = (4 / 3) * Math.tan(step / 4);
  const [cx, cy, rx, ry] = [w / 2, h / 2, w / 2, h / 2];
  const on = (a: number, d = 0): Point => ({
    x: cx + rx * (Math.cos(a) - d * Math.sin(a)),
    y: cy + ry * (Math.sin(a) + d * Math.cos(a)),
  });
  return Array.from({ length: n }, (_, i) => {
    const a0 = (start * Math.PI) / 180 + i * step;
    const a1 = a0 + step;
    return { a: on(a0), c1: on(a0, k), c2: on(a1, -k), b: on(a1) };
  });
}

/** GV1: the whole ellipse, or its arc left open, closed to the centre (pie) or across (chord). */
function ellipseRing(o: EllipseObject): Ring {
  if (!o.arc) return { segs: arcSegs(o.width, o.height, 0, 360), closed: true };
  const sweep = (((o.arc.end - o.arc.start) % 360) + 360) % 360 || 360;
  if (sweep === 360) return { segs: arcSegs(o.width, o.height, o.arc.start, 360), closed: true };
  const segs = arcSegs(o.width, o.height, o.arc.start, sweep);
  if (o.arc.close === 'open') return { segs, closed: false };
  const [first, last] = [segs[0]!.a, segs.at(-1)!.b];
  const centre = { x: o.width / 2, y: o.height / 2 };
  const back =
    o.arc.close === 'pie' ? [line(last, centre), line(centre, first)] : [line(last, first)];
  return { segs: [...segs, ...back], closed: true };
}

/** A rectangle, its rounded corners as quarter circles. */
function rectRing(o: RectObject): Ring {
  const { width: w, height: h } = o;
  const r = Math.max(0, Math.min(o.radius, w / 2, h / 2));
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  if (r === 0) return closedRing(corners);
  const k = (4 / 3) * Math.tan(Math.PI / 8) * r;
  const p = (x: number, y: number) => ({ x, y });
  return {
    closed: true,
    segs: [
      line(p(r, 0), p(w - r, 0)),
      { a: p(w - r, 0), c1: p(w - r + k, 0), c2: p(w, r - k), b: p(w, r) },
      line(p(w, r), p(w, h - r)),
      { a: p(w, h - r), c1: p(w, h - r + k), c2: p(w - r + k, h), b: p(w - r, h) },
      line(p(w - r, h), p(r, h)),
      { a: p(r, h), c1: p(r - k, h), c2: p(0, h - r + k), b: p(0, h - r) },
      line(p(0, h - r), p(0, r)),
      { a: p(0, r), c1: p(0, r - k), c2: p(r - k, 0), b: p(r, 0) },
    ],
  };
}

/** A shape's outline and holes in its own box, before any envelope. */
function plainRings(o: AnimObject): Ring[] {
  switch (o.kind) {
    case 'rect':
      return [rectRing(o)];
    case 'ellipse':
      return [ellipseRing(o)];
    case 'path':
      return [pathRing(o.points, o.closed), ...(o.holes ?? []).map((h) => pathRing(h, true))];
    default:
      // A star or a polygon: straight sides between its points.
      return [closedRing(localOutline(o))];
  }
}

/** About one fitted curve every this many px of a segment (sub-pixel close to the bent curve). */
const PIECE = 16;
const H = 1e-4;
const round = (n: number) => Math.round(n * 100) / 100;
const roundPoint = (p: Point): Point => ({ x: round(p.x), y: round(p.y) });

/** A segment bent by `map`: cut into pieces, each fitted with a cubic of the same ends and directions. */
function warpSeg(s: Seg, map: PointMap): Seg[] {
  const reach =
    Math.hypot(s.c1.x - s.a.x, s.c1.y - s.a.y) +
    Math.hypot(s.c2.x - s.c1.x, s.c2.y - s.c1.y) +
    Math.hypot(s.b.x - s.c2.x, s.b.y - s.c2.y);
  const n = Math.max(1, Math.ceil(reach / PIECE));
  // The bent curve's direction at t, per unit of t (central differences on the same cubic).
  const slope = (t: number): Point => {
    const [p, q] = [map(at(s, t + H)), map(at(s, t - H))];
    return { x: (p.x - q.x) / (2 * H), y: (p.y - q.y) / (2 * H) };
  };
  return Array.from({ length: n }, (_, i) => {
    const [t0, t1] = [i / n, (i + 1) / n];
    const [p0, p1] = [map(at(s, t0)), map(at(s, t1))];
    const [d0, d1] = [slope(t0), slope(t1)];
    const k = (t1 - t0) / 3;
    return {
      a: p0,
      c1: { x: p0.x + d0.x * k, y: p0.y + d0.y * k },
      c2: { x: p1.x - d1.x * k, y: p1.y - d1.y * k },
      b: p1,
    };
  });
}

const warpRing = (r: Ring, map: PointMap): Ring => ({
  segs: r.segs.flatMap((s) => warpSeg(s, map)),
  closed: r.closed,
});

/** An affine step (a part's place in its group): exact on control points. */
const moveRing = (r: Ring, f: PointMap): Ring => ({
  segs: r.segs.map((s) => ({ a: f(s.a), c1: f(s.c1), c2: f(s.c2), b: f(s.b) })),
  closed: r.closed,
});

function mapTree(t: Tree, ring: (r: Ring) => Ring): Tree {
  return t.kind === 'shape'
    ? { ...t, rings: t.rings.map(ring) }
    : { ...t, children: t.children.map((c) => mapTree(c, ring)) };
}

/** Whether an envelope changes anything (a preset at 0 % does not). */
const bends = (o: AnimObject): o is AnimObject & { envelope: Envelope } =>
  o.envelope !== undefined && !isFlat(o.envelope);

/** The object in its own box (local px), with its own envelope (and its parts') applied. */
function treeOf(o: AnimObject): Tree {
  const plain: Tree =
    o.kind === 'group'
      ? {
          kind: 'group',
          source: o,
          children: o.children.map((c) =>
            mapTree(treeOf(c), (r) => moveRing(r, (p) => toStage(c, p))),
          ),
        }
      : { kind: 'shape', source: o, rings: plainRings(o) };
  if (!bends(o)) return plain;
  const map = boxMap(o.envelope, o.width, o.height);
  return mapTree(plain, (r) => warpRing(r, map));
}

/** Whether a segment is straight (its control points on the line between its ends). */
function straight(s: Seg): boolean {
  const [dx, dy] = [s.b.x - s.a.x, s.b.y - s.a.y];
  const off = (p: Point) => Math.abs((p.x - s.a.x) * dy - (p.y - s.a.y) * dx);
  const tiny = 1e-6 * (dx * dx + dy * dy + 1);
  return off(s.c1) < tiny && off(s.c2) < tiny;
}

/** Straight pieces one after another in the same direction, made one side again. */
function joinStraight(segs: readonly Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out.at(-1);
    const inLine = (l: Seg) => straight({ a: l.a, c1: l.b, c2: l.b, b: s.b });
    if (last && straight(last) && straight(s) && inLine(last)) {
      const [u, v] = [
        { x: last.b.x - last.a.x, y: last.b.y - last.a.y },
        { x: s.b.x - s.a.x, y: s.b.y - s.a.y },
      ];
      if (u.x * v.x + u.y * v.y > 0) {
        out[out.length - 1] = line(last.a, s.b);
        continue;
      }
    }
    out.push(s);
  }
  return out;
}

/** Ring segments as path points: each segment's start, with its handles (none on straight sides). */
function pointsOf(r: Ring): WarpedRing {
  const nodes: PathPoint[] = [];
  joinStraight(r.segs).forEach((s, i) => {
    if (i === 0) nodes.push(roundPoint(s.a));
    const curved = !straight(s);
    if (curved) nodes.at(-1)!.out = roundPoint(s.c1);
    nodes.push({ ...roundPoint(s.b), ...(curved ? { in: roundPoint(s.c2) } : {}) });
  });
  if (r.closed && nodes.length > 1) {
    // The last segment ends where the first starts: one point there, with both handles.
    const last = nodes.pop()!;
    if (last.in) nodes[0]!.in = last.in;
  }
  // GV3: where the curve runs on through a point (its handles in line), the point is smooth.
  for (const p of nodes) {
    if (!p.in || !p.out) continue;
    const [a, b] = [
      { x: p.x - p.in.x, y: p.y - p.in.y },
      { x: p.out.x - p.x, y: p.out.y - p.y },
    ];
    const len = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    if (len > 0 && Math.abs(a.x * b.y - a.y * b.x) < 0.02 * len && a.x * b.x + a.y * b.y > 0)
      p.type = 'smooth';
  }
  return { points: nodes, closed: r.closed };
}

/** The box round the rings' curves (sampled along each, as the curve can bow past its points). */
function boundsOfRings(rings: readonly Ring[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const pts = rings.flatMap((r) =>
    r.segs.flatMap((s) => Array.from({ length: 9 }, (_, i) => at(s, i / 8))),
  );
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const allRings = (t: Tree): Ring[] => (t.kind === 'shape' ? t.rings : t.children.flatMap(allRings));

/** What an object keeps of itself when it is made again from its bent outline. */
function looksOf(o: AnimObject) {
  return {
    id: o.id,
    name: o.name,
    opacity: o.opacity,
    fill: o.fill,
    ...(o.stroke ? { stroke: o.stroke } : {}),
    ...(o.fillOpacity !== undefined ? { fillOpacity: o.fillOpacity } : {}),
    ...(o.filters ? { filters: o.filters } : {}),
    ...(o.drawing !== undefined ? { drawing: o.drawing } : {}),
  };
}

/** A part made from its bent rings, placed in the box it was bent in (no turn of its own). */
function build(t: Tree): AnimObject {
  const box = boundsOfRings(allRings(t));
  const placed = {
    x: round(box.x),
    y: round(box.y),
    width: round(box.width),
    height: round(box.height),
    rotation: 0,
  };
  const local = (r: Ring) => moveRing(r, (p) => ({ x: p.x - placed.x, y: p.y - placed.y }));
  if (t.kind === 'group') {
    const children = t.children.map((c) => build(mapTree(c, local)));
    return { ...looksOf(t.source), kind: 'group', ...placed, children };
  }
  const [outer, ...holes] = t.rings.map((r) => pointsOf(local(r)));
  const path: PathObject = {
    ...looksOf(t.source),
    kind: 'path',
    ...placed,
    points: outer!.points,
    closed: outer!.closed,
    ...(holes.length ? { holes: holes.map((h) => h.points) } : {}),
  };
  // An open line has nothing inside to fill (as a pen path).
  return path.closed ? path : { ...path, fill: { kind: 'none' } };
}

/** GV4: what can be bent: shapes, and groups of shapes; or why this cannot. */
export function whyNotBendable(o: AnimObject): string | null {
  const what: Partial<Record<AnimObject['kind'], string>> = {
    text: 'text',
    picture: 'a picture',
    button: 'a button',
  };
  const own = what[o.kind];
  if (own)
    return o.kind === 'text'
      ? 'Text cannot be bent by an envelope yet: bend its words along an arc with Curve, or bend shapes and groups of shapes.'
      : `${own[0]!.toUpperCase()}${own.slice(1)} cannot be bent by an envelope: only shapes and groups of shapes can.`;
  if (o.kind !== 'group') return null;
  const inside = (g: GroupObject): string | null => {
    for (const c of g.children) {
      const found = what[c.kind] ?? (c.kind === 'group' ? inside(c) : null);
      if (found) return found;
    }
    return null;
  };
  const found = inside(o);
  return found
    ? `“${o.name}” has ${found} in it: only groups of shapes can be bent by an envelope.`
    : null;
}

/** GV4: the object bent by `envelope` (null: not bent), checked. */
export function withEnvelope<T extends AnimObject>(o: T, envelope: Envelope | null): T {
  if (envelope === null) {
    if (!o.envelope) return o;
    const rest = { ...o };
    delete rest.envelope;
    return rest;
  }
  const why = whyNotBendable(o);
  if (why) throw new EditError(why);
  validateEnvelope(envelope);
  return { ...o, envelope };
}

/** Whether the stage draws it bent: an envelope that changes it, on something that can be bent. */
const drawnBent = (o: AnimObject): boolean => bends(o) && whyNotBendable(o) === null;

/**
 * GV4: the bent outlines (every outline, hole and open line; for a group every part's) as path
 * points in the object's own box (px from its top-left corner, before its turn, flip and skew).
 * For Convert to curves and Combine: a bent object is the shape it is drawn as.
 */
export function warpedRings(o: AnimObject): WarpedRing[] {
  return allRings(treeOf(o)).map(pointsOf);
}

/** GV4: the same as fine polylines (each curve in short straight steps), in the object's box. */
export function warpedOutline(o: AnimObject): Point[][] {
  return allRings(treeOf(o)).map((r) => {
    const pts = r.segs.flatMap((s) => Array.from({ length: 8 }, (_, i) => at(s, i / 8)));
    if (!r.closed && r.segs.length) pts.push(r.segs.at(-1)!.b);
    return pts;
  });
}

/**
 * The bent object as plain paths (a group of them for a group) where it is drawn: the same turn,
 * flip and skew about the same point, its box now round the bent outline.
 */
function bentShape(o: AnimObject): AnimObject {
  const made = build(treeOf(o));
  const turned = o.rotation !== 0 || o.flipX || o.flipY || o.skewX || o.skewY;
  // The point it turns about stays where it was on the stage (so the look is the same).
  const p = {
    x: (o.pivot?.x ?? 0.5) * o.width - made.x,
    y: (o.pivot?.y ?? 0.5) * o.height - made.y,
  };
  const fraction = (v: number, size: number) =>
    size > 0 ? Math.max(-MAX_PIVOT, Math.min(MAX_PIVOT, v / size)) : 0.5;
  return {
    ...made,
    x: round(o.x + made.x),
    y: round(o.y + made.y),
    rotation: o.rotation,
    ...(o.flipX ? { flipX: true } : {}),
    ...(o.flipY ? { flipY: true } : {}),
    ...(o.skewX ? { skewX: o.skewX } : {}),
    ...(o.skewY ? { skewY: o.skewY } : {}),
    ...(turned ? { pivot: { x: fraction(p.x, made.width), y: fraction(p.y, made.height) } } : {}),
  };
}

/** Each object's bent stand-in, made once (objects never change: a changed one is a new object). */
const drawn = new WeakMap<AnimObject, AnimObject>();

/**
 * GV4: what the stage, the PNG and the SVG draw for an object: a bent shape or group as its bent
 * paths (the envelope stays on the object itself, live, until it is applied); anything else as
 * it is.
 */
export function bentForDrawing(o: AnimObject): AnimObject {
  if (!drawnBent(o)) return o;
  let shown = drawn.get(o);
  if (!shown) {
    shown = bentShape(o);
    drawn.set(o, shown);
  }
  return shown;
}

/**
 * GV4 *Apply*: the bent shape becomes plain paths (a group of them for a group), looking the
 * same: fill, outline, opacity and effects kept, the box round the bent outline. It keeps its
 * name and id; keyframes and motion paths are not kept (it is a new shape, as with Combine).
 */
export function applyEnvelope(o: AnimObject): AnimObject {
  if (!o.envelope) throw new EditError(`“${o.name}” is not bent: choose an envelope first.`);
  const why = whyNotBendable(o);
  if (why) throw new EditError(why);
  if (isFlat(o.envelope)) return withEnvelope(o, null);
  return bentShape(o);
}
