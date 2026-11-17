// GT4, GT5 (M20): the letters' own outlines, read from the bundled fonts' files (D10: opentype.js
// in adapters/fonts). Core only knows this port: for a font (its name, bold, italic) a letter's
// outline at a size, as the commands of a font file (lines, quadratic and cubic curves), and how
// far its baseline sits below the top of the em box the stage draws text from.
//
// Drawing is synchronous, so the fonts' outlines are loaded first (when text is converted, bent,
// exported) and kept here; a bent text whose font is not loaded yet is drawn unbent until it is.
import { roughTextWidth } from '../animation/factory.ts';
import type { AnimObject, TextObject } from '../animation/types.ts';
import type { WidthOf } from '../animation/text-layout.ts';

/** One drawing command of a letter's outline, in px, from its left end on the baseline, y down. */
export type GlyphCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };

/** The outlines of one font (one file, at the weight and slant the text asks for). */
export interface FontGlyphs {
  /** How far the baseline is below the top of the em box (textBaseline 'top'), in em. */
  readonly top: number;
  /** A letter's outline at `size` px; empty for a space or a letter the font does not have. */
  outline(char: string, size: number): GlyphCommand[];
  /** How far the letter moves the pen on, in px at `size`. */
  advance(char: string, size: number): number;
  /**
   * G4 (benchmark 2026-11-17): a font file (OpenType) of just the letters of `text`, as this font
   * draws them at `size` (its weight, slant and optical size), named `family`: what an SVG carries
   * instead of the whole font file (1 MB for Inter).
   */
  subset?(family: string, text: string, size: number): Uint8Array;
}

/** GT4 (D10): where the letters' outlines come from. */
export interface GlyphSource {
  /** The outlines for text in this font; null for a font that is not bundled. */
  load(font: string, bold: boolean, italic: boolean): Promise<FontGlyphs | null>;
}

/** How wide some words are, as the stage measures them (a canvas in the app). */
export type MeasureText = (
  t: Pick<TextObject, 'font' | 'size' | 'bold' | 'italic'>,
  text: string,
) => number;

type Face = Pick<TextObject, 'font' | 'bold' | 'italic'>;

let source: GlyphSource | null = null;
let measure: MeasureText | null = null;
const loaded = new Map<string, FontGlyphs | null>();
const loading = new Map<string, Promise<FontGlyphs | null>>();

const keyOf = (t: Face): string => `${t.font}|${t.bold ? 'b' : ''}|${t.italic ? 'i' : ''}`;

/**
 * GT4: the outlines' source (the app's opentype adapter; a fake in tests) and the measure the
 * stage uses for words, so letters made outlines sit where the stage drew them. Null clears it.
 */
export function setGlyphSource(
  given: GlyphSource | null,
  measured: MeasureText | null = null,
): void {
  source = given;
  measure = measured;
  loaded.clear();
  loading.clear();
}

/** Whether the letters' outlines can be read (the app set where they come from). */
export const hasGlyphSource = (): boolean => source !== null;

/** GT5: the bent objects (at any depth in groups) holding text: drawn from their letters' outlines. */
export function bentWithText(objects: readonly AnimObject[]): AnimObject[] {
  return objects.flatMap((o) =>
    o.envelope && textsIn([o]).length > 0
      ? [o]
      : o.kind === 'group'
        ? bentWithText(o.children)
        : [],
  );
}

/** The text objects in these objects, groups' too. */
export function textsIn(objects: readonly AnimObject[]): TextObject[] {
  return objects.flatMap((o) =>
    o.kind === 'text' ? [o] : o.kind === 'group' ? textsIn(o.children) : [],
  );
}

/**
 * Loads the outlines of every font the texts in `objects` use (each once). True when any new
 * one arrived (the stage then draws again).
 */
export async function loadGlyphsFor(objects: readonly AnimObject[]): Promise<boolean> {
  const from = source;
  if (!from) return false;
  const wanted = [...new Map(textsIn(objects).map((t) => [keyOf(t), t])).entries()].filter(
    ([key]) => !loaded.has(key),
  );
  const arrived = await Promise.all(
    wanted.map(async ([key, t]) => {
      let pending = loading.get(key);
      if (!pending) {
        pending = from.load(t.font, t.bold, t.italic).catch(() => null);
        loading.set(key, pending);
      }
      const glyphs = await pending;
      // Not kept if the source was changed meanwhile.
      if (source !== from) return false;
      loading.delete(key);
      loaded.set(key, glyphs);
      return true;
    }),
  );
  return arrived.some(Boolean);
}

/** The loaded outlines for a text's font, or null (not loaded yet, or not a bundled font). */
export const glyphsOf = (t: Face): FontGlyphs | null => loaded.get(keyOf(t)) ?? null;

/** Whether a text's font was looked for and is not one whose outlines can be read. */
export const glyphsMissing = (t: Face): boolean =>
  loaded.has(keyOf(t)) && loaded.get(keyOf(t)) === null;

/** Why a text's letters cannot be made outlines now (its font's outlines not loaded). */
export function whyNoGlyphs(t: Face): string {
  if (!source)
    return 'The letters’ outlines are read from the fonts that come with OneEditor, in the app.';
  return glyphsMissing(t)
    ? `The letters of “${t.font}” cannot be read: choose one of the fonts that come with OneEditor.`
    : 'The letters’ shapes are still loading: try again in a moment.';
}

/** Whether every text in `o` (itself or in a group) has its outlines loaded. */
export const glyphsReady = (o: AnimObject): boolean =>
  textsIn([o]).every((t) => glyphsOf(t) !== null);

/**
 * How wide words are in a text's font: as the stage measures them when it can (a canvas), else
 * from the font's own advances, else roughly.
 */
export function widthsOf(t: TextObject): WidthOf {
  if (measure) {
    const m = measure;
    return (s) => m(t, s);
  }
  const glyphs = glyphsOf(t);
  if (glyphs) return (s) => [...s].reduce((w, c) => w + glyphs.advance(c, t.size), 0);
  return (s) => roughTextWidth(s, t.size);
}
