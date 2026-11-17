// M22 GB3 on screen: Image ▸ Adjustments ▸ opens one dialog for every adjustment — its sliders
// and typed numbers, a live preview on the stage shortly after a change, OK as one undo step,
// Cancel or Escape taking the preview away; the chooser; levels' channel, colour balance's tones,
// colourise; Replace colour's colour clicked on the image; refusals on a mask and a vector layer.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import type { AdjustmentKind } from '../../../src/core/graphics/pixels/adjust.ts';
import { createBitmap, fillRect, pixelAt } from '../../../src/core/graphics/pixels/raster.ts';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { adjustUi } from '../../../src/ui/graphics/adjust-ui.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';

async function graphicsMode() {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Graphics',
    }),
  );
  const g = t.app.graphics;
  // A 200 × 100 photo: grey 100, with a red box.
  const bitmap = fillRect(
    fillRect(createBitmap(200, 100), { x: 0, y: 0, width: 200, height: 100 }, [100, 100, 100, 255]),
    { x: 50, y: 20, width: 100, height: 60 },
    [200, 0, 0, 255],
  );
  const photo = createLayer('Photo', { pixels: { bitmap, x: 0, y: 0 } });
  const shapes = createLayer('Shapes');
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, width: 200, height: 100 },
        layers: [photo, shapes],
      }),
    }),
    layerId: photo.id,
  }));
  await tick();
  const pixels = () => g.store.get().history.present.layers.find((l) => l.id === photo.id)!.pixels!;
  return { ...t, g, pixels, photo, shapes };
}

async function open(kind: AdjustmentKind, name: string) {
  adjustUi.kind = kind;
  animUi.dialog = 'adjust';
  await tick();
  return within(screen.getByRole('dialog', { name }));
}

const slide = (d: ReturnType<typeof within>, label: string, value: number) =>
  fireEvent.input(d.getByLabelText(label, { exact: true }), { target: { value: String(value) } });

/** The preview comes a moment after the last change. */
const previewed = async (s: Awaited<ReturnType<typeof graphicsMode>>, x = 10, y = 10) => {
  await expect.poll(() => s.g.pixelPreview() !== undefined, { timeout: 2000 }).toBe(true);
  return pixelAt(s.g.pixelPreview()!.pixels.bitmap, x, y);
};

describe('M22 GB3: the adjustment dialog', () => {
  it('M22 GB3: Brightness / contrast previewed live, then OK: one undo step, the preview gone', async () => {
    const s = await graphicsMode();
    const d = await open('brightnessContrast', 'Brightness / contrast');
    expect(d.getByText('19.3 working with colour')).toBeTruthy();
    expect(d.getByRole('button', { name: /Why use this/ })).toBeTruthy();
    await slide(d, 'Brightness', 40);
    await expect.poll(async () => (await previewed(s))[0]).toBe(140);
    // The document is untouched until OK.
    expect(pixelAt(s.pixels().bitmap, 10, 10)).toEqual([100, 100, 100, 255]);
    const steps = s.g.store.get().history.past.length;
    await fireEvent.click(d.getByRole('button', { name: 'OK' }));
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(pixelAt(s.pixels().bitmap, 10, 10)).toEqual([140, 140, 140, 255]);
    expect(s.g.store.get().history.past.length).toBe(steps + 1);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Brightness / contrast');
    expect(s.g.pixelPreview()).toBeUndefined();
  });

  it('M22 GB3: a typed number moves the slider; Cancel and Escape take the preview away', async () => {
    const s = await graphicsMode();
    let d = await open('threshold', 'Black and white');
    // Black and white shows at once: grey 100 is below 128.
    expect(await previewed(s)).toEqual([0, 0, 0, 255]);
    await fireEvent.change(d.getByLabelText('Level value'), { target: { value: '90' } });
    expect((d.getByLabelText('Level', { exact: true }) as HTMLInputElement).value).toBe('90');
    await expect.poll(async () => (await previewed(s))[0]).toBe(255);
    await fireEvent.click(d.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(s.g.pixelPreview()).toBeUndefined();
    expect(pixelAt(s.pixels().bitmap, 10, 10)).toEqual([100, 100, 100, 255]);
    d = await open('invert', 'Invert');
    await previewed(s);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(s.g.pixelPreview()).toBeUndefined();
    void d;
  });

  it('M22 GB3: the chooser changes the adjustment; levels on one channel', async () => {
    const s = await graphicsMode();
    const d = await open('brightnessContrast', 'Brightness / contrast');
    await fireEvent.change(d.getByLabelText('Adjustment'), { target: { value: 'levels' } });
    const levels = within(screen.getByRole('dialog', { name: 'Levels' }));
    expect(adjustUi.kind).toBe('levels');
    expect(levels.getByLabelText('Midtones (gamma)', { exact: true })).toBeTruthy();
    await fireEvent.change(levels.getByLabelText('Channel'), { target: { value: 'red' } });
    await slide(levels, 'Output white', 0);
    await expect.poll(async () => (await previewed(s))[0]).toBe(0);
    await fireEvent.click(levels.getByRole('button', { name: 'OK' }));
    await expect.poll(() => pixelAt(s.pixels().bitmap, 10, 10)).toEqual([0, 100, 100, 255]);
  });

  it('M22 GB3: colour balance moves the tone chosen, its luminosity kept or not', async () => {
    const s = await graphicsMode();
    const d = await open('colourBalance', 'Colour balance');
    await fireEvent.click(d.getByLabelText(/Preserve luminosity/));
    await fireEvent.click(d.getByLabelText('Shadows'));
    await slide(d, 'Yellow – Blue', 100);
    // Grey 100 is (1 − 2 × 0.39)² = 4.6 % shadow: blue 100 → 105.
    await expect.poll(async () => (await previewed(s))[2]).toBe(105);
    await fireEvent.click(d.getByLabelText('Midtones'));
    expect((d.getByLabelText('Yellow – Blue', { exact: true }) as HTMLInputElement).value).toBe(
      '0',
    );
    await fireEvent.click(d.getByRole('button', { name: 'OK' }));
    await expect.poll(() => pixelAt(s.pixels().bitmap, 10, 10)).toEqual([100, 100, 105, 255]);
  });

  it('M22 GB3: hue / saturation with colourise: the hue from 0 to 360°', async () => {
    const s = await graphicsMode();
    const d = await open('hueSaturation', 'Hue / saturation');
    expect((d.getByLabelText('Hue', { exact: true }) as HTMLInputElement).min).toBe('-180');
    await fireEvent.click(d.getByLabelText(/Colourise/));
    expect((d.getByLabelText('Hue', { exact: true }) as HTMLInputElement).max).toBe('360');
    await slide(d, 'Hue', 240);
    await slide(d, 'Saturation', 100);
    await expect.poll(async () => (await previewed(s))[2]).toBeGreaterThan(190);
    await fireEvent.click(d.getByLabelText(/Colourise/));
    expect((d.getByLabelText('Saturation', { exact: true }) as HTMLInputElement).value).toBe('0');
    expect((d.getByLabelText('Hue', { exact: true }) as HTMLInputElement).value).toBe('-120');
  });

  it('M22 GB3: replace colour: the colour clicked on the image, then made brighter', async () => {
    const s = await graphicsMode();
    const d = await open('replaceColour', 'Replace colour');
    // The stage drawn at 200 % from (100, 50) on the screen.
    const stage = screen.getByRole('application', { name: 'Stage' });
    stage.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250 }) as DOMRect;
    const backdrop = screen.getByRole('presentation');
    await fireEvent.pointerDown(backdrop, { clientX: 100 + 60 * 2, clientY: 50 + 30 * 2 });
    expect((d.getByLabelText('Colour', { exact: true }) as HTMLInputElement).value).toBe('#C80000');
    // Off the image: nothing to pick, and it says so.
    await fireEvent.pointerDown(backdrop, { clientX: 20, clientY: 20 });
    expect(d.getByRole('alert').textContent).toMatch(/Nothing to pick/);
    await slide(d, 'Hue', 120);
    await fireEvent.click(d.getByRole('button', { name: 'OK' }));
    await expect.poll(() => pixelAt(s.pixels().bitmap, 60, 30)).toEqual([0, 200, 0, 255]);
    expect(pixelAt(s.pixels().bitmap, 10, 10)).toEqual([100, 100, 100, 255]);
  });

  it('M22 GB3: a colour typed for replace colour', async () => {
    await graphicsMode();
    const d = await open('replaceColour', 'Replace colour');
    await fireEvent.change(d.getByLabelText('Colour', { exact: true }), {
      target: { value: '646464' },
    });
    expect((d.getByLabelText('Colour', { exact: true }) as HTMLInputElement).value).toBe('#646464');
  });

  it('M22 GB3: on a layer mask, the colour ones are refused until one for greys is chosen', async () => {
    const s = await graphicsMode();
    s.g.store.update((st) => ({ ...st, editingMask: true }));
    const d = await open('hueSaturation', 'Hue / saturation');
    expect(d.getByRole('alert').textContent).toMatch(/layer mask has only greys/);
    expect((d.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.change(d.getByLabelText('Adjustment'), { target: { value: 'invert' } });
    const inv = within(screen.getByRole('dialog', { name: 'Invert' }));
    expect(inv.queryByRole('alert')).toBeNull();
    await fireEvent.click(inv.getByRole('button', { name: 'OK' }));
    await expect.poll(() => s.pixels().mask && pixelAt(s.pixels().mask!, 5, 5)).toBe(0);
  });

  it('M22 GB3: exposure, shadows / highlights and temperature / tint have their sliders; a typed number is kept in range', async () => {
    const s = await graphicsMode();
    const d = await open('exposure', 'Exposure');
    await fireEvent.change(d.getByLabelText('Exposure value'), { target: { value: '9' } });
    expect((d.getByLabelText('Exposure value') as HTMLInputElement).value).toBe('5');
    // A box left empty changes nothing.
    await fireEvent.input(d.getByLabelText('Exposure', { exact: true }), {
      target: { value: '' },
    });
    for (const [kind, name, labels] of [
      ['shadowsHighlights', 'Shadows / highlights', ['Shadows', 'Highlights', 'Radius']],
      ['temperatureTint', 'Temperature / tint', ['Temperature', 'Tint']],
      ['greyscale', 'Greyscale', []],
    ] as const) {
      await fireEvent.change(d.getByLabelText('Adjustment'), { target: { value: kind } });
      const now = within(screen.getByRole('dialog', { name }));
      for (const l of labels) expect(now.getByLabelText(l, { exact: true })).toBeTruthy();
    }
    // Greyscale: the red box's grey (0.299 × 200 = 60) previewed.
    expect(await previewed(s, 60, 30)).toEqual([60, 60, 60, 255]);
    // A click beside the box picks nothing but for Replace colour.
    await fireEvent.pointerDown(screen.getByRole('presentation'), { clientX: 5, clientY: 5 });
    expect(screen.getByRole('dialog', { name: 'Greyscale' })).toBeTruthy();
  });

  it('M22 GB3: replace colour: a stage not laid out yet picks nothing', async () => {
    await graphicsMode();
    const d = await open('replaceColour', 'Replace colour');
    await fireEvent.pointerDown(screen.getByRole('presentation'), { clientX: 5, clientY: 5 });
    expect((d.getByLabelText('Colour', { exact: true }) as HTMLInputElement).value).toBe('#000000');
    expect(d.queryByRole('alert')).toBeNull();
  });

  it('M22 GB3: on a vector layer there is nothing to adjust', async () => {
    const s = await graphicsMode();
    s.g.selectLayer(s.shapes.id);
    await tick();
    const d = await open('exposure', 'Exposure');
    expect(d.getByRole('alert').textContent).toMatch(/Choose a pixel layer first/);
    expect((d.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(d.getByRole('button', { name: 'Cancel' }));
  });
});
