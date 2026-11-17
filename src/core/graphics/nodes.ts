// GV3 (M19): the node tool, beyond the pen's own editing (core/animation/pen.ts): node types
// (cusp, smooth, symmetrical), a segment made a line or a curve, many nodes moved, placed, lined
// up and spaced, a path simplified, broken at a node, its two end nodes joined, closed or opened,
// reversed, and nodes deleted with the curve fitted again so the shape stays as it was. Every
// edit is made where the nodes are shown on the stage (anchorsOnStage) and put back in the path's
// box (withAnchors), so a turned, flipped, skewed or resized path is edited as it is seen.
import { EditError } from '../model/errors.ts';
import { newId } from '../model/factory.ts';
import { toLocal, toStage, type Point } from '../animation/geometry.ts';
import { flattenCurves } from '../animation/path.ts';
import { anchorsOnStage, withAnchors } from '../animation/pen.ts';
import type { NodeType, PathObject, PathPoint } from '../animation/types.ts';
import type { AlignEdge, DistributeAxis } from './align.ts';

// ---- small vector sums ----

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const length = (a: Point) => Math.hypot(a.x, a.y);
const distance = (a: Point, b: Point) => length(sub(a, b));
/** The direction of `a` (length 1), or null for no direction at all. */
const unit = (a: Point): Point | null => {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : null;
};
const point = (p: Point): Point => ({ x: p.x, y: p.y });

/** The node without its handles (and type), or without one of them. */
const bare = (p: PathPoint): PathPoint => ({ x: p.x, y: p.y });
function without(p: PathPoint, which: 'in' | 'out'): PathPoint {
  const rest = { ...p };
  delete rest[which];
  return rest;
}

/** A handle that sits on its anchor shapes nothing: it counts as none. */
const handle = (a: PathPoint, which: 'in' | 'out'): Point | null => {
  const h = a[which];
  return h && distance(h, a) > 1e-9 ? sub(h, a) : null;
};

/** GV3: a node without a type is a cusp (its handles move on their own), as before M19. */
export const nodeTypeOf = (p: PathPoint): NodeType => p.type ?? 'cusp';

/** The chosen nodes, each once, in path order; at least one, all still on the path. */
function chosen(path: PathObject, indices: readonly number[]): number[] {
  if (indices.length === 0) throw new EditError('Choose a node first.');
  const unique = [...new Set(indices)].sort((a, b) => a - b);
  if (unique.some((i) => !Number.isInteger(i) || i < 0 || i >= path.points.length))
    throw new EditError('That node is no longer on the path.');
  return unique;
}

/** The node before and after node `i` (none past the ends of an open path). */
function neighbours(anchors: readonly PathPoint[], i: number, closed: boolean) {
  const n = anchors.length;
  return {
    prev: closed || i > 0 ? anchors[(i - 1 + n) % n] : undefined,
    next: closed || i < n - 1 ? anchors[(i + 1) % n] : undefined,
  };
}

// ---- node types ----

/**
 * GV3: the chosen nodes become cusps (handles kept as they are), smooth nodes (the handles lined
 * up through the anchor, each keeping its length; the direction is the average of the two) or
 * symmetrical ones (also the same length: the average). A missing handle is made opposite the
 * other one; a node with no handles gets them along its neighbours' direction, about a third of
 * the way to each. An end node of an open path gets a handle on its one side only.
 */
export function setNodeType(
  path: PathObject,
  indices: readonly number[],
  type: NodeType,
): PathObject {
  const anchors = anchorsOnStage(path);
  for (const i of chosen(path, indices)) anchors[i] = shaped(anchors, i, type, path.closed);
  return withAnchors(path, anchors);
}

function shaped(anchors: PathPoint[], i: number, type: NodeType, closed: boolean): PathPoint {
  const a = anchors[i]!;
  if (type === 'cusp') return { ...a, type };
  const { prev, next } = neighbours(anchors, i, closed);
  const inV = handle(a, 'in');
  const outV = handle(a, 'out');
  const outward = outV && unit(outV);
  const backward = inV && unit(scale(inV, -1));
  const across = prev && next ? sub(next, prev) : next ? sub(next, a) : sub(a, prev!);
  const d = (outward && backward ? unit(add(outward, backward)) : null) ??
    outward ??
    backward ??
    unit(across) ?? { x: 1, y: 0 };
  let lin = inV ? length(inV) : prev ? distance(a, prev) / 3 : 0;
  let lout = outV ? length(outV) : next ? distance(a, next) / 3 : 0;
  if (type === 'symmetrical') {
    const even = prev && next ? (lin + lout) / 2 : Math.max(lin, lout);
    lin = even;
    lout = even;
  }
  return {
    x: a.x,
    y: a.y,
    ...(prev && lin > 0 ? { in: sub(a, scale(d, lin)) } : {}),
    ...(next && lout > 0 ? { out: add(a, scale(d, lout)) } : {}),
    type,
  };
}

// ---- segments ----

/**
 * GV3: the segment after each chosen node becomes a straight line (its handles go) or a curve
 * (handles a third of the way along it, ready to drag; a curve already there is kept). The last
 * node of an open path has no segment after it; chosen with others, it is passed over.
 */
export function segmentsTo(
  path: PathObject,
  indices: readonly number[],
  kind: 'line' | 'curve',
): PathObject {
  const n = path.points.length;
  const starts = chosen(path, indices).filter((i) => path.closed || i < n - 1);
  if (starts.length === 0)
    throw new EditError(
      'The last node of an open path has no segment after it: choose the node where the segment starts.',
    );
  const anchors = anchorsOnStage(path);
  let changed = false;
  for (const i of starts) {
    const j = (i + 1) % n;
    const a = anchors[i]!;
    const b = anchors[j]!;
    const curved = a.out !== undefined || b.in !== undefined;
    if (kind === 'line' && curved) {
      anchors[i] = without(a, 'out');
      anchors[j] = without(anchors[j]!, 'in');
      changed = true;
    } else if (kind === 'curve' && !curved) {
      const third = scale(sub(b, a), 1 / 3);
      anchors[i] = { ...a, out: add(a, third) };
      anchors[j] = { ...anchors[j]!, in: sub(b, third) };
      changed = true;
    }
  }
  return changed ? withAnchors(path, anchors) : path;
}

// ---- moving, placing, lining up ----

const shifted = (p: PathPoint, d: Point): PathPoint => ({
  ...p,
  x: p.x + d.x,
  y: p.y + d.y,
  ...(p.in ? { in: add(p.in, d) } : {}),
  ...(p.out ? { out: add(p.out, d) } : {}),
});

/** Each chosen node moved by its own amount on the stage, its handles with it. */
function movedBy(path: PathObject, moves: ReadonlyMap<number, Point>): PathObject {
  const anchors = anchorsOnStage(path).map((a, i) => {
    const d = moves.get(i);
    return d ? shifted(a, d) : a;
  });
  return withAnchors(path, anchors);
}

/** GV3: the chosen nodes moved together (a drag, or the arrow keys), with their handles. */
export function moveNodes(
  path: PathObject,
  indices: readonly number[],
  dx: number,
  dy: number,
): PathObject {
  return movedBy(path, new Map(chosen(path, indices).map((i) => [i, { x: dx, y: dy }])));
}

/** GV3: a node put at a typed X and / or Y on the stage. */
export function placeNode(path: PathObject, i: number, at: Partial<Point>): PathObject {
  chosen(path, [i]);
  const a = anchorsOnStage(path)[i]!;
  return moveNodes(path, [i], (at.x ?? a.x) - a.x, (at.y ?? a.y) - a.y);
}

/**
 * GV3, G5: the chosen nodes lined up along the left, centre or right (top, middle or bottom) of
 * the box round them, as objects are lined up.
 */
export function alignNodes(
  path: PathObject,
  indices: readonly number[],
  edge: AlignEdge,
): PathObject {
  const which = chosen(path, indices);
  if (which.length < 2) throw new EditError('Choose two or more nodes to line up.');
  const anchors = anchorsOnStage(path);
  const across = edge === 'left' || edge === 'centre' || edge === 'right';
  const values = which.map((i) => (across ? anchors[i]!.x : anchors[i]!.y));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const target =
    edge === 'left' || edge === 'top'
      ? low
      : edge === 'right' || edge === 'bottom'
        ? high
        : (low + high) / 2;
  return movedBy(
    path,
    new Map(
      which.map((i, k) => [
        i,
        across ? { x: target - values[k]!, y: 0 } : { x: 0, y: target - values[k]! },
      ]),
    ),
  );
}

/** GV3, G5: three or more chosen nodes spaced evenly between the outer two, across or down. */
export function distributeNodes(
  path: PathObject,
  indices: readonly number[],
  axis: DistributeAxis,
): PathObject {
  const which = chosen(path, indices);
  if (which.length < 3) throw new EditError('Choose three or more nodes to space evenly.');
  const anchors = anchorsOnStage(path);
  const at = (i: number) => (axis === 'horizontal' ? anchors[i]!.x : anchors[i]!.y);
  const order = [...which].sort((a, b) => at(a) - at(b));
  const first = at(order[0]!);
  const step = (at(order.at(-1)!) - first) / (order.length - 1);
  return movedBy(
    path,
    new Map(
      order.map((i, k) => {
        const d = first + k * step - at(i);
        return [i, axis === 'horizontal' ? { x: d, y: 0 } : { x: 0, y: d }];
      }),
    ),
  );
}

// ---- break, join, close and open, reverse ----

const refuseHoles = (path: PathObject) => {
  if (path.holes?.length)
    throw new EditError('A shape with holes in it stays closed: it cannot be opened.');
};

/**
 * GV3: a closed shape broken at a node opens there (both of its ends on that node); an open path
 * broken at a middle node becomes two paths — the first keeps the object, the second is a new
 * object (a new id) to go just in front of it.
 */
export function breakAtNode(path: PathObject, i: number): PathObject[] {
  chosen(path, [i]);
  const anchors = anchorsOnStage(path);
  const n = anchors.length;
  if (path.closed) {
    refuseHoles(path);
    const turned = [...anchors.slice(i), ...anchors.slice(0, i)];
    const open = [without(turned[0]!, 'in'), ...turned.slice(1), without(anchors[i]!, 'out')];
    return [withAnchors({ ...path, closed: false }, open)];
  }
  if (i === 0 || i === n - 1)
    throw new EditError('Choose a node in the middle of the path to break it: its ends are open.');
  const first = [...anchors.slice(0, i), without(anchors[i]!, 'out')];
  const second = [without(anchors[i]!, 'in'), ...anchors.slice(i + 1)];
  return [withAnchors(path, first), withAnchors({ ...path, id: newId() }, second)];
}

/** Two ends this close are one point: joined, they become a single node. */
const SAME_PLACE = 0.5;

/** The open path closed; ends in the same place become one node (the last's curve kept). */
function closedUp(path: PathObject): PathObject {
  const anchors = anchorsOnStage(path);
  const first = anchors[0]!;
  const last = anchors.at(-1)!;
  if (anchors.length > 3 && distance(first, last) <= SAME_PLACE) {
    const merged = { ...without(first, 'in'), ...(last.in ? { in: point(last.in) } : {}) };
    return withAnchors({ ...path, closed: true }, [merged, ...anchors.slice(1, -1)]);
  }
  return withAnchors({ ...path, closed: true }, anchors);
}

/** GV3: the two end nodes of an open path, chosen, joined: the path closes there. */
export function joinNodes(path: PathObject, indices: readonly number[]): PathObject {
  const which = chosen(path, indices);
  const n = path.points.length;
  if (path.closed || which.length !== 2 || which[0] !== 0 || which[1] !== n - 1)
    throw new EditError('Choose the two end nodes of an open path to join them.');
  return closedUp(path);
}

/**
 * GV3: a path closed (a segment from its last node back to the first) or opened (that segment,
 * with its handles, goes). Already as asked, it is kept.
 */
export function setPathClosed(path: PathObject, closed: boolean): PathObject {
  if (path.closed === closed) return path;
  if (closed) return closedUp(path);
  refuseHoles(path);
  const anchors = anchorsOnStage(path);
  anchors[0] = without(anchors[0]!, 'in');
  anchors[anchors.length - 1] = without(anchors.at(-1)!, 'out');
  return withAnchors({ ...path, closed: false }, anchors);
}

/** GV3: the path's direction reversed (where it starts and ends; arrowheads, text on it). */
export function reversePath(path: PathObject): PathObject {
  const anchors = anchorsOnStage(path)
    .reverse()
    .map((p) => ({
      ...bare(p),
      ...(p.out ? { in: p.out } : {}),
      ...(p.in ? { out: p.in } : {}),
      ...(p.type ? { type: p.type } : {}),
    }));
  return withAnchors(path, anchors);
}

// ---- curve fitting (Schneider, "An algorithm for automatically fitting digitized curves") ----

type Cubic = [Point, Point, Point, Point];

const bezierAt = (b: Cubic, t: number): Point => {
  const u = 1 - t;
  return add(
    add(scale(b[0], u * u * u), scale(b[1], 3 * u * u * t)),
    add(scale(b[2], 3 * u * t * t), scale(b[3], t * t * t)),
  );
};

/** How far along the polyline each point is, from 0 to 1. */
function chordLengths(d: readonly Point[]): number[] {
  const u = [0];
  for (let i = 1; i < d.length; i++) u.push(u[i - 1]! + distance(d[i]!, d[i - 1]!));
  const total = u.at(-1)!;
  return u.map((v) => (total > 0 ? v / total : 0));
}

/** The cubic from d[0] to its last point leaving along t1 and arriving back along t2. */
function bestCubic(d: readonly Point[], u: readonly number[], t1: Point, t2: Point): Cubic {
  const p0 = d[0]!;
  const p3 = d.at(-1)!;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = u[i]!;
    const s = 1 - t;
    const b0 = s * s * s;
    const b1 = 3 * s * s * t;
    const b2 = 3 * s * t * t;
    const b3 = t * t * t;
    const a1 = scale(t1, b1);
    const a2 = scale(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const rest = sub(d[i]!, add(scale(p0, b0 + b1), scale(p3, b2 + b3)));
    x0 += dot(a1, rest);
    x1 += dot(a2, rest);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1 = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0;
  let alpha2 = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0;
  const chord = distance(p0, p3);
  if (alpha1 < 1e-6 * chord || alpha2 < 1e-6 * chord) alpha1 = alpha2 = chord / 3;
  return [p0, add(p0, scale(t1, alpha1)), add(p3, scale(t2, alpha2)), p3];
}

/** The worst squared distance of the points from the cubic, and where it is. */
function worst(d: readonly Point[], u: readonly number[], b: Cubic): { error: number; at: number } {
  let error = 0;
  let at = Math.floor(d.length / 2);
  for (let i = 1; i < d.length - 1; i++) {
    const e = distance(bezierAt(b, u[i]!), d[i]!) ** 2;
    if (e >= error) {
      error = e;
      at = i;
    }
  }
  return { error, at };
}

/** Newton–Raphson: each point's place on the cubic moved to where the cubic is nearest it. */
function nearer(d: readonly Point[], u: readonly number[], b: Cubic): number[] {
  const d1: Cubic = [
    scale(sub(b[1], b[0]), 3),
    scale(sub(b[2], b[1]), 3),
    scale(sub(b[3], b[2]), 3),
    { x: 0, y: 0 },
  ];
  const d2 = [scale(sub(d1[1], d1[0]), 2), scale(sub(d1[2], d1[1]), 2)] as const;
  return u.map((t, i) => {
    const s = 1 - t;
    const q = sub(bezierAt(b, t), d[i]!);
    const q1 = add(add(scale(d1[0], s * s), scale(d1[1], 2 * s * t)), scale(d1[2], t * t));
    const q2 = add(scale(d2[0], s), scale(d2[1], t));
    const den = dot(q1, q1) + dot(q, q2);
    return den === 0 ? t : Math.max(0, Math.min(1, t - dot(q, q1) / den));
  });
}

/** One cubic for the points, its ends' directions given, tried a few times; and its error. */
function fitOne(
  d: readonly Point[],
  t1: Point,
  t2: Point,
): { cubic: Cubic; error: number; at: number } {
  let u = chordLengths(d);
  let cubic = bestCubic(d, u, t1, t2);
  let { error, at } = worst(d, u, cubic);
  for (let k = 0; k < 4; k++) {
    u = nearer(d, u, cubic);
    const again = bestCubic(d, u, t1, t2);
    const w = worst(d, u, again);
    if (w.error >= error) break;
    cubic = again;
    ({ error, at } = w);
  }
  return { cubic, error, at };
}

/** Cubics through the points within the tolerance, split where the fit is worst. */
function fitCubics(
  d: readonly Point[],
  t1: Point,
  t2: Point,
  tolerance: number,
  out: Cubic[],
): void {
  if (d.every((p) => offChord(p, d[0]!, d.at(-1)!) <= tolerance)) {
    out.push([d[0]!, d[0]!, d.at(-1)!, d.at(-1)!]); // a straight line
    return;
  }
  const fit = fitOne(d, t1, t2);
  if (fit.error <= tolerance * tolerance) {
    out.push(fit.cubic);
    return;
  }
  const at = Math.max(1, Math.min(d.length - 2, fit.at));
  const centre = unit(sub(d[at - 1]!, d[at + 1]!)) ??
    unit(sub(d[at - 1]!, d[at]!)) ?? { x: 1, y: 0 };
  fitCubics(d.slice(0, at + 1), t1, centre, tolerance, out);
  fitCubics(d.slice(at), scale(centre, -1), t2, tolerance, out);
}

/** How far a point is from the segment a–b. */
function offChord(p: Point, a: Point, b: Point): number {
  const chord = sub(b, a);
  const l2 = dot(chord, chord);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), chord) / l2));
  return distance(p, add(a, scale(chord, t)));
}

/** A run fitted as a straight line has its handles on its ends: it is drawn without any. */
const straight = (b: Cubic) => b[1] === b[0] && b[2] === b[3];

/** The leaving direction at the start of a polyline, and the arriving one (pointing back). */
const ends = (d: readonly Point[]) => ({
  t1: unit(sub(d[1]!, d[0]!)) ?? { x: 1, y: 0 },
  t2: unit(sub(d.at(-2)!, d.at(-1)!)) ?? { x: -1, y: 0 },
});

// ---- simplify ----

/** A node turning the outline by more than this is a corner, kept as one. */
const CORNER_DEGREES = 45;

/** The outline sampled densely: each segment's points (a long straight side every `step` px). */
function sampled(anchors: readonly PathPoint[], closed: boolean, step: number) {
  const n = anchors.length;
  const points: Point[] = [point(anchors[0]!)];
  const at = [0];
  const segments = closed ? n : n - 1;
  for (let s = 0; s < segments; s++) {
    const a = anchors[s]!;
    const b = anchors[(s + 1) % n]!;
    let seg = flattenCurves([a, b], false);
    if (!a.out && !b.in) {
      const parts = Math.max(1, Math.ceil(distance(a, b) / step));
      seg = Array.from({ length: parts + 1 }, (_, k) => add(a, scale(sub(b, a), k / parts)));
    }
    for (const p of seg.slice(1)) if (distance(p, points.at(-1)!) > 1e-9) points.push(point(p));
    at.push(points.length - 1);
  }
  return { points, at };
}

/** Whether the outline turns sharply at the anchor (by its curves' directions either side). */
function isCorner(anchors: readonly PathPoint[], i: number, closed: boolean): boolean {
  const { prev, next } = neighbours(anchors, i, closed);
  if (!prev || !next) return true;
  const a = anchors[i]!;
  const arriving = unit(sub(a, a.in ?? prev.out ?? prev)) ?? unit(sub(a, prev));
  const leaving = unit(sub(a.out ?? next.in ?? next, a)) ?? unit(sub(next, a));
  if (!arriving || !leaving) return false;
  return dot(arriving, leaving) < Math.cos((CORNER_DEGREES * Math.PI) / 180);
}

/** Nodes made of cubics end to end; the joins between runs are corners, inside them smooth. */
function nodesOf(runs: readonly Cubic[][], closed: boolean): PathPoint[] {
  const nodes: PathPoint[] = [];
  for (const run of runs)
    run.forEach((b, k) => {
      const line = straight(b);
      const start = nodes.pop() ?? bare(b[0]);
      nodes.push({
        ...start,
        ...(line ? {} : { out: b[1] }),
        ...(k > 0 ? { type: 'smooth' as const } : {}),
      });
      nodes.push({ ...bare(b[3]), ...(line ? {} : { in: b[2] }) });
    });
  if (closed) {
    const last = nodes.pop()!;
    nodes[0] = { ...nodes[0]!, ...(last.in ? { in: last.in } : {}) };
  }
  // A node between two lines needs no type; one between a line and a curve keeps none either.
  return nodes.map((p) => {
    if (!p.type || (p.in && p.out)) return p;
    const plain = { ...p };
    delete plain.type;
    return plain;
  });
}

/** A cubic split in two halves (de Casteljau): a closed outline needs three nodes or more. */
function halves(cubic: Cubic): Cubic[] {
  const [p0, p1, p2, p3] = cubic;
  const mid = (a: Point, b: Point) => scale(add(a, b), 0.5);
  if (straight(cubic)) {
    const m = mid(p0, p3);
    return [
      [p0, p0, m, m],
      [m, m, p3, p3],
    ];
  }
  const q0 = mid(p0, p1);
  const q1 = mid(p1, p2);
  const q2 = mid(p2, p3);
  const r0 = mid(q0, q1);
  const r1 = mid(q1, q2);
  const s = mid(r0, r1);
  return [
    [p0, q0, r0, s],
    [s, r1, q2, p3],
  ];
}

/**
 * One outline (stage points) simplified: the corners are kept, the runs between them fitted with
 * as few cubics as keep every sampled point within the tolerance. Null when it would not have
 * fewer nodes.
 */
function simplifiedOutline(
  anchors: readonly PathPoint[],
  closed: boolean,
  tolerance: number,
): PathPoint[] | null {
  const n = anchors.length;
  const reach = flattenCurves(anchors, closed).reduce(
    (sum, p, i, all) => (i ? sum + distance(p, all[i - 1]!) : 0),
    0,
  );
  const { points, at } = sampled(anchors, closed, Math.max(tolerance, 1, reach / 4000));
  const corners = anchors.map((_, i) => i).filter((i) => isCorner(anchors, i, closed));
  const runs: Cubic[][] = [];
  if (closed && corners.length === 0) {
    // Round all the way: one run from the first node back to it, smooth through it.
    const across = unit(sub(points[1]!, points.at(-2)!)) ?? { x: 1, y: 0 };
    const cubics: Cubic[] = [];
    fitCubics(points, across, scale(across, -1), tolerance, cubics);
    runs.push(cubics);
  } else {
    const stops = closed ? [...corners, corners[0]! + n] : corners;
    const around = closed ? [...points, ...points.slice(1)] : points;
    for (let k = 0; k < stops.length - 1; k++) {
      const from = at[stops[k]!]!;
      const to = stops[k + 1]! >= n ? at[stops[k + 1]! - n]! + at[n]! : at[stops[k + 1]!]!;
      const d = around.slice(from, to + 1);
      const { t1, t2 } = ends(d);
      const cubics: Cubic[] = [];
      fitCubics(d, t1, t2, tolerance, cubics);
      runs.push(cubics);
    }
  }
  while (closed && runs.flat().length < 3) runs.splice(0, runs.length, runs.flat().flatMap(halves));
  const nodes = nodesOf(runs, closed);
  if (closed && corners.length === 0 && nodes[0]!.in && nodes[0]!.out)
    nodes[0] = { ...nodes[0]!, type: 'smooth' };
  return nodes.length < n ? nodes : null;
}

/**
 * GV3: the path with fewer nodes and the same look within `tolerance` px (a brush stroke's many
 * points become a few smooth curves); sharp corners stay corners and straight runs stay lines.
 * A shape's holes are simplified too. A path that cannot have fewer nodes is kept as it is.
 */
export function simplifyPath(path: PathObject, tolerance: number): PathObject {
  if (!(tolerance > 0)) throw new EditError('The tolerance must be more than 0 px.');
  const outline = simplifiedOutline(anchorsOnStage(path), path.closed, tolerance);
  const holes = path.holes?.map((hole) => {
    const simple = simplifiedOutline(
      hole.map((p) => ({ ...p, ...toStage(path, p), ...mapHandles(p, (q) => toStage(path, q)) })),
      true,
      tolerance,
    );
    return (
      simple?.map((p) => ({
        ...p,
        ...toLocal(path, p),
        ...mapHandles(p, (q) => toLocal(path, q)),
      })) ?? hole
    );
  });
  const holesChanged = holes?.some((h, i) => h !== path.holes![i]) ?? false;
  if (!outline && !holesChanged) return path;
  const kept = holesChanged ? { ...path, holes: holes! } : path;
  return withAnchors(kept, outline ?? anchorsOnStage(path));
}

const mapHandles = (p: PathPoint, f: (q: Point) => Point) => ({
  ...(p.in ? { in: f(p.in) } : {}),
  ...(p.out ? { out: f(p.out) } : {}),
});

// ---- delete ----

/**
 * GV3: the chosen nodes deleted. Where they were, the nodes either side are joined by one curve
 * fitted to the outline that was there (its directions at both ends kept), so the shape changes
 * as little as it can; straight sides stay a straight line. A path keeps at least two nodes, a
 * closed shape three.
 */
export function deleteNodes(path: PathObject, indices: readonly number[]): PathObject {
  const gone = new Set(chosen(path, indices));
  const n = path.points.length;
  if (path.closed && n - gone.size < 3)
    throw new EditError('A closed shape needs at least three points.');
  if (n - gone.size < 2) throw new EditError('A path needs at least two points.');
  const anchors = anchorsOnStage(path);
  const kept = anchors.map((_, i) => i).filter((i) => !gone.has(i));
  const result = kept.map((i) => ({ ...anchors[i]! }));
  const pairs = path.closed ? kept.length : kept.length - 1;
  for (let k = 0; k < pairs; k++) {
    const from = kept[k]!;
    const to = kept[(k + 1) % kept.length]!;
    const span = (to - from + n) % n;
    if (span <= 1) continue;
    const between = Array.from({ length: span + 1 }, (_, s) => anchors[(from + s) % n]!);
    const a = result[k]!;
    const b = result[(k + 1) % result.length]!;
    const curved = between.some((p, s) => (s < span && p.out) || (s > 0 && p.in));
    if (!curved) {
      result[k] = without(a, 'out');
      result[(k + 1) % result.length] = without(b, 'in');
      continue;
    }
    const d = flattenCurves(between, false);
    const { t1, t2 } = ends(d);
    const { cubic } = fitOne(
      d,
      unit(handle(a, 'out') ?? { x: 0, y: 0 }) ?? t1,
      unit(handle(b, 'in') ?? { x: 0, y: 0 }) ?? t2,
    );
    result[k] = { ...a, out: cubic[1] };
    result[(k + 1) % result.length] = { ...b, in: cubic[2] };
  }
  if (!path.closed) {
    result[0] = without(result[0]!, 'in');
    result[result.length - 1] = without(result.at(-1)!, 'out');
  }
  return withAnchors(path, result);
}
