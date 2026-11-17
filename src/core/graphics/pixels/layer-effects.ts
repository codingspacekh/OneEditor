// G14 (M22): effects on a pixel layer — the drop shadow, inner shadow, glow (the halo round the
// Moon, the Lens's light blooms), bevel (the metallic plaque) and blur that objects have (M19),
// kept on the layer and drawn from its pixels as the stage, the exports, the SVG and the merges
// draw them (draw.ts, merge.ts). How the layer looks, as its opacity: a locked layer can still be
// given them. A pure function; the command makes it one undo step.
import { validateFilters } from '../../animation/rules.ts';
import type { AnimationDoc, Id, ObjectFilter } from '../../animation/types.ts';
import { EditError } from '../../model/errors.ts';

/**
 * The layer's effects, drawn in order (none: an empty list or undefined, kept off the layer).
 * G10 (M23): a vector layer has them too, made from all its objects together (a clipping base's
 * from the whole group: M/21's globe outlined round the map clipped into it). Refused on a mask
 * layer (not drawn), or with numbers out of range (as an object's).
 */
export function setLayerEffects(
  doc: AnimationDoc,
  id: Id,
  effects: readonly ObjectFilter[] | undefined,
): AnimationDoc {
  const layer = doc.layers.find((l) => l.id === id);
  if (!layer) throw new EditError('Choose a layer first.');
  if (layer.mask) throw new EditError('A mask layer is not drawn, so it has no effects.');
  const list = effects ?? [];
  validateFilters(list, 'A layer');
  if (!list.length && !layer.effects) return doc;
  const next = { ...layer };
  if (list.length) next.effects = [...list];
  else delete next.effects;
  return { ...doc, layers: doc.layers.map((l) => (l === layer ? next : l)) };
}
