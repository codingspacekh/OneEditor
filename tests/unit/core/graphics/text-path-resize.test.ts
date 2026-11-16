// GT2, GT3 (M20): a text on a path or in a shape is resized with its outline — dragging a
// handle scales the outline and the letters together (text keeps its shape), a group stretched
// stretches the outline (M/17 Woodlands: the group resized to 250 × 200 px), a width typed in
// Properties scales the outline across. Its points are in its box, so moving and turning it
// take the path with it.
import { describe, expect, it } from 'vitest';
import { createGroup, createText } from '../../../../src/core/animation/factory.ts';
import { resizeFrom, setSize } from '../../../../src/core/animation/geometry.ts';
import type { GroupObject, TextObject } from '../../../../src/core/animation/types.ts';

const square = [
  { x: 0, y: 0, out: { x: 50, y: -20 } },
  { x: 100, y: 0, in: { x: 50, y: -20 } },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

const onPath = (): TextObject => ({
  ...createText('Woodlands', { x: 0, y: 0, size: 20 }),
  width: 100,
  height: 100,
  path: { points: square, closed: true, start: 10, side: 'outside' },
});

describe('GT2, GT3: resizing text with its outline', () => {
  it('a handle dragged scales the outline and the letters together', () => {
    const t = resizeFrom(onPath(), 'se', { x: 200, y: 200 }, { lockRatio: false });
    expect(t).toMatchObject({ width: 200, height: 200, size: 40 });
    expect(t.path!.points[1]).toEqual({ x: 200, y: 0, in: { x: 100, y: -40 } });
    expect(t.path!.start).toBe(10);
  });

  it('a width typed scales the outline across; the shape’s padding stays', () => {
    const inShape: TextObject = {
      ...onPath(),
      path: undefined,
      inShape: { points: square, holes: [square], padding: 6 },
    };
    const t = setSize(inShape, 300, 100);
    expect(t.inShape!.points[2]).toEqual({ x: 300, y: 100 });
    expect(t.inShape!.holes![0]![1]!.x).toBe(300);
    expect(t.inShape!.padding).toBe(6);
    expect(t.size).toBe(20);
  });

  it('M/17 Woodlands: the group stretched stretches the path inside it', () => {
    const g = createGroup([onPath()]);
    const big = setSize(g, 250, 200) as GroupObject;
    const t = big.children[0] as TextObject;
    expect(t.path!.points[2]).toEqual({ x: 250, y: 200 });
    // The letters scale by the smaller stretch, as text in a group does.
    expect(t.size).toBe(40);
  });
});
