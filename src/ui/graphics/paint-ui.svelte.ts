// M21 step 4 (GB3): what the painting tools show over the image while they are used, not part of
// the image: the gradient tool's line while it is dragged (drawn by BrushCursor).
import type { Point } from '../../core/animation/geometry.ts';

export const paintUi = $state({
  /** The gradient tool's line being dragged, image px, or null. */
  gradientLine: null as { from: Point; to: Point } | null,
});
