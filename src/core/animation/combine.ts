// AN23 Flip and AN24 Combine shapes (M17a, from the 2022–2026 animation benchmark). Combining
// works on the shapes' outlines as the stage shows them (turned, flipped, curves as fine straight
// sides): Union makes one shape of them, Cut out takes the shapes in front out of the backmost one
// (a bite out of an apple, O/N/25), Intersect keeps only where they all overlap. The result keeps
// the backmost shape's name, colours, outline and opacity; keyframes are not kept (it is a new
// shape). Holes are kept as the path's holes (filled even-odd).
// G1, B3 (Graphics benchmark, 2026-11-17): the result keeps the shapes' curves (three circles
// joined are a few Bézier curves, boolean-curves.ts), and looks exactly as the back shape did: no
// outline if it had none, its effects and fill opacity too.
// G4 (M19): Exclude keeps where an odd number of them overlap; Combine makes one path of all
// their outlines, curves kept, filled even-odd (where two overlap is a hole); Join meets two open
// lines at their nearest ends (closed when their other ends meet too).
import { EditError } from '../model/errors.ts';
import type { Id } from '../model/types.ts';
import { combineCurves, type BooleanHow } from '../graphics/boolean-curves.ts';
import { pathOfShape } from '../graphics/curves.ts';
import { createPath } from './factory.ts';
import { flattenPath, flipObject, isClosed, isShape, toStage } from './geometry.ts';
import { replaceObjects } from './layers.ts';
import { anchorsOnStage } from './pen.ts';
import type { AnimationDoc, AnimObject, PathObject, PathPoint } from './types.ts';

export { flipObject };

export type CombineHow = 'union' | 'cutOut' | 'intersect' | 'exclude' | 'combine' | 'join';

/** The name of each way of combining, as the buttons and the undo history show it. */
export const COMBINE_LABELS: Record<CombineHow, string> = {
  union: 'Union',
  cutOut: 'Cut out',
  intersect: 'Intersect',
  exclude: 'Exclude',
  combine: 'Combine',
  join: 'Join',
};
const LABELS = COMBINE_LABELS;

const CLIPPING: Record<'union' | 'cutOut' | 'intersect' | 'exclude', BooleanHow> = {
  union: 'union',
  cutOut: 'difference',
  intersect: 'intersection',
  exclude: 'xor',
};

/** The shapes, back to front, combined: one or more new pen shapes. */
export function combineShapes(objects: readonly AnimObject[], how: CombineHow): PathObject[] {
  if (how === 'join') return [joinLines(objects)];
  if (objects.length < 2)
    throw new EditError(`Select two or more shapes to ${LABELS[how].toLowerCase()}.`);
  if (!objects.every((o) => isShape(o) && isClosed(o)))
    throw new EditError(
      'Only shapes can be combined: not text, pictures, buttons, groups or open lines.',
    );
  if (how === 'combine') return [compoundOf(objects)];
  // The outlines as the stage shows them (turned, flipped, bent), their curves kept.
  const result = combineCurves(objects.map(ringsOf), CLIPPING[how]);
  if (result.length === 0)
    throw new EditError(
      how === 'intersect'
        ? 'The shapes do not overlap, so nothing would be left.'
        : how === 'exclude'
          ? 'The shapes cover each other exactly, so nothing would be left.'
          : 'Nothing would be left of the shape at the back.',
    );
  return result.map((rings) => penPath(rings, true, objects[0]!));
}

const mapAnchor = (p: PathPoint, f: (q: { x: number; y: number }) => { x: number; y: number }) => ({
  ...p,
  ...f(p),
  ...(p.in ? { in: f(p.in) } : {}),
  ...(p.out ? { out: f(p.out) } : {}),
});

/**
 * G4: a pen path through outlines given on the stage (with their curves): the first is its
 * outline, the others its holes (filled even-odd), its box round them all; it looks as `like`.
 */
function penPath(rings: PathPoint[][], closed: boolean, like: AnimObject): PathObject {
  const line = rings.flatMap((r, i) => flattenPath(r, i > 0 || closed));
  const xs = line.map((p) => p.x);
  const ys = line.map((p) => p.y);
  const corner = { x: Math.min(...xs), y: Math.min(...ys) };
  const shape = createPath([corner, { x: Math.max(...xs), y: Math.max(...ys) }], closed, like.name);
  const local = (r: PathPoint[]) =>
    r.map((p) => mapAnchor(p, (q) => ({ x: q.x - corner.x, y: q.y - corner.y })));
  const [outline, ...holes] = rings.map(local);
  const made: PathObject = {
    ...shape,
    points: outline!,
    fill: like.fill,
    opacity: like.opacity,
    ...(holes.length ? { holes } : {}),
  };
  // B3: its outline as the back one's (none if it had none), its effects and fill opacity too.
  if (like.stroke) made.stroke = like.stroke;
  else delete made.stroke;
  if (like.filters?.length) made.filters = like.filters;
  if (like.fillOpacity !== undefined) made.fillOpacity = like.fillOpacity;
  return made;
}

/** A shape's outlines (outline and holes) on the stage, as anchors with their curves. */
function ringsOf(o: AnimObject): PathPoint[][] {
  const path = pathOfShape(o);
  return [path.points, ...(path.holes ?? [])].map((r) =>
    r.map((p) => mapAnchor(p, (q) => toStage(path, q))),
  );
}

/**
 * G4 Combine: one path of every outline of the shapes, back to front, curves kept; filled
 * even-odd, so where two overlap is a hole (a ring from two circles, a window in a wall).
 */
function compoundOf(objects: readonly AnimObject[]): PathObject {
  return penPath(objects.flatMap(ringsOf), true, objects[0]!);
}

/** How near (px) two ends must be to count as meeting. */
const MEET = 1;

const reversed = (points: readonly PathPoint[]): PathPoint[] =>
  points.toReversed().map(({ in: inHandle, out, ...p }) => ({
    ...p,
    ...(out ? { in: out } : {}),
    ...(inHandle ? { out: inHandle } : {}),
  }));

const apart = (a: PathPoint, b: PathPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** One anchor for two that meet: `a`'s way in and `b`'s way out, where `b` is. */
const met = (a: PathPoint, b: PathPoint): PathPoint => ({
  x: b.x,
  y: b.y,
  ...(a.in ? { in: a.in } : {}),
  ...(b.out ? { out: b.out } : {}),
});

/**
 * G4 Join: two open lines (paths, arcs, spirals, lines) made one, their nearest ends meeting (a
 * straight line between them if they are apart); when the other two ends meet too, it is closed.
 * The back one's look is kept.
 */
function joinLines(objects: readonly AnimObject[]): PathObject {
  if (objects.length !== 2 || !objects.every((o) => isShape(o) && !isClosed(o)))
    throw new EditError('Select two open lines to join (paths, lines, arcs or spirals).');
  const [a, b] = objects.map((o) => anchorsOnStage(pathOfShape(o))) as [PathPoint[], PathPoint[]];
  // The nearest ends: a's end to b's start, with either turned round.
  const ways: [PathPoint[], PathPoint[]][] = [
    [a, b],
    [a, reversed(b)],
    [reversed(a), b],
    [reversed(a), reversed(b)],
  ];
  const [first, second] = ways.reduce((best, way) =>
    apart(way[0].at(-1)!, way[1][0]!) < apart(best[0].at(-1)!, best[1][0]!) - 1e-9 ? way : best,
  );
  let points =
    apart(first.at(-1)!, second[0]!) <= MEET
      ? [...first.slice(0, -1), met(first.at(-1)!, second[0]!), ...second.slice(1)]
      : [...first, ...second];
  const closes = points.length >= 3 && apart(points.at(-1)!, points[0]!) <= MEET;
  if (closes) points = [met(points.at(-1)!, points[0]!), ...points.slice(1, -1)];
  return penPath([points], closes, objects[0]!);
}

/** The selected shapes (on one layer) replaced by their combination, where the back one was. */
export function combineObjects(
  doc: AnimationDoc,
  ids: readonly Id[],
  how: CombineHow,
): { doc: AnimationDoc; ids: Id[] } {
  return replaceObjects(doc, ids, (objects) => combineShapes(objects, how));
}
