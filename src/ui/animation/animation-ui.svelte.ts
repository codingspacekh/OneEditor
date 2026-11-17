// UI-only state of Animation mode shared by its panels (not part of the animation, not undoable).
import type { AnimationFormat } from '../../core/animation/export.ts';
import type { GraphicFormat } from '../../core/graphics/export.ts';

export type AnimDialog =
  | 'stage'
  | 'export'
  | 'trace'
  | 'frames'
  | 'library'
  /** AN5: Crop… and Make a colour see-through… for the selected picture. */
  | 'cropPicture'
  | 'seeThrough'
  /** M18, Graphics mode: a new image, and the image settings (canvas, resolution, background). */
  | 'newImage'
  | 'image'
  /** GV2 (M19): Step and repeat… for the selection. */
  | 'stepRepeat'
  /** GB6 (M21), Graphics mode: Image size…, Canvas size…, Reduce colours…. */
  | 'imageSize'
  | 'canvasSize'
  | 'reduceColours'
  /** GB3 (M22), Graphics mode: an adjustment (Image ▸ Adjustments), the one in adjustUi. */
  | 'adjust'
  /** GB5 (M22), Graphics mode: a filter (the Filter menu), the one in filterUi. */
  | 'filter'
  | null;

export const animUi = $state({
  /** The pointer's stage coordinates, for the status bar (null when off the stage). */
  pointer: null as { x: number; y: number } | null,
  /** What the last move snapped to ("grid", "edge of Star"…), for the status bar. */
  snapped: null as string | null,
  /** The dialog that is open. */
  dialog: null as AnimDialog,
  /** AN15: the format last chosen in the export dialog (MP4 at first). */
  exportFormat: 'mp4' as AnimationFormat,
  /** G11 (M18): the format last chosen in Graphics mode's export dialog (PNG at first). */
  graphicFormat: 'png' as GraphicFormat,
  /** The Properties panel's W / H lock. */
  lockRatio: false,
  /** A text object was just made: the Properties panel focuses its words. */
  focusText: 0,
  /** GB1 (M21): View ▸ Pixel grid: lines between the pixels from 800 % (Graphics mode). */
  pixelGrid: true,
});

/** How close (screen px) a drag must come to a snap target. */
export const SNAP_PX = 8;
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
