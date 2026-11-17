// M21 G3: the Select tool on a pixel layer (Graphics mode) — pressed where there is no object, a
// drag moves the layer, or the selected pixels on it, by whole image px, shown as it goes; Shift
// keeps the move across or down. Let go, it is one undo step; a click without a move deselects the
// objects, as a click on the empty stage does.
import type { PixelToolHandler } from './pixel-pointer.ts';

export const PIXEL_MOVE: PixelToolHandler = {
  cursor: 'move',
  down(e, pointer) {
    const { anim } = pointer;
    const start = pointer.at(e);
    const move = anim.startPixelMove();
    if (!move) return;
    let dx = 0;
    let dy = 0;
    pointer.track(
      (m) => {
        const p = pointer.at(m);
        dx = Math.round(p.x - start.x);
        dy = Math.round(p.y - start.y);
        if (m.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        pointer.preview(move.shown(dx, dy));
      },
      () => {
        if (dx === 0 && dy === 0) anim.select([]);
        else move.finish(dx, dy);
      },
    );
  },
};
