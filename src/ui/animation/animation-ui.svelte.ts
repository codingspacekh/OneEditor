// UI-only state of Animation mode shared by its panels (not part of the animation, not undoable).
import type { AnimationFormat } from '../../core/animation/export.ts';
import type { Tool } from '../../app/animation.ts';
import type { ColourDepth, GraphicFormat, TiffCompression } from '../../core/graphics/export.ts';

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
  /**
   * G11 (M23): the export's bitmap choices last made: each format's colour depth, the palette
   * (the image's colours or greys), dithering, keeping see-through parts and TIFF compression.
   */
  graphicDepths: {} as Partial<Record<GraphicFormat, ColourDepth>>,
  graphicPalette: 'colours' as 'colours' | 'greys',
  /** At 1 bit: black and white (greys), unless the image's own two colours are chosen. */
  graphicPalette1: 'greys' as 'colours' | 'greys',
  graphicDither: true,
  graphicTransparent: true,
  graphicTiff: 'lzw' as TiffCompression,
  /** The Properties panel's W / H lock. */
  lockRatio: false,
  /** A text object was just made: the Properties panel focuses its words. */
  focusText: 0,
  /** GB1 (M21): View ▸ Pixel grid: lines between the pixels from 800 % (Graphics mode). */
  pixelGrid: true,
  /** 2026-11-18: the stage seen through the camera (a preview: editing is off meanwhile). */
  cameraView: false,
  /**
   * The tool strip's families (tool-families.ts): the tool each one shows, the one of it last
   * used (by its button, its flyout or its key), for the session.
   */
  toolFamily: {} as Record<string, Tool>,
});

/** How close (screen px) a drag must come to a snap target. */
export const SNAP_PX = 8;
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
