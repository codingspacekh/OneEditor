// M21 step 3 (GB2): the selection tools' settings, shown in the option bar above the canvas and
// read by the tools when they make a selection (as Photoshop's options bar: they stay as set,
// not saved with the image); and the outline being drawn (a marquee or lasso while it is
// dragged, a polygonal lasso while its points are clicked), shown by SelectionOutline.
import type { Point } from '../../core/animation/geometry.ts';
import type { SelectMode } from '../../core/graphics/pixels/selection.ts';

export const selUi = $state({
  /** How a new selection joins the one there is when no key is held. */
  mode: 'new' as SelectMode,
  /** Px each new selection is feathered by (0: a sharp edge). */
  feather: 0,
  /** Soft (anti-aliased) edges on the marquees and lassos. */
  antiAlias: true,
  /** Magic wand: 0–255 a channel; only the joined pixels or every alike pixel. */
  tolerance: 32,
  contiguous: true,
  /**
   * Magic wand and colour select: look at every layer as drawn instead of the current one.
   * TODO(M21 integrator): wired once step 2's merge gives the picture as one bitmap; see
   * `sampleFor` in selection-tools.ts.
   */
  allLayers: false,
  /** Colour select: how far a colour may be from the one picked (the selection fades out). */
  fuzziness: 40,
  /** Feather, Grow, Shrink and Smooth: by this many px. */
  amount: 5,
  /** G13 Fade selection to this %. */
  fade: 50,
  /** The outline being drawn, image px (closed back to its first point), or null. */
  draft: null as Point[] | null,
});

/** Shift adds, Alt (Option) subtracts, both intersect; no key: the mode chosen in the bar. */
export function modeOf(e: { shiftKey: boolean; altKey: boolean }): SelectMode {
  if (e.shiftKey && e.altKey) return 'intersect';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'subtract';
  return selUi.mode;
}
