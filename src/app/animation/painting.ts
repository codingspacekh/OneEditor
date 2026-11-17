// M21 (GB4, GB3, D3, GN2): Graphics mode's painting — the paintbrush, pencil, eraser and airbrush
// (a stroke shown as it is painted, kept as one undo step when the pointer is let go; Shift for a
// straight line from where the last stroke ended), the paint bucket and the gradient tool (pixel
// jobs, run in a Web Worker in the app, one undo step each), and their settings: the foreground
// and background colours, each brush tool's brush, the brush presets, the bucket's and gradient's
// options. All paint the current pixel layer, or its layer mask while that is being edited
// (black hides, white shows), inside the selection only; refused on a locked or hidden layer.
import type { Command } from '../history.ts';
import type { Point } from '../../core/animation/geometry.ts';
import type { AnimationDoc, Id, PixelContent } from '../../core/animation/types.ts';
import {
  checkBrush,
  createStroke,
  type BrushSettings,
  type StrokePoint,
} from '../../core/graphics/pixels/brush.ts';
import { gradientStops } from '../../core/graphics/pixels/fills.ts';
import { applyPatch } from '../../core/graphics/pixels/jobs.ts';
import { changePixels, pixelLayerOf } from '../../core/graphics/pixels/layers.ts';
import { rgbOf } from '../../core/graphics/pixels/paint.ts';
import {
  DEFAULT_PAINT,
  isBrushTool,
  type BrushPreset,
  type BrushTool,
  type BucketOptions,
  type GradientToolOptions,
  type PaintOptions,
} from '../../core/graphics/pixels/presets.ts';
import {
  createMask,
  fillRect,
  type Bitmap,
  type Mask,
  type Raster,
} from '../../core/graphics/pixels/raster.ts';
import { EditError } from '../../core/model/errors.ts';
import type { AnimationContext } from './context.ts';

/** A stroke under way: each move shows the document with it; let go, it is one undo step. */
export interface PaintStroke {
  /** The pointer moved. */
  to(p: StrokePoint): void;
  /** The airbrush held still for `ms`. */
  hold(ms: number): void;
  /** The document as it looks with the stroke so far (only the tiles dabbed are new). */
  shown(): AnimationDoc;
  /** The pointer let go: kept as one undo step (false: it changed nothing). */
  finish(): boolean;
}

const LABELS: Record<BrushTool, string> = {
  paintbrush: 'Paintbrush stroke',
  pencil: 'Pencil stroke',
  eraser: 'Eraser stroke',
  airbrush: 'Airbrush stroke',
};

const HEX = /^#[0-9a-f]{6}$/i;
const CHANGED = 'The layer changed while it was being filled. Fill again.';

function percent(name: string, v: number | undefined): void {
  if (v !== undefined && (!Number.isFinite(v) || v < 1 || v > 100))
    throw new EditError(`The ${name} is 1 to 100 %.`);
}

export function paintingActions(ctx: AnimationContext) {
  const options = (): PaintOptions => ctx.store.get().paint ?? DEFAULT_PAINT;
  const setOptions = (change: Partial<PaintOptions>) =>
    ctx.patch({ paint: { ...options(), ...change } });
  /** Where the last stroke ended, for Shift's straight line. */
  let last: { layerId: Id; point: StrokePoint } | null = null;
  let strokes = 0;

  /** The pixels the tools paint on now, refused (in words) where they may not change. */
  function target() {
    const { layerId, editingMask } = ctx.store.get();
    const doc = ctx.present();
    const layer = pixelLayerOf(doc, layerId);
    // A change of no consequence, to have a locked or hidden layer refused as any other edit.
    changePixels(doc, layerId, (p) => ({ ...p }));
    const { bitmap } = layer.pixels;
    const mask = editingMask === true;
    const raster: Raster = mask
      ? (layer.pixels.mask ??
        fillRect(
          createMask(bitmap.width, bitmap.height),
          { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
          255,
        ))
      : bitmap;
    return { layerId, layer, mask, raster };
  }
  const withRaster = (p: PixelContent, mask: boolean, raster: Raster): PixelContent =>
    mask ? { ...p, mask: raster as Mask } : { ...p, bitmap: raster as Bitmap };

  /** The command that puts a job's result in, refused if the layer changed meanwhile. */
  function putBack(
    label: string,
    t: ReturnType<typeof target>,
    result: Raster,
  ): Command<AnimationDoc> {
    return {
      label,
      apply: (doc) =>
        changePixels(doc, t.layerId, (p) => {
          const now = t.mask ? p.mask : p.bitmap;
          if (now !== (t.mask ? t.layer.pixels.mask : t.layer.pixels.bitmap))
            throw new EditError(CHANGED);
          return withRaster(p, t.mask, result);
        }),
    };
  }

  /** The selection, if it was made on an image of this size (else it is stale: none). */
  function selection(): { selection?: Mask } {
    const m = ctx.store.get().pixelSelection;
    const { width, height } = ctx.present().stage;
    return m && m.width === width && m.height === height ? { selection: m } : {};
  }

  /** The brush tool whose brush the settings change: the one chosen, else the paintbrush. */
  const brushTool = (): BrushTool => {
    const tool = ctx.store.get().tool;
    return isBrushTool(tool) ? tool : 'paintbrush';
  };

  return {
    /** GB4, GB3: the painting tools' settings now. */
    paintOptions: options,

    /** The foreground (what is painted) and background (a gradient's last) colours, as hex. */
    setPaintColours(change: { foreground?: string; background?: string }): string | null {
      const next = { ...change };
      for (const key of ['foreground', 'background'] as const) {
        const v = next[key];
        if (v === undefined) continue;
        if (!HEX.test(v)) return 'Type a colour such as #F4C8EE.';
        next[key] = v.toLowerCase();
      }
      setOptions(next);
      return null;
    },
    swapPaintColours(): void {
      const { foreground, background } = options();
      setOptions({ foreground: background, background: foreground });
    },
    /** Black on white, as the papers' tools start. */
    resetPaintColours(): void {
      setOptions({ foreground: DEFAULT_PAINT.foreground, background: DEFAULT_PAINT.background });
    },

    /** Changes a brush tool's brush (the tool chosen by default); a refusal is said in words. */
    setBrush(change: Partial<BrushSettings>, tool: BrushTool = brushTool()): string | null {
      const brush = { ...options().brushes[tool], ...change };
      try {
        checkBrush(brush);
      } catch (error) {
        return (error as Error).message;
      }
      setOptions({ brushes: { ...options().brushes, [tool]: brush } });
      return null;
    },
    /** A preset: its tool chosen, with its brush. */
    applyBrushPreset(preset: BrushPreset): void {
      setOptions({ brushes: { ...options().brushes, [preset.tool]: preset.brush } });
      ctx.patch({ tool: preset.tool });
    },
    setBucket(change: Partial<BucketOptions>): string | null {
      const t = change.tolerance;
      if (t !== undefined && (!Number.isFinite(t) || t < 0 || t > 255))
        return 'The tolerance is 0 to 255.';
      try {
        percent('opacity', change.opacity);
      } catch (error) {
        return (error as Error).message;
      }
      setOptions({ bucket: { ...options().bucket, ...change } });
      return null;
    },
    setGradientTool(change: Partial<GradientToolOptions>): string | null {
      try {
        percent('opacity', change.opacity);
      } catch (error) {
        return (error as Error).message;
      }
      if (change.stops?.some((st) => !HEX.test(st.colour))) return 'Type a colour such as #F4C8EE.';
      const stops = change.stops?.map((st) => ({ ...st, colour: st.colour.toLowerCase() }));
      setOptions({
        gradient: { ...options().gradient, ...change, ...(stops ? { stops } : {}) },
      });
      return null;
    },

    /**
     * GB4: a stroke of the brush tool chosen, starting at `point` (image px); `straight` (Shift):
     * a straight line from where the last stroke on this layer ended. Null (and a message) when
     * the layer cannot be painted, or the tool is not a brush.
     */
    startStroke(point: StrokePoint, how: { straight?: boolean } = {}): PaintStroke | null {
      const tool = ctx.store.get().tool;
      if (!isBrushTool(tool)) return null;
      let t: ReturnType<typeof target>;
      try {
        t = target();
      } catch (error) {
        ctx.showError(error);
        return null;
      }
      ctx.pause();
      const start = ctx.present();
      const o = options();
      const from = how.straight && last?.layerId === t.layerId ? last.point : point;
      const stroke = createStroke(
        {
          target: t.raster,
          x: t.layer.pixels.x,
          y: t.layer.pixels.y,
          brush: o.brushes[tool],
          colour: rgbOf(o.foreground),
          erase: tool === 'eraser',
          aliased: tool === 'pencil',
          ...selection(),
          seed: ++strokes,
        },
        from,
      );
      let end = from;
      if (from !== point) {
        stroke.to(point);
        end = point;
      }
      return {
        to(p) {
          stroke.to(p);
          end = p;
        },
        hold(ms) {
          stroke.hold(ms);
        },
        shown: () => changePixels(start, t.layerId, (p) => withRaster(p, t.mask, stroke.result())),
        finish() {
          last = { layerId: t.layerId, point: end };
          const result = stroke.result();
          if (result === t.raster) return false;
          return ctx.run(putBack(LABELS[tool], t, result));
        },
      };
    },

    /** GB3: the paint bucket clicked at `point` (image px), in the foreground colour. */
    async fillAt(point: Point): Promise<boolean> {
      try {
        const t = target();
        const o = options();
        const patch = await ctx.services.pixelWorker.run('bucket', {
          target: t.raster,
          sample: t.layer.pixels.bitmap,
          x: t.layer.pixels.x,
          y: t.layer.pixels.y,
          at: point,
          tolerance: o.bucket.tolerance,
          contiguous: o.bucket.contiguous,
          colour: rgbOf(o.foreground),
          opacity: o.bucket.opacity / 100,
          ...selection(),
        });
        const result = applyPatch(t.raster, patch);
        if (result === t.raster) return false;
        return ctx.run(putBack('Paint bucket', t, result));
      } catch (error) {
        ctx.showError(error);
        return false;
      }
    },

    /** GB3: the gradient tool dragged from `from` to `to` (image px). */
    async gradientFill(from: Point, to: Point): Promise<boolean> {
      try {
        const t = target();
        const o = options();
        const patch = await ctx.services.pixelWorker.run('gradient', {
          target: t.raster,
          x: t.layer.pixels.x,
          y: t.layer.pixels.y,
          from,
          to,
          kind: o.gradient.kind,
          stops: gradientStops(o.foreground, o.background, o.gradient.stops),
          opacity: o.gradient.opacity / 100,
          ...selection(),
        });
        const result = applyPatch(t.raster, patch);
        if (result === t.raster) return false;
        return ctx.run(putBack('Gradient', t, result));
      } catch (error) {
        ctx.showError(error);
        return false;
      }
    },
  };
}
