// M22 step 4 (GB5): the distortions, each the same size as the pixels it is given: twirl (the
// workbook's motion swirl), bulge and pinch (O/N/21's lens: magnified inside a circle),
// perspective (the four corners moved: a projective map) and warp (a 4 × 4 mesh of points the
// picture follows). Each output pixel is sampled from where it came from (bicubic, premultiplied);
// what lies outside the circle is untouched, its tiles the very same. Known answers on ramps.
import { describe, expect, it } from 'vitest';
import {
  bulge,
  bulgeSource,
  cornersProblem,
  meshProblem,
  perspective,
  restMesh,
  twirl,
  twirlSource,
  warp,
} from '../../../../../src/core/graphics/pixels/distort.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  maskFromBytes,
  pixelAt,
  type Bitmap,
  type Mask,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const all = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const opaque = (w: number, h: number, v: number): Bitmap =>
  fillRect(createBitmap(w, h), all(w, h), [v, v, v, 255]);
/** A mask whose value is its x (or y), so a sample shows where it was taken from. */
const ramp = (w: number, h: number, along: 'x' | 'y' = 'x'): Mask => {
  const bytes = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bytes[y * w + x] = along === 'x' ? x : y;
  return maskFromBytes(w, h, bytes);
};

describe('M22 GB5: twirl', () => {
  it('M22 GB5: turns most at the centre, less further out, not at all past the radius', () => {
    const c = { x: 50, y: 50 };
    // At half the radius, (1 − ½)² of the angle: 90° there is 22.5°, clockwise on screen.
    const s = twirlSource(c, 40, 90, { x: 70, y: 50 })!;
    const back = (-22.5 * Math.PI) / 180;
    expect(s.x).toBeCloseTo(50 + 20 * Math.cos(back), 6);
    expect(s.y).toBeCloseTo(50 + 20 * Math.sin(back), 6);
    expect(twirlSource(c, 40, 90, { x: 95, y: 50 })).toBeNull();
    expect(twirlSource(c, 40, 90, c)).toEqual(c);
  });

  it('M22 GB5: a dot at half the radius goes round clockwise; outside the circle is untouched', () => {
    let b = opaque(600, 300, 0);
    b = fillRect(b, { x: 119, y: 99, width: 3, height: 3 }, [255, 255, 255, 255]);
    const out = twirl(b, { centre: { x: 100.5, y: 100.5 }, radius: 40, angle: 90 });
    // The dot (20 px right of the centre) is now 22.5° clockwise: about (118.5, 108.2).
    expect(pixelAt(out, 118, 108)[0]).toBeGreaterThan(150);
    expect(pixelAt(out, 120, 100)[0]).toBeLessThan(60);
    // Tiles the circle does not reach are the very same.
    expect(out.tiles[1]).toBe(b.tiles[1]);
    expect(out.tiles[2]).toBe(b.tiles[2]);
    expect(twirl(b, { centre: { x: 100, y: 100 }, radius: 40, angle: 0 })).toBe(b);
  });

  it('M22 GB5: a plain photo stays plain; a mask can be twirled', () => {
    const b = opaque(100, 100, 60);
    expect(twirl(b, { centre: { x: 50, y: 50 }, radius: 45, angle: 200 })).toBe(b);
    const out = twirl(ramp(100, 100), { centre: { x: 50, y: 50 }, radius: 40, angle: 180 });
    // Half a turn at the centre: just right of it now shows what was just left.
    expect(pixelAt(out, 52, 50)).toBeLessThan(50);
  });
});

describe('M22 GB5: bulge and pinch (the lens)', () => {
  it('M22 GB5: inside the circle each pixel comes from nearer the centre (magnified), the rim stays', () => {
    const c = { x: 128, y: 64 };
    // r_s = r (1 − a (1 − r/R)²): at 49.5 px of R 100 with a ½, from 43.19 px out.
    const s = bulgeSource(c, 100, 50, { x: 177.5, y: 64 })!;
    expect(s.x).toBeCloseTo(128 + 49.5 * (1 - 0.5 * (1 - 0.495) ** 2), 6);
    expect(s.y).toBeCloseTo(64, 6);
    expect(bulgeSource(c, 100, 50, { x: 228.5, y: 64 })).toBeNull();
    expect(bulgeSource(c, 100, 50, c)).toEqual(c);
  });

  it('M22 GB5: on a ramp the magnified middle changes slower than the ramp; outside, unchanged', () => {
    const r = ramp(256, 128);
    const out = bulge(r, { centre: { x: 128, y: 64 }, radius: 100, amount: 50 });
    // Output pixel 177 (centre 177.5) shows the ramp at 171.19, which holds 170.69.
    expect(pixelAt(out, 177, 64)).toBe(171);
    // Near the centre each output pixel covers half a source pixel (2× magnified).
    expect(pixelAt(out, 138, 64) - pixelAt(out, 118, 64)).toBeLessThan(13);
    expect(pixelAt(out, 240, 64)).toBe(240);
    expect(pixelAt(out, 10, 64)).toBe(10);
  });

  it('M22 GB5: pinch (a negative amount) shrinks the middle; 0 changes nothing', () => {
    const r = ramp(256, 128);
    const out = bulge(r, { centre: { x: 128, y: 64 }, radius: 100, amount: -50 });
    expect(pixelAt(out, 138, 64) - pixelAt(out, 118, 64)).toBeGreaterThan(27);
    expect(bulge(r, { centre: { x: 128, y: 64 }, radius: 100, amount: 0 })).toBe(r);
  });

  it('M22 GB5: a circle past the layer’s edge reads the edge pixels; colours stay on a soft edge', () => {
    const b = fillRect(
      createBitmap(60, 60),
      { x: 0, y: 0, width: 30, height: 60 },
      [0, 0, 255, 255],
    );
    const out = bulge(b, { centre: { x: 30, y: 0 }, radius: 50, amount: 80 });
    const p = pixelAt(out, 31, 10);
    if (p[3] > 0) expect(p.slice(0, 3)).toEqual([0, 0, 255]);
    expect(pixelAt(out, 5, 10)).toEqual([0, 0, 255, 255]);
  });
});

describe('M22 GB5: perspective', () => {
  it('M22 GB5: the corners where they are change nothing', () => {
    const r = ramp(40, 20);
    expect(
      perspective(r, [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 0, y: 20 },
      ]),
    ).toBe(r);
  });

  it('M22 GB5: the corners moved in: the picture fits between them, transparent around', () => {
    const r = ramp(100, 100);
    // A square of half the size at the top left: an exact half-size picture.
    const out = perspective(r, [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ]);
    // Output pixel 20 (centre 20.5) shows the ramp at 41, which holds 40.5.
    expect(Math.abs(pixelAt(out, 20, 20) - 40.5)).toBeLessThanOrEqual(1);
    expect(pixelAt(out, 75, 75)).toBe(0);
    expect(pixelAt(out, 75, 20)).toBe(0);
  });

  it('M22 GB5: a true perspective: the far side narrower, its middle not halfway (foreshortened)', () => {
    const r = ramp(100, 100, 'y');
    // The top edge pulled in to a third of the width: the picture leans away.
    const out = perspective(r, [
      { x: 33, y: 0 },
      { x: 67, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(pixelAt(out, 5, 5)).toBe(0);
    expect(pixelAt(out, 50, 1)).toBeLessThan(6);
    // Halfway down the screen is past halfway down the picture (the far half is squeezed).
    expect(pixelAt(out, 50, 50)).toBeGreaterThan(55);
  });

  it('M22 GB5: corners that cross are refused', () => {
    expect(() =>
      perspective(ramp(10, 10), [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toThrow(/cross/);
  });
});

describe('M22 GB5: warp (a 4 × 4 mesh)', () => {
  it('M22 GB5: the mesh at rest changes nothing; its points are a third of the way apart', () => {
    const r = ramp(90, 60);
    const mesh = restMesh(90, 60);
    expect(mesh).toHaveLength(16);
    expect(mesh[5]).toEqual({ x: 30, y: 20 });
    expect(warp(r, mesh)).toBe(r);
  });

  it('M22 GB5: the whole mesh moved right moves the picture; a point dragged pulls the picture with it', () => {
    const r = ramp(90, 60);
    const moved = warp(
      r,
      restMesh(90, 60).map((p) => ({ x: p.x + 10, y: p.y })),
    );
    expect(Math.abs(pixelAt(moved, 50, 30) - 40)).toBeLessThanOrEqual(1);
    expect(pixelAt(moved, 5, 30)).toBe(0);
    // Point 5 (30, 20) dragged to (40, 20): the pixel there now shows what was at 30.
    const mesh = restMesh(90, 60);
    mesh[5] = { x: 40, y: 20 };
    const pulled = warp(r, mesh);
    expect(Math.abs(pixelAt(pulled, 40, 20) - 30)).toBeLessThanOrEqual(1);
    // The corners did not move.
    expect(Math.abs(pixelAt(pulled, 1, 58) - 1)).toBeLessThanOrEqual(1);
  });

  it('M22 GB5: a mesh of another size is refused', () => {
    expect(() => warp(ramp(10, 10), restMesh(10, 10).slice(1))).toThrow(/16/);
  });

  it('M22 GB5: a mask is warped as well', () => {
    const m = fillRect(createMask(30, 30), all(30, 30), 255);
    const out = warp(
      m,
      restMesh(30, 30).map((p) => ({ x: p.x * 0.5, y: p.y })),
    );
    expect(pixelAt(out, 5, 15)).toBe(255);
    expect(pixelAt(out, 25, 15)).toBe(0);
  });
});

describe('M22 GB5: the distortions at their edges', () => {
  it('M22 GB5: a circle wholly off the layer changes nothing', () => {
    const r = ramp(20, 20);
    expect(twirl(r, { centre: { x: 500, y: 500 }, radius: 30, angle: 90 })).toBe(r);
  });

  it('M22 GB5: corners or mesh points that are not numbers, or not four, are refused', () => {
    expect(cornersProblem([{ x: 0, y: 0 }])).toMatch(/four corners/);
    expect(
      cornersProblem([
        { x: 0, y: 0 },
        { x: 1, y: Number.NaN },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]),
    ).toMatch(/four corners/);
    const mesh = restMesh(10, 10);
    mesh[3] = { x: Number.NaN, y: 0 };
    expect(meshProblem(mesh)).toMatch(/X and a Y/);
  });

  it('M22 GB5: a mesh squeezed to one point draws nothing (each triangle is flat)', () => {
    const m = fillRect(createMask(12, 12), all(12, 12), 255);
    const out = warp(
      m,
      restMesh(12, 12).map(() => ({ x: 5, y: 5 })),
    );
    expect(pixelAt(out, 5, 5)).toBe(0);
  });

  it('M22 GB5: a perspective whose horizon crosses the layer draws nothing beyond it', () => {
    // The top pulled in almost to a point: the far side's horizon is just above the layer.
    const r = fillRect(createMask(40, 40), all(40, 40), 255);
    const out = perspective(r, [
      { x: 19.5, y: 0 },
      { x: 20.5, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]);
    expect(pixelAt(out, 20, 30)).toBe(255);
    expect(pixelAt(out, 2, 2)).toBe(0);
  });
});
