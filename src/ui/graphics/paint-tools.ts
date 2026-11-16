// M21 step 4 (GB4, GB3, GN2): the painting tools as pixel tool handlers (pixel-pointer.ts). The
// paintbrush, pencil, eraser and airbrush paint a stroke as the pointer is dragged (every point
// the pointer passed, from the coalesced events), shown once a frame by changing only the tiles
// dabbed, and kept as one undo step when it is let go; Shift at the start draws a straight line
// from where the last stroke ended; a pen's pressure is passed on; the airbrush keeps adding
// while it is held still. The paint bucket fills where it is clicked; the gradient tool fills
// along the line dragged (Shift: in steps of 45°).
import type { Point } from '../../core/animation/geometry.ts';
import type { StrokePoint } from '../../core/graphics/pixels/brush.ts';
import { AIRBRUSH_MS } from '../../core/graphics/pixels/brush.ts';
import type { BrushTool } from '../../core/graphics/pixels/presets.ts';
import type { PixelPointer, PixelToolHandler } from './pixel-pointer.ts';
import { paintUi } from './paint-ui.svelte.ts';

/** Where the pointer is, with its pressure when it is a pen. */
export function strokePoint(e: PointerEvent, pointer: PixelPointer): StrokePoint {
  const p = pointer.at(e);
  return e.pointerType === 'pen' && e.pressure > 0 ? { ...p, pressure: e.pressure } : p;
}

/** Runs `show` once on the next frame however often it is asked for meanwhile. */
export function oncePerFrame(show: () => void): { ask(): void; now(): void } {
  let asked = false;
  const later =
    typeof requestAnimationFrame === 'function'
      ? (f: () => void) => requestAnimationFrame(f)
      : (f: () => void) => setTimeout(f, 16);
  return {
    ask() {
      if (asked) return;
      asked = true;
      later(() => {
        if (!asked) return;
        asked = false;
        show();
      });
    },
    now() {
      asked = false;
      show();
    },
  };
}

function brush(airbrush: boolean): PixelToolHandler {
  return {
    cursor: 'crosshair',
    down(e, pointer) {
      const stroke = pointer.anim.startStroke(strokePoint(e, pointer), { straight: e.shiftKey });
      if (!stroke) return;
      e.preventDefault();
      const frame = oncePerFrame(() => pointer.preview(stroke.shown()));
      frame.now();
      let held = Date.now();
      const timer = airbrush
        ? setInterval(() => {
            const now = Date.now();
            stroke.hold(now - held);
            held = now;
            frame.ask();
          }, AIRBRUSH_MS)
        : null;
      pointer.track(
        (m) => {
          const all = m.getCoalescedEvents?.() ?? [];
          for (const c of all.length ? all : [m]) stroke.to(strokePoint(c, pointer));
          held = Date.now();
          frame.ask();
        },
        (u) => {
          if (timer) clearInterval(timer);
          stroke.to(strokePoint(u, pointer));
          stroke.finish();
        },
      );
    },
  };
}

/** Shift: the line turned to the nearest 45°. */
function stepped(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
}

const BUCKET: PixelToolHandler = {
  cursor: 'crosshair',
  down(e, pointer) {
    e.preventDefault();
    void pointer.anim.fillAt(pointer.at(e));
  },
};

const GRADIENT: PixelToolHandler = {
  cursor: 'crosshair',
  down(e, pointer) {
    e.preventDefault();
    const from = pointer.at(e);
    const end = (m: PointerEvent) => (m.shiftKey ? stepped(from, pointer.at(m)) : pointer.at(m));
    paintUi.gradientLine = { from, to: from };
    pointer.track(
      (m) => (paintUi.gradientLine = { from, to: end(m) }),
      (u) => {
        paintUi.gradientLine = null;
        void pointer.anim.gradientFill(from, end(u));
      },
    );
  },
};

export const PAINT_TOOLS: Record<BrushTool | 'bucket' | 'gradient', PixelToolHandler> = {
  paintbrush: brush(false),
  pencil: brush(false),
  eraser: brush(false),
  airbrush: brush(true),
  bucket: BUCKET,
  gradient: GRADIENT,
};
