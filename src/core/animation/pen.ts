// AN3, AN11: editing a pen path on the stage — move an anchor, pull out its curve handles (both
// sides mirrored, as the pens of Hype and Animate do), move one handle, make a corner again, and
// add or remove points. Edits are made in stage coordinates; an unturned path's box is fitted
// to its new outline, so its handles and rulers stay right.
import { EditError } from '../model/errors.ts';
import { toLocal, toStage, type Point } from './geometry.ts';
import { flattenCurves } from './path.ts';
import type { PathObject, PathPoint } from './types.ts';

const map = (p: PathPoint, f: (q: Point) => Point): PathPoint => ({
  ...f(p),
  ...(p.in ? { in: f(p.in) } : {}),
  ...(p.out ? { out: f(p.out) } : {}),
  // GV3 (M19): the node keeps its type (cusp, smooth, symmetrical) wherever it goes.
  ...(p.type ? { type: p.type } : {}),
});

/** The anchors and handles where they are on the stage. */
export const anchorsOnStage = (path: PathObject): PathPoint[] =>
  path.points.map((p) => map(p, (q) => toStage(path, q)));

/**
 * The path with these stage anchors; an unturned path's box fits the new outline. A turned,
 * flipped or skewed one keeps its box (and the point it turns about, AN27): its points are
 * placed in it where they are shown.
 */
export function withAnchors(path: PathObject, anchors: PathPoint[]): PathObject {
  if (path.rotation !== 0 || path.flipX || path.flipY || path.skewX || path.skewY)
    return { ...path, points: anchors.map((p) => map(p, (q) => toLocal(path, q))) };
  const outline = flattenCurves(anchors, path.closed);
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    ...path,
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    points: anchors.map((p) => map(p, (q) => ({ x: q.x - x, y: q.y - y }))),
    // AN24: holes stay where they are on the stage when the box moves to fit the outline.
    ...(path.holes
      ? {
          holes: path.holes.map((hole) =>
            hole.map((p) => map(p, (q) => ({ x: q.x + path.x - x, y: q.y + path.y - y }))),
          ),
        }
      : {}),
  };
}

const anchorAt = (path: PathObject, i: number): PathPoint => {
  const a = anchorsOnStage(path)[i];
  if (!a) throw new EditError('That point is no longer on the path.');
  return a;
};

const replaced = (path: PathObject, i: number, point: PathPoint): PathObject =>
  withAnchors(path, anchorsOnStage(path).toSpliced(i, 1, point));

const mirror = (anchor: Point, p: Point): Point => ({
  x: 2 * anchor.x - p.x,
  y: 2 * anchor.y - p.y,
});

/** The anchor moves to `to`, its handles with it. */
export function moveAnchor(path: PathObject, i: number, to: Point): PathObject {
  const a = anchorAt(path, i);
  const dx = to.x - a.x;
  const dy = to.y - a.y;
  return replaced(
    path,
    i,
    map(a, (q) => ({ x: q.x + dx, y: q.y + dy })),
  );
}

/** Handles pulled out of the anchor towards `out`; the other side mirrored: a smooth curve. */
export function pullHandles(path: PathObject, i: number, out: Point): PathObject {
  const a = anchorAt(path, i);
  return replaced(path, i, {
    x: a.x,
    y: a.y,
    out: { ...out },
    in: mirror(a, out),
    ...(a.type ? { type: a.type } : {}),
  });
}

/**
 * One handle moved; with `keepOpposite` its partner turns to stay opposite (still smooth). GV3:
 * a node with a type keeps its rule — a cusp's handles move on their own, a smooth node's partner
 * stays in line keeping its own length, a symmetrical node's is mirrored; without `keepOpposite`
 * (Alt) a smooth or symmetrical node's handle moves alone and the node becomes a cusp.
 */
export function moveHandle(
  path: PathObject,
  i: number,
  which: 'in' | 'out',
  to: Point,
  keepOpposite: boolean,
): PathObject {
  const a = anchorAt(path, i);
  const other = which === 'in' ? 'out' : 'in';
  if (a.type) return replaced(path, i, handleByRule(a, which, to, keepOpposite));
  return replaced(path, i, {
    ...a,
    [which]: { ...to },
    ...(keepOpposite ? { [other]: mirror(a, to) } : {}),
  });
}

/** GV3: a typed node with one handle moved to `to`, its partner kept to the node's rule. */
function handleByRule(
  a: PathPoint,
  which: 'in' | 'out',
  to: Point,
  keepOpposite: boolean,
): PathPoint {
  const other = which === 'in' ? 'out' : 'in';
  const moved = { ...a, [which]: { ...to } };
  if (a.type === 'cusp' || !keepOpposite) return { ...moved, type: 'cusp' };
  if (a.type === 'symmetrical') return { ...moved, [other]: mirror(a, to) };
  const partner = a[other];
  const reach = Math.hypot(to.x - a.x, to.y - a.y);
  if (!partner || reach === 0) return moved;
  const keep = Math.hypot(partner.x - a.x, partner.y - a.y) / reach;
  return { ...moved, [other]: { x: a.x - (to.x - a.x) * keep, y: a.y - (to.y - a.y) * keep } };
}

/** The point becomes a corner: no handles. */
export function cornerPoint(path: PathObject, i: number): PathObject {
  const a = anchorAt(path, i);
  return replaced(path, i, { x: a.x, y: a.y });
}

/** A new anchor on the path, at the point of it nearest to `at` (a double-click on the line). */
export function insertPoint(path: PathObject, at: Point): PathObject {
  const anchors = anchorsOnStage(path);
  const segments = path.closed ? anchors.length : anchors.length - 1;
  let best = { distance: Infinity, segment: 0, point: at };
  for (let s = 0; s < segments; s++) {
    const pair = [anchors[s]!, anchors[(s + 1) % anchors.length]!];
    const pts = flattenCurves(pair, false);
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t =
        len2 === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((at.x - a.x) * (b.x - a.x) + (at.y - a.y) * (b.y - a.y)) / len2),
            );
      const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      const d = Math.hypot(at.x - p.x, at.y - p.y);
      if (d < best.distance) best = { distance: d, segment: s, point: p };
    }
  }
  return withAnchors(path, anchors.toSpliced(best.segment + 1, 0, best.point));
}

export function removePoint(path: PathObject, i: number): PathObject {
  anchorAt(path, i);
  if (path.closed && path.points.length <= 3)
    throw new EditError('A closed shape needs at least three points.');
  if (path.points.length <= 2) throw new EditError('A path needs at least two points.');
  return withAnchors(path, anchorsOnStage(path).toSpliced(i, 1));
}
