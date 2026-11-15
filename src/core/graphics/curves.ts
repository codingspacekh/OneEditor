// GV2 (M19): Convert to curves — a shape becomes a pen path that looks the same, so each of its
// points can be moved (a star's arm pulled out, a rounded corner made square): the same box,
// fill, outline, opacity, turn, flips, skew, the point it turns about, effects and envelope.
// Ellipses (and arcs) and rounded corners are exact Bézier curves (bezier.ts); a group's shapes
// are converted inside it. Text waits for the Text tools (GT4, M20); a picture or a button has no
// outline to convert.
import { EditError } from '../model/errors.ts';
import { localOutline } from '../animation/geometry.ts';
import { findObject, replaceObjects } from '../animation/layers.ts';
import type { AnimationDoc, AnimObject, Id, PathObject, PathPoint } from '../animation/types.ts';
import { ellipseAnchors, roundedRectAnchors } from './bezier.ts';
import { applyEnvelope } from './warp.ts';

/** Why an object cannot be converted, or null when it can. */
export function whyNotCurves(o: AnimObject): string | null {
  switch (o.kind) {
    case 'text':
      return 'Text to curves comes with the Text tools. For now, text stays text.';
    case 'picture':
      return 'A picture has no outline to convert. Trace it (Trace bitmap) to make it shapes.';
    case 'button':
      return 'A button stays a button: it cannot be converted to curves.';
    case 'group':
      return o.children.some((c) => whyNotCurves(c) === null)
        ? null
        : 'Nothing in this group can be converted to curves.';
    default:
      return null;
  }
}

/** The shape's outline as anchors in its box, and whether it is closed. */
function anchorsOf(o: AnimObject): { points: PathPoint[]; closed: boolean } {
  switch (o.kind) {
    case 'rect':
      return { points: roundedRectAnchors(o.width, o.height, o.radius), closed: true };
    case 'ellipse':
      return ellipseAnchors(o.width, o.height, o.arc);
    default:
      // A star and a polygon are their corners.
      return { points: localOutline(o).map((p) => ({ x: p.x, y: p.y })), closed: true };
  }
}

/** What only a rectangle, an ellipse, a star or a polygon has; a path does not keep it. */
const SHAPE_ONLY = ['radius', 'arc', 'points', 'inner', 'sides'] as const;

/**
 * GV2: the object as a pen path (or, for a group, with its shapes as pen paths), looking the same.
 * Throws an EditError saying why when it cannot be converted.
 */
export function toCurves(o: AnimObject): AnimObject {
  const why = whyNotCurves(o);
  if (why) throw new EditError(why);
  // GV4: a bent shape is converted as it is drawn, its envelope applied.
  if (o.envelope) return toCurves(applyEnvelope(o));
  if (o.kind === 'path') return o;
  if (o.kind === 'group')
    return {
      ...o,
      children: o.children.map((c) => (whyNotCurves(c) === null ? toCurves(c) : c)),
    };
  const { points, closed } = anchorsOf(o);
  const rest: Record<string, unknown> = { ...o };
  for (const key of SHAPE_ONLY) delete rest[key];
  // A corner radius has nothing to change in a path; the other keyframes still apply.
  const tracks = o.tracks?.filter((t) => t.property !== 'radius');
  if (tracks?.length) rest.tracks = tracks;
  else delete rest.tracks;
  return {
    ...(rest as Omit<PathObject, 'kind' | 'points' | 'closed'>),
    kind: 'path',
    points,
    closed,
  };
}

/** A shape as a pen path (for Combine and Join): only shapes are given. */
export const pathOfShape = (o: AnimObject): PathObject => toCurves(o) as PathObject;

/**
 * GV2: the selected objects converted, each where it was (one undo step in the app). Those that
 * cannot be are left as they are; when none can, the first one's reason is given.
 */
export function convertToCurves(doc: AnimationDoc, ids: readonly Id[]): AnimationDoc {
  if (ids.length === 0) throw new EditError('Select the shapes to convert to curves.');
  const found = ids.map((id) => {
    const object = findObject(doc, id)?.object;
    if (!object) throw new EditError('That object no longer exists.');
    return object;
  });
  const reasons = found.map(whyNotCurves);
  if (reasons.every((why) => why !== null)) throw new EditError(reasons[0]!);
  return found.reduce(
    (next, o, i) =>
      reasons[i] === null ? replaceObjects(next, [o.id], () => [toCurves(o)]).doc : next,
    doc,
  );
}
