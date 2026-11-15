// GV8 (M19): template layers — a picture placed faded and locked to draw over (9626/04 M/26
// Chip.png, O/N/22 Plane.jpg, J/22 Balloon1), as Illustrator's template layers. A template is
// only a guide for the hand: it is shown on the stage while editing, at TEMPLATE_OPACITY, and
// left out of every export, of Send to Animation and of the parts exported one by one.
import { EditError } from '../model/errors.ts';
import { createPicture } from './factory.ts';
import { addLayer, moveLayer } from './layers.ts';
import type { AnimationDoc, Id, Layer, Picture, PictureObject } from './types.ts';

/** The name a placed template's layer is given ("Template 2" if there is one already). */
export const TEMPLATE_LAYER = 'Template';

/**
 * The picture as large as the canvas allows without stretching it, in the middle (a photo of
 * another shape leaves a strip either side or above and below).
 */
export function fittedPicture(
  picture: Picture,
  stage: { width: number; height: number },
): PictureObject {
  if (!(picture.width > 0 && picture.height > 0))
    throw new EditError('That picture has no size: choose another picture file.');
  const scale = Math.min(stage.width / picture.width, stage.height / picture.height);
  const width = picture.width * scale;
  const height = picture.height * scale;
  const object = createPicture(picture, {
    x: (stage.width - width) / 2,
    y: (stage.height - height) / 2,
  });
  return { ...object, width, height };
}

/**
 * *Place template…*: the picture (added to the list once) on a new layer at the bottom named
 * "Template", fitted to the canvas, the layer locked and marked a template.
 */
export function placeTemplate(
  doc: AnimationDoc,
  picture: Picture,
): { doc: AnimationDoc; layer: Layer; object: PictureObject } {
  const taken = new Set(doc.layers.map((l) => l.name));
  let name = TEMPLATE_LAYER;
  for (let n = 2; taken.has(name); n++) name = `${TEMPLATE_LAYER} ${n}`;
  const known = doc.pictures.some((p) => p.id === picture.id);
  const withPicture = known ? doc : { ...doc, pictures: [...doc.pictures, picture] };
  const { doc: added, layer: empty } = addLayer(withPicture, name);
  const object = fittedPicture(picture, doc.stage);
  const layer: Layer = { ...empty, objects: [object], locked: true, template: true };
  const placed = {
    ...added,
    layers: added.layers.map((l) => (l.id === empty.id ? layer : l)),
  };
  return { doc: moveLayer(placed, layer.id, 0), layer, object };
}

/**
 * The *Template* toggle on any layer: on, it is faded and locked (and no longer a mask: a
 * template only guides the hand); off, it is an ordinary layer again, still locked until unlocked.
 */
export function markTemplate(doc: AnimationDoc, id: Id, on: boolean): AnimationDoc {
  if (!doc.layers.some((l) => l.id === id))
    throw new EditError('That layer is not there any more.');
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (l.id !== id) return l;
      const rest = { ...l };
      delete rest.template;
      if (!on) return rest;
      delete rest.mask;
      return { ...rest, template: true, locked: true };
    }),
  };
}

/** True when the document has a template layer. */
export const hasTemplate = (doc: AnimationDoc): boolean => doc.layers.some((l) => l.template);

/**
 * What every export, Send to Animation and the "each part" exports see: the document without its
 * template layers (the same document when it has none).
 */
export function withoutTemplates(doc: AnimationDoc): AnimationDoc {
  return hasTemplate(doc) ? { ...doc, layers: doc.layers.filter((l) => !l.template) } : doc;
}
