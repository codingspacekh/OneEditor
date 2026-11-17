// GT2, GT3 (M20): Put on path, Put in shape and taking the text off, in Graphics and Animation
// modes — each one undo step, the text left selected, a refusal said. Gate tasks: M/17 Woodlands
// (a hidden path), M/22 Heron (the ellipse's outline), coursebook exam-style 2 (an arc).
import { describe, expect, it } from 'vitest';
import type { TextObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

function setup(mode: 'graphics' | 'animation' = 'graphics') {
  const t = testApp();
  const g = t.app[mode];
  const objects = () => g.store.get().history.present.layers.flatMap((l) => l.objects);
  const text = () => objects().find((o) => o.kind === 'text') as TextObject;
  return { ...t, g, objects, text };
}

describe('GT2 Put on path in the app', () => {
  it('exam-style 2: text on an arc, the arc used up, in one undo step; Take off path', () => {
    const s = setup();
    s.g.addShape('ellipse', { x: 100, y: 100, width: 200, height: 200 });
    expect(s.g.setProperties({ arc: { start: 180, end: 0, close: 'open' } } as never)).toBeNull();
    s.g.addText({ x: 10, y: 10 }, 'ROLLER COASTER');
    s.g.select(s.objects().map((o) => o.id));
    expect(s.g.putOnPath()).toBeNull();
    expect(s.objects()).toHaveLength(1);
    expect(s.text().path).toMatchObject({ closed: false, side: 'outside' });
    expect(s.text().path!.stroke).toBeUndefined();
    expect(s.g.store.get().selection).toEqual([s.text().id]);
    expect(s.text()).toMatchObject({ x: 100, y: 100, width: 200, height: 100 });
    s.g.undo();
    expect(s.objects()).toHaveLength(2);
    expect(s.text().path).toBeUndefined();
    s.g.redo();
    expect(s.g.takeOffOutline(() => ({ width: 80, height: 20 }))).toBeNull();
    expect(s.text()).toMatchObject({ x: 160, y: 140, width: 80, height: 20 });
    expect(s.text().path).toBeUndefined();
  });

  it('M/22 Heron: shown with the ellipse’s outline, then centred through it', () => {
    const s = setup('animation');
    s.g.addShape('ellipse', { x: 0, y: 0, width: 300, height: 150 });
    s.g.addText({ x: 10, y: 10 }, 'HERON');
    s.g.select(s.objects().map((o) => o.id));
    expect(s.g.putOnPath(true)).toBeNull();
    expect(s.text().path!.stroke).toBeDefined();
    const path = s.text().path!;
    expect(s.g.setProperties({ path: { ...path, side: 'centred' } } as never)).toBeNull();
    expect(s.text().path!.side).toBe('centred');
  });

  it('says why when the selection is not one text and one shape', () => {
    const s = setup();
    s.g.addText({ x: 10, y: 10 }, 'Alone');
    expect(s.g.putOnPath()).toMatch(/Select one text and one shape/);
    expect(s.g.putInShape()).toMatch(/Select one text and one shape/);
    expect(s.g.takeOffOutline()).toBe('Select a text that is on a path or in a shape.');
  });
});

describe('GT3 Put in shape in the app', () => {
  it('wraps the text in the shape, which stays; Take out of shape, roughly measured', () => {
    const s = setup();
    s.g.addText({ x: 10, y: 10 }, 'Some words to wrap');
    s.g.addShape('rect', { x: 50, y: 50, width: 120, height: 80 });
    s.g.select(s.objects().map((o) => o.id));
    expect(s.g.putInShape(4)).toBeNull();
    expect(s.objects().map((o) => o.kind)).toEqual(['rect', 'text']);
    expect(s.text().inShape!.padding).toBe(4);
    expect(s.g.store.get().selection).toEqual([s.text().id]);
    expect(s.g.takeOffOutline()).toBeNull();
    expect(s.text().inShape).toBeUndefined();
    expect(s.text().height).toBeCloseTo(s.text().size * 1.2);
  });
});
