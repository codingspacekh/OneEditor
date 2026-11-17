// G2 (M21): merge down, merge visible and flatten. The layers are put together tile by tile with
// composite.ts exactly as drawStage draws them on the canvas: each layer at its opacity, in its
// blend mode, through its layer mask; a clipping mask's base drawn into a picture of its own with
// the layers clipped to it (each seen only where that picture has something drawn, at its own
// opacity and blend), the picture then put down at the base's opacity and blend. A vector layer
// is drawn into pixels first (the app asks the renderer: StageRenderer.renderPixels of
// layerAlone), after which its shapes can no longer be edited one by one. G14 (M22): a pixel
// layer with effects is drawn into pixels by the renderer too, with them (the canvas's shadows and
// blur cannot be worked here exactly as the stage draws them): on its own, or, when it is the base
// of a clipping group, with the layers merged that are clipped to it (its effects are made from
// the whole group, as the stage draws it), so those are not put down again.
import { hexToRgb } from '../../colour.ts';
import { TRANSPARENT } from '../../animation/rules.ts';
import type { AnimationDoc, BlendMode, Id, Layer, PixelContent } from '../../animation/types.ts';
import { EditError } from '../../model/errors.ts';
import { clipBaseIndex, isLayerShown, isSpecialLayer as special } from './clipping.ts';
import { alphaOf, compositeOnto, multiplyMasks } from './composite.ts';
import {
  createBitmap,
  editRegion,
  intersect,
  readRegion,
  type Bitmap,
  type Rect,
} from './raster.ts';

/** One layer as it is drawn: its pixels where they lie, and how they mix. */
export interface DrawnLayer {
  pixels: PixelContent;
  opacity: number;
  blend: BlendMode;
  /** Seen only where the nearest unclipped layer below has something drawn. */
  clip: boolean;
}

const placeOf = (p: PixelContent): Rect => ({
  x: p.x,
  y: p.y,
  width: p.bitmap.width,
  height: p.bitmap.height,
});

/**
 * GB2 (M21): the visible pixel layers as compositeLayers draws them, bottom first (vector,
 * template and AN12 mask layers left out): what the magic wand's "All layers" looks at.
 */
export function drawnPixelLayers(doc: AnimationDoc): DrawnLayer[] {
  return doc.layers.flatMap((l) =>
    l.visible && l.pixels && !l.template && !l.mask
      ? [{ pixels: l.pixels, opacity: l.opacity ?? 1, blend: l.blend ?? 'normal', clip: !!l.clip }]
      : [],
  );
}

/** A layer's pixels and mask over `region` (image px), or null when it has none there. */
function pixelsIn(
  p: PixelContent,
  region: Rect,
): { rgba: Uint8ClampedArray; mask: Uint8ClampedArray | null } | null {
  if (!intersect(placeOf(p), region)) return null;
  const own = { ...region, x: region.x - p.x, y: region.y - p.y };
  return { rgba: readRegion(p.bitmap, own), mask: p.mask ? readRegion(p.mask, own) : null };
}

/** The layers (bottom first) put down onto `backdrop`, the pixels of `region`, in place. */
function drawLayers(backdrop: Uint8ClampedArray, layers: readonly DrawnLayer[], region: Rect) {
  for (let i = 0; i < layers.length; i++) {
    const base = layers[i]!;
    let end = i + 1;
    while (end < layers.length && layers[end]!.clip) end++;
    const clipped = layers.slice(i + 1, end);
    i = end - 1;
    const own = pixelsIn(base.pixels, region);
    if (clipped.length === 0) {
      if (own) compositeOnto(backdrop, own.rgba, { ...base, mask: own.mask });
      continue;
    }
    // A clipping group: the base at full strength, the clipped layers on it, then all of it.
    const group = new Uint8ClampedArray(backdrop.length);
    if (!own) continue; // nothing of the base here: nothing of the group shows
    compositeOnto(group, own.rgba, { mask: own.mask });
    for (const layer of clipped) {
      const top = pixelsIn(layer.pixels, region);
      if (!top) continue;
      const mask = multiplyMasks(top.mask, alphaOf(group));
      compositeOnto(group, top.rgba, { blend: layer.blend, opacity: layer.opacity, mask });
    }
    compositeOnto(backdrop, group, { blend: base.blend, opacity: base.opacity });
  }
}

/**
 * The layers (bottom first) drawn as the stage draws them into one bitmap covering `area` (image
 * px), on `background` (a colour, or transparent when absent). Worked tile by tile: a tile with
 * nothing in it stays null.
 */
export function compositeLayers(
  layers: readonly DrawnLayer[],
  area: Rect,
  background?: string,
): Bitmap {
  const bg = background && background !== TRANSPARENT ? hexToRgb(background) : null;
  // A clipped layer with no base below it is drawn as an ordinary layer (as drawStage does).
  const drawn = layers.map((l, i) => (i === 0 && l.clip ? { ...l, clip: false } : l));
  return editRegion(
    createBitmap(area.width, area.height),
    { x: 0, y: 0, width: area.width, height: area.height },
    (tile, at) => {
      if (bg)
        for (let k = 0; k < tile.length; k += 4) {
          tile[k] = bg.r;
          tile[k + 1] = bg.g;
          tile[k + 2] = bg.b;
          tile[k + 3] = 255;
        }
      drawLayers(tile, drawn, { ...at, x: area.x + at.x, y: area.y + at.y });
      return true;
    },
  );
}

// ---- the merges on the document ----

export type MergeHow = 'down' | 'visible' | 'flatten';

export const MERGE_LABELS: Record<MergeHow, string> = {
  down: 'Merge down',
  visible: 'Merge visible',
  flatten: 'Flatten image',
};

export interface MergePlan {
  /** The layers merged, bottom first (the first one's place, name and folder are kept). */
  ids: Id[];
  /** The vector layers among them, to be drawn into pixels first (canvas-sized, at 0, 0). */
  vector: Id[];
  /**
   * G14 (M22): the pixel layers among them with effects, drawn into pixels with them first
   * (canvas-sized, at 0, 0: layerAlone with the plan's ids; what lies off the canvas is cut off,
   * as for a vector layer).
   */
  effects: Id[];
}

/** G14 (M22): a layer whose effects are drawn with it (G10, M23: a vector layer's too). */
const hasEffects = (l: Layer): boolean => (l.effects?.length ?? 0) > 0;

const layerOf = (doc: AnimationDoc, id: Id): Layer => {
  const layer = doc.layers.find((l) => l.id === id);
  if (!layer) throw new EditError('That layer no longer exists.');
  return layer;
};

function mergeable(layer: Layer): Layer {
  if (layer.locked) throw new EditError(`${layer.name} is locked. Unlock it to merge it.`);
  if (!layer.visible) throw new EditError(`${layer.name} is hidden. Show it to merge it.`);
  if (special(layer))
    throw new EditError(
      `${layer.name} is a ${layer.mask ? 'mask' : 'template'}: it cannot be merged.`,
    );
  return layer;
}

/** Which layers a merge takes, or why it cannot be done (EditError). */
export function mergePlan(doc: AnimationDoc, how: MergeHow, layerId: Id): MergePlan {
  if (!doc.graphic) throw new EditError('Merging layers is for Graphics mode.');
  let layers: Layer[];
  if (how === 'down') {
    const top = layerOf(doc, layerId);
    const below = doc.layers[doc.layers.indexOf(top) - 1];
    if (!below) throw new EditError(`There is no layer below ${top.name} to merge it into.`);
    layers = [mergeable(below), mergeable(top)];
  } else {
    // What the stage shows (AN12: a mask layer showing goes too, as what it showed of the
    // layer below is in the pixels; a layer clipped to a hidden one is not shown).
    layers = doc.layers.filter((l, i) => isLayerShown(doc.layers, i) && !special(l)).map(mergeable);
    if (how === 'visible' && layers.length < 2)
      throw new EditError('Only one layer is showing: there is nothing to merge it with.');
    if (layers.length === 0)
      throw new EditError('No layer is showing: there is nothing to flatten.');
  }
  return {
    ids: layers.map((l) => l.id),
    vector: layers.filter((l) => !l.pixels).map((l) => l.id),
    // A vector layer is drawn by the renderer anyway (with its effects): listed once.
    effects: layers.filter((l) => l.pixels && hasEffects(l)).map((l) => l.id),
  };
}

/**
 * A layer on its own, as a document to draw into pixels: only it (and the mask layer above it,
 * AN12), at full strength, in normal mode, unclipped, on a transparent stage at frame 0. G14
 * (M22): a pixel layer with effects keeps them, and the layers clipped to it that are `merged`
 * and shown come with it, as they are (its effects are made from the group).
 */
export function layerAlone(doc: AnimationDoc, id: Id, merged: readonly Id[] = []): AnimationDoc {
  const at = doc.layers.findIndex((l) => l.id === id);
  const layer = doc.layers[at];
  if (!layer) throw new EditError('That layer no longer exists.');
  const mask = doc.layers[at + 1];
  const plain: Layer = { ...layer, visible: true };
  delete plain.opacity;
  delete plain.blend;
  delete plain.clip;
  const alone: AnimationDoc = {
    ...doc,
    stage: { ...doc.stage, background: TRANSPARENT, length: 1 },
    layers: mask?.mask && mask.visible ? [plain, { ...mask, locked: true }] : [plain],
  };
  if (!hasEffects(layer)) return alone;
  const group = new Set(merged);
  const clipped = doc.layers.filter(
    (l, j) => j > at && l.visible && group.has(l.id) && clipBaseIndex(doc.layers, j) === at,
  );
  return clipped.length ? { ...alone, layers: [plain, ...clipped] } : alone;
}

/**
 * The merge done: the layers of the plan become one pixel layer in the first one's place, with
 * its id, name and folder; `rastered` gives each vector layer's pixels (canvas-sized, at 0, 0).
 * Merge down keeps the lower layer's blend mode and clipping (its opacity and mask go into the
 * pixels); merge visible makes an ordinary layer; flatten puts everything on the stage's
 * background, on the canvas, drops the hidden layers and the folders (templates stay).
 */
export function mergeLayers(
  doc: AnimationDoc,
  how: MergeHow,
  layerId: Id,
  rastered: Readonly<Record<Id, Bitmap>>,
): AnimationDoc {
  const plan = mergePlan(doc, how, layerId);
  const canvas: Rect = { x: 0, y: 0, width: doc.stage.width, height: doc.stage.height };
  const layers = plan.ids.map((id) => layerOf(doc, id));
  const drawn: DrawnLayer[] = layers.map((l) => {
    const bitmap = rastered[l.id];
    const index = doc.layers.indexOf(l);
    if ((!l.pixels || hasEffects(l)) && !bitmap)
      throw new EditError('The layers changed while they were being merged. Try again.');
    return {
      // G14 (M22): a layer with effects as the renderer drew it, its mask and effects in it.
      pixels: l.pixels && !hasEffects(l) ? l.pixels : { bitmap: bitmap!, x: 0, y: 0 },
      opacity: l.opacity ?? 1,
      blend: l.blend ?? 'normal',
      // Clipped to a layer that is merged with it, else drawn as an ordinary layer.
      clip: clipBaseIndex(doc.layers, index) >= 0,
    };
  });
  const bottom = layers[0]!;
  if (how === 'down') {
    // The lower layer's blend and clipping stay on the merged layer, so inside it the lower
    // layer is plain, and the upper one is clipped to it only if it was its base.
    drawn[0] = { ...drawn[0]!, blend: 'normal', clip: false };
    if (bottom.clip) drawn[1] = { ...drawn[1]!, clip: false };
  }
  // G14 (M22): a layer clipped to a merged base with effects is in that base's pixels already.
  const inGroup = (l: Layer): boolean => {
    const base = doc.layers[clipBaseIndex(doc.layers, doc.layers.indexOf(l))];
    return base !== undefined && hasEffects(base) && plan.ids.includes(base.id);
  };
  const put = drawn.filter((_, k) => !inGroup(layers[k]!));
  // What it covers: the canvas when flattening, else every pixel layer's place and the canvas
  // for a vector layer.
  const area =
    how === 'flatten'
      ? canvas
      : put
          .map((d) => placeOf(d.pixels))
          .reduce((a, b) => {
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            return {
              x,
              y,
              width: Math.max(a.x + a.width, b.x + b.width) - x,
              height: Math.max(a.y + a.height, b.y + b.height) - y,
            };
          });
  const bitmap = compositeLayers(put, area, how === 'flatten' ? doc.stage.background : undefined);
  const merged: Layer = {
    id: bottom.id,
    name: how === 'flatten' ? 'Background' : bottom.name,
    visible: true,
    locked: false,
    objects: [],
    pixels: { bitmap, x: area.x, y: area.y },
    ...(bottom.colour ? { colour: bottom.colour } : {}),
    ...(how !== 'flatten' && bottom.folderId ? { folderId: bottom.folderId } : {}),
    ...(how === 'down' && bottom.blend ? { blend: bottom.blend } : {}),
    ...(how === 'down' && bottom.clip ? { clip: true } : {}),
  };
  const gone = new Set(plan.ids);
  const at = doc.layers.indexOf(bottom);
  // The mask layers (AN12) of the layers merged went into their pixels.
  const masks = new Set(
    doc.layers
      .filter((l, i) => l.mask && gone.has(doc.layers[i - 1]?.id ?? '') && how !== 'down')
      .map((l) => l.id),
  );
  const kept = doc.layers.flatMap((l, i): Layer[] => {
    if (i === at) return [merged];
    if (gone.has(l.id) || masks.has(l.id)) return [];
    if (how === 'flatten' && !l.template) return []; // hidden layers are dropped
    if (how === 'flatten') {
      const free = { ...l };
      delete free.folderId;
      return [free];
    }
    return [l];
  });
  return { ...doc, layers: kept, ...(how === 'flatten' ? { folders: [] } : {}) };
}
