// GT2, GT3 (M20): Put on path, Put in shape and taking the text off again — one text and one
// shape chosen together; the shape's outline (turned, flipped or skewed as it is drawn) becomes
// the text's, in a box round it; on a path the shape is used up and its outline hidden or shown,
// in a shape the shape stays behind the words. Curved text, a path and a shape are one at a time.
// Gate: M/17 Woodlands (a hidden path), M/22 Heron (the red ellipse's outline).
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createEllipse,
  createLine,
  createPath,
  createPicture,
  createRect,
  createStar,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { boundsOf, toStage } from '../../../../src/core/animation/geometry.ts';
import { addObject, findObject } from '../../../../src/core/animation/layers.ts';
import { validateObject } from '../../../../src/core/animation/rules.ts';
import { EditError } from '../../../../src/core/model/errors.ts';
import {
  DEFAULT_PADDING,
  putInShape,
  putOnPath,
  takeOffOutline,
} from '../../../../src/core/graphics/text-attach.ts';
import type { AnimationDoc, AnimObject, TextObject } from '../../../../src/core/animation/types.ts';

function stageWith(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'A' });
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

const objectsOf = (doc: AnimationDoc) => doc.layers[0]!.objects;
const textOf = (doc: AnimationDoc, id: string) => findObject(doc, id)!.object as TextObject;

describe('GT2: Put on path', () => {
  it('M/22 Heron: the text takes the ellipse’s outline and box; the ellipse is used up', () => {
    const ellipse = {
      ...createEllipse({ x: 100, y: 50, width: 300, height: 200 }),
      stroke: { colour: '#ff0000', width: 4, dash: 'solid' as const },
    };
    const text = { ...createText('HERON', { x: 0, y: 0 }), curve: 40, rotation: 15 };
    const doc = stageWith(ellipse, text);
    const out = putOnPath(doc, [text.id, ellipse.id]);
    expect(objectsOf(out.doc).map((o) => o.id)).toEqual([text.id]);
    const t = textOf(out.doc, out.id);
    expect(t).toMatchObject({ x: 100, y: 50, width: 300, height: 200, rotation: 0 });
    expect(t.curve).toBeUndefined();
    expect(t.path).toMatchObject({ closed: true, side: 'outside' });
    // Hidden: "do not show the path"; centred over its top.
    expect(t.path!.stroke).toBeUndefined();
    expect(t.path!.start).toBeCloseTo(75, 0);
    // The ellipse's right-hand point, in the text's box.
    expect(t.path!.points[0]).toMatchObject({ x: 300, y: 100 });
    validateObject(t);
  });

  it('shows the path with the shape’s outline, or a plain one', () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 100, height: 50 }),
      stroke: { colour: '#00ff00', width: 3, dash: 'dashed' as const },
    };
    const text = createText('A', { x: 0, y: 0 });
    const shown = putOnPath(stageWith(rect, text), [rect.id, text.id], { show: true });
    expect(textOf(shown.doc, text.id).path!.stroke).toEqual(rect.stroke);
    const bare = { ...rect, stroke: undefined };
    const plain = putOnPath(stageWith(bare, text), [rect.id, text.id], { show: true });
    expect(textOf(plain.doc, text.id).path!.stroke).toMatchObject({ width: 2 });
  });

  it('M/17 Woodlands: an open pen path, its start by the words’ alignment; a line 1 px high', () => {
    const pen = createPath(
      [
        { x: 10, y: 100 },
        { x: 110, y: 40 },
        { x: 210, y: 100 },
      ],
      false,
    );
    const text = { ...createText('Woodlands', { x: 0, y: 0 }), align: 'centre' as const };
    const t = textOf(putOnPath(stageWith(pen, text), [pen.id, text.id]).doc, text.id);
    expect(t.path).toMatchObject({ closed: false, start: 50 });
    expect(t).toMatchObject({ x: 10, y: 40, width: 200, height: 60 });
    const line = createLine({ x: 0, y: 30 }, { x: 100, y: 30 });
    const flat = textOf(putOnPath(stageWith(line, text), [line.id, text.id]).doc, text.id);
    expect(flat).toMatchObject({ y: 29.5, height: 1 });
    expect(flat.path!.points[0]).toEqual({ x: 0, y: 0.5 });
  });

  it('bakes a turned, flipped shape’s look into the outline', () => {
    const star = { ...createStar({ x: 50, y: 50, width: 100, height: 100 }), rotation: 90 };
    const text = createText('A', { x: 0, y: 0 });
    const t = textOf(putOnPath(stageWith(star, text), [star.id, text.id]).doc, text.id);
    // The star's top point turned a quarter round: now at the right of its box.
    const tip = toStage(star, { x: 50, y: 0 });
    expect(t.x + t.path!.points[0]!.x).toBeCloseTo(tip.x, 1);
    expect(t.y + t.path!.points[0]!.y).toBeCloseTo(tip.y, 1);
    const b = boundsOf(star);
    expect(t.x).toBeCloseTo(b.x, 0);
  });

  it('refuses anything but one text and one shape', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const text = createText('A', { x: 0, y: 0 });
    const picture = createPicture(
      { id: 'p', name: 'p.png', width: 10, height: 10, path: 'p.png' } as never,
      { x: 0, y: 0 },
    );
    const doc = stageWith(rect, text, picture);
    expect(() => putOnPath(doc, [text.id])).toThrow(EditError);
    expect(() => putOnPath(doc, [text.id, picture.id])).toThrow(/one text and one shape/);
    expect(() => putOnPath(doc, [rect.id, picture.id])).toThrow(EditError);
  });
});

describe('GT3: Put in shape', () => {
  it('keeps the shape, puts the text just in front of it, padding px in', () => {
    const text = createText('Words in a box', { x: 0, y: 0 });
    const rect = createRect({ x: 20, y: 30, width: 200, height: 100 });
    const out = putInShape(stageWith(text, rect), [text.id, rect.id]);
    expect(objectsOf(out.doc).map((o) => o.id)).toEqual([rect.id, text.id]);
    const t = textOf(out.doc, text.id);
    expect(t).toMatchObject({ x: 20, y: 30, width: 200, height: 100 });
    expect(t.inShape).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 0, y: 100 },
      ],
      padding: DEFAULT_PADDING,
    });
    expect(t.name).toBe(text.name);
  });

  it('a text already in front stays where it is; a path is taken off', () => {
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const text = {
      ...createText('A', { x: 0, y: 0 }),
      path: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        closed: false,
        start: 0,
        side: 'outside' as const,
      },
    };
    const out = putInShape(stageWith(rect, text), [rect.id, text.id], { padding: 2 }).doc;
    expect(objectsOf(out).map((o) => o.id)).toEqual([rect.id, text.id]);
    const t = textOf(out, text.id);
    expect(t.path).toBeUndefined();
    expect(t.inShape!.padding).toBe(2);
  });

  it('keeps a combined shape’s holes, and refuses an open path or an open arc', () => {
    const ring = {
      ...createPath(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        true,
      ),
      holes: [
        [
          { x: 40, y: 40 },
          { x: 60, y: 40 },
          { x: 60, y: 60 },
        ],
      ],
    };
    const text = createText('A', { x: 0, y: 0 });
    const t = textOf(putInShape(stageWith(ring, text), [ring.id, text.id]).doc, text.id);
    expect(t.inShape!.holes).toHaveLength(1);
    const line = createLine({ x: 0, y: 0 }, { x: 50, y: 50 });
    expect(() => putInShape(stageWith(line, text), [line.id, text.id])).toThrow(/closed shape/);
    const arc = {
      ...createEllipse({ x: 0, y: 0, width: 50, height: 50 }),
      arc: { start: 180, end: 0, close: 'open' as const },
    };
    expect(() => putInShape(stageWith(arc, text), [arc.id, text.id])).toThrow(/closed shape/);
  });
});

describe('GT2, GT3: the path’s start and the shape’s padding are checked', () => {
  it('refuses a start that is not a number and a padding below 0', () => {
    const t = createText('A', { x: 0, y: 0 });
    const path = {
      points: [
        { x: 0, y: 0 },
        { x: 9, y: 0 },
      ],
      closed: false,
      start: 0,
      side: 'outside' as const,
    };
    expect(() => validateObject({ ...t, path })).not.toThrow();
    expect(() => validateObject({ ...t, path: { ...path, start: NaN } })).toThrow(
      'The start on the path must be a number (0 to 100 %).',
    );
    const inShape = { points: path.points, padding: -1 };
    expect(() => validateObject({ ...t, inShape })).toThrow('The padding must be 0 px or more.');
  });
});

describe('GT2, GT3: taking the text off', () => {
  it('back to straight text in a box the size of its words, centred where the path was', () => {
    const ellipse = createEllipse({ x: 100, y: 100, width: 200, height: 100 });
    const text = createText('ABC', { x: 0, y: 0 });
    const on = putOnPath(stageWith(ellipse, text), [ellipse.id, text.id]).doc;
    const off = textOf(takeOffOutline(on, text.id, { width: 60, height: 20 }), text.id);
    expect(off).toMatchObject({ x: 170, y: 140, width: 60, height: 20 });
    expect(off.path).toBeUndefined();
    const rect = createRect({ x: 0, y: 0, width: 50, height: 50 });
    const inside = putInShape(stageWith(rect, text), [rect.id, text.id]).doc;
    const out = textOf(takeOffOutline(inside, text.id, { width: 30, height: 10 }), text.id);
    expect(out).toMatchObject({ x: 10, y: 20, width: 30, height: 10 });
    expect(out.inShape).toBeUndefined();
  });

  it('refuses a text not on a path or in a shape', () => {
    const text = createText('A', { x: 0, y: 0 });
    expect(() => takeOffOutline(stageWith(text), text.id, { width: 1, height: 1 })).toThrow(
      /on a path or in a shape/,
    );
  });
});
