// M22 step 3 on screen (GB5, D8): the retouching tools on Graphics mode's strip, each with a
// "Why use this?"; the clone stamp's source Alt-clicked and shown as a cross (following the
// pointer when aligned), a stroke dragged and kept as one undo step; the heal brush; the blur
// brush's size under the pointer and its strength; red eye clicked or a box dragged; the
// Properties part (source, Aligned, Copy from, size, hardness, opacity or strength, spacing, pupil
// size, darken) and [ ] for the size.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import { bitmapFromRGBA, pixelAt, type Bitmap } from '../../../src/core/graphics/pixels/raster.ts';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';
import { pickTool, toolControl } from '../../helpers/tools.ts';

/** r = x, g = y, b = 7, opaque — and a red pupil of radius 5 at (150, 50) on skin. */
function photo(): Bitmap {
  const data = new Uint8ClampedArray(200 * 100 * 4);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 200; x++) {
      const d = Math.hypot(x + 0.5 - 150, y + 0.5 - 50);
      data.set(
        d < 5 ? [210, 30, 30, 255] : d < 15 ? [225, 175, 145, 255] : [x, y, 7, 255],
        (y * 200 + x) * 4,
      );
    }
  return bitmapFromRGBA(200, 100, data);
}

async function open() {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Graphics',
    }),
  );
  const g = t.app.graphics;
  const layer = createLayer('Photo', { pixels: { bitmap: photo(), x: 0, y: 0 } });
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({ ...d, stage: { ...d.stage, width: 200, height: 100 }, layers: [layer] }),
    }),
    layerId: layer.id,
  }));
  g.setZoom(1);
  const bitmap = () => g.store.get().history.present.layers[0]!.pixels!.bitmap;
  const steps = () => g.store.get().history.past.length;
  const label = () => g.store.get().history.past.at(-1)!.label;
  const tools = () => within(screen.getByRole('toolbar', { name: 'Drawing tools' }));
  const props = () => within(screen.getByRole('complementary', { name: 'Properties' }));
  const stage = () => screen.getByRole('application', { name: 'Stage' });
  const choose = (name: string) => pickTool(name);
  return { ...t, g, bitmap, steps, label, tools, props, stage, choose };
}

async function type(field: HTMLElement, value: string) {
  await fireEvent.change(field, { target: { value } });
}

describe('M22 GB5: retouching on screen', () => {
  it('has the retouching tools on the strip, each with a “Why use this?”', async () => {
    const s = await open();
    for (const name of ['Clone stamp', 'Heal', 'Blur brush', 'Sharpen brush', 'Smudge', 'Red eye'])
      expect((await toolControl(name)).getAttribute('title')).toMatch(/Why\? /);
    await s.choose('Heal');
    expect(s.g.store.get().tool).toBe('heal');
    expect(s.props().getByText('19.3 tools/filters to alter parts of an image')).toBeTruthy();
  });

  it('the clone stamp: Alt-click the source, a cross shows it, a drag copies, one undo step', async () => {
    const s = await open();
    await s.choose('Clone stamp');
    const p = s.props();
    expect(p.getByTestId('clone-source').textContent).toMatch(/No source yet/);
    await type(p.getByLabelText('Size'), '6');
    await type(p.getByLabelText('Hardness'), '100');
    await type(p.getByLabelText('Opacity'), '100');
    await type(p.getByLabelText('Spacing'), '20');
    // Without a source a drag says what to do.
    await fireEvent.pointerDown(s.stage(), { clientX: 60, clientY: 30, button: 0 });
    expect(s.g.store.get().message?.text).toMatch(/Alt-click/);
    await fireEvent.pointerDown(s.stage(), { clientX: 20, clientY: 30, button: 0, altKey: true });
    expect(p.getByTestId('clone-source').textContent).toMatch(/Copying from 20, 30/);
    await fireEvent.pointerMove(s.stage(), { clientX: 60, clientY: 30 });
    const cross = s.stage().querySelector('.clone-source')!;
    expect(cross.getAttribute('data-x')).toBe('20');
    expect(s.stage().querySelector('.retouch-cursor circle')!.getAttribute('r')).toBe('3');
    const before = s.steps();
    await fireEvent.pointerDown(s.stage(), { clientX: 60, clientY: 30, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 70, clientY: 30 });
    await fireEvent.pointerUp(window, { clientX: 80, clientY: 30 });
    expect(s.steps()).toBe(before + 1);
    expect(s.label()).toBe('Clone stamp');
    expect(pixelAt(s.bitmap(), 70, 30)).toEqual([30, 30, 7, 255]);
    // Aligned: the cross now follows the pointer 40 px to its left.
    await fireEvent.pointerMove(s.stage(), { clientX: 100, clientY: 60 });
    expect(s.stage().querySelector('.clone-source')!.getAttribute('data-x')).toBe('60');
    // Not aligned: back at the source.
    await fireEvent.click(p.getByRole('checkbox', { name: /Aligned/ }));
    expect(s.g.retouchOptions().aligned).toBe(false);
    await fireEvent.pointerMove(s.stage(), { clientX: 101, clientY: 60 });
    expect(s.stage().querySelector('.clone-source')!.getAttribute('data-x')).toBe('20');
    await fireEvent.change(p.getByLabelText('Copy from'), { target: { value: 'all' } });
    expect(s.g.retouchOptions().sample).toBe('all');
  });

  it('the heal brush paints and heals as one undo step', async () => {
    const s = await open();
    await s.choose('Heal');
    s.g.setCloneSource({ x: 20, y: 80 });
    const before = s.steps();
    await fireEvent.pointerDown(s.stage(), { clientX: 60, clientY: 80, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 70, clientY: 80 });
    await fireEvent.pointerUp(window, { clientX: 70, clientY: 80 });
    expect(s.steps()).toBe(before + 1);
    expect(s.label()).toBe('Heal');
    // An Alt-click on the heal sets the source too.
    await fireEvent.pointerDown(s.stage(), { clientX: 5, clientY: 6, button: 0, altKey: true });
    expect(s.g.retouchOptions().source).toEqual({ x: 5, y: 6 });
  });

  it('the blur brush: its size under the pointer, its strength, [ and ]', async () => {
    const s = await open();
    await s.choose('Blur brush');
    const p = s.props();
    await type(p.getByLabelText('Strength'), '80');
    expect(s.g.retouchOptions().strength['blur-brush']).toBe(80);
    expect(p.queryByLabelText('Opacity')).toBeNull();
    await type(p.getByLabelText('Size'), '30');
    await fireEvent.pointerMove(s.stage(), { clientX: 50, clientY: 40 });
    expect(s.stage().querySelector('.retouch-cursor circle')!.getAttribute('r')).toBe('15');
    expect(s.stage().querySelector('.clone-source')).toBeNull();
    await fireEvent.keyDown(window, { key: ']' });
    expect(s.g.retouchOptions().brushes['blur-brush'].size).toBe(35);
    await fireEvent.keyDown(window, { key: '[' });
    await fireEvent.keyDown(window, { key: '[' });
    expect(s.g.retouchOptions().brushes['blur-brush'].size).toBe(25);
    const before = s.steps();
    await fireEvent.pointerDown(s.stage(), { clientX: 50, clientY: 40, button: 0 });
    await fireEvent.pointerUp(window, { clientX: 50, clientY: 40 });
    expect(s.steps()).toBe(before + 1);
    expect(s.label()).toBe('Blur brush');
    // A refused size is said under the box.
    await type(p.getByLabelText('Size'), '0');
    expect(p.getByText(/size is 1 to 2500/)).toBeTruthy();
  });

  it('the sharpen and smudge brushes show their strength', async () => {
    const s = await open();
    await s.choose('Sharpen brush');
    await type(s.props().getByLabelText('Strength'), '40');
    expect(s.g.retouchOptions().strength['sharpen-brush']).toBe(40);
    await s.choose('Smudge');
    await type(s.props().getByLabelText('Strength'), '70');
    expect(s.g.retouchOptions().strength.smudge).toBe(70);
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    await s.choose('Smudge');
    expect(s.props().getByText(/On the layer mask/)).toBeTruthy();
  });

  it('red eye: the pupil size under the pointer, a click fixes the eye, a box is drawn while dragged', async () => {
    const s = await open();
    await s.choose('Red eye');
    const p = s.props();
    await type(p.getByLabelText('Pupil size'), '20');
    await type(p.getByLabelText('Darken'), '80');
    expect(s.g.retouchOptions()).toMatchObject({ pupilSize: 20, darken: 80 });
    await fireEvent.pointerMove(s.stage(), { clientX: 150, clientY: 50 });
    expect(s.stage().querySelector('.eye-cursor circle')!.getAttribute('r')).toBe('10');
    await fireEvent.pointerDown(s.stage(), { clientX: 140, clientY: 40, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 160, clientY: 60 });
    expect(s.stage().querySelector('.eye-box rect')!.getAttribute('width')).toBe('20');
    await fireEvent.pointerUp(window, { clientX: 160, clientY: 60 });
    expect(s.stage().querySelector('.eye-box')).toBeNull();
    expect(s.label()).toBe('Red eye');
    expect(pixelAt(s.bitmap(), 150, 50)[0]).toBeLessThan(20);
    expect(pixelAt(s.bitmap(), 150, 60)).toEqual([225, 175, 145, 255]);
  });
});
