// M22 step 3 (GB5, D8): the heal brush's known answers — a copy from a darker flat area onto a
// lighter one ends within a few levels of the lighter (where the clone alone is 60 levels out),
// the source's texture kept; the membrane through a border's values is smooth (a linear ramp
// stays a ramp); the selection's outside and a transparent destination have no say; a mask heals
// on its one channel; the border's noise is averaged away.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRUSH,
  createStroke,
  type StrokeWeights,
} from '../../../../../src/core/graphics/pixels/brush.ts';
import {
  healStroke,
  healedSource,
  smoothKnown,
  solveMembrane,
} from '../../../../../src/core/graphics/pixels/heal.ts';
import { clonePainter, rasterSource } from '../../../../../src/core/graphics/pixels/retouch.ts';
import {
  bitmapFromRGBA,
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Bitmap,
  type Mask,
  type Raster,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import {
  ellipsePoints,
  featherMask,
  polygonMask,
} from '../../../../../src/core/graphics/pixels/selection.ts';

/** Left half grey 100 with a ±10 texture, right half flat 160 (a brightness step), opaque. */
function step(width = 200, height = 120): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = x < width / 2 ? 100 + ((x * 7 + y * 13) % 3) * 10 - 10 : 160;
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  return bitmapFromRGBA(width, height, data);
}

/** A stroke of the clone painter along a line, then healed; the clone alone too. */
function heal(
  target: Raster,
  offset: { dx: number; dy: number },
  points: { x: number; y: number }[],
  size = 30,
  selection?: Mask,
) {
  const src = rasterSource(target);
  const s = createStroke(
    {
      target,
      x: 0,
      y: 0,
      brush: { ...DEFAULT_BRUSH, size, hardness: 50, pressureSize: false },
      colour: [0, 0, 0],
      painter: clonePainter(src, { x: 0, y: 0 }, offset, target.channels),
      ...(selection ? { selection } : {}),
    },
    points[0]!,
  );
  for (const p of points.slice(1)) s.to(p);
  const cloned = s.result();
  const healed = healStroke(target, { x: 0, y: 0 }, src, offset, s.weights()!, selection);
  s.repaint(clonePainter(healedSource(healed), { x: 0, y: 0 }, { dx: 0, dy: 0 }, target.channels));
  return { cloned, healed: s.result(), weights: s.weights()! };
}

const grey = (r: Raster, x: number, y: number): number =>
  r.channels === 4 ? pixelAt(r as Bitmap, x, y)[0] : (pixelAt(r as Mask, x, y) as number);

describe('M22 GB5: the heal brush', () => {
  it('matches a copy from a darker area to the lighter area round the stroke', () => {
    const b = step();
    const { cloned, healed } = heal(b, { dx: -90, dy: 0 }, [
      { x: 140, y: 40 },
      { x: 160, y: 80 },
    ]);
    // The clone alone is the dark texture: about 60 levels out.
    expect(Math.abs(grey(cloned, 150, 60) - 160)).toBeGreaterThan(40);
    // Healed: within a few levels of 160 all along the stroke, and the texture kept.
    const values: number[] = [];
    for (let y = 45; y <= 75; y++) values.push(grey(healed, 140 + Math.round((y - 40) / 2), y));
    for (const v of values) expect(Math.abs(v - 160)).toBeLessThanOrEqual(12);
    const mean = values.reduce((a, v) => a + v, 0) / values.length;
    expect(Math.abs(mean - 160)).toBeLessThan(4);
    expect(new Set(values).size).toBeGreaterThan(1);
    // The pixels round the stroke are their own.
    expect(grey(healed, 110, 10)).toBe(160);
  });

  it('a membrane through a ramp’s border values is the ramp', () => {
    const w = 30;
    const h = 20;
    const state = new Uint8Array(w * h).fill(1);
    const values = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        values[p] = 3 * x;
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
          state[p] = 2;
          values[p] = 0;
        }
      }
    solveMembrane(w, h, state, values, 1);
    for (const [x, y] of [
      [5, 5],
      [15, 10],
      [27, 17],
    ])
      expect(values[y! * w + x!]).toBeCloseTo(3 * x!, 0);
  });

  it('solves big boxes coarse to fine, and does nothing with nothing inside', () => {
    const w = 120;
    const h = 90;
    const state = new Uint8Array(w * h);
    const values = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        state[y * w + x] = edge ? 1 : 2;
        values[y * w + x] = edge ? 50 : 0;
      }
    solveMembrane(w, h, state, values, 1);
    expect(values[45 * w + 60]).toBeCloseTo(50, 0);
    const none = new Float32Array([1, 2]);
    solveMembrane(2, 1, new Uint8Array([1, 1]), none, 1);
    expect([...none]).toEqual([1, 2]);
  });

  it('a point with no neighbour that has a say keeps its first guess', () => {
    const values = new Float32Array([0, 0, 0]);
    solveMembrane(3, 1, new Uint8Array([0, 2, 0]), values, 1);
    expect([...values]).toEqual([0, 0, 0]);
  });

  it('outside the selection has no say: a dark neighbour is not borrowed', () => {
    // Light 160 everywhere, a dark 20 bar at x 100–109; the source a 100 area below.
    const data = new Uint8ClampedArray(200 * 160 * 4);
    for (let y = 0; y < 160; y++)
      for (let x = 0; x < 200; x++) {
        const v = y >= 90 ? 100 : x >= 100 && x < 110 ? 20 : 160;
        data.set([v, v, v, 255], (y * 200 + x) * 4);
      }
    const b = bitmapFromRGBA(200, 160, data);
    const selection = fillRect(createMask(200, 160), { x: 110, y: 0, width: 90, height: 90 }, 255);
    const line = [
      { x: 112, y: 30 },
      { x: 112, y: 60 },
    ];
    const kept = heal(b, { dx: 0, dy: 75 }, line, 20, selection).healed;
    expect(Math.abs(grey(kept, 113, 45) - 160)).toBeLessThan(6);
    // B5 (benchmark): without the selection the dark bar's border is a stray (far out of line
    // with the rest of the border) and is not borrowed either.
    const unselected = heal(b, { dx: 0, dy: 75 }, line, 20).healed;
    expect(Math.abs(grey(unselected, 113, 45) - 160)).toBeLessThan(6);
  });

  it('a transparent destination round the stroke has no say', () => {
    const b = fillRect(
      fillRect(createBitmap(100, 60), { x: 0, y: 0, width: 50, height: 60 }, [90, 90, 90, 255]),
      { x: 50, y: 0, width: 40, height: 60 },
      [150, 150, 150, 255],
    );
    // The stroke reaches the transparent band at x ≥ 90: only the 150 side has a say.
    const { healed } = heal(
      b,
      { dx: -40, dy: 0 },
      [
        { x: 82, y: 20 },
        { x: 82, y: 40 },
      ],
      16,
    );
    expect(Math.abs(grey(healed, 82, 30) - 150)).toBeLessThan(5);
  });

  it('heals a layer mask on its one channel', () => {
    const m = fillRect(
      fillRect(createMask(120, 60), { x: 0, y: 0, width: 60, height: 60 }, 80),
      { x: 60, y: 0, width: 60, height: 60 },
      200,
    );
    const { healed } = heal(m, { dx: -55, dy: 0 }, [
      { x: 90, y: 20 },
      { x: 90, y: 40 },
    ]);
    expect(Math.abs(grey(healed, 90, 30) - 200)).toBeLessThan(4);
  });

  it('refuses a source of other channels than the layer', () => {
    const w: StrokeWeights = { x: 0, y: 0, width: 1, height: 1, values: new Float32Array([1]) };
    expect(() =>
      healStroke(
        createBitmap(4, 4),
        { x: 0, y: 0 },
        rasterSource(createMask(4, 4)),
        { dx: 0, dy: 0 },
        w,
      ),
    ).toThrow('differ');
  });

  it('a healed source reads zero outside its box', () => {
    const src = healedSource({
      x: 2,
      y: 2,
      width: 1,
      height: 1,
      channels: 1,
      data: new Uint8ClampedArray([9]),
    });
    const px = new Uint8ClampedArray(1);
    src.read(2, 2, px, 0);
    expect(px[0]).toBe(9);
    src.read(3, 2, px, 0);
    expect(px[0]).toBe(0);
  });

  it('the border’s values are averaged over the known points near them', () => {
    // A row: known 0, 10, 20 | inside | known 100.
    const state = new Uint8Array([1, 1, 1, 2, 1]);
    const values = new Float32Array([0, 10, 20, 0, 100]);
    smoothKnown(5, 1, state, values, 1, 1);
    expect([...values]).toEqual([5, 10, 15, 0, 100]);
  });
});

/**
 * A sky: brighter to the right and lower down (the clone source, 150 px right, is lighter than
 * the destination), with a dark balloon (a disc, r 40) at (200, 150) and a white cloud edge
 * (x ≥ 330, y < 120) where a big brush's border can reach it.
 */
const skyAt = (x: number, y: number) => 110 + 0.2 * y + 0.12 * x;
function skyWithBalloon(cloud = false): Bitmap {
  const w = 600;
  const h = 300;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inBalloon = (x - 200) ** 2 + (y - 150) ** 2 < 40 ** 2;
      const v = inBalloon ? 40 : cloud && x >= 330 && y < 120 ? 250 : skyAt(x, y);
      data.set([v, v * 0.95, v * 1.05, 255], (y * w + x) * 4);
    }
  return bitmapFromRGBA(w, h, data);
}

/** Back and forth over a box, half a brush apart. */
function zig(x: number, y: number, w: number, h: number, size: number) {
  const out: { x: number; y: number }[] = [];
  for (let row = 0, yy = y; yy <= y + h; row++, yy += size / 2)
    out.push(
      ...(row % 2
        ? [
            { x: x + w, y: yy },
            { x, y: yy },
          ]
        : [
            { x, y: yy },
            { x: x + w, y: yy },
          ]),
    );
  return out;
}

describe('benchmark J/22 Scene2: the heal over a balloon on a sky', () => {
  it('B4: inside a feathered selection that the strokes cover wholly, no lighter disc and no rim', () => {
    const b = skyWithBalloon();
    // An ellipse well round the balloon, feathered 12 px (as the paper's student would select).
    const selection = featherMask(
      polygonMask(600, 300, [ellipsePoints({ x: 130, y: 80, width: 140, height: 140 })]),
      12,
    );
    // The strokes scrub over the whole selection and beyond; the source 150 px to the right.
    const { healed } = heal(b, { dx: 150, dy: 0 }, zig(110, 60, 180, 180, 60), 60, selection);
    // Where the balloon was: the sky that would be there, within a few levels (not lighter).
    for (const [x, y] of [
      [200, 150],
      [180, 130],
      [220, 170],
    ])
      expect(Math.abs(grey(healed, x!, y!) - skyAt(x!, y!))).toBeLessThan(5);
    // Round the selection's soft edge (r 60–90 from the middle): no step from the sky.
    let worst = 0;
    for (let a = 0; a < 360; a += 10)
      for (let r = 60; r <= 90; r += 3) {
        const x = Math.round(200 + r * Math.cos((a * Math.PI) / 180));
        const y = Math.round(150 + r * Math.sin((a * Math.PI) / 180));
        worst = Math.max(worst, Math.abs(grey(healed, x, y) - skyAt(x, y)));
      }
    expect(worst).toBeLessThan(5);
  });

  it('B5: a 250 px brush whose source border lies on the balloon does not glare', () => {
    const b = skyWithBalloon();
    // The strokes cover the balloon with a big brush; the source is 150 px right, so the copy at
    // the stroke's left border is the dark balloon itself (as on Scene1 with the source 660 px
    // right and a 250 px brush): that border's difference is a stray.
    const { healed } = heal(b, { dx: 150, dy: 0 }, zig(150, 110, 100, 80, 250), 250);
    let worst = 0;
    for (let y = 100; y < 200; y += 4)
      for (let x = 40; x < 160; x += 4) worst = Math.max(worst, grey(healed, x, y) - skyAt(x, y));
    // No glare: nowhere more than a little lighter than the sky that belongs there.
    expect(worst).toBeLessThan(25);
  });
});
