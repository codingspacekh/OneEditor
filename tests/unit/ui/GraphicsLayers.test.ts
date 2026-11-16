// M21 G2, GB1: Graphics mode's Layers panel — a new pixel layer, a picture as a layer, duplicate;
// the selected layer's opacity %, blend mode and clipping mask; a pixel layer's layer mask; merge
// down, merge visible and flatten. Animation mode's panel shows none of these.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';

async function open(mode: 'Graphics' | 'Animation') {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', { name: mode }),
  );
  const g = t.app.graphics;
  const doc = () => g.store.get().history.present;
  const panel = () => within(screen.getAllByRole('complementary', { name: 'Layers' }).at(-1)!);
  return { ...t, g, doc, panel };
}

describe('M21 G2, GB1: the Layers panel in Graphics mode', () => {
  it('adds a pixel layer, shown as one, and duplicates it', async () => {
    const s = await open('Graphics');
    await fireEvent.click(s.panel().getByRole('button', { name: 'New pixel layer' }));
    expect(s.doc().layers.at(-1)!.pixels).toBeDefined();
    expect(s.panel().getByRole('option', { name: 'Layer 2' }).textContent).toMatch(/Pixels/);
    await fireEvent.click(s.panel().getByRole('button', { name: 'Duplicate layer' }));
    expect(s.doc().layers.map((l) => l.name)).toEqual(['Layer 1', 'Layer 2', 'Layer 2 copy']);
  });

  it('adds a picture as a layer from the panel', async () => {
    const s = await open('Graphics');
    s.dialogs.openPicture.mockResolvedValueOnce('/m/photo.jpg');
    await fireEvent.click(s.panel().getByRole('button', { name: 'Add picture as layer' }));
    await vi.waitFor(() => expect(s.doc().layers.at(-1)!.name).toBe('photo'));
  });

  it('sets the selected layer’s opacity %, blend mode and clipping', async () => {
    const s = await open('Graphics');
    const look = () => within(s.panel().getByRole('group', { name: 'Layer look' }));
    const opacity = look().getByLabelText('Opacity');
    await fireEvent.change(opacity, { target: { value: '40' } });
    expect(s.doc().layers[0]!.opacity).toBe(0.4);
    await fireEvent.change(opacity, { target: { value: '140' } });
    expect(look().getByText(/0 % \(not seen\) to 100 %/)).toBeTruthy();
    await fireEvent.change(look().getByRole('combobox', { name: 'Blend mode' }), {
      target: { value: 'multiply' },
    });
    expect(s.doc().layers[0]!.blend).toBe('multiply');
    // The bottom layer has nothing to clip to.
    expect(look().getByRole('button', { name: 'Clip' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.click(s.panel().getByRole('button', { name: 'New pixel layer' }));
    await fireEvent.click(look().getByRole('button', { name: 'Clip' }));
    expect(s.doc().layers[1]!.clip).toBe(true);
    expect(look().getByRole('button', { name: 'Clip' }).getAttribute('aria-pressed')).toBe('true');
    expect(s.panel().getByRole('option', { name: 'Layer 2' }).className).toMatch(/clipped/);
    await fireEvent.click(look().getByRole('button', { name: 'Clip' }));
    expect(s.doc().layers[1]!.clip).toBeUndefined();
  });

  it('adds, applies and deletes a pixel layer’s mask', async () => {
    const s = await open('Graphics');
    const look = () => within(s.panel().getByRole('group', { name: 'Layer look' }));
    expect(look().queryByRole('button', { name: 'Add mask' })).toBeNull();
    await fireEvent.click(s.panel().getByRole('button', { name: 'New pixel layer' }));
    await fireEvent.click(look().getByRole('button', { name: 'Add mask' }));
    expect(s.doc().layers[1]!.pixels!.mask).toBeDefined();
    expect(s.panel().getByRole('option', { name: 'Layer 2' }).textContent).toMatch(/Mask/);
    await fireEvent.click(look().getByRole('button', { name: 'Delete mask' }));
    expect(s.doc().layers[1]!.pixels!.mask).toBeUndefined();
    await fireEvent.click(look().getByRole('button', { name: 'Add mask' }));
    await fireEvent.click(look().getByRole('button', { name: 'Apply mask' }));
    expect(s.doc().layers[1]!.pixels!.mask).toBeUndefined();
  });

  it('merges down, merges visible and flattens', async () => {
    const s = await open('Graphics');
    const look = () => within(s.panel().getByRole('group', { name: 'Layer look' }));
    expect(look().getByRole('button', { name: 'Merge down' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.click(s.panel().getByRole('button', { name: 'New pixel layer' }));
    await fireEvent.click(look().getByRole('button', { name: 'Merge down' }));
    await vi.waitFor(() => expect(s.doc().layers).toHaveLength(1));
    await fireEvent.click(s.panel().getByRole('button', { name: 'New pixel layer' }));
    await fireEvent.click(look().getByRole('button', { name: 'Merge visible' }));
    await vi.waitFor(() => expect(s.doc().layers).toHaveLength(1));
    await fireEvent.click(s.panel().getByRole('button', { name: 'New pixel layer' }));
    await fireEvent.click(look().getByRole('button', { name: 'Flatten' }));
    await vi.waitFor(() => expect(s.doc().layers.map((l) => l.name)).toEqual(['Background']));
  });
});

describe('M21: Animation mode’s Layers panel', () => {
  it('shows no pixel-layer controls', async () => {
    const s = await open('Animation');
    expect(s.panel().queryByRole('button', { name: 'New pixel layer' })).toBeNull();
    expect(s.panel().queryByRole('group', { name: 'Layer look' })).toBeNull();
    expect(s.panel().queryByRole('button', { name: 'Merge down' })).toBeNull();
  });
});
