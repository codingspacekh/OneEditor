// GT2 (M20): text on a path — the letters of a text follow any outline (an ellipse, a circle, an
// arc, a rectangle, a star, a pen path), as Illustrator's and CorelDRAW's "type on a path". The
// words are laid out as straight text (text-layout.ts: letter spacing, kerning, lines), then each
// letter's place along the line becomes a distance along the outline: it stands there, turned to
// follow the outline's direction under it. The outline is in the text's own box, so moving,
// turning and resizing the text take its path with it.
//
// - `start` % of the way along is where the words are anchored: their start (left aligned), their
//   middle (centred) or their end (right aligned). A closed outline wraps round; on an open one,
//   letters past an end carry on straight along the end's direction, so no words are lost.
// - `side`: `outside` puts the letters outside a closed shape (however it was drawn), or above an
//   open line as drawn (on the left of the way it was drawn: above a line drawn left to right);
//   `inside` puts them inside the shape, or under the line; `centred` runs the outline through
//   the middle of the letters (9626/04 M/22 Heron: "each letter halfway through the outline").
//   The letters stand on the outline where their feet face it, and hang from it by their tops
//   where their tops face it.
// - `flip` runs the letters the other way round, from the outline's other end (the start is
//   counted from that end), on the same side (G12): words inside the bottom of a circle then read
//   left to right (O/N/17 RockICT: "curved to fit the bottom of the guitar").
// - More lines stack away from the outline: on the outside the first line is the farthest out,
//   inside the first line is nearest the outline, centred the block's middle is on it.
//
// Pure: the widths come from a function (a canvas in the app).
import {
  flattenCurves,
  pathLength,
  pointAt,
  polylineOf,
  type Polyline,
} from '../animation/path.ts';
import type { Point } from '../animation/geometry.ts';
import { layoutText, type PlacedLetter, type WidthOf } from '../animation/text-layout.ts';
import type { TextObject, TextPath } from '../animation/types.ts';

/**
 * Where the letters' parts are, in sizes (ems) below the top of the em square the stage draws
 * text from: the baseline (most fonts' ascent) and the top of the capitals. A letter is drawn
 * from the top of its line-high cell (the line spacing's height), so its middle is half a line
 * below that top.
 */
export const BASELINE = 0.8;
export const CAP_TOP = 0.1;

type OnPath = Pick<TextObject, 'text' | 'size' | 'align'> &
  Partial<Pick<TextObject, 'letterSpacing' | 'kerning' | 'lineSpacing'>> & { path: TextPath };

/** The outline as the letters run along it: reversed when flipped. */
export function travelOf(path: Pick<TextPath, 'points' | 'closed' | 'flip'>): Polyline {
  const pts = flattenCurves(path.points, path.closed);
  if (!path.flip) return polylineOf(pts, path.closed);
  // A closed outline reversed still starts at its first point; an open one starts at its end.
  const back = path.closed && pts.length > 1 ? [pts[0]!, ...pts.slice(1).reverse()] : pts.reverse();
  return polylineOf(back, path.closed);
}

/** The point `d` along: round and round a closed outline, straight on past an open one's ends. */
function along(line: Polyline, d: number): Point {
  const total = pathLength(line);
  if (line.closed) return pointAt(line, ((d % total) + total) % total);
  if (d >= 0 && d <= total) return pointAt(line, d);
  const end = pointAt(line, d < 0 ? 0 : total);
  const a = (end.angle * Math.PI) / 180;
  const past = d < 0 ? d : d - total;
  return { x: end.x + Math.cos(a) * past, y: end.y + Math.sin(a) * past };
}

/**
 * How far the middle of each line's letters stands from the outline, along its left-hand normal
 * (up, for a line drawn left to right), in px: the part of the letters that is on the outline is
 * that far below their middle.
 */
function offsetOf(side: TextPath['side'], line: number, lines: number, size: number, lh: number) {
  switch (side) {
    case 'outside':
      // The last line's baseline on the outline; the lines before it farther out.
      return BASELINE * size - lh / 2 + (lines - 1 - line) * lh;
    case 'inside':
      // The first line's capitals' tops on the outline; the lines after it farther in.
      return -(lh / 2 - CAP_TOP * size + line * lh);
    case 'centred': {
      // The middle of the capitals (between their tops and the baseline) on the outline.
      const body = ((BASELINE + CAP_TOP) / 2) * size - lh / 2;
      return ((lines - 1) / 2 - line) * lh + body;
    }
  }
}

/** Twice the area the outline encloses, positive when it runs clockwise on the screen (y down). */
function clockwiseArea(line: Polyline): number {
  const p = line.points;
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/**
 * G12: the side as the letters' own up sees it. A letter's up is on the left of the way the
 * letters run, which is outside a closed outline run clockwise (on the screen) and above an open
 * one run the way it was drawn; run the other way (flipped, or a shape drawn anticlockwise), the
 * letters' up faces the other side, so outside and inside swap places for them.
 */
function sideFor(path: TextPath, line: Polyline): TextPath['side'] {
  if (path.side === 'centred') return 'centred';
  const reversed = path.closed ? clockwiseArea(line) < 0 : path.flip === true;
  if (!reversed) return path.side;
  return path.side === 'outside' ? 'inside' : 'outside';
}

/**
 * GT2: the letters of a text on its path (spaces left out), each the middle of its line-high
 * cell in the text's box and its turn in degrees, clockwise, following the outline.
 */
export function pathLetters(t: OnPath, widthOf: WidthOf): PlacedLetter[] {
  const layout = layoutText(t, widthOf);
  const line = travelOf(t.path);
  const side = sideFor(t.path, line);
  const total = pathLength(line);
  const lines = layout.lineWidths.length;
  const start = t.path.closed ? t.path.start : Math.max(0, Math.min(100, t.path.start));
  const anchor = (start / 100) * total;
  const shift = t.align === 'left' ? 0 : t.align === 'centre' ? -layout.width / 2 : -layout.width;
  return layout.cells
    .filter((c) => c.char.trim() !== '')
    .map((c) => {
      const d = anchor + shift + c.x + c.width / 2;
      const at = total > 0 ? along(line, d) : (line.points[0] ?? { x: 0, y: 0 });
      // The direction under the letter: from its left edge to its right on the outline (so a
      // letter on a corner turns halfway round it), or the outline's own where it has no width.
      const [a, b] =
        total > 0 && c.width > 0
          ? [along(line, d - c.width / 2), along(line, d + c.width / 2)]
          : [at, at];
      const angle =
        a.x === b.x && a.y === b.y
          ? total > 0
            ? pointAt(line, Math.max(0, Math.min(total, d))).angle
            : 0
          : (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const r = (angle * Math.PI) / 180;
      const off = offsetOf(side, c.line, lines, t.size, layout.lineHeight);
      // The left of the way it runs: up for a line drawn left to right (the screen's y is down).
      return {
        char: c.char,
        x: at.x + Math.sin(r) * off,
        y: at.y - Math.cos(r) * off,
        angle,
        width: c.width,
      };
    });
}

/**
 * GT2: a good start for words put on an outline: on an open one where the words' alignment puts
 * them along it (left: from its start, centred: about its middle, right: to its end); on a closed
 * one, centred over its top (where the outline crosses the middle of its box highest up).
 */
export function defaultStart(
  path: Pick<TextPath, 'points' | 'closed'>,
  align: TextObject['align'],
): number {
  if (!path.closed) return align === 'left' ? 0 : align === 'centre' ? 50 : 100;
  const line = polylineOf(flattenCurves(path.points, true), true);
  const total = pathLength(line);
  if (total === 0) return 0;
  const xs = line.points.map((p) => p.x);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  let best: { y: number; d: number } | null = null;
  const n = line.points.length;
  for (let i = 0; i < n; i++) {
    const a = line.points[i]!;
    const b = line.points[(i + 1) % n]!;
    if ((a.x - middle) * (b.x - middle) > 0 || a.x === b.x) continue;
    const s = (middle - a.x) / (b.x - a.x);
    const y = a.y + (b.y - a.y) * s;
    if (!best || y < best.y) best = { y, d: line.at[i]! + (line.at[i + 1]! - line.at[i]!) * s };
  }
  const where = best ? (best.d / total) * 100 : 0;
  return Math.round(where * 100) / 100;
}
