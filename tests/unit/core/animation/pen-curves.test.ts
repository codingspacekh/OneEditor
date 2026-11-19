// AN3 (pilot feedback 2026-11-18): the pen makes curves as it draws (click and drag pulls out a
// point's handles, as Animate's and Illustrator's pens do), the path being drawn is previewed
// with its curves, and a segment of a path is bent by dragging it (as Animate's Selection tool
// bends a line), so a curve no longer needs Segment to curve first.
import { describe, expect, it } from 'vitest';
import { createPath } from '../../../../src/core/animation/factory.ts';
import { flattenCurves } from '../../../../src/core/animation/path.ts';
import {
  anchorsOnStage,
  bendSegment,
  createPenPath,
  penPathData,
} from '../../../../src/core/animation/pen.ts';
import type { PathPoint } from '../../../../src/core/animation/types.ts';

/** The point a cubic segment reaches at t. */
function cubicAt(a: PathPoint, b: PathPoint, t: number) {
  const c1 = a.out ?? a;
  const c2 = b.in ?? b;
  const u = 1 - t;
  const f = (p0: number, p1: number, p2: number, p3: number) =>
    u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  return { x: f(a.x, c1.x, c2.x, b.x), y: f(a.y, c1.y, c2.y, b.y) };
}

describe('the pen draws curves (AN3)', () => {
  it('createPenPath keeps each point’s handles and fits the box to the curve, not the points', () => {
    const path = createPenPath(
      [
        { x: 100, y: 100, out: { x: 150, y: 20 }, in: { x: 50, y: 180 } },
        { x: 200, y: 100 },
      ],
      false,
    );
    const anchors = anchorsOnStage(path);
    expect(anchors[0]).toMatchObject({ x: 100, y: 100 });
    expect(anchors[0]!.out!.x).toBeCloseTo(150, 9);
    expect(anchors[0]!.out!.y).toBeCloseTo(20, 9);
    expect(anchors[1]).toMatchObject({ x: 200, y: 100 });
    // The curve bulges above the two points: the box takes it in.
    expect(path.y).toBeLessThan(100);
    expect(path.height).toBeGreaterThan(0);
    expect(path.x).toBe(100);
    expect(path.width).toBe(100);
  });

  it('straight points make the same path as before', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
      { x: 110, y: 110 },
    ];
    expect(createPenPath(points, true)).toMatchObject({
      ...createPath(points, true),
      id: expect.any(String),
    });
  });

  it('penPathData draws the path so far with its curves, then a line to the pointer', () => {
    expect(
      penPathData(
        [
          { x: 0, y: 0, out: { x: 10, y: -20 } },
          { x: 50, y: 0 },
        ],
        { x: 80, y: 30 },
      ),
    ).toBe('M 0 0 C 10 -20 50 0 50 0 L 80 30');
    expect(penPathData([{ x: 0, y: 0 }], null)).toBe('M 0 0');
    expect(penPathData([], null)).toBe('');
  });
});

describe('bending a segment (AN3)', () => {
  const line = () =>
    createPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      true,
    );

  it('a straight segment dragged from its middle curves through the pointer; its ends stay', () => {
    const bent = bendSegment(line(), 0, { x: 50, y: 0 }, { x: 50, y: -40 });
    const [a, b, c] = anchorsOnStage(bent);
    expect([a!.x, a!.y, b!.x, b!.y, c!.x, c!.y]).toEqual([0, 0, 100, 0, 100, 100]);
    expect(a!.out).toBeDefined();
    expect(b!.in).toBeDefined();
    const mid = cubicAt(a!, b!, 0.5);
    expect(mid.x).toBeCloseTo(50, 5);
    expect(mid.y).toBeCloseTo(-40, 5);
    // The other segments are not touched.
    expect(b!.out).toBeUndefined();
    expect(c!.in).toBeUndefined();
    // The box grows to take in the bulge.
    expect(bent.y).toBeLessThan(0);
  });

  it('grabbed off the middle, the grabbed point follows the pointer', () => {
    const bent = bendSegment(line(), 1, { x: 100, y: 25 }, { x: 130, y: 25 });
    const [, b, c] = anchorsOnStage(bent);
    const at = cubicAt(b!, c!, 0.25);
    expect(at.x).toBeCloseTo(130, 5);
    expect(at.y).toBeCloseTo(25, 5);
  });

  it('a closed path’s last segment (back to the first point) bends too', () => {
    const bent = bendSegment(line(), 2, { x: 50, y: 50 }, { x: 30, y: 70 });
    const anchors = anchorsOnStage(bent);
    const mid = cubicAt(anchors[2]!, anchors[0]!, 0.5);
    expect(mid.x).toBeCloseTo(30, 5);
    expect(mid.y).toBeCloseTo(70, 5);
  });

  it('a curve already there bends further; a smooth node becomes a cusp (its other handle stays)', () => {
    const curved = createPenPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0, in: { x: 80, y: -20 }, out: { x: 120, y: 20 }, type: 'smooth' },
        { x: 200, y: 0 },
      ],
      false,
    );
    const before = anchorsOnStage(curved);
    const grab = cubicAt(before[0]!, before[1]!, 0.5);
    const bent = bendSegment(curved, 0, grab, { x: grab.x, y: grab.y - 30 });
    const after = anchorsOnStage(bent);
    const mid = cubicAt(after[0]!, after[1]!, 0.5);
    expect(mid.y).toBeCloseTo(grab.y - 30, 5);
    expect(after[1]!.out!.x).toBeCloseTo(before[1]!.out!.x, 9);
    expect(after[1]!.out!.y).toBeCloseTo(before[1]!.out!.y, 9);
    expect(after[1]!.type).toBe('cusp');
    // The outline is still a sensible curve.
    expect(flattenCurves(after, false).length).toBeGreaterThan(3);
  });

  it('an open path has no segment after its last point', () => {
    const open = createPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      false,
    );
    expect(() => bendSegment(open, 1, { x: 0, y: 0 }, { x: 0, y: 10 })).toThrow(/segment/i);
  });
});
