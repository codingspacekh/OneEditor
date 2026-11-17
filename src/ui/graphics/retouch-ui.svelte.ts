// M22 (GB5): what the retouching tools show over the image while they are used, not part of the
// image: whether a clone or heal stroke is being painted (its source then follows the pointer),
// and red eye's box while it is dragged (drawn by RetouchCursor).
import type { Point } from '../../core/animation/geometry.ts';

export const retouchUi = $state({
  /** A retouching stroke is being painted. */
  painting: false,
  /** Red eye's box being dragged, image px, or null. */
  eyeBox: null as { from: Point; to: Point } | null,
});
