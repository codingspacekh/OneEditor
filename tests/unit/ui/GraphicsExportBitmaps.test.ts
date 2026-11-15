// G11 (M19): the Export image dialog flags an SVG or PDF that would have pictures (bitmap parts)
// inside — 9626/04 M/26: "must not contain any bitmap elements" — but not a PNG, nor a template.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';

async function exportDialog(asTemplate: boolean) {
  animUi.dialog = null;
  animUi.graphicFormat = 'svg';
  const t = testApp({ '/m/Chip.png': IMAGE });
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Graphics',
    }),
  );
  t.dialogs.openPicture.mockResolvedValueOnce('/m/Chip.png');
  if (asTemplate) await t.app.graphics.placeTemplate();
  else await t.app.graphics.addPicture({ x: 0, y: 0 });
  await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  return within(screen.getByRole('dialog', { name: 'Export image' }));
}

describe('G11: bitmap parts flagged in an SVG or PDF', () => {
  it('warns for SVG and PDF, not for PNG', async () => {
    const d = await exportDialog(false);
    expect(d.getByRole('note').textContent).toMatch(/1 picture \(a bitmap part\) inside/);
    await fireEvent.click(d.getByRole('radio', { name: /PDF/ }));
    expect(d.getByRole('note')).toBeTruthy();
    await fireEvent.click(d.getByRole('radio', { name: /PNG/ }));
    expect(d.queryByRole('note')).toBeNull();
  });

  it('says nothing of a template picture, which is never exported', async () => {
    const d = await exportDialog(true);
    expect(d.queryByRole('note')).toBeNull();
  });
});
