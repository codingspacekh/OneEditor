// Pilot request 2026-11-18 (AN11): a motion path can be followed backwards (the other way round
// a circle) and more than once (Times round, a moon going round many times); and an object can
// move with another (AN11 links: the Earth goes round the Sun, the Moon round the Earth). A
// linked object keeps where it is at frame 0 and moves by however much the object it moves with
// (its point of turn) has moved since frame 0, through a chain of links.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createEllipse,
  createPath,
  createRect,
} from '../../../../src/core/animation/factory.ts';
import { moved, pivotOnStage } from '../../../../src/core/animation/geometry.ts';
import {
  addObject,
  findObject,
  removeObjects,
  updateObject,
} from '../../../../src/core/animation/layers.ts';
import { linkObject, linkOffset, wouldLoop } from '../../../../src/core/animation/links.ts';
import { motionFrom, withPaths } from '../../../../src/core/animation/motion.ts';
import {
  deserializeAnimation,
  serializeAnimation,
} from '../../../../src/core/animation/serialize.ts';
import { placementOf, stateAt } from '../../../../src/core/animation/state.ts';
import { objectAt, setPropertyAt } from '../../../../src/core/animation/tween.ts';
import type { AnimObject, AnimationDoc, MotionPath } from '../../../../src/core/animation/types.ts';

const road = () =>
  createPath(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
  );
const box = () => createRect({ x: 0, y: 0, width: 10, height: 10 });
const following = (change: Partial<MotionPath>) =>
  withPaths(box(), [motionFrom(road(), { from: 0, to: 8, ...change })]);
const centre = (o: AnimObject) => pivotOnStage(o);

describe('a path followed backwards (AN11)', () => {
  it('starts at the end of the path and arrives at its start', () => {
    const back = following({ reverse: true });
    expect(centre(objectAt(back, 0))).toEqual({ x: 100, y: 0 });
    expect(centre(objectAt(back, 2))).toEqual({ x: 75, y: 0 });
    expect(centre(objectAt(back, 8))).toEqual({ x: 0, y: 0 });
  });

  it('oriented, it faces the way it goes', () => {
    expect(objectAt(following({ orient: true }), 4).rotation).toBeCloseTo(0, 6);
    expect(objectAt(following({ orient: true, reverse: true }), 4).rotation).toBeCloseTo(180, 6);
  });

  it('round a circle the other way: a quarter of the time is a quarter of the way the other side', () => {
    const ring = createEllipse({ x: 0, y: 0, width: 200, height: 200 });
    const one = withPaths(box(), [motionFrom(ring, { from: 0, to: 8 })]);
    const other = withPaths(box(), [motionFrom(ring, { from: 0, to: 8, reverse: true })]);
    const a = centre(objectAt(one, 2));
    const b = centre(objectAt(other, 2));
    const start = centre(objectAt(one, 0));
    expect(centre(objectAt(other, 0)).x).toBeCloseTo(start.x, 6);
    expect(centre(objectAt(other, 0)).y).toBeCloseTo(start.y, 6);
    // Mirror images about the line through the start and the centre of the circle (100, 100).
    const ux = start.x - 100;
    const uy = start.y - 100;
    const len = Math.hypot(ux, uy);
    const [nx, ny] = [ux / len, uy / len];
    const dot = (a.x - 100) * nx + (a.y - 100) * ny;
    const mirrored = { x: 100 + 2 * dot * nx - (a.x - 100), y: 100 + 2 * dot * ny - (a.y - 100) };
    expect(b.x).toBeCloseTo(mirrored.x, 1);
    expect(b.y).toBeCloseTo(mirrored.y, 1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(50);
  });
});

describe('times round a path (AN11)', () => {
  it('goes round as many times between its frames, and ends at the end', () => {
    const twice = following({ laps: 2 });
    expect(centre(objectAt(twice, 2))).toEqual({ x: 50, y: 0 });
    expect(centre(objectAt(twice, 3))).toEqual({ x: 75, y: 0 });
    expect(centre(objectAt(twice, 5))).toEqual({ x: 25, y: 0 });
    expect(centre(objectAt(twice, 8))).toEqual({ x: 100, y: 0 });
    expect(centre(objectAt(following({ laps: 2, reverse: true }), 2))).toEqual({ x: 50, y: 0 });
  });

  it('refuses less than one time round, or part of one', () => {
    expect(() => following({ laps: 0 })).toThrow(/times round/i);
    expect(() => following({ laps: 1.5 })).toThrow(/times round/i);
  });
});

/** The Sun moves 100 px right over 10 frames; the Earth and the Moon are placed apart. */
function solar(): { doc: AnimationDoc; sun: string; earth: string; moon: string } {
  let doc = createAnimation({ name: 'Solar' });
  const layer = doc.layers[0]!.id;
  const sun = setPropertyAt(createEllipse({ x: 100, y: 100, width: 40, height: 40 }), 'x', 10, 200);
  const earth = createEllipse({ x: 300, y: 100, width: 20, height: 20 });
  const moon = createEllipse({ x: 340, y: 100, width: 6, height: 6 });
  for (const o of [sun, earth, moon]) doc = addObject(doc, layer, o);
  return { doc, sun: sun.id, earth: earth.id, moon: moon.id };
}
const shownAt = (doc: AnimationDoc, id: string, frame: number) =>
  findObject(stateAt(doc, frame), id)!.object;

describe('moving with another object (AN11)', () => {
  it('the Earth moves as the Sun moves from frame 0; at frame 0 it stays where it is', () => {
    const s = solar();
    const doc = linkObject(s.doc, s.earth, s.sun);
    expect(shownAt(doc, s.earth, 0)).toMatchObject({ x: 300, y: 100 });
    expect(shownAt(doc, s.earth, 5)).toMatchObject({ x: 350, y: 100 });
    expect(shownAt(doc, s.earth, 10)).toMatchObject({ x: 400, y: 100 });
    expect(linkOffset(doc, s.earth, 10)).toEqual({ x: 100, y: 0 });
    // Its own keyframes and paths are kept, the link added to them.
    expect(findObject(doc, s.earth)!.object.link?.to).toBe(s.sun);
    expect(placementOf(doc, s.earth, 10).x).toBe(400);
  });

  it('the Moon goes round the Earth on a path, and with the Earth as it goes round the Sun', () => {
    const s = solar();
    let doc = linkObject(s.doc, s.moon, s.earth);
    // The Earth follows a road 0 → 100 px right over 8 frames; the Moon moves with it.
    doc = {
      ...doc,
      layers: doc.layers.map((l) => ({
        ...l,
        objects: l.objects.map((o) =>
          o.id === s.earth
            ? withPaths(o, [
                motionFrom(
                  createPath(
                    [
                      { x: 310, y: 110 },
                      { x: 410, y: 110 },
                    ],
                    false,
                  ),
                  { from: 0, to: 8 },
                ),
              ])
            : o,
        ),
      })),
    };
    expect(shownAt(doc, s.moon, 0)).toMatchObject({ x: 340, y: 100 });
    expect(shownAt(doc, s.moon, 4)).toMatchObject({ x: 390, y: 100 });
    // A chain: the Earth with the Sun too — the Moon gets both.
    doc = linkObject(doc, s.earth, s.sun);
    expect(shownAt(doc, s.moon, 8)).toMatchObject({ x: 340 + 100 + 80, y: 100 });
  });

  it('refuses a link to itself, round in a loop, or to an object that is not there', () => {
    const s = solar();
    expect(() => linkObject(s.doc, s.sun, s.sun)).toThrow(/itself/i);
    let doc = linkObject(s.doc, s.moon, s.earth);
    doc = linkObject(doc, s.earth, s.sun);
    expect(wouldLoop(doc, s.sun, s.moon)).toBe(true);
    expect(() => linkObject(doc, s.sun, s.moon)).toThrow(/loop/i);
    expect(() => linkObject(doc, s.sun, 'nope')).toThrow(/no longer/i);
    // Unlinked, it goes back to its own place.
    const free = linkObject(doc, s.earth, null);
    expect(findObject(free, s.earth)!.object.link).toBeUndefined();
    expect(shownAt(free, s.earth, 10)).toMatchObject({ x: 300 });
  });

  it('the Sun put somewhere else takes the Earth with it, at every frame', () => {
    const s = solar();
    let doc = linkObject(s.doc, s.earth, s.sun);
    doc = updateObject(doc, s.sun, (o) => moved(o, 0, 50));
    expect(shownAt(doc, s.earth, 0)).toMatchObject({ x: 300, y: 150 });
    expect(shownAt(doc, s.earth, 10)).toMatchObject({ x: 400, y: 150 });
  });

  it('deleting the object it moves with ends the link', () => {
    const s = solar();
    const doc = removeObjects(linkObject(s.doc, s.earth, s.sun), [s.sun]);
    expect(findObject(doc, s.earth)!.object.link).toBeUndefined();
  });

  it('a file keeps the link, the direction and the times round', () => {
    const s = solar();
    let doc = linkObject(s.doc, s.earth, s.sun);
    doc = {
      ...doc,
      layers: doc.layers.map((l) => ({
        ...l,
        objects: l.objects.map((o) =>
          o.id === s.moon
            ? withPaths(o, [motionFrom(road(), { from: 0, to: 8, reverse: true, laps: 3 })])
            : o,
        ),
      })),
    };
    expect(deserializeAnimation(serializeAnimation(doc))).toEqual(doc);
  });
});
