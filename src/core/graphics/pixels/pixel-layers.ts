// G2, GB1 (M21): pixel layers in the document — a new empty one, one holding a picture's pixels,
// a layer's opacity, blend mode and clipping (any layer in Graphics mode), a pixel layer's layer
// mask added, applied or thrown away, and a layer duplicated (a pixel layer's tiles are shared:
// they never change once made, D3). Pure functions; the commands make each one an undo step.
import { addLayer, changeLayer, uniqueName } from '../../animation/layers.ts';
import {
  BLEND_MODES,
  type AnimObject,
  type AnimationDoc,
  type BlendMode,
  type Id,
  type Layer,
  type PixelContent,
} from '../../animation/types.ts';
import { EditError } from '../../model/errors.ts';
import { newId } from '../../model/factory.ts';
import { pixelLayerOf } from './layers.ts';
import {
  createBitmap,
  createMask,
  cropRaster,
  editRegion,
  fillRect,
  readRegion,
  type Bitmap,
  type Mask,
} from './raster.ts';

/** Pixel layers belong to Graphics mode's images (an animation draws none). */
function graphicOnly(doc: AnimationDoc): void {
  if (!doc.graphic) throw new EditError('Pixel layers are for Graphics mode.');
}

/** "Layer 3" when free, else "Layer 4"… (a pixel layer is named as any other). */
function freeLayerName(doc: AnimationDoc, name: string): string {
  const taken = new Set(doc.layers.map((l) => l.name));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`)) return `${name} ${n}`;
}

/**
 * GB1: a new pixel layer above `aboveId` (on top when absent): empty and the image's size, or
 * holding `pixels` (a picture's, where it was put). Named `name`, or "Layer n".
 */
export function addPixelLayer(
  doc: AnimationDoc,
  { aboveId, name, pixels }: { aboveId?: Id; name?: string; pixels?: PixelContent } = {},
): { doc: AnimationDoc; layer: Layer } {
  graphicOnly(doc);
  const content = pixels ?? {
    bitmap: createBitmap(doc.stage.width, doc.stage.height),
    x: 0,
    y: 0,
  };
  const wanted = name?.trim() ? freeLayerName(doc, name.trim()) : undefined;
  const made = addLayer(doc, wanted, aboveId);
  const layer: Layer = { ...made.layer, pixels: content };
  return {
    doc: { ...made.doc, layers: made.doc.layers.map((l) => (l.id === layer.id ? layer : l)) },
    layer,
  };
}

/** GB1: a picture's pixels placed with its middle on the image's middle (whole px). */
export function centredPixels(doc: AnimationDoc, bitmap: Bitmap): PixelContent {
  return {
    bitmap,
    x: Math.round((doc.stage.width - bitmap.width) / 2),
    y: Math.round((doc.stage.height - bitmap.height) / 2),
  };
}

export interface LayerLook {
  /** 0–1. */
  opacity?: number;
  blend?: BlendMode;
  clip?: boolean;
}

/**
 * G2: how the whole layer is drawn — its opacity, blend mode and clipping mask. Kept off the layer
 * when they are the usual (100 %, normal, not clipped), so older versions read the file as before.
 */
export function setLayerLook(doc: AnimationDoc, id: Id, look: LayerLook): AnimationDoc {
  graphicOnly(doc);
  const at = doc.layers.findIndex((l) => l.id === id);
  const layer = doc.layers[at];
  if (!layer) throw new EditError('That layer no longer exists.');
  const { opacity, blend, clip } = look;
  if (opacity !== undefined && !(opacity >= 0 && opacity <= 1))
    throw new EditError('Opacity is from 0 % (not seen) to 100 % (solid).');
  if (blend !== undefined && !BLEND_MODES.includes(blend))
    throw new EditError(`There is no blend mode called ${String(blend)}.`);
  if (clip && at === 0)
    throw new EditError(`${layer.name} is the bottom layer: there is nothing below it to clip to.`);
  const next: Layer = { ...layer };
  if (opacity !== undefined) {
    if (opacity === 1) delete next.opacity;
    else next.opacity = Math.round(opacity * 1000) / 1000;
  }
  if (blend !== undefined) {
    if (blend === 'normal') delete next.blend;
    else next.blend = blend;
  }
  if (clip !== undefined) {
    if (clip) next.clip = true;
    else delete next.clip;
  }
  if (next.opacity === layer.opacity && next.blend === layer.blend && next.clip === layer.clip)
    return doc;
  return { ...doc, layers: doc.layers.toSpliced(at, 1, next) };
}

/** A mask showing everything, of this size. */
const fullMask = (width: number, height: number): Mask =>
  fillRect(createMask(width, height), { x: 0, y: 0, width, height }, 255);

/**
 * GB2: a layer mask for a pixel layer: showing all of it, or `mask` (its bitmap's size, as from
 * maskFromSelection). Refused when it has one.
 */
export function addLayerMask(doc: AnimationDoc, id: Id, mask?: Mask): AnimationDoc {
  const layer = pixelLayerOf(doc, id);
  const { bitmap } = layer.pixels;
  if (layer.pixels.mask) throw new EditError(`${layer.name} has a layer mask already.`);
  if (mask && (mask.width !== bitmap.width || mask.height !== bitmap.height))
    throw new EditError('The mask must be the size of the layer.');
  const given = mask ?? fullMask(bitmap.width, bitmap.height);
  return changeLayer(doc, id, (l) => ({ ...l, pixels: { ...l.pixels!, mask: given } }));
}

/**
 * GB2: the selection (the image's size, at 0, 0) as a layer mask for this layer's pixels (its
 * bitmap's size, where it lies): selected parts shown, the rest hidden.
 */
export function maskFromSelection(selection: Mask, pixels: PixelContent): Mask {
  return cropRaster(selection, {
    x: pixels.x,
    y: pixels.y,
    width: pixels.bitmap.width,
    height: pixels.bitmap.height,
  });
}

/** The bitmap with its alpha times the mask's (what the mask hid made transparent). */
export function applyMask(bitmap: Bitmap, mask: Mask): Bitmap {
  return editRegion(
    bitmap,
    { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
    (tile, at) => {
      const shown = readRegion(mask, at);
      let changed = false;
      for (let p = 0; p < shown.length; p++) {
        const a = tile[p * 4 + 3]!;
        const next = Math.round((a * shown[p]!) / 255);
        if (next === a) continue;
        tile[p * 4 + 3] = next;
        if (next === 0) tile[p * 4] = tile[p * 4 + 1] = tile[p * 4 + 2] = 0;
        changed = true;
      }
      return changed;
    },
  );
}

/** GB2: the layer mask taken off: `apply` makes what it hid transparent, else it is thrown away. */
export function removeLayerMask(doc: AnimationDoc, id: Id, apply: boolean): AnimationDoc {
  const layer = pixelLayerOf(doc, id);
  const { mask, ...rest } = layer.pixels;
  if (!mask) throw new EditError(`${layer.name} has no layer mask.`);
  return changeLayer(doc, id, (l) => ({
    ...l,
    pixels: { ...rest, bitmap: apply ? applyMask(rest.bitmap, mask) : rest.bitmap },
  }));
}

/** Every object with new ids, its children too (as Duplicate does). */
function withNewIds(object: AnimObject): AnimObject {
  const copy = { ...object, id: newId() };
  return copy.kind === 'group' ? { ...copy, children: copy.children.map(withNewIds) } : copy;
}

/**
 * G2: a copy of a layer just above it, named "<name> copy": its objects with new ids (each named
 * once, "Star 2" beside "Star"), or its pixels (the same tiles: nothing is copied until one of
 * them is changed).
 */
export function duplicateLayer(doc: AnimationDoc, id: Id): { doc: AnimationDoc; layer: Layer } {
  const at = doc.layers.findIndex((l) => l.id === id);
  const layer = doc.layers[at];
  if (!layer) throw new EditError('That layer no longer exists.');
  let copy: Layer = {
    ...layer,
    id: newId(),
    name: freeLayerName(doc, `${layer.name} copy`),
    objects: [],
    locked: false,
  };
  let next: AnimationDoc = { ...doc, layers: doc.layers.toSpliced(at + 1, 0, copy) };
  for (const object of layer.objects) {
    const named = { ...withNewIds(object), name: uniqueName(next, object.name) };
    copy = { ...copy, objects: [...copy.objects, named] };
    next = { ...next, layers: next.layers.toSpliced(at + 1, 1, copy) };
  }
  return { doc: next, layer: copy };
}
