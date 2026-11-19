// 2026-11-18 (AN11): an object that moves with another — the Earth round the Sun, the Moon round
// the Earth. The link remembers where the other object's point of turn (AN27) was at frame 0 when
// it was made; at any frame the linked object is moved by as much as that point is from there,
// the other object's own link included, on top of its own keyframes and paths. So it stays put
// when linked (at frame 0), goes along as the other one moves, and goes along when the other one
// is put somewhere else. Only the move is passed on: a turn or a new size of the other object
// does not turn or size it. Links are between objects on the stage itself (not inside groups),
// on any layers.
import { EditError } from '../model/errors.ts';
import { pivotOnStage, type Point } from './geometry.ts';
import { updateObject } from './layers.ts';
import { objectAt } from './tween.ts';
import type { AnimObject, AnimationDoc, Id } from './types.ts';

const ZERO: Readonly<Point> = { x: 0, y: 0 };

const topLevel = (doc: AnimationDoc): Map<Id, AnimObject> =>
  new Map(doc.layers.flatMap((l) => l.objects.map((o) => [o.id, o] as const)));

/** True when the document has any link, so a frame needs them worked out. */
export const hasLinks = (doc: AnimationDoc): boolean =>
  doc.layers.some((l) => l.objects.some((o) => o.link !== undefined));

/** How far each linked object is moved at a frame, by id (the unlinked are left out). */
export function linkOffsets(doc: AnimationDoc, frame: number): Map<Id, Point> {
  const objects = topLevel(doc);
  const done = new Map<Id, Point>();
  const visiting = new Set<Id>();
  const offset = (id: Id): Point => {
    const known = done.get(id);
    if (known) return known;
    const o = objects.get(id);
    const link = o?.link;
    const other = link === undefined ? undefined : objects.get(link.to);
    // A link to a deleted object, or round in a loop (never made, but a file may say so): none.
    if (!link || !other || visiting.has(id)) return ZERO;
    visiting.add(id);
    const at = pointOf(other, frame, offset(other.id));
    visiting.delete(id);
    const result = { x: at.x - link.x, y: at.y - link.y };
    done.set(id, result);
    return result;
  };
  for (const [id, o] of objects) if (o.link !== undefined) offset(id);
  return done;
}

/** Where an object's point of turn is shown at a frame, moved by its own link by `by`. */
const pointOf = (o: AnimObject, frame: number, by: Point): Point => {
  const p = pivotOnStage(objectAt(o, frame));
  return { x: p.x + by.x, y: p.y + by.y };
};

/** How far the links move this object at a frame (nothing if it moves on its own). */
export const linkOffset = (doc: AnimationDoc, id: Id, frame: number): Point =>
  linkOffsets(doc, frame).get(id) ?? { ...ZERO };

/** True when linking `id` to `toId` would make a loop (it, or something moving with it). */
export function wouldLoop(doc: AnimationDoc, id: Id, toId: Id): boolean {
  const objects = topLevel(doc);
  let at: Id | undefined = toId;
  const seen = new Set<Id>();
  while (at !== undefined && !seen.has(at)) {
    if (at === id) return true;
    seen.add(at);
    at = objects.get(at)?.link?.to;
  }
  return false;
}

/** The objects it moves with, nearest first (its link, that one's link…). */
export function linkChain(doc: AnimationDoc, id: Id): Id[] {
  const objects = topLevel(doc);
  const chain: Id[] = [];
  let at = objects.get(id)?.link?.to;
  while (at !== undefined && at !== id && !chain.includes(at)) {
    chain.push(at);
    at = objects.get(at)?.link?.to;
  }
  return chain;
}

/** The objects that move with any of these, through any chain of links (not these themselves). */
export function movingWith(doc: AnimationDoc, ids: readonly Id[]): Id[] {
  return [...topLevel(doc).keys()].filter(
    (id) => !ids.includes(id) && linkChain(doc, id).some((other) => ids.includes(other)),
  );
}

/** The object moves with `toId` from now on, from where both are at frame 0 (null: on its own). */
export function linkObject(doc: AnimationDoc, id: Id, toId: Id | null): AnimationDoc {
  const objects = topLevel(doc);
  if (!objects.has(id)) throw new EditError('That object is no longer on the stage.');
  if (toId === null)
    return updateObject(doc, id, (o) => {
      if (!o.link) return o;
      const rest = { ...o };
      delete rest.link;
      return rest;
    });
  if (toId === id) throw new EditError('An object cannot move with itself.');
  const other = objects.get(toId);
  if (!other) throw new EditError('The object to move with is no longer on the stage.');
  if (wouldLoop(doc, id, toId))
    throw new EditError(
      `That would make a loop: ${other.name} already moves with ${objects.get(id)!.name}.`,
    );
  if (objects.get(id)!.link?.to === toId) return doc;
  const at = pointOf(other, 0, linkOffset(doc, toId, 0));
  return updateObject(doc, id, (o) => ({ ...o, link: { to: toId, x: at.x, y: at.y } }));
}

/** The object moved by `by` (its box only; its keyframes are already applied). */
export const shiftedBy = <T extends AnimObject>(o: T, by: Point): T =>
  by.x === 0 && by.y === 0 ? o : { ...o, x: o.x + by.x, y: o.y + by.y };
