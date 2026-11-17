// GT2, GT3 (M20): putting a text on a path or in a shape, and taking it off again. The student
// selects one text and one shape or path (a rectangle, an ellipse or arc, a star, a polygon, a
// pen path or line) and chooses *Put on path* or *Put in shape*. The shape's outline, as Bézier
// anchors (Convert to curves, GV2), is taken onto the stage with the shape's turn, flip, skew and
// envelope in it, and becomes the text's: the text's box is the outline's box (so it is picked
// and moved there), unturned. It stays text: its words, font and size can still be changed.
// - On a path the shape is used up: its outline is kept on the text, hidden (the papers: "do not
//   show the path") or drawn with the shape's outline colour and width.
// - In a shape the shape stays where it is (the frame the words are set in, filled or not), with
//   the text just in front of it.
// Curved text (AN26), a path and a shape are one at a time: setting one takes the others off.
import { EditError } from '../model/errors.ts';
import { DEFAULT_STROKE } from '../animation/factory.ts';
import { isClosed, isShape, toStage, type Point } from '../animation/geometry.ts';
import { findObject, removeObjects, replaceObjects, updateObject } from '../animation/layers.ts';
import { flattenCurves } from '../animation/path.ts';
import type {
  AnimationDoc,
  AnimObject,
  Id,
  PathObject,
  PathPoint,
  TextObject,
} from '../animation/types.ts';
import { toCurves } from './curves.ts';
import { defaultStart } from './text-path.ts';

/** GT3: how far in from the shape's outline the words are set when first put in, in px. */
export const DEFAULT_PADDING = 8;

const hundredths = (n: number) => Math.round(n * 100) / 100;

/** The text and the shape among the selection, or why they cannot be put together. */
function textAndShape(
  doc: AnimationDoc,
  ids: readonly Id[],
  how: string,
): { text: TextObject; shape: AnimObject } {
  const objects = ids.flatMap((id) => {
    const found = findObject(doc, id);
    return found ? [found.object] : [];
  });
  const text = objects.find((o): o is TextObject => o.kind === 'text');
  const shape = objects.find((o) => o !== text && isShape(o));
  if (objects.length !== 2 || !text || !shape)
    throw new EditError(
      `Select one text and one shape or path to ${how} (click one, then Shift+click the other).`,
    );
  return { text, shape };
}

/** The shape's outline (and holes) on the stage, as it is drawn. */
function outlineOnStage(shape: AnimObject): {
  points: PathPoint[];
  holes: PathPoint[][];
  closed: boolean;
} {
  const path = toCurves(shape) as PathObject;
  const at = (p: Point) => {
    const q = toStage(path, p);
    return { x: q.x, y: q.y };
  };
  const onStage = (points: readonly PathPoint[]): PathPoint[] =>
    points.map((p) => ({
      ...at(p),
      ...(p.in ? { in: at(p.in) } : {}),
      ...(p.out ? { out: at(p.out) } : {}),
      ...(p.type ? { type: p.type } : {}),
    }));
  return {
    points: onStage(path.points),
    holes: (path.holes ?? []).map(onStage),
    closed: path.closed && isClosed(shape),
  };
}

/** The box round an outline (at least 1 px each way) and its points moved into it. */
function boxed(points: PathPoint[], holes: PathPoint[][], closed: boolean) {
  const flat = flattenCurves(points, closed);
  const xs = flat.map((p) => p.x);
  const ys = flat.map((p) => p.y);
  let [x, y] = [Math.min(...xs), Math.min(...ys)];
  let [width, height] = [Math.max(...xs) - x, Math.max(...ys) - y];
  // A straight line across has no height: its box is 1 px high round it, so it can be picked.
  if (width < 1) [x, width] = [x - (1 - width) / 2, 1];
  if (height < 1) [y, height] = [y - (1 - height) / 2, 1];
  const move = (p: Point) => ({ x: hundredths(p.x - x), y: hundredths(p.y - y) });
  const into = (list: PathPoint[]): PathPoint[] =>
    list.map((p) => ({
      ...p,
      ...move(p),
      ...(p.in ? { in: move(p.in) } : {}),
      ...(p.out ? { out: move(p.out) } : {}),
    }));
  return {
    box: {
      x: hundredths(x),
      y: hundredths(y),
      width: hundredths(width),
      height: hundredths(height),
    },
    points: into(points),
    holes: holes.map(into),
  };
}

/** The text placed in a new box, unturned and unbent, with no curve, path or shape. */
function placedText(t: TextObject, box: Pick<AnimObject, 'x' | 'y' | 'width' | 'height'>) {
  const next: TextObject = { ...t, ...box, rotation: 0 };
  for (const key of ['flipX', 'flipY', 'skewX', 'skewY', 'pivot', 'curve', 'path', 'inShape'])
    delete (next as unknown as Record<string, unknown>)[key];
  return next;
}

/**
 * GT2 *Put on path*: the selected text's words follow the selected shape's or path's outline,
 * which is taken off the stage and kept on the text, `show`n with the shape's outline (or a
 * plain one) or hidden. Returns the new document and the text's id (one undo step in the app).
 */
export function putOnPath(
  doc: AnimationDoc,
  ids: readonly Id[],
  { show = false }: { show?: boolean } = {},
): { doc: AnimationDoc; id: Id } {
  const { text, shape } = textAndShape(doc, ids, 'put the text on');
  const outline = outlineOnStage(shape);
  const { box, points } = boxed(outline.points, [], outline.closed);
  const line = { points, closed: outline.closed };
  const stroke = shape.stroke && shape.stroke.width > 0 ? shape.stroke : DEFAULT_STROKE;
  const next: TextObject = {
    ...placedText(text, box),
    path: {
      ...line,
      start: defaultStart(line, text.align),
      side: 'outside',
      ...(show ? { stroke: { ...stroke } } : {}),
    },
  };
  const placed = updateObject(doc, text.id, () => next);
  return { doc: removeObjects(placed, [shape.id]), id: text.id };
}

/**
 * GT3 *Put in shape*: the selected text's lines wrap inside the selected closed shape, `padding`
 * px in from its outline; the shape stays, the text just in front of it on its layer.
 */
export function putInShape(
  doc: AnimationDoc,
  ids: readonly Id[],
  { padding = DEFAULT_PADDING }: { padding?: number } = {},
): { doc: AnimationDoc; id: Id } {
  const { text, shape } = textAndShape(doc, ids, 'put the text in');
  const outline = outlineOnStage(shape);
  if (!outline.closed || outline.points.length < 3)
    throw new EditError(
      'Choose a closed shape to put the text in: a rectangle, an ellipse, a star, a polygon or a closed path.',
    );
  const { box, points, holes } = boxed(outline.points, outline.holes, true);
  const next: TextObject = {
    ...placedText(text, box),
    inShape: { points, ...(holes.length ? { holes } : {}), padding },
  };
  const t = findObject(doc, text.id)!;
  const s = findObject(doc, shape.id)!;
  if (t.layerId !== s.layerId || t.index > s.index)
    return { doc: updateObject(doc, text.id, () => next), id: text.id };
  // Behind the shape on its layer: brought to just in front of it, so the words are seen.
  const without = removeObjects(doc, [text.id]);
  return { doc: replaceObjects(without, [shape.id], ([o]) => [o!, next]).doc, id: text.id };
}

/**
 * GT2 *Take off path*, GT3 *Take out of shape*: the text straight again, in a box the size of
 * its words (`box`, measured by the app) centred where the path or shape was.
 */
export function takeOffOutline(
  doc: AnimationDoc,
  id: Id,
  box: { width: number; height: number },
): AnimationDoc {
  const found = findObject(doc, id)?.object;
  if (found?.kind !== 'text' || (!found.path && !found.inShape))
    throw new EditError('Select a text that is on a path or in a shape.');
  return updateObject(doc, id, (t) => {
    const next = { ...t } as TextObject;
    delete next.path;
    delete next.inShape;
    return {
      ...next,
      ...box,
      x: hundredths(t.x + (t.width - box.width) / 2),
      y: hundredths(t.y + (t.height - box.height) / 2),
    };
  });
}
