// M22 step 4 (GB5, GN2): Graphics mode's Filter menu — Gaussian, motion and zoom blur, twirl,
// sharpen, bulge / pinch, perspective and warp — each run in the pixel worker through the one way
// to apply a pixel operation (pixel-ops.ts): the current pixel layer or its mask, inside the
// selection, one undo step named after the filter; previewed live (on a reduced copy of a big
// layer) while its dialog is open. A filter's settings are in image px, as typed or dragged on
// the stage; each run places them on the layer's pixels (filterInRaster).
import { EditError } from '../../core/model/errors.ts';
import {
  defaultFilter,
  FILTER_NAMES,
  filterInRaster,
  filterProblem,
  type FilterKind,
  type FilterSpec,
} from '../../core/graphics/pixels/filter-specs.ts';
import { applyPatch } from '../../core/graphics/pixels/jobs.ts';
import { isPixelLayer } from '../../core/graphics/pixels/layers.ts';
import { intersect } from '../../core/graphics/pixels/raster.ts';
import { selectedBounds } from '../../core/graphics/pixels/selection.ts';
import { pixelsBox } from '../../core/graphics/pixels/transform.ts';
import type { AnimationContext } from './context.ts';
import { pixelOpActions, type PixelOperation } from './pixel-ops.ts';

type PixelOps = Pick<
  ReturnType<typeof pixelOpActions>,
  'applyPixelOperation' | 'previewPixelOperation'
>;

export function filterActions(ctx: AnimationContext, ops: PixelOps = pixelOpActions(ctx)) {
  /** The filter as a pixel operation, run in the pixel worker (answering with a patch). */
  const operation =
    (spec: FilterSpec): PixelOperation =>
    async (raster, place) =>
      applyPatch(
        raster,
        await ctx.services.pixelWorker.run('filter', {
          raster,
          spec: filterInRaster(spec, place),
        }),
      );

  return {
    /**
     * GB5: the filter done on the current pixel layer (or its mask), inside the selection, as one
     * undo step named after it; the preview goes. A setting out of range is refused in words.
     * True when the pixels changed.
     */
    async applyFilter(spec: FilterSpec): Promise<boolean> {
      const problem = filterProblem(spec);
      if (problem) {
        await ops.previewPixelOperation(null);
        ctx.showError(new EditError(problem));
        return false;
      }
      return ops.applyPixelOperation(FILTER_NAMES[spec.kind], operation(spec));
    },

    /**
     * GB5, GN2: the filter shown live on the stage; null (or settings that cannot be used) takes
     * the preview away, so the layer shows as it is.
     */
    previewFilter(spec: FilterSpec | null): Promise<void> {
      return ops.previewPixelOperation(spec && !filterProblem(spec) ? operation(spec) : null);
    },

    /**
     * The settings a filter's dialog opens with, on the current pixel layer: a centre and circle
     * on the selected part (or the layer's middle), the corners and mesh on the layer. Null when
     * the current layer is not a pixel layer.
     */
    filterStart(kind: FilterKind): FilterSpec | null {
      const { layerId, history, pixelSelection } = ctx.store.get();
      const doc = history.present;
      const layer = doc.layers.find((l) => l.id === layerId);
      if (!isPixelLayer(layer)) return null;
      const box = pixelsBox(layer.pixels);
      const current =
        pixelSelection &&
        pixelSelection.width === doc.stage.width &&
        pixelSelection.height === doc.stage.height
          ? selectedBounds(pixelSelection)
          : null;
      const focus = (current && intersect(current, box)) ?? box;
      return defaultFilter(kind, box, focus);
    },
  };
}
