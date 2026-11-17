// M22 (GB5, D8, GN2): the retouching tools as pixel tool handlers (pixel-pointer.ts). The clone
// stamp and the heal brush: Alt-click (Option-click on a Mac) sets the source, a drag paints from
// it (the heal matched to its surroundings when let go); the blur, sharpen and smudge brushes
// paint as dragged. Every point the pointer passed is used (the coalesced events), the stroke is
// shown once a frame changing only the tiles dabbed, and it is one undo step when let go. Red
// eye: a click on the eye, or a box dragged over it.
import type { PixelToolHandler } from './pixel-pointer.ts';
import { oncePerFrame, strokePoint } from './paint-tools.ts';
import { retouchUi } from './retouch-ui.svelte.ts';

const BRUSH: PixelToolHandler = {
  cursor: 'crosshair',
  down(e, pointer) {
    const tool = pointer.anim.store.get().tool;
    if (e.altKey && (tool === 'clone' || tool === 'heal')) {
      e.preventDefault();
      pointer.anim.setCloneSource(pointer.at(e));
      return;
    }
    const stroke = pointer.anim.startRetouch(strokePoint(e, pointer));
    if (!stroke) return;
    e.preventDefault();
    retouchUi.painting = true;
    const frame = oncePerFrame(() => pointer.preview(stroke.shown()));
    frame.now();
    pointer.track(
      (m) => {
        const all = m.getCoalescedEvents?.() ?? [];
        for (const c of all.length ? all : [m]) stroke.to(strokePoint(c, pointer));
        frame.ask();
      },
      (u) => {
        stroke.to(strokePoint(u, pointer));
        retouchUi.painting = false;
        frame.cancel();
        stroke.finish();
      },
    );
  },
};

const RED_EYE: PixelToolHandler = {
  cursor: 'crosshair',
  down(e, pointer) {
    e.preventDefault();
    const from = pointer.at(e);
    retouchUi.eyeBox = { from, to: from };
    pointer.track(
      (m) => (retouchUi.eyeBox = { from, to: pointer.at(m) }),
      (u) => {
        retouchUi.eyeBox = null;
        pointer.anim.redEyeAt(from, pointer.at(u));
      },
    );
  },
};

export const RETOUCH_TOOLS = {
  clone: BRUSH,
  heal: BRUSH,
  'blur-brush': BRUSH,
  'sharpen-brush': BRUSH,
  smudge: BRUSH,
  'red-eye': RED_EYE,
} as const satisfies Record<string, PixelToolHandler>;
