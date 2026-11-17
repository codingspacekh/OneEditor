// M21 GB1: the Hand (drag to pan the image; Space held does the same with any tool) and the Zoom
// (click to zoom in at the point, Alt-click to zoom out), as pixel tool handlers: they work on
// the stage's view, given with the pointer, not on the image.
import type { PixelPointer, PixelToolHandler } from './pixel-pointer.ts';

/** GB1: drags the image under the pointer: the stage area scrolls the opposite way. */
export const HAND: PixelToolHandler = {
  cursor: 'grab',
  down(e: PointerEvent, pointer: PixelPointer): void {
    const view = pointer.view;
    if (!view) return;
    e.preventDefault();
    let last = { x: e.clientX, y: e.clientY };
    pointer.track(
      (m) => {
        view.panBy(last.x - m.clientX, last.y - m.clientY);
        last = { x: m.clientX, y: m.clientY };
      },
      () => {},
    );
  },
};

/** GB1: a click zooms in a step about the point; Alt-click (Option on a Mac) out. */
export const ZOOM: PixelToolHandler = {
  cursor: 'zoom-in',
  down(e: PointerEvent, pointer: PixelPointer): void {
    pointer.view?.zoomAt(e.altKey ? -1 : 1, e);
  },
};
