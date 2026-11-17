// M19 / GV7, GV8 on screen: the Outline toggle beside the rulers and grid, and in the Layers panel
// Place template, a template layer's badge and the Template toggle on any layer.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import type { ProbeInfo } from '../../../src/core/ports.ts';
import { testApp } from '../../helpers/test-app.ts';
import { viewHelper } from '../../helpers/tools.ts';

const CHIP: ProbeInfo = {
  kind: 'image',
  container: 'png',
  sizeBytes: 1,
  video: { codec: 'png', width: 400, height: 300 },
};

async function inMode(mode: 'Graphics' | 'Animation') {
  animUi.dialog = null;
  const t = testApp({ '/m/Chip.png': CHIP });
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', { name: mode }),
  );
  const editor = mode === 'Graphics' ? t.app.graphics : t.app.animation;
  const doc = () => editor.store.get().history.present;
  const layers = () => within(screen.getByRole('complementary', { name: 'Layers' }));
  return { ...t, editor, doc, layers };
}

describe('GV7: the Outline toggle', () => {
  it('GV7: sits with the stage helpers, says why, and turns the outline view on and off', async () => {
    const s = await inMode('Graphics');
    // In the View options flyout, with the stage helpers.
    within(screen.getByRole('group', { name: 'Stage helpers' }));
    const outline = await viewHelper('Outline view');
    expect(outline.getAttribute('aria-checked')).toBe('false');
    expect(outline.getAttribute('title')).toMatch(/thin line[\s\S]*Why\?/);
    await fireEvent.click(outline);
    expect(s.doc().view.wireframe).toBe(true);
    expect(outline.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(outline);
    expect(s.doc().view.wireframe).toBe(false);
  });

  it('GV7: is in Animation mode too', async () => {
    const s = await inMode('Animation');
    await fireEvent.click(await viewHelper('Outline view'));
    expect(s.doc().view.wireframe).toBe(true);
  });
});

describe('GV8: template layers in the Layers panel', () => {
  it('GV8: Place template adds a locked template layer at the bottom, with a badge', async () => {
    const s = await inMode('Graphics');
    s.dialogs.openPicture.mockResolvedValueOnce('/m/Chip.png');
    const place = s.layers().getByRole('button', { name: 'Place template' });
    expect(place.getAttribute('title')).toMatch(/faded and locked[\s\S]*Why\?/);
    await fireEvent.click(place);
    await new Promise((r) => setTimeout(r, 0));
    expect(s.doc().layers[0]).toMatchObject({ name: 'Template', template: true, locked: true });
    const row = s.layers().getByRole('option', { name: 'Template' });
    expect(within(row).getByText('Template', { selector: '.badge' })).toBeTruthy();
    expect(
      within(row).getByRole('button', { name: 'Template Template' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('GV8: the Template toggle marks any layer a template and back', async () => {
    const s = await inMode('Animation');
    const toggle = s.layers().getByRole('button', { name: 'Template Layer 1' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(toggle);
    expect(s.doc().layers[0]).toMatchObject({ template: true, locked: true });
    const row = s.layers().getByRole('option', { name: 'Layer 1' });
    expect(within(row).queryByText('Template', { selector: '.badge' })).toBeTruthy();
    await fireEvent.click(s.layers().getByRole('button', { name: 'Template Layer 1' }));
    expect(s.doc().layers[0]!.template).toBeUndefined();
  });
});
