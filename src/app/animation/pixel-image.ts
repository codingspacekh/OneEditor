// M21 GB6, G8 (Graphics mode): the image's own actions on a bitmap image — Image size (resampled,
// or only the resolution changed), Canvas size (an anchor, the new area transparent or a colour),
// crop to a typed box, Trim / Crop to content (transparent or plain edges) and Reduce colours on
// the current pixel layer. Each is one undo step. The selection (GB2), kept beside the document
// at the image's size, is resized, shifted or cropped with the image so it stays where it was.
// Image and canvas changes take in every layer, locked or not (as cropping the canvas does);
// Reduce colours changes one layer's pixels and is refused on a locked one. M23 (GN2): on a big
// image Image size and Reduce colours are done in the pixel worker and made one undo step when
// it answers; Undo puts the selection back as it was (GB2).
import type { AnimCommand } from '../animation-commands.ts';
import type { Bounds } from '../../core/animation/geometry.ts';
import type { AnimationDoc } from '../../core/animation/types.ts';
import { setImage } from '../../core/graphics/document.ts';
import {
  canvasOffset,
  contentBox,
  cropImage,
  resizeCanvas,
  resizeImage,
  type CanvasChange,
  type Resampler,
} from '../../core/graphics/image-size.ts';
import { applyPatch } from '../../core/graphics/pixels/jobs.ts';
import { changePixels, isPixelLayer } from '../../core/graphics/pixels/layers.ts';
import {
  createBitmap,
  createMask,
  cropRaster,
  type Mask,
  type Raster,
} from '../../core/graphics/pixels/raster.ts';
import {
  reduceColours as reduced,
  type ColourTarget,
} from '../../core/graphics/pixels/reduce-colours.ts';
import { resampleMask, type ResampleMethod } from '../../core/graphics/pixels/resample.ts';
import { EditError } from '../../core/model/errors.ts';
import type { AnimationContext } from './context.ts';
import { PAGE_PIXELS } from './pixel-ops.ts';

const CHANGED = 'The image changed while it was being worked on. Do it again.';

/** How many pixels the image's pixel layers hold (their bitmaps and masks). */
const pixelsIn = (doc: AnimationDoc): number =>
  doc.layers.reduce(
    (n, l) =>
      n + (l.pixels ? l.pixels.bitmap.width * l.pixels.bitmap.height * (l.pixels.mask ? 2 : 1) : 0),
    0,
  );

const command = (label: string, apply: (doc: AnimationDoc) => AnimationDoc): AnimCommand => ({
  label,
  apply,
});

const COLOUR_LABELS: Record<string, string> = {
  2: '2 colours',
  16: '16 colours',
  256: '256 colours',
  grey: 'greyscale',
};

export function pixelImageActions(ctx: AnimationContext) {
  const { store, patch, present, edit } = ctx;
  const worker = () => ctx.services.pixelWorker;

  /**
   * Runs an edit as one undo step and, when it changed the image, the selection with it. Returns
   * why it was refused, or null.
   */
  function apply(
    label: string,
    change: (doc: AnimationDoc) => AnimationDoc,
    selection: (mask: Mask, before: AnimationDoc, after: AnimationDoc) => Mask,
  ): string | null {
    const before = present();
    const refused = edit(command(label, change));
    if (refused) return refused;
    const after = present();
    const mask = store.get().pixelSelection;
    if (mask && after !== before) ctx.moveSelection(before, selection(mask, before, after));
    return null;
  }

  /**
   * GB6, GN2 (M23): Image size of a big image: the core run once to check it and list the
   * rasters to resample (each an empty one of its new size meanwhile), the worker resampling
   * them and the selection, then the one undo step from what it made. Null, or why not at once.
   */
  function resizeInWorker(
    label: string,
    change: (doc: AnimationDoc, resample?: Resampler) => AnimationDoc,
    size: { width: number; height: number; selectionMethod: ResampleMethod },
  ): string | null {
    const before = present();
    const wanted: { raster: Raster; width: number; height: number; method: ResampleMethod }[] = [];
    try {
      const planned = change(before, (raster, width, height, method) => {
        wanted.push({ raster, width, height, method });
        return (
          raster.channels === 4 ? createBitmap(width, height) : createMask(width, height)
        ) as never;
      });
      if (planned === before) return null;
    } catch (error) {
      return error instanceof EditError ? error.message : String(error);
    }
    ctx.inBackground(label, async () => {
      const made = new Map<Raster, Raster>();
      for (const job of wanted) made.set(job.raster, await worker().run('resample', job));
      const mask = store.get().pixelSelection;
      const moved =
        mask && present() === before
          ? await worker().run('resample', {
              raster: mask,
              width: size.width,
              height: size.height,
              method: size.selectionMethod,
            })
          : undefined;
      const refused = edit(
        command(label, (doc) =>
          change(doc, (raster) => {
            const done = made.get(raster);
            if (!done) throw new EditError(CHANGED);
            return done as never;
          }),
        ),
      );
      if (refused) throw new EditError(refused);
      if (moved) ctx.moveSelection(before, moved as Mask);
    });
    return null;
  }

  /** The selection cut to a box of the old image (its top left becomes the new one's). */
  const cropSelection = (box: Bounds) => (mask: Mask, _: AnimationDoc, after: AnimationDoc) =>
    cropRaster(mask, {
      x: Math.floor(box.x),
      y: Math.floor(box.y),
      width: after.stage.width,
      height: after.stage.height,
    });

  /** G8: the canvas cropped to a box, the pixels off it dropped, the selection with it. */
  function cropTo(box: Bounds, label: string): string | null {
    return apply(label, (doc) => cropImage(doc, box), cropSelection(box));
  }

  return {
    /**
     * GB6: Image size: the whole image `width` × `height` px, every layer scaled, the pixels
     * resampled by `method`; and the resolution, when given. Null, or why not.
     */
    resizeImage(size: {
      width: number;
      height: number;
      method: ResampleMethod;
      dpi?: number;
    }): string | null {
      const { width, height, method, dpi } = size;
      const change = (doc: AnimationDoc, resample?: Resampler) => {
        const resized = resizeImage(doc, { width, height, method }, resample);
        return dpi === undefined ? resized : setImage(resized, { dpi });
      };
      // A selection's soft edge stays soft: only nearest keeps it hard.
      const selectionMethod = method === 'nearest' ? 'nearest' : 'bilinear';
      if (pixelsIn(present()) >= PAGE_PIXELS)
        return resizeInWorker('Image size', change, { width, height, selectionMethod });
      return apply('Image size', change, (mask) =>
        resampleMask(mask, width, height, selectionMethod),
      );
    },

    /** M23 (GN2): settles when the pixel work under way (in the pixel worker) is done. */
    pixelWork: ctx.pixelWork,

    /** GB6: only the resolution (no resampling): the pixels stay, the printed size changes. */
    setResolution(dpi: number): string | null {
      return edit(command('Resolution', (doc) => setImage(doc, { dpi })));
    },

    /**
     * GB6: Canvas size: `width` × `height` px with the picture kept at `anchor`; the new area
     * the background given ('none': transparent; absent: as it is). Smaller crops.
     */
    resizeCanvas(change: CanvasChange): string | null {
      return apply(
        'Canvas size',
        (doc) => resizeCanvas(doc, change),
        (mask, before) => {
          const { dx, dy } = canvasOffset(change, before.stage);
          return cropRaster(mask, { x: -dx, y: -dy, width: change.width, height: change.height });
        },
      );
    },

    /** G8: the canvas cropped to a box typed in image px. */
    cropToBox: (box: Bounds): string | null => cropTo(box, 'Crop'),

    /**
     * G8: Trim / Crop to content: the canvas cropped to everything drawn; `plain`: a border of
     * one colour (white round a photo) is trimmed too. False when there is nothing to crop to.
     */
    trimCanvas(plain: boolean): boolean {
      const box = contentBox(present(), { plain });
      if (!box) {
        patch({
          message: { kind: 'error', text: 'There is nothing drawn to crop the canvas to.' },
        });
        return false;
      }
      const refused = cropTo(box, plain ? 'Trim plain edges' : 'Crop to content');
      if (refused) patch({ message: { kind: 'error', text: refused } });
      return refused === null;
    },

    /**
     * GB6: Image ▸ Reduce colours on the current pixel layer: 2, 16 or 256 colours (median cut),
     * or greyscale; dithered or not. Null, or why not.
     */
    reduceColours(options: { to: ColourTarget; dither: boolean }): string | null {
      const { layerId } = store.get();
      const layer = present().layers.find((l) => l.id === layerId);
      if (!isPixelLayer(layer)) return 'Choose a pixel layer first: colours are reduced on one.';
      const label = `Reduce to ${COLOUR_LABELS[String(options.to)]}`;
      const { bitmap } = layer.pixels;
      if (bitmap.width * bitmap.height < PAGE_PIXELS)
        return edit(
          command(label, (doc) =>
            changePixels(doc, layerId, (p) => ({ ...p, bitmap: reduced(p.bitmap, options) })),
          ),
        );
      // GN2 (M23): a big layer in the pixel worker; a locked or hidden one refused at once.
      try {
        changePixels(present(), layerId, (p) => ({ ...p }));
      } catch (error) {
        return (error as Error).message;
      }
      ctx.inBackground(label, async () => {
        const changed = await worker().run('reduceColours', { bitmap, ...options });
        const refused = edit(
          command(label, (doc) =>
            changePixels(doc, layerId, (p) => {
              if (p.bitmap !== bitmap) throw new EditError(CHANGED);
              return { ...p, bitmap: applyPatch(bitmap, changed) };
            }),
          ),
        );
        if (refused) throw new EditError(refused);
      });
      return null;
    },
  };
}
