// GT3 (M20): text in a shape — the lines wrap inside any closed outline (a rectangle, an ellipse,
// a polygon, a pen path, with its holes), `padding` px in from it, each line aligned in the room
// it has there; what does not fit is left out and said, for the Properties hint.
import { describe, expect, it } from 'vitest';
import { ellipseAnchors } from '../../../../src/core/graphics/bezier.ts';
import { lettersLeftOut, shapeText, spansAt } from '../../../../src/core/graphics/text-shape.ts';
import { placeLetters } from '../../../../src/core/animation/letters-placed.ts';
import { createText } from '../../../../src/core/animation/factory.ts';
import type { PathPoint, TextObject, TextShape } from '../../../../src/core/animation/types.ts';

/** Every letter 10 px wide; lines 24 px high (20 px × 1.2). */
const widthOf = (s: string) => s.length * 10;
const size = 20;

const box = (w: number, h: number, x = 0, y = 0): PathPoint[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const inside = (points: PathPoint[], over: Partial<TextShape> = {}): TextShape => ({
  points,
  padding: 0,
  ...over,
});

const set = (text: string, shape: TextShape, over: Partial<TextObject> = {}) => ({
  text,
  size,
  align: 'left' as const,
  inShape: shape,
  ...over,
});

const lines = (letters: { char: string; y: number }[]) => {
  const rows = new Map<number, string>();
  for (const l of letters) rows.set(l.y, (rows.get(l.y) ?? '') + l.char);
  return [...rows.values()];
};

describe('GT3: the room across a shape', () => {
  it('finds where a line across is inside the outline, and leaves out its holes', () => {
    expect(spansAt([box(100, 100)], 50)).toEqual([[0, 100]]);
    expect(spansAt([box(100, 100)], 150)).toEqual([]);
    expect(spansAt([box(100, 100), box(20, 100, 40)], 50)).toEqual([
      [0, 40],
      [60, 100],
    ]);
  });
});

describe('GT3: lines wrapped in a shape', () => {
  it('wraps whole words in a rectangle, line by line from its top', () => {
    const out = shapeText(set('AAA BBB CCC DDD', inside(box(100, 100))), widthOf);
    expect(lines(out.letters)).toEqual(['AAABBB', 'CCCDDD']);
    expect(out.letters.slice(0, 4).map((l) => [l.x, l.y, l.angle])).toEqual([
      [5, 12, 0],
      [15, 12, 0],
      [25, 12, 0],
      [45, 12, 0],
    ]);
    expect(out.letters[6]!.y).toBe(36);
    expect(out.fitted).toBe(15);
  });

  it('aligns each line in its room: centred and right', () => {
    const centre = shapeText(set('AAA', inside(box(100, 100)), { align: 'centre' }), widthOf);
    expect(centre.letters.map((l) => l.x)).toEqual([40, 50, 60]);
    const right = shapeText(set('AAA', inside(box(100, 100)), { align: 'right' }), widthOf);
    expect(right.letters.map((l) => l.x)).toEqual([75, 85, 95]);
  });

  it('keeps padding px in from every side', () => {
    const out = shapeText(set('AAA BBB', inside(box(100, 100), { padding: 10 })), widthOf);
    // 80 px across: AAA BBB is 70 px, starting 10 px in and 10 px down.
    expect(out.letters[0]).toMatchObject({ x: 15, y: 22 });
    expect(lines(out.letters)).toEqual(['AAABBB']);
  });

  it('breaks a word too long for any line, keeps new lines and blank lines', () => {
    const long = shapeText(set('ABCDEFGHIJ', inside(box(50, 100))), widthOf);
    expect(lines(long.letters)).toEqual(['ABCDE', 'FGHIJ']);
    const paras = shapeText(set('A\n\nB', inside(box(100, 100))), widthOf);
    expect(paras.letters.map((l) => [l.char, l.y])).toEqual([
      ['A', 12],
      ['B', 60],
    ]);
  });

  it('fills the room on each side of a hole', () => {
    const ring = inside(box(200, 100), { holes: [box(40, 100, 80)] });
    const out = shapeText(set('AAA BBB CCC', ring), widthOf);
    expect(lines(out.letters)).toEqual(['AAABBBCCC']);
    expect(out.letters.find((l) => l.char === 'C')!.x).toBe(125);
  });

  it('starts lower where a pointed top is too narrow for the first word', () => {
    const triangle = [
      { x: 50, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const out = shapeText(set('ABCD', inside(triangle)), widthOf);
    expect(out.letters).toHaveLength(4);
    // 40 px wide is first found 80 px up from the bottom: the line's top at least 40 px down.
    expect(out.letters[0]!.y - 12).toBeGreaterThanOrEqual(40);
  });

  it('keeps every letter inside an ellipse, and says what is left out', () => {
    const words =
      'Text set in a circle wraps line by line inside its outline until it is full. '.repeat(2);
    const circle = inside(ellipseAnchors(160, 160).points, { padding: 4 });
    const out = shapeText(set(words, circle, { align: 'centre' }), widthOf);
    for (const l of out.letters)
      for (const [dx, dy] of [
        [-5, -12],
        [5, -12],
        [5, 12],
        [-5, 12],
      ])
        expect(Math.hypot(l.x + dx! - 80, l.y + dy! - 80)).toBeLessThanOrEqual(80);
    expect(out.fitted).toBeLessThan(words.length);
    expect(lettersLeftOut(set(words, circle), widthOf)).toBeGreaterThan(0);
    expect(lettersLeftOut(set('Fits', circle), widthOf)).toBe(0);
  });

  it('keeps letter spacing and kerning in the lines', () => {
    const out = shapeText(set('AB CD', inside(box(200, 100)), { letterSpacing: 500 }), widthOf);
    // 10 px after each letter: A 0, B 20, space 40, C 60, D 80.
    expect(out.letters.map((l) => l.x)).toEqual([5, 25, 65, 85]);
    const kerned = shapeText(
      set('AB CD', inside(box(200, 100)), { kerning: [0, 0, 0, -250] }),
      widthOf,
    );
    expect(kerned.letters.map((l) => l.x)).toEqual([5, 15, 35, 40]);
  });

  it('sets nothing in a shape of no room', () => {
    expect(shapeText(set('A', inside(box(5, 5))), widthOf)).toEqual({ letters: [], fitted: 0 });
    expect(shapeText(set('A', inside([{ x: 0, y: 0 }])), widthOf).letters).toEqual([]);
  });
});

describe('GT3: placeLetters for text in a shape', () => {
  it('places the letters of a text object in its shape', () => {
    const t = { ...createText('AB CD', { x: 0, y: 0 }), size, inShape: inside(box(30, 100)) };
    expect(placeLetters(t as TextObject, widthOf)).toEqual(shapeText(t, widthOf).letters);
  });
});
