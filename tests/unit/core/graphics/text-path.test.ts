// GT2 (M20): text on a path — the letters follow any outline from a start %, standing outside,
// hanging inside or centred on it (M/22 Heron: "each letter halfway through the outline"),
// flipped to run the other way; letter spacing and kerning still apply. Gate tasks: M/17
// Woodlands (a hidden path), O/N/17 RockICT (the bottom of the guitar), J/18 TTS10 (a curve above
// the balloons), M/22 Heron, coursebook exam-style 2 (an arc).
import { describe, expect, it } from 'vitest';
import { ellipseAnchors } from '../../../../src/core/graphics/bezier.ts';
import {
  BASELINE,
  CAP_TOP,
  defaultStart,
  pathLetters,
  travelOf,
} from '../../../../src/core/graphics/text-path.ts';
import { placeLetters } from '../../../../src/core/animation/letters-placed.ts';
import { createText } from '../../../../src/core/animation/factory.ts';
import type { TextObject, TextPath } from '../../../../src/core/animation/types.ts';

/** Every letter 10 px wide. */
const widthOf = (s: string) => s.length * 10;
const size = 20;
// The middle of a letter's cell is 0.6 em below the top it is drawn from.
const baselineBelowMiddle = (BASELINE - 0.6) * size; // 4 px
const capTopAboveMiddle = (0.6 - CAP_TOP) * size; // 10 px

/** A straight line 200 px long from (0, 100) to (200, 100). */
const line = (over: Partial<TextPath> = {}): TextPath => ({
  points: [
    { x: 0, y: 100 },
    { x: 200, y: 100 },
  ],
  closed: false,
  start: 0,
  side: 'outside',
  ...over,
});

const on = (path: TextPath, over: Partial<TextObject> = {}) => ({
  text: 'ABC',
  size,
  align: 'left' as const,
  path,
  ...over,
});

const round = (n: number) => Math.round(n * 100) / 100;
const spots = (letters: { x: number; y: number; angle: number }[]) =>
  letters.map((l) => [round(l.x), round(l.y), round(l.angle)]);

describe('GT2: text along a line', () => {
  it('stands the letters on a line drawn left to right, from its start', () => {
    expect(spots(pathLetters(on(line()), widthOf))).toEqual([
      [5, 100 - baselineBelowMiddle, 0],
      [15, 96, 0],
      [25, 96, 0],
    ]);
  });

  it('hangs them under it inside, and runs the line through their middle when centred', () => {
    const inside = pathLetters(on(line({ side: 'inside' })), widthOf);
    expect(inside.map((l) => l.y)).toEqual([110, 110, 110].map(() => 100 + capTopAboveMiddle));
    const centred = pathLetters(on(line({ side: 'centred' })), widthOf);
    // The middle of the capitals: halfway between their tops and the baseline.
    const middle = ((BASELINE + CAP_TOP) / 2) * size - 0.6 * size;
    expect(round(centred[0]!.y)).toBe(round(100 - middle));
  });

  it('starts at the start %, centred and right-aligned words about it', () => {
    expect(pathLetters(on(line({ start: 50 })), widthOf)[0]!.x).toBe(105);
    const centre = pathLetters(on(line({ start: 50 }), { align: 'centre' }), widthOf);
    expect(centre.map((l) => round(l.x))).toEqual([90, 100, 110]);
    const right = pathLetters(on(line({ start: 100 }), { align: 'right' }), widthOf);
    expect(right.map((l) => round(l.x))).toEqual([175, 185, 195]);
  });

  it('carries letters past an open path’s end straight on, and leaves spaces out', () => {
    const past = pathLetters(on(line({ start: 95 }), { text: 'A BC' }), widthOf);
    expect(past.map((l) => l.char)).toEqual(['A', 'B', 'C']);
    expect(past.map((l) => l.x)).toEqual([195, 215, 225]);
    expect(past.every((l) => l.angle === 0)).toBe(true);
    // A start beyond 0–100 on an open path is kept to its ends.
    expect(pathLetters(on(line({ start: -20 })), widthOf)[0]!.x).toBe(5);
  });

  it('flips: from the other end, the letters on the other side, upside down', () => {
    const flipped = pathLetters(on(line({ flip: true })), widthOf);
    expect(spots(flipped)).toEqual([
      [195, 104, 180],
      [185, 104, 180],
      [175, 104, 180],
    ]);
  });

  it('keeps letter spacing and kerning along the path', () => {
    // 500 / 1000 of a 20 px em: 10 px after each letter.
    const spaced = pathLetters(on(line(), { letterSpacing: 500 }), widthOf);
    expect(spaced.map((l) => l.x)).toEqual([5, 25, 45]);
    const kerned = pathLetters(on(line(), { kerning: [-250] }), widthOf);
    expect(kerned.map((l) => l.x)).toEqual([5, 10, 20]);
  });

  it('keeps the baseline on the outline with any line spacing (letters drawn from the line top)', () => {
    // Line spacing 2: a 40 px line, the letter drawn from 20 px above its middle, its baseline
    // 16 px below that top: the middle 4 px below the outline.
    const [a] = pathLetters(on(line(), { lineSpacing: 2 }), widthOf);
    expect(a!.y).toBe(104);
  });

  it('stacks more lines away from the outline on every side', () => {
    const t = (side: TextPath['side']) =>
      pathLetters(on(line({ side }), { text: 'A\nB' }), widthOf).map((l) => round(l.y));
    // A line is 24 px high (1.2 × 20 px).
    expect(t('outside')).toEqual([96 - 24, 96]);
    expect(t('inside')).toEqual([110, 134]);
    const centred = t('centred');
    expect(round(centred[1]! - centred[0]!)).toBe(24);
    // The block's middle 3 px below the outline: the capitals' middle is 3 px above a letter's.
    expect(round((centred[0]! + centred[1]!) / 2)).toBe(103);
  });
});

describe('GT2: text round a closed shape', () => {
  const ellipse = ellipseAnchors(200, 200);
  const circle = (over: Partial<TextPath> = {}): TextPath => ({
    points: ellipse.points,
    closed: true,
    start: 75,
    side: 'outside',
    ...over,
  });

  it('M/22 Heron: centred, each letter halfway through the outline, turned with it', () => {
    const letters = pathLetters(on(circle({ side: 'centred' }), { text: 'HERON' }), widthOf);
    const up = (0.6 - (BASELINE + CAP_TOP) / 2) * size;
    for (const l of letters) {
      // The middle of the letter's capitals (`up` px up its own turn) lies on the circle.
      const r = (l.angle * Math.PI) / 180;
      const bx = l.x + Math.sin(r) * up;
      const by = l.y - Math.cos(r) * up;
      expect(Math.abs(Math.hypot(bx - 100, by - 100) - 100)).toBeLessThan(0.5);
    }
    // 75 % of a clockwise circle from the right is its top: the first letter there, upright.
    expect(round(letters[0]!.x)).toBeCloseTo(105, 0);
    expect(Math.abs(letters[0]!.angle)).toBeLessThan(4);
  });

  it('wraps round a closed outline past its start', () => {
    const letters = pathLetters(on(circle({ start: 99.9 }), { text: 'ABCDEFGH' }), widthOf);
    // Past the right of the circle, on the way down to the bottom: turned more than 90°.
    expect(letters.at(-1)!.angle).toBeGreaterThan(120);
    expect(letters.at(-1)!.x).toBeGreaterThan(150);
    expect(letters.at(-1)!.y).toBeGreaterThan(150);
  });

  it('outside is outside a shape drawn clockwise; inside is inside it', () => {
    const dist = (side: TextPath['side']) => {
      const [l] = pathLetters(on(circle({ side }), { text: 'O' }), widthOf);
      return Math.hypot(l!.x - 100, l!.y - 100);
    };
    expect(dist('outside')).toBeGreaterThan(100);
    expect(dist('inside')).toBeLessThan(100);
  });

  it('O/N/17 RockICT: flipped, the words read left to right along the bottom', () => {
    // Flipped, 75 % of the way round the other way is the bottom of the circle.
    const letters = pathLetters(
      on(circle({ flip: true, side: 'inside' }), { text: 'ROCK', align: 'centre' }),
      widthOf,
    );
    expect(letters.every((l) => l.y > 190)).toBe(true);
    expect(letters[0]!.x).toBeLessThan(letters.at(-1)!.x);
    expect(Math.abs(letters[1]!.angle)).toBeLessThan(10);
  });

  it('a flipped closed outline starts at the same point and runs the other way', () => {
    const run = travelOf({ points: ellipse.points, closed: true, flip: true });
    expect(run.points[0]).toEqual({ x: 200, y: 100 });
    // Going up first (counter-clockwise on the screen).
    expect(run.points[1]!.y).toBeLessThan(100);
  });

  it('a path of no length puts every letter at its point', () => {
    const dot = {
      ...line(),
      points: [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ],
    };
    const letters = pathLetters(on({ ...dot, side: 'centred' }), widthOf);
    expect(letters).toHaveLength(3);
    expect(letters.every((l) => l.angle === 0)).toBe(true);
  });
});

describe('GT2: a good start when the words are put on', () => {
  it('on an open path by the alignment; on a closed one over its top', () => {
    expect(defaultStart(line(), 'left')).toBe(0);
    expect(defaultStart(line(), 'centre')).toBe(50);
    expect(defaultStart(line(), 'right')).toBe(100);
    expect(defaultStart(ellipseAnchors(200, 100), 'centre')).toBeCloseTo(75, 0);
    // A square from its top-left corner clockwise: the middle of the top is 1/8 of the way.
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(defaultStart({ points: square, closed: true }, 'left')).toBe(12.5);
    expect(defaultStart({ points: [{ x: 0, y: 0 }], closed: true }, 'left')).toBe(0);
  });
});

describe('GT2: placeLetters for text on a path', () => {
  it('places the letters of a text object on its path (not curved, even with a curve)', () => {
    const t = {
      ...createText('ABC', { x: 0, y: 0 }),
      size,
      curve: 50,
      path: line(),
    } as TextObject;
    expect(placeLetters(t, widthOf)).toEqual(pathLetters({ ...t, path: t.path! }, widthOf));
  });
});
