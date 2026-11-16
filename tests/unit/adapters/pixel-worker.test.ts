// M21 step 4 (D3, GN2): the page's side of the pixel worker — each job sent with an id and its
// answer matched back, a refusal kept as one (EditError), and the jobs run in the page instead
// when the worker cannot start or fails, so the bucket and the gradient always work. And the
// worker's own side: a request answered with the tiles' buffers handed over.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWebPixelWorker,
  type WorkerLike,
} from '../../../src/adapters/worker/pixel-worker.ts';
import { gradientStops } from '../../../src/core/graphics/pixels/fills.ts';
import { answerPixelJob, type PixelRequest } from '../../../src/core/graphics/pixels/jobs.ts';
import { createBitmap } from '../../../src/core/graphics/pixels/raster.ts';
import { EditError } from '../../../src/core/model/errors.ts';

const input = {
  target: createBitmap(10, 10),
  x: 0,
  y: 0,
  from: { x: 0, y: 0 },
  to: { x: 10, y: 0 },
  kind: 'linear' as const,
  stops: gradientStops('#000000', '#ffffff'),
  opacity: 1,
};

/** A worker answering in the page, as the real one does, a little later. */
function fakeWorker(): WorkerLike & { sent: PixelRequest[]; terminated: boolean } {
  const w = {
    sent: [] as PixelRequest[],
    terminated: false,
    onmessage: null as WorkerLike['onmessage'],
    onerror: null as WorkerLike['onerror'],
    postMessage(message: unknown) {
      const request = message as PixelRequest;
      w.sent.push(request);
      queueMicrotask(() => w.onmessage?.({ data: answerPixelJob(request).reply }));
    },
    terminate() {
      w.terminated = true;
    },
  };
  return w;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('M21 GN2: the pixel worker, the page’s side', () => {
  it('sends each job to the worker (made once) and gives back its answer', async () => {
    const worker = fakeWorker();
    const make = vi.fn(() => worker);
    const pixels = createWebPixelWorker(make);
    const [a, b] = await Promise.all([
      pixels.run('gradient', input),
      pixels.run('gradient', input),
    ]);
    expect(make).toHaveBeenCalledTimes(1);
    expect(worker.sent.map((r) => r.id)).toEqual([1, 2]);
    expect(a.changes).toHaveLength(1);
    expect(b.changes).toHaveLength(1);
    pixels.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('a refusal comes back as one, other faults as errors', async () => {
    const pixels = createWebPixelWorker(fakeWorker);
    const refused = pixels.run('gradient', { ...input, to: { x: 0, y: 0 } });
    await expect(refused).rejects.toBeInstanceOf(EditError);
    await expect(pixels.run('gradient', { ...input, to: { x: 0, y: 0 } })).rejects.toThrow(
      'Drag a line for the gradient.',
    );
    const broken = pixels.run('nothing' as never, input as never);
    await expect(broken).rejects.not.toBeInstanceOf(EditError);
  });

  it('runs the jobs in the page when the worker cannot be made', async () => {
    const pixels = createWebPixelWorker(() => {
      throw new Error('no workers from file://');
    });
    expect((await pixels.run('gradient', input)).changes).toHaveLength(1);
    pixels.dispose();
  });

  it('runs the waiting jobs and all later ones in the page when the worker fails', async () => {
    const worker = fakeWorker();
    worker.postMessage = (m) => worker.sent.push(m as PixelRequest);
    const make = vi.fn(() => worker);
    const pixels = createWebPixelWorker(make);
    const waiting = pixels.run('gradient', input);
    worker.onerror?.(new Event('error'));
    expect(worker.terminated).toBe(true);
    expect((await waiting).changes).toHaveLength(1);
    expect((await pixels.run('gradient', input)).changes).toHaveLength(1);
    expect(make).toHaveBeenCalledTimes(1);
    expect(worker.sent).toHaveLength(1);
  });

  it('runs a job in the page when its input cannot be sent', async () => {
    const worker = fakeWorker();
    worker.postMessage = () => {
      throw new Error('DataCloneError');
    };
    const pixels = createWebPixelWorker(() => worker);
    expect((await pixels.run('gradient', input)).changes).toHaveLength(1);
  });

  it('ignores an answer to nothing it asked', () => {
    const worker = fakeWorker();
    createWebPixelWorker(() => worker).run('gradient', input);
    expect(() => worker.onmessage?.({ data: { id: 99, ok: true, patch: {} } })).not.toThrow();
  });
});

describe('M21 GN2: the worker itself', () => {
  it('answers each request with the patch, its tiles’ buffers handed over', async () => {
    const posted: [unknown, unknown][] = [];
    const scope = {
      onmessage: null as null | ((e: { data: PixelRequest }) => void),
      postMessage: (m: unknown, t: unknown) => posted.push([m, t]),
    };
    vi.stubGlobal('self', scope);
    await import('../../../src/workers/pixels.ts');
    scope.onmessage!({ data: { id: 7, job: 'gradient', input } });
    expect(posted).toHaveLength(1);
    expect(posted[0]![0]).toMatchObject({ id: 7, ok: true });
    expect((posted[0]![1] as ArrayBuffer[])[0]).toBeInstanceOf(ArrayBuffer);
  });
});
