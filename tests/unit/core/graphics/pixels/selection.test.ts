// M21 step 3 (GB2): the pixel selection's maths — shapes rasterised (rectangle, ellipse, lasso
// polygons with the even-odd or nonzero rule, anti-aliased), combined (new, add, subtract,
// intersect), and changed (select all, invert, feather, grow / shrink, smooth), on masks the
// image's size, tile by tile where they can.
import { describe, expect, it } from 'vitest';
import {
  contentBounds,
  createMask,
  fillRect,
  maskFromBytes,
  pixelAt,
  readRegion,
  TILE,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import {
  combineMasks,
  ellipseMask,
  featherMask,
  growMask,
  invertMask,
  isEmptyMask,
  multiplyMasks,
  placeMask,
  polygonMask,
  putRegion,
  rectMask,
  selectAllMask,
  smoothMask,
} from '../../../../../src/core/graphics/pixels/selection.ts';

const sum = (m: ReturnType<typeof createMask>) => readRegion(m).reduce((n, v) => n + v, 0);
const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('M21 GB2: selections from shapes', () => {
  it('selects a rectangle of whole pixels exactly', () => {
    const m = rectMask(20, 10, { x: 2, y: 3, width: 5, height: 4 });
    expect(contentBounds(m)).toEqual({ x: 2, y: 3, width: 5, height: 4 });
    expect(sum(m)).toBe(5 * 4 * 255);
    expect(pixelAt(m, 2, 3)).toBe(255);
    expect(pixelAt(m, 7, 3)).toBe(0);
  });

  it('covers part pixels in part (anti-aliased) and drops what is off the image', () => {
    const m = rectMask(10, 10, { x: 1.5, y: -3, width: 2, height: 5 });
    expect(pixelAt(m, 1, 0)).toBe(128);
    expect(pixelAt(m, 2, 0)).toBe(255);
    expect(pixelAt(m, 3, 0)).toBe(128);
    expect(pixelAt(m, 2, 1)).toBe(255);
    expect(pixelAt(m, 2, 2)).toBe(0);
    expect(isEmptyMask(rectMask(10, 10, { x: 20, y: 0, width: 5, height: 5 }))).toBe(true);
  });

  it('without anti-aliasing, a pixel is in when its centre is', () => {
    const m = polygonMask(10, 10, [square(1.4, 1.4, 3)], { antiAlias: false });
    expect(contentBounds(m)).toEqual({ x: 1, y: 1, width: 3, height: 3 });
    expect(new Set(readRegion(m))).toEqual(new Set([0, 255]));
  });

  it('selects an ellipse: the area of a circle, soft at the edge', () => {
    const m = ellipseMask(100, 100, { x: 10, y: 10, width: 80, height: 80 });
    expect(sum(m) / 255).toBeCloseTo(Math.PI * 40 * 40, -1);
    expect(pixelAt(m, 50, 50)).toBe(255);
    expect(pixelAt(m, 11, 11)).toBe(0);
    const edge = pixelAt(m, 10, 50);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('fills a ring even-odd (a hole) or nonzero (the same way round: no hole)', () => {
    const outer = square(0, 0, 10);
    const inner = square(3, 3, 4);
    const evenOdd = polygonMask(10, 10, [outer, inner], { rule: 'evenodd' });
    expect(pixelAt(evenOdd, 5, 5)).toBe(0);
    expect(pixelAt(evenOdd, 1, 1)).toBe(255);
    expect(pixelAt(polygonMask(10, 10, [outer, inner], { rule: 'nonzero' }), 5, 5)).toBe(255);
    // Drawn the other way round, the hole stays a hole under nonzero too (a font's counters).
    const back = [...inner].reverse();
    expect(pixelAt(polygonMask(10, 10, [outer, back], { rule: 'nonzero' }), 5, 5)).toBe(0);
  });

  it('a lasso of fewer than three points selects nothing', () => {
    expect(
      isEmptyMask(
        polygonMask(10, 10, [
          [
            { x: 1, y: 1 },
            { x: 5, y: 5 },
          ],
        ]),
      ),
    ).toBe(true);
    expect(isEmptyMask(polygonMask(10, 10, []))).toBe(true);
  });

  it('a self-crossing lasso (a figure of eight) selects both loops', () => {
    const eight = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const m = polygonMask(10, 10, [eight]);
    expect(pixelAt(m, 1, 5)).toBe(255);
    expect(pixelAt(m, 8, 5)).toBe(255);
    expect(pixelAt(m, 5, 1)).toBe(0);
  });

  it('places a smaller mask (a layer’s) on the image at its place', () => {
    const small = fillRect(createMask(4, 4), { x: 0, y: 0, width: 4, height: 4 }, 200);
    const m = placeMask(small, 8, -2, 10, 10);
    expect(contentBounds(m)).toEqual({ x: 8, y: 0, width: 2, height: 2 });
    expect(pixelAt(m, 9, 1)).toBe(200);
  });
});

describe('M21 GB2: combining (new, Shift add, Alt subtract, Shift+Alt intersect)', () => {
  const a = rectMask(10, 10, { x: 0, y: 0, width: 6, height: 10 });
  const b = rectMask(10, 10, { x: 4, y: 0, width: 6, height: 10 });

  it('new replaces, add joins, subtract cuts out, intersect keeps what both have', () => {
    expect(combineMasks(a, b, 'new')).toBe(b);
    expect(combineMasks(undefined, b, 'add')).toBe(b);
    expect(contentBounds(combineMasks(a, b, 'add'))).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(contentBounds(combineMasks(a, b, 'subtract'))).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 10,
    });
    expect(contentBounds(combineMasks(a, b, 'intersect'))).toEqual({
      x: 4,
      y: 0,
      width: 2,
      height: 10,
    });
    expect(isEmptyMask(combineMasks(undefined, b, 'subtract'))).toBe(true);
    expect(isEmptyMask(combineMasks(undefined, b, 'intersect'))).toBe(true);
  });

  it('subtracting part of a pixel leaves part of it', () => {
    const half = maskFromBytes(1, 1, new Uint8ClampedArray([128]));
    const all = maskFromBytes(1, 1, new Uint8ClampedArray([255]));
    expect(pixelAt(combineMasks(all, half, 'subtract'), 0, 0)).toBe(127);
    expect(pixelAt(multiplyMasks(all, half), 0, 0)).toBe(128);
  });

  it('shares the tiles one side leaves alone (a big image)', () => {
    const big = rectMask(TILE * 3, TILE, { x: 0, y: 0, width: 10, height: 10 });
    const far = rectMask(TILE * 3, TILE, { x: TILE * 2 + 5, y: 0, width: 10, height: 10 });
    const both = combineMasks(big, far, 'add');
    expect(both.tiles[0]).toBe(big.tiles[0]);
    expect(both.tiles[2]).toBe(far.tiles[2]);
    expect(both.tiles[1]).toBeNull();
  });

  it('refuses masks of different sizes', () => {
    expect(() => combineMasks(createMask(2, 2), createMask(3, 2), 'add')).toThrow();
  });
});

describe('M21 GB2: the edge cases of the maths', () => {
  it('ignores parts of a lasso off the image, and slivers that cover no pixel centre', () => {
    const off = square(-20, 0, 10);
    const on = square(0, 0, 4);
    expect(contentBounds(polygonMask(10, 10, [off, on], { rule: 'evenodd' }))).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const sliver = [
      { x: 1.1, y: 1 },
      { x: 1.3, y: 1 },
      { x: 1.3, y: 5 },
      { x: 1.1, y: 5 },
    ];
    expect(isEmptyMask(polygonMask(10, 10, [sliver], { antiAlias: false }))).toBe(true);
  });

  it('puts nothing in for a region off the mask', () => {
    const m = createMask(4, 4);
    expect(putRegion(m, { x: 9, y: 9, width: 2, height: 2 }, new Uint8ClampedArray(4))).toBe(m);
  });

  it('shares one full tile between same-sized tiles of a select all', () => {
    const all = selectAllMask(TILE * 2, TILE);
    expect(all.tiles[0]).toBe(all.tiles[1]);
  });

  it('subtracts, intersects and multiplies where one side has no tile', () => {
    const left = rectMask(TILE * 2, 4, { x: 0, y: 0, width: 4, height: 4 });
    const right = rectMask(TILE * 2, 4, { x: TILE, y: 0, width: 4, height: 4 });
    expect(combineMasks(left, right, 'subtract').tiles[0]).toBe(left.tiles[0]);
    expect(isEmptyMask(combineMasks(left, right, 'intersect'))).toBe(true);
    expect(isEmptyMask(multiplyMasks(left, right))).toBe(true);
    expect(isEmptyMask(multiplyMasks(createMask(2, 2), createMask(2, 2)))).toBe(true);
  });

  it('feathers more than a small image is wide, or by 1 px; smooths nothing as nothing', () => {
    const dot = fillRect(createMask(5, 5), { x: 2, y: 2, width: 1, height: 1 }, 255);
    const wide = featherMask(dot, 20);
    expect(pixelAt(wide, 2, 2)).toBeGreaterThan(0);
    expect(pixelAt(wide, 2, 2)).toBeLessThan(255);
    expect(pixelAt(featherMask(dot, 1), 2, 2)).toBeGreaterThan(0);
    const none = createMask(5, 5);
    expect(smoothMask(none, 2)).toBe(none);
  });
});

describe('M21 GB2: changing the selection', () => {
  it('selects all and inverts', () => {
    const all = selectAllMask(TILE + 10, 20);
    expect(sum(all)).toBe((TILE + 10) * 20 * 255);
    expect(isEmptyMask(invertMask(all))).toBe(true);
    const r = rectMask(10, 10, { x: 2, y: 2, width: 3, height: 3 });
    const inv = invertMask(r);
    expect(pixelAt(inv, 3, 3)).toBe(0);
    expect(pixelAt(inv, 0, 0)).toBe(255);
    expect(sum(inv)).toBe((100 - 9) * 255);
    expect(sum(invertMask(createMask(4, 4)))).toBe(16 * 255);
  });

  it('feathers: a blur of the edge, the middle and the far outside unchanged', () => {
    const r = rectMask(60, 60, { x: 20, y: 20, width: 20, height: 20 });
    const f = featherMask(r, 4);
    expect(pixelAt(f, 30, 30)).toBe(255);
    expect(pixelAt(f, 2, 2)).toBe(0);
    const edge = pixelAt(f, 20, 30);
    expect(edge).toBeGreaterThan(64);
    expect(edge).toBeLessThan(220);
    expect(pixelAt(f, 18, 30)).toBeGreaterThan(0);
    expect(featherMask(r, 0)).toBe(r);
    // A selection reaching the image's edge stays selected there.
    expect(pixelAt(featherMask(selectAllMask(30, 30), 5), 0, 0)).toBe(255);
    expect(featherMask(createMask(5, 5), 3).tiles).toEqual([null]);
  });

  it('grows and shrinks by whole pixels (round corners, as a distance)', () => {
    const r = rectMask(40, 40, { x: 10, y: 10, width: 10, height: 10 });
    const grown = growMask(r, 3);
    expect(contentBounds(grown)).toEqual({ x: 7, y: 7, width: 16, height: 16 });
    expect(pixelAt(grown, 7, 7)).toBe(0); // the corner is round
    const shrunk = growMask(r, -3);
    expect(contentBounds(shrunk)).toEqual({ x: 13, y: 13, width: 4, height: 4 });
    expect(isEmptyMask(growMask(r, -6))).toBe(true);
    expect(growMask(r, 0)).toBe(r);
    // Shrinking does not eat in from the image's edge.
    expect(contentBounds(growMask(selectAllMask(20, 20), -3))).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    });
    expect(isEmptyMask(growMask(createMask(5, 5), 2))).toBe(true);
  });

  it('smooths: a speck goes, a jagged corner rounds, the edge is sharp again', () => {
    let m = rectMask(40, 40, { x: 10, y: 10, width: 20, height: 20 });
    m = fillRect(m, { x: 2, y: 2, width: 1, height: 1 }, 255);
    const s = smoothMask(m, 2);
    expect(pixelAt(s, 2, 2)).toBe(0);
    expect(pixelAt(s, 20, 20)).toBe(255);
    expect(pixelAt(s, 10, 10)).toBe(0);
    expect(new Set(readRegion(s))).toEqual(new Set([0, 255]));
    expect(smoothMask(m, 0)).toBe(m);
  });
});
