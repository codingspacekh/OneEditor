// From the Graphics benchmark (2026-11-17): G1 Union, Cut out, Intersect and Exclude keep the
// shapes' curves — three joined circles are a few Bézier curves, not ~200 straight sides (M/17
// the Woodlands foliage; J/18 the balloon "re-sizeable without loss of quality"; O/N/25 the
// apple's wireframe) — and B3 the result looks as the back shape did: no outline if it had none
// (J/24 the cut cake layers), its effects and fill opacity kept.
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { describe, expect, it } from 'vitest';
import { combineShapes } from '../../../../src/core/animation/combine.ts';
import { createEllipse, createPath, createRect } from '../../../../src/core/animation/factory.ts';
import { flattenPath, hitTest, toStage } from '../../../../src/core/animation/geometry.ts';
import type {
  AnimObject,
  ObjectFilter,
  PathObject,
  PathPoint,
} from '../../../../src/core/animation/types.ts';

const red = { kind: 'solid' as const, colour: '#ff0000' };
const disc = (x: number, y: number, d: number, extra: Partial<AnimObject> = {}) =>
  ({ ...createEllipse({ x, y, width: d, height: d }), fill: red, ...extra }) as AnimObject;
const box = (x: number, y: number, w: number, h: number, extra: Partial<AnimObject> = {}) =>
  ({ ...createRect({ x, y, width: w, height: h }), fill: red, ...extra }) as AnimObject;

const shoelace = (pts: { x: number; y: number }[]) =>
  Math.abs(
    pts.reduce(
      (s, a, i) => s + a.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * a.y,
      0,
    ),
  ) / 2;

/** The area a path covers, its curves followed (outline less holes). */
const area = (p: PathObject) =>
  shoelace(flattenPath(p.points, true)) -
  (p.holes ?? []).reduce((s, h) => s + shoelace(flattenPath(h, true)), 0);

/** The area of the same combination done on very fine straight-sided outlines (the truth). */
function fineArea(
  op: 'union' | 'difference' | 'intersection',
  ...circles: [number, number, number][]
) {
  const ring = ([cx, cy, r]: [number, number, number]): Polygon => [
    Array.from({ length: 2000 }, (_, i) => {
      const a = (i / 2000) * 2 * Math.PI;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
    }),
  ];
  const [first, ...rest] = circles.map(ring);
  const result = polygonClipping[op](first!, ...rest);
  return result.reduce(
    (s, poly) =>
      s +
      poly.reduce((t, r, i) => t + (i === 0 ? 1 : -1) * shoelace(r.map(([x, y]) => ({ x, y }))), 0),
    0,
  );
}

const curves = (pts: PathPoint[]) => pts.filter((p) => p.in || p.out).length;

describe('G1: combining keeps curves', () => {
  it('three overlapping circles joined are a few curves, covering what they covered', () => {
    const [foliage, ...rest] = combineShapes(
      [disc(40, 80, 100), disc(95, 40, 110), disc(130, 90, 95)],
      'union',
    );
    expect(rest).toEqual([]);
    expect(foliage!.points.length).toBeLessThanOrEqual(16);
    expect(curves(foliage!.points)).toBeGreaterThan(foliage!.points.length / 2);
    const truth = fineArea('union', [90, 130, 50], [150, 95, 55], [177.5, 137.5, 47.5]);
    expect(Math.abs(area(foliage!) - truth) / truth).toBeLessThan(0.002);
    // Inside where any circle was, outside between them at the top.
    expect(hitTest(foliage!, { x: 150, y: 95 })).toBe(true);
    expect(hitTest(foliage!, { x: 60, y: 60 })).toBe(false);
  });

  it('a bite out of a circle: the circle’s own curves and the bite’s, nothing straight', () => {
    const [bitten] = combineShapes([disc(0, 0, 300), disc(250, 100, 100)], 'cutOut');
    expect(bitten!.points.length).toBeLessThanOrEqual(8);
    expect(curves(bitten!.points)).toBe(bitten!.points.length);
    const truth = fineArea('difference', [150, 150, 150], [300, 150, 50]);
    expect(Math.abs(area(bitten!) - truth) / truth).toBeLessThan(0.002);
    expect(hitTest(bitten!, { x: 280, y: 150 })).toBe(false);
    expect(hitTest(bitten!, { x: 150, y: 150 })).toBe(true);
  });

  it('O/N/25: a pen shape of 12 curves bitten keeps about as many curves', () => {
    // A smooth closed pen outline: 12 anchors round a circle, each with handles.
    const k = (4 / 3) * Math.tan(Math.PI / 24);
    const anchors: PathPoint[] = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * 2 * Math.PI;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      const p = { x: 150 + 150 * c, y: 150 + 150 * s };
      const t = { x: -s * 150 * k, y: c * 150 * k };
      return { ...p, in: { x: p.x - t.x, y: p.y - t.y }, out: { x: p.x + t.x, y: p.y + t.y } };
    });
    const body = { ...createPath(anchors, true), fill: red } as PathObject;
    body.points = anchors.map((p) => ({
      x: p.x - body.x,
      y: p.y - body.y,
      in: { x: p.in!.x - body.x, y: p.in!.y - body.y },
      out: { x: p.out!.x - body.x, y: p.out!.y - body.y },
    }));
    const [bite] = combineShapes([body, disc(250, 100, 100)], 'cutOut');
    expect(bite!.points.length).toBeLessThanOrEqual(16);
    expect(curves(bite!.points)).toBe(bite!.points.length);
  });

  it('straight sides stay straight: two squares joined are 8 corners', () => {
    const [u] = combineShapes([box(0, 0, 100, 100), box(50, 50, 100, 100)], 'union');
    expect(u!.points).toHaveLength(8);
    expect(curves(u!.points)).toBe(0);
    expect(area(u!)).toBeCloseTo(17500, 6);
  });

  it('a round hole in a square is a curved hole of 4 anchors', () => {
    const [frame] = combineShapes([box(0, 0, 200, 200), disc(50, 50, 100)], 'cutOut');
    expect(frame!.points).toHaveLength(4);
    expect(frame!.holes).toHaveLength(1);
    expect(frame!.holes![0]).toHaveLength(4);
    expect(curves(frame!.holes![0]!)).toBe(4);
    // (The test follows curves in 16 steps a segment: a hair less round than the curve.)
    expect(Math.abs(area(frame!) - (40000 - Math.PI * 2500)) / 32146).toBeLessThan(0.001);
  });

  it('intersect and exclude keep curves too; a turned ellipse is combined where it is drawn', () => {
    const [lens] = combineShapes([disc(0, 0, 100), disc(50, 0, 100)], 'intersect');
    expect(lens!.points.length).toBeLessThanOrEqual(4);
    expect(curves(lens!.points)).toBe(lens!.points.length);
    const xor = combineShapes([disc(0, 0, 100), disc(50, 0, 100)], 'exclude');
    expect(xor.every((p) => curves(p.points) === p.points.length)).toBe(true);
    const turned = {
      ...createEllipse({ x: 0, y: 0, width: 200, height: 60 }),
      fill: red,
      rotation: 90,
    } as AnimObject;
    const [both] = combineShapes([turned, box(90, -100, 20, 20)], 'union');
    // The turned ellipse stands upright about its centre (100, 30): its top is at y = -70.
    expect(hitTest(both!, { x: 100, y: -60 })).toBe(true);
    expect(hitTest(both!, toStage(turned, { x: 5, y: 30 }))).toBe(true);
    expect(curves(both!.points)).toBeGreaterThan(0);
  });
});

describe('B3: the result looks as the back shape did', () => {
  const shadow: ObjectFilter = {
    kind: 'dropShadow',
    colour: '#000000',
    dx: 4,
    dy: 4,
    blur: 6,
    opacity: 50,
  };

  it('no outline when the back shape had none (J/24: each cut cake layer)', () => {
    for (const how of ['union', 'cutOut', 'intersect', 'exclude', 'combine'] as const) {
      const made = combineShapes(
        [box(0, 0, 100, 100, { stroke: undefined }), box(50, 50, 100, 100)],
        how,
      );
      for (const p of made) expect(p.stroke, how).toBeUndefined();
    }
  });

  it('its outline, effects, fill opacity and opacity kept exactly', () => {
    const line = { colour: '#123456', width: 3, dash: 'dashed' as const };
    const [u] = combineShapes(
      [
        box(0, 0, 100, 100, { stroke: line, filters: [shadow], fillOpacity: 40, opacity: 70 }),
        box(50, 50, 100, 100, { filters: [] }),
      ],
      'union',
    );
    expect(u!.stroke).toEqual(line);
    expect(u!.filters).toEqual([shadow]);
    expect(u!.fillOpacity).toBe(40);
    expect(u!.opacity).toBe(70);
  });
});
