// M22 step 5 (G14 on pixel layers) on screen: Properties ▸ "Effects on <layer>" for the current
// pixel layer when no object is selected (Graphics mode) — the glow (the NightScene's halo, the
// Lens's light blooms), a drop shadow and a bevel one click away, their numbers and colours typed
// as an object's filters, removed; not shown with an object selected (G10, M23: a vector layer has them too).
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { newFilter } from '../../../src/core/animation/appearance.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';
import { TINY_JPEG } from '../../helpers/tiny-images.ts';

const PHOTO = { ...IMAGE, video: { codec: 'mjpeg', width: 40, height: 30 } };

async function withMoon() {
  const t = testApp({ '/m/Moon.jpg': PHOTO });
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Graphics',
    }),
  );
  const g = t.app.graphics;
  t.bytes.set('/m/Moon.jpg', TINY_JPEG);
  t.dialogs.openPicture.mockResolvedValueOnce('/m/Moon.jpg');
  t.stageRenderer.pixels.mockResolvedValueOnce({
    width: 40,
    height: 30,
    data: new Uint8ClampedArray(40 * 30 * 4).fill(255),
  });
  expect(await g.openPictureAsImage()).toBe(true);
  await tick();
  const layer = () =>
    g.store.get().history.present.layers.find((l) => l.id === g.store.get().layerId)!;
  const section = () => screen.queryByRole('heading', { name: /^Effects on Moon/ })?.parentElement;
  return { ...t, g, layer, section };
}

const typeIn = async (label: string, value: string, scope: HTMLElement) =>
  fireEvent.change(within(scope).getByLabelText(label, { exact: true }), { target: { value } });

describe('M22 G14: Properties ▸ Effects on the current pixel layer', () => {
  it('M22 G14: a glow, a shadow and a bevel added in one click each, typed and removed', async () => {
    const s = await withMoon();
    const section = s.section()!;
    expect(within(section).getByText('shadow, glow, bevel, stroke, blur')).toBeTruthy();
    // G10 (M23): a stroke round the layer's pixels is one click too.
    expect(
      within(within(section).getByRole('group', { name: 'Add quickly' })).getByRole('button', {
        name: '+ Stroke',
      }),
    ).toBeTruthy();
    const quick = within(section).getByRole('group', { name: 'Add quickly' });
    await fireEvent.click(within(quick).getByRole('button', { name: '+ Glow' }));
    expect(s.layer().effects).toEqual([newFilter('glow')]);
    const glow = screen.getByRole('group', { name: 'Glow' });
    await typeIn('Colour', '#FFF4C0', glow);
    await typeIn('Blur', '40', glow);
    expect(s.layer().effects![0]).toMatchObject({ colour: '#FFF4C0', blur: 40 });
    await typeIn('Opacity', '200', glow);
    expect(within(glow).getByRole('alert').textContent).toBe(
      "A filter's opacity must be between 0 and 100 %.",
    );
    await fireEvent.click(within(quick).getByRole('button', { name: '+ Shadow' }));
    await fireEvent.click(within(quick).getByRole('button', { name: '+ Bevel' }));
    expect(s.layer().effects!.map((f) => f.kind)).toEqual(['glow', 'dropShadow', 'bevel']);
    expect(within(quick).getByRole('button', { name: '+ Glow' }).title).toMatch(/on the layer$/);
    // The list's other filters too, as on an object.
    await fireEvent.change(within(section).getByLabelText('Add', { exact: true }), {
      target: { value: 'blur' },
    });
    await fireEvent.click(within(section).getByRole('button', { name: 'Add filter' }));
    expect(s.layer().effects!.at(-1)).toEqual(newFilter('blur'));
    for (const name of ['Glow', 'Drop shadow', 'Bevel', 'Blur'])
      await fireEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    expect(s.layer()).not.toHaveProperty('effects');
    s.g.undo();
    expect(s.layer().effects).toEqual([newFilter('blur')]);
  });

  it('G10 (M23, M/21 globe): a vector layer has effects too; not shown when an object is selected', async () => {
    const s = await withMoon();
    expect(s.section()).toBeTruthy();
    s.g.addLayer();
    await tick();
    const name = s.layer().name;
    const vector = screen.getByRole('heading', {
      name: new RegExp(`^Effects on ${name}`),
    }).parentElement!;
    await fireEvent.click(
      within(within(vector).getByRole('group', { name: 'Add quickly' })).getByRole('button', {
        name: '+ Stroke',
      }),
    );
    expect(s.layer().effects).toEqual([newFilter('stroke')]);
    s.g.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    await tick();
    expect(screen.queryByRole('heading', { name: /^Effects on/ })).toBeNull();
  });
});
