// M19 / G12: the built-in pattern tiles as plain geometry, the same on the stage and in the SVG.
// Each repeats without a seam: what is inside along one edge is inside along the other.
import { describe, expect, it } from 'vitest';
import {
  PATTERN_LABELS,
  patternTile,
  pictureTileSize,
  type Tile,
  type TileName,
  type TileShape,
} from '../../../../src/core/graphics/patterns.ts';
import { PATTERN_NAMES } from '../../../../src/core/animation/rules.ts';

const TILES: TileName[] = [
  'weave',
  'checks',
  'stripes',
  'dots',
  'hatching',
  'crosshatch',
  'bricks',
];

/** Whether a point is inside a shape (polygons by crossings). */
function inside(shape: TileShape, x: number, y: number): boolean {
  if (shape.kind === 'rect')
    return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h;
  if (shape.kind === 'circle') return (x - shape.x) ** 2 + (y - shape.y) ** 2 <= shape.r ** 2;
  let crossings = 0;
  const pts = shape.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) crossings++;
  }
  return crossings % 2 === 1;
}
const painted = (tile: Tile, x: number, y: number) => tile.shapes.some((s) => inside(s, x, y));

/** How much of the tile is painted, sampled on a fine grid. */
function coverage(tile: Tile): number {
  let hit = 0;
  const n = 200;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (painted(tile, ((i + 0.5) / n) * tile.width, ((j + 0.5) / n) * tile.height)) hit++;
  return hit / (n * n);
}

describe('G12 pattern tiles', () => {
  it('has a tile for every built-in pattern, and a label for each (the picture too)', () => {
    for (const name of PATTERN_NAMES) expect(PATTERN_LABELS[name]).toBeTruthy();
    expect(TILES.every((t) => PATTERN_NAMES.includes(t))).toBe(true);
  });

  it.each(TILES)('G12: %s is a tile of the size asked, with something painted on it', (name) => {
    const tile = patternTile(name, 40);
    expect([tile.width, tile.height]).toEqual([40, 40]);
    const c = coverage(tile);
    expect(c).toBeGreaterThan(0.1);
    expect(c).toBeLessThan(0.95);
  });

  it('G12: hatching and crosshatch lines run on across the tiles (no seam at the corners)', () => {
    const s = 32;
    const d = s / 8;
    // Painted where x + y (and, crossed, x − y) is within d of a whole number of tiles.
    const gap = (v: number) => {
      const m = ((v % s) + s) % s;
      return Math.min(m, s - m);
    };
    const near = (v: number) => gap(v) < d;
    const hatching = patternTile('hatching', s);
    const crosshatch = patternTile('crosshatch', s);
    for (let i = 0; i < 40; i++)
      for (let j = 0; j < 40; j++) {
        const [x, y] = [((i + 0.31) / 40) * s, ((j + 0.67) / 40) * s];
        // Not right on a line's edge, where either answer is fair.
        if ([x + y, x - y].some((v) => Math.abs(gap(v) - d) < 0.01)) continue;
        expect(painted(hatching, x, y), `hatching at ${x}, ${y}`).toBe(near(x + y));
        expect(painted(crosshatch, x, y), `crosshatch at ${x}, ${y}`).toBe(
          near(x + y) || near(x - y),
        );
      }
  });

  it('G12: stripes and checks paint half the tile; dots a circle a quarter of it across', () => {
    expect(coverage(patternTile('stripes', 20))).toBeCloseTo(0.5, 2);
    expect(coverage(patternTile('checks', 20))).toBeCloseTo(0.5, 2);
    expect(coverage(patternTile('dots', 20))).toBeCloseTo(Math.PI / 16, 2);
    // Crosshatch has both diagonals: more than hatching, less than twice as much.
    const one = coverage(patternTile('hatching', 20));
    const both = coverage(patternTile('crosshatch', 20));
    expect(both).toBeGreaterThan(one);
    expect(both).toBeLessThan(2 * one);
  });

  it('G12: bricks are twice as long as high, the rows half a brick apart, mortar between', () => {
    const tile = patternTile('bricks', 32);
    expect(painted(tile, 16, 8)).toBe(true);
    // The mortar between the two bricks of the lower row, in the middle of the tile.
    expect(painted(tile, 16, 24)).toBe(false);
    expect(painted(tile, 16, 16)).toBe(false);
  });

  it('G12: a picture is tiled at the width asked, as high as its proportions make it', () => {
    expect(pictureTileSize(50, { width: 200, height: 100 })).toEqual({ width: 50, height: 25 });
    // A picture of no known size is tiled square.
    expect(pictureTileSize(50, undefined)).toEqual({ width: 50, height: 50 });
    expect(pictureTileSize(50, { width: 0, height: 10 })).toEqual({ width: 50, height: 50 });
  });
});
