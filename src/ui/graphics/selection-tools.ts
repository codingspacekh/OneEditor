// M21 step 3 (GB2): the selection tools as pixel tool handlers (pixel-pointer.ts). Rectangle and
// ellipse marquees (drag; Shift pressed while dragging: a square or circle), lasso (drag freehand),
// polygonal lasso (click points; double-click, Enter or a click on the first point closes it;
// Backspace takes the last point back, Escape stops), magnetic lasso (drag near an edge: the line
// snaps to it, an anchor laid every few px), magic wand and colour select (click). Shift at the
// start adds to the selection, Alt (Option) subtracts, both intersect. A click without a drag
// with a marquee or lasso deselects, as Photoshop does.
import type { Point } from '../../core/animation/geometry.ts';
import type { Rect } from '../../core/graphics/pixels/raster.ts';
import { ellipsePoints } from '../../core/graphics/pixels/selection.ts';
import type { AnimationApp } from '../../app/animation.ts';
import type { PixelPointer, PixelToolHandler } from './pixel-pointer.ts';
import { modeOf, selUi } from './selection-ui.svelte.ts';

/** Screen px the pointer must move before a press counts as a drag. */
const DRAG_PX = 3;
/** Screen px within which a click on the polygonal lasso's first point closes it. */
const CLOSE_PX = 8;
/** Two clicks this close in time (ms) and place (screen px) are a double-click. */
const DOUBLE_MS = 400;
/** The magnetic lasso lays an anchor every this many screen px of the drag. */
const ANCHOR_PX = 24;

const far = (a: Point, b: Point, px: number, zoom: number) =>
  Math.hypot(a.x - b.x, a.y - b.y) * zoom > px;

/** The box dragged from `a` to `b`; `square`: as wide as it is high (the longer side). */
export function dragBox(a: Point, b: Point, square: boolean): Rect {
  let w = b.x - a.x;
  let h = b.y - a.y;
  if (square) {
    const side = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * side;
    h = Math.sign(h || 1) * side;
  }
  return {
    x: Math.min(a.x, a.x + w),
    y: Math.min(a.y, a.y + h),
    width: Math.abs(w),
    height: Math.abs(h),
  };
}

const boxPoints = (r: Rect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

const options = (e: { shiftKey: boolean; altKey: boolean }) => ({
  mode: modeOf(e),
  feather: selUi.feather,
  antiAlias: selUi.antiAlias,
});

/** A click that did not drag: deselects (a new selection), else leaves it. */
function clicked(anim: AnimationApp, mode: string): void {
  if (mode === 'new') anim.deselectPixels();
}

function marquee(shape: 'rect' | 'ellipse'): PixelToolHandler {
  return {
    cursor: 'crosshair',
    down(e, p) {
      const start = p.at(e);
      const opts = options(e);
      let box: Rect | null = null;
      // Shift held from the start adds; it makes a square once let go and pressed again.
      let shiftFree = !e.shiftKey;
      p.track(
        (m) => {
          if (!m.shiftKey) shiftFree = true;
          const now = p.at(m);
          if (!box && !far(start, now, DRAG_PX, p.zoom)) return;
          box = dragBox(start, now, m.shiftKey && shiftFree);
          selUi.draft = shape === 'rect' ? boxPoints(box) : ellipsePoints(box);
        },
        () => {
          selUi.draft = null;
          if (!box || box.width === 0 || box.height === 0) return clicked(p.anim, opts.mode);
          if (shape === 'rect') p.anim.selectRect(box, opts);
          else p.anim.selectEllipse(box, opts);
        },
      );
    },
  };
}

const LASSO: PixelToolHandler = {
  cursor: 'crosshair',
  down(e, p) {
    const opts = options(e);
    const points = [p.at(e)];
    selUi.draft = points.slice();
    p.track(
      (m) => {
        const now = p.at(m);
        if (!far(points.at(-1)!, now, 1, p.zoom)) return;
        points.push(now);
        selUi.draft = points.slice();
      },
      () => {
        selUi.draft = null;
        if (points.length < 3) return clicked(p.anim, opts.mode);
        p.anim.selectLasso(points, opts);
      },
    );
  },
};

/** The polygonal lasso's points while they are clicked (one at a time, on any stage). */
let polygon: {
  points: Point[];
  opts: ReturnType<typeof options>;
  anim: AnimationApp;
  last: { at: Point; time: number };
  stop(): void;
} | null = null;

function finishPolygon(keep: boolean): void {
  const now = polygon;
  if (!now) return;
  now.stop();
  polygon = null;
  selUi.draft = null;
  if (keep && now.points.length >= 3) now.anim.selectLasso(now.points, now.opts);
}

const POLYGON_LASSO: PixelToolHandler = {
  cursor: 'crosshair',
  down(e, p) {
    const at = p.at(e);
    const time = Date.now();
    if (polygon) {
      const { points, last } = polygon;
      const closing = points.length >= 3 && !far(points[0]!, at, CLOSE_PX, p.zoom);
      const double = time - last.time < DOUBLE_MS && !far(last.at, at, CLOSE_PX, p.zoom);
      if (closing || double) return finishPolygon(true);
      points.push(at);
      polygon.last = { at, time };
      selUi.draft = points.slice();
      return;
    }
    const move = (m: PointerEvent) => {
      if (polygon) selUi.draft = [...polygon.points, p.at(m)];
    };
    const key = (k: KeyboardEvent) => {
      if (!polygon) return;
      if (k.key === 'Enter') finishPolygon(true);
      else if (k.key === 'Escape') finishPolygon(false);
      else if (k.key === 'Backspace' && polygon.points.length > 1) {
        polygon.points.pop();
        selUi.draft = polygon.points.slice();
      } else return;
      k.preventDefault();
      k.stopImmediatePropagation();
    };
    window.addEventListener('pointermove', move);
    // Before the editor's own keys (Escape, Backspace delete): a capturing listener.
    window.addEventListener('keydown', key, true);
    polygon = {
      points: [at],
      opts: options(e),
      anim: p.anim,
      last: { at, time },
      stop: () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('keydown', key, true);
      },
    };
    selUi.draft = [at];
  },
};

/** Stops a polygonal lasso part drawn (the tool changed, the stage went). */
export const cancelPolygonLasso = (): void => finishPolygon(false);

const MAGNETIC_LASSO: PixelToolHandler = {
  cursor: 'crosshair',
  down(e: PointerEvent, p: PixelPointer) {
    const opts = options(e);
    const fixed = [p.at(e)];
    let live: Point[] = [];
    selUi.draft = fixed.slice();
    p.track(
      (m) => {
        const now = p.at(m);
        const anchor = fixed.at(-1)!;
        live = p.anim.magneticPath(anchor, now);
        if (far(anchor, now, ANCHOR_PX, p.zoom)) {
          fixed.push(...live.slice(1));
          live = [];
        }
        selUi.draft = [...fixed, ...live.slice(1)];
      },
      () => {
        selUi.draft = null;
        const points = [...fixed, ...live.slice(1)];
        if (points.length < 3) return clicked(p.anim, opts.mode);
        p.anim.selectLasso(points, opts);
      },
    );
  },
};

const MAGIC_WAND: PixelToolHandler = {
  cursor: 'crosshair',
  down(e, p) {
    p.anim.selectByWand(p.at(e), {
      ...options(e),
      tolerance: selUi.tolerance,
      contiguous: selUi.contiguous,
      // M23: "All layers": the picture as drawn, vector layers too (the app draws it).
      ...(selUi.allLayers ? { allLayers: true } : {}),
    });
  },
};

const COLOUR_SELECT: PixelToolHandler = {
  cursor: 'crosshair',
  down(e, p) {
    p.anim.selectByColour(p.at(e), {
      ...options(e),
      fuzziness: selUi.fuzziness,
      ...(selUi.allLayers ? { allLayers: true } : {}),
    });
  },
};

/** GB2: the selection tools, by name, for pixel-pointer's table. */
export const SELECTION_TOOLS = {
  'select-rect': marquee('rect'),
  'select-ellipse': marquee('ellipse'),
  lasso: LASSO,
  'polygon-lasso': POLYGON_LASSO,
  'magnetic-lasso': MAGNETIC_LASSO,
  'magic-wand': MAGIC_WAND,
  'colour-select': COLOUR_SELECT,
} as const satisfies Record<string, PixelToolHandler>;

/** The selection tools' names (the option bar shows while one is chosen). */
export const SELECTION_TOOL_NAMES = Object.keys(
  SELECTION_TOOLS,
) as (keyof typeof SELECTION_TOOLS)[];
