// GT2, GT3 (M20): text on a path and text in a shape, in Graphics and Animation modes — *Put on
// path* and *Put in shape* with one text and one shape selected, and taking the text off again.
// Each is one undo step and leaves the text selected; a refused one says why (shown under the
// button that asked). The path's start, side, flip and outline and the shape's padding are the
// text's own properties, changed through setProperties as any other.
import type { AnimCommand } from '../animation-commands.ts';
import type { MeasureText } from '../../core/animation/letters.ts';
import { findObject } from '../../core/animation/layers.ts';
import { roughTextWidth } from '../../core/animation/factory.ts';
import { lineHeightOf } from '../../core/animation/text-layout.ts';
import type { AnimationDoc, Id, TextObject } from '../../core/animation/types.ts';
import { putInShape, putOnPath, takeOffOutline } from '../../core/graphics/text-attach.ts';
import type { AnimationContext } from './context.ts';

/** Without a canvas (tests), the words' box is roughly measured. */
const rough: MeasureText = (t) => ({
  width: roughTextWidth(t.text, t.size),
  height: t.text.split('\n').length * lineHeightOf(t),
});

export function textPathActions(ctx: AnimationContext) {
  const { edit, liveSelection, patch, present } = ctx;

  /** Runs `make` as one undo step and selects the text it gives back. */
  function attach(label: string, make: (doc: AnimationDoc) => { doc: AnimationDoc; id: Id }) {
    let id: Id | null = null;
    const command: AnimCommand = {
      label,
      apply: (doc) => {
        const out = make(doc);
        id = out.id;
        return out.doc;
      },
    };
    const refused = edit(command);
    if (!refused && id) patch({ selection: [id] });
    return refused;
  }

  /** The selected text on a path or in a shape. */
  const along = (): TextObject | null => {
    const [id] = liveSelection();
    const o = id ? findObject(present(), id)?.object : undefined;
    return o?.kind === 'text' && (o.path || o.inShape) ? o : null;
  };

  return {
    /**
     * GT2 *Put on path*: the selected text follows the selected shape's or path's outline (the
     * shape is used up); `show` draws the outline (with the shape's colour and width).
     */
    putOnPath(show = false): string | null {
      const ids = liveSelection();
      return attach('Put on path', (doc) => putOnPath(doc, ids, { show }));
    },

    /** GT3 *Put in shape*: the selected text's lines wrap inside the selected closed shape. */
    putInShape(padding?: number): string | null {
      const ids = liveSelection();
      return attach('Put in shape', (doc) =>
        putInShape(doc, ids, padding === undefined ? {} : { padding }),
      );
    },

    /**
     * GT2 *Take off path*, GT3 *Take out of shape*: the selected text straight again, its box
     * the size of its words (`measure`: the app's canvas; roughly without one).
     */
    takeOffOutline(measure: MeasureText = rough): string | null {
      const t = along();
      if (!t) return 'Select a text that is on a path or in a shape.';
      const straight = { ...t } as TextObject;
      delete straight.path;
      delete straight.inShape;
      const box = measure(straight);
      return edit({
        label: t.path ? 'Take off path' : 'Take out of shape',
        apply: (doc) => takeOffOutline(doc, t.id, box),
      });
    },
  };
}
