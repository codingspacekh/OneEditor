// Pilot request 2026-11-18 (AN11): Moves with (the Moon with the Earth) and a path's direction
// and times round, as one undo step each; a linked object edited at a later frame stays where it
// is typed or dragged (the link is not added again on top).
import { describe, expect, it } from 'vitest';
import { findObject } from '../../../src/core/animation/layers.ts';
import { stateAt } from '../../../src/core/animation/state.ts';
import type { AnimObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

function setup() {
  const t = testApp();
  const anim = t.app.animation;
  const doc = () => anim.store.get().history.present;
  const add = (x: number): AnimObject => {
    anim.addShape('ellipse', { x, y: 100, width: 20, height: 20 });
    return doc()
      .layers.flatMap((l) => l.objects)
      .at(-1)!;
  };
  const shown = (id: string, frame: number) => findObject(stateAt(doc(), frame), id)!.object;
  return { anim, doc, add, shown, state: () => anim.store.get() };
}

describe('Moves with (AN11)', () => {
  it('links an object to another and back, one undo step each; a loop is refused', () => {
    const s = setup();
    const sun = s.add(100);
    const earth = s.add(300);
    expect(s.anim.linkObject(earth.id, sun.id)).toBeNull();
    expect(findObject(s.doc(), earth.id)!.object.link?.to).toBe(sun.id);
    expect(s.state().history.past.at(-1)!.label).toBe('Moves with');
    expect(s.anim.linkObject(sun.id, earth.id)).toMatch(/loop/i);
    expect(s.anim.linkObject(earth.id, null)).toBeNull();
    expect(findObject(s.doc(), earth.id)!.object.link).toBeUndefined();
  });

  it('the linked object moves with the other; typed or moved at a later frame, it stays put', () => {
    const s = setup();
    const sun = s.add(100);
    const earth = s.add(300);
    s.anim.linkObject(earth.id, sun.id);
    s.anim.select([sun.id]);
    s.anim.setFrame(10);
    s.anim.setProperties({ x: 200 });
    expect(s.shown(earth.id, 10).x).toBe(400);
    // X typed at frame 10 is where the Earth is shown at frame 10.
    s.anim.select([earth.id]);
    expect(s.anim.setProperties({ x: 450 })).toBeNull();
    expect(s.shown(earth.id, 10).x).toBe(450);
    expect(s.shown(earth.id, 0).x).toBe(300);
    // A drag moves it by as much as the pointer moved.
    s.anim.moveSelection(10, 0);
    expect(s.shown(earth.id, 10).x).toBe(460);
  });

  it('moving the Sun and the Earth together moves the Earth once, not twice', () => {
    const s = setup();
    const sun = s.add(100);
    const earth = s.add(300);
    s.anim.linkObject(earth.id, sun.id);
    s.anim.select([sun.id, earth.id]);
    s.anim.moveSelection(0, 40);
    expect(s.shown(sun.id, 0).y).toBe(140);
    expect(s.shown(earth.id, 0).y).toBe(140);
    expect(s.state().history.past.at(-1)!.label).toBe('Move');
  });

  it('a path’s direction and times round are path settings', () => {
    const s = setup();
    const ball = s.add(0);
    s.anim.addShape('rect', { x: 0, y: 300, width: 200, height: 100 });
    const ring = s.doc().layers[0]!.objects.at(-1)!;
    expect(s.anim.followPath(ball.id, ring.id)).toBeNull();
    expect(s.anim.setMotion(ball.id, 0, { reverse: true, laps: 3 })).toBeNull();
    expect(findObject(s.doc(), ball.id)!.object.paths![0]).toMatchObject({
      reverse: true,
      laps: 3,
    });
    expect(s.anim.setMotion(ball.id, 0, { laps: 0 })).toMatch(/times round/i);
  });
});
