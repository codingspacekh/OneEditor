// M21 (D3, GN2): the heavy pixel work, as a table of named jobs — each a pure function of inputs
// that copy to a Web Worker as they are (rasters are plain objects of typed arrays) — answering
// with only the tiles it changed (a patch). The page puts the patch into its own raster, so every
// other tile stays the very array the document already holds (GN1: undo keeps only what changed).
// The app runs the jobs through the PixelWorker port: a Web Worker in the app (workers/pixels.ts),
// in the page in tests and when the worker cannot start. M23 (GN2): Image size, Reduce colours and
// the transforms too — a job of another size answers with the whole raster; a transform with each
// of the layer's rasters as a patch on the one it was given, the tiles it kept left out.
import type { PixelContent } from '../../animation/types.ts';
import { EditError } from '../../model/errors.ts';
import type { PixelWorker } from '../../ports.ts';
import { bucketFill, gradientFill, type BucketInput, type GradientInput } from './fills.ts';
import { adjust, type AnyAdjustment } from './adjust.ts';
import { runFilter, type FilterSpec } from './filter-specs.ts';
import { tilesAcross, tilesDown, type Bitmap, type Mask, type Raster } from './raster.ts';
import { reduceColours, type ColourTarget } from './reduce-colours.ts';
import { resampleRaster } from '../image-size.ts';
import type { ResampleMethod } from './resample.ts';
import { transformPixels, transformSelected, type Matrix } from './transform.ts';

/** The tiles a job changed (null: emptied), for a raster of this size. */
export interface TilePatch {
  width: number;
  height: number;
  channels: 1 | 4;
  changes: [number, Uint8ClampedArray | null][];
}

/** The tiles of `after` that are not the very tiles of `before`. */
export function patchOf(before: Raster, after: Raster): TilePatch {
  const changes: TilePatch['changes'] = [];
  after.tiles.forEach((t, i) => {
    if (t !== before.tiles[i]) changes.push([i, t]);
  });
  return { width: before.width, height: before.height, channels: before.channels, changes };
}

/** The raster with the patch's tiles put in; itself when the patch is empty. */
export function applyPatch<C extends 1 | 4>(r: Raster<C>, patch: TilePatch): Raster<C> {
  if (r.width !== patch.width || r.height !== patch.height || r.channels !== patch.channels)
    throw new EditError('The pixels changed while they were being worked on.');
  if (patch.changes.length === 0) return r;
  const tiles = [...r.tiles];
  for (const [i, t] of patch.changes) tiles[i] = t;
  return { ...r, tiles };
}

const sameSize = (a: Raster, b: { width: number; height: number; channels: number }) =>
  a.width === b.width && a.height === b.height && a.channels === b.channels;

/**
 * M23 (GN1): `after` as a patch on `before`: of the same size, only the tiles that are not the
 * very tiles of `before`; of another size, every tile that is not empty.
 */
export function patchFrom(before: Raster, after: Raster): TilePatch {
  if (sameSize(before, after)) return patchOf(before, after);
  const changes: TilePatch['changes'] = [];
  after.tiles.forEach((t, i) => {
    if (t) changes.push([i, t]);
  });
  return { width: after.width, height: after.height, channels: after.channels, changes };
}

/** M23: the raster a patchFrom patch makes from `before` (itself when nothing changed). */
export function rasterFrom<C extends 1 | 4>(before: Raster<C>, patch: TilePatch): Raster<C> {
  if (sameSize(before, patch)) return applyPatch(before, patch);
  const size = { width: patch.width, height: patch.height, channels: patch.channels as C };
  const tiles = new Array<Uint8ClampedArray | null>(tilesAcross(size) * tilesDown(size)).fill(null);
  for (const [i, t] of patch.changes) tiles[i] = t;
  return { ...size, tiles };
}

/** G3 (M23): a layer's pixels (or only the selected ones) through a matrix. */
export interface TransformInput {
  pixels: PixelContent;
  matrix: Matrix;
  method: ResampleMethod;
  /** Image-sized: only these pixels are moved, and it goes with them. */
  selection?: Mask;
}

/** A transform's answer: each raster as a patch on the one it was given. */
export interface TransformAnswer {
  pixels: { bitmap: TilePatch; mask?: TilePatch; x: number; y: number };
  selection?: TilePatch;
}

function transformJob(input: TransformInput): TransformAnswer {
  const { pixels: p, matrix, method, selection } = input;
  const out: { pixels: PixelContent; selection?: Mask } = selection
    ? transformSelected(p, selection, matrix, method)
    : { pixels: transformPixels(p, matrix, method) };
  const { bitmap, mask, x, y } = out.pixels;
  return {
    pixels: {
      bitmap: patchFrom(p.bitmap, bitmap),
      // A mask goes with the pixels: only a layer that has one has one after.
      ...(mask && p.mask ? { mask: patchFrom(p.mask, mask) } : {}),
      x,
      y,
    },
    ...(selection && out.selection ? { selection: patchFrom(selection, out.selection) } : {}),
  };
}

/**
 * M23: a transform's answer put together with what it was given: the pixels (the very pixels
 * when nothing changed) and the selection that went with them, if any.
 */
export function pixelsFromAnswer(
  p: PixelContent,
  answer: TransformAnswer,
  selection?: Mask,
): { pixels: PixelContent; selection?: Mask } {
  const { bitmap, mask, x, y } = answer.pixels;
  const b = rasterFrom(p.bitmap, bitmap);
  const m = mask && p.mask ? rasterFrom(p.mask, mask) : undefined;
  const same = b === p.bitmap && m === p.mask && x === p.x && y === p.y;
  const pixels: PixelContent = same ? p : { bitmap: b, x, y, ...(m ? { mask: m } : {}) };
  const moved = selection && answer.selection ? rasterFrom(selection, answer.selection) : undefined;
  return { pixels, ...(moved ? { selection: moved } : {}) };
}

export const PIXEL_JOBS = {
  /** GB3: the paint bucket. */
  bucket: (input: BucketInput): TilePatch => patchOf(input.target, bucketFill(input)),
  /** GB3: the gradient tool. */
  gradient: (input: GradientInput): TilePatch => patchOf(input.target, gradientFill(input)),
  /** GB3 (M22): an adjustment on a layer's pixels or its mask; `scale`: image px a pixel covers. */
  adjust: (input: { raster: Raster; adjustment: AnyAdjustment; scale: number }): TilePatch =>
    patchOf(input.raster, adjust(input.raster, input.adjustment, input.scale)),
  /** GB5 (M22): a filter (blur, sharpen, twirl, distort), placed on the pixels (filterInRaster). */
  filter: (input: { raster: Raster; spec: FilterSpec }): TilePatch =>
    patchOf(input.raster, runFilter(input.raster, input.spec)),
  /** GB6 (M23): Image size: a layer's bitmap or mask at another size (the whole raster). */
  resample: <C extends 1 | 4>(input: {
    raster: Raster<C>;
    width: number;
    height: number;
    method: ResampleMethod;
  }): Raster<C> => resampleRaster(input.raster, input.width, input.height, input.method),
  /** GB6 (M23): Reduce colours on a layer's bitmap (the tiles it changed). */
  reduceColours: (input: { bitmap: Bitmap; to: ColourTarget; dither: boolean }): TilePatch =>
    patchOf(input.bitmap, reduceColours(input.bitmap, input)),
  /** G3 (M23): a layer's pixels, or the selected ones, moved, scaled, turned, flipped, skewed. */
  transform: transformJob,
};

export type PixelJob = keyof typeof PIXEL_JOBS;
export type PixelJobInput<J extends PixelJob> = Parameters<(typeof PIXEL_JOBS)[J]>[0];
/** What a job answers with: the tiles it changed, or (M23) the whole raster or a transform's. */
export type PixelJobOutput<J extends PixelJob> = ReturnType<(typeof PIXEL_JOBS)[J]>;

export function runPixelJob<J extends PixelJob>(
  job: J,
  input: PixelJobInput<J>,
): PixelJobOutput<J> {
  return (PIXEL_JOBS[job] as (input: PixelJobInput<J>) => PixelJobOutput<J>)(input);
}

/** The jobs run in the page (tests; the app when its worker cannot start). */
export const IN_PROCESS_PIXELS: PixelWorker = {
  run: async (job, input) => runPixelJob(job, input),
};

// ---- the worker's side of the messages ----

export interface PixelRequest {
  id: number;
  job: PixelJob;
  input: unknown;
}

export type PixelReply =
  | { id: number; ok: true; result: PixelJobOutput<PixelJob> }
  /** `edit`: a refusal in words for the student (an EditError), not a fault. */
  | { id: number; ok: false; edit: boolean; message: string };

/** The buffers of every tile in an answer (each once), to hand over rather than copy. */
function buffersIn(value: unknown, found: Set<ArrayBuffer>): Set<ArrayBuffer> {
  if (value instanceof Uint8ClampedArray) found.add(value.buffer as ArrayBuffer);
  else if (Array.isArray(value)) for (const v of value) buffersIn(v, found);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) buffersIn(v, found);
  return found;
}

/** What the worker sends back for a request, and the tiles' buffers it can hand over. */
export function answerPixelJob(request: PixelRequest): {
  reply: PixelReply;
  transfer: ArrayBuffer[];
} {
  try {
    const run = PIXEL_JOBS[request.job] as
      ((input: unknown) => PixelJobOutput<PixelJob>) | undefined;
    if (!run) throw new Error(`There is no pixel job "${String(request.job)}".`);
    const result = run(request.input);
    const transfer = [...buffersIn(result, new Set())];
    return { reply: { id: request.id, ok: true, result }, transfer };
  } catch (error) {
    return {
      reply: {
        id: request.id,
        ok: false,
        edit: error instanceof EditError,
        message: error instanceof Error ? error.message : String(error),
      },
      transfer: [],
    };
  }
}
