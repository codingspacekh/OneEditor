// GT3 (M20): text in a shape — the lines wrap inside any closed outline (a rectangle, an ellipse,
// a polygon, a star, a pen path; its holes left empty), `padding` px in from it, as Illustrator's
// area type and CorelDRAW's "fit text in frame". Line by line from the top: the room across the
// shape for the line's band (where it is inside the shape all the way from the band's top to
// its bottom, and `padding` beyond), filled with whole words (a word too long for any line is
// broken), each line aligned in its room. A band with room on both sides of a hole (or of a
// notch) gets a piece of line in each. What does not fit is left out, and said: the Properties
// panel shows "Some words do not fit". Letter spacing and kerning are kept (text-layout.ts).
// Pure: the widths come from a function (a canvas in the app).
import type { Point } from '../animation/geometry.ts';
import { flattenCurves } from '../animation/path.ts';
import { layoutText, type PlacedLetter, type WidthOf } from '../animation/text-layout.ts';
import type { TextObject, TextShape } from '../animation/types.ts';

type InShape = Pick<TextObject, 'text' | 'size' | 'align'> &
  Partial<Pick<TextObject, 'letterSpacing' | 'kerning' | 'lineSpacing'>> & { inShape: TextShape };

/** From x to x, across. */
export type Span = [number, number];

export interface ShapeSetting {
  letters: PlacedLetter[];
  /** How much of the text is set, from its start (its length when it all fits). */
  fitted: number;
}

/** Where a line across at `y` is inside the outlines (filled even-odd: holes are outside). */
export function spansAt(rings: readonly (readonly Point[])[], y: number): Span[] {
  const xs: number[] = [];
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  xs.sort((p, q) => p - q);
  const spans: Span[] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i]!, xs[i + 1]!]);
  return spans;
}

/** Where both lists of spans are. */
function common(a: readonly Span[], b: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const [l1, r1] of a)
    for (const [l2, r2] of b) {
      const l = Math.max(l1, l2);
      const r = Math.min(r1, r2);
      if (r > l) out.push([l, r]);
    }
  return out.sort((p, q) => p[0] - q[0]);
}

/** A word: where it is in the text, so its kerning goes with it. */
interface Word {
  start: number;
  end: number;
}

/** The paragraphs (lines typed with Enter), each its words, and where it ends in the text. */
function paragraphsOf(text: string): { words: Word[]; end: number }[] {
  let at = 0;
  return text.split('\n').map((line) => {
    const words = [...line.matchAll(/\S+/g)].map((m) => ({
      start: at + m.index,
      end: at + m.index + m[0].length,
    }));
    at += line.length + 1;
    return { words, end: Math.min(text.length, at) };
  });
}

/** How far apart the band's lines across are looked at, in px. */
const LOOK_EVERY = 2;
const NUDGE = 0.01;

/**
 * GT3: the letters of a text set in its shape (spaces left out), each the middle of its
 * line-high cell in the text's box, upright; and how much of the text fits.
 */
export function shapeText(t: InShape, widthOf: WidthOf): ShapeSetting {
  const { padding, points, holes } = t.inShape;
  const pad = Math.max(0, padding);
  const outer = flattenCurves(points, true);
  const rings = [outer, ...(holes ?? []).map((h) => flattenCurves(h, true))];
  if (outer.length < 3) return { letters: [], fitted: 0 };
  const ys = outer.map((p) => p.y);
  const xs = outer.map((p) => p.x);
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  const widest = Math.max(...xs) - Math.min(...xs) - 2 * pad;
  const lh = layoutText({ ...t, text: '' }, widthOf).lineHeight;

  /** The room for a line from y0 to y1: inside all the way down, and `padding` beyond. */
  const room = (y0: number, y1: number): Span[] => {
    const lo = y0 - pad;
    const hi = y1 + pad;
    const n = Math.max(1, Math.min(64, Math.ceil((hi - lo) / LOOK_EVERY)));
    let spans: Span[] | null = null;
    for (let i = 0; i <= n; i++) {
      const y = lo + ((hi - lo) * i) / n + (i === 0 ? NUDGE : i === n ? -NUDGE : 0);
      const here = spansAt(rings, y);
      spans = spans === null ? here : common(spans, here);
      if (spans.length === 0) return [];
    }
    return (spans ?? []).map(([l, r]): Span => [l + pad, r - pad]).filter(([l, r]) => r - l > 0);
  };

  /** The letters from `start` to `end` of the text laid out as one line. */
  const run = (start: number, end: number) =>
    layoutText(
      {
        ...t,
        text: t.text.slice(start, end),
        align: 'left',
        ...(t.kerning ? { kerning: t.kerning.slice(start, end) } : {}),
      },
      widthOf,
    );

  const letters: PlacedLetter[] = [];
  const place = (start: number, end: number, [left, right]: Span, y: number) => {
    const laid = run(start, end);
    const x =
      t.align === 'left'
        ? left
        : t.align === 'centre'
          ? left + (right - left - laid.width) / 2
          : right - laid.width;
    for (const c of laid.cells)
      if (c.char.trim() !== '')
        letters.push({
          char: c.char,
          x: x + c.x + c.width / 2,
          y: y + lh / 2,
          angle: 0,
          width: c.width,
        });
  };

  const paragraphs = paragraphsOf(t.text);
  let p = 0;
  let words = [...(paragraphs[0]?.words ?? [])];
  let fitted = 0;
  let started = false;
  let y = top + pad;
  while (p < paragraphs.length && lh > 0 && y + lh + pad <= bottom + NUDGE) {
    const spans = room(y, y + lh);
    let placed = false;
    if (words.length === 0 && spans.length > 0) placed = true; // a blank line takes a band
    for (const span of spans) {
      if (words.length === 0) break;
      const space = span[1] - span[0];
      let n = 0;
      while (n < words.length && run(words[0]!.start, words[n]!.end).width <= space + NUDGE) n++;
      if (n > 0) {
        place(words[0]!.start, words[n - 1]!.end, span, y);
        fitted = words[n - 1]!.end;
        words = words.slice(n);
        placed = true;
        continue;
      }
      // A word longer than any line could be is broken where the room ends.
      const word = words[0]!;
      if (run(word.start, word.end).width <= widest) continue;
      const chars = [...t.text.slice(word.start, word.end)];
      let end = word.start;
      for (const ch of chars) {
        if (run(word.start, end + ch.length).width > space + NUDGE) break;
        end += ch.length;
      }
      if (end === word.start) continue;
      place(word.start, end, span, y);
      fitted = end;
      words = [{ start: end, end: word.end }, ...words.slice(1)];
      placed = true;
    }
    if (words.length === 0 && (placed || paragraphs[p]!.words.length > 0)) {
      fitted = paragraphs[p]!.end;
      p++;
      words = [...(paragraphs[p]?.words ?? [])];
    }
    if (placed) started = true;
    // Until the first line is set, look a little lower each time (a pointed or round top).
    y += started ? lh : lh / 8;
  }
  return { letters, fitted };
}

/** GT3: how many letters (spaces not counted) do not fit in the shape. */
export function lettersLeftOut(t: InShape, widthOf: WidthOf): number {
  const { fitted } = shapeText(t, widthOf);
  return [...t.text.slice(fitted)].filter((c) => c.trim() !== '').length;
}
