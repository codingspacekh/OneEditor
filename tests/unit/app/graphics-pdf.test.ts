// M19 / G11: Export image as PDF — the image's SVG, printed by the main process on a page of
// the image's printed size (the workbook's "save as PDF"), written where the student chose.
import { describe, expect, it } from 'vitest';
import { IMAGE_PRESETS } from '../../../src/core/graphics/document.ts';
import { testApp } from '../../helpers/test-app.ts';

function setup() {
  const t = testApp();
  const g = t.app.graphics;
  const message = () => g.store.get().message?.text ?? '';
  return { ...t, g, message };
}

describe('G11 export as PDF', () => {
  it('prints the A4 image’s SVG on an A4 page and saves the PDF', async () => {
    const s = setup();
    const a4 = IMAGE_PRESETS.find((p) => p.name === 'A4 portrait')!;
    await s.g.newImage({ name: 'Workbook', size: a4, background: '#ffffff' });
    s.g.addShape('ellipse', { x: 100, y: 100, width: 900, height: 700 });
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Workbook.pdf');
    expect(await s.g.exportImage({ format: 'pdf' })).toEqual(['/work/Workbook.pdf']);
    expect(s.dialogs.exportGraphic).toHaveBeenCalledWith('Workbook', 'pdf');
    const [svg, page] = s.pageAssets.svgToPdf.mock.calls[0]!;
    // The vector picture itself, in its printed size.
    expect(svg).toMatch(/<svg[^>]*width="21cm" height="29.7cm" viewBox="0 0 2480 3508"/);
    expect(svg).toMatch(/<path|<ellipse/);
    expect(page.width).toBeCloseTo(8.27, 2);
    expect(page.height).toBeCloseTo(11.69, 2);
    expect(new TextDecoder().decode(s.bytes.get('/work/Workbook.pdf'))).toBe('%PDF-1.7');
    expect(s.stageRenderer.renderPng).not.toHaveBeenCalled();
    expect(s.message()).toBe('Saved Workbook.pdf (a 21 × 29.7 cm page).');
  });

  it('a screen image’s page is said in inches; another size makes another page', async () => {
    const s = setup();
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Banner.pdf');
    await s.g.exportImage({ format: 'pdf', size: { by: 'width', px: 640 } });
    const [, page] = s.pageAssets.svgToPdf.mock.calls[0]!;
    expect(page).toEqual({ width: 640 / 96, height: 360 / 96 });
    expect(s.message()).toBe('Saved Banner.pdf (a 6.67 × 3.75 in page).');
  });

  it('checks the page before any save box, and says when the PDF cannot be made', async () => {
    const s = setup();
    s.g.setImage({ dpi: 10 });
    expect(await s.g.exportImage({ format: 'pdf', size: { by: 'width', px: 8000 } })).toBeNull();
    expect(s.message()).toMatch(/at most 200 inches/);
    expect(s.dialogs.exportGraphic).not.toHaveBeenCalled();
    s.g.setImage({ dpi: 96 });
    s.pageAssets.svgToPdf.mockRejectedValueOnce(new Error('printing failed'));
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Broken.pdf');
    expect(await s.g.exportImage({ format: 'pdf' })).toBeNull();
    expect(s.bytes.has('/work/Broken.pdf')).toBe(false);
    expect(s.g.store.get().busy).toBeNull();
  });
});
