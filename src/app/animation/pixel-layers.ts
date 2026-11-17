// M21 G2, GB1 (Graphics mode): pixel layers — a new empty one; a picture file (JPG, PNG, GIF, BMP,
// WebP) opened as a new image of its size (its resolution from the file) or added as a new
// layer, or a pasted picture added as one; each layer's opacity, blend mode and clipping mask; a
// pixel layer's layer mask; duplicate; merge down, merge visible and flatten (a vector layer is
// drawn into pixels by the renderer first, and the student is told its shapes are now pixels).
// Each change is one undo step. The pictures are decoded by the renderer (the page's
// createImageBitmap and a canvas; a fake in the tests).
import type { AnimCommand } from '../animation-commands.ts';
import type { Pixels } from '../../core/animation/trace.ts';
import type { AnimationDoc, Id, ObjectFilter } from '../../core/animation/types.ts';
import { createGraphic } from '../../core/graphics/document.ts';
import {
  layerAlone,
  MERGE_LABELS,
  mergeLayers,
  mergePlan,
  type MergeHow,
} from '../../core/graphics/pixels/merge.ts';
import {
  addLayerMask,
  addPixelLayer,
  centredPixels,
  duplicateLayer,
  maskFromSelection,
  removeLayerMask,
  setLayerLook,
  type LayerLook,
} from '../../core/graphics/pixels/pixel-layers.ts';
import { pixelLayerOf } from '../../core/graphics/pixels/layers.ts';
import { setLayerEffects } from '../../core/graphics/pixels/layer-effects.ts';
import { bitmapFromRGBA, type Bitmap } from '../../core/graphics/pixels/raster.ts';
import { jpegDpi, pngDpi } from '../../core/image/dpi.ts';
import { EditError } from '../../core/model/errors.ts';
import { fileNameOf } from '../../core/project/relocate.ts';
import type { AnimationContext } from './context.ts';

const command = (label: string, apply: (doc: AnimationDoc) => AnimationDoc): AnimCommand => ({
  label,
  apply,
});

/** Pixels the renderer gave as a bitmap. */
const bitmapOf = (p: Pixels): Bitmap =>
  bitmapFromRGBA(
    p.width,
    p.height,
    p.data instanceof Uint8ClampedArray ? p.data : Uint8ClampedArray.from(p.data),
  );

/** "Castle.jpg" → "Castle". */
const baseName = (path: string): string => fileNameOf(path).replace(/\.[^.]+$/, '');

/** The files the papers give: a picture, as GB1 lists them (SVG too: drawn into pixels). */
const PICTURE = /\.(png|jpe?g|gif|bmp|webp|svg)$/i;

export function pixelLayerActions(
  ctx: AnimationContext,
  startWith: (doc: AnimationDoc) => Promise<boolean>,
) {
  const { store, patch, present, showError, run, edit, services } = ctx;
  const { dialogs, engine, files, renderer } = services;

  /** Pixel layers are Graphics mode's: anywhere else, a message, and false. */
  function inGraphics(): boolean {
    if (ctx.kind.kind === 'graphic') return true;
    patch({ message: { kind: 'error', text: 'Pixel layers are for Graphics mode.' } });
    return false;
  }

  /** A picture file's pixels at its own size, and the resolution the file gives (or 96 dpi). */
  async function loadPicture(path: string): Promise<{ bitmap: Bitmap; dpi: number }> {
    if (!PICTURE.test(path))
      throw new EditError('Choose a picture file: JPG, PNG, GIF, BMP or WebP.');
    // The page is shown only files the app has checked (AN5).
    await engine.probe(path);
    const pixels = await renderer.pixels(path, Number.POSITIVE_INFINITY);
    const bytes = await files.readBytes(path).catch(() => null);
    const found = bytes ? (pngDpi(bytes) ?? jpegDpi(bytes)) : null;
    const dpi = found && found.x >= 10 && found.x <= 1200 ? found.x : 96;
    return { bitmap: bitmapOf(pixels), dpi };
  }

  /** Adds pixels as a new layer above the current one, which it becomes. True when added. */
  function addLayerOf(bitmap: Bitmap, name: string, label: string): boolean {
    let made: Id | null = null;
    const ok = run(
      command(label, (doc) => {
        const added = addPixelLayer(doc, {
          aboveId: store.get().layerId,
          name,
          pixels: centredPixels(doc, bitmap),
        });
        made = added.layer.id;
        return added.doc;
      }),
    );
    if (ok && made) patch({ layerId: made, selection: [] });
    return ok;
  }

  /**
   * The vector layers of a merge, and (G14, M22) its pixel layers with effects, drawn into pixels
   * by the renderer (canvas-sized, at 0, 0); `merged`: the plan's layers.
   */
  async function rasterise(
    doc: AnimationDoc,
    ids: readonly Id[],
    merged: readonly Id[],
  ): Promise<Record<Id, Bitmap>> {
    const out: Record<Id, Bitmap> = {};
    for (const id of ids) {
      out[id] = bitmapOf(await renderer.renderPixels(layerAlone(doc, id, merged)));
    }
    return out;
  }

  return {
    /** GB1: a new empty pixel layer, the image's size, above the current layer. */
    addPixelLayer(): void {
      if (!inGraphics()) return;
      let made: Id | null = null;
      const ok = run(
        command('New pixel layer', (doc) => {
          const added = addPixelLayer(doc, { aboveId: store.get().layerId });
          made = added.layer.id;
          return added.doc;
        }),
      );
      if (ok && made) patch({ layerId: made, selection: [] });
    },

    /**
     * GB1: a picture file opened as a new image of its size, at the resolution the file gives,
     * on one pixel layer named after it (see-through parts stay see-through). False when it stayed.
     */
    async openPictureAsImage(): Promise<boolean> {
      if (!inGraphics()) return false;
      const path = await dialogs.openPicture();
      if (!path) return false;
      patch({ busy: 'Opening the picture…' });
      let doc: AnimationDoc;
      try {
        const { bitmap, dpi } = await loadPicture(path);
        const blank = createGraphic({
          name: baseName(path),
          size: { width: bitmap.width, height: bitmap.height, units: 'px', dpi },
          background: 'none',
        });
        const { doc: withPixels, layer } = addPixelLayer(blank, {
          name: baseName(path),
          pixels: { bitmap, x: 0, y: 0 },
        });
        doc = { ...withPixels, layers: [layer] };
      } catch (error) {
        showError(error);
        return false;
      } finally {
        patch({ busy: null });
      }
      if (!(await startWith(doc))) return false;
      const { width, height } = doc.stage;
      patch({
        // GC2 (M23): kept, so an export never saves over it.
        original: path,
        message: {
          kind: 'info',
          text: `Opened ${fileNameOf(path)} as a new image: ${width} × ${height} px at ${doc.graphic!.dpi} dpi.`,
        },
      });
      return true;
    },

    /** GB1: a picture file added as a new pixel layer, in the middle of the image. */
    async addPictureAsLayer(): Promise<void> {
      if (!inGraphics()) return;
      const path = await dialogs.openPicture();
      if (!path) return;
      patch({ busy: 'Adding the picture…' });
      try {
        const { bitmap } = await loadPicture(path);
        if (addLayerOf(bitmap, baseName(path), 'Add picture as layer'))
          patch({
            message: {
              kind: 'info',
              text: `Added ${fileNameOf(path)} as the pixel layer ${ctx.currentLayer()!.name}.`,
            },
          });
      } catch (error) {
        showError(error);
      } finally {
        patch({ busy: null });
      }
    },

    /** GB1: a pasted picture (decoded by the page) as a new pixel layer, in the middle. */
    pastePixels(pixels: Pixels, name = 'Pasted'): void {
      if (!inGraphics()) return;
      try {
        if (!(pixels.width > 0 && pixels.height > 0))
          throw new EditError('There is no picture to paste.');
        addLayerOf(bitmapOf(pixels), name, 'Paste as layer');
      } catch (error) {
        showError(error);
      }
    },

    /** G2: a layer's opacity (0–1), blend mode or clipping mask; or why not (for the panel). */
    setLayerLook(id: Id, look: LayerLook): string | null {
      const label =
        look.clip !== undefined
          ? look.clip
            ? 'Clipping mask'
            : 'Release clipping mask'
          : look.blend !== undefined
            ? 'Blend mode'
            : 'Layer opacity';
      return edit(command(label, (doc) => setLayerLook(doc, id, look)));
    },

    /**
     * G14 (M22): a pixel layer's effects (shadows, glow, bevel, blur; none: undefined); or why
     * not (for Properties ▸ Filters).
     */
    setLayerEffects(id: Id, effects: ObjectFilter[] | undefined): string | null {
      return edit(command('Layer effects', (doc) => setLayerEffects(doc, id, effects)));
    },

    /**
     * GB2: a layer mask on a pixel layer: from the selection when there is one (selected parts
     * shown), else showing everything.
     */
    addLayerMask(id: Id): void {
      const selection = store.get().pixelSelection;
      run(
        command('Add layer mask', (doc) =>
          addLayerMask(
            doc,
            id,
            selection ? maskFromSelection(selection, pixelLayerOf(doc, id).pixels) : undefined,
          ),
        ),
      );
    },

    /** GB2: the layer mask applied (what it hid made transparent) or thrown away. */
    removeLayerMask(id: Id, apply: boolean): void {
      run(
        command(apply ? 'Apply layer mask' : 'Delete layer mask', (doc) =>
          removeLayerMask(doc, id, apply),
        ),
      );
    },

    /** G2: a copy of the layer above it, which becomes the current layer. */
    duplicateLayer(id: Id): void {
      let made: Id | null = null;
      const ok = run(
        command('Duplicate layer', (doc) => {
          const copy = duplicateLayer(doc, id);
          made = copy.layer.id;
          return copy.doc;
        }),
      );
      if (ok && made) patch({ layerId: made, selection: [] });
    },

    /**
     * G2: merge down (the current layer into the one below), merge visible or flatten. A vector
     * layer is drawn into pixels first; the student is told its shapes can no longer be edited.
     */
    async mergeLayers(how: MergeHow): Promise<void> {
      if (!inGraphics() || store.get().busy) return;
      const doc = present();
      const layerId = store.get().layerId;
      let plan: ReturnType<typeof mergePlan>;
      try {
        plan = mergePlan(doc, how, layerId);
      } catch (error) {
        showError(error);
        return;
      }
      patch({ busy: `${MERGE_LABELS[how]}…` });
      try {
        const rastered = await rasterise(doc, [...plan.vector, ...plan.effects], plan.ids);
        const bottom = plan.ids[0]!;
        if (!run(command(MERGE_LABELS[how], (d) => mergeLayers(d, how, layerId, rastered)))) return;
        const names = plan.vector.map((id) => doc.layers.find((l) => l.id === id)!.name);
        patch({
          layerId: bottom,
          selection: [],
          ...(names.length
            ? {
                message: {
                  kind: 'info' as const,
                  text: `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} now pixels: ${names.length === 1 ? 'its' : 'their'} shapes and text can no longer be edited one by one. Undo brings them back.`,
                },
              }
            : {}),
        });
      } catch (error) {
        showError(error);
      } finally {
        patch({ busy: null });
      }
    },
  };
}
