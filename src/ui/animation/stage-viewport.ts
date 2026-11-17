// M21 GB1: the stage's view at any zoom — Graphics mode's zoom steps to 3200 %, where the paper
// sits in its scrolling area, the part of the image that is on screen, and the canvas made only
// that size once a whole-image canvas would be too big (a 12-megapixel photo at 3200 % would be
// 400 000 × 300 000 px: the window keeps a canvas of the window's size and draws what shows),
// pixels drawn as crisp squares from 400 %, the pixel grid's lines from 800 %, and a zoom that
// keeps the point under the pointer where it is (Ctrl/Cmd + wheel, the Zoom tool).
import type { Rect } from '../../core/graphics/pixels/raster.ts';

/** Graphics mode's zoom steps: Animation mode's (to 400 %, a stage is a screen's size), then on. */
export const GRAPHICS_ZOOM_STEPS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8, 16, 32];
export const MAX_ZOOM = 32;

/** The next step in or out from a zoom (between steps: the nearest one that way). */
export function stepZoom(current: number, direction: 1 | -1, steps: readonly number[]): number {
  return direction === 1
    ? (steps.find((z) => z > current + 1e-9) ?? steps.at(-1)!)
    : ([...steps].reverse().find((z) => z < current - 1e-9) ?? steps[0]!);
}

/** From this zoom pixels are drawn as squares, not smoothed (as every image editor does). */
export const CRISP_FROM = 4;
/** From this zoom the pixel grid is drawn (View ▸ Pixel grid). */
export const PIXEL_GRID_FROM = 8;

export const smoothAt = (zoom: number): boolean => zoom < CRISP_FROM;
export const pixelGridAt = (zoom: number, on: boolean): boolean => on && zoom >= PIXEL_GRID_FROM;

/**
 * N16: the space round the stage on one axis: at least `margin`, more to keep the stage in the
 * middle of its area.
 */
export const paperPad = (
  area: number,
  ruler: number,
  length: number,
  zoom: number,
  margin: number,
) => Math.max(margin, Math.floor((area - ruler - length * zoom) / 2));

/** A whole-stage canvas bigger than this (device px) is drawn as the visible part only. */
export const MAX_CANVAS_SIDE = 8192;
export const MAX_CANVAS_AREA = 4096 * 4096;

export function needsViewport(
  stage: { width: number; height: number },
  zoom: number,
  dpr: number,
): boolean {
  const w = stage.width * zoom * dpr;
  const h = stage.height * zoom * dpr;
  return w > MAX_CANVAS_SIDE || h > MAX_CANVAS_SIDE || w * h > MAX_CANVAS_AREA;
}

/**
 * The part of the stage on screen, in whole stage px (rounded outwards, one more on each side so
 * a scroll of a pixel shows no gap), or null when none shows. `scroll` is the scrolling area's
 * position and size; `paper` where the stage's top left is inside the scrolled sheet.
 */
export function visibleRect(
  scroll: { left: number; top: number; width: number; height: number },
  paper: { left: number; top: number },
  zoom: number,
  stage: { width: number; height: number },
): Rect | null {
  const x0 = Math.max(0, Math.floor((scroll.left - paper.left) / zoom) - 1);
  const y0 = Math.max(0, Math.floor((scroll.top - paper.top) / zoom) - 1);
  const x1 = Math.min(stage.width, Math.ceil((scroll.left + scroll.width - paper.left) / zoom) + 1);
  const y1 = Math.min(stage.height, Math.ceil((scroll.top + scroll.height - paper.top) / zoom) + 1);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/** The canvas's size for a part of the stage (as sizeCanvas: set only when it changes). */
export function sizeViewportCanvas(
  canvas: { width: number; height: number },
  part: Rect,
  zoom: number,
  dpr: number,
): boolean {
  const width = Math.max(1, Math.round(part.width * zoom * dpr));
  const height = Math.max(1, Math.round(part.height * zoom * dpr));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}

/**
 * Where to scroll so the stage point under the pointer stays under it at the new zoom. `at` is
 * the pointer inside the scrolling area's box; `paper` where the stage starts in the sheet, before
 * and after (it moves as the space round it changes).
 */
export function scrollToKeep(
  at: { x: number; y: number },
  scroll: { left: number; top: number },
  paperBefore: { left: number; top: number },
  paperAfter: { left: number; top: number },
  from: number,
  to: number,
): { left: number; top: number } {
  const sx = (scroll.left + at.x - paperBefore.left) / from;
  const sy = (scroll.top + at.y - paperBefore.top) / from;
  return {
    left: Math.max(0, Math.round(paperAfter.left + sx * to - at.x)),
    top: Math.max(0, Math.round(paperAfter.top + sy * to - at.y)),
  };
}

/** The most lines the pixel grid draws (past that the zoom is too low for it to be useful). */
const MAX_GRID_LINES = 4000;

/**
 * GB1: the pixel grid over a part of the image: a line at every whole pixel, as one SVG path in
 * image px (drawn one screen pixel wide). Empty when there would be too many lines.
 */
export function pixelGridPath(part: Rect): string {
  if (part.width + part.height + 2 > MAX_GRID_LINES) return '';
  const right = part.x + part.width;
  const bottom = part.y + part.height;
  const lines: string[] = [];
  for (let x = part.x; x <= right; x++) lines.push(`M${x} ${part.y}V${bottom}`);
  for (let y = part.y; y <= bottom; y++) lines.push(`M${part.x} ${y}H${right}`);
  return lines.join('');
}
