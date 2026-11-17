// Graphics benchmark G6: a canvas typed in mm, cm or in keeps that size exactly in the files that
// say it (an SVG's width and height, a PDF's page), though the canvas is whole pixels: M/25's
// 80 mm template was written 79.9mm, M/26's 6 cm chip 6.01cm. A size that no longer comes to the
// canvas's pixels (resized, another dpi) is not used.
import { describe, expect, it } from 'vitest';
import { createGraphic, printedSize, setImage } from '../../../../src/core/graphics/document.ts';
import { svgDimensions } from '../../../../src/core/graphics/export.ts';
import { pdfPageSize } from '../../../../src/core/graphics/pdf.ts';
import { imageFacts } from '../../../../src/core/image/info.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';

const jig = () =>
  createGraphic({
    name: 'JigTemplate',
    size: { width: 80, height: 92, units: 'mm', dpi: 96 },
    background: 'none',
  });

describe('benchmark G6: the printed size kept as typed', () => {
  it('a new 80 × 92 mm image is 302 × 348 px, and its SVG says 80mm × 92mm (M/25)', async () => {
    const doc = jig();
    expect(doc.stage).toMatchObject({ width: 302, height: 348 });
    expect(svgDimensions(doc)).toEqual({ width: '80mm', height: '92mm' });
    expect(printedSize(doc)).toEqual({ width: 80 / 25.4, height: 92 / 25.4 });
    // The page of its PDF is 80 × 92 mm too.
    const page = pdfPageSize(doc);
    expect(page.width * 25.4).toBeCloseTo(80, 6);
    expect(page.height * 25.4).toBeCloseTo(92, 6);
  });

  it('the task checker reads the SVG back as 8 × 9.2 cm', async () => {
    const doc = jig();
    const svg = stageSvg(doc, 0, {}, [], {}, undefined, svgDimensions(doc));
    const facts = await imageFacts(new TextEncoder().encode(svg), 'JigTemplate.svg');
    expect(facts.print?.widthCm).toBeCloseTo(8, 6);
    expect(facts.print?.heightCm).toBeCloseTo(9.2, 6);
  });

  it('a size typed in Image settings or Image size is kept: 10 × 6 cm (M/26)', () => {
    const px = createGraphic({
      name: 'Chip',
      size: { width: 1181, height: 709, units: 'px', dpi: 96 },
      background: 'none',
    });
    const chip = setImage(px, {
      width: 378,
      height: 227,
      units: 'cm',
      size: { width: 10, height: 6, units: 'cm' },
    });
    expect(svgDimensions(chip)).toEqual({ width: '10cm', height: '6cm' });
  });

  it('is not used once it no longer comes to the canvas: resized in px, or another dpi', () => {
    const resized = setImage(jig(), { width: 400 });
    expect(printedSize(resized)).toBeNull();
    expect(svgDimensions(resized).width).toBe('105.8mm');
    const dpi = { ...jig(), graphic: { ...jig().graphic!, dpi: 300 } };
    expect(printedSize(dpi)).toBeNull();
    // A px image says px, whatever.
    expect(svgDimensions(setImage(jig(), { units: 'px' }))).toEqual({
      width: '302',
      height: '348',
    });
  });
});
