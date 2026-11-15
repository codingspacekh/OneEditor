// M19 step 2, GV2: replication — Step and repeat (J/23: 12 spokes evenly round the hub; M/26:
// the chip's legs evenly spaced) and Mirror copy; copies go just above their originals.
import { describe, expect, it } from 'vitest';
import {
  mirrorCopy,
  stepAndRepeat,
  turnedAbout,
  validateStepRepeat,
  type StepRepeat,
} from '../../../../src/core/graphics/replicate.ts';
import {
  createAnimation,
  createEllipse,
  createRect,
} from '../../../../src/core/animation/factory.ts';
import { boundsOf, pivotOnStage, toStage } from '../../../../src/core/animation/geometry.ts';
import {
  addObject,
  copiesAbove,
  duplicateObjects,
  findObject,
  setLayer,
} from '../../../../src/core/animation/layers.ts';
import { EditError } from '../../../../src/core/model/errors.ts';
import type { AnimationDoc, AnimObject, Id } from '../../../../src/core/animation/types.ts';

function stageWith(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'A' });
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

const step = (change: Partial<StepRepeat>): StepRepeat => ({
  copies: 1,
  dx: 0,
  dy: 0,
  angle: 0,
  about: 'selection',
  ...change,
});

const object = (doc: AnimationDoc, id: Id) => findObject(doc, id)!.object;

describe('GV2: Step and repeat', () => {
  it('J/23: 11 copies of a spoke turned 30° about the hub make 12 spokes evenly round it', () => {
    // A spoke from the hub's centre (300, 300) straight up, 10 px wide and 100 px long.
    const spoke = { ...createRect({ x: 295, y: 200, width: 10, height: 100 }), name: 'Spoke' };
    const doc = stageWith(spoke);
    const { doc: next, ids } = stepAndRepeat(doc, [spoke.id], {
      copies: 11,
      dx: 0,
      dy: 0,
      angle: 30,
      about: { x: 300, y: 300 },
    });
    expect(ids).toHaveLength(11);
    expect(next.layers[0]!.objects).toHaveLength(12);
    ids.forEach((id, i) => {
      const copy = object(next, id);
      expect(copy.rotation).toBeCloseTo(30 * (i + 1), 9);
      // Its inner end stays on the hub's centre; its outer end goes round 100 px from it.
      const inner = toStage(copy, { x: 5, y: 100 });
      expect(inner.x).toBeCloseTo(300, 6);
      expect(inner.y).toBeCloseTo(300, 6);
      const outer = toStage(copy, { x: 5, y: 0 });
      const a = ((30 * (i + 1) - 90) * Math.PI) / 180;
      expect(outer.x).toBeCloseTo(300 + 100 * Math.cos(a), 6);
      expect(outer.y).toBeCloseTo(300 + 100 * Math.sin(a), 6);
    });
    expect(next.layers[0]!.objects.map((o) => o.name)).toEqual([
      'Spoke',
      ...Array.from({ length: 11 }, (_, i) => `Spoke ${i + 2}`),
    ]);
  });

  it('M/26: copies of a chip leg each 40 px further along, in order above the leg', () => {
    const body = createRect({ x: 0, y: 0, width: 400, height: 200 });
    const leg = { ...createRect({ x: 20, y: 200, width: 10, height: 30 }), name: 'Leg' };
    const doc = stageWith(leg, body);
    const { doc: next, ids } = stepAndRepeat(doc, [leg.id], step({ copies: 8, dx: 40 }));
    const xs = [leg.id, ...ids].map((id) => object(next, id).x);
    expect(xs).toEqual([20, 60, 100, 140, 180, 220, 260, 300, 340]);
    expect(next.layers[0]!.objects.map((o) => o.id)).toEqual([leg.id, ...ids, body.id]);
  });

  it('turns about the middle of the selection, or of the canvas', () => {
    const a = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const b = createRect({ x: 200, y: 0, width: 100, height: 100 });
    const doc = stageWith(a, b);
    const half = stepAndRepeat(doc, [a.id, b.id], step({ angle: 180 }));
    // The middle of both is (150, 50): a goes where b was, and b where a was.
    const [ca, cb] = half.ids.map((id) => pivotOnStage(object(half.doc, id)));
    expect(ca!.x).toBeCloseTo(250, 6);
    expect(cb!.x).toBeCloseTo(50, 6);
    const canvas = stepAndRepeat(doc, [a.id], step({ angle: 180, about: 'canvas' }));
    const c = pivotOnStage(object(canvas.doc, canvas.ids[0]!));
    expect(c.x).toBeCloseTo(doc.stage.width - 50, 6);
    expect(c.y).toBeCloseTo(doc.stage.height - 50, 6);
  });

  it('moves and turns each copy together, and turns its turn keyframes too', () => {
    const o = {
      ...createEllipse({ x: 0, y: 0, width: 20, height: 20 }),
      tracks: [
        {
          property: 'rotation' as const,
          keyframes: [{ frame: 0, value: 10, easing: 'linear' as const, hold: false }],
        },
      ],
    };
    const turned = turnedAbout(o, { x: 10, y: 10 }, 45);
    expect(turned.rotation).toBe(45);
    expect(turned.tracks![0]!.keyframes[0]!.value).toBe(55);
    expect(turnedAbout(o, { x: 0, y: 0 }, 0)).toBe(o);
    expect(turnedAbout({ ...o, rotation: 350 }, { x: 10, y: 10 }, 20).rotation).toBe(10);
    const doc = stageWith(o);
    const { doc: next, ids } = stepAndRepeat(doc, [o.id], step({ copies: 2, dx: 50, angle: 90 }));
    expect(object(next, ids[1]!)).toMatchObject({ x: 100, rotation: 180 });
  });

  it('refuses copies it cannot make, and copies that would all sit in one place', () => {
    expect(() => validateStepRepeat(step({ copies: 0, dx: 5 }))).toThrow(/1 to 500 copies/);
    expect(() => validateStepRepeat(step({ copies: 2.5, dx: 5 }))).toThrow(EditError);
    expect(() => validateStepRepeat(step({ copies: 501, dx: 5 }))).toThrow(EditError);
    expect(() => validateStepRepeat(step({ dx: Number.NaN }))).toThrow(/must be a number/);
    expect(() => validateStepRepeat(step({ angle: 10, about: { x: Number.NaN, y: 0 } }))).toThrow(
      /two numbers/,
    );
    expect(() => validateStepRepeat(step({ angle: 360 }))).toThrow(/sit on the one before/);
    expect(() => validateStepRepeat(step({ dy: 3 }))).not.toThrow();
  });

  it('needs a selection that is still there, on a layer that can be changed', () => {
    const o = createRect({ x: 0, y: 0, width: 10, height: 10 });
    let doc = stageWith(o);
    expect(() => stepAndRepeat(doc, [], step({ dx: 5 }))).toThrow(/Select the objects/);
    expect(() => stepAndRepeat(doc, ['gone'], step({ dx: 5 }))).toThrow(/no longer exists/);
    doc = setLayer(doc, doc.layers[0]!.id, { locked: true });
    expect(() => stepAndRepeat(doc, [o.id], step({ dx: 5 }))).toThrow(/locked/);
  });
});

describe('GV2: Mirror copy', () => {
  it('puts a copy flipped left to right beside the selection, touching its right edge', () => {
    const half = { ...createRect({ x: 100, y: 50, width: 80, height: 40 }), skewX: 20 };
    const doc = stageWith(half);
    const { doc: next, ids } = mirrorCopy(doc, [half.id], 'horizontal', 'beside');
    const copy = object(next, ids[0]!);
    expect(copy.flipX).toBe(true);
    const was = boundsOf(half);
    const now = boundsOf(copy);
    expect(now.x).toBeCloseTo(was.x + was.width, 6);
    expect(now.width).toBeCloseTo(was.width, 6);
  });

  it('mirrors a selection top to bottom as a whole, below it', () => {
    const top = createRect({ x: 0, y: 0, width: 100, height: 20 });
    const bottom = createRect({ x: 40, y: 20, width: 20, height: 30 });
    const doc = stageWith(top, bottom);
    const { doc: next, ids } = mirrorCopy(doc, [top.id, bottom.id], 'vertical', 'beside');
    // The selection reaches y 50: the copies are mirrored across it.
    expect(object(next, ids[0]!)).toMatchObject({ y: 80, flipY: true });
    expect(object(next, ids[1]!)).toMatchObject({ y: 50, flipY: true });
  });

  it('or over it, in the same place', () => {
    const o = createRect({ x: 10, y: 10, width: 30, height: 30 });
    const doc = stageWith(o);
    const { doc: next, ids } = mirrorCopy(doc, [o.id], 'horizontal', 'over');
    expect(object(next, ids[0]!)).toMatchObject({ x: 10, y: 10, flipX: true });
    const down = mirrorCopy(doc, [o.id], 'vertical', 'over');
    expect(object(down.doc, down.ids[0]!)).toMatchObject({ x: 10, y: 10, flipY: true });
  });
});

describe('GV2: copies on a layer', () => {
  it('Duplicate can move its copy by any step (repeating the last move)', () => {
    const o = createRect({ x: 10, y: 10, width: 30, height: 30 });
    const doc = stageWith(o);
    const { doc: next, ids } = duplicateObjects(doc, [o.id], { dx: 25, dy: -5 });
    expect(object(next, ids[0]!)).toMatchObject({ x: 35, y: 5 });
    const plain = duplicateObjects(doc, [o.id]);
    expect(object(plain.doc, plain.ids[0]!)).toMatchObject({ x: 20, y: 20 });
  });

  it('places copies above the object in order, each named once', () => {
    const o = { ...createRect({ x: 0, y: 0, width: 10, height: 10 }), name: 'Stud' };
    const doc = stageWith(o, createRect({ x: 0, y: 0, width: 5, height: 5 }));
    const { doc: next, ids } = copiesAbove(doc, o.id, 3, (c, n) => ({ ...c, x: n }));
    expect(next.layers[0]!.objects.slice(0, 4).map((x) => [x.name, x.x])).toEqual([
      ['Stud', 0],
      ['Stud 2', 1],
      ['Stud 3', 2],
      ['Stud 4', 3],
    ]);
    expect(new Set(ids).size).toBe(3);
  });
});
