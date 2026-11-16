// GV1, GV2 (M19): the vector toolkit's shape actions, in Graphics and Animation modes: the Spiral
// tool's options (drawing the spiral just made again while it is unchanged), Convert to curves,
// Step and repeat and Mirror copy. Each change is one undo step; each returns why it cannot be
// done (for the panel or dialog that asked), or null.
import type { AnimCommand } from '../animation-commands.ts';
import { findObject, updateObject } from '../../core/animation/layers.ts';
import { validateObject } from '../../core/animation/rules.ts';
import type { AnimationDoc, Id, PathObject } from '../../core/animation/types.ts';
import { convertToCurves } from '../../core/graphics/curves.ts';
import {
  mirrorCopy,
  stepAndRepeat,
  type MirrorAxis,
  type StepRepeat,
} from '../../core/graphics/replicate.ts';
import {
  DEFAULT_SPIRAL,
  isSpiralOf,
  spiralAnchors,
  validateSpiral,
  type SpiralOptions,
} from '../../core/graphics/shapes.ts';
import { EditError } from '../../core/model/errors.ts';
import type { AnimationContext } from './context.ts';
import { withLetters } from './letters-wait.ts';

const command = (label: string, apply: (doc: AnimationDoc) => AnimationDoc): AnimCommand => ({
  label,
  apply,
});

/** A command that makes copies: their ids are known once it has run. */
function copying(
  label: string,
  make: (doc: AnimationDoc) => { doc: AnimationDoc; ids: Id[] },
  made: (ids: Id[]) => void,
): AnimCommand {
  return command(label, (doc) => {
    const result = make(doc);
    made(result.ids);
    return result.doc;
  });
}

export function shapeActions(ctx: AnimationContext) {
  const { store, patch, present, edit, liveSelection } = ctx;

  /** Runs a copying command; the copies become the selection. */
  function copies(label: string, make: (doc: AnimationDoc) => { doc: AnimationDoc; ids: Id[] }) {
    let made: Id[] = [];
    const error = edit(copying(label, make, (ids) => (made = ids)));
    if (error === null) patch({ selection: made });
    return error;
  }

  return {
    /** GV1: the Spiral tool's options (3 even turns from the middle until changed). */
    spiralOptions: (): SpiralOptions => store.get().spiral ?? DEFAULT_SPIRAL,

    /**
     * GV1: new options for the Spiral tool. The one spiral selected, if it is still as these
     * options' last values drew it, is drawn again in its box with the new ones (one undo step).
     */
    setSpiralOptions(change: Partial<SpiralOptions>): string | null {
      const before = store.get().spiral ?? DEFAULT_SPIRAL;
      const options = { ...before, ...change };
      try {
        validateSpiral(options);
      } catch (error) {
        return (error as EditError).message;
      }
      const ids = liveSelection();
      const found = ids.length === 1 ? findObject(present(), ids[0]!) : null;
      const spiral = found?.object.kind === 'path' && isSpiralOf(found.object, before);
      if (spiral) {
        const error = edit(
          command('Change spiral', (doc) =>
            updateObject(doc, ids[0]!, (o) => {
              // Still the spiral it was a moment ago (a path).
              const path = o as PathObject;
              const next = { ...path, points: spiralAnchors(o.width, o.height, options) };
              validateObject(next);
              return next;
            }),
          ),
        );
        if (error) return error;
      }
      patch({ spiral: options });
      return null;
    },

    /**
     * GV2: the selected shapes become pen paths that look the same; GT4 (M20): text its letters'
     * outlines, grouped (done once the fonts' outlines are read, the first time).
     */
    convertToCurves(): string | null {
      const ids = liveSelection();
      return withLetters(ctx, ids, () =>
        edit(command('Convert to curves', (doc) => convertToCurves(doc, ids))),
      );
    },

    /** GV2: Step and repeat: copies of the selection, each moved and / or turned; selected. */
    stepAndRepeat(step: StepRepeat): string | null {
      const ids = liveSelection();
      if (ids.length === 0) return 'Select the objects to copy.';
      return copies('Step and repeat', (doc) => stepAndRepeat(doc, ids, step));
    },

    /** GV2: Mirror copy: the selection mirrored as a copy beside it or over it; selected. */
    mirrorCopy(axis: MirrorAxis, place: 'beside' | 'over' = 'beside'): string | null {
      const ids = liveSelection();
      if (ids.length === 0) return 'Select the objects to mirror.';
      return copies('Mirror copy', (doc) => mirrorCopy(doc, ids, axis, place));
    },
  };
}
