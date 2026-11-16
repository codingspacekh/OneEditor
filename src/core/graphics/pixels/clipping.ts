// G2 (M21): which layer a clipping mask clips to — the nearest layer below it that is not itself
// clipped (its base: the circle the photo shows inside). The one rule the stage's drawing
// (drawStage), the merges and the Layers panel share. A mask layer (AN12) or a template (GV8) is
// not a picture to clip to: a layer clipped to one, or with nothing below, is drawn as an ordinary
// layer; a layer whose base is hidden is not shown.
import type { Layer } from '../../animation/types.ts';

/** Mask layers (AN12) and templates (GV8): not pictures. */
export const isSpecialLayer = (l: Layer): boolean => l.mask === true || l.template === true;

/** The index of layer `i`'s base in `layers` (bottom first); -1 when it is not clipped to one. */
export function clipBaseIndex(layers: readonly Layer[], i: number): number {
  if (!layers[i]?.clip) return -1;
  let j = i - 1;
  while (j >= 0 && layers[j]!.clip) j--;
  return j >= 0 && !isSpecialLayer(layers[j]!) ? j : -1;
}

/** Whether layer `i` is drawn: shown, and its base too if it is clipped to one. */
export function isLayerShown(layers: readonly Layer[], i: number): boolean {
  const layer = layers[i];
  if (!layer?.visible) return false;
  const base = clipBaseIndex(layers, i);
  return base < 0 || layers[base]!.visible;
}
