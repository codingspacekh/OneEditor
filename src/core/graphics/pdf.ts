// G11 (M19): a PDF of the image (the workbook's "save as PDF"). The PDF is printed by the main
// process from the image's SVG (D5: Electron's printToPDF, no PDF library), so its shapes stay
// vector; the page is the image's printed size — its pixels at its resolution, or the printed
// width asked for — with no margins, so an A4 image at 300 dpi is an A4 page (8.27 × 11.69 in).
import { EditError } from '../model/errors.ts';
import type { AnimationDoc } from '../animation/types.ts';
import { graphicOf } from './document.ts';
import { exportPixels, type ExportSize } from './export.ts';
import { roundIn, type Unit } from './units.ts';

/** A PDF page, in inches. */
export interface PdfPage {
  width: number;
  height: number;
}

/** The largest page a PDF can hold on a side (14 400 points), in inches. */
export const MAX_PDF_INCHES = 200;

const PER_INCH: Readonly<Record<Exclude<Unit, 'px'>, number>> = {
  cm: 2.54,
  mm: 25.4,
  in: 1,
  pt: 72,
};

/** G11: the page of a PDF of `doc` exported at `size`, in inches; why not, as an EditError. */
export function pdfPageSize(doc: AnimationDoc, size: ExportSize = { by: 'canvas' }): PdfPage {
  // The pixel size is checked as for every export (a printed width of 0 is refused there).
  const px = exportPixels(doc.stage, graphicOf(doc).dpi, size);
  const page =
    size.by === 'print'
      ? // A printed width is kept exactly (10 cm is 10 cm, not the pixels it was rounded to).
        {
          width: size.unit === 'px' ? size.width / size.dpi : size.width / PER_INCH[size.unit],
          height: 0,
        }
      : { width: px.width / px.dpi, height: px.height / px.dpi };
  if (size.by === 'print') page.height = (page.width * doc.stage.height) / doc.stage.width;
  if (page.width > MAX_PDF_INCHES || page.height > MAX_PDF_INCHES)
    throw new EditError(
      `That page would be ${pdfPageLabel(page, 'in')}: a PDF page can be at most ${MAX_PDF_INCHES} inches (5 m) on a side. Choose a smaller size or a higher resolution.`,
    );
  return page;
}

/** "21 × 29.7 cm" in the image's units; a screen image's page is said in inches. */
export function pdfPageLabel(page: PdfPage, units: Unit): string {
  const unit = units === 'px' ? 'in' : units;
  const side = (inches: number) => roundIn(inches * PER_INCH[unit], unit);
  return `${side(page.width)} × ${side(page.height)} ${unit}`;
}

const inches = (n: number): string => `${Math.round(n * 10_000) / 10_000}in`;

/**
 * G11: the page the main process prints: the SVG alone, filling a page of exactly `page` with no
 * margins (the CSS page size, so nothing is scaled to fit a paper size).
 */
export function pdfPageHtml(svg: string, page: PdfPage): string {
  const [w, h] = [inches(page.width), inches(page.height)];
  const body = svg.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
  return (
    '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><style>' +
    `@page { size: ${w} ${h}; margin: 0; } ` +
    'html, body { margin: 0; padding: 0; overflow: hidden; } ' +
    `svg { display: block; width: ${w}; height: ${h}; }` +
    `</style></head><body>${body}</body></html>\n`
  );
}
