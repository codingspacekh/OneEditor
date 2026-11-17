// M21 (GB4, GB3): the painting tools' settings — each brush tool's brush, the foreground and
// background colours, the paint bucket's and the gradient tool's options — and the brush presets:
// built in (a soft and a hard round, a 1 px pencil, an airbrush, square, star and scatter — the
// stars and lights of the night scene — and a soft eraser) and saved by the student (kept in the
// app's preferences, read back safely here).
import type { GradientStop } from '../../animation/types.ts';
import { BRUSH_SHAPES, DEFAULT_BRUSH, checkBrush, type BrushSettings } from './brush.ts';

export type BrushTool = 'paintbrush' | 'pencil' | 'eraser' | 'airbrush';
export const BRUSH_TOOLS: readonly BrushTool[] = ['paintbrush', 'pencil', 'eraser', 'airbrush'];
export const isBrushTool = (tool: string): tool is BrushTool =>
  (BRUSH_TOOLS as readonly string[]).includes(tool);

export interface BucketOptions {
  /** 0–255: how far each channel may be from the clicked pixel's. */
  tolerance: number;
  contiguous: boolean;
  /** %, 1–100. */
  opacity: number;
}

export interface GradientToolOptions {
  kind: 'linear' | 'radial';
  /** %, 1–100. */
  opacity: number;
  /** AN6: the colours between the foreground (first) and the background (last). */
  stops: GradientStop[];
}

export interface PaintOptions {
  /** What the brush, pencil, bucket and gradient paint with (hex). */
  foreground: string;
  /** The gradient's last colour (hex); swapped with the foreground by X. */
  background: string;
  brushes: Record<BrushTool, BrushSettings>;
  bucket: BucketOptions;
  gradient: GradientToolOptions;
}

export const DEFAULT_PAINT: PaintOptions = {
  foreground: '#000000',
  background: '#ffffff',
  brushes: {
    paintbrush: DEFAULT_BRUSH,
    pencil: { ...DEFAULT_BRUSH, size: 1, hardness: 100, pressureSize: false },
    eraser: { ...DEFAULT_BRUSH, size: 30, hardness: 50 },
    airbrush: { ...DEFAULT_BRUSH, size: 60, flow: 10 },
  },
  bucket: { tolerance: 32, contiguous: true, opacity: 100 },
  gradient: { kind: 'linear', opacity: 100, stops: [] },
};

export interface BrushPreset {
  name: string;
  tool: BrushTool;
  brush: BrushSettings;
}

const preset = (name: string, tool: BrushTool, brush: Partial<BrushSettings>): BrushPreset => ({
  name,
  tool,
  brush: { ...DEFAULT_PAINT.brushes[tool], ...brush },
});

export const BUILT_IN_PRESETS: readonly BrushPreset[] = [
  preset('Soft round', 'paintbrush', { size: 30, hardness: 0 }),
  preset('Hard round', 'paintbrush', { size: 20, hardness: 100 }),
  preset('Pencil 1 px', 'pencil', { size: 1 }),
  preset('Airbrush', 'airbrush', { size: 60, hardness: 0, flow: 10 }),
  preset('Square', 'paintbrush', { size: 20, hardness: 100, shape: 'square' }),
  preset('Star', 'paintbrush', { size: 40, hardness: 100, shape: 'star', spacing: 150 }),
  preset('Scatter: stars and lights', 'paintbrush', {
    size: 8,
    hardness: 40,
    shape: 'scatter',
    spacing: 300,
    pressureSize: false,
  }),
  preset('Soft eraser', 'eraser', { size: 40, hardness: 0 }),
];

/** The presets saved in the preferences, read safely: any that is not understood is left out. */
export function parsePresets(value: unknown): BrushPreset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v: unknown): BrushPreset[] => {
    if (typeof v !== 'object' || v === null) return [];
    const p = v as Partial<BrushPreset>;
    if (typeof p.name !== 'string' || p.name.trim() === '') return [];
    if (typeof p.tool !== 'string' || !isBrushTool(p.tool)) return [];
    if (typeof p.brush !== 'object' || p.brush === null) return [];
    const brush = { ...DEFAULT_PAINT.brushes[p.tool], ...p.brush };
    if (!BRUSH_SHAPES.includes(brush.shape)) return [];
    brush.pressureSize = brush.pressureSize === true;
    brush.pressureFlow = brush.pressureFlow === true;
    try {
      checkBrush(brush);
    } catch {
      return [];
    }
    return [{ name: p.name.trim(), tool: p.tool, brush }];
  });
}
