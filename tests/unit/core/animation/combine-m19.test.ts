// M19 step 2, G4: Exclude, Combine (one path of all the outlines, holes even-odd) and Join (two
// open lines meet at their nearest ends) beside Union, Cut out and Intersect; arcs combine too
// (J/24: the cake with a slice cut out; O/N/25: the apple's bites).
import { describe, expect, it } from 'vitest';
import {
  combineObjects,
  combineShapes,
  COMBINE_LABELS,
} from '../../../../src/core/animation/combine.ts';
import {
  createAnimation,
  createEllipse,
  createLine,
  createPath,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { hitTest } from '../../../../src/core/animation/geometry.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import { createArc, createSpiral } from '../../../../src/core/graphics/shapes.ts';
import { drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import type { AnimationDoc, AnimObject, PathObject } from '../../../../src/core/animation/types.ts';

const red = { kind: 'solid' as const, colour: '#ff0000' };
const square = (x: number, y: number, size = 100) =>
  ({ ...createRect({ x, y, width: size, height: size }), fill: red }) as AnimObject;

function stageWith(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'A' });
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

describe('G4: Exclude', () => {
  it('keeps where only one of the shapes is, not where they overlap', () => {
    const shapes = combineShapes([square(0, 0), square(50, 50)], 'exclude');
    const hit = (x: number, y: number) => shapes.some((o) => hitTest(o, { x, y }));
    expect(hit(25, 25)).toBe(true);
    expect(hit(125, 125)).toBe(true);
    expect(hit(75, 75)).toBe(false);
    expect(COMBINE_LABELS.exclude).toBe('Exclude');
  });

  it('says so when nothing would be left', () => {
    expect(() => combineShapes([square(0, 0), square(0, 0)], 'exclude')).toThrow(
      /cover each other exactly/,
    );
  });
});

describe('G4: Combine', () => {
  it('makes one path of all the outlines, curves kept, where two overlap a hole', () => {
    const outer = { ...createEllipse({ x: 0, y: 0, width: 200, height: 200 }), fill: red };
    const inner = createEllipse({ x: 50, y: 50, width: 100, height: 100 });
    const [ring] = combineShapes([outer, inner], 'combine');
    expect(ring).toMatchObject({ kind: 'path', closed: true, x: 0, y: 0, fill: red });
    expect(ring!.width).toBeCloseTo(200, 6);
    expect(ring!.points).toHaveLength(4);
    expect(ring!.points.every((p) => p.in && p.out)).toBe(true);
    expect(ring!.holes).toHaveLength(1);
    expect(hitTest(ring!, { x: 100, y: 100 })).toBe(false);
    expect(hitTest(ring!, { x: 100, y: 20 })).toBe(true);
  });

  it('fills a piece apart from the first, its box round them all', () => {
    const [both] = combineShapes(
      [{ ...square(0, 0), stroke: undefined }, square(300, 0)],
      'combine',
    );
    expect(both!.stroke).toBeUndefined();
    expect(both).toMatchObject({ x: 0, y: 0, width: 400, height: 100 });
    expect(hitTest(both!, { x: 350, y: 50 })).toBe(true);
    expect(hitTest(both!, { x: 200, y: 50 })).toBe(false);
  });

  it('keeps a shape’s own holes and a turned shape where it was', () => {
    const [ring] = combineShapes([square(0, 0, 300), square(100, 100)], 'combine');
    const turned = { ...square(400, 0), rotation: 45 } as AnimObject;
    const [two] = combineShapes([ring!, turned], 'combine');
    expect(two!.holes).toHaveLength(2);
    // The turned square's corner reaches out to 450 + 70.7.
    expect(two!.x + two!.width).toBeCloseTo(450 + 50 * Math.SQRT2, 3);
    expect(hitTest(two!, { x: 150, y: 150 })).toBe(false);
  });

  it('is drawn even-odd', () => {
    const [ring] = combineShapes([square(0, 0, 300), square(100, 100)], 'combine');
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, key: string) =>
          ['withLayer', 'patternOf', 'withFilters', 'measureText'].includes(key)
            ? undefined
            : (...args: unknown[]) => calls.push(`${key}(${args.join(',')})`),
        set: () => true,
      },
    ) as unknown as StageCanvas;
    drawStage(ctx, stageWith(ring!));
    expect(calls).toContain('fill(evenodd)');
  });
});

describe('G4: arcs with the other Combine buttons', () => {
  it('J/24: a pie slice cut out of the cake leaves the cake without it', () => {
    const cake = { ...createEllipse({ x: 0, y: 0, width: 200, height: 200 }), fill: red };
    const slice = {
      ...createEllipse({ x: 0, y: 0, width: 200, height: 200 }),
      arc: { start: 300, end: 360, close: 'pie' as const },
    };
    const [left] = combineShapes([cake, slice], 'cutOut');
    expect(hitTest(left!, { x: 50, y: 100 })).toBe(true);
    // Inside the slice (330°: right and a little up from the centre).
    expect(hitTest(left!, { x: 180, y: 70 })).toBe(false);
  });

  it('refuses an open arc as a line, and text', () => {
    const arc = createArc({ x: 0, y: 0, width: 100, height: 100 });
    expect(() => combineShapes([square(0, 0), arc], 'union')).toThrow(/open lines/);
    expect(() => combineShapes([square(0, 0), createText('A', { x: 0, y: 0 })], 'combine')).toThrow(
      /Only shapes/,
    );
    expect(() => combineShapes([square(0, 0)], 'combine')).toThrow(/two or more shapes to combine/);
  });
});

describe('G4: Join', () => {
  it('meets two lines at their nearest ends (turning one round) into one open path', () => {
    const a = createLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    const b = createLine({ x: 100, y: 100 }, { x: 100, y: 0 });
    const [joined] = combineShapes([a, b], 'join');
    expect(joined).toMatchObject({ kind: 'path', closed: false, x: 0, y: 0, width: 100 });
    expect(joined!.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(COMBINE_LABELS.join).toBe('Join');
  });

  it('joins ends that are apart with a straight line, from either end', () => {
    const a = createLine({ x: 50, y: 0 }, { x: 0, y: 0 });
    const b = createLine({ x: 0, y: 40 }, { x: 50, y: 40 });
    const [joined] = combineShapes([a, b], 'join');
    expect(joined!.points).toEqual([
      { x: 50, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 50, y: 40 },
    ]);
    const c = createLine({ x: 0, y: 0 }, { x: 50, y: 0 });
    const d = createLine({ x: 50, y: 40 }, { x: 0, y: 40 });
    expect(combineShapes([c, d], 'join')[0]!.points).toHaveLength(4);
    const e = createLine({ x: 50, y: 40 }, { x: 0, y: 40 });
    expect(combineShapes([c, e], 'join')[0]!.points[0]).toEqual({ x: 0, y: 0 });
  });

  it('closes the path when the other ends meet too (two arcs make a lens)', () => {
    const top = { ...createArc({ x: 0, y: 0, width: 200, height: 100 }), fill: red };
    const bottom = {
      ...createArc({ x: 0, y: 0, width: 200, height: 100 }),
      arc: { start: 0, end: 180, close: 'open' as const },
    };
    const [lens] = combineShapes([top, bottom], 'join');
    expect(lens!.closed).toBe(true);
    // Two half arcs of two curves each: four anchors, each end met once.
    expect(lens!.points).toHaveLength(4);
    expect(lens!.points.every((p) => p.in && p.out)).toBe(true);
    expect(hitTest(lens!, { x: 100, y: 50 })).toBe(true);
  });

  it('joins a spiral and a pen path, keeping the curves', () => {
    const spiral = createSpiral({ x: 0, y: 0, width: 100, height: 100 });
    const tail = createPath(
      [
        { x: 100, y: 50 },
        { x: 200, y: 50 },
      ],
      false,
    );
    const [joined] = combineShapes([spiral, tail], 'join');
    expect(joined!.points.length).toBeGreaterThan(spiral.points.length);
    expect(joined!.points.some((p) => p.in || p.out)).toBe(true);
  });

  it('needs exactly two open lines', () => {
    const a = createLine({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(() => combineShapes([a], 'join')).toThrow(/two open lines/);
    expect(() => combineShapes([a, square(0, 0)], 'join')).toThrow(/two open lines/);
    expect(() => combineShapes([a, a, a], 'join')).toThrow(/two open lines/);
  });

  it('replaces the two lines on the stage with the joined one, where the back one was', () => {
    const a = createLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    const b = createLine({ x: 100, y: 0 }, { x: 100, y: 100 });
    const doc = stageWith(square(500, 500), a, b);
    const { doc: next, ids } = combineObjects(doc, [b.id, a.id], 'join');
    expect(ids).toHaveLength(1);
    const objects = next.layers[0]!.objects;
    expect(objects).toHaveLength(2);
    expect((objects[1] as PathObject).points).toHaveLength(3);
  });
});
