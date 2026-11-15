// M19 / GV3: the node tool — node types (cusp, smooth, symmetrical), segments to lines or curves,
// many nodes moved, lined up and spaced, a path simplified, broken, joined, closed or opened,
// reversed, and nodes deleted keeping the shape. Every edit is right on a turned, flipped or
// skewed path (its nodes are in its own box; the edits are made where they are on the stage).
import { describe, expect, it } from 'vitest';
import { createPath } from '../../../../src/core/animation/factory.ts';
import { rotated, type Point } from '../../../../src/core/animation/geometry.ts';
import { flattenCurves } from '../../../../src/core/animation/path.ts';
import {
  anchorsOnStage,
  moveAnchor,
  moveHandle,
  pullHandles,
} from '../../../../src/core/animation/pen.ts';
import type { PathObject, PathPoint } from '../../../../src/core/animation/types.ts';
import {
  alignNodes,
  breakAtNode,
  deleteNodes,
  distributeNodes,
  joinNodes,
  moveNodes,
  nodeTypeOf,
  placeNode,
  reversePath,
  segmentsTo,
  setNodeType,
  setPathClosed,
  simplifyPath,
} from '../../../../src/core/graphics/nodes.ts';

const zigzag = () =>
  createPath(
    [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
      { x: 300, y: 100 },
    ],
    false,
  );
const square = () =>
  createPath(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    true,
  );
const xy = (path: PathObject) =>
  anchorsOnStage(path).map((a) => [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100]);
const near = (p: Point | undefined, x: number, y: number) => {
  expect(p).toBeDefined();
  expect(p!.x).toBeCloseTo(x, 6);
  expect(p!.y).toBeCloseTo(y, 6);
};
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point) => Math.hypot(v.x, v.y);
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
/** The anchor's handles are in line through it (pointing opposite ways). */
const inLine = (a: PathPoint) => {
  const i = sub(a.in!, a);
  const o = sub(a.out!, a);
  expect(Math.abs(cross(i, o)) / (len(i) * len(o))).toBeLessThan(1e-9);
  expect(i.x * o.x + i.y * o.y).toBeLessThan(0);
};

/** The furthest any point of one outline is from the other outline. */
function distanceBetween(a: PathObject, b: PathObject): number {
  const A = flattenCurves(anchorsOnStage(a), a.closed);
  const B = flattenCurves(anchorsOnStage(b), b.closed);
  const toPolyline = (p: Point, line: Point[], closed: boolean) => {
    let best = Infinity;
    const n = closed ? line.length : line.length - 1;
    for (let i = 0; i < n; i++) {
      const s = line[i]!;
      const e = line[(i + 1) % line.length]!;
      const d = sub(e, s);
      const l2 = d.x * d.x + d.y * d.y;
      const t =
        l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * d.x + (p.y - s.y) * d.y) / l2));
      best = Math.min(best, len(sub(p, { x: s.x + t * d.x, y: s.y + t * d.y })));
    }
    return best;
  };
  return Math.max(
    ...A.map((p) => toPolyline(p, B, b.closed)),
    ...B.map((p) => toPolyline(p, A, a.closed)),
  );
}

describe('GV3: node types', () => {
  it('a node is a cusp until it is given a type', () => {
    expect(nodeTypeOf(zigzag().points[1]!)).toBe('cusp');
    expect(nodeTypeOf(setNodeType(zigzag(), [1], 'smooth').points[1]!)).toBe('smooth');
  });

  it('smooth: a corner gets handles along its neighbours’ direction, a third of the way to each', () => {
    const a = anchorsOnStage(setNodeType(zigzag(), [1], 'smooth'))[1]!;
    expect(a.type).toBe('smooth');
    // Neighbours at (100, 100) and (300, 100): the handles lie flat, 1/3 of 141.42 each way.
    near(a.in, 200 - 141.4213562 / 3, 200);
    near(a.out, 200 + 141.4213562 / 3, 200);
  });

  it('smooth keeps each handle’s length and lines them up through the anchor, averaging the direction', () => {
    let path = pullHandles(zigzag(), 1, { x: 250, y: 200 });
    path = moveHandle(path, 1, 'in', { x: 200, y: 180 }, false); // a cusp: in up, out right
    const a = anchorsOnStage(setNodeType(path, [1], 'smooth'))[1]!;
    inLine(a);
    expect(len(sub(a.in!, a))).toBeCloseTo(20, 6);
    expect(len(sub(a.out!, a))).toBeCloseTo(50, 6);
    // Halfway between "out to the right" and "in from below": down-right at 45°.
    const o = sub(a.out!, a);
    expect(o.x).toBeCloseTo(o.y, 6);
  });

  it('symmetrical: in line and the same length (the average of the two)', () => {
    let path = pullHandles(zigzag(), 1, { x: 250, y: 200 });
    path = moveHandle(path, 1, 'in', { x: 170, y: 200 }, false);
    const a = anchorsOnStage(setNodeType(path, [1], 'symmetrical'))[1]!;
    inLine(a);
    expect(len(sub(a.in!, a))).toBeCloseTo(40, 6);
    expect(len(sub(a.out!, a))).toBeCloseTo(40, 6);
  });

  it('one handle only: the other is made opposite it; an end node gets a handle on its one side', () => {
    const path = setNodeType(zigzag(), [0, 2], 'symmetrical');
    const [first, , last] = anchorsOnStage(path);
    expect(first!.in).toBeUndefined();
    near(first!.out, 100 + 100 / 3, 100 + 100 / 3);
    expect(last!.out).toBeUndefined();
    near(last!.in, 300 - 100 / 3, 100 + 100 / 3);
    const one = setNodeType(path, [0], 'smooth');
    near(anchorsOnStage(one)[0]!.out, first!.out!.x, first!.out!.y);
  });

  it('a node whose single handle is set gets its partner opposite on a closed path', () => {
    const p = setNodeType(square(), [1], 'cusp');
    const curved = moveHandle(p, 1, 'out', { x: 100, y: 30 }, false);
    const a = anchorsOnStage(setNodeType(curved, [1], 'smooth'))[1]!;
    near(a.out, 100, 30);
    near(a.in, 100, -100 / 3);
  });

  it('cusp keeps the handles as they are; its handles then move on their own', () => {
    const smooth = pullHandles(zigzag(), 1, { x: 250, y: 200 });
    const cusp = setNodeType(smooth, [1], 'cusp');
    expect(anchorsOnStage(cusp)[1]).toMatchObject({ in: { x: 150, y: 200 }, type: 'cusp' });
    const moved = anchorsOnStage(moveHandle(cusp, 1, 'out', { x: 200, y: 150 }, true))[1]!;
    expect(moved.in).toEqual({ x: 150, y: 200 });
  });

  it('dragging a handle of a smooth node turns the other to stay in line, keeping its length', () => {
    const smooth = setNodeType(pullHandles(zigzag(), 1, { x: 250, y: 200 }), [1], 'smooth');
    const shorter = moveHandle(smooth, 1, 'in', { x: 180, y: 200 }, true);
    const a = anchorsOnStage(moveHandle(shorter, 1, 'out', { x: 200, y: 260 }, true))[1]!;
    near(a.out, 200, 260);
    near(a.in, 200, 180); // still 20 long, now straight up
    expect(a.type).toBe('smooth');
  });

  it('dragging a handle of a symmetrical node mirrors the other; Alt makes it a cusp', () => {
    const sym = setNodeType(pullHandles(zigzag(), 1, { x: 250, y: 200 }), [1], 'symmetrical');
    const a = anchorsOnStage(moveHandle(sym, 1, 'out', { x: 200, y: 260 }, true))[1]!;
    near(a.in, 200, 140);
    const alt = anchorsOnStage(moveHandle(sym, 1, 'out', { x: 200, y: 260 }, false))[1]!;
    expect(alt.type).toBe('cusp');
    near(alt.in, 150, 200);
  });

  it('a smooth node with no partner handle moves its one handle alone', () => {
    const p = setNodeType(zigzag(), [0], 'smooth');
    const a = anchorsOnStage(moveHandle(p, 0, 'out', { x: 150, y: 90 }, true))[0]!;
    near(a.out, 150, 90);
    expect(a.in).toBeUndefined();
  });

  it('pulling handles and moving an anchor keep the node’s type', () => {
    const sym = setNodeType(zigzag(), [1], 'symmetrical');
    expect(anchorsOnStage(pullHandles(sym, 1, { x: 260, y: 200 }))[1]!.type).toBe('symmetrical');
    expect(anchorsOnStage(moveAnchor(sym, 1, { x: 200, y: 250 }))[1]!.type).toBe('symmetrical');
  });

  it('is right on a turned path: the handles lie along the neighbours as they are shown', () => {
    const turned = rotated(zigzag(), 90);
    const a = anchorsOnStage(setNodeType(turned, [1], 'smooth'))[1]!;
    const [prev, , next] = anchorsOnStage(turned);
    const along = sub(next!, prev!);
    expect(Math.abs(cross(sub(a.out!, a), along))).toBeLessThan(1e-6);
  });

  it('asks for a node, and for nodes still on the path', () => {
    expect(() => setNodeType(zigzag(), [], 'smooth')).toThrow(/Choose a node/);
    expect(() => setNodeType(zigzag(), [7], 'smooth')).toThrow(/no longer on the path/);
  });
});

describe('GV3: segments to lines and curves', () => {
  it('to curve: the segment after the node gets handles a third of the way along it', () => {
    const curved = segmentsTo(zigzag(), [0], 'curve');
    const [a, b] = anchorsOnStage(curved);
    near(a!.out, 100 + 100 / 3, 100 + 100 / 3);
    near(b!.in, 200 - 100 / 3, 200 - 100 / 3);
    expect(b!.out).toBeUndefined();
  });

  it('to line: the handles of that segment go; a curve already there is kept by To curve', () => {
    const curved = pullHandles(zigzag(), 1, { x: 250, y: 200 });
    expect(segmentsTo(curved, [1], 'curve')).toEqual(curved);
    const line = anchorsOnStage(segmentsTo(curved, [1], 'line'));
    expect(line[1]!.out).toBeUndefined();
    expect(line[1]!.in).toEqual({ x: 150, y: 200 });
    expect(line[2]!.in).toBeUndefined();
  });

  it('on a closed path the last node’s segment is the one back to the start', () => {
    const curved = anchorsOnStage(segmentsTo(square(), [3], 'curve'));
    near(curved[3]!.out, 0, 100 - 100 / 3);
    near(curved[0]!.in, 0, 100 / 3);
  });

  it('the last node of an open path has no segment after it', () => {
    expect(() => segmentsTo(zigzag(), [2], 'line')).toThrow(/no segment after it/);
    // Chosen with another node, it is passed over.
    expect(anchorsOnStage(segmentsTo(zigzag(), [1, 2], 'curve'))[1]!.out).toBeDefined();
  });
});

describe('GV3: many nodes moved, typed, lined up and spaced', () => {
  it('the chosen nodes move together with their handles; the others stay', () => {
    const curved = pullHandles(zigzag(), 1, { x: 250, y: 200 });
    const moved = moveNodes(curved, [0, 1], 10, -5);
    expect(xy(moved)).toEqual([
      [110, 95],
      [210, 195],
      [300, 100],
    ]);
    expect(anchorsOnStage(moved)[1]!.out).toEqual({ x: 260, y: 195 });
  });

  it('a node is placed at a typed X and / or Y on the stage', () => {
    expect(xy(placeNode(zigzag(), 1, { x: 250 }))[1]).toEqual([250, 200]);
    expect(xy(placeNode(zigzag(), 1, { y: 40 }))[1]).toEqual([200, 40]);
    const turned = rotated(zigzag(), 30);
    expect(xy(placeNode(turned, 0, { x: 5, y: 6 }))[0]).toEqual([5, 6]);
  });

  it('align: left, centre, right, top, middle and bottom of the chosen nodes', () => {
    const p = zigzag();
    expect(xy(alignNodes(p, [0, 1], 'left')).slice(0, 2)).toEqual([
      [100, 100],
      [100, 200],
    ]);
    expect(xy(alignNodes(p, [0, 2], 'centre'))).toEqual([
      [200, 100],
      [200, 200],
      [200, 100],
    ]);
    expect(xy(alignNodes(p, [1, 2], 'right'))[1]).toEqual([300, 200]);
    expect(xy(alignNodes(p, [0, 1, 2], 'top')).map((a) => a[1])).toEqual([100, 100, 100]);
    expect(xy(alignNodes(p, [0, 1], 'middle')).map((a) => a[1])).toEqual([150, 150, 100]);
    expect(xy(alignNodes(p, [0, 1], 'bottom')).map((a) => a[1])).toEqual([200, 200, 100]);
    expect(() => alignNodes(p, [1], 'left')).toThrow(/two or more nodes/);
  });

  it('a flipped, skewed path is lined up and moved as it is shown on the stage', () => {
    const odd: PathObject = { ...zigzag(), flipX: true, skewX: 20, rotation: 15 };
    const before = xy(odd);
    const lined = xy(alignNodes(odd, [0, 1], 'left'));
    expect(lined[0]![0]).toBeCloseTo(lined[1]![0]!, 1);
    expect(lined[0]![0]).toBeCloseTo(Math.min(before[0]![0]!, before[1]![0]!), 1);
    expect(lined[2]).toEqual(before[2]);
    const moved = xy(moveNodes(odd, [2], 10, 0));
    expect(moved[2]![0]).toBeCloseTo(before[2]![0]! + 10, 1);
    expect(moved[2]![1]).toBeCloseTo(before[2]![1]!, 1);
  });

  it('distribute: the nodes between the outer two are spaced evenly across or down', () => {
    const p = createPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 50 },
        { x: 70, y: 20 },
        { x: 100, y: 90 },
      ],
      false,
    );
    expect(xy(distributeNodes(p, [0, 1, 2, 3], 'horizontal')).map((a) => a[0])).toEqual([
      0, 33.33, 66.67, 100,
    ]);
    expect(xy(distributeNodes(p, [0, 1, 2, 3], 'vertical')).map((a) => a[1])).toEqual([
      0, 60, 30, 90,
    ]);
    expect(() => distributeNodes(p, [0, 1], 'vertical')).toThrow(/three or more nodes/);
  });
});

describe('GV3: simplify', () => {
  /** A hand-drawn circle: 120 points, a little wobbly, as the brush leaves them. */
  const wobbly = () =>
    createPath(
      Array.from({ length: 120 }, (_, i) => {
        const t = (i / 120) * 2 * Math.PI;
        const r = 100 + 0.4 * Math.sin(i * 7);
        return { x: 200 + r * Math.cos(t), y: 200 + r * Math.sin(t) };
      }),
      true,
    );

  it('a brush circle keeps its look within the tolerance with far fewer nodes', () => {
    const before = wobbly();
    const after = simplifyPath(before, 2);
    expect(after.points.length).toBeLessThan(15);
    expect(after.points.length).toBeGreaterThanOrEqual(3);
    expect(distanceBetween(before, after)).toBeLessThan(2.5);
    expect(after.closed).toBe(true);
  });

  it('a stroke along a gentle curve; the corners of a zigzag stay sharp', () => {
    const stroke = createPath(
      Array.from({ length: 60 }, (_, i) => ({ x: i * 5, y: 100 + 30 * Math.sin(i / 10) })),
      false,
    );
    const simple = simplifyPath(stroke, 1);
    expect(simple.points.length).toBeLessThan(10);
    expect(distanceBetween(stroke, simple)).toBeLessThan(1.5);
    const zig = createPath(
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: i * 50, y: i % 2 ? 0 : 100 })),
      false,
    );
    const dense = simplifyPath(
      createPath(
        flattenCurves(
          zig.points.map((p) => ({ x: p.x + zig.x, y: p.y + zig.y })),
          false,
        ).flatMap((p, i, all) =>
          i === 0 ? [p] : [{ x: (p.x + all[i - 1]!.x) / 2, y: (p.y + all[i - 1]!.y) / 2 }, p],
        ),
        false,
      ),
      1,
    );
    expect(xy(dense)).toEqual(xy(zig));
    expect(dense.points.every((p) => !p.in && !p.out)).toBe(true);
  });

  it('a closed outline keeps three nodes or more, its straight sides straight', () => {
    // A half disc: the round side and the straight one fit two pieces; it is split into four.
    const half = createPath(
      Array.from({ length: 31 }, (_, i) => {
        const t = (i / 30) * Math.PI;
        return { x: 100 + 100 * Math.cos(t), y: 100 + 100 * Math.sin(t) };
      }),
      true,
    );
    const simple = simplifyPath(half, 3);
    expect(simple.points.length).toBeGreaterThanOrEqual(3);
    expect(simple.points.length).toBeLessThan(31);
    expect(distanceBetween(half, simple)).toBeLessThan(4);
    const loose = simplifyPath(wobbly(), 60);
    expect(loose.points.length).toBeGreaterThanOrEqual(3);
  });

  it('never adds nodes: a path already as simple as it can be is kept', () => {
    const sq = square();
    expect(simplifyPath(sq, 1)).toBe(sq);
  });

  it('the holes of a shape are simplified too, and stay where they were', () => {
    const ring = Array.from({ length: 40 }, (_, i) => {
      const t = (i / 40) * 2 * Math.PI;
      return { x: 50 + 20 * Math.cos(t), y: 50 + 20 * Math.sin(t) };
    });
    const shape: PathObject = { ...square(), holes: [ring] };
    const after = simplifyPath(shape, 1);
    expect(after.holes![0]!.length).toBeLessThan(10);
    expect(after.holes![0]!.length).toBeGreaterThanOrEqual(3);
    for (const p of after.holes![0]!) expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(20, 0);
  });

  it('on a turned path the outline stays where it is shown', () => {
    const before = rotated(wobbly(), 40);
    expect(distanceBetween(before, simplifyPath(before, 2))).toBeLessThan(2.5);
  });

  it('needs a tolerance above 0 px', () => {
    expect(() => simplifyPath(square(), 0)).toThrow(/more than 0 px/);
    expect(() => simplifyPath(square(), Number.NaN)).toThrow(/more than 0 px/);
  });
});

describe('GV3: break, join, close and open, reverse', () => {
  it('breaking a closed shape at a node opens it there, both ends on that node', () => {
    const [open] = breakAtNode(square(), 2);
    expect(open!.closed).toBe(false);
    expect(xy(open!)).toEqual([
      [100, 100],
      [0, 100],
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
  });

  it('breaking an open path at a middle node makes two paths, the second a new object', () => {
    const curved = pullHandles(zigzag(), 1, { x: 250, y: 200 });
    const [a, b] = breakAtNode(curved, 1);
    expect(xy(a!)).toEqual([
      [100, 100],
      [200, 200],
    ]);
    expect(xy(b!)).toEqual([
      [200, 200],
      [300, 100],
    ]);
    expect(a!.id).toBe(curved.id);
    expect(b!.id).not.toBe(curved.id);
    expect(anchorsOnStage(a!)[1]!.in).toEqual({ x: 150, y: 200 });
    expect(anchorsOnStage(a!)[1]!.out).toBeUndefined();
    expect(anchorsOnStage(b!)[0]!.in).toBeUndefined();
    expect(() => breakAtNode(zigzag(), 0)).toThrow(/middle of the path/);
    expect(() => breakAtNode({ ...square(), holes: [[{ x: 1, y: 1 }]] }, 0)).toThrow(/holes/);
  });

  it('joining the two end nodes of an open path closes it; ends in the same place become one', () => {
    const joined = joinNodes(zigzag(), [0, 2]);
    expect(joined.closed).toBe(true);
    expect(joined.points.length).toBe(3);
    const [open] = breakAtNode(square(), 0);
    const again = joinNodes(open!, [4, 0]);
    expect(again.closed).toBe(true);
    expect(xy(again)).toEqual(xy(square()));
    expect(() => joinNodes(zigzag(), [0, 1])).toThrow(/two end nodes/);
    expect(() => joinNodes(square(), [0, 3])).toThrow(/two end nodes/);
  });

  it('close and open: the closing segment comes and goes, with its handles', () => {
    const curvedClose = segmentsTo(square(), [3], 'curve');
    const opened = setPathClosed(curvedClose, false);
    expect(opened.closed).toBe(false);
    expect(opened.points[3]!.out).toBeUndefined();
    expect(opened.points[0]!.in).toBeUndefined();
    expect(setPathClosed(opened, true).closed).toBe(true);
    const sq = square();
    expect(setPathClosed(sq, true)).toBe(sq);
    expect(() => setPathClosed({ ...square(), holes: [[]] }, false)).toThrow(/holes/);
  });

  it('reverse: the nodes go the other way, each one’s handles swapped', () => {
    const curved = pullHandles(zigzag(), 1, { x: 250, y: 200 });
    const back = anchorsOnStage(reversePath(curved));
    expect(back.map((a) => [a.x, a.y])).toEqual([
      [300, 100],
      [200, 200],
      [100, 100],
    ]);
    expect(back[1]).toMatchObject({ in: { x: 250, y: 200 }, out: { x: 150, y: 200 } });
  });
});

describe('GV3: deleting nodes keeps the shape as close as it can', () => {
  it('a node in the middle of a curve goes; the curve either side is fitted again', () => {
    const circle = createPath(
      Array.from({ length: 8 }, (_, i) => {
        const t = (i / 8) * 2 * Math.PI;
        return { x: 100 + 100 * Math.cos(t), y: 100 + 100 * Math.sin(t) };
      }),
      true,
    );
    const round = setNodeType(circle, [0, 1, 2, 3, 4, 5, 6, 7], 'smooth');
    const fewer = deleteNodes(round, [1]);
    expect(fewer.points.length).toBe(7);
    expect(distanceBetween(round, fewer)).toBeLessThan(3);
  });

  it('straight sides stay straight; an end node of an open path simply goes', () => {
    expect(xy(deleteNodes(zigzag(), [1]))).toEqual([
      [100, 100],
      [300, 100],
    ]);
    expect(deleteNodes(zigzag(), [1]).points.every((p) => !p.in && !p.out)).toBe(true);
    expect(xy(deleteNodes(zigzag(), [0]))).toEqual([
      [200, 200],
      [300, 100],
    ]);
    const five = createPath(
      [0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: i * i })),
      false,
    );
    expect(deleteNodes(five, [1, 2]).points.length).toBe(3);
  });

  it('a path keeps at least two nodes, a closed shape three', () => {
    expect(() => deleteNodes(zigzag(), [0, 1])).toThrow(/at least two/);
    expect(() => deleteNodes(square(), [0, 1])).toThrow(/at least three/);
    expect(() => deleteNodes(zigzag(), [])).toThrow(/Choose a node/);
  });
});
