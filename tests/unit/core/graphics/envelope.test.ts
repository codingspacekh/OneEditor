// GV4, G3 (M19): envelopes and perspective as maps of an object's box (fractions in, fractions
// out): the presets with a bend %, a custom envelope of four Bézier sides (a Coons patch), and
// perspective by four corners (projective, so straight lines stay straight).
import { describe, expect, it } from 'vitest';
import {
  BOX_CORNERS,
  bendPolyline,
  boxMap,
  cornersOf,
  ENVELOPE_PRESETS,
  envelopeMap,
  isFlat,
  moveControl,
  moveCorner,
  presetSides,
  sidesFromCorners,
  sidesOf,
  validateEnvelope,
  type Corners,
} from '../../../../src/core/graphics/envelope.ts';
import type { Envelope, EnvelopePreset } from '../../../../src/core/animation/types.ts';

const preset = (p: EnvelopePreset, bend: number): Envelope => ({ kind: 'preset', preset: p, bend });
const at = (e: Envelope, x: number, y: number) => envelopeMap(e)({ x, y });
const close = (p: { x: number; y: number }, x: number, y: number, digits = 6) => {
  expect(p.x).toBeCloseTo(x, digits);
  expect(p.y).toBeCloseTo(y, digits);
};
/** u where a cubic S-curve with control points ±k at the thirds peaks. */
const PEAK = 0.5 - Math.sqrt(3) / 6;

describe('GV4 envelope presets', () => {
  it.each(ENVELOPE_PRESETS.map((p) => [p]))('%s at 0 % leaves the box as it is', (p) => {
    const e = preset(p, 0);
    expect(isFlat(e)).toBe(true);
    for (const [x, y] of [
      [0, 0],
      [0.3, 0.7],
      [1, 1],
      [0.5, 0.5],
    ] as const)
      close(at(e, x, y), x, y);
  });

  it('arch bends the top and the bottom up, the corners staying', () => {
    const e = preset('arch', 100);
    expect(isFlat(e)).toBe(false);
    close(at(e, 0.5, 0), 0.5, -0.5);
    close(at(e, 0.5, 1), 0.5, 0.5);
    close(at(e, 0, 0), 0, 0);
    close(at(e, 1, 1), 1, 1);
    // −100 % arches down.
    close(at(preset('arch', -100), 0.5, 0), 0.5, 0.5);
  });

  it('arc bends round like a rainbow: the top’s ends drop and lean out, the bottom’s lean in', () => {
    const e = preset('arc', 100);
    close(at(e, 0.5, 0), 0.5, 0);
    close(at(e, 0, 0), -0.15, 0.5);
    close(at(e, 1, 0), 1.15, 0.5);
    close(at(e, 0, 1), 0.15, 1);
    close(at(e, 0.5, 1), 0.5, 0.5);
  });

  it('bulge pushes the top up and the bottom down; squeeze pinches the sides in', () => {
    const b = preset('bulge', 50);
    close(at(b, 0.5, 0), 0.5, -0.25);
    close(at(b, 0.5, 1), 0.5, 1.25);
    const s = preset('squeeze', 100);
    close(at(s, 0, 0.5), 0.3, 0.5);
    close(at(s, 1, 0.5), 0.7, 0.5);
    close(at(s, 0.5, 0), 0.5, 0);
  });

  it('flag waves the top and bottom (an S, the sides straight); wave waves the sides too', () => {
    const f = preset('flag', 100);
    close(at(f, PEAK, 0), PEAK, 0.25);
    close(at(f, 1 - PEAK, 0), 1 - PEAK, -0.25);
    close(at(f, PEAK, 1), PEAK, 1.25);
    close(at(f, 0, 0.5), 0, 0.5);
    const w = preset('wave', 100);
    close(at(w, 0, PEAK), 0.25, PEAK);
    close(at(w, 1, 1 - PEAK), 0.75, 1 - PEAK);
  });

  it('rise lifts the right side, the top and bottom sloping up to it', () => {
    const e = preset('rise', 100);
    close(at(e, 0, 0), 0, 0);
    close(at(e, 0, 1), 0, 1);
    close(at(e, 1, 0), 1, -0.5);
    close(at(e, 1, 1), 1, 0.5);
    expect(at(e, 0.5, 0).y).toBeCloseTo(-0.25);
  });

  it('a bend past ±100 % bends no further', () => {
    expect(presetSides('arch', 250)).toEqual(presetSides('arch', 100));
    expect(presetSides('arch', -250)).toEqual(presetSides('arch', -100));
  });
});

describe('GV4 a custom envelope of four Bézier sides', () => {
  it('starts as the box (straight sides through the thirds) and follows its sides', () => {
    const box = sidesFromCorners(BOX_CORNERS);
    const e: Envelope = { kind: 'custom', sides: box };
    expect(isFlat(e)).toBe(true);
    close(at(e, 0.25, 0.75), 0.25, 0.75);
    // The top's control points pulled up: the top bows up, the bottom stays.
    const bent = moveControl(moveControl(e, 'top', 'c1', { x: 1 / 3, y: -0.4 }), 'top', 'c2', {
      x: 2 / 3,
      y: -0.4,
    });
    expect(bent.kind).toBe('custom');
    close(at(bent, 0.5, 0), 0.5, -0.3);
    close(at(bent, 0.5, 1), 0.5, 1);
    close(at(bent, 0.5, 0.5), 0.5, 0.35);
  });

  it('a corner moved carries both sides meeting there, and their handles with it', () => {
    const e = moveCorner({ kind: 'custom', sides: sidesFromCorners(BOX_CORNERS) }, 2, {
      x: 1.2,
      y: 1.4,
    });
    if (e.kind !== 'custom') throw new Error('custom');
    expect(e.sides.right.b).toEqual({ x: 1.2, y: 1.4 });
    expect(e.sides.bottom.b).toEqual({ x: 1.2, y: 1.4 });
    close(e.sides.right.c2, 1.2, 2 / 3 + 0.4);
    close(e.sides.bottom.c2, 2 / 3 + 0.2, 1.4);
    close(at(e, 1, 1), 1.2, 1.4);
    expect(cornersOf(e)[2]).toEqual({ x: 1.2, y: 1.4 });
    // Each of the four corners: its two sides.
    for (const i of [0, 1, 3] as const) {
      const moved = moveCorner(e, i, { x: 0.5, y: 0.5 });
      expect(cornersOf(moved)[i]).toEqual({ x: 0.5, y: 0.5 });
      close(at(moved, BOX_CORNERS[i]!.x, BOX_CORNERS[i]!.y), 0.5, 0.5);
    }
  });

  it('a preset made custom keeps its shape, ready to edit', () => {
    const arch = preset('arch', 60);
    const custom: Envelope = { kind: 'custom', sides: sidesOf(arch) };
    close(at(custom, 0.4, 0.2), at(arch, 0.4, 0.2).x, at(arch, 0.4, 0.2).y);
    expect(cornersOf(arch)).toEqual(BOX_CORNERS.map((c) => ({ ...c })));
    // Dragging a preset's corner makes it a custom envelope.
    expect(moveCorner(arch, 0, { x: -0.1, y: 0 }).kind).toBe('custom');
  });
});

describe('G3 perspective by four corners', () => {
  const trapezoid: Corners = [
    { x: 0.25, y: 0 },
    { x: 0.75, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const persp = (corners: Corners): Envelope => ({ kind: 'perspective', corners });

  it('puts the corners where they are dragged, the far side smaller as a camera sees it', () => {
    const e = persp(trapezoid);
    BOX_CORNERS.forEach((c, i) => close(at(e, c.x, c.y), trapezoid[i]!.x, trapezoid[i]!.y));
    // The middle of the box is where the diagonals cross (projective), nearer the far top edge.
    close(at(e, 0.5, 0.5), 0.5, 1 / 3);
    // A straight line stays straight: points along a diagonal of the box stay on one line.
    const [p, q, r] = [at(e, 0.1, 0.1), at(e, 0.4, 0.4), at(e, 0.9, 0.9)];
    expect((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)).toBeCloseTo(0, 9);
    expect(cornersOf(e)).toEqual(trapezoid);
    expect(cornersOf(e)).not.toBe(trapezoid);
  });

  it('a corner dragged moves only that corner', () => {
    const e = moveCorner(persp(trapezoid), 1, { x: 0.9, y: -0.1 });
    expect(e).toEqual(persp([trapezoid[0], { x: 0.9, y: -0.1 }, trapezoid[2], trapezoid[3]]));
  });

  it('a parallelogram is a plain slant; the box’s own corners leave it flat', () => {
    const slant = persp([
      { x: 0.2, y: 0 },
      { x: 1.2, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    close(at(slant, 0.5, 0.5), 0.6, 0.5);
    expect(isFlat(persp([...BOX_CORNERS] as Corners))).toBe(true);
    expect(isFlat(slant)).toBe(false);
  });

  it('corners folded over (a bow-tie, a corner dragged inside, all on a line) blend instead', () => {
    const bowTie = persp([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    close(at(bowTie, 0.5, 0.5), 0.5, 0.5);
    close(at(bowTie, 1, 0), 1, 1);
    const inside = persp([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.3, y: 0.3 },
      { x: 0, y: 1 },
    ]);
    close(at(inside, 0.5, 0.5), (0 + 1 + 0.3 + 0) / 4, (0 + 0 + 0.3 + 1) / 4);
    const flat = persp([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(Number.isFinite(at(flat, 0.5, 0.5).x)).toBe(true);
  });
});

describe('GV4 the map in px, and bent polylines', () => {
  it('maps px of a box (a 0-wide box keeps its x)', () => {
    const m = boxMap(preset('arch', 100), 200, 100);
    close(m({ x: 100, y: 0 }), 100, -50);
    close(boxMap(preset('arch', 100), 0, 100)({ x: 0, y: 100 }), 0, 100);
    close(boxMap(preset('squeeze', 100), 100, 0)({ x: 0, y: 0 }), 0, 0);
  });

  it('divides long straight sides before bending them, so they bend smoothly', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ];
    const bent = bendPolyline(preset('arch', 100), 200, 100, square, true);
    expect(bent.length).toBeGreaterThanOrEqual(150);
    expect(Math.min(...bent.map((p) => p.y))).toBeCloseTo(-50, 0);
    const open = bendPolyline(preset('arch', 100), 200, 100, square.slice(0, 2), false);
    close(open.at(-1)!, 200, 0);
    expect(open).toHaveLength(51);
  });
});

describe('GV4 checks', () => {
  it('a bend is −100 to 100 %; corners and handles stay near the box', () => {
    expect(() => validateEnvelope(preset('arch', 100))).not.toThrow();
    expect(() => validateEnvelope(preset('arch', 101))).toThrow(/between −100 % and 100 %/);
    expect(() => validateEnvelope(preset('arch', Number.NaN))).toThrow(/bend/);
    const far: Envelope = {
      kind: 'perspective',
      corners: [
        { x: 0, y: 0 },
        { x: 11, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
    expect(() => validateEnvelope(far)).toThrow(/within 10 times/);
    const custom = moveControl(preset('wave', 0), 'left', 'c1', { x: Number.NaN, y: 0 });
    expect(() => validateEnvelope(custom)).toThrow(/within 10 times/);
    expect(() =>
      validateEnvelope({ kind: 'custom', sides: sidesFromCorners(BOX_CORNERS) }),
    ).not.toThrow();
  });
});
