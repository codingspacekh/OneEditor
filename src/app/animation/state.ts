// Animation mode's state: what the store holds, what the app needs from outside, and the
// derived facts the UI shows (unsaved work, the window title).
import type { History } from '../history.ts';
import type { AnimationFormat } from '../../core/animation/export.ts';
import type { AnimationDoc, Id, PixelContent } from '../../core/animation/types.ts';
import type { SpiralOptions } from '../../core/graphics/shapes.ts';
import type { Mask } from '../../core/graphics/pixels/raster.ts';
import type { PaintOptions } from '../../core/graphics/pixels/presets.ts';
import type {
  AppPaths,
  Dialogs,
  MediaEngine,
  PageAssets,
  PixelWorker,
  ProjectFiles,
  StageRenderer,
} from '../../core/ports.ts';
import { fileNameOf } from '../../core/project/relocate.ts';
import type { AudioOutput } from '../audio/state.ts';
import { ANIMATION_KIND, withoutExtension, type EditorKind } from './kind.ts';

export type Tool =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'star'
  | 'polygon'
  | 'line'
  /** GV1 (M19): part of an ellipse, a spiral, and straight lines clicked point to point. */
  | 'arc'
  | 'spiral'
  | 'polyline'
  | 'pen'
  | 'brush'
  | 'text'
  | 'picture'
  | 'button'
  /** GB2 (M21): selections on pixel layers (Graphics mode). */
  | 'select-rect'
  | 'select-ellipse'
  | 'lasso'
  | 'polygon-lasso'
  | 'magnetic-lasso'
  | 'magic-wand'
  | 'colour-select'
  /** GB4, GB3 (M21): painting on a pixel layer or its mask; the paint bucket and gradient. */
  | 'paintbrush'
  | 'pencil'
  | 'eraser'
  | 'airbrush'
  | 'bucket'
  | 'gradient'
  /** GB1 (M21): pan (also Space held) and zoom by clicking. */
  | 'hand'
  | 'zoom'
  /** GB5 (M22): retouching on a pixel layer: clone stamp, heal, the blur / sharpen / smudge brushes, red eye. */
  | 'clone'
  | 'heal'
  | 'blur-brush'
  | 'sharpen-brush'
  | 'smudge'
  | 'red-eye';

/** M21: the tools that work on a pixel layer's pixels (Graphics mode only). */
export const PIXEL_TOOLS: readonly Tool[] = [
  'select-rect',
  'select-ellipse',
  'lasso',
  'polygon-lasso',
  'magnetic-lasso',
  'magic-wand',
  'colour-select',
  'paintbrush',
  'pencil',
  'eraser',
  'airbrush',
  'bucket',
  'gradient',
  'clone',
  'heal',
  'blur-brush',
  'sharpen-brush',
  'smudge',
  'red-eye',
];

export type ShapeKind = 'rect' | 'ellipse' | 'star' | 'polygon' | 'arc' | 'spiral';

export interface AnimationState {
  history: History<AnimationDoc>;
  /** The .mvea file, or null for an animation that was never saved. */
  path: string | null;
  /** The document as last saved or opened: anything else is unsaved work. */
  saved: AnimationDoc;
  /** Selected objects (top-level ones). */
  selection: Id[];
  /**
   * GV3 (M19): the nodes chosen on the one pen path selected (its node indices). They belong to
   * that very selection (`selection` is the same array): any new selection forgets them.
   */
  nodes?: { selection: Id[]; indices: number[] };
  /** The layer new objects go on. */
  layerId: Id;
  tool: Tool;
  /** GV1 (M19): how the Spiral tool draws its next spiral (absent: 3 even turns from the middle). */
  spiral?: SpiralOptions;
  /**
   * GB2 (M21): the pixels selected, on the whole image (its size, image px): 255 selected, 0 not,
   * between: partly (feathered). Not part of the document: not saved, and not an undo step of
   * its own, so Undo undoes the last change to the picture. Absent: none.
   */
  pixelSelection?: Mask;
  /** GB2 (M21): paint on the current pixel layer's mask instead of its pixels. */
  editingMask?: boolean;
  /**
   * M22 (GN2): an adjustment or filter shown live while its dialog is open: the stage draws these
   * pixels (perhaps a reduced copy) instead of the layer's. Never saved, never an undo step.
   */
  pixelPreview?: { layerId: Id; pixels: PixelContent };
  /**
   * GB4, GB3 (M21): the painting tools' settings — the foreground and background colours, each
   * brush tool's brush, the bucket's and the gradient's options (absent: DEFAULT_PAINT). Not saved.
   */
  paint?: PaintOptions;
  /** 1 = 100 %; 'fit' fills the window. */
  zoom: number | 'fit';
  /** AN8: the playhead, 0 to the stage's length (the end shows the last pose). */
  frame: number;
  playing: boolean;
  /** AN8: loop the whole animation, or the frames from `from` to `to` (both shown). */
  loop: Loop;
  /** AN14: the drawings before and after drawn faintly on frame-by-frame layers (not saved). */
  onionSkin: boolean;
  /** AN15: an export of the frames under way (N12: progress and Cancel). */
  exporting: AnimationExporting | null;
  /** What Animation mode is doing, e.g. "Exporting…". */
  busy: string | null;
  message: { kind: 'error' | 'info'; text: string } | null;
}

export interface AnimationExporting {
  format: AnimationFormat;
  /** Drawing the frames, then FFmpeg making the file (MP4 and GIF only). */
  phase: 'drawing' | 'encoding';
  /** 0–1 within the phase. */
  progress: number;
  output: string;
}

export interface Loop {
  on: boolean;
  from?: number;
  to?: number;
}

export interface AnimationDeps {
  dialogs: Dialogs;
  files: ProjectFiles;
  paths: AppPaths;
  engine: MediaEngine;
  renderer?: StageRenderer;
  /** AN15: what an HTML web animation carries inside it (read by the main process in the app). */
  pageAssets?: PageAssets;
  /** AN28: the speakers the animation's sounds play on while it plays (none: silent). */
  audioOutput?: AudioOutput;
  autosaveMs?: number;
  /** D3, GN2 (M21): where the heavy pixel jobs run (a Web Worker in the app; absent: the page). */
  pixelWorker?: PixelWorker;
  /** M18: an animation (the default) or Graphics mode's image. */
  kind?: EditorKind;
  /** P8: a file name in the papers' form ("Casing" → "Casing_ZZ999_9999"), for files named here. */
  fileName?: (base: string) => string;
}

/**
 * Unsaved work: anything but the view settings (rulers, grid, snapping, open folders), which are
 * saved with the animation but are not edits. The document is immutable, so the other parts are
 * the same objects until an edit replaces them.
 */
export const isAnimationDirty = (s: AnimationState): boolean => {
  const a = s.history.present;
  const b = s.saved;
  if (a === b) return false;
  return (
    a.name !== b.name ||
    a.stage !== b.stage ||
    a.graphic !== b.graphic ||
    a.layers !== b.layers ||
    a.folders !== b.folders ||
    a.pictures !== b.pictures ||
    a.sounds !== b.sounds ||
    a.guides !== b.guides
  );
};

/** For the window title: "Chapter07_Task1_1 •" or "Untitled animation" ("Untitled image"). */
export const animationTitle = (s: AnimationState, kind: EditorKind = ANIMATION_KIND): string =>
  `${s.path ? withoutExtension(fileNameOf(s.path), kind) : kind.untitled}${
    isAnimationDirty(s) ? ' •' : ''
  }`;
