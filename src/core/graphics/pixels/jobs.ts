// M21 (D3, GN2): the heavy pixel work, as a table of named jobs — each a pure function of inputs
// that copy to a Web Worker as they are (rasters are plain objects of typed arrays) — answering
// with only the tiles it changed (a patch). The page puts the patch into its own raster, so every
// other tile stays the very array the document already holds (GN1: undo keeps only what changed).
// The app runs the jobs through the PixelWorker port: a Web Worker in the app (workers/pixels.ts),
// in the page in tests and when the worker cannot start.
import { EditError } from '../../model/errors.ts';
import type { PixelWorker } from '../../ports.ts';
import { bucketFill, gradientFill, type BucketInput, type GradientInput } from './fills.ts';
import type { Raster } from './raster.ts';

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

export const PIXEL_JOBS = {
  /** GB3: the paint bucket. */
  bucket: (input: BucketInput): TilePatch => patchOf(input.target, bucketFill(input)),
  /** GB3: the gradient tool. */
  gradient: (input: GradientInput): TilePatch => patchOf(input.target, gradientFill(input)),
};

export type PixelJob = keyof typeof PIXEL_JOBS;
export type PixelJobInput<J extends PixelJob> = Parameters<(typeof PIXEL_JOBS)[J]>[0];

export function runPixelJob<J extends PixelJob>(job: J, input: PixelJobInput<J>): TilePatch {
  return (PIXEL_JOBS[job] as (input: PixelJobInput<J>) => TilePatch)(input);
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
  | { id: number; ok: true; patch: TilePatch }
  /** `edit`: a refusal in words for the student (an EditError), not a fault. */
  | { id: number; ok: false; edit: boolean; message: string };

/** What the worker sends back for a request, and the tiles' buffers it can hand over. */
export function answerPixelJob(request: PixelRequest): {
  reply: PixelReply;
  transfer: ArrayBuffer[];
} {
  try {
    const run = PIXEL_JOBS[request.job] as ((input: unknown) => TilePatch) | undefined;
    if (!run) throw new Error(`There is no pixel job "${String(request.job)}".`);
    const patch = run(request.input);
    const transfer = patch.changes.flatMap(([, t]) => (t ? [t.buffer as ArrayBuffer] : []));
    return { reply: { id: request.id, ok: true, patch }, transfer };
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
