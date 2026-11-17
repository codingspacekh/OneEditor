// GV4, G3 (M19): the stage's handles for an envelope — perspective's four corners, and a custom
// envelope's corners and the control points of its four sides — placed where the bent box is on
// the stage (turned, flipped and skewed with the object), and what a drag of one makes.
import { toLocal, toStage, type Point } from '../../core/animation/geometry.ts';
import { updateObject } from '../../core/animation/layers.ts';
import type {
  AnimationDoc,
  AnimObject,
  Envelope,
  EnvelopeSides,
  EnvPoint,
  Id,
} from '../../core/animation/types.ts';
import { cornersOf, moveControl, moveCorner, sidesOf } from '../../core/graphics/envelope.ts';
import { whyNotBendable } from '../../core/graphics/warp.ts';

/** What can be dragged: a corner (going round from the top left), or a side's control point. */
export type EnvelopeGrip =
  | { kind: 'corner'; index: 0 | 1 | 2 | 3 }
  | { kind: 'control'; side: keyof EnvelopeSides; which: 'c1' | 'c2' };

export interface PlacedGrip {
  grip: EnvelopeGrip;
  label: string;
  at: Point;
  /** A control point's corner, for the line drawn to it. */
  from?: Point;
}

/** An envelope that is shaped on the stage: perspective or custom, on something bendable. */
export const shapedOnStage = (o: AnimObject | null): o is AnimObject & { envelope: Envelope } =>
  !!o &&
  (o.envelope?.kind === 'perspective' || o.envelope?.kind === 'custom') &&
  whyNotBendable(o) === null;

/** A point of the box (fractions) on the stage. */
export const onStage = (o: AnimObject, f: EnvPoint): Point =>
  toStage(o, { x: f.x * o.width, y: f.y * o.height });

/** A stage point as fractions of the object's box (to 4 decimals); null for a box 0 wide or high. */
export function fractionAt(o: AnimObject, p: Point): EnvPoint | null {
  if (o.width === 0 || o.height === 0) return null;
  const l = toLocal(o, p);
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { x: r(l.x / o.width), y: r(l.y / o.height) };
}

const CORNER_NAMES = ['top left', 'top right', 'bottom right', 'bottom left'];
const SIDES: [keyof EnvelopeSides, 'c1' | 'c2', 'a' | 'b'][] = [
  ['top', 'c1', 'a'],
  ['top', 'c2', 'b'],
  ['right', 'c1', 'a'],
  ['right', 'c2', 'b'],
  ['bottom', 'c1', 'a'],
  ['bottom', 'c2', 'b'],
  ['left', 'c1', 'a'],
  ['left', 'c2', 'b'],
];

/** The handles to show: four corners, and for a custom envelope the eight control points. */
export function gripsOf(o: AnimObject & { envelope: Envelope }): PlacedGrip[] {
  const corners = cornersOf(o.envelope).map((c, i) => ({
    grip: { kind: 'corner' as const, index: i as 0 | 1 | 2 | 3 },
    label: `Envelope corner, ${CORNER_NAMES[i]}`,
    at: onStage(o, c),
  }));
  if (o.envelope.kind !== 'custom') return corners;
  const sides = o.envelope.sides;
  const controls = SIDES.map(([side, which, end]) => ({
    grip: { kind: 'control' as const, side, which },
    label: `Envelope handle, ${side} side, ${which === 'c1' ? 'first' : 'second'}`,
    at: onStage(o, sides[side][which]),
    from: onStage(o, sides[side][end]),
  }));
  return [...corners, ...controls];
}

/** The bent box's four sides on the stage, as an SVG path (a turn or skew keeps curves curves). */
export function sidesPath(o: AnimObject & { envelope: Envelope }): string {
  const n = (v: number) => Math.round(v * 100) / 100;
  const pt = (f: EnvPoint) => {
    const p = onStage(o, f);
    return `${n(p.x)} ${n(p.y)}`;
  };
  const { top, right, bottom, left } = sidesOf(o.envelope);
  // Round the box: the bottom and left sides run the other way.
  return [
    `M ${pt(top.a)}`,
    `C ${pt(top.c1)} ${pt(top.c2)} ${pt(top.b)}`,
    `C ${pt(right.c1)} ${pt(right.c2)} ${pt(right.b)}`,
    `C ${pt(bottom.c2)} ${pt(bottom.c1)} ${pt(bottom.a)}`,
    `C ${pt(left.c2)} ${pt(left.c1)} ${pt(left.a)} Z`,
  ].join(' ');
}

/** The envelope with the grip moved to `to` (fractions of the box). */
export function draggedTo(envelope: Envelope, grip: EnvelopeGrip, to: EnvPoint): Envelope {
  return grip.kind === 'corner'
    ? moveCorner(envelope, grip.index, to)
    : moveControl(envelope, grip.side, grip.which, to);
}

/** The document as it looks while a grip is dragged: that object with the dragged envelope. */
export function previewEnvelope(
  doc: AnimationDoc,
  bending: { id: Id; envelope: Envelope } | null,
): AnimationDoc {
  if (!bending) return doc;
  try {
    return updateObject(doc, bending.id, (o) => ({ ...o, envelope: bending.envelope }));
  } catch {
    // Gone (or its layer locked) while dragging: shown as it is.
    return doc;
  }
}
