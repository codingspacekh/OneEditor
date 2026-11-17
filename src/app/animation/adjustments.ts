// M22 (GB3): Graphics mode's adjustments (Image ▸ Adjustments ▸) — greyscale, black and white,
// brightness / contrast, levels, exposure, colour balance, shadows / highlights, hue / saturation
// and colourise, temperature / tint, replace colour, invert — each done in the pixel worker
// through the one way to apply a pixel operation (pixel-ops.ts): the current pixel layer or its
// mask, inside the selection, one undo step; previewed live while its dialog is open. And the
// colour under a point of the image, for Replace colour's eyedropper.
import type { Point } from '../../core/animation/geometry.ts';
import {
  adjustmentLabel,
  type AdjustmentKind,
  type AdjustmentSettings,
  type AnyAdjustment,
} from '../../core/graphics/pixels/adjust.ts';
import { applyPatch } from '../../core/graphics/pixels/jobs.ts';
import { isPixelLayer } from '../../core/graphics/pixels/layers.ts';
import { pixelAt } from '../../core/graphics/pixels/raster.ts';
import { rgbToHex } from '../../core/colour.ts';
import type { AnimationContext } from './context.ts';
import { pixelOpActions, type PixelOperation } from './pixel-ops.ts';

type PixelOps = Pick<
  ReturnType<typeof pixelOpActions>,
  'applyPixelOperation' | 'previewPixelOperation'
>;

export function adjustmentActions(ctx: AnimationContext, ops: PixelOps = pixelOpActions(ctx)) {
  /** The adjustment as a pixel operation, run in the pixel worker (answering with a patch). */
  const operation =
    (adjustment: AnyAdjustment): PixelOperation =>
    async (raster, place) =>
      applyPatch(
        raster,
        await ctx.services.pixelWorker.run('adjust', { raster, adjustment, scale: place.scale }),
      );
  const of = <K extends AdjustmentKind>(kind: K, settings: AdjustmentSettings[K]) =>
    ({ kind, settings }) as AnyAdjustment;

  return {
    /**
     * GB3: the adjustment done on the current pixel layer (or its mask), inside the selection,
     * as one undo step named after it; the preview goes. True when the pixels changed.
     */
    adjust<K extends AdjustmentKind>(kind: K, settings: AdjustmentSettings[K]): Promise<boolean> {
      return ops.applyPixelOperation(adjustmentLabel(kind), operation(of(kind, settings)));
    },

    /** GB3, GN2: the adjustment shown live on the stage (null: the preview taken away). */
    previewAdjust<K extends AdjustmentKind>(
      kind: K,
      settings: AdjustmentSettings[K] | null,
    ): Promise<void> {
      return ops.previewPixelOperation(settings ? operation(of(kind, settings)) : null);
    },

    /**
     * GB3: the colour (#rrggbb) of the current pixel layer at `point` (image px), as it is in the
     * document (not the preview); null where it is transparent, off the layer or not a pixels one.
     */
    colourUnder(point: Point): string | null {
      const { layerId, history } = ctx.store.get();
      const layer = history.present.layers.find((l) => l.id === layerId);
      if (!isPixelLayer(layer)) return null;
      const { bitmap, x, y } = layer.pixels;
      const [r, g, b, a] = pixelAt(bitmap, Math.floor(point.x - x), Math.floor(point.y - y));
      return a === 0 ? null : rgbToHex({ r, g, b });
    },
  };
}
