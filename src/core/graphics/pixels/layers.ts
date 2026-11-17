// M21: the questions and the one edit every pixel feature shares — is this layer a pixel layer,
// and its pixels replaced (refused on a locked or hidden layer, as any change to a layer's
// contents) — so the selections, the painting and the image sizes all change pixels the same way.
import { changeLayer } from '../../animation/layers.ts';
import type { AnimationDoc, Id, Layer, PixelContent } from '../../animation/types.ts';
import { EditError } from '../../model/errors.ts';

export const isPixelLayer = (layer: Layer | undefined): layer is Layer & { pixels: PixelContent } =>
  layer?.pixels !== undefined;

/** The pixel layer with this id; refused when there is none or it holds vectors. */
export function pixelLayerOf(doc: AnimationDoc, id: Id): Layer & { pixels: PixelContent } {
  const layer = doc.layers.find((l) => l.id === id);
  if (!isPixelLayer(layer)) throw new EditError('Choose a pixel layer first.');
  return layer;
}

/** The layer's pixels changed by `change`; the doc itself when nothing changes. */
export function changePixels(
  doc: AnimationDoc,
  id: Id,
  change: (pixels: PixelContent) => PixelContent,
): AnimationDoc {
  const before = pixelLayerOf(doc, id).pixels;
  const after = change(before);
  if (after === before) return doc;
  return changeLayer(doc, id, (layer) => ({ ...layer, pixels: after }));
}
