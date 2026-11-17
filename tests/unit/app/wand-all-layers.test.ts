// M23 step 5 (GB2): the magic wand's and colour select's "All layers" see the vector layers too —
// the picture as it is drawn, shapes and text included (the renderer draws it into pixels, as
// Merge visible does), not only the pixel layers. With only pixel layers showing it is worked out
// in the page at once, as before; the drawing is kept while the picture stays the same.
import { describe, expect, it } from 'vitest';
import { execute } from '../../../src/app/history.ts';
import { createLayer, createRect } from '../../../src/core/animation/factory.ts';
import { TRANSPARENT } from '../../../src/core/animation/rules.ts';
import type { Layer } from '../../../src/core/animation/types.ts';
import { createBitmap, fillRect } from '../../../src/core/graphics/pixels/raster.ts';
import { selectedBounds } from '../../../src/core/graphics/pixels/selection.ts';
import { testApp } from '../../helpers/test-app.ts';

const W = 100;
const H = 80;
/** Where the vector square is drawn (the stand-in renderer draws it red on white). */
const SQUARE = { x: 20, y: 10, width: 30, height: 30 };

function setup(shapes: Partial<Layer> = {}) {
  const t = testApp();
  const g = t.app.graphics;
  t.stageRenderer.renderPixels.mockImplementation(async (doc) => {
    const { width, height } = doc.stage;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = SQUARE.y; y < SQUARE.y + SQUARE.height; y++)
      for (let x = SQUARE.x; x < SQUARE.x + SQUARE.width; x++)
        data.set([255, 0, 0, 255], (y * width + x) * 4);
    return { width, height, data };
  });
  const photo = createLayer('Photo', {
    pixels: {
      bitmap: fillRect(
        createBitmap(W, H),
        { x: 0, y: 0, width: W, height: H },
        [255, 255, 255, 255],
      ),
      x: 0,
      y: 0,
    },
  });
  const vector = createLayer('Shapes', { objects: [createRect(SQUARE)], ...shapes });
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, width: W, height: H },
        layers: [photo, vector],
      }),
    }),
    layerId: photo.id,
  }));
  const bounds = () => {
    const m = g.store.get().pixelSelection;
    return m ? selectedBounds(m) : null;
  };
  return { ...t, g, bounds };
}

describe('GB2 (M23): All layers sees the vector layers too', () => {
  it('GB2 (M23): the wand on a vector square over a photo selects the square', async () => {
    const s = setup();
    s.g.selectByWand({ x: 30, y: 20 }, { tolerance: 0, contiguous: true, allLayers: true });
    await s.g.pixelWork();
    expect(s.bounds()).toEqual(SQUARE);
    // The renderer drew the picture as it shows, on no background (as the pixel layers alone).
    const drawn = s.stageRenderer.renderPixels.mock.calls[0]![0];
    expect(drawn.stage.background).toBe(TRANSPARENT);
    // The same picture again: drawn once.
    s.g.selectByColour({ x: 30, y: 20 }, { fuzziness: 0, allLayers: true });
    await s.g.pixelWork();
    expect(s.bounds()).toEqual(SQUARE);
    expect(s.stageRenderer.renderPixels).toHaveBeenCalledTimes(1);
  });

  it('GB2 (M23): with the vector layer hidden, the pixel layers alone, at once, no drawing', () => {
    const s = setup({ visible: false });
    s.g.selectByWand({ x: 30, y: 20 }, { tolerance: 0, contiguous: true, allLayers: true });
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: W, height: H });
    expect(s.stageRenderer.renderPixels).not.toHaveBeenCalled();
  });

  it('GB2 (M23): without All layers, the current layer only', () => {
    const s = setup();
    s.g.selectByWand({ x: 30, y: 20 }, { tolerance: 0, contiguous: true });
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: W, height: H });
    expect(s.stageRenderer.renderPixels).not.toHaveBeenCalled();
  });

  it('GB2 (M23): the picture cannot be drawn: said in words, the selection as it was', async () => {
    const s = setup();
    s.stageRenderer.renderPixels.mockRejectedValueOnce(new Error('no canvas'));
    s.g.selectByWand({ x: 30, y: 20 }, { tolerance: 0, contiguous: true, allLayers: true });
    await s.g.pixelWork();
    expect(s.bounds()).toBeNull();
    expect(s.g.store.get().message?.kind).toBe('error');
  });
});
