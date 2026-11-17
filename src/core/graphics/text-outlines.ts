// GT4 (M20): Convert to curves for text — each letter becomes a pen path made from the font's own
// outline (D10), so its nodes can be pulled about (workbook Task 2: the stretched letters). The
// letters are placed where the stage draws them: each where the letter layout puts it (straight,
// spaced, curved, on a path, in a shape: placeLetters), its outline centred on its line-high
// cell, its baseline as far below the cell's top as the font's em box puts it (the stage draws
// text from that top), turned with the letter. A letter's counters (o, e, a) and separate pieces
// (the dot of i) are its holes; they are filled nonzero, as the font is, so the overlapping
// strokes of a variable font's letters stay filled. The letters come grouped, in the text's place.
import { curvedText, curveOf } from '../animation/curve.ts';
import { placeLetters } from '../animation/letters-placed.ts';
import { layoutText, lineHeightOf, type WidthOf } from '../animation/text-layout.ts';
import type {
  AnimObject,
  GroupObject,
  PathObject,
  PathPoint,
  TextObject,
  TweenProperty,
} from '../animation/types.ts';
import { EditError } from '../model/errors.ts';
import { newId } from '../model/factory.ts';
import { glyphsOf, whyNoGlyphs, widthsOf, type FontGlyphs, type GlyphCommand } from './glyphs.ts';

type Point = { x: number; y: number };

const round = (n: number) => Math.round(n * 100) / 100;
const close = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/**
 * A letter's outline commands as rings of path points (each contour one ring), every point moved
 * by `place`. Quadratic curves (TrueType's) become the cubic curves pen paths have.
 */
export function glyphRings(
  commands: readonly GlyphCommand[],
  place: (p: Point) => Point,
): PathPoint[][] {
  const rings: PathPoint[][] = [];
  let ring: PathPoint[] = [];
  const end = () => {
    // A contour that comes back to where it started has one point there, with both handles.
    const [first, last] = [ring[0], ring.at(-1)];
    if (first && last && ring.length > 1 && close(first, last)) {
      ring.pop();
      if (last.in) first.in = last.in;
    }
    // Two points joined by curves (a round dot): halved, so it has the three a hole needs.
    if (ring.length === 2) ring = halved(ring);
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };
  const at = (x: number, y: number): PathPoint => ({ x, y });
  for (const c of commands) {
    const prev = ring.at(-1);
    switch (c.type) {
      case 'M':
        end();
        ring.push(at(c.x, c.y));
        break;
      case 'L':
        // A line to where it already is (a contour starting on its first point) adds nothing.
        if (!prev || !close(prev, c)) ring.push(at(c.x, c.y));
        break;
      case 'Q': {
        const from = prev ?? at(c.x, c.y);
        if (prev)
          prev.out = {
            x: from.x + (2 / 3) * (c.x1 - from.x),
            y: from.y + (2 / 3) * (c.y1 - from.y),
          };
        ring.push({
          x: c.x,
          y: c.y,
          in: { x: c.x + (2 / 3) * (c.x1 - c.x), y: c.y + (2 / 3) * (c.y1 - c.y) },
        });
        break;
      }
      case 'C':
        if (prev) prev.out = { x: c.x1, y: c.y1 };
        ring.push({ x: c.x, y: c.y, in: { x: c.x2, y: c.y2 } });
        break;
      case 'Z':
        end();
        break;
    }
  }
  end();
  return rings.map((r) => r.map((p) => placed(p, place)));
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * A closed two-point ring with its first curve cut in two at its middle (de Casteljau), the same
 * shape; two points with straight sides between them enclose nothing and stay two.
 */
function halved([a, b]: PathPoint[]): PathPoint[] {
  if (!a!.out && !b!.in) return [a!, b!];
  const [p0, p1, p2, p3] = [a!, a!.out ?? a!, b!.in ?? b!, b!];
  const [q0, q1, q2] = [mid(p0, p1), mid(p1, p2), mid(p2, p3)];
  const [r0, r1] = [mid(q0, q1), mid(q1, q2)];
  const m = mid(r0, r1);
  const first: PathPoint = { x: p0.x, y: p0.y, out: q0, ...(a!.in ? { in: a!.in } : {}) };
  const last: PathPoint = { x: p3.x, y: p3.y, in: q2, ...(b!.out ? { out: b!.out } : {}) };
  return [first, { x: m.x, y: m.y, in: r0, out: r1 }, last];
}

/** A point and its handles moved; a point the curve runs on through (handles in line) is smooth. */
function placed(p: PathPoint, place: (p: Point) => Point): PathPoint {
  const q: PathPoint = { ...place(p) };
  if (p.in) q.in = place(p.in);
  if (p.out) q.out = place(p.out);
  if (q.in && q.out) {
    const a = { x: q.x - q.in.x, y: q.y - q.in.y };
    const b = { x: q.out.x - q.x, y: q.out.y - q.y };
    const len = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    if (len > 0 && Math.abs(a.x * b.y - a.y * b.x) < 0.02 * len && a.x * b.x + a.y * b.y > 0)
      q.type = 'smooth';
  }
  return q;
}

/**
 * Where the letters' places (placeLetters) sit in the text's box: words on a path or in a shape
 * are placed in it already; straight lines are aligned in the box and curved words are in its
 * middle, as the stage draws them.
 */
function offsetInBox(t: TextObject, widthOf: WidthOf): Point {
  if (t.path || t.inShape) return { x: 0, y: 0 };
  if (curveOf(t) !== 0) {
    const bent = curvedText(t, widthOf);
    return { x: (t.width - bent.width) / 2, y: (t.height - bent.height) / 2 };
  }
  const free = t.width - layoutText(t, widthOf).width;
  return { x: t.align === 'left' ? 0 : t.align === 'centre' ? free / 2 : free, y: 0 };
}

/** One letter's outline: its rings in the text's own box (px from its top-left corner). */
export interface LetterOutline {
  char: string;
  rings: PathPoint[][];
}

/**
 * GT4: every letter's outline where the stage draws the letter, in the text's own box: centred on
 * the middle of its line-high cell, its baseline `top` em below the cell's top, turned with it.
 * `widthOf` should measure as the stage does (a canvas), so the letters sit where they were seen.
 */
export function letterOutlines(
  t: TextObject,
  glyphs: FontGlyphs,
  widthOf: WidthOf,
): LetterOutline[] {
  const off = offsetInBox(t, widthOf);
  const half = lineHeightOf(t) / 2;
  const baseline = glyphs.top * t.size - half;
  return placeLetters(t, widthOf).flatMap((l) => {
    const a = (l.angle * Math.PI) / 180;
    const [cos, sin] = [Math.cos(a), Math.sin(a)];
    const place = (p: Point): Point => {
      const [x, y] = [p.x - l.width / 2, p.y + baseline];
      return { x: off.x + l.x + x * cos - y * sin, y: off.y + l.y + x * sin + y * cos };
    };
    const rings = glyphRings(glyphs.outline(l.char, t.size), place);
    return rings.length ? [{ char: l.char, rings }] : [];
  });
}

/** The box round some rings, their handles too (so every point stays inside it). */
function boxOf(rings: readonly PathPoint[][]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const pts = rings.flat().flatMap((p) => [p, ...(p.in ? [p.in] : []), ...(p.out ? [p.out] : [])]);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Rings moved into a box whose top-left corner is `o`, rounded to 1/100 px. */
function inBox(rings: readonly PathPoint[][], o: Point): PathPoint[][] {
  const move = (p: Point) => ({ x: round(p.x - o.x), y: round(p.y - o.y) });
  return rings.map((r) =>
    r.map((p) => ({
      ...p,
      ...move(p),
      ...(p.in ? { in: move(p.in) } : {}),
      ...(p.out ? { out: move(p.out) } : {}),
    })),
  );
}

/** What a text keeps when it becomes a group: its place and how it moves; the rest is text's own. */
const TEXT_ONLY = [
  'text',
  'font',
  'size',
  'bold',
  'italic',
  'align',
  'curve',
  'letterSpacing',
  'kerning',
  'lineSpacing',
  'path',
  'inShape',
  'stroke',
  'fillOpacity',
] as const;

/** Keyframes a group can play (the letters' colours, size and words are no longer the group's). */
const GROUP_TWEENS: ReadonlySet<TweenProperty> = new Set([
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'skewX',
  'skewY',
  'opacity',
]);

/**
 * GT4: the text as a group of pen paths, one per letter (named after it), in the text's place:
 * the same box, turn, flips, skew, the point it turns about, opacity, effects, envelope and
 * movement; each letter with the text's fill and outline. Text on a path whose path is shown
 * keeps that path as a line too. Throws when there is no letter to convert.
 */
export function textToCurves(t: TextObject, glyphs: FontGlyphs, widthOf: WidthOf): GroupObject {
  const letters: AnimObject[] = letterOutlines(t, glyphs, widthOf).map(({ char, rings }) => {
    const box = boxOf(rings);
    const [outer, ...holes] = inBox(rings, box);
    const letter: PathObject = {
      id: newId(),
      name: char,
      kind: 'path',
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      rotation: 0,
      opacity: 100,
      fill: t.fill,
      ...(t.stroke ? { stroke: t.stroke } : {}),
      ...(t.fillOpacity !== undefined ? { fillOpacity: t.fillOpacity } : {}),
      points: outer!,
      closed: true,
      ...(holes.length ? { holes } : {}),
      fillRule: 'nonzero',
    };
    return letter;
  });
  if (letters.length === 0) throw new EditError('This text has no letters to convert to curves.');
  const line = t.path?.stroke;
  if (t.path && line && line.width > 0 && t.path.points.length >= 2) {
    const box = boxOf([t.path.points]);
    const [points] = inBox([t.path.points], box);
    letters.unshift({
      id: newId(),
      name: 'Path',
      kind: 'path',
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      rotation: 0,
      opacity: 100,
      fill: { kind: 'none' },
      stroke: line,
      points: points!,
      closed: t.path.closed,
    });
  }
  const rest: Record<string, unknown> = { ...t };
  for (const key of TEXT_ONLY) delete rest[key];
  const tracks = t.tracks?.filter((k) => GROUP_TWEENS.has(k.property));
  if (tracks?.length) rest.tracks = tracks;
  else delete rest.tracks;
  return {
    ...(rest as Omit<GroupObject, 'kind' | 'children' | 'fill'>),
    kind: 'group',
    fill: { kind: 'none' },
    children: letters,
  };
}

/**
 * GT4, GT5: the text as its letters with its font's loaded outlines, measured as the stage
 * measures it; says why when the outlines are not loaded (yet).
 */
export function lettersGroup(t: TextObject): GroupObject {
  const glyphs = glyphsOf(t);
  if (!glyphs) throw new EditError(whyNoGlyphs(t));
  return textToCurves(t, glyphs, widthsOf(t));
}
