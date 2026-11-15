// M19 / G11: a PDF of the image — the page is the image's printed size (its pixels at its
// resolution, or the printed width asked for), with no margins, and the SVG drawn on it.
import { describe, expect, it } from 'vitest';
import { createGraphic, IMAGE_PRESETS } from '../../../../src/core/graphics/document.ts';
import { FORMAT_INFO, GRAPHIC_FORMATS } from '../../../../src/core/graphics/export.ts';
import {
  MAX_PDF_INCHES,
  pdfPageHtml,
  pdfPageLabel,
  pdfPageSize,
} from '../../../../src/core/graphics/pdf.ts';
import { EditError } from '../../../../src/core/model/errors.ts';

const a4 = () =>
  createGraphic({
    name: 'Workbook',
    size: IMAGE_PRESETS.find((p) => p.name === 'A4 portrait')!,
    background: '#ffffff',
  });

describe('G11 the PDF format', () => {
  it('is offered beside SVG, PNG and JPG, as a vector format with its pros and cons', () => {
    expect(GRAPHIC_FORMATS).toContain('pdf');
    expect(FORMAT_INFO.pdf).toMatchObject({ extension: 'pdf', kind: 'vector' });
    expect(FORMAT_INFO.pdf.about).toMatch(/vector/i);
    expect(FORMAT_INFO.pdf.about).toMatch(/exact size/);
    expect(FORMAT_INFO.pdf.about).toMatch(/opens/i);
  });
});

describe('G11 pdfPageSize: the page in inches', () => {
  it('is an A4 image at 300 dpi on an A4 page: 8.27 × 11.69 in', () => {
    const page = pdfPageSize(a4());
    expect(page.width).toBeCloseTo(8.27, 2);
    expect(page.height).toBeCloseTo(11.69, 2);
  });

  it('is a screen image’s pixels at 96 dpi: 1280 × 720 px is 13.33 × 7.5 in', () => {
    const doc = createGraphic({
      name: 'Banner',
      size: { width: 1280, height: 720, units: 'px', dpi: 96 },
      background: '#ffffff',
    });
    const page = pdfPageSize(doc);
    expect(page.width).toBeCloseTo(13.333, 3);
    expect(page.height).toBe(7.5);
  });

  it('follows another size: a width in px at the image’s dpi, or a printed width exactly', () => {
    const doc = a4();
    const half = pdfPageSize(doc, { by: 'width', px: 1240 });
    expect(half.width).toBeCloseTo(4.13, 2);
    expect(half.height).toBeCloseTo(5.85, 2);
    const tenCm = pdfPageSize(doc, { by: 'print', width: 10, unit: 'cm', dpi: 150 });
    expect(tenCm.width).toBeCloseTo(10 / 2.54, 6);
    expect(tenCm.height).toBeCloseTo((10 / 2.54) * (3508 / 2480), 6);
    const percent = pdfPageSize(doc, { by: 'percent', percent: 50 });
    expect(percent.width).toBeCloseTo(4.13, 2);
  });

  it('refuses a page larger than a PDF can hold, and a size that cannot be made', () => {
    const doc = createGraphic({
      name: 'Huge',
      size: { width: 8000, height: 1000, units: 'px', dpi: 10 },
      background: '#ffffff',
    });
    expect(() => pdfPageSize(doc)).toThrow(EditError);
    expect(() => pdfPageSize(doc)).toThrow(new RegExp(`${MAX_PDF_INCHES} inches`));
    expect(() => pdfPageSize(a4(), { by: 'print', width: 0, unit: 'cm', dpi: 300 })).toThrow(
      EditError,
    );
  });
});

describe('G11 pdfPageLabel', () => {
  it('says the page in the image’s units, or in inches for a screen image', () => {
    expect(pdfPageLabel(pdfPageSize(a4()), 'cm')).toBe('21 × 29.7 cm');
    expect(pdfPageLabel({ width: 8.2667, height: 11.6933 }, 'px')).toBe('8.27 × 11.69 in');
    expect(pdfPageLabel({ width: 1, height: 2 }, 'mm')).toBe('25.4 × 50.8 mm');
  });
});

describe('G11 pdfPageHtml: the page printed', () => {
  it('is the SVG on a page of exactly its size, with no margins, the SVG filling it', () => {
    const html = pdfPageHtml('<svg xmlns="http://www.w3.org/2000/svg" width="10cm"></svg>', {
      width: 8.2667,
      height: 11.6933,
    });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('@page { size: 8.2667in 11.6933in; margin: 0; }');
    expect(html).toMatch(/svg \{[^}]*width: 8.2667in; height: 11.6933in;/);
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="10cm"></svg>');
  });

  it('leaves out an <?xml?> declaration, which cannot be inside a page', () => {
    const html = pdfPageHtml('<?xml version="1.0"?>\n<svg></svg>', { width: 1, height: 1 });
    expect(html).not.toContain('<?xml');
    expect(html).toContain('<svg></svg>');
  });
});
