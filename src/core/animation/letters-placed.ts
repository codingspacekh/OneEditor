// GT1–GT4 (M20): where every letter of a text object goes, whichever way it is set — straight
// (with its spacing), curved along an arc (AN26), on a path (GT2) or in a shape (GT3) — in the
// text's own box. Text to curves (GT4) draws each letter's outline here; the drawing and the SVG
// place the letters the same way.
import { pathLetters } from '../graphics/text-path.ts';
import { shapeText } from '../graphics/text-shape.ts';
import { curvedText, curveOf } from './curve.ts';
import { straightLetters, type PlacedLetter, type WidthOf } from './text-layout.ts';
import type { TextObject } from './types.ts';

export type { PlacedLetter };

export function placeLetters(t: TextObject, widthOf: WidthOf): PlacedLetter[] {
  // GT2, GT3: on a path or in a shape (never curved too: setting one takes the others off).
  if (t.path) return pathLetters({ ...t, path: t.path }, widthOf);
  if (t.inShape) return shapeText({ ...t, inShape: t.inShape }, widthOf).letters;
  if (curveOf(t) !== 0) return curvedText(t, widthOf).letters.filter((l) => l.char.trim() !== '');
  return straightLetters(t, widthOf);
}
