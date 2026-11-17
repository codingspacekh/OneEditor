// GV1, GV2 (M19): the exact curves of the shapes, as a pen path's anchors (PathPoint, in the
// object's own box: 0, 0 is its top left). An ellipse is four cubic Bézier curves (each handle
// 0.5523 of the radius: the usual "kappa"), an arc of one as many curves as it has quarter turns
// or less, and a rounded rectangle's corners quarter circles. Convert to curves (curves.ts), the
// outline of an arc (geometry.ts) and Combine use them, so a shape keeps its look as a path.
// Pure: only types are imported, so geometry.ts can use it.
import type { EllipseObject, PathPoint } from '../animation/types.ts';

type Arc = NonNullable<EllipseObject['arc']>;

interface Pt {
  x: number;
  y: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** A cubic Bézier's handle for a piece of a circle `angle` radians long, per unit of radius. */
export const handleFor = (angle: number): number => (4 / 3) * Math.tan(angle / 4);

/** The ellipse's quarter handle: 4/3 · tan(22.5°) ≈ 0.5523. */
export const KAPPA = handleFor(Math.PI / 2);

/**
 * GV1: how far round an arc goes, in degrees, more than 0 and at most 360: from `start` to `end`
 * clockwise, so 300 → 60 is 120°; the same start and end is the whole way round.
 */
export function arcSweep(arc: Pick<Arc, 'start' | 'end'>): number {
  const sweep = (((arc.end - arc.start) % 360) + 360) % 360;
  return sweep === 0 ? 360 : sweep;
}

/** An anchor with only the handles it has (none left as undefined, so files stay small). */
function anchor(at: Pt, inHandle?: Pt, outHandle?: Pt, smooth = false): PathPoint {
  return {
    x: at.x,
    y: at.y,
    ...(inHandle ? { in: inHandle } : {}),
    ...(outHandle ? { out: outHandle } : {}),
    ...(smooth ? { type: 'smooth' as const } : {}),
  };
}

/**
 * The anchors of part of the ellipse filling a w × h box, from `start` to `start + sweep` radians
 * clockwise (0 at the right; the angle of the circle the ellipse is a stretched copy of, as the
 * canvas's ellipse()), in pieces of a quarter turn or less.
 */
function ellipseRun(w: number, h: number, start: number, sweep: number): PathPoint[] {
  const [rx, ry, cx, cy] = [w / 2, h / 2, w / 2, h / 2];
  const pieces = Math.max(1, Math.ceil(sweep / (Math.PI / 2) - 1e-9));
  const piece = sweep / pieces;
  const k = handleFor(piece);
  const at = (t: number): Pt => ({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  // The way the ellipse goes at t (clockwise), as long as the radius.
  const along = (t: number): Pt => ({ x: -rx * Math.sin(t), y: ry * Math.cos(t) });
  return Array.from({ length: pieces + 1 }, (_, i) => {
    const t = start + piece * i;
    const p = at(t);
    const d = along(t);
    const before = i > 0 ? { x: p.x - k * d.x, y: p.y - k * d.y } : undefined;
    const after = i < pieces ? { x: p.x + k * d.x, y: p.y + k * d.y } : undefined;
    return anchor(p, before, after, i > 0 && i < pieces);
  });
}

/**
 * GV1, GV2: an ellipse (or its arc) as anchors and whether the outline is closed. The whole
 * ellipse starts at the right and goes clockwise. An arc runs from its start to its end; a pie
 * slice goes on to the centre and back, a chord straight back across; an open arc is just the line.
 */
export function ellipseAnchors(
  w: number,
  h: number,
  arc?: Arc,
): { points: PathPoint[]; closed: boolean } {
  if (!arc) {
    const run = ellipseRun(w, h, 0, 2 * Math.PI);
    // The last anchor is the first again: the first takes its handle in.
    const [first, ...rest] = run.slice(0, -1);
    return { points: [{ ...first!, in: run.at(-1)!.in!, type: 'smooth' }, ...rest], closed: true };
  }
  const points = ellipseRun(w, h, rad(arc.start), rad(arcSweep(arc)));
  if (arc.close === 'pie') return { points: [...points, { x: w / 2, y: h / 2 }], closed: true };
  return { points, closed: arc.close === 'chord' };
}

/**
 * GV2: a rectangle with rounded corners (radius `radius`, at most half its shorter side) as
 * anchors, from the end of the top-left corner clockwise, as the stage draws it. Square corners:
 * the four corners.
 */
export function roundedRectAnchors(w: number, h: number, radius: number): PathPoint[] {
  const r = Math.min(radius, w / 2, h / 2);
  if (!(r > 0))
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  const k = KAPPA * r;
  // Each side: where it starts (the end of the corner before) and ends (the start of the next).
  const sides: [Pt, Pt, Pt, Pt][] = [
    // [start, its handle in (from the corner before), end, its handle out (into the next corner)]
    [
      { x: r, y: 0 },
      { x: r - k, y: 0 },
      { x: w - r, y: 0 },
      { x: w - r + k, y: 0 },
    ],
    [
      { x: w, y: r },
      { x: w, y: r - k },
      { x: w, y: h - r },
      { x: w, y: h - r + k },
    ],
    [
      { x: w - r, y: h },
      { x: w - r + k, y: h },
      { x: r, y: h },
      { x: r - k, y: h },
    ],
    [
      { x: 0, y: h - r },
      { x: 0, y: h - r + k },
      { x: 0, y: r },
      { x: 0, y: r - k },
    ],
  ];
  const points = sides.flatMap(([a, aIn, b, bOut]) => [anchor(a, aIn), anchor(b, undefined, bOut)]);
  return mergeTouching(points, true);
}

/**
 * Anchors at the same place one after another made one (a side of no length, as a rounded
 * rectangle's whose corners meet): the first keeps its handle in, the second its handle out.
 */
export function mergeTouching(points: readonly PathPoint[], closed: boolean): PathPoint[] {
  const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
  const out: PathPoint[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && same(last, p)) out[out.length - 1] = joined(last, p);
    else out.push(p);
  }
  if (closed && out.length > 1 && same(out[0]!, out.at(-1)!))
    out.splice(0, 1, joined(out.pop()!, out[0]!));
  return out;
}

/** One anchor for two at the same place: `a`'s handle in and `b`'s handle out (smooth if both). */
function joined(a: PathPoint, b: PathPoint): PathPoint {
  return anchor(b, a.in, b.out, Boolean(a.in && b.out));
}
