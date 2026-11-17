// M21 G3 on screen: Properties ▸ Pixel layer for the current pixel layer (or the selected pixels):
// X / Y of one of 9 reference points, W × H in px or % with the proportions kept, Rotate and
// Skew, Resample, Apply as one undo step, Reset; Flip and the quarter turns at once; shown only
// with no objects selected and no painting tool. The Select tool's drag on the canvas moves the
// layer (Shift: straight), and the arrow keys nudge it (Shift: 10 px), the objects when selected.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { execute } from '../../../src/app/history.ts';
import { createLayer, createRect } from '../../../src/core/animation/factory.ts';
import { createBitmap, fillRect, pixelAt } from '../../../src/core/graphics/pixels/raster.ts';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';

const RED = [255, 0, 0, 255];
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
  const white = fillRect(createBitmap(40, 20), { x: 0, y: 0, width: 40, height: 20 }, WHITE);
  const photo = createLayer('Photo', {
    pixels: { bitmap: fillRect(white, { x: 0, y: 0, width: 10, height: 10 }, RED), x: 50, y: 30 },
  });
  const rect = createRect({ x: 300, y: 150, width: 20, height: 20 });
  const shapes = createLayer('Shapes', { objects: [rect] });
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, width: 400, height: 200 },
        layers: [photo, shapes],
      }),
    }),
    layerId: photo.id,
    selection: [],
  }));
  g.setZoom(1);
  const pixels = () => g.store.get().history.present.layers[0]!.pixels!;
  const box = () => {
    const p = pixels();
    return { x: p.x, y: p.y, width: p.bitmap.width, height: p.bitmap.height };
  };
  const steps = () => g.store.get().history.past.length;
  const props = () => within(screen.getByRole('complementary', { name: 'Properties' }));
  const stage = () => screen.getByRole('application', { name: 'Stage' });
  const section = () => document.querySelector('.pixel-transform') as HTMLElement | null;
  return { ...t, g, photo, shapes, rect, pixels, box, steps, props, stage, section };
}

async function type(field: HTMLElement, value: string) {
  await fireEvent.change(field, { target: { value } });
}
const field = (label: string) =>
  within(document.querySelector('.pixel-transform') as HTMLElement).getByLabelText(label);
const button = (name: string) =>
  within(document.querySelector('.pixel-transform') as HTMLElement).getByRole('button', { name });

describe('M21 G3: Properties ▸ Pixel layer', () => {
  it('M21 G3: shows the pixels’ place and size; hidden with an object selected, a brush or a vector layer', async () => {
    const s = await open();
    expect(s.section()).not.toBeNull();
    expect(within(s.section()!).getByText('Pixel layer')).toBeTruthy();
    // The centre by default: (70, 40).
    expect((field('X') as HTMLInputElement).value).toBe('70');
    expect((field('Y') as HTMLInputElement).value).toBe('40');
    expect((field('W') as HTMLInputElement).value).toBe('40');
    expect((field('H') as HTMLInputElement).value).toBe('20');
    await fireEvent.click(button('Reference point top left'));
    expect((field('X') as HTMLInputElement).value).toBe('50');
    expect(button('Reference point top left').getAttribute('aria-pressed')).toBe('true');
    s.g.setTool('paintbrush');
    await Promise.resolve();
    await fireEvent.click(document.body);
    expect(s.section()).toBeNull();
    s.g.setTool('select');
    s.g.select([s.rect.id]);
    await fireEvent.click(document.body);
    expect(s.section()).toBeNull();
    s.g.select([]);
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    await fireEvent.click(document.body);
    expect(s.section()).toBeNull();
  });

  it('M21 G3: the numbers typed wait for Apply, then are one undo step', async () => {
    const s = await open();
    await fireEvent.click(button('Reference point bottom'));
    await type(field('Y'), '150');
    expect(s.steps()).toBe(1);
    expect(button('Apply').hasAttribute('disabled')).toBe(false);
    await type(field('W'), '80');
    // Proportions kept: H follows.
    expect((field('H') as HTMLInputElement).value).toBe('40');
    await fireEvent.change(field('Resample'), { target: { value: 'nearest' } });
    await fireEvent.click(button('Apply'));
    expect(s.steps()).toBe(2);
    // The bottom edge's middle at (70, 150): 80 × 40 above it.
    expect(s.box()).toEqual({ x: 30, y: 110, width: 80, height: 40 });
    expect(pixelAt(s.pixels().bitmap, 19, 19)).toEqual(RED);
    expect(button('Apply').hasAttribute('disabled')).toBe(true);
    s.g.undo();
    expect(s.box()).toEqual({ x: 50, y: 30, width: 40, height: 20 });
  });

  it('M21 G3: sizes in %, proportions free; rotate and skew; Reset forgets; a refusal is shown', async () => {
    const s = await open();
    await fireEvent.change(field('Size in'), { target: { value: '%' } });
    expect((field('W') as HTMLInputElement).value).toBe('100.0');
    await fireEvent.click(within(s.section()!).getByLabelText('Keep proportions'));
    await type(field('W'), '50');
    expect((field('H') as HTMLInputElement).value).toBe('100.0');
    await fireEvent.click(button('Reset'));
    expect((field('W') as HTMLInputElement).value).toBe('100.0');
    await type(field('W'), '0');
    expect(within(s.section()!).getByRole('alert').textContent).toMatch(/at least 1 px/);
    await type(field('W'), '100');
    expect(within(s.section()!).queryByRole('alert')).toBeNull();
    await type(field('Rotate'), '90');
    await fireEvent.click(button('Apply'));
    expect(s.box()).toEqual({ x: 60, y: 20, width: 20, height: 40 });
    await type(field('Skew ↔'), '89');
    await fireEvent.click(button('Apply'));
    expect(within(s.section()!).getByRole('alert').textContent).toMatch(/skew/);
    await type(field('Skew ↕'), '10');
    await type(field('Skew ↔'), '0');
    await fireEvent.click(button('Apply'));
    expect(s.box().height).toBeGreaterThan(40);
  });

  it('M21 G3: flips and quarter turns at once; the selected pixels when there are some', async () => {
    const s = await open();
    await fireEvent.click(button('Flip pixels horizontal'));
    expect(pixelAt(s.pixels().bitmap, 39, 0)).toEqual(RED);
    await fireEvent.click(button('Flip pixels vertical'));
    expect(pixelAt(s.pixels().bitmap, 39, 19)).toEqual(RED);
    await fireEvent.click(button('Turn 180°'));
    expect(pixelAt(s.pixels().bitmap, 0, 0)).toEqual(RED);
    await fireEvent.click(button('Turn 90° clockwise'));
    expect(s.box()).toEqual({ x: 60, y: 20, width: 20, height: 40 });
    await fireEvent.click(button('Turn 90° anticlockwise'));
    expect(s.box()).toEqual({ x: 50, y: 30, width: 40, height: 20 });
    expect(s.steps()).toBe(6);
    s.g.selectRect({ x: 50, y: 30, width: 10, height: 10 });
    await fireEvent.click(document.body);
    expect(within(s.section()!).getByText('Selected pixels')).toBeTruthy();
    expect((field('W') as HTMLInputElement).value).toBe('10');
    await fireEvent.click(button('Flip pixels horizontal'));
    expect(pixelAt(s.pixels().bitmap, 0, 0)).toEqual(RED);
  });
});

describe('M21 G3: Properties ▸ Pixel layer in the image’s units', () => {
  it('M21 G3: X, Y and the size in cm at the image’s resolution; points shown as px', async () => {
    const s = await open();
    // 254 dpi: 100 px a centimetre.
    s.g.store.update((st) => ({
      ...st,
      history: {
        ...st.history,
        present: { ...st.history.present, graphic: { dpi: 254, units: 'cm' as const } },
      },
    }));
    await fireEvent.click(document.body);
    expect((field('X') as HTMLInputElement).value).toBe('0.70');
    expect((field('H') as HTMLInputElement).value).toBe('0.20');
    await fireEvent.click(button('Reference point top left'));
    await type(field('X'), '1');
    await type(field('H'), '0.4');
    expect((field('W') as HTMLInputElement).value).toBe('0.80');
    await fireEvent.click(button('Apply'));
    expect(s.box()).toEqual({ x: 100, y: 30, width: 80, height: 40 });
    s.g.store.update((st) => ({
      ...st,
      history: {
        ...st.history,
        present: { ...st.history.present, graphic: { dpi: 72, units: 'pt' as const } },
      },
    }));
    await fireEvent.click(document.body);
    expect((field('Size in') as HTMLSelectElement).value).toBe('px');
    expect((field('W') as HTMLInputElement).value).toBe('80');
  });
});

describe('M21 G3: moving pixels on the canvas', () => {
  it('M21 G3: the Select tool drags the layer, shown as it goes, one undo step', async () => {
    const s = await open();
    expect(s.stage().style.cursor).toBe('move');
    await fireEvent.pointerDown(s.stage(), { clientX: 60, clientY: 40, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 90, clientY: 55 });
    expect(s.steps()).toBe(1);
    await fireEvent.pointerUp(window, { clientX: 90, clientY: 55 });
    expect(s.box()).toMatchObject({ x: 80, y: 45 });
    expect(s.steps()).toBe(2);
    // Shift: straight across.
    await fireEvent.pointerDown(s.stage(), { clientX: 100, clientY: 50, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 130, clientY: 60, shiftKey: true });
    await fireEvent.pointerUp(window, { clientX: 130, clientY: 60 });
    expect(s.box()).toMatchObject({ x: 110, y: 45 });
    // Or straight down.
    await fireEvent.pointerDown(s.stage(), { clientX: 100, clientY: 50, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 104, clientY: 70, shiftKey: true });
    await fireEvent.pointerUp(window, { clientX: 104, clientY: 70 });
    expect(s.box()).toMatchObject({ x: 110, y: 65 });
  });

  it('M21 G3: no drag on a locked layer: it says why', async () => {
    const s = await open();
    s.g.store.update((st) => ({
      ...st,
      history: {
        ...st.history,
        present: {
          ...st.history.present,
          layers: st.history.present.layers.map((l) => ({ ...l, locked: l.id === s.photo.id })),
        },
      },
    }));
    await fireEvent.pointerDown(s.stage(), { clientX: 60, clientY: 40, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 90, clientY: 55 });
    await fireEvent.pointerUp(window, { clientX: 90, clientY: 55 });
    expect(s.box()).toMatchObject({ x: 50, y: 30 });
    expect(s.g.store.get().message?.text).toMatch(/locked/);
  });

  it('M21 G3: a click without a move deselects the objects; an object is still dragged', async () => {
    const s = await open();
    s.g.select([s.rect.id]);
    await fireEvent.pointerDown(s.stage(), { clientX: 10, clientY: 10, button: 0 });
    await fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    expect(s.g.store.get().selection).toEqual([]);
    expect(s.steps()).toBe(1);
    await fireEvent.pointerDown(s.stage(), { clientX: 310, clientY: 160, button: 0 });
    await fireEvent.pointerUp(window, { clientX: 310, clientY: 160 });
    expect(s.g.store.get().selection).toEqual([s.rect.id]);
  });

  it('M21 G3: the arrow keys nudge the layer (Shift: 10 px), or the objects selected', async () => {
    const s = await open();
    await fireEvent.keyDown(window, { key: 'ArrowRight' });
    await fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
    expect(s.box()).toMatchObject({ x: 51, y: 40 });
    await fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(s.box()).toMatchObject({ x: 50, y: 39 });
    s.g.select([s.rect.id]);
    await fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(s.box()).toMatchObject({ x: 50, y: 39 });
    const rect = s.g.store.get().history.present.layers[1]!.objects[0]!;
    expect(rect.x).toBe(301);
  });
});
