// M21: what the stage hands a pixel tool (Graphics mode, on a pixel layer) when the pointer goes
// down: the app, the pointer in image px, the drag to follow, and a document to show instead
// while the drag goes on (a stroke drawn as it is painted, a selection moved). Each tool is one
// handler in the table below, in its own file, as the effects and panels are registered.
import type { AnimationApp } from '../../app/animation.ts';
import type { Tool } from '../../app/animation/state.ts';
import type { Point } from '../../core/animation/geometry.ts';
import type { AnimationDoc } from '../../core/animation/types.ts';
import { HAND, ZOOM } from './view-tools.ts';
import { SELECTION_TOOLS } from './selection-tools.ts';
import { PAINT_TOOLS } from './paint-tools.ts';

export interface PixelPointer {
  anim: AnimationApp;
  /** Where a pointer event is on the image, in image px (not rounded). */
  at(e: { clientX: number; clientY: number }): Point;
  /** 1 = 100 %. */
  zoom: number;
  /** Follows the drag until the pointer is let go. */
  track(move: (e: PointerEvent) => void, up: (e: PointerEvent) => void): void;
  /** Draws this document instead of the real one until null is given (or the drag ends). */
  preview(doc: AnimationDoc | null): void;
  /** GB1 (M21 step 5): the stage's view, for the hand and the zoom (absent: they do nothing). */
  view?: StageView;
}

/** GB1: what the hand and the zoom change: the scrolling of the stage and its zoom. */
export interface StageView {
  /** Scrolls the stage area by screen px (the picture follows the pointer: the opposite way). */
  panBy(dx: number, dy: number): void;
  /** Zooms a step in or out, keeping the image point under the pointer where it is. */
  zoomAt(direction: 1 | -1, e: { clientX: number; clientY: number }): void;
}

export interface PixelToolHandler {
  down(e: PointerEvent, pointer: PixelPointer): void;
  /** The CSS cursor over the stage. */
  cursor?: string;
}

const HANDLERS: Partial<Record<Tool, PixelToolHandler>> = {
  // GB2 (M21 step 3): the selection tools.
  ...SELECTION_TOOLS,
  // GB4, GB3 (M21 step 4): the painting tools, the paint bucket and the gradient.
  ...PAINT_TOOLS,
  // GB1 (M21 step 5): the hand and the zoom.
  hand: HAND,
  zoom: ZOOM,
};

/** The handler for a pixel tool, or undefined for the vector tools (handled by the stage). */
export const pixelToolOf = (tool: Tool): PixelToolHandler | undefined => HANDLERS[tool];
