// M22 (GB3, GB5, GN2): how every adjustment and filter reaches the pixels. An operation is a pure
// function from the pixels to new pixels of the same size (it may run in the pixel worker); it is
// done on the current pixel layer — or its layer mask while that is being edited — kept only
// inside the selection, as one undo step, refused on a locked or hidden layer. While its dialog is
// open it is previewed live on a reduced copy of a big layer (≤ 0.5 s on 12 megapixels), shown on
// the stage instead of the layer until it is applied or cancelled.
import type { AnimationDoc, Id, PixelContent } from '../../core/animation/types.ts';
import { reducedCopy, withinSelection } from '../../core/graphics/pixels/apply.ts';
import { changePixels, pixelLayerOf } from '../../core/graphics/pixels/layers.ts';
import {
  createMask,
  cropRaster,
  fillRect,
  type Mask,
  type Raster,
} from '../../core/graphics/pixels/raster.ts';
import { resampleMask } from '../../core/graphics/pixels/resample.ts';
import { EditError } from '../../core/model/errors.ts';
import type { AnimationContext } from './context.ts';

/**
 * An adjustment or filter: new pixels of the same size from `raster` (RGBA, or a mask's one
 * channel), which lies at `place` on the image (the image px under its top-left pixel) and whose
 * pixels each cover `scale` image px (1, or more for a reduced preview: a blur's radius in image
 * px is then divided by it). Must not change `raster`.
 */
export type PixelOperation = (
  raster: Raster,
  place: { x: number; y: number; scale: number },
) => Raster | Promise<Raster>;

/** GN2: the reduced copy a live preview works on. */
export const PREVIEW_PIXELS = 1_000_000;

const CHANGED = 'The layer changed while it was being worked on. Do it again.';

export function pixelOpActions(ctx: AnimationContext) {
  const { store, patch, present, run, showError } = ctx;

  /** What an operation works on now: the current pixel layer's pixels, or its mask. */
  function target() {
    const { layerId, editingMask } = store.get();
    const doc = present();
    const layer = pixelLayerOf(doc, layerId);
    // A change of no consequence, to have a locked or hidden layer refused as any other edit.
    changePixels(doc, layerId, (p) => ({ ...p }));
    const mask = editingMask === true;
    const { bitmap } = layer.pixels;
    const raster: Raster = mask
      ? (layer.pixels.mask ??
        fillRect(
          createMask(bitmap.width, bitmap.height),
          { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
          255,
        ))
      : bitmap;
    return { layerId, pixels: layer.pixels, mask, raster };
  }

  /** The selection, if it was made on an image of this size (else it is stale: none). */
  function selection(): Mask | undefined {
    const m = store.get().pixelSelection;
    const { width, height } = present().stage;
    return m && m.width === width && m.height === height ? m : undefined;
  }

  const withRaster = (p: PixelContent, mask: boolean, raster: Raster): PixelContent =>
    mask ? { ...p, mask: raster as Mask } : { ...p, bitmap: raster as PixelContent['bitmap'] };

  /** Each preview asked for has a number: an answer for an older one is dropped. */
  let asked = 0;

  return {
    /**
     * GB3, GB5: does `operation` on the current pixel layer (or its mask), inside the selection,
     * as one undo step labelled `label`; the preview, if any, goes. True when the pixels changed.
     */
    async applyPixelOperation(label: string, operation: PixelOperation): Promise<boolean> {
      asked++;
      let t: ReturnType<typeof target>;
      try {
        t = target();
      } catch (error) {
        patch({ pixelPreview: undefined });
        showError(error);
        return false;
      }
      patch({ busy: `${label}…` });
      try {
        const done = await operation(t.raster, { x: t.pixels.x, y: t.pixels.y, scale: 1 });
        const kept = withinSelection(t.raster, done, selection(), t.pixels.x, t.pixels.y);
        if (kept === t.raster) return false;
        return run({
          label,
          apply: (doc: AnimationDoc) =>
            changePixels(doc, t.layerId, (p) => {
              if ((t.mask ? p.mask : p.bitmap) !== (t.mask ? t.pixels.mask : t.pixels.bitmap))
                throw new EditError(CHANGED);
              return withRaster(p, t.mask, kept);
            }),
        });
      } catch (error) {
        showError(error);
        return false;
      } finally {
        patch({ busy: null, pixelPreview: undefined });
      }
    },

    /**
     * GN2: shows `operation` live on the current pixel layer (a reduced copy of a big one, inside
     * the selection), or takes the preview away (null). Errors leave the layer as it is.
     */
    async previewPixelOperation(operation: PixelOperation | null): Promise<void> {
      const mine = ++asked;
      if (!operation) {
        patch({ pixelPreview: undefined });
        return;
      }
      let t: ReturnType<typeof target>;
      try {
        t = target();
      } catch {
        return;
      }
      // The layer and its mask reduced together; the operation done on the one it works on.
      const small = reducedCopy(
        { ...t.pixels, ...(t.mask ? { mask: t.raster as Mask } : {}) },
        PREVIEW_PIXELS,
      );
      const scale = small.scale ?? 1;
      const source: Raster = t.mask ? small.mask! : small.bitmap;
      let done: Raster;
      try {
        done = await operation(source, { x: t.pixels.x, y: t.pixels.y, scale });
      } catch {
        return;
      }
      if (mine !== asked) return;
      // The selection over the layer, reduced with it.
      const sel = selection();
      const kept = !sel
        ? done
        : scale === 1
          ? withinSelection(source, done, sel, t.pixels.x, t.pixels.y)
          : withinSelection(
              source,
              done,
              resampleMask(
                cropRaster(sel, {
                  x: t.pixels.x,
                  y: t.pixels.y,
                  width: t.raster.width,
                  height: t.raster.height,
                }),
                source.width,
                source.height,
                'bilinear',
              ),
              0,
              0,
            );
      patch({
        pixelPreview: { layerId: t.layerId, pixels: withRaster(small, t.mask, kept) },
      });
    },

    /** The preview shown now, if any (for the stage). */
    pixelPreview: (): { layerId: Id; pixels: PixelContent } | undefined => store.get().pixelPreview,
  };
}
