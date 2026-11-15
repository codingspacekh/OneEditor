// GV7, GV8 (M19): View ▸ Outline (every object as a thin line, to check and pick overlapping
// parts: O/N/25 Apple) and template layers (a picture placed faded and locked to draw over:
// M/26 Chip.png, O/N/22 Plane.jpg, J/22 Balloon1), in Animation and Graphics mode alike.
import type { AnimCommand } from '../animation-commands.ts';
import { findObject } from '../../core/animation/layers.ts';
import { markTemplate, placeTemplate } from '../../core/animation/template.ts';
import type { Id, Picture } from '../../core/animation/types.ts';
import { EditError } from '../../core/model/errors.ts';
import { newId } from '../../core/model/factory.ts';
import { fileNameOf } from '../../core/project/relocate.ts';
import type { AnimationContext } from './context.ts';

export function templateActions(ctx: AnimationContext) {
  const { store, patch, present, showError, run, services } = ctx;
  const { dialogs, engine } = services;

  return {
    /**
     * GV7: View ▸ Outline on or off. A view setting, kept with the file as the rulers and grid
     * are, but not an edit (nothing to undo, no unsaved work).
     */
    toggleOutline(): void {
      store.update((s) => {
        const doc = s.history.present;
        const view = { ...doc.view, wireframe: !doc.view.wireframe };
        return { ...s, history: { ...s.history, present: { ...doc, view } } };
      });
    },

    /**
     * GV8 *Place template…*: a picture chosen by the student on a new layer at the bottom named
     * "Template", fitted to the canvas, locked and faded; drawing goes on in the layer it was in.
     */
    async placeTemplate(): Promise<void> {
      const path = await dialogs.openPicture();
      if (!path) return;
      try {
        const info = await engine.probe(path);
        // FFmpeg calls a GIF a video (it can have several pictures); its first picture is shown.
        if ((info.kind !== 'image' && info.container !== 'gif') || !info.video)
          throw new EditError('Choose a picture file, such as a PNG or JPG.');
        const picture: Picture = present().pictures.find((p) => p.path === path) ?? {
          id: newId(),
          path,
          width: info.video.width,
          height: info.video.height,
        };
        const command: AnimCommand = {
          label: 'Place template',
          apply: (doc) => placeTemplate(doc, picture).doc,
        };
        if (run(command))
          patch({
            message: {
              kind: 'info',
              text: `Placed ${fileNameOf(path)} as a template: faded and locked, to draw over on another layer. It is never exported.`,
            },
          });
      } catch (error) {
        showError(error);
      }
    },

    /** GV8: the Template toggle on a layer: faded, locked and never exported, or back again. */
    toggleTemplate(id: Id): void {
      const on = !present().layers.find((l) => l.id === id)?.template;
      const command: AnimCommand = {
        label: on ? 'Template layer' : 'Not a template',
        apply: (doc) => markTemplate(doc, id, on),
      };
      // A locked layer's objects cannot stay selected.
      if (run(command) && on)
        patch({
          selection: ctx.liveSelection().filter((o) => findObject(present(), o)?.layerId !== id),
        });
    },
  };
}
