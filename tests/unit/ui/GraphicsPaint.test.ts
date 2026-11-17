// M21 step 4 on screen (GB4, GB3): the painting tools on Graphics mode's strip; a stroke dragged
// on the canvas shown as it is painted and kept as one undo step; the brush's size under the
// pointer; the Properties part with the colours, the brush settings, the presets (built in and
// saved) and the keys ([ ] X D); the paint bucket clicked; the gradient's line dragged and its
// colours between; the airbrush held still.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import { createBitmap, fillRect, pixelAt } from '../../../src/core/graphics/pixels/raster.ts';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';
import { pickTool, toolControl } from '../../helpers/tools.ts';

const WHITE = [255, 255, 255, 255];

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
  const photo = createLayer('Photo', {
    pixels: {
      bitmap: fillRect(createBitmap(200, 100), { x: 0, y: 0, width: 200, height: 100 }, WHITE),
      x: 0,
      y: 0,
    },
  });
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({ ...d, stage: { ...d.stage, width: 200, height: 100 }, layers: [photo] }),
    }),
    layerId: photo.id,
  }));
  g.setZoom(1);
  const bitmap = () => g.store.get().history.present.layers[0]!.pixels!.bitmap;
  const steps = () => g.store.get().history.past.length;
  const tools = () => within(screen.getByRole('toolbar', { name: 'Drawing tools' }));
  const props = () => within(screen.getByRole('complementary', { name: 'Properties' }));
  const stage = () => screen.getByRole('application', { name: 'Stage' });
  return { ...t, g, bitmap, steps, tools, props, stage };
}

const key = (k: string) => fireEvent.keyDown(window, { key: k });
async function type(field: HTMLElement, value: string) {
  await fireEvent.change(field, { target: { value } });
}

describe('M21 GB4: painting on screen', () => {
  it('has the painting tools on the strip, each with a “Why use this?”', async () => {
    const s = await open();
    for (const name of ['Paintbrush', 'Pencil', 'Eraser', 'Airbrush', 'Paint bucket', 'Gradient'])
      expect((await toolControl(name)).getAttribute('title')).toMatch(/Why\? /);
    await pickTool('Pencil');
    expect(s.g.store.get().tool).toBe('pencil');
  });

  it('a stroke dragged is shown, then kept as one undo step', async () => {
    const s = await open();
    await pickTool('Paintbrush');
    const p = s.props();
    await type(p.getByLabelText('Size'), '10');
    await type(p.getByLabelText('Hardness'), '100');
    await type(p.getAllByLabelText('Colour')[0]!, '#FF0000');
    const before = s.steps();
    await fireEvent.pointerDown(s.stage(), { clientX: 20, clientY: 20, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 60, clientY: 20 });
    await fireEvent.pointerUp(window, { clientX: 80, clientY: 20 });
    expect(pixelAt(s.bitmap(), 50, 20)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(s.bitmap(), 79, 20)).toEqual([255, 0, 0, 255]);
    expect(s.steps()).toBe(before + 1);
  });

  it('shows the brush’s size under the pointer, a box for the pencil', async () => {
    const s = await open();
    await pickTool('Paintbrush');
    await type(s.props().getByLabelText('Size'), '30');
    await fireEvent.pointerMove(s.stage(), { clientX: 50, clientY: 40 });
    const circle = s.stage().querySelector('.brush-cursor circle')!;
    expect(circle.getAttribute('r')).toBe('15');
    expect(circle.getAttribute('cx')).toBe('50');
    await pickTool('Pencil');
    const box = s.stage().querySelector('.brush-cursor rect')!;
    expect(box.getAttribute('width')).toBe('1');
    expect(box.getAttribute('x')).toBe('50');
    await pickTool('Select');
    expect(s.stage().querySelector('.brush-cursor')).toBeNull();
  });

  it('[ and ] change the size; X swaps the colours, D makes them black and white', async () => {
    const s = await open();
    await pickTool('Paintbrush');
    await key(']');
    expect(s.g.paintOptions().brushes.paintbrush.size).toBe(25);
    await key('[');
    await key('[');
    expect(s.g.paintOptions().brushes.paintbrush.size).toBe(15);
    s.g.setBrush({ size: 3 });
    await key('[');
    expect(s.g.paintOptions().brushes.paintbrush.size).toBe(2);
    s.g.setBrush({ size: 100 });
    await key(']');
    expect(s.g.paintOptions().brushes.paintbrush.size).toBe(110);
    s.g.setBrush({ size: 400 });
    await key(']');
    expect(s.g.paintOptions().brushes.paintbrush.size).toBe(450);
    await key('x');
    expect(s.g.paintOptions()).toMatchObject({ foreground: '#ffffff', background: '#000000' });
    await key('d');
    expect(s.g.paintOptions()).toMatchObject({ foreground: '#000000', background: '#ffffff' });
    await fireEvent.click(s.props().getByRole('button', { name: 'Swap' }));
    expect(s.g.paintOptions().foreground).toBe('#ffffff');
    await fireEvent.click(s.props().getByRole('button', { name: 'Black and white' }));
    expect(s.g.paintOptions().foreground).toBe('#000000');
    // Not with another tool: X and D do nothing, [ ] nothing.
    await pickTool('Select');
    await key('x');
    await key(']');
    expect(s.g.paintOptions().foreground).toBe('#000000');
    await pickTool('Paint bucket');
    await key(']');
    await key('x');
    expect(s.g.paintOptions().foreground).toBe('#ffffff');
  });

  it('the brush settings: opacity, flow, spacing, shape and pen pressure', async () => {
    const s = await open();
    await pickTool('Eraser');
    const p = s.props();
    expect(p.getByText('Eraser')).toBeTruthy();
    await type(p.getByLabelText('Opacity'), '40');
    await type(p.getByLabelText('Flow'), '50');
    await type(p.getByLabelText('Spacing'), '30');
    await fireEvent.change(p.getByLabelText('Shape'), { target: { value: 'star' } });
    await fireEvent.click(p.getByLabelText('Pen pressure: size'));
    await fireEvent.click(p.getByLabelText('Pen pressure: flow'));
    expect(s.g.paintOptions().brushes.eraser).toMatchObject({
      opacity: 40,
      flow: 50,
      spacing: 30,
      shape: 'star',
      pressureSize: false,
      pressureFlow: true,
    });
    await type(p.getByLabelText('Opacity'), '0');
    expect(p.getByText('The opacity is 1 to 100 %.')).toBeTruthy();
    // The pencil has no hardness: it is always hard.
    await pickTool('Pencil');
    expect(s.props().queryByLabelText('Hardness')).toBeNull();
  });

  it('a built-in preset chooses its tool; a brush saved as a preset comes back and is deleted', async () => {
    const s = await open();
    await pickTool('Paintbrush');
    await fireEvent.change(s.props().getByLabelText('Preset'), {
      target: { value: 'built:Scatter: stars and lights' },
    });
    expect(s.g.paintOptions().brushes.paintbrush.shape).toBe('scatter');
    await type(s.props().getByLabelText('Size'), '12');
    await fireEvent.input(s.props().getByLabelText('Save as'), { target: { value: 'Night sky' } });
    await fireEvent.click(s.props().getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(s.app.brushPresets.store.get().map((p) => p.name)).toEqual(['Night sky']),
    );
    await waitFor(() => expect(s.props().getByRole('option', { name: 'Night sky' })).toBeTruthy());
    s.g.setBrush({ size: 99 });
    await fireEvent.change(s.props().getByLabelText('Preset'), {
      target: { value: 'mine:Night sky' },
    });
    expect(s.g.paintOptions().brushes.paintbrush.size).toBe(12);
    await fireEvent.click(s.props().getByRole('button', { name: 'Delete the preset' }));
    await waitFor(() => expect(s.app.brushPresets.store.get()).toEqual([]));
    await fireEvent.change(s.props().getByLabelText('Preset'), {
      target: { value: 'built:Pencil 1 px' },
    });
    expect(s.g.store.get().tool).toBe('pencil');
  });

  it('a preset with no name is not saved', async () => {
    const s = await open();
    await pickTool('Paintbrush');
    const save = s.props().getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('on the layer mask says what black and white do', async () => {
    const s = await open();
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    await pickTool('Paintbrush');
    expect(s.props().getByText(/black hides, white shows/)).toBeTruthy();
  });

  it('the airbrush keeps painting while held still', async () => {
    const s = await open();
    await pickTool('Airbrush');
    await fireEvent.pointerDown(s.stage(), { clientX: 100, clientY: 50, button: 0 });
    await new Promise((r) => setTimeout(r, 150));
    await fireEvent.pointerUp(window, { clientX: 100, clientY: 50 });
    // Flow 10 %: one dab would be 10 % black; held, it built up.
    expect(pixelAt(s.bitmap(), 100, 50)[0]).toBeLessThan(255 * 0.9 - 10);
  });
});

describe('M21 GB3: the bucket and the gradient on screen', () => {
  it('the bucket fills where it is clicked, with its tolerance, contiguous and opacity', async () => {
    const s = await open();
    await pickTool('Paint bucket');
    const p = s.props();
    expect(p.getByText('Paint bucket')).toBeTruthy();
    await type(p.getByLabelText('Tolerance'), '10');
    await type(p.getByLabelText('Opacity'), '50');
    await fireEvent.click(p.getByLabelText(/Contiguous/));
    expect(s.g.paintOptions().bucket).toEqual({ tolerance: 10, contiguous: false, opacity: 50 });
    await type(p.getAllByLabelText('Colour')[0]!, '#000000');
    await fireEvent.pointerDown(s.stage(), { clientX: 10, clientY: 10, button: 0 });
    await waitFor(() => expect(pixelAt(s.bitmap(), 150, 90)).toEqual([128, 128, 128, 255]));
  });

  it('the gradient: its line shown while dragged, then the layer filled along it', async () => {
    const s = await open();
    await pickTool('Gradient');
    const p = s.props();
    await fireEvent.change(p.getByLabelText('Type'), { target: { value: 'radial' } });
    await type(p.getByLabelText('Opacity'), '100');
    expect(s.g.paintOptions().gradient.kind).toBe('radial');
    await fireEvent.change(p.getByLabelText('Type'), { target: { value: 'linear' } });
    await type(p.getAllByLabelText('Colour')[0]!, '#FF0000');
    await type(p.getByLabelText('Background'), '#0000FF');
    await fireEvent.pointerDown(s.stage(), { clientX: 0, clientY: 50, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 100, clientY: 52, shiftKey: true });
    const line = s.stage().querySelector('.gradient-line line')!;
    // Shift keeps it level.
    expect(Number(line.getAttribute('y2'))).toBeCloseTo(50, 5);
    await fireEvent.pointerUp(window, { clientX: 200, clientY: 50 });
    expect(s.stage().querySelector('.gradient-line')).toBeNull();
    await waitFor(() => expect(pixelAt(s.bitmap(), 0, 10)[0]).toBeGreaterThan(250));
    expect(pixelAt(s.bitmap(), 199, 10)[2]).toBeGreaterThan(250);
  });

  it('the gradient’s colours between are added, changed and taken off', async () => {
    const s = await open();
    await pickTool('Gradient');
    await fireEvent.click(s.props().getByRole('button', { name: 'Add a colour' }));
    expect(s.g.paintOptions().gradient.stops).toHaveLength(1);
    expect(s.g.paintOptions().gradient.stops[0]!.at).toBe(50);
    await type(s.props().getByLabelText('Colour 2'), '#00FF00');
    await type(s.props().getByLabelText('At'), '30');
    expect(s.g.paintOptions().gradient.stops[0]).toEqual({ at: 30, colour: '#00ff00' });
    await type(s.props().getByLabelText('At'), '130');
    expect(s.props().getByText('Between 0 and 100 %.')).toBeTruthy();
    await fireEvent.click(s.props().getByRole('button', { name: 'Take colour 2 off' }));
    expect(s.g.paintOptions().gradient.stops).toEqual([]);
  });
});
