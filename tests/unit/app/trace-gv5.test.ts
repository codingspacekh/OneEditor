// GV5 (M19): Trace bitmap in the app — black and white of only a part, and the picture kept
// underneath on a hidden layer to compare (9626/04 O/N/22 the plane, J/22 the balloon), in one
// undo step.
import { describe, expect, it } from 'vitest';
import type { Pixels } from '../../../src/core/animation/trace.ts';
import type { GroupObject, PathObject } from '../../../src/core/animation/types.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';

/** A dark square (20–60) with a light middle (35–45) on white, 80 × 80. */
const framed: Pixels = (() => {
  const data = new Uint8ClampedArray(80 * 80 * 4);
  for (let i = 0; i < 80 * 80; i++) {
    const [x, y] = [i % 80, Math.floor(i / 80)];
    const square = x >= 20 && x < 60 && y >= 20 && y < 60;
    const middle = x >= 35 && x < 45 && y >= 35 && y < 45;
    data.set(square && !middle ? [20, 20, 20, 255] : [255, 255, 255, 255], i * 4);
  }
  return { width: 80, height: 80, data };
})();

async function withPicture() {
  const t = testApp({ '/m/Plane.jpg': IMAGE });
  const g = t.app.graphics;
  t.stageRenderer.pixels.mockResolvedValue(framed);
  t.dialogs.openPicture.mockResolvedValueOnce('/m/Plane.jpg');
  await g.addPicture({ x: 0, y: 0 });
  const doc = () => g.store.get().history.present;
  return { ...t, g, doc };
}

describe('GV5: Trace bitmap in the app', () => {
  it('black and white makes a black silhouette with its light middle cut out', async () => {
    const s = await withPicture();
    await s.g.traceBitmap({
      colours: 8,
      detail: 100,
      smoothing: 0,
      mode: 'blackWhite',
      threshold: 128,
    });
    const group = s.doc().layers[0]!.objects[0] as GroupObject;
    expect(group.children).toHaveLength(1);
    const shape = group.children[0] as PathObject;
    expect(shape.fill).toEqual({ kind: 'solid', colour: '#000000' });
    expect(shape.holes).toHaveLength(1);
    expect(s.doc().layers).toHaveLength(1);
  });

  it('keeps the picture underneath on a hidden layer, in the same undo step', async () => {
    const s = await withPicture();
    const pictureId = s.doc().layers[0]!.objects[0]!.id;
    await s.g.traceBitmap(
      { colours: 2, detail: 60, smoothing: 0, area: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } },
      true,
    );
    const [kept, drawn] = s.doc().layers;
    expect(kept).toMatchObject({ name: 'Plane.jpg (traced)', visible: false });
    expect(kept!.objects[0]).toMatchObject({ kind: 'picture', id: pictureId });
    expect(drawn!.objects[0]!.kind).toBe('group');
    expect(s.g.store.get().message?.text).toMatch(/kept underneath on a hidden layer/);
    s.g.undo();
    expect(s.doc().layers).toHaveLength(1);
    expect(s.doc().layers[0]!.objects[0]!.kind).toBe('picture');
  });

  it('says so when the part chosen is nothing', async () => {
    const s = await withPicture();
    await s.g.traceBitmap({
      colours: 2,
      detail: 60,
      smoothing: 0,
      area: { x: 0, y: 0, width: 0, height: 0 },
    });
    expect(s.g.store.get().message?.text).toBe('Choose a part of the picture to trace.');
  });
});
