// M21 GB2: what the magic wand's "All layers" looks at — the visible pixel layers as they are
// drawn (opacity, blend, clipping, masks), bottom first; vector, hidden, template and AN12 mask
// layers left out.
import { describe, expect, it } from 'vitest';
import { createAnimation, createLayer } from '../../../../../src/core/animation/factory.ts';
import { defaultGraphic } from '../../../../../src/core/graphics/document.ts';
import {
  compositeLayers,
  drawnPixelLayers,
} from '../../../../../src/core/graphics/pixels/merge.ts';
import { createBitmap, fillRect, pixelAt } from '../../../../../src/core/graphics/pixels/raster.ts';

const red = fillRect(createBitmap(4, 4), { x: 0, y: 0, width: 4, height: 4 }, [255, 0, 0, 255]);
const blue = fillRect(createBitmap(2, 2), { x: 0, y: 0, width: 2, height: 2 }, [0, 0, 255, 255]);

describe('M21 GB2: the wand’s all-layers sample', () => {
  it('takes the visible pixel layers bottom first with their look, nothing else', () => {
    const doc = {
      ...createAnimation({ name: 'A' }),
      layers: [
        createLayer('Photo', { pixels: { bitmap: red, x: 0, y: 0 } }),
        createLayer('Shapes'),
        createLayer('Hidden', { visible: false, pixels: { bitmap: blue, x: 0, y: 0 } }),
        createLayer('Template', { template: true, pixels: { bitmap: blue, x: 0, y: 0 } }),
        createLayer('Patch', { opacity: 0.5, clip: true, pixels: { bitmap: blue, x: 1, y: 1 } }),
      ],
    };
    const drawn = drawnPixelLayers(doc);
    expect(drawn.map((d) => [d.pixels.bitmap === red, d.opacity, d.blend, d.clip])).toEqual([
      [true, 1, 'normal', false],
      [false, 0.5, 'normal', true],
    ]);
    const sample = compositeLayers(drawn, { x: 0, y: 0, width: 4, height: 4 });
    expect(pixelAt(sample, 0, 0)).toEqual([255, 0, 0, 255]);
    const mixed = pixelAt(sample, 1, 1);
    expect(mixed[0]).toBeGreaterThan(100);
    expect(mixed[2]).toBeGreaterThan(100);
  });

  it('is empty for an image with only vector layers', () => {
    expect(drawnPixelLayers(defaultGraphic())).toEqual([]);
  });
});
