// G12 (M19): a picture tiled as a pattern fill (J/22: the vector balloon filled with a pattern),
// chosen from the computer, in Animation and Graphics mode alike. The other appearance settings
// (the tiles, opacity, filters) are plain numbers set through setProperties.
import * as cmd from '../animation-commands.ts';
import { findObject } from '../../core/animation/layers.ts';
import type { Paint, Picture } from '../../core/animation/types.ts';
import { EditError } from '../../core/model/errors.ts';
import { newId } from '../../core/model/factory.ts';
import type { AnimationContext } from './context.ts';

/** G12: how wide a picture is first tiled, at most (its own width when smaller). */
export const PICTURE_TILE = 100;

export function appearanceActions(ctx: AnimationContext) {
  const { store, present, showError, edit, pause, liveSelection, services } = ctx;
  const { dialogs, engine } = services;

  return {
    /**
     * G12 *Choose a picture…* in Properties ▸ Fill ▸ Pattern: the picture file chosen fills the
     * selected objects, tiled (the size and angle they had kept). The picture joins the
     * animation's pictures in the same undo step. Returns why not, for the panel; null when done
     * or nothing was chosen.
     */
    async tilePicture(): Promise<string | null> {
      const ids = liveSelection();
      if (ids.length === 0) return 'Select the shapes to fill with a picture.';
      const path = await dialogs.openPicture();
      if (!path) return null;
      try {
        const info = await engine.probe(path);
        // FFmpeg calls a GIF a video (it can have several pictures); its first picture is shown.
        if ((info.kind !== 'image' && info.container !== 'gif') || !info.video)
          throw new EditError('Choose a picture file, such as a PNG or JPG.');
        const doc = present();
        const known = doc.pictures.find((p) => p.path === path);
        const picture: Picture = known ?? {
          id: newId(),
          path,
          width: info.video.width,
          height: info.video.height,
        };
        const now = findObject(doc, ids[0]!)?.object.fill;
        const fill: Paint = {
          kind: 'pattern',
          pattern: 'picture',
          pictureId: picture.id,
          colour: now?.kind === 'solid' || now?.kind === 'pattern' ? now.colour : '#9aa4b2',
          background: now?.kind === 'pattern' ? now.background : 'none',
          size:
            now?.kind === 'pattern' && now.pattern === 'picture'
              ? now.size
              : Math.min(PICTURE_TILE, picture.width),
          ...(now?.kind === 'pattern' && now.angle ? { angle: now.angle } : {}),
        };
        pause();
        const change = cmd.setProperties(ids, { fill }, store.get().frame);
        return edit({
          label: 'Fill with a picture',
          apply: (d) => change.apply(known ? d : { ...d, pictures: [...d.pictures, picture] }),
        });
      } catch (error) {
        showError(error);
        return null;
      }
    },
  };
}
