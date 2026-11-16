// GT1 (M20): where each letter of a text object goes — the one layout behind straight text with
// letter spacing and kerning, line spacing, curved text (AN26), text on a path (GT2), in a shape
// (GT3) and text to curves (GT4). Spacing is in thousandths of an em (as Illustrator's and
// Photoshop's tracking), so it grows with the letters; widths come from a function (a canvas in
// the app), and a line's own widths are kept, so the font's own kerning pairs stay.
import { describe, expect, it } from 'vitest';
import { curvedText } from '../../../../src/core/animation/curve.ts';
import {
  hasLetterSpacing,
  layoutText,
  lineHeightOf,
  trackingPx,
} from '../../../../src/core/animation/text-layout.ts';

/** Every letter 10 px wide, but "AV" together 18 px (the font's own kerning pair). */
const widthOf = (s: string) => s.length * 10 - (s.match(/AV/g)?.length ?? 0) * 2;

const text = (over: Record<string, unknown> = {}) => ({
  text: 'AB',
  size: 50,
  align: 'left' as const,
  ...over,
});

describe('GT1: the letter layout', () => {
  it('places each letter where the line measures it, without spacing as before', () => {
    const l = layoutText(text({ text: 'AVB' }), widthOf);
    expect(l.cells.map((c) => [c.char, c.x, c.width])).toEqual([
      ['A', 0, 10],
      ['V', 8, 10],
      ['B', 18, 10],
    ]);
    expect(l.width).toBe(28);
    expect(l.lineHeight).toBe(60);
    expect(l.height).toBe(60);
  });

  it('letter spacing adds thousandths of an em after every letter but the last', () => {
    // 100 / 1000 of a 50 px em = 5 px.
    expect(trackingPx({ size: 50, letterSpacing: 100 })).toBe(5);
    const l = layoutText(text({ text: 'ABC', letterSpacing: 100 }), widthOf);
    expect(l.cells.map((c) => c.x)).toEqual([0, 15, 30]);
    expect(l.width).toBe(40);
    // Negative tightens.
    expect(layoutText(text({ text: 'ABC', letterSpacing: -200 }), widthOf).width).toBe(10);
  });

  it('kerning moves the letters after one gap; kerning[i] is after the i-th character of the text', () => {
    const l = layoutText(text({ text: 'AB\nCD', kerning: [200, 0, 0, -100] }), widthOf);
    expect(l.cells.map((c) => [c.char, c.line, c.x])).toEqual([
      ['A', 0, 0],
      ['B', 0, 20],
      ['C', 1, 0],
      ['D', 1, 5],
    ]);
    expect(l.lineWidths).toEqual([30, 15]);
    // The index counts the new line, so each letter knows where it is in the text.
    expect(l.cells.map((c) => c.index)).toEqual([0, 1, 3, 4]);
  });

  it('line spacing is the line height in times the size (absent: 1.2)', () => {
    expect(lineHeightOf({ size: 50 })).toBe(60);
    expect(lineHeightOf({ size: 50, lineSpacing: 2 })).toBe(100);
    const l = layoutText(text({ text: 'A\nB', lineSpacing: 2 }), widthOf);
    expect(l.cells.map((c) => c.y)).toEqual([0, 100]);
    expect(l.height).toBe(200);
  });

  it('aligns each line in the widest: left, centre, right', () => {
    const at = (align: 'left' | 'centre' | 'right') =>
      layoutText(text({ text: 'ABCD\nAB', align }), widthOf).cells.at(-2)!.x;
    expect([at('left'), at('centre'), at('right')]).toEqual([0, 10, 20]);
  });

  it('says when letters must be placed one by one (spacing or kerning)', () => {
    expect(hasLetterSpacing({})).toBe(false);
    expect(hasLetterSpacing({ letterSpacing: 0, kerning: [0, 0] })).toBe(false);
    expect(hasLetterSpacing({ letterSpacing: 20 })).toBe(true);
    expect(hasLetterSpacing({ kerning: [0, -40] })).toBe(true);
  });

  it('an empty line has no letters but its height', () => {
    const l = layoutText(text({ text: 'A\n\nB' }), widthOf);
    expect(l.cells.map((c) => c.line)).toEqual([0, 2]);
    expect(l.height).toBe(180);
    expect(layoutText(text({ text: '' }), widthOf)).toMatchObject({ width: 0, cells: [] });
  });
});

describe('AN26 curved text with GT1 spacing', () => {
  it('is unchanged without spacing, and spaced letters spread further round the arc', () => {
    const plain = curvedText({ text: 'ABCDE', size: 40, align: 'centre', curve: 50 }, widthOf);
    const spaced = curvedText(
      { text: 'ABCDE', size: 40, align: 'centre', curve: 50, letterSpacing: 300 },
      widthOf,
    );
    const turn = (c: typeof plain) => c.letters.at(-1)!.angle - c.letters[0]!.angle;
    // The curve sets the sweep of the whole line, so the spaced letters reach a little further round.
    expect(turn(spaced)).toBeGreaterThan(turn(plain));
    expect(spaced.width).toBeGreaterThan(plain.width);
    const flat = curvedText(
      { text: 'AB', size: 40, align: 'left', curve: 0, lineSpacing: 2 },
      widthOf,
    );
    expect(flat.height).toBe(80);
  });
});
