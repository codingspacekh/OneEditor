// 2026-11-18 (AN9, AN11): Copy Motion / Paste Motion, as in Animate: an object's animation — its
// keyframes and its paths — put on other objects, from where each of them is at frame 0. Position
// keyframes are moved by the difference between the two objects' places, width and height
// keyframes scaled by the difference in size, and paths moved so the other object's point of
// turn (AN27) starts where the first one's did on them; the turn, opacity, colours and outline
// are copied as they are. Words, shapes and pictures are the object's own and are not copied;
// nor is a property the other object cannot have (a corner radius onto an ellipse).
import { EditError } from '../model/errors.ts';
import { pivotOnStage, shiftedMotion, type Point } from './geometry.ts';
import { withPaths } from './motion.ts';
import { keyableProperties, objectAt, setTrack } from './tween.ts';
import type { AnimObject, MotionPath, Track, TweenProperty } from './types.ts';

/** What Copy Motion keeps: the tracks and paths, and where and how big the object was. */
export interface Motion {
  /** The name of the object it was copied from, for messages. */
  name: string;
  tracks: Track[];
  paths: MotionPath[];
  box: { x: number; y: number; width: number; height: number };
  pivot: Point;
}

/** Properties that belong to the object itself, never pasted onto another. */
const OWN: ReadonlySet<TweenProperty> = new Set(['text', 'shape', 'picture']);

export function copyMotion(object: AnimObject): Motion {
  const tracks = (object.tracks ?? []).filter(
    (t) => t.keyframes.length > 0 && !OWN.has(t.property),
  );
  const paths = object.paths ?? [];
  if (tracks.length === 0 && paths.length === 0)
    throw new EditError(`${object.name} has no motion to copy: give it keyframes or a path first.`);
  const start = objectAt(object, 0);
  return {
    name: object.name,
    tracks,
    paths,
    box: { x: start.x, y: start.y, width: start.width, height: start.height },
    pivot: pivotOnStage(start),
  };
}

export function pasteMotion<T extends AnimObject>(object: T, motion: Motion): T {
  const start = objectAt(object, 0);
  const dx = start.x - motion.box.x;
  const dy = start.y - motion.box.y;
  const sx = motion.box.width > 0 ? start.width / motion.box.width : 1;
  const sy = motion.box.height > 0 ? start.height / motion.box.height : 1;
  const map: Partial<Record<TweenProperty, (v: number) => number>> = {
    x: (v) => v + dx,
    y: (v) => v + dy,
    width: (v) => v * sx,
    height: (v) => v * sy,
  };
  const allowed = new Set<TweenProperty>([...keyableProperties(object), 'skewX', 'skewY']);
  let out: T = object;
  for (const track of motion.tracks) {
    if (!allowed.has(track.property)) continue;
    const f = map[track.property];
    const keyframes = track.keyframes.map((k) =>
      f && typeof k.value === 'number'
        ? { ...k, value: Math.round(f(k.value) * 100) / 100 }
        : { ...k },
    );
    out = setTrack(out, { ...track, keyframes });
  }
  if (motion.paths.length) {
    const here = pivotOnStage(start);
    const px = here.x - motion.pivot.x;
    const py = here.y - motion.pivot.y;
    out = withPaths(
      out,
      motion.paths.map((p) => shiftedMotion(p, px, py)),
    );
  }
  return out;
}
