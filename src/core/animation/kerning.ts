// GT1 (M20): kerning, the gap between two letters only, at the cursor in the words (Alt+← / →,
// as Illustrator and CorelDRAW). `kerning[i]` is added after the character at `i` of the text
// (new lines counted, in UTF-16 units as the words box counts them), in thousandths of an em.
// When the words change, the kerning moves with the letters it was between.
import { EditError } from '../model/errors.ts';
import type { TextObject } from './types.ts';

/** One press of Alt+← / →, and with Shift, in thousandths of an em. */
export const KERN_STEP = 20;
export const KERN_BIG_STEP = 100;
/** How far two letters can be pulled in or pushed apart: a whole em. */
export const MAX_KERNING = 1000;

type Kerned = Pick<TextObject, 'text'> & Partial<Pick<TextObject, 'kerning'>>;

const NO_PAIR = 'Put the cursor between two letters to kern them.';

/**
 * Where the kerning of the gap at the cursor (`cursor` units into the text) is kept: after the
 * letter before it (its first unit, for a letter of two). Null at the start or the end of a line.
 */
function gapAt(text: string, cursor: number): number | null {
  if (!(cursor > 0 && cursor < text.length)) return null;
  if (text[cursor - 1] === '\n' || text[cursor] === '\n') return null;
  const low = text.charCodeAt(cursor - 1);
  // The second half of a letter such as an emoji: the letter starts one unit before.
  return low >= 0xdc00 && low <= 0xdfff && cursor >= 2 ? cursor - 2 : cursor - 1;
}

/** The kerning saved: no 0s at the end, and nothing at all when every gap is 0. */
function tidy(kerning: number[]): number[] | undefined {
  let end = kerning.length;
  while (end > 0 && !kerning[end - 1]) end--;
  return end === 0 ? undefined : kerning.slice(0, end).map((k) => k || 0);
}

/** The kerning between the letters either side of the cursor, or null where there is no pair. */
export function kerningAt(t: Kerned, cursor: number): number | null {
  const gap = gapAt(t.text, cursor);
  return gap === null ? null : (t.kerning?.[gap] ?? 0);
}

/** The text's kerning with the gap at the cursor set to `value`. */
export function withKerning(t: Kerned, cursor: number, value: number): number[] | undefined {
  const gap = gapAt(t.text, cursor);
  if (gap === null) throw new EditError(NO_PAIR);
  const kerning = Array.from({ length: Math.max(gap + 1, t.kerning?.length ?? 0) }, (_, i) =>
    i === gap ? value : (t.kerning?.[i] ?? 0),
  );
  return tidy(kerning);
}

/** Alt+← / →: the gap at the cursor closed up (less than 0) or opened, within a whole em. */
export function kernedBy(t: Kerned, cursor: number, by: number): number[] | undefined {
  const now = kerningAt(t, cursor);
  if (now === null) throw new EditError(NO_PAIR);
  return withKerning(t, cursor, Math.max(-MAX_KERNING, Math.min(MAX_KERNING, now + by)));
}

/**
 * The kerning after the words changed from `before` to `after`: the letters kept at the start
 * and the end keep theirs, letters typed between have none, and the gaps after letters deleted
 * go with them.
 */
export function kerningAfterEdit(
  before: string,
  after: string,
  kerning: readonly number[] | undefined,
): number[] | undefined {
  if (!kerning?.length) return undefined;
  const shorter = Math.min(before.length, after.length);
  // The end first, so words typed before the same letters ("An AVATAR") move their kerning on.
  let end = 0;
  while (end < shorter && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  let start = 0;
  while (start < shorter - end && before[start] === after[start]) start++;
  const k = (i: number) => kerning[i] ?? 0;
  const kept = Array.from({ length: start }, (_, i) => k(i));
  const typed = Array.from({ length: after.length - start - end }, () => 0);
  const rest = Array.from({ length: end }, (_, i) => k(before.length - end + i));
  return tidy([...kept, ...typed, ...rest]);
}
