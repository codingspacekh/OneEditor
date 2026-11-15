// M19 / G11: the Export image dialog offers PDF beside SVG, PNG and JPG, with what it is good
// for, and says the page it makes (the image's printed size).
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { IMAGE_PRESETS } from '../../../src/core/graphics/document.ts';
import { testApp } from '../../helpers/test-app.ts';

async function exportDialog(a4 = false, dpi?: number) {
  animUi.dialog = null;
  animUi.graphicFormat = 'png';
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Graphics',
    }),
  );
  if (a4)
    await t.app.graphics.newImage({
      name: 'Workbook',
      size: IMAGE_PRESETS.find((p) => p.name === 'A4 portrait')!,
      background: '#ffffff',
    });
  if (dpi) t.app.graphics.setImage({ dpi });
  await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  return { ...t, d: within(screen.getByRole('dialog', { name: 'Export image' })) };
}

describe('G11 Export image as PDF', () => {
  it('offers PDF with its pros and cons, and says the page in the image’s units', async () => {
    const { d } = await exportDialog(true);
    await fireEvent.click(d.getByRole('radio', { name: /PDF/ }));
    expect(d.getByText(/prints at the exact size of the image/)).toBeTruthy();
    expect(d.getByText(/opens everywhere/)).toBeTruthy();
    expect(d.getByText(/a 21 × 29.7 cm page/)).toBeTruthy();
    expect(d.queryByLabelText('Quality')).toBeNull();
  });

  it('saves the PDF and remembers the format for next time', async () => {
    const s = await exportDialog();
    await fireEvent.click(s.d.getByRole('radio', { name: /PDF/ }));
    expect(s.d.getByText(/a 13.33 × 7.5 in page/)).toBeTruthy();
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Poster.pdf');
    await fireEvent.click(s.d.getByRole('button', { name: 'Export…' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(s.bytes.has('/work/Poster.pdf')).toBe(true);
    expect(animUi.graphicFormat).toBe('pdf');
    expect(screen.queryByRole('dialog', { name: 'Export image' })).toBeNull();
  });

  it('says why a page is too large and does not export it', async () => {
    const s = await exportDialog(false, 10);
    await fireEvent.click(s.d.getByRole('radio', { name: /PDF/ }));
    await fireEvent.change(s.d.getByLabelText('Size'), { target: { value: 'width' } });
    await fireEvent.input(s.d.getByLabelText('Width'), { target: { value: '8000' } });
    expect(s.d.getByText(/at most 200 inches/)).toBeTruthy();
    expect((s.d.getByRole('button', { name: 'Export…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
