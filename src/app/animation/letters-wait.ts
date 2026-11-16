// GT4, GT5 (M20): an edit that makes text its letters' outlines (Convert to curves, Apply on bent
// text) waits for those outlines to be read from the font files the first time. It is done as
// soon as they are (one undo step, as any edit); a refusal then is said in the message line.
import { findObject } from '../../core/animation/layers.ts';
import type { Id } from '../../core/animation/types.ts';
import { glyphsReady, hasGlyphSource, loadGlyphsFor } from '../../core/graphics/glyphs.ts';
import type { AnimationContext } from './context.ts';

/**
 * Runs `edit` on the objects `ids` now if their texts' outlines are ready (or cannot be read
 * here: it then says why), else once they are read. Returns the edit's refusal, or null.
 */
export function withLetters(
  ctx: AnimationContext,
  ids: readonly Id[],
  edit: () => string | null,
): string | null {
  const objects = ids.flatMap((id) => {
    const found = findObject(ctx.present(), id);
    return found ? [found.object] : [];
  });
  if (!hasGlyphSource() || objects.every(glyphsReady)) return edit();
  void loadGlyphsFor(objects).then(() => {
    const refused = edit();
    if (refused) ctx.patch({ message: { kind: 'error', text: refused } });
  });
  return null;
}
