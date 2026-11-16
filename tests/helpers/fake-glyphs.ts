// GT4, GT5 (M20): a stand-in for the fonts' outlines. Every letter is a square 0.4 em wide and
// 0.7 em tall standing on the baseline 0.1 em from its left, with a square counter (as an "o");
// "i" is a stem and a separate dot, "-" a bar drawn with a quadratic and a cubic curve. Every
// letter moves the pen 0.6 em; the baseline is 0.8 em below the em box's top.
import type { FontGlyphs, GlyphCommand, GlyphSource } from '../../src/core/graphics/glyphs.ts';

const square = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  reverse = false,
): GlyphCommand[] => {
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  if (reverse) corners.reverse();
  return [
    { type: 'M', x: corners[0]![0]!, y: corners[0]![1]! },
    ...corners.slice(1).map(([x, y]) => ({ type: 'L' as const, x: x!, y: y! })),
    // Back to the start, as font files often draw it.
    { type: 'L', x: corners[0]![0]!, y: corners[0]![1]! },
    { type: 'Z' },
  ];
};

export const FAKE_ADVANCE = 0.6;
export const FAKE_TOP = 0.8;

export const fakeGlyphs: FontGlyphs = {
  top: FAKE_TOP,
  advance: (_c, size) => FAKE_ADVANCE * size,
  outline(c, size) {
    const s = (v: number) => v * size;
    if (c.trim() === '') return [];
    if (c === 'i')
      return [
        ...square(s(0.25), s(-0.5), s(0.35), 0),
        ...square(s(0.25), s(-0.7), s(0.35), s(-0.6)),
      ];
    if (c === '-')
      return [
        { type: 'M', x: s(0.1), y: s(-0.3) },
        { type: 'Q', x1: s(0.3), y1: s(-0.4), x: s(0.5), y: s(-0.3) },
        { type: 'C', x1: s(0.5), y1: s(-0.2), x2: s(0.1), y2: s(-0.2), x: s(0.1), y: s(-0.3) },
        { type: 'Z' },
      ];
    return [
      ...square(s(0.1), s(-0.7), s(0.5), 0),
      ...square(s(0.2), s(-0.6), s(0.4), s(-0.1), true),
    ];
  },
};

/** A source with the fake outlines for every font but "Nowhere" (not bundled); counts its loads. */
export function fakeGlyphSource(): GlyphSource & { loads: string[] } {
  const loads: string[] = [];
  return {
    loads,
    async load(font, bold, italic) {
      loads.push(`${font}${bold ? ' bold' : ''}${italic ? ' italic' : ''}`);
      return font === 'Nowhere' ? null : fakeGlyphs;
    },
  };
}

/** Widths as the fake font sets them: 0.6 em a letter. */
export const fakeWidths = (size: number) => (s: string) => [...s].length * FAKE_ADVANCE * size;
