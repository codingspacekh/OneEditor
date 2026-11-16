// M22 (GB5, D8): the retouching tools' settings — the clone stamp's, heal brush's, blur, sharpen
// and smudge brushes' own brushes (M21's brush settings), whether the clone and heal keep their
// offset from stroke to stroke (aligned) and what they copy from (this layer or every visible
// pixel layer), the blur, sharpen and smudge strengths, red eye's pupil size and how much it
// darkens; and the source point Alt-clicked (Option-click on a Mac). Not saved with the image.
import { DEFAULT_BRUSH, checkBrush, type BrushSettings } from './brush.ts';
import { EditError } from '../../model/errors.ts';

export type RetouchBrushTool = 'clone' | 'heal' | 'blur-brush' | 'sharpen-brush' | 'smudge';
export const RETOUCH_BRUSH_TOOLS: readonly RetouchBrushTool[] = [
  'clone',
  'heal',
  'blur-brush',
  'sharpen-brush',
  'smudge',
];
export const isRetouchBrushTool = (tool: string): tool is RetouchBrushTool =>
  (RETOUCH_BRUSH_TOOLS as readonly string[]).includes(tool);

/** The brushes with a strength (how strongly each stroke blurs, sharpens or smears). */
export type StrengthTool = 'blur-brush' | 'sharpen-brush' | 'smudge';
export const isStrengthTool = (tool: string): tool is StrengthTool =>
  tool === 'blur-brush' || tool === 'sharpen-brush' || tool === 'smudge';

export interface RetouchOptions {
  brushes: Record<RetouchBrushTool, BrushSettings>;
  /** Clone and heal: each stroke keeps the offset of the first (false: starts at the source). */
  aligned: boolean;
  /** Clone and heal copy from the current layer, or from every visible pixel layer as seen. */
  sample: 'layer' | 'all';
  /** %, 1–100. */
  strength: Record<StrengthTool, number>;
  /** Red eye clicked: the pupil's size across, image px (2–500). */
  pupilSize: number;
  /** Red eye: how much the red pupil is darkened, % (0–100). */
  darken: number;
  /** Clone and heal: the point copied from (image px), Alt-clicked. */
  source?: { x: number; y: number };
  /** Clone and heal, aligned: from where it is painted to the source (image px), once set. */
  offset?: { dx: number; dy: number };
}

export const DEFAULT_RETOUCH: RetouchOptions = {
  brushes: {
    clone: { ...DEFAULT_BRUSH, size: 40, hardness: 50, pressureSize: false },
    heal: { ...DEFAULT_BRUSH, size: 40, hardness: 50, pressureSize: false },
    'blur-brush': { ...DEFAULT_BRUSH, size: 40 },
    'sharpen-brush': { ...DEFAULT_BRUSH, size: 40 },
    smudge: { ...DEFAULT_BRUSH, size: 30, spacing: 10 },
  },
  aligned: true,
  sample: 'layer',
  strength: { 'blur-brush': 50, 'sharpen-brush': 30, smudge: 50 },
  pupilSize: 30,
  darken: 50,
};

/** Refuses settings out of range, saying the range. */
export function checkRetouch(o: RetouchOptions): void {
  for (const tool of RETOUCH_BRUSH_TOOLS) checkBrush(o.brushes[tool]);
  for (const v of Object.values(o.strength))
    if (!Number.isFinite(v) || v < 1 || v > 100) throw new EditError('The strength is 1 to 100 %.');
  if (!Number.isFinite(o.pupilSize) || o.pupilSize < 2 || o.pupilSize > 500)
    throw new EditError('The pupil size is 2 to 500 px.');
  if (!Number.isFinite(o.darken) || o.darken < 0 || o.darken > 100)
    throw new EditError('The darken amount is 0 to 100 %.');
  if (o.sample !== 'layer' && o.sample !== 'all') throw new EditError('Choose what to copy from.');
}
