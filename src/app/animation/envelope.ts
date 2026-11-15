// GV4, G3 (M19): envelopes and perspective in Graphics and Animation modes — the selected shapes
// and groups of shapes bent by a preset (with its bend %), by perspective (four corners) or by a
// custom envelope (four Bézier sides), kept live (still the same shapes, still editable) until
// *Apply* makes them plain paths. Each change, and each drag of a corner or handle on the stage,
// is one undo step; a refused one says why (shown under the field that asked).
import type { AnimCommand } from '../animation-commands.ts';
import { updateObject } from '../../core/animation/layers.ts';
import { validateObject } from '../../core/animation/rules.ts';
import type { AnimObject, Envelope, Id } from '../../core/animation/types.ts';
import { applyEnvelope, withEnvelope } from '../../core/graphics/warp.ts';
import type { AnimationContext } from './context.ts';

const LABELS: Record<Envelope['kind'], string> = {
  preset: 'Envelope',
  perspective: 'Perspective',
  custom: 'Envelope',
};

export function envelopeActions(ctx: AnimationContext) {
  const { edit, liveSelection, patch } = ctx;

  /** One undo step changing each object, every change checked. */
  function change(
    label: string,
    ids: readonly Id[],
    how: (o: AnimObject) => AnimObject,
  ): string | null {
    if (ids.length === 0) return 'Select a shape or a group of shapes first.';
    const command: AnimCommand = {
      label,
      apply: (doc) =>
        ids.reduce(
          (d, id) =>
            updateObject(d, id, (o) => {
              const next = how(o);
              validateObject(next);
              return next;
            }),
          doc,
        ),
    };
    return edit(command);
  }

  return {
    /**
     * GV4, G3: bends the selected shapes and groups (or `ids`) by the envelope; null takes it
     * off. Returns why it cannot, or null.
     */
    setEnvelope(envelope: Envelope | null, ids: readonly Id[] = liveSelection()): string | null {
      return change(envelope ? LABELS[envelope.kind] : 'Remove envelope', ids, (o) =>
        withEnvelope(o, envelope),
      );
    },

    /**
     * GV4, G3: a corner or handle dragged on the stage (one undo step when let go); a refused
     * drag is said in the message line, as the stage's other drags.
     */
    dragEnvelope(id: Id, envelope: Envelope): void {
      const refused = change(LABELS[envelope.kind], [id], (o) => withEnvelope(o, envelope));
      if (refused) patch({ message: { kind: 'error', text: refused } });
    },

    /** GV4 *Apply*: the selected bent objects become plain paths that look the same. */
    applyEnvelope(ids: readonly Id[] = liveSelection()): string | null {
      return change('Apply envelope', ids, applyEnvelope);
    },
  };
}
