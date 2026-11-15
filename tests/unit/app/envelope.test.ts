// GV4, G3 (M19): envelopes and perspective in Graphics and Animation modes — bend the selected
// shapes, change the bend, take it off, and Apply it as plain paths; each one undo step, a
// refused one saying why. Gate tasks: M/17 the flared rectangle, coursebook exam-style 2 (a
// rectangle distorted for a roller coaster).
import { describe, expect, it } from 'vitest';
import { boundsOf } from '../../../src/core/animation/geometry.ts';
import type { Envelope, PathObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

function setup(mode: 'graphics' | 'animation' = 'graphics') {
  const t = testApp();
  const g = t.app[mode];
  const doc = () => g.store.get().history.present;
  const objects = () => doc().layers.flatMap((l) => l.objects);
  return { ...t, g, doc, objects };
}

const flare: Envelope = {
  kind: 'perspective',
  corners: [
    { x: 0.3, y: 0 },
    { x: 0.7, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
};

describe('GV4 envelopes on the selected shapes', () => {
  it('M/17 flares a rectangle by perspective, live, and Apply makes it a plain path', () => {
    const s = setup();
    s.g.addShape('rect', { x: 100, y: 100, width: 200, height: 100 });
    const id = s.objects()[0]!.id;
    expect(s.g.setEnvelope(flare)).toBeNull();
    expect(s.objects()[0]).toMatchObject({ kind: 'rect', envelope: flare });
    // Still a rectangle: its size can still be typed.
    expect(s.g.setProperties({ width: 300 })).toBeNull();
    expect(s.objects()[0]).toMatchObject({ kind: 'rect', width: 300, envelope: flare });
    expect(s.g.applyEnvelope()).toBeNull();
    const path = s.objects()[0] as PathObject;
    expect(path).toMatchObject({ kind: 'path', id, closed: true });
    expect(path.envelope).toBeUndefined();
    expect(path.points).toHaveLength(4);
    expect(path.points[0]).toEqual({ x: 90, y: 0 });
    expect(boundsOf(path)).toMatchObject({ x: 100, y: 100, width: 300, height: 100 });
    s.g.undo();
    expect(s.objects()[0]).toMatchObject({ kind: 'rect', envelope: flare });
  });

  it('exam-style 2 bends a rectangle with a preset, then changes its bend, in one undo step each', () => {
    const s = setup('animation');
    s.g.addShape('rect', { x: 0, y: 0, width: 200, height: 50 });
    expect(s.g.setEnvelope({ kind: 'preset', preset: 'wave', bend: 50 })).toBeNull();
    expect(s.g.setEnvelope({ kind: 'preset', preset: 'wave', bend: -80 })).toBeNull();
    expect(s.objects()[0]!.envelope).toEqual({ kind: 'preset', preset: 'wave', bend: -80 });
    s.g.undo();
    expect(s.objects()[0]!.envelope).toEqual({ kind: 'preset', preset: 'wave', bend: 50 });
    expect(s.g.setEnvelope(null)).toBeNull();
    expect(s.objects()[0]!.envelope).toBeUndefined();
  });

  it('says why: nothing selected, a bend out of range, text, nothing to apply', () => {
    const s = setup();
    expect(s.g.setEnvelope(flare)).toBe('Select a shape or a group of shapes first.');
    s.g.addShape('ellipse', { x: 0, y: 0, width: 50, height: 50 });
    expect(s.g.setEnvelope({ kind: 'preset', preset: 'arch', bend: 150 })).toMatch(
      /between −100 % and 100 %/,
    );
    expect(s.g.applyEnvelope()).toMatch(/not bent: choose an envelope first/);
    s.g.addText({ x: 0, y: 100 }, 'Roller coaster');
    s.g.select([s.objects().at(-1)!.id]);
    expect(s.g.setEnvelope(flare)).toMatch(/^Text cannot be bent/);
  });

  it('G3 a corner dragged on the stage is one undo step; a drag too far is said in the message line', () => {
    const s = setup();
    s.g.addShape('rect', { x: 0, y: 0, width: 100, height: 100 });
    const id = s.objects()[0]!.id;
    s.g.dragEnvelope(id, flare);
    expect(s.objects()[0]!.envelope).toEqual(flare);
    const far: Envelope = {
      ...flare,
      corners: [{ x: 20, y: 0 }, ...flare.corners.slice(1)],
    } as Envelope;
    s.g.dragEnvelope(id, far);
    expect(s.objects()[0]!.envelope).toEqual(flare);
    expect(s.g.store.get().message).toEqual({
      kind: 'error',
      text: expect.stringMatching(/within 10 times/),
    });
  });
});
