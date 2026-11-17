// AN4: a text object's box is the size of its words on screen, measured with the bundled font
// (the drawing uses the same font string). Without a canvas (tests) the rough estimate stays.
import { curvedText, curveOf } from '../../core/animation/curve.ts';
import { fontOf } from '../../core/animation/draw.ts';
import { roughTextWidth } from '../../core/animation/factory.ts';
import { hasLetterSpacing, layoutText, lineHeightOf } from '../../core/animation/text-layout.ts';
import type { TextObject } from '../../core/animation/types.ts';

export interface Measurer {
  font: string;
  measureText(text: string): { width: number };
}

let shared: Measurer | null | undefined;

function sharedMeasurer(): Measurer | null {
  if (shared !== undefined) return shared;
  shared =
    typeof document === 'undefined'
      ? null
      : (document.createElement('canvas').getContext('2d') as Measurer | null);
  return shared;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The box that fits the words: the widest line, and a line height per line (1.2 times the size,
 * or its line spacing, GT1). AN26: curved words, the bounds of their letters on the arc. GT1: with
 * letter spacing or kerning, the widest line as the letter layout spaces it.
 */
export function textBox(
  t: TextObject,
  ctx: Measurer | null = sharedMeasurer(),
): { width: number; height: number } {
  // GT2, GT3 (M20): on a path or in a shape the box is the outline's, whatever the words.
  if (t.path || t.inShape) return { width: t.width, height: t.height };
  if (curveOf(t) !== 0) {
    if (ctx) ctx.font = fontOf(t);
    const bent = curvedText(t, (s) => (ctx ? ctx.measureText(s).width : roughTextWidth(s, t.size)));
    return { width: round(Math.max(1, bent.width)), height: round(Math.max(1, bent.height)) };
  }
  const lines = t.text.split('\n');
  const height = round(Math.max(1, lines.length) * lineHeightOf(t));
  if (hasLetterSpacing(t)) {
    if (ctx) ctx.font = fontOf(t);
    const laid = layoutText(t, (s) => (ctx ? ctx.measureText(s).width : roughTextWidth(s, t.size)));
    return { width: round(Math.max(1, laid.width)), height };
  }
  if (!ctx) return { width: round(roughTextWidth(t.text, t.size)), height };
  ctx.font = fontOf(t);
  const width = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
  return { width: round(width), height };
}
