// G14 (M22): effects on a pixel layer — the drop shadow, inner shadow, glow (the halo round the
// Moon, the Lens's light blooms), bevel (the metallic plaque) and blur that objects have (M19),
// kept on the layer and drawn from its pixels as the stage, the exports, the SVG and the merges
// draw them (draw.ts, merge.ts). How the layer looks, as its opacity: a locked layer can still be
// given them. A pure function; the command makes it one undo step.
import { validateFilters } from '../../animation/rules.ts';
import type { AnimationDoc, Id, ObjectFilter } from '../../animation/types.ts';
import { pixelLayerOf } from './layers.ts';

/**
 * The pixel layer's effects, drawn in order (none: an empty list or undefined, kept off the
 * layer). Refused on a vector layer, or with numbers out of range (as an object's).
 */
export function setLayerEffects(
  doc: AnimationDoc,
  id: Id,
  effects: readonly ObjectFilter[] | undefined,
): AnimationDoc {
  const layer = pixelLayerOf(doc, id);
  const list = effects ?? [];
  validateFilters(list, 'A layer');
  if (!list.length && !layer.effects) return doc;
  const next = { ...layer };
  if (list.length) next.effects = [...list];
  else delete next.effects;
  return { ...doc, layers: doc.layers.map((l) => (l === layer ? next : l)) };
}
