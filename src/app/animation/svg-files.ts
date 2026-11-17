// GV6 (M19): SVG files as editable shapes — *File ▸ Import SVG…* (Animation and Graphics mode)
// puts a given file's shapes into the drawing as one group (9626/04 M/26: ChipLeg.svg, then
// repeated evenly), and in Graphics mode *Open Image…* opens an SVG as a new image of its size.
// What the SVG has that the app cannot edit is named in the message.
import type { AnimCommand } from '../animation-commands.ts';
import { fontsUsed } from '../../core/animation/draw.ts';
import { createGroup } from '../../core/animation/factory.ts';
import { placeIn } from '../../core/animation/frames.ts';
import { addObject } from '../../core/animation/layers.ts';
import { validateObject } from '../../core/animation/rules.ts';
import type { AnimObject, AnimationDoc } from '../../core/animation/types.ts';
import { graphicOf } from '../../core/graphics/document.ts';
import { imageFromSvg, readSvg, type SvgImage } from '../../core/graphics/svg-import.ts';
import { EditError } from '../../core/model/errors.ts';
import { fileNameOf } from '../../core/project/relocate.ts';
import type { AnimationContext } from './context.ts';

/** "ChipLeg.svg" → "ChipLeg". */
const baseName = (path: string) => fileNameOf(path).replace(/\.svg$/i, '');

export const isSvgPath = (path: string): boolean => /\.svg$/i.test(path);

/** "4 objects" and what was left out, for the message. */
function described(image: SvgImage, count: number): string {
  const what = `${count} ${count === 1 ? 'object' : 'objects'}`;
  return image.notes.length ? `${what}. ${image.notes.join(' ')}` : `${what}.`;
}

/**
 * Reads an SVG file's shapes at `dpi`, its text placed with the fonts as the stage draws them
 * (the file is read again once their baselines are measured).
 */
export async function readSvgFile(
  ctx: AnimationContext,
  path: string,
  dpi: number,
): Promise<SvgImage> {
  const { files, renderer } = ctx.services;
  const text = await files.read(path);
  const first = readSvg(text, { dpi });
  const fonts = fontsUsed(first.objects);
  if (fonts.length === 0) return first;
  const textTops = await renderer.textTops(fonts).catch(() => ({}));
  return readSvg(text, { dpi, textTops });
}

/** GV6: an SVG as a new image (Graphics mode's Open Image…), and what to tell the student. */
export async function svgAsImage(
  ctx: AnimationContext,
  path: string,
): Promise<{ doc: AnimationDoc; message: string }> {
  const image = await readSvgFile(ctx, path, 96);
  const doc = imageFromSvg(baseName(path), image);
  const count = doc.layers[0]!.objects.length;
  return {
    doc,
    message: `Opened ${fileNameOf(path)} as a new image of ${described(image, count)} Save it to keep it as an image (.mveg).`,
  };
}

export function svgActions(ctx: AnimationContext) {
  const { store, patch, present, showError, run, services } = ctx;

  return {
    /**
     * GV6 *Import SVG…*: the file's shapes as one group on the layer in use (where the SVG had
     * them, its size at the image's resolution), selected; one undo step.
     */
    async importSvg(): Promise<void> {
      const path = await services.dialogs.openSvg();
      if (!path) return;
      patch({ busy: 'Importing SVG…' });
      try {
        const image = await readSvgFile(ctx, path, graphicOf(present()).dpi);
        if (image.objects.length === 0)
          throw new EditError(
            `There are no shapes in ${fileNameOf(path)} to import.${image.notes.length ? ` ${image.notes.join(' ')}` : ''}`,
          );
        const object: AnimObject =
          image.objects.length === 1
            ? image.objects[0]!
            : { ...createGroup(image.objects), name: baseName(path) };
        const { layerId, frame } = store.get();
        const command: AnimCommand = {
          label: 'Import SVG',
          apply: (doc) => {
            const layer = doc.layers.find((l) => l.id === layerId);
            if (!layer) throw new EditError('Choose a layer to import the SVG onto.');
            // AN14: on a frame-by-frame layer it joins the drawing shown.
            const placed = placeIn(layer, object, frame);
            validateObject(placed);
            return addObject(doc, layerId, placed);
          },
        };
        if (run(command))
          patch({
            selection: [object.id],
            tool: 'select',
            message: {
              kind: 'info',
              text: `Imported ${fileNameOf(path)}: ${described(image, image.objects.length)}`,
            },
          });
      } catch (error) {
        showError(error);
      } finally {
        patch({ busy: null });
      }
    },
  };
}
