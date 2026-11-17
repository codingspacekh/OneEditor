// M21 step 4 (D3, GN2): the pixel jobs — a table of pure jobs on copyable inputs whose answer is
// only the tiles they changed, so the page puts those into its own raster and every other tile
// stays shared (GN1); what the worker answers a request with (a refusal in words kept as one).
import { describe, expect, it } from 'vitest';
import {
  IN_PROCESS_PIXELS,
  PIXEL_JOBS,
  answerPixelJob,
  applyPatch,
  patchOf,
  runPixelJob,
} from '../../../../../src/core/graphics/pixels/jobs.ts';
import { gradientStops } from '../../../../../src/core/graphics/pixels/fills.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Bitmap,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const photo = fillRect(
  createBitmap(600, 300),
  { x: 0, y: 0, width: 600, height: 300 },
  [255, 255, 255, 255],
);
const bucket = {
  target: photo,
  sample: photo,
  x: 0,
  y: 0,
  at: { x: 10, y: 10 },
  tolerance: 0,
  contiguous: true,
  colour: [255, 0, 0] as const,
  opacity: 1,
  // Only the top-left tile is selected.
  selection: fillRect(createMask(600, 300), { x: 0, y: 0, width: 100, height: 100 }, 255),
};

describe('M21 GN2: pixel jobs', () => {
  it('names its jobs', () => {
    expect(Object.keys(PIXEL_JOBS).sort()).toEqual(
      expect.arrayContaining(['adjust', 'bucket', 'gradient']),
    );
  });

  it('answers with only the tiles that changed; put back, the rest are shared', () => {
    const patch = runPixelJob('bucket', bucket);
    expect(patch.changes.map(([i]) => i)).toEqual([0]);
    const after = applyPatch(photo, patch) as Bitmap;
    expect(pixelAt(after, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(after, 200, 5)).toEqual([255, 255, 255, 255]);
    after.tiles.slice(1).forEach((t, i) => expect(t).toBe(photo.tiles[i + 1]));
  });

  it('a patch with nothing in it gives the same raster back; one for another size is refused', () => {
    expect(applyPatch(photo, { width: 600, height: 300, channels: 4, changes: [] })).toBe(photo);
    expect(() =>
      applyPatch(createBitmap(10, 10), { width: 600, height: 300, channels: 4, changes: [] }),
    ).toThrow('The pixels changed while they were being worked on.');
    expect(patchOf(photo, photo).changes).toEqual([]);
  });

  it('a tile emptied comes back as null', () => {
    const one = fillRect(
      createBitmap(300, 10),
      { x: 0, y: 0, width: 10, height: 10 },
      [1, 1, 1, 255],
    );
    const cleared = { ...one, tiles: [null, null] };
    expect(patchOf(one, cleared).changes).toEqual([[0, null]]);
  });

  it('runs in the page through the same port (tests and the fallback)', async () => {
    const patch = await IN_PROCESS_PIXELS.run('gradient', {
      target: createBitmap(10, 10),
      x: 0,
      y: 0,
      from: { x: 0, y: 0 },
      to: { x: 10, y: 0 },
      kind: 'linear',
      stops: gradientStops('#000000', '#ffffff'),
      opacity: 1,
    });
    expect(patch.changes).toHaveLength(1);
  });

  it('the worker’s answer: the patch with its tiles’ buffers to hand over, or the refusal', () => {
    const { reply, transfer } = answerPixelJob({ id: 3, job: 'bucket', input: bucket });
    expect(reply).toMatchObject({ id: 3, ok: true });
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toBeInstanceOf(ArrayBuffer);
    const refused = answerPixelJob({
      id: 4,
      job: 'gradient',
      input: { ...bucket, from: { x: 1, y: 1 }, to: { x: 1, y: 1 }, kind: 'linear', stops: [] },
    });
    expect(refused).toEqual({
      reply: { id: 4, ok: false, edit: true, message: 'Drag a line for the gradient.' },
      transfer: [],
    });
    const broken = answerPixelJob({ id: 5, job: 'nothing' as never, input: {} });
    expect(broken.reply).toMatchObject({ id: 5, ok: false, edit: false });
  });
});
