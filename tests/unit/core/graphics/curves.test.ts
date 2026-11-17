// M19 step 2, GV2: Convert to curves — every shape becomes a pen path that looks the same (the
// same box, colours, outline, turn, flips, skew, effects; a bent shape is converted bent, see bent-curves.test.ts); text waits for the Text
// tools (GT4, M20); pictures and buttons are refused.
import { describe, expect, it } from 'vitest';
import { convertToCurves, toCurves, whyNotCurves } from '../../../../src/core/graphics/curves.ts';
import { KAPPA } from '../../../../src/core/graphics/bezier.ts';
import {
  createAnimation,
  createButton,
  createEllipse,
  createGroup,
  createPicture,
  createPolygon,
  createRect,
  createStar,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { boundsOf, localOutline, outlineOf } from '../../../../src/core/animation/geometry.ts';
import { addObject, findObject, setLayer } from '../../../../src/core/animation/layers.ts';
import { validateObject } from '../../../../src/core/animation/rules.ts';
import { EditError } from '../../../../src/core/model/errors.ts';
import type { AnimationDoc, AnimObject, PathObject } from '../../../../src/core/animation/types.ts';

const box = { x: 40, y: 50, width: 200, height: 100 };
const look = {
  fill: { kind: 'linear' as const, from: '#ff0000', to: '#0000ff', angle: 90 },
  stroke: { colour: '#000000', width: 3, dash: 'dashed' as const },
  opacity: 80,
  rotation: 30,
  flipX: true,
  skewY: 10,
  pivot: { x: 0, y: 1 },
  fillOpacity: 60,
  filters: [{ kind: 'glow' as const, colour: '#ffff00', blur: 8, opacity: 70 }],
};

function stageWith(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'A' });
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

describe('GV2: Convert to curves', () => {
  it('makes a rounded rectangle a path with exact quarter-circle corners, looking the same', () => {
    const rect = { ...createRect(box), radius: 20, ...look };
    const path = toCurves(rect) as PathObject;
    expect(path.kind).toBe('path');
    expect(path).toMatchObject({ id: rect.id, name: rect.name, closed: true, ...box, ...look });
    expect('radius' in path).toBe(false);
    expect(path.points).toHaveLength(8);
    expect(path.points[1]!.out!.x).toBeCloseTo(180 + KAPPA * 20, 9);
    expect(() => validateObject(path)).not.toThrow();
    // On the stage it is where the rectangle was.
    const was = boundsOf(rect);
    const now = boundsOf(path);
    expect(now.x).toBeCloseTo(was.x, 0);
    expect(now.width).toBeCloseTo(was.width, 0);
  });

  it('makes a square-cornered rectangle, a star and a polygon their corners', () => {
    expect((toCurves(createRect(box)) as PathObject).points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]);
    const star = createStar(box);
    const starPath = toCurves(star) as PathObject;
    expect(starPath.points).toEqual(localOutline(star));
    expect('inner' in starPath).toBe(false);
    expect(starPath.points).toHaveLength(10);
    const polygon = toCurves(createPolygon(box)) as PathObject;
    expect(polygon.points).toHaveLength(6);
    expect('sides' in polygon).toBe(false);
  });

  it('makes an ellipse four exact curves, and an arc its part (an open arc stays open)', () => {
    const circle = toCurves(createEllipse(box)) as PathObject;
    expect(circle.points).toHaveLength(4);
    expect(circle.points.every((p) => p.in && p.out)).toBe(true);
    const pie = toCurves({
      ...createEllipse(box),
      arc: { start: 0, end: 270, close: 'pie' },
    }) as PathObject;
    expect(pie.closed).toBe(true);
    expect(pie.points).toHaveLength(5);
    expect(pie.points.at(-1)).toEqual({ x: 100, y: 50 });
    expect('arc' in pie).toBe(false);
    const open = toCurves({
      ...createEllipse(box),
      arc: { start: 180, end: 360, close: 'open' },
    }) as PathObject;
    expect(open.closed).toBe(false);
  });

  it('keeps the keyframes, but not a corner radius’s', () => {
    const rect = {
      ...createRect(box),
      tracks: [
        {
          property: 'radius' as const,
          keyframes: [{ frame: 0, value: 4, easing: 'linear' as const, hold: false }],
        },
        {
          property: 'x' as const,
          keyframes: [{ frame: 0, value: 40, easing: 'linear' as const, hold: false }],
        },
      ],
    };
    expect((toCurves(rect) as PathObject).tracks!.map((t) => t.property)).toEqual(['x']);
    const onlyRadius = { ...rect, tracks: rect.tracks.slice(0, 1) };
    expect('tracks' in toCurves(onlyRadius)).toBe(false);
  });

  it('gives a path back as it is', () => {
    const doc = stageWith(createRect(box));
    const path = toCurves(doc.layers[0]!.objects[0]!);
    expect(toCurves(path)).toBe(path);
  });

  it('converts a group’s shapes inside it and leaves its button as it is', () => {
    const group = createGroup([createEllipse(box), createButton('pause', box)]);
    const converted = toCurves(group);
    expect(converted.kind).toBe('group');
    const kinds = converted.kind === 'group' ? converted.children.map((c) => c.kind) : [];
    expect(kinds).toEqual(['path', 'button']);
  });

  it('says why pictures, buttons and a group of them cannot be converted; text can (GT4)', () => {
    const text = createText('Logo', { x: 0, y: 0 });
    expect(whyNotCurves(text)).toBeNull();
    // Until its font's outlines are loaded (text-curves-gt4.test.ts).
    expect(() => toCurves(text)).toThrow(EditError);
    const picture = createPicture({ id: 'p', path: 'a.png', width: 10, height: 10 }, box);
    expect(whyNotCurves(picture)).toMatch(/Trace bitmap/);
    const button = createButton('pause', box);
    expect(whyNotCurves(button)).toMatch(/button stays a button/);
    expect(whyNotCurves(createGroup([button]))).toMatch(/Nothing in this group/);
    expect(whyNotCurves(createRect(box))).toBeNull();
  });
});

describe('GV2: Convert to curves on the stage', () => {
  it('converts each selected shape where it was, and leaves the ones it cannot', () => {
    const rect = createRect(box);
    const button = createButton('pause', box);
    const doc = stageWith(button, rect);
    const next = convertToCurves(doc, [button.id, rect.id]);
    expect(next.layers[0]!.objects.map((o) => o.kind)).toEqual(['button', 'path']);
    expect(findObject(next, rect.id)!.index).toBe(1);
    expect(outlineOf(findObject(next, rect.id)!.object)[0]).toHaveLength(4);
  });

  it('says why when none can be converted, or none is selected, or it has gone', () => {
    const button = createButton('pause', box);
    const doc = stageWith(button);
    expect(() => convertToCurves(doc, [button.id])).toThrow(/button stays a button/);
    expect(() => convertToCurves(doc, [])).toThrow(/Select the shapes/);
    expect(() => convertToCurves(doc, ['gone'])).toThrow(/no longer exists/);
  });

  it('is refused on a locked layer', () => {
    const rect = createRect(box);
    let doc = stageWith(rect);
    doc = setLayer(doc, doc.layers[0]!.id, { locked: true });
    expect(() => convertToCurves(doc, [rect.id])).toThrow(/locked/);
  });
});
