// M21 G3 (Graphics mode): the current pixel layer transformed — moved (dragged with the Select
// tool, nudged with the arrow keys, or its reference point typed at an X / Y), scaled to a typed
// W × H, turned by typed degrees, flipped, skewed — resampled bicubic, bilinear or nearest (pixel
// art). With pixels selected on the layer only they are transformed and the selection follows
// them (O/N/23: Ocean moved, scaled and flipped into the hole cut in Castle; workbook Task 3.4:
// the edited photos placed and turned on the canal). Each is one undo step, refused on a locked
// or hidden layer as every change to a layer is. A drag shows the layer (or the lifted pixels)
// where it goes as it moves, then makes its one step when let go.
import type { AnimationDoc, Layer, PixelContent } from '../../core/animation/types.ts';
import { copySelected, fadeSelected } from '../../core/graphics/pixels/cutout.ts';
import { changePixels, isPixelLayer } from '../../core/graphics/pixels/layers.ts';
import type { Mask, Rect } from '../../core/graphics/pixels/raster.ts';
import type { ResampleMethod } from '../../core/graphics/pixels/resample.ts';
import { selectedBounds } from '../../core/graphics/pixels/selection.ts';
import {
  matrixFor,
  pixelsBox,
  transformPixels,
  transformSelected,
  translation,
  type FlipAxis,
  type Matrix,
  type TransformValues,
} from '../../core/graphics/pixels/transform.ts';
import { EditError } from '../../core/model/errors.ts';
import type { AnimationContext } from './context.ts';

/** Properties ▸ Pixel layer's numbers, and how the pixels are resampled (bicubic by default). */
export interface PixelTransformChange extends TransformValues {
  method?: ResampleMethod;
}

/** A drag of the layer (or of the selected pixels) under way. */
export interface PixelMove {
  /** The document as it looks moved by whole px (only the layer's place is new). */
  shown(dx: number, dy: number): AnimationDoc;
  /** Let go: moved as one undo step (false: not moved, or refused). */
  finish(dx: number, dy: number): boolean;
}

const NOT_GRAPHICS = 'Pixel layers are for Graphics mode.';
const NO_PIXEL_LAYER = 'Choose a pixel layer first.';

export function pixelTransformActions(ctx: AnimationContext) {
  const { store, patch, present, edit, currentLayer } = ctx;

  const say = (text: string | null) => {
    if (text) patch({ message: { kind: 'error', text } });
  };

  /** The selection, if it was made on an image of this size (else it is stale: none). */
  function selection(): Mask | undefined {
    const m = store.get().pixelSelection;
    const { width, height } = present().stage;
    return m && m.width === width && m.height === height ? m : undefined;
  }

  /** The current pixel layer (Graphics mode), or why there is none. */
  function target(): (Layer & { pixels: PixelContent }) | string {
    if (ctx.kind.kind !== 'graphic') return NOT_GRAPHICS;
    const layer = currentLayer();
    return isPixelLayer(layer) ? layer : NO_PIXEL_LAYER;
  }

  /**
   * One undo step: the current layer's pixels (or only the selected ones, the selection following
   * them) through the matrix made for the box they are measured on. Null, or why not.
   */
  function transform(
    label: string,
    matrixOf: (box: Rect) => Matrix,
    method: ResampleMethod,
  ): string | null {
    const layer = target();
    if (typeof layer === 'string') return layer;
    const sel = selection();
    let moved: Mask | undefined;
    const refused = edit({
      label: sel ? `${label} (selected pixels)` : label,
      apply: (doc) =>
        changePixels(doc, layer.id, (p) => {
          if (!sel) return transformPixels(p, matrixOf(pixelsBox(p)), method);
          const out = transformSelected(p, sel, matrixOf(selectedBounds(sel)!), method);
          moved = out.selection;
          return out.pixels;
        }),
    });
    if (!refused && moved) patch({ pixelSelection: moved });
    return refused;
  }

  /** G3: the layer (or the selected pixels) moved by whole px. False when refused (it says why). */
  function movePixelLayer(dx: number, dy: number): boolean {
    const refused = transform(
      'Move pixels',
      () => translation(Math.round(dx), Math.round(dy)),
      'nearest',
    );
    say(refused);
    return refused === null;
  }

  return {
    /**
     * The box Properties ▸ Pixel layer measures: the selected pixels' bounds when there is a
     * selection, else the current pixel layer's pixels; null when the current layer is not one.
     */
    pixelTransformBox(): Rect | null {
      const layer = target();
      if (typeof layer === 'string') return null;
      const sel = selection();
      return (sel && selectedBounds(sel)) || pixelsBox(layer.pixels);
    },

    movePixelLayer,

    /** G3: the typed values applied at once (Properties ▸ Pixel layer's Apply). Null, or why not. */
    transformPixelLayer(change: PixelTransformChange): string | null {
      const { method = 'bicubic', ...values } = change;
      return transform('Transform pixels', (box) => matrixFor(box, values), method);
    },

    /** G3 reflect: mirrored in place (pixels copied, not resampled). */
    flipPixels(axis: FlipAxis): void {
      const flip = axis === 'horizontal' ? { flipHorizontal: true } : { flipVertical: true };
      say(
        transform(
          axis === 'horizontal' ? 'Flip horizontal' : 'Flip vertical',
          (box) => matrixFor(box, flip),
          'nearest',
        ),
      );
    },

    /** G3: turned by degrees clockwise about the centre (a quarter turn copies the pixels). */
    rotatePixels(degrees: number, method: ResampleMethod = 'bicubic'): void {
      say(transform(`Rotate ${degrees}°`, (box) => matrixFor(box, { rotate: degrees }), method));
    },

    /**
     * G3: a drag with the Select tool starts: the layer, or the selected pixels lifted off it,
     * shown where they go as the pointer moves. Null (it says why) when there is nothing to move.
     */
    startPixelMove(): PixelMove | null {
      const layer = target();
      if (typeof layer === 'string') {
        say(layer);
        return null;
      }
      const doc = present();
      try {
        // A change of no consequence, to have a locked or hidden layer refused as any other edit.
        changePixels(doc, layer.id, (p) => ({ ...p }));
      } catch (error) {
        say((error as EditError).message);
        return null;
      }
      const p = layer.pixels;
      const sel = selection();
      const lifted = sel ? copySelected(p, sel) : null;
      if (sel && !lifted) {
        say('Nothing selected shows on this layer: it is transparent there.');
        return null;
      }
      const rest = sel ? fadeSelected(p, sel, 0) : p;
      const shown = (dx: number, dy: number): AnimationDoc => ({
        ...doc,
        layers: doc.layers.flatMap((l): Layer[] => {
          if (l.id !== layer.id) return [l];
          if (!lifted) return [{ ...l, pixels: { ...p, x: p.x + dx, y: p.y + dy } }];
          // The lifted pixels on a layer of their own above the rest while they move.
          const moving: Layer = {
            ...l,
            id: `${l.id}:moving`,
            pixels: { bitmap: lifted.bitmap, x: lifted.x + dx, y: lifted.y + dy },
          };
          return [{ ...l, pixels: rest }, moving];
        }),
      });
      return {
        shown: (dx, dy) => shown(Math.round(dx), Math.round(dy)),
        finish: (dx, dy) =>
          (Math.round(dx) !== 0 || Math.round(dy) !== 0) && movePixelLayer(dx, dy),
      };
    },
  };
}
