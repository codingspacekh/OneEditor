// M19 step 2, GV1: the arc (part of an ellipse: open, a pie slice or a chord; J/20's 180° meter,
// J/24's cake with a slice cut out), the spiral and the polyline; and the exact Bézier curves of
// ellipses and rounded corners that Convert to curves and Combine use (bezier.ts).
import { describe, expect, it } from 'vitest';
import {
  arcSweep,
  ellipseAnchors,
  KAPPA,
  mergeTouching,
  roundedRectAnchors,
} from '../../../../src/core/graphics/bezier.ts';
import {
  angleStep,
  createArc,
  createPolyline,
  createSpiral,
  DEFAULT_SPIRAL,
  isSpiralOf,
  spiralAnchors,
  validateSpiral,
} from '../../../../src/core/graphics/shapes.ts';
import { flattenCurves } from '../../../../src/core/animation/path.ts';
import {
  boundsOf,
  hitTest,
  isClosed,
  localOutline,
} from '../../../../src/core/animation/geometry.ts';
import { createAnimation, createEllipse } from '../../../../src/core/animation/factory.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import { drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import { validateObject } from '../../../../src/core/animation/rules.ts';
import { EditError } from '../../../../src/core/model/errors.ts';
import type { AnimObject, EllipseObject, PathPoint } from '../../../../src/core/animation/types.ts';

const red = { kind: 'solid' as const, colour: '#ff0000' };
const arcOf = (arc: EllipseObject['arc'], extra: Partial<EllipseObject> = {}): EllipseObject => ({
  ...createEllipse({ x: 100, y: 100, width: 200, height: 200 }),
  fill: red,
  arc,
  ...extra,
});

/** The greatest distance of a curve's points from a circle's line. */
function offCircle(points: PathPoint[], closed: boolean, c: number, r: number): number {
  return Math.max(
    ...flattenCurves(points, closed).map((p) => Math.abs(Math.hypot(p.x - c, p.y - c) - r)),
  );
}

function stageWith(...objects: AnimObject[]) {
  let doc = createAnimation({ name: 'A' });
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

/** Records the drawing calls (numbers to 3 decimals). */
function recorder() {
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, key: string) {
      if (key in target) return target[key];
      if (['withLayer', 'patternOf', 'withFilters', 'measureText'].includes(key)) return undefined;
      return (...args: unknown[]) => {
        calls.push(
          `${key}(${args.map((a) => (typeof a === 'number' ? String(Math.round(a * 1000) / 1000) : '…')).join(',')})`,
        );
      };
    },
    set(_t, key: string, value: unknown) {
      target[key] = value;
      return true;
    },
  }) as unknown as StageCanvas;
  return { ctx, calls };
}

describe('GV1: how far round an arc goes', () => {
  it('runs clockwise from its start to its end, round past 360°', () => {
    expect(arcSweep({ start: 180, end: 360 })).toBe(180);
    expect(arcSweep({ start: 300, end: 60 })).toBe(120);
    expect(arcSweep({ start: -90, end: 0 })).toBe(90);
    expect(arcSweep({ start: 30, end: 30 })).toBe(360);
    expect(arcSweep({ start: 0, end: 720 })).toBe(360);
  });
});

describe('GV2: exact Bézier curves of an ellipse and rounded corners', () => {
  it('makes a whole circle of four smooth curves with handles 0.5523 of the radius', () => {
    const { points, closed } = ellipseAnchors(200, 200);
    expect(closed).toBe(true);
    expect(points).toHaveLength(4);
    expect(points[0]).toMatchObject({ x: 200, y: 100, type: 'smooth' });
    expect(points[0]!.out!.y).toBeCloseTo(100 + KAPPA * 100, 6);
    expect(points[0]!.in!.y).toBeCloseTo(100 - KAPPA * 100, 6);
    expect(KAPPA).toBeCloseTo(0.5523, 4);
    expect(offCircle(points, true, 100, 100)).toBeLessThan(0.03);
  });

  it('makes an arc of as many curves as it has quarter turns, its ends without handles out', () => {
    const half = ellipseAnchors(200, 200, { start: 180, end: 360, close: 'open' });
    expect(half.closed).toBe(false);
    expect(half.points).toHaveLength(3);
    expect(half.points[0]).toMatchObject({ x: 0 });
    expect(half.points[0]!.y).toBeCloseTo(100, 9);
    expect(half.points[0]!.in).toBeUndefined();
    expect(half.points[1]!.y).toBeCloseTo(0, 9); // over the top
    expect(half.points[2]!.out).toBeUndefined();
    expect(offCircle(half.points, false, 100, 100)).toBeLessThan(0.03);
    const third = ellipseAnchors(200, 200, { start: 0, end: 120, close: 'chord' });
    expect(third.points).toHaveLength(3);
    expect(third.closed).toBe(true);
  });

  it('takes a pie slice on to the centre, a corner', () => {
    const pie = ellipseAnchors(200, 100, { start: 0, end: 90, close: 'pie' });
    expect(pie.closed).toBe(true);
    expect(pie.points.at(-1)).toEqual({ x: 100, y: 50 });
    expect(pie.points[1]!.x).toBeCloseTo(100, 9);
    expect(pie.points[1]!.y).toBeCloseTo(100, 9);
  });

  it('rounds a rectangle’s corners with quarter circles, from the top left clockwise', () => {
    const points = roundedRectAnchors(200, 100, 20);
    expect(points).toHaveLength(8);
    expect(points[0]).toMatchObject({ x: 20, y: 0, in: { x: 20 - KAPPA * 20, y: 0 } });
    expect(points[1]).toMatchObject({ x: 180, y: 0, out: { x: 180 + KAPPA * 20, y: 0 } });
    expect(points[2]).toMatchObject({ x: 200, y: 20 });
    expect(roundedRectAnchors(200, 100, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it('makes one anchor of corners that meet (a radius of half the side: a circle)', () => {
    const circle = roundedRectAnchors(100, 100, 80);
    expect(circle).toHaveLength(4);
    expect(circle.every((p) => p.in && p.out && p.type === 'smooth')).toBe(true);
    expect(offCircle(circle, true, 50, 50)).toBeLessThan(0.03);
    const pill = roundedRectAnchors(200, 100, 50);
    expect(pill).toHaveLength(6);
    // The first and last meeting, round the end.
    expect(
      mergeTouching(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 0, y: 0, in: { x: 1, y: 1 } },
        ],
        true,
      ),
    ).toEqual([
      { x: 0, y: 0, in: { x: 1, y: 1 } },
      { x: 5, y: 0 },
    ]);
  });
});

describe('GV1: the arc of an ellipse', () => {
  it('is made by the Arc tool as the top half of the box, a line with no fill', () => {
    const arc = createArc({ x: 10, y: 20, width: 200, height: 100 });
    expect(arc).toMatchObject({
      kind: 'ellipse',
      name: 'Arc',
      x: 10,
      width: 200,
      arc: { start: 180, end: 360, close: 'open' },
      fill: { kind: 'none' },
    });
    expect(() => validateObject(arc)).not.toThrow();
  });

  it('has an outline only along its part; an open arc is not closed, a pie and a chord are', () => {
    const open = arcOf({ start: 180, end: 360, close: 'open' });
    expect(isClosed(open)).toBe(false);
    expect(isClosed(arcOf({ start: 0, end: 90, close: 'pie' }))).toBe(true);
    expect(isClosed(arcOf({ start: 0, end: 90, close: 'chord' }))).toBe(true);
    expect(isClosed(arcOf(undefined))).toBe(true);
    // The top half: nothing below the middle.
    expect(Math.max(...localOutline(open).map((p) => p.y))).toBeCloseTo(100, 6);
    expect(boundsOf(open)).toMatchObject({ x: 100, y: 100, width: 200 });
    expect(boundsOf(open).height).toBeCloseTo(100, 6);
  });

  it('is picked only where it is drawn: a pie slice inside, an open arc on its line', () => {
    const pie = arcOf({ start: 0, end: 90, close: 'pie' });
    expect(hitTest(pie, { x: 250, y: 250 })).toBe(true); // bottom right quarter
    expect(hitTest(pie, { x: 150, y: 150 })).toBe(false); // top left: the cut-out part
    const open = arcOf({ start: 180, end: 360, close: 'open' });
    expect(hitTest(open, { x: 200, y: 150 })).toBe(false); // inside, but an open arc is a line
    expect(hitTest(open, { x: 200, y: 100 })).toBe(true); // on the line at the top
  });

  it('keeps working turned, flipped and skewed (its outline goes with the box)', () => {
    const turned = arcOf({ start: 0, end: 90, close: 'pie' }, { rotation: 180 });
    expect(hitTest(turned, { x: 150, y: 150 })).toBe(true);
    expect(hitTest(turned, { x: 250, y: 250 })).toBe(false);
    const flipped = arcOf({ start: 0, end: 90, close: 'pie' }, { flipX: true });
    expect(hitTest(flipped, { x: 150, y: 250 })).toBe(true);
    const skewed = arcOf({ start: 0, end: 90, close: 'pie' }, { skewX: 30 });
    expect(boundsOf(skewed).width).not.toBeCloseTo(100, 0);
  });

  it('is drawn as part of the ellipse: a pie to the centre, a chord across, an open arc unfilled', () => {
    const draw = (o: AnimObject) => {
      const r = recorder();
      drawStage(r.ctx, stageWith(o));
      return r.calls;
    };
    const pie = draw(arcOf({ start: 0, end: 90, close: 'pie' }));
    const at = pie.indexOf('ellipse(0,0,100,100,0,0,1.571)');
    expect(at).toBeGreaterThan(-1);
    expect(pie.slice(at + 1, at + 4)).toEqual(['lineTo(0,0)', 'closePath()', 'fill()']);
    const chord = draw(arcOf({ start: 300, end: 60, close: 'chord' }));
    const c = chord.indexOf('ellipse(0,0,100,100,0,5.236,7.33)');
    expect(chord.slice(c + 1, c + 3)).toEqual(['closePath()', 'fill()']);
    const open = draw(
      arcOf(
        { start: 180, end: 360, close: 'open' },
        { stroke: { colour: '#000000', width: 4, dash: 'solid' } },
      ),
    );
    expect(open).toContain('ellipse(0,0,100,100,0,3.142,6.283)');
    expect(open).not.toContain('fill()');
    expect(open).toContain('stroke()');
  });

  it('is an SVG arc in the SVG (J/20: the meter as an .svg file)', () => {
    const svg = stageSvg(stageWith(arcOf({ start: 0, end: 90, close: 'pie' })));
    expect(svg).toMatch(/<path d="M300 200A100 100 0 0 1 200 300L200 200Z"/);
    const open = stageSvg(
      stageWith(arcOf({ start: 180, end: 360, close: 'open' }, { fill: { kind: 'none' } })),
    );
    expect(open).toMatch(/<path d="M100 200A100 100 0 1 1 300 200"/);
  });

  it('refuses an arc whose ends are not angles, or that is closed some other way', () => {
    expect(() => validateObject(arcOf({ start: Number.NaN, end: 90, close: 'pie' }))).toThrow(
      EditError,
    );
    expect(() => validateObject(arcOf({ start: 0, end: 90, close: 'round' as 'pie' }))).toThrow(
      /open, a pie slice or a chord/,
    );
  });
});

describe('GV1: the spiral', () => {
  it('fills the dragged box with smooth curves, four a turn, from the middle outwards', () => {
    const spiral = createSpiral({ x: 50, y: 60, width: 300, height: 300 });
    expect(spiral).toMatchObject({
      kind: 'path',
      name: 'Spiral',
      closed: false,
      x: 50,
      y: 60,
      width: 300,
      height: 300,
      fill: { kind: 'none' },
    });
    expect(spiral.points).toHaveLength(3 * 4 + 1);
    expect(spiral.points.slice(1, -1).every((p) => p.type === 'smooth')).toBe(true);
    const line = flattenCurves(spiral.points, false);
    expect(Math.min(...line.map((p) => p.x))).toBeCloseTo(0, 1);
    expect(Math.max(...line.map((p) => p.x))).toBeCloseTo(300, 1);
    expect(Math.min(...line.map((p) => p.y))).toBeCloseTo(0, 1);
    expect(Math.max(...line.map((p) => p.y))).toBeCloseTo(300, 1);
    expect(() => validateObject(spiral)).not.toThrow();
  });

  it('turns as many times as asked, starting at the inner radius', () => {
    const centre = (pts: PathPoint[]) => {
      const line = flattenCurves(pts, false);
      const xs = line.map((p) => p.x);
      const ys = line.map((p) => p.y);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    };
    const tight = spiralAnchors(200, 200, { turns: 5, inner: 0, growth: 'even' });
    expect(tight).toHaveLength(21);
    const ring = spiralAnchors(200, 200, { turns: 2, inner: 50, growth: 'even' });
    const c = centre(ring);
    // Its inner end is half as far out as its outer end.
    const d = (p: PathPoint) => Math.hypot(p.x - c.x, p.y - c.y);
    expect(d(ring[0]!) / d(ring.at(-1)!)).toBeCloseTo(0.5, 1);
    expect(spiralAnchors(100, 100, { turns: 0.5, inner: 0, growth: 'even' })).toHaveLength(3);
  });

  it('opens out: each turn wider than the last', () => {
    const shell = spiralAnchors(200, 200, { turns: 3, inner: 0, growth: 'opening' });
    // Along the right of the centre (every fourth anchor), the gaps grow.
    const right = shell.filter((_, i) => i % 4 === 0).map((p) => p.x);
    const gaps = right.slice(1).map((x, i) => Math.abs(x - right[i]!));
    expect(gaps[2]!).toBeGreaterThan(gaps[1]! * 1.5);
    const even = spiralAnchors(200, 200, { turns: 3, inner: 0, growth: 'even' });
    const evenRight = even.filter((_, i) => i % 4 === 0).map((p) => p.x);
    const evenGaps = evenRight.slice(1).map((x, i) => Math.abs(x - evenRight[i]!));
    expect(evenGaps[2]!).toBeCloseTo(evenGaps[1]!, 0);
  });

  it('refuses turns, an inner radius or a growth it cannot draw', () => {
    expect(() => validateSpiral({ ...DEFAULT_SPIRAL, turns: 0.2 })).toThrow(/0.5 to 20 turns/);
    expect(() => validateSpiral({ ...DEFAULT_SPIRAL, turns: 21 })).toThrow(EditError);
    expect(() => validateSpiral({ ...DEFAULT_SPIRAL, inner: 95 })).toThrow(/0 to 90 %/);
    expect(() => validateSpiral({ ...DEFAULT_SPIRAL, inner: -1 })).toThrow(EditError);
    expect(() => validateSpiral({ ...DEFAULT_SPIRAL, growth: 'fast' as 'even' })).toThrow(
      /how the spiral grows/,
    );
  });

  it('knows a spiral is still as drawn (so new options can draw it again), and when it is not', () => {
    const spiral = createSpiral(
      { x: 0, y: 0, width: 100, height: 80 },
      { turns: 4, inner: 10, growth: 'even' },
    );
    expect(isSpiralOf(spiral, { turns: 4, inner: 10, growth: 'even' })).toBe(true);
    expect(isSpiralOf(spiral, DEFAULT_SPIRAL)).toBe(false);
    expect(
      isSpiralOf(
        { ...spiral, points: spiral.points.toSpliced(3, 1, { x: 1, y: 1 }) },
        { turns: 4, inner: 10, growth: 'even' },
      ),
    ).toBe(false);
    const moved = spiral.points.map((p, i) =>
      i === 2 && p.out ? { ...p, out: { x: p.out.x + 5, y: p.out.y } } : p,
    );
    expect(isSpiralOf({ ...spiral, points: moved }, { turns: 4, inner: 10, growth: 'even' })).toBe(
      false,
    );
    expect(isSpiralOf({ ...spiral, closed: true }, { turns: 4, inner: 10, growth: 'even' })).toBe(
      false,
    );
    expect(isSpiralOf(spiral, { turns: 99, inner: 10, growth: 'even' })).toBe(false);
  });
});

describe('GV1: the polyline', () => {
  it('is straight lines between the clicked points, a point clicked twice counted once', () => {
    const line = createPolyline(
      [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 60 },
      ],
      false,
    );
    expect(line).toMatchObject({ kind: 'path', name: 'Polyline', closed: false, x: 10, y: 10 });
    expect(line.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  it('closes when the first point is clicked again, and needs three points to', () => {
    const triangle = createPolyline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 80 },
        { x: 0, y: 0 },
      ],
      true,
    );
    expect(triangle.closed).toBe(true);
    expect(triangle.points).toHaveLength(3);
    expect(() =>
      createPolyline(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        true,
      ),
    ).toThrow(/three points/);
    expect(() =>
      createPolyline(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        false,
      ),
    ).toThrow(/two points/);
  });

  it('keeps 15° steps with Shift, as long as the line dragged', () => {
    expect(angleStep({ x: 0, y: 0 }, { x: 100, y: 3 })).toEqual({ x: 100.04, y: 0 });
    const diagonal = angleStep({ x: 0, y: 0 }, { x: 50, y: 52 });
    expect(diagonal.x).toBeCloseTo(diagonal.y, 1);
    const thirty = angleStep({ x: 10, y: 10 }, { x: 110, y: 68 });
    expect(Math.atan2(thirty.y - 10, thirty.x - 10) * (180 / Math.PI)).toBeCloseTo(30, 1);
  });
});
