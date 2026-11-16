// M21 step 3 (GB2, G8, G13): the pixel selection in Graphics mode. It is kept beside the document
// (AnimationState.pixelSelection, image-sized): not saved and not an undo step, as in Photoshop,
// so Undo undoes the last change to the picture. It is made by the marquee, lasso, magic wand
// and colour select tools, from vector shapes and text or from a layer's pixels, joined to the
// one there is (new, add, subtract, intersect) and changed (all, none, invert, feather, grow,
// shrink, smooth). What is done with it on the current pixel layer is one undo step each,
// refused on a locked or hidden layer: copy or cut to a new layer, delete to transparent (Remove
// background), fade (G13), crop the image to it (G8), a layer mask from it.
import type { Point } from '../../core/animation/geometry.ts';
import { addLayer, changeLayer, findObject } from '../../core/animation/layers.ts';
import { objectAt } from '../../core/animation/tween.ts';
import type { AnimObject, Id, Layer, PixelContent } from '../../core/animation/types.ts';
import { lettersGroup } from '../../core/graphics/text-outlines.ts';
import {
  copySelected,
  cropToSelection,
  fadeSelected,
  layerMaskFromSelection,
  selectionFromLayer,
} from '../../core/graphics/pixels/cutout.ts';
import { floodMask, similarMask } from '../../core/graphics/pixels/flood.ts';
import { changePixels, isPixelLayer, pixelLayerOf } from '../../core/graphics/pixels/layers.ts';
import { magneticPath } from '../../core/graphics/pixels/magnetic.ts';
import { pixelAt, type Bitmap, type Mask, type Rect } from '../../core/graphics/pixels/raster.ts';
import { objectsMask } from '../../core/graphics/pixels/select-objects.ts';
import {
  combineMasks,
  ellipseMask,
  featherMask,
  growMask,
  invertMask,
  isEmptyMask,
  placeMask,
  polygonMask,
  rectMask,
  selectAllMask,
  smoothMask,
  type SelectMode,
} from '../../core/graphics/pixels/selection.ts';
import { EditError } from '../../core/model/errors.ts';
import type { AnimationContext } from './context.ts';
import { withLetters } from './letters-wait.ts';

/** How a new selection is made: joined as `mode` (new by default), feathered by `feather` px. */
export interface SelectOptions {
  mode?: SelectMode;
  feather?: number;
  /** Soft edges on the marquees and lassos (default on). */
  antiAlias?: boolean;
}

/** Pixels to pick colours from, with their top-left pixel's place on the image. */
export interface PixelSample {
  bitmap: Bitmap;
  x: number;
  y: number;
}

export interface WandOptions extends SelectOptions {
  /** 0–255 a channel. */
  tolerance: number;
  contiguous: boolean;
  /**
   * What the wand looks at: the current layer's pixels by default; "all layers" passes the
   * picture as drawn (every layer merged).
   */
  sample?: PixelSample;
}

export interface ColourOptions extends SelectOptions {
  /** 0–255: how far a colour may be from the one picked; the selection fades out to it. */
  fuzziness: number;
  sample?: PixelSample;
}

const NOTHING_SELECTED = 'Select part of the image first.';

export function pixelSelectionActions(ctx: AnimationContext) {
  const { store, patch, present, run, currentLayer, liveSelection } = ctx;

  const say = (text: string) => patch({ message: { kind: 'error', text } });

  /** The selection, if it was made on an image of this size (else it is stale: none). */
  function current(): Mask | undefined {
    const m = store.get().pixelSelection;
    const { width, height } = present().stage;
    return m && m.width === width && m.height === height ? m : undefined;
  }

  function set(m: Mask | undefined): void {
    patch({ pixelSelection: m && !isEmptyMask(m) ? m : undefined });
  }

  /** The new selection, feathered, joined to the one there is. */
  function select(mask: Mask, { mode = 'new', feather = 0 }: SelectOptions = {}): void {
    set(combineMasks(current(), feather > 0 ? featherMask(mask, feather) : mask, mode));
  }

  const size = () => present().stage;

  /** The current layer's pixels, or null (it says so) when it is not a pixel layer. */
  function pixelLayer(quiet = false): (Layer & { pixels: PixelContent }) | null {
    const layer = currentLayer();
    if (isPixelLayer(layer)) return layer;
    if (!quiet) say('Choose a pixel layer first.');
    return null;
  }

  function sampleOf(given?: PixelSample): PixelSample | null {
    if (given) return given;
    const layer = pixelLayer();
    return layer ? { bitmap: layer.pixels.bitmap, x: layer.pixels.x, y: layer.pixels.y } : null;
  }

  /** The selection to work with, or undefined (it says so). */
  function needed(): Mask | undefined {
    const m = current();
    if (!m) say(NOTHING_SELECTED);
    return m;
  }

  function change(edit: (m: Mask) => Mask): void {
    const m = needed();
    if (m) set(edit(m));
  }

  /** One undo step on the current pixel layer's pixels with the selection there is. */
  function onPixels(label: string, edit: (p: PixelContent, m: Mask) => PixelContent): boolean {
    const m = needed();
    const layer = m ? pixelLayer() : null;
    if (!m || !layer) return false;
    return run({ label, apply: (doc) => changePixels(doc, layer.id, (p) => edit(p, m)) });
  }

  /** Layer via Copy / Cut: the selected pixels on a new layer above, which becomes current. */
  function toLayer(cut: boolean): void {
    const m = needed();
    const layer = m ? pixelLayer() : null;
    if (!m || !layer) return;
    const made: { id?: Id } = {};
    const done = run({
      label: cut ? 'Cut to new layer' : 'Copy to new layer',
      apply: (doc) => {
        const copy = copySelected(pixelLayerOf(doc, layer.id).pixels, m);
        if (!copy)
          throw new EditError('Nothing selected shows on this layer: it is transparent there.');
        const from = cut ? changePixels(doc, layer.id, (p) => fadeSelected(p, m, 0)) : doc;
        const { doc: next, layer: added } = addLayer(from, undefined, layer.id);
        made.id = added.id;
        return changeLayer(next, added.id, (l) => ({ ...l, pixels: copy }));
      },
    });
    if (done && made.id) patch({ layerId: made.id, pixelSelection: undefined });
  }

  return {
    /** GB2: the selection on this image (image-sized), or undefined when there is none. */
    pixelSelection: current,
    hasPixelSelection: (): boolean => current() !== undefined,
    /** Whether the current layer is a pixel layer (the pixel tools work on it). */
    onPixelLayer: (): boolean => pixelLayer(true) !== null,

    // ---- making a selection ----

    /** GB2 rectangular marquee (image px). */
    selectRect(r: Rect, options: SelectOptions = {}): void {
      const { width, height } = size();
      select(rectMask(width, height, r, options.antiAlias ?? true), options);
    },
    /** GB2 elliptical marquee. */
    selectEllipse(r: Rect, options: SelectOptions = {}): void {
      const { width, height } = size();
      select(ellipseMask(width, height, r, options.antiAlias ?? true), options);
    },
    /** GB2 lasso, polygonal lasso and magnetic lasso: the area inside the points. */
    selectLasso(points: readonly Point[], options: SelectOptions = {}): void {
      const { width, height } = size();
      const antiAlias = options.antiAlias ?? true;
      select(polygonMask(width, height, [points], { antiAlias }), options);
    },
    /** GB2 magic wand: the pixels like the one clicked (image px), on the layer or `sample`. */
    selectByWand(at: Point, options: WandOptions): void {
      const sample = sampleOf(options.sample);
      if (!sample) return;
      const { width, height } = size();
      const found = floodMask(sample.bitmap, at.x - sample.x, at.y - sample.y, options);
      select(placeMask(found, sample.x, sample.y, width, height), options);
    },
    /** GB2 colour select: every pixel near the clicked one's colour, fading out (fuzziness). */
    selectByColour(at: Point, options: ColourOptions): void {
      const sample = sampleOf(options.sample);
      if (!sample) return;
      const colour = pixelAt(
        sample.bitmap,
        Math.floor(at.x - sample.x),
        Math.floor(at.y - sample.y),
      );
      const { width, height } = size();
      const found = similarMask(sample.bitmap, colour, {
        tolerance: options.fuzziness,
        soft: true,
      });
      select(placeMask(found, sample.x, sample.y, width, height), options);
    },
    /**
     * GB2 Select ▸ From shape: the selected vector objects' areas (text as its letters, read
     * from the font the first time). M/25 Tier: the jigsaw piece selects the part to cut. Returns
     * why not, or null.
     */
    selectFromObjects(options: SelectOptions = {}): string | null {
      const ids = liveSelection();
      if (ids.length === 0) return 'Select the shapes or text to make the selection from.';
      return withLetters(ctx, ids, () => {
        const { frame } = store.get();
        const objects: AnimObject[] = ids.flatMap((id) => {
          const found = findObject(present(), id);
          return found ? [objectAt(found.object, frame)] : [];
        });
        const { width, height } = size();
        try {
          select(objectsMask(width, height, objects, lettersGroup), options);
          return null;
        } catch (error) {
          // The letters' outlines cannot be read (not a bundled font): it says why.
          return (error as Error).message;
        }
      });
    },
    /** GB2 Select ▸ Layer pixels: what the current layer shows. */
    selectLayerPixels(options: SelectOptions = {}): void {
      const layer = pixelLayer();
      if (!layer) return;
      const { width, height } = size();
      select(selectionFromLayer(layer.pixels, width, height), options);
    },
    /** The magnetic lasso's path between two points along the current layer's edges. */
    magneticPath(from: Point, to: Point): Point[] {
      const layer = pixelLayer(true);
      if (!layer) return [from, to];
      return magneticPath(layer.pixels.bitmap, layer.pixels, from, to);
    },

    // ---- changing it ----

    selectAllPixels(): void {
      const { width, height } = size();
      set(selectAllMask(width, height));
    },
    deselectPixels(): void {
      set(undefined);
    },
    /** Select ▸ Invert (with nothing selected: everything). */
    invertPixelSelection(): void {
      const { width, height } = size();
      set(current() ? invertMask(current()!) : selectAllMask(width, height));
    },
    featherPixelSelection(px: number): void {
      change((m) => featherMask(m, px));
    },
    /** Grow by px (a negative px shrinks). */
    growPixelSelection(px: number): void {
      change((m) => growMask(m, px));
    },
    smoothPixelSelection(px: number): void {
      change((m) => smoothMask(m, px));
    },

    // ---- cut-outs (each one undo step) ----

    /** Layer via Copy (Ctrl/Cmd + J). */
    copySelectionToLayer: (): void => toLayer(false),
    /** Layer via Cut (Ctrl/Cmd + Shift + J). */
    cutSelectionToLayer: (): void => toLayer(true),
    /**
     * Delete on a pixel layer with a selection: the selected pixels made transparent (Remove
     * background: select the background, then Delete). False when it is not for this (no
     * selection, or not a pixel layer): Delete then deletes the selected objects.
     */
    deleteSelectedPixels(): boolean {
      if (!current() || !pixelLayer(true)) return false;
      onPixels('Delete selected pixels', (p, m) => fadeSelected(p, m, 0));
      return true;
    },
    /** G13 Edit ▸ Fade selection to …%: the selected pixels' opacity times percent / 100. */
    fadePixelSelection(percent: number): void {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      onPixels(`Fade selection to ${p}%`, (px, m) => fadeSelected(px, m, p / 100));
    },
    /** G8 Image ▸ Crop to selection: the image becomes the selection's bounds. */
    cropToPixelSelection(): void {
      const m = needed();
      if (m && run({ label: 'Crop to selection', apply: (doc) => cropToSelection(doc, m) }))
        set(undefined);
    },
    /** GB2: the selection as the current pixel layer's mask (the Layers panel shows it). */
    maskFromPixelSelection(): void {
      onPixels('Layer mask from selection', layerMaskFromSelection);
    },
  };
}
