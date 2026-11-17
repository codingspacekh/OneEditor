// M21 (D3, GN2): the Web Worker the heavy pixel jobs run in (adapters/worker/pixel-worker.ts
// sends them): each request answered with the tiles the job changed, their buffers handed back
// rather than copied.
import { answerPixelJob, type PixelRequest } from '../core/graphics/pixels/jobs.ts';

interface WorkerScope {
  onmessage: ((e: { data: PixelRequest }) => void) | null;
  postMessage(message: unknown, transfer: ArrayBuffer[]): void;
}

const scope = self as unknown as WorkerScope;
scope.onmessage = (e) => {
  const { reply, transfer } = answerPixelJob(e.data);
  scope.postMessage(reply, transfer);
};
