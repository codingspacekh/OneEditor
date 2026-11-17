// M22 step 5 (G14 on pixel layers, Graphics mode's app): a pixel layer's effects set from
// Properties ▸ Filters as one undo step (or why not), drawn with the layer when it is merged (the
// renderer asked for the layer alone with its effects, the student told nothing about shapes),
// and sent to Animation mode as the picture's filters.
import { describe, expect, it } from 'vitest';
import { newFilter } from '../../../src/core/animation/appearance.ts';
import type { ObjectFilter } from '../../../src/core/animation/types.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';
import { TINY_JPEG } from '../../helpers/tiny-images.ts';

const PHOTO = { ...IMAGE, video: { codec: 'mjpeg', width: 40, height: 30 } };
const HALO: ObjectFilter = { kind: 'glow', colour: '#fff4c0', blur: 30, opacity: 80 };

/** An image with a 100 × 80 pixel layer of red (Moon), the current layer. */
async function withMoon() {
  const t = testApp({ '/m/Moon.jpg': PHOTO });
  const g = t.app.graphics;
  const doc = () => g.store.get().history.present;
  const current = () => doc().layers.find((l) => l.id === g.store.get().layerId)!;
  const message = () => g.store.get().message?.text ?? '';
  t.bytes.set('/m/Moon.jpg', TINY_JPEG);
  t.dialogs.openPicture.mockResolvedValueOnce('/m/Moon.jpg');
  t.stageRenderer.pixels.mockResolvedValueOnce({
    width: 100,
    height: 80,
    data: new Uint8ClampedArray(100 * 80 * 4).map((_, i) => (i % 4 === 0 || i % 4 === 3 ? 255 : 0)),
  });
  expect(await g.openPictureAsImage()).toBe(true);
  return { ...t, g, doc, current, message };
}

describe('M22 G14: effects on the current pixel layer', () => {
  it('sets them as one undo step, and takes them off', async () => {
    const s = await withMoon();
    const id = s.current().id;
    expect(s.g.setLayerEffects(id, [HALO])).toBeNull();
    expect(s.current().effects).toEqual([HALO]);
    expect(s.g.setLayerEffects(id, undefined)).toBeNull();
    expect(s.current()).not.toHaveProperty('effects');
    s.g.undo();
    expect(s.current().effects).toEqual([HALO]);
    s.g.undo();
    expect(s.current()).not.toHaveProperty('effects');
  });

  it('says why not', async () => {
    const s = await withMoon();
    expect(s.g.setLayerEffects(s.current().id, [{ ...HALO, opacity: 200 }])).toMatch(/opacity/);
    // G10 (M23): a vector layer takes them now (the globe's stroke round its clipping group).
    s.g.addLayer();
    expect(s.g.setLayerEffects(s.current().id, [HALO])).toBeNull();
    expect(s.current().effects).toEqual([HALO]);
  });

  it('draws a layer with effects into pixels with them when merged, saying nothing of shapes', async () => {
    const s = await withMoon();
    s.g.pastePixels({ width: 2, height: 2, data: new Array(16).fill(255) });
    s.g.setLayerEffects(s.current().id, [HALO, newFilter('bevel')]);
    await s.g.mergeLayers('down');
    const alone = s.stageRenderer.renderPixels.mock.calls[0]![0];
    expect(alone.layers).toHaveLength(1);
    expect(alone.layers[0]!.effects).toEqual([HALO, newFilter('bevel')]);
    expect(s.doc().layers).toHaveLength(1);
    expect(s.current()).not.toHaveProperty('effects');
    expect(s.message()).not.toMatch(/shapes/);
  });

  it('sends the layer to Animation mode with its effects as the picture’s filters', async () => {
    const s = await withMoon();
    s.g.setLayerEffects(s.current().id, [HALO]);
    const sent = (await s.g.toSend())!;
    expect(sent.objects[0]).toMatchObject({ kind: 'picture', filters: [HALO] });
  });
});
