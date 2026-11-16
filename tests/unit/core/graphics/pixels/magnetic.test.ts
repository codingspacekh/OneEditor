// M21 step 3 (GB2, GRAPHICS-DESIGN §6): the magnetic lasso's snap — between two points the path
// that follows the strongest edges nearby (a gradient-magnitude cost, a shortest-path search in
// a window round the two points), a help rather than perfection; straight where there is no edge
// or no picture.
import { describe, expect, it } from 'vitest';
import { createBitmap, fillRect } from '../../../../../src/core/graphics/pixels/raster.ts';
import { magneticPath } from '../../../../../src/core/graphics/pixels/magnetic.ts';

/** 40 × 40: black on the left half, white on the right, the edge between x 19 and x 20. */
const halves = () =>
  fillRect(
    fillRect(createBitmap(40, 40), { x: 0, y: 0, width: 40, height: 40 }, [0, 0, 0, 255]),
    { x: 20, y: 0, width: 20, height: 40 },
    [255, 255, 255, 255],
  );

/** Where the path crosses the line at this y (the first piece that reaches it). */
function xAt(path: { x: number; y: number }[], y: number): number {
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1]!, path[i]!];
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y)
      return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  }
  return NaN;
}

describe('M21 GB2: the magnetic lasso', () => {
  it('follows the edge between two points beside it', () => {
    const path = magneticPath(halves(), { x: 0, y: 0 }, { x: 16, y: 4 }, { x: 23, y: 34 });
    expect(path[0]).toEqual({ x: 16.5, y: 4.5 });
    expect(path.at(-1)).toEqual({ x: 23.5, y: 34.5 });
    // Away from its ends, it runs along the edge.
    for (let y = 10; y < 28; y += 2)
      expect(Math.abs(xAt(path, y + 0.5) - 20)).toBeLessThanOrEqual(0.5);
  });

  it('works on a layer placed elsewhere on the image (its own place)', () => {
    const path = magneticPath(halves(), { x: 100, y: 50 }, { x: 116, y: 54 }, { x: 123, y: 84 });
    for (let y = 60; y < 78; y += 2)
      expect(Math.abs(xAt(path, y + 0.5) - 120)).toBeLessThanOrEqual(0.5);
  });

  it('is a straight line where there is no picture under it', () => {
    expect(magneticPath(halves(), { x: 0, y: 0 }, { x: 50, y: 50 }, { x: 60, y: 70 })).toEqual([
      { x: 50, y: 50 },
      { x: 60, y: 70 },
    ]);
  });

  it('leaves out the points in a straight line', () => {
    const flat = fillRect(
      createBitmap(30, 30),
      { x: 0, y: 0, width: 30, height: 30 },
      [9, 9, 9, 255],
    );
    const path = magneticPath(flat, { x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 20 });
    expect(path).toEqual([
      { x: 2.5, y: 2.5 },
      { x: 2.5, y: 20.5 },
    ]);
  });
});
