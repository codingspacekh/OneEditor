// GV1 (M19): the shapes Graphics mode adds to Animation mode's — the arc (part of an ellipse:
// open, a pie slice or a chord; J/20's 180° meter, J/24's cake with a slice cut out), the spiral
// (turns, inner radius and how it grows; a pen path of smooth curves) and the polyline (clicked
// straight lines). Each is made in a dragged box (or from clicked points) like the other tools'.
import { EditError } from '../model/errors.ts';
import { createEllipse, createPath } from '../animation/factory.ts';
import type { Point } from '../animation/geometry.ts';
import { flattenCurves } from '../animation/path.ts';
import type { EllipseObject, PathObject, PathPoint } from '../animation/types.ts';
import { handleFor } from './bezier.ts';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * GV1: the Arc tool's arc: the top half of the ellipse dragged out (from 180°, the left, round
 * through the top to 360°), as a line with no fill: a meter's scale. Its start, end and how it is
 * closed are changed in Properties.
 */
export const DEFAULT_ARC: NonNullable<EllipseObject['arc']> = {
  start: 180,
  end: 360,
  close: 'open',
};

export function createArc(box: Box): EllipseObject {
  return { ...createEllipse(box), name: 'Arc', arc: { ...DEFAULT_ARC }, fill: { kind: 'none' } };
}

/**
 * GV1: how a spiral is drawn: how many times it goes round, where it starts (its inner radius, %
 * of the outer one) and how it grows: `even` (the same gap every turn, as a coiled rope) or
 * `opening` (each turn wider than the last, as a snail's shell).
 */
export interface SpiralOptions {
  turns: number;
  inner: number;
  growth: 'even' | 'opening';
}

export const DEFAULT_SPIRAL: Readonly<SpiralOptions> = { turns: 3, inner: 0, growth: 'even' };
export const MIN_TURNS = 0.5;
export const MAX_TURNS = 20;
export const MAX_INNER = 90;
/** A spiral is worked out this big (px across its middle), then fitted to its box: big enough
 * for the fitting to follow the curve finely. */
const SIZE = 1000;
/** An opening spiral cannot start at the very centre: it starts this far out (% of the outer). */
const OPENING_START = 5;

export function validateSpiral(options: SpiralOptions): void {
  if (!(Number.isFinite(options.turns) && options.turns >= MIN_TURNS && options.turns <= MAX_TURNS))
    throw new EditError(`Choose from ${MIN_TURNS} to ${MAX_TURNS} turns for the spiral.`);
  if (!(Number.isFinite(options.inner) && options.inner >= 0 && options.inner <= MAX_INNER))
    throw new EditError(`Choose an inner radius from 0 to ${MAX_INNER} % of the spiral.`);
  if (options.growth !== 'even' && options.growth !== 'opening')
    throw new EditError('Choose how the spiral grows: evenly or opening out.');
}

/**
 * GV1: the spiral as smooth anchors (four a turn) filling a w × h box: from its inner end, at
 * the right of the centre, clockwise and outwards to the outer end.
 */
export function spiralAnchors(w: number, h: number, options: SpiralOptions): PathPoint[] {
  validateSpiral(options);
  const total = 2 * Math.PI * options.turns;
  const start =
    options.growth === 'opening'
      ? Math.max(options.inner, OPENING_START) / 100
      : options.inner / 100;
  const grow = Math.log(1 / start) / total;
  // The radius and how fast it grows at angle t (the outer radius is 1).
  const radius = (t: number) =>
    options.growth === 'even' ? start + ((1 - start) * t) / total : start * Math.exp(grow * t);
  const rate = (t: number) => (options.growth === 'even' ? (1 - start) / total : grow * radius(t));
  const pieces = Math.ceil(options.turns * 4 - 1e-9);
  const piece = total / pieces;
  const k = handleFor(piece);
  const unit = Array.from({ length: pieces + 1 }, (_, i): PathPoint => {
    const t = piece * i;
    const [c, s, r, dr] = [Math.cos(t), Math.sin(t), radius(t), rate(t)];
    const p = { x: SIZE * r * c, y: SIZE * r * s };
    // The way the spiral goes at t: outwards as it grows, and round.
    const d = { x: SIZE * (dr * c - r * s), y: SIZE * (dr * s + r * c) };
    return {
      ...p,
      ...(i > 0 ? { in: { x: p.x - k * d.x, y: p.y - k * d.y } } : {}),
      ...(i < pieces ? { out: { x: p.x + k * d.x, y: p.y + k * d.y } } : {}),
      ...(i > 0 && i < pieces ? { type: 'smooth' as const } : {}),
    };
  });
  return fitted(unit, w, h);
}

/** Anchors (handles and all) scaled and moved so the curve fills a w × h box exactly. */
function fitted(points: readonly PathPoint[], w: number, h: number): PathPoint[] {
  const line = flattenCurves(points, false);
  const xs = line.map((p) => p.x);
  const ys = line.map((p) => p.y);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  // Half a turn or more always has a width and a height.
  const sx = w / (Math.max(...xs) - x0);
  const sy = h / (Math.max(...ys) - y0);
  const f = (p: Point) => ({ x: (p.x - x0) * sx, y: (p.y - y0) * sy });
  return points.map((p) => ({
    ...p,
    ...f(p),
    ...(p.in ? { in: f(p.in) } : {}),
    ...(p.out ? { out: f(p.out) } : {}),
  }));
}

/** GV1: a spiral dragged out in `box`: an open pen path with no fill. */
export function createSpiral(box: Box, options: SpiralOptions = DEFAULT_SPIRAL): PathObject {
  const shape = createPath(
    [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
    ],
    false,
    'Spiral',
  );
  return { ...shape, points: spiralAnchors(box.width, box.height, options) };
}

/**
 * GV1: whether a path is still the spiral these options draw in its box (nothing about it edited
 * since), so changing the options can draw it again in its place.
 */
export function isSpiralOf(o: PathObject, options: SpiralOptions): boolean {
  if (o.closed || o.holes?.length) return false;
  let made: PathPoint[];
  try {
    made = spiralAnchors(o.width, o.height, options);
  } catch {
    return false;
  }
  const near = (a: Point | undefined, b: Point | undefined) =>
    a === b || (!!a && !!b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01);
  return (
    made.length === o.points.length &&
    made.every(
      (p, i) =>
        near(p, o.points[i]) && near(p.in, o.points[i]!.in) && near(p.out, o.points[i]!.out),
    )
  );
}

/**
 * GV1: the polyline's clicked points as a path of straight lines (a point clicked twice in the
 * same place counts once; a closed one's last point on its first is the first).
 */
export function createPolyline(points: readonly Point[], closed: boolean): PathObject {
  const kept = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y,
  );
  if (closed && kept.length > 1 && kept[0]!.x === kept.at(-1)!.x && kept[0]!.y === kept.at(-1)!.y)
    kept.pop();
  if (closed && kept.length < 3) throw new EditError('A closed shape needs at least three points.');
  return createPath(kept, closed, 'Polyline');
}

/**
 * GV1: Shift with the polyline: the point at the same distance from `from` as `to`, in the
 * nearest `step`° direction (0° to the right, as the other tools' 15° steps).
 */
export function angleStep(from: Point, to: Point, step = 15): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const turn = Math.atan2(to.y - from.y, to.x - from.x);
  const unit = (step * Math.PI) / 180;
  const snapped = Math.round(turn / unit) * unit;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    x: round(from.x + length * Math.cos(snapped)),
    y: round(from.y + length * Math.sin(snapped)),
  };
}
