// GT4, GT5 (M20, D10): the letters' outlines from the bundled fonts' own files, read with
// opentype.js, as the stage draws them: the file the text needs (the italic file for italic
// words, the bold one for bold: faceFor), a variable font at its weight (700 for bold) and, for
// Inter, at its optical size (the browser sets it to the size in px), the em box's top from the
// font's typographic ascender and descender (as Chromium's textBaseline 'top'). A font with no
// italic file is slanted as the browser slants it (a quarter of the height); one with no bold
// file is not made heavier (the browser thickens its letters a little: 1/32 of the size).
import { parse, type Font, type Glyph } from 'opentype.js/dist/opentype.mjs';
import { fontOf } from '../../core/animation/draw.ts';
import type { TextObject } from '../../core/animation/types.ts';
import type {
  FontGlyphs,
  GlyphCommand,
  GlyphSource,
  MeasureText,
} from '../../core/graphics/glyphs.ts';
import { faceFor, type FontFile } from '../../core/text/fonts.ts';
import { readGlyphVariations, variedPoints, type GlyfPoint } from './gvar.ts';

/** Reads a bundled font file by its name in resources/fonts ("Inter.ttf"). */
export type ReadFont = (file: string) => Promise<Uint8Array>;

/** How far the browser slants a font that has no italic (Skia's synthetic italic). */
const FAKE_ITALIC = 0.25;

/**
 * TrueType contours as commands: on-curve points joined by lines, an off-curve point the control
 * point of a quadratic curve, with an on-curve point implied between two off-curve ones.
 */
function commandsOf(points: readonly GlyfPoint[]): GlyphCommand[] {
  const out: GlyphCommand[] = [];
  const mid = (a: GlyfPoint, b: GlyfPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let start = 0;
  while (start < points.length) {
    let end = start;
    while (!points[end]!.lastPointOfContour && end < points.length - 1) end++;
    const contour = points.slice(start, end + 1);
    start = end + 1;
    let [curr, next] = [contour.at(-1)!, contour[0]!];
    const from = curr.onCurve ? curr : next.onCurve ? next : mid(curr, next);
    out.push({ type: 'M', x: from.x, y: from.y });
    for (let i = 0; i < contour.length; i++) {
      [curr, next] = [next, contour[(i + 1) % contour.length]!];
      if (curr.onCurve) out.push({ type: 'L', x: curr.x, y: curr.y });
      else {
        const to = next.onCurve ? next : mid(curr, next);
        out.push({ type: 'Q', x1: curr.x, y1: curr.y, x: to.x, y: to.y });
      }
    }
    out.push({ type: 'Z' });
  }
  return out;
}

/** The font's em box top: how far below it the baseline is, in em. */
function topOf(font: Font): number {
  const os2 = font.tables.os2;
  const pairs: [number, number][] = [
    ...(os2 ? [[os2.sTypoAscender, -os2.sTypoDescender] as [number, number]] : []),
    [font.ascender, -font.descender],
  ];
  for (const [ascent, descent] of pairs) {
    const height = ascent + descent;
    if (height > 0 && ascent >= 0 && ascent <= height) return ascent / height;
  }
  return 0.8;
}

/** GT4: one font file's outlines at the weight and slant a text asks for. */
export function fontGlyphs(
  font: Font,
  bytes: Uint8Array,
  wanted: { bold: boolean; italic: boolean; face: Pick<FontFile, 'style'> },
): FontGlyphs {
  const axes = font.tables.fvar?.axes ?? [];
  const gvar = axes.length ? readGlyphVariations(bytes) : null;
  const slant = wanted.italic && wanted.face.style !== 'italic' ? FAKE_ITALIC : 0;
  const clamp = (v: number, a: { minValue: number; maxValue: number }) =>
    Math.max(a.minValue, Math.min(a.maxValue, v));
  /** The axes' values a text of this size is drawn at. */
  const coordsAt = (size: number): Record<string, number> =>
    Object.fromEntries(
      axes.map((a) => [
        a.tag,
        a.tag === 'wght'
          ? clamp(wanted.bold ? 700 : 400, a)
          : a.tag === 'opsz'
            ? clamp(size, a)
            : a.defaultValue,
      ]),
    );
  /** The axes that change with the size (only the optical size). */
  const sized = axes.some((a) => a.tag === 'opsz');
  const outlines = new Map<string, GlyphCommand[]>();
  const advances = new Map<string, number>();
  const glyphOf = (char: string): Glyph | null => {
    const g = font.charToGlyph(char);
    return g && g.index !== 0 ? g : null;
  };
  /** In font units: the letter's outline at these axes (y up). */
  function unitOutline(char: string, size: number): GlyphCommand[] {
    const key = sized ? `${char}|${coordsAt(size).opsz}` : char;
    const known = outlines.get(key);
    if (known) return known;
    const g = glyphOf(char);
    let made: GlyphCommand[] = [];
    if (g) {
      g.getPath(); // reads the letter's points (and its parts', for a composite letter)
      if (g.points && gvar && font.variation) {
        const coords = font.variation.process.getNormalizedCoords(coordsAt(size));
        made = commandsOf(variedPoints(g, gvar, coords, (i) => font.glyphs.get(i)));
      } else if (g.points) made = commandsOf(g.points);
      else made = g.path.commands as GlyphCommand[];
    }
    outlines.set(key, made);
    return made;
  }
  return {
    top: topOf(font),
    outline(char, size) {
      const s = size / font.unitsPerEm;
      const at = (x: number, y: number) => ({ x: (x + slant * y) * s, y: 0 - y * s });
      return unitOutline(char, size).map((c): GlyphCommand => {
        switch (c.type) {
          case 'Z':
            return c;
          case 'M':
          case 'L':
            return { type: c.type, ...at(c.x, c.y) };
          case 'Q': {
            const [p, q] = [at(c.x1, c.y1), at(c.x, c.y)];
            return { type: 'Q', x1: p.x, y1: p.y, x: q.x, y: q.y };
          }
          case 'C': {
            const [p, q, r] = [at(c.x1, c.y1), at(c.x2, c.y2), at(c.x, c.y)];
            return { type: 'C', x1: p.x, y1: p.y, x2: q.x, y2: q.y, x: r.x, y: r.y };
          }
        }
      });
    },
    advance(char, size) {
      const key = sized ? `${char}|${coordsAt(size).opsz}` : char;
      let units = advances.get(key);
      if (units === undefined) {
        const g = glyphOf(char);
        // HVAR: a variable font's advance at its weight (opentype.js reads it right).
        units = !g
          ? 0
          : font.variation && axes.length
            ? (font.variation.getTransform(g, coordsAt(size)).advanceWidth ?? 0)
            : (g.advanceWidth ?? 0);
        advances.set(key, units);
      }
      return (units * size) / font.unitsPerEm;
    },
  };
}

/** An exact copy of the bytes in an ArrayBuffer of their own (what opentype.js parses). */
const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** GT4 (D10): the glyph source of the bundled fonts, each file read and parsed once. */
export function createOpentypeGlyphs(readFont: ReadFont): GlyphSource {
  const files = new Map<string, Promise<{ font: Font; bytes: Uint8Array }>>();
  return {
    async load(family, bold, italic) {
      const face = faceFor(family, bold, italic);
      if (!face) return null;
      let file = files.get(face.file);
      if (!file) {
        file = readFont(face.file).then((bytes) => ({ font: parse(bufferOf(bytes)), bytes }));
        files.set(face.file, file);
        file.catch(() => files.delete(face.file));
      }
      const { font, bytes } = await file;
      return fontGlyphs(font, bytes, { bold, italic, face });
    },
  };
}

/** A data: URL's bytes (the app hands the bundled fonts over as data: URLs, AN15). */
export function dataUrlBytes(url: string): Uint8Array {
  const comma = url.indexOf(',');
  const data = url.slice(comma + 1);
  if (!/;base64$/i.test(url.slice(0, comma)))
    return new TextEncoder().encode(decodeURIComponent(data));
  const binary = atob(data);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** What measures words on a canvas (a 2D context). */
export interface Measurer {
  font: string;
  measureText(text: string): { width: number };
}

/** GT4: words measured on a canvas in a text's font, as the stage measures them. */
export const measureWith =
  (ctx: Measurer): MeasureText =>
  (t, text) => {
    ctx.font = fontOf(t as TextObject);
    return ctx.measureText(text).width;
  };
