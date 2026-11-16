// M21 (D3, GN2): the pixel jobs run in a Web Worker (workers/pixels.ts), so the paint bucket and
// the gradient on a 12-megapixel photo never stall the window. Each job goes with an id and its
// answer is matched back; the inputs are copied in (the document keeps its own tiles), the
// changed tiles handed back. If the worker cannot start (or fails), the jobs run in the page
// instead: slower on a big photo, but the tools keep working.
import { IN_PROCESS_PIXELS, type PixelReply } from '../../core/graphics/pixels/jobs.ts';
import type { TilePatch } from '../../core/graphics/pixels/jobs.ts';
import { EditError } from '../../core/model/errors.ts';
import type { PixelWorker } from '../../core/ports.ts';

/** The parts of a Worker this needs (a stand-in in the tests). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  terminate(): void;
}

interface Waiting {
  job: Parameters<PixelWorker['run']>[0];
  input: Parameters<PixelWorker['run']>[1];
  resolve(patch: TilePatch): void;
  reject(error: Error): void;
}

export function createWebPixelWorker(
  make: () => WorkerLike,
  fallback: PixelWorker = IN_PROCESS_PIXELS,
): PixelWorker & { dispose(): void } {
  let worker: WorkerLike | null = null;
  let broken = false;
  let next = 1;
  const waiting = new Map<number, Waiting>();

  /** The worker fails: what waits, and all that comes later, runs in the page. */
  function fail(): void {
    broken = true;
    worker?.terminate();
    worker = null;
    for (const w of waiting.values()) fallback.run(w.job, w.input).then(w.resolve, w.reject);
    waiting.clear();
  }

  function started(): WorkerLike | null {
    if (worker || broken) return worker;
    try {
      worker = make();
    } catch {
      broken = true;
      return null;
    }
    worker.onmessage = (e) => {
      const reply = e.data as PixelReply;
      const w = waiting.get(reply.id);
      if (!w) return;
      waiting.delete(reply.id);
      if (reply.ok) w.resolve(reply.patch);
      else w.reject(reply.edit ? new EditError(reply.message) : new Error(reply.message));
    };
    worker.onerror = fail;
    return worker;
  }

  return {
    run(job, input) {
      const w = started();
      if (!w) return fallback.run(job, input);
      return new Promise<TilePatch>((resolve, reject) => {
        const id = next++;
        try {
          w.postMessage({ id, job, input });
          waiting.set(id, { job, input, resolve, reject });
        } catch {
          // An input that cannot be copied to the worker is worked on here.
          fallback.run(job, input).then(resolve, reject);
        }
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
    },
  };
}
