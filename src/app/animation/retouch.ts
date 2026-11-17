// M22 (GB5, D8, GN2): Graphics mode's retouching — the clone stamp (Alt-click, Option-click on a
// Mac, sets the source; aligned keeps the offset of the first stroke, else each stroke starts at
// the source again; copying from this layer or every visible pixel layer), the heal brush (a
// clone while painted, its colour and light matched to the surroundings when the pointer is let
// go), the blur, sharpen and smudge brushes, and red eye (a click, or a box dragged over the eye).
// Each stroke is shown as it is painted on M21's brush engine and kept as one undo step; all work
// on the current pixel layer, or its layer mask while that is being edited (red eye: the pixels
// only), inside the selection, refused on a locked or hidden layer — as painting.ts does.
import type { Command } from '../history.ts';
import type { Point } from '../../core/animation/geometry.ts';
import type { AnimationDoc, PixelContent } from '../../core/animation/types.ts';
import { createStroke, type StrokePoint } from '../../core/graphics/pixels/brush.ts';
import { healStroke, healedSource } from '../../core/graphics/pixels/heal.ts';
import { changePixels, pixelLayerOf } from '../../core/graphics/pixels/layers.ts';
import { drawnPixelLayers } from '../../core/graphics/pixels/merge.ts';
import {
  createMask,
  fillRect,
  type Bitmap,
  type Mask,
  type Raster,
} from '../../core/graphics/pixels/raster.ts';
import {
  blurredSource,
  clonePainter,
  compositeSource,
  rasterSource,
  removeRedEye,
  sharpenedSource,
  smudgeHooks,
  towardsPainter,
  type PixelSource,
} from '../../core/graphics/pixels/retouch.ts';
import {
  DEFAULT_RETOUCH,
  checkRetouch,
  isRetouchBrushTool,
  type RetouchBrushTool,
  type RetouchOptions,
} from '../../core/graphics/pixels/retouch-options.ts';
import type { BrushSettings } from '../../core/graphics/pixels/brush.ts';
import { EditError } from '../../core/model/errors.ts';
import type { AnimationContext } from './context.ts';
import type { PaintStroke } from './painting.ts';

const LABELS: Record<RetouchBrushTool, string> = {
  clone: 'Clone stamp',
  heal: 'Heal',
  'blur-brush': 'Blur brush',
  'sharpen-brush': 'Sharpen brush',
  smudge: 'Smudge',
};

const NO_SOURCE =
  'First Alt-click (Option-click on a Mac) the place to copy from, then paint over what to cover.';
const CHANGED = 'The layer changed while it was being worked on. Do it again.';
/** A drag shorter than this (image px) is a click for red eye. */
const CLICK = 4;

/** GB5: how far the blur brush blurs, and the sharpen brush's unsharp mask, for a brush size. */
export const blurSigma = (size: number): number => Math.max(1, Math.min(25, size / 10));
export const sharpenSigma = (size: number): number => Math.max(1, Math.min(3, size / 30));
/** The sharpen brush at full strength pushes each pixel this far from its blurred self. */
const SHARPEN_AMOUNT = 1.5;

export function retouchActions(ctx: AnimationContext) {
  const options = (): RetouchOptions => ctx.store.get().retouch ?? DEFAULT_RETOUCH;
  const setOptions = (change: Partial<RetouchOptions>) =>
    ctx.patch({ retouch: { ...options(), ...change } });

  /** The pixels the tools work on now, refused (in words) where they may not change. */
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
    return { layerId, layer, mask, raster, place: { x: layer.pixels.x, y: layer.pixels.y } };
  }
  type Target = ReturnType<typeof target>;
  const withRaster = (p: PixelContent, mask: boolean, raster: Raster): PixelContent =>
    mask ? { ...p, mask: raster as Mask } : { ...p, bitmap: raster as Bitmap };

  /** The command that puts the result in, refused if the layer changed meanwhile. */
  function putBack(label: string, t: Target, result: Raster): Command<AnimationDoc> {
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
  function selection(): Mask | undefined {
    const m = ctx.store.get().pixelSelection;
    const { width, height } = ctx.present().stage;
    return m && m.width === width && m.height === height ? m : undefined;
  }

  /** What the clone and heal copy from: the layer (or its mask), or all visible pixel layers. */
  function sourceFor(t: Target): PixelSource {
    if (t.mask || options().sample === 'layer') return rasterSource(t.raster, t.place.x, t.place.y);
    const { width, height } = ctx.present().stage;
    return compositeSource(drawnPixelLayers(ctx.present()), { x: 0, y: 0, width, height });
  }

  /** The retouching tool whose settings change: the one chosen, else the clone stamp. */
  const retouchTool = (): RetouchBrushTool => {
    const tool = ctx.store.get().tool;
    return isRetouchBrushTool(tool) ? tool : 'clone';
  };

  /** Settings checked, then kept; a refusal is said in words. */
  function setChecked(next: RetouchOptions): string | null {
    try {
      checkRetouch(next);
    } catch (error) {
      return (error as Error).message;
    }
    ctx.patch({ retouch: next });
    return null;
  }

  return {
    /** GB5: the retouching tools' settings now. */
    retouchOptions: options,

    /** Aligned, what is copied from, the strengths, red eye's pupil size and darkening. */
    setRetouch(
      change: Partial<Pick<RetouchOptions, 'aligned' | 'sample' | 'pupilSize' | 'darken'>> & {
        strength?: Partial<RetouchOptions['strength']>;
      },
    ): string | null {
      const o = options();
      const { strength, ...rest } = change;
      const next = { ...o, ...rest, strength: { ...o.strength, ...strength } };
      // Changing aligned starts the offset again from the next stroke.
      if (change.aligned !== undefined && change.aligned !== o.aligned) delete next.offset;
      return setChecked(next);
    },

    /** Changes a retouching brush (the tool chosen by default). */
    setRetouchBrush(
      change: Partial<BrushSettings>,
      tool: RetouchBrushTool = retouchTool(),
    ): string | null {
      const o = options();
      return setChecked({
        ...o,
        brushes: { ...o.brushes, [tool]: { ...o.brushes[tool], ...change } },
      });
    },

    /** GB5: Alt-click — the clone's and heal's source (image px); the offset starts again. */
    setCloneSource(point: Point): void {
      const o = { ...options(), source: { x: Math.round(point.x), y: Math.round(point.y) } };
      delete o.offset;
      ctx.patch({ retouch: o });
    },

    /**
     * GB5: where the source is for a pointer at `at` (image px): aligned with an offset set (or
     * while painting), the pointer plus the offset; else the source itself; null with none.
     */
    cloneSourceFor(at: Point | null, painting = false): Point | null {
      const o = options();
      if (!o.source) return null;
      if (at && o.offset && (o.aligned || painting))
        return { x: at.x + o.offset.dx, y: at.y + o.offset.dy };
      return o.source;
    },

    /**
     * GB5: a stroke of the retouching brush chosen (clone, heal, blur, sharpen, smudge) starting
     * at `point` (image px). Null (and a message) when the layer cannot be changed, the clone or
     * heal has no source yet, or the tool is not a retouching brush.
     */
    startRetouch(point: StrokePoint): PaintStroke | null {
      const tool = ctx.store.get().tool;
      if (!isRetouchBrushTool(tool)) return null;
      let t: Target;
      try {
        t = target();
      } catch (error) {
        ctx.showError(error);
        return null;
      }
      const o = options();
      const copies = tool === 'clone' || tool === 'heal';
      if (copies && !o.source) {
        ctx.showError(new EditError(NO_SOURCE));
        return null;
      }
      ctx.pause();
      const start = ctx.present();
      const brush = o.brushes[tool];
      const sel = selection();
      const base = {
        target: t.raster,
        x: t.place.x,
        y: t.place.y,
        brush,
        colour: [0, 0, 0] as const,
        ...(sel ? { selection: sel } : {}),
      };
      let offset = { dx: 0, dy: 0 };
      let source: PixelSource | null = null;
      let hooks: Partial<Parameters<typeof createStroke>[0]>;
      if (copies) {
        const from = o.source!;
        offset =
          o.aligned && o.offset
            ? o.offset
            : { dx: Math.round(from.x - point.x), dy: Math.round(from.y - point.y) };
        if (o.offset !== offset) setOptions({ offset });
        source = sourceFor(t);
        hooks = { painter: clonePainter(source, t.place, offset, t.raster.channels) };
      } else if (tool === 'smudge') {
        hooks = smudgeHooks(
          t.raster,
          t.place,
          o.strength.smudge / 100,
          brush.hardness / 100,
          brush.size,
          sel,
        );
      } else {
        const strength = o.strength[tool] / 100;
        const towards = towardsPainter(
          tool === 'blur-brush'
            ? blurredSource(t.raster, blurSigma(brush.size))
            : sharpenedSource(t.raster, sharpenSigma(brush.size), SHARPEN_AMOUNT),
        );
        hooks = { painter: (out, k, x, y, a) => towards(out, k, x, y, a * strength) };
      }
      const stroke = createStroke({ ...base, ...hooks }, point);
      return {
        to: (p) => stroke.to(p),
        hold: () => {},
        shown: () => changePixels(start, t.layerId, (p) => withRaster(p, t.mask, stroke.result())),
        finish() {
          if (tool === 'heal') {
            const weights = stroke.weights();
            if (weights) {
              const healed = healStroke(t.raster, t.place, source!, offset, weights, sel);
              stroke.repaint(
                clonePainter(
                  healedSource(healed),
                  { x: 0, y: 0 },
                  { dx: 0, dy: 0 },
                  t.raster.channels,
                ),
              );
            }
          }
          const result = stroke.result();
          if (result === t.raster) return false;
          return ctx.run(putBack(LABELS[tool], t, result));
        },
      };
    },

    /**
     * GB5: red eye at a click (a circle the pupil size across) or over a box dragged from `from`
     * to `to` (image px), on the current pixel layer's pixels, inside the selection: one undo
     * step. False (and a word) when there was no red there.
     */
    redEyeAt(from: Point, to?: Point): boolean {
      let t: Target;
      try {
        t = target();
        if (t.mask) throw new EditError('Red eye works on the layer’s pixels, not its mask.');
      } catch (error) {
        ctx.showError(error);
        return false;
      }
      const o = options();
      const box = to && Math.abs(to.x - from.x) >= CLICK && Math.abs(to.y - from.y) >= CLICK;
      const area = box
        ? {
            cx: (from.x + to.x) / 2,
            cy: (from.y + to.y) / 2,
            rx: Math.abs(to.x - from.x) / 2,
            ry: Math.abs(to.y - from.y) / 2,
          }
        : { cx: from.x, cy: from.y, rx: o.pupilSize / 2, ry: o.pupilSize / 2 };
      const result = removeRedEye(t.raster as Bitmap, t.place, area, o.darken / 100, selection());
      if (result === t.raster) {
        ctx.patch({
          message: {
            kind: 'info',
            text: 'No red pupil there: click the middle of a red eye, or drag a box over it.',
          },
        });
        return false;
      }
      return ctx.run(putBack('Red eye', t, result));
    },
  };
}
