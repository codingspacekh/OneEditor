// GT1 (M20): where each letter of a text object goes. One layout for straight text with letter
// spacing and kerning, its line spacing, curved text (AN26), text on a path (GT2), text in a
// shape (GT3) and text to curves (GT4), so the stage, every export and the SVG agree. Spacing is
// in thousandths of an em, as Illustrator's and Photoshop's tracking, so it grows and shrinks
// with the letters. A letter ends where the line up to it ends (so the font's own kerning pairs
// are kept), moved on by the spacing and kerning before it. Pure: widths come from a
// function (a canvas in the app).
import { LINE_HEIGHT } from './factory.ts';
import type { TextObject } from './types.ts';

/** How wide some words are in the text's font, in px. */
export type WidthOf = (text: string) => number;

/** One letter: its line, its left edge from the block's left and its line's top, in px. */
export interface LetterCell {
  char: string;
  /** Where it is in the text (new lines counted), for its kerning and for editing. */
  index: number;
  line: number;
  x: number;
  y: number;
  width: number;
}

export interface TextLayout {
  cells: LetterCell[];
  /** The widest line. */
  width: number;
  height: number;
  lineHeight: number;
  lineWidths: number[];
}

type Spacing = Pick<TextObject, 'letterSpacing' | 'kerning'>;
type Laid = Pick<TextObject, 'text' | 'size' | 'align'> &
  Partial<Pick<TextObject, 'letterSpacing' | 'kerning' | 'lineSpacing'>>;

/** GT1: letter spacing in px at the text's size. */
export const trackingPx = (t: Pick<TextObject, 'size' | 'letterSpacing'>): number =>
  ((t.letterSpacing ?? 0) / 1000) * t.size;

/** GT1: a line's height: its size times the line spacing (1.2 when not set). */
export const lineHeightOf = (t: Pick<TextObject, 'size' | 'lineSpacing'>): number =>
  t.size * (t.lineSpacing ?? LINE_HEIGHT);

/** GT1: whether the letters must be placed one by one (spacing or kerning set). */
export const hasLetterSpacing = (t: Spacing): boolean =>
  (t.letterSpacing ?? 0) !== 0 || (t.kerning ?? []).some((k) => k !== 0);

/** The letters of `t`, each line aligned in the widest. */
export function layoutText(t: Laid, widthOf: WidthOf): TextLayout {
  const tracking = trackingPx(t);
  const lineHeight = lineHeightOf(t);
  const kern = (i: number) => ((t.kerning?.[i] ?? 0) / 1000) * t.size;
  const lines = t.text.split('\n');
  let index = 0;
  const laid = lines.map((line, row) => {
    const chars = [...line];
    let extra = 0;
    const cells = chars.map((char, i) => {
      // Its right edge where the line up to it ends, so a kerning pair (AV) pulls it in.
      const width = widthOf(char);
      const x = (i === 0 ? 0 : widthOf(chars.slice(0, i + 1).join('')) - width) + extra;
      const cell = { char, index, line: row, x, y: row * lineHeight, width };
      if (i < chars.length - 1) extra += tracking + kern(index);
      index += char.length;
      return cell;
    });
    index += 1; // the new line
    const width = line === '' ? 0 : widthOf(line) + extra;
    return { cells, width };
  });
  const lineWidths = laid.map((l) => l.width);
  const width = Math.max(0, ...lineWidths);
  const cells = laid.flatMap(({ cells, width: w }) => {
    const shift = t.align === 'left' ? 0 : t.align === 'centre' ? (width - w) / 2 : width - w;
    return shift === 0 ? cells : cells.map((c) => ({ ...c, x: c.x + shift }));
  });
  return { cells, width, height: lines.length * lineHeight, lineHeight, lineWidths };
}
