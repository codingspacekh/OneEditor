// Graphics benchmark G6: Image size and Image settings keep a size typed in cm exactly (M/26: the
// chip resized to 10 cm × 6 cm was written 10cm × 6.01cm), so the SVG says what was typed.
import { describe, expect, it } from 'vitest';
import { svgDimensions } from '../../../src/core/graphics/export.ts';
import { testApp } from '../../helpers/test-app.ts';

async function chip() {
  const t = testApp();
  const g = t.app.graphics;
  expect(
    await g.newImage({
      name: 'Chip',
      size: { width: 1181, height: 709, units: 'px', dpi: 96 },
      background: 'none',
    }),
  ).toBeNull();
  return { g, doc: () => g.store.get().history.present };
}

describe('benchmark G6: a size typed in cm kept exactly', () => {
  it('Image size typed in cm: 10 × 6 cm, though the canvas is 378 × 227 px', async () => {
    const s = await chip();
    expect(
      s.g.resizeImage({
        width: 378,
        height: 227,
        method: 'bicubic',
        printed: { width: 10, height: 6, units: 'cm' },
      }),
    ).toBeNull();
    expect(s.g.setImage({ units: 'cm' })).toBeNull();
    expect(svgDimensions(s.doc())).toEqual({ width: '10cm', height: '6cm' });
  });

  it('Image settings typed in mm: the size typed is kept', async () => {
    const s = await chip();
    expect(
      s.g.setImage({
        width: 302,
        height: 348,
        units: 'mm',
        size: { width: 80, height: 92, units: 'mm' },
      }),
    ).toBeNull();
    expect(svgDimensions(s.doc())).toEqual({ width: '80mm', height: '92mm' });
  });
});
