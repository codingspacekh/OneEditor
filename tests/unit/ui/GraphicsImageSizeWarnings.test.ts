// M23 / G10 on screen: Image size… warns below 150 dpi at the printed size (with the size it
// prints) and when the image is more than 4 times a screen for the web — both at once if so.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';

async function imageSize(units: 'px' | 'cm') {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Graphics',
    }),
  );
  await t.app.graphics.newImage({
    name: 'Poster',
    size:
      units === 'cm'
        ? { width: 10, height: 5, units, dpi: 300 }
        : { width: 800, height: 400, units, dpi: 96 },
    background: '#ffffff',
  });
  animUi.dialog = 'imageSize';
  return within(await screen.findByRole('dialog', { name: 'Image size' }));
}

const type = (d: ReturnType<typeof within>, label: string, value: string) =>
  fireEvent.change(d.getByLabelText(label, { exact: true }), { target: { value } });

describe('G10 (M23): Image size warnings', () => {
  it('a print image: none at 300 dpi; below 150 dpi, blocky at its printed size', async () => {
    const d = await imageSize('cm');
    expect(d.queryByRole('note')).toBeNull();
    await fireEvent.click(d.getByLabelText(/Resample \(change/));
    await fireEvent.change(d.getByLabelText('Resolution'), { target: { value: '100' } });
    expect(d.getByRole('note').textContent).toBe(
      'At 100 dpi a print looks blocky (pixelated): 1181 × 591 px prints 30 × 15.01 cm. Print at 150 dpi or more (300 is usual).',
    );
  });

  it('a screen image: no print warning at 96 dpi; far bigger than a screen, and blocky in cm too', async () => {
    const d = await imageSize('px');
    expect(d.queryByRole('note')).toBeNull();
    await type(d, 'Width', '8000');
    expect(d.getAllByRole('note').map((n) => n.textContent)).toEqual([
      expect.stringMatching(/^Far bigger than a screen needs: 8000 × 4000 px is more than 4 times/),
    ]);
    await fireEvent.change(d.getByLabelText('Units'), { target: { value: 'cm' } });
    expect(d.getAllByRole('note')).toHaveLength(2);
  });
});
