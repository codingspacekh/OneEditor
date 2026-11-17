// GV2 (M19): replication — Step and repeat (n copies, each moved by the same step and / or turned
// by the same angle about a point: J/23's spokes evenly round the hub, M/26's chip legs evenly
// spaced, six protons round a nucleus) and Mirror copy (a flipped copy beside or over the
// original: the other half of a symmetrical shape). Copies go just above their originals.
import { EditError } from '../model/errors.ts';
import {
  boundsOf,
  flipObject,
  moved,
  pivotOnStage,
  shiftTracks,
  type Bounds,
  type Point,
} from '../animation/geometry.ts';
import { copiesAbove, findObject } from '../animation/layers.ts';
import type { AnimationDoc, AnimObject, Id } from '../animation/types.ts';

/** Where copies turn about: the middle of the selection, of the canvas, or a typed point. */
export type TurnAbout = 'selection' | 'canvas' | Point;

export interface StepRepeat {
  /** How many copies (the original stays). */
  copies: number;
  /** Each copy's step from the one before, in stage px. */
  dx: number;
  dy: number;
  /** Each copy's turn from the one before, in degrees clockwise. */
  angle: number;
  about: TurnAbout;
}

export const MAX_COPIES = 500;

/** The selected objects (top-level), in the order given; refused if one has gone. */
function selected(doc: AnimationDoc, ids: readonly Id[]): AnimObject[] {
  if (ids.length === 0) throw new EditError('Select the objects to copy.');
  return ids.map((id) => {
    const found = findObject(doc, id);
    if (!found) throw new EditError('That object no longer exists.');
    return found.object;
  });
}

/** The box round what the objects show (a turned object's corners). */
function unionOf(objects: readonly AnimObject[]): Bounds {
  const boxes = objects.map(boundsOf);
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}

const middleOf = (b: Bounds): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/**
 * The object turned by `deg` about the stage point `centre`: it turns about its own pivot (AN27)
 * by as much, and that pivot goes round the centre; its motion goes with it.
 */
export function turnedAbout<T extends AnimObject>(o: T, centre: Point, deg: number): T {
  if (deg === 0) return o;
  const p = pivotOnStage(o);
  const a = (deg * Math.PI) / 180;
  const [vx, vy] = [p.x - centre.x, p.y - centre.y];
  const to = {
    x: centre.x + vx * Math.cos(a) - vy * Math.sin(a),
    y: centre.y + vx * Math.sin(a) + vy * Math.cos(a),
  };
  const turned = {
    ...shiftTracks(o, { rotation: deg }),
    rotation: (((o.rotation + deg) % 360) + 360) % 360,
  };
  return moved(turned, to.x - p.x, to.y - p.y);
}

export function validateStepRepeat(step: StepRepeat): void {
  if (!(Number.isInteger(step.copies) && step.copies >= 1 && step.copies <= MAX_COPIES))
    throw new EditError(`Choose from 1 to ${MAX_COPIES} copies.`);
  if (![step.dx, step.dy, step.angle].every(Number.isFinite))
    throw new EditError('Each move and turn must be a number.');
  if (typeof step.about === 'object' && ![step.about.x, step.about.y].every(Number.isFinite))
    throw new EditError('The point to turn about must be two numbers.');
  if (step.dx === 0 && step.dy === 0 && step.angle % 360 === 0)
    throw new EditError(
      'Each copy would sit on the one before: give each a move across or down, or a turn.',
    );
}

/**
 * GV2 Step and repeat: `copies` copies of each selected object, the n-th turned by n × angle
 * about the chosen point and then moved by n × (dx, dy). The copies' ids, in order.
 */
export function stepAndRepeat(
  doc: AnimationDoc,
  ids: readonly Id[],
  step: StepRepeat,
): { doc: AnimationDoc; ids: Id[] } {
  validateStepRepeat(step);
  const objects = selected(doc, ids);
  const centre =
    step.about === 'canvas'
      ? { x: doc.stage.width / 2, y: doc.stage.height / 2 }
      : step.about === 'selection'
        ? middleOf(unionOf(objects))
        : step.about;
  let next = doc;
  const made: Id[] = [];
  for (const o of objects) {
    const result = copiesAbove(next, o.id, step.copies, (copy, n) =>
      moved(turnedAbout(copy, centre, n * step.angle), n * step.dx, n * step.dy),
    );
    next = result.doc;
    made.push(...result.ids);
  }
  return { doc: next, ids: made };
}

export type MirrorAxis = 'horizontal' | 'vertical';

/**
 * GV2 Mirror copy: the selection mirrored as a whole, left to right (horizontal) or top to
 * bottom, as a copy: `beside` it (touching its right, or bottom, edge: the other half of a heart),
 * or `over` it (in the same place). The copies' ids.
 */
export function mirrorCopy(
  doc: AnimationDoc,
  ids: readonly Id[],
  axis: MirrorAxis,
  place: 'beside' | 'over',
): { doc: AnimationDoc; ids: Id[] } {
  const objects = selected(doc, ids);
  const box = unionOf(objects);
  const across = axis === 'horizontal';
  // The mirror line: x = m (horizontal) or y = m (vertical).
  const m = across
    ? box.x + (place === 'beside' ? box.width : box.width / 2)
    : box.y + (place === 'beside' ? box.height : box.height / 2);
  let next = doc;
  const made: Id[] = [];
  for (const o of objects) {
    const result = copiesAbove(next, o.id, 1, (copy) => {
      // Flipped about its own pivot, which then goes to its mirror image across the line.
      const flipped = flipObject(copy, axis);
      const p = pivotOnStage(flipped);
      return across ? moved(flipped, 2 * (m - p.x), 0) : moved(flipped, 0, 2 * (m - p.y));
    });
    next = result.doc;
    made.push(...result.ids);
  }
  return { doc: next, ids: made };
}
