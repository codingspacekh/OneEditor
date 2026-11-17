// M21 GB6, G8, GB1 on screen: Image size… (px, %, cm, keep proportions, the method, only the dpi),
// Canvas size… (the anchor, a typed place, the new area), Crop to content and Trim plain edges,
// Reduce colours… with its estimate, and the view: the Hand and Zoom tools, Space to pan,
// Ctrl/Cmd + wheel, zoom to 3200 %, the pixel grid and the part of a large image drawn alone.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import { createBitmap, fillRect } from '../../../src/core/graphics/pixels/raster.ts';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';
import { pickTool, viewHelper } from '../../helpers/tools.ts';

async function graphicsMode(withPhoto = true) {
  animUi.dialog = null;
  animUi.pixelGrid = true;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Graphics',
    }),
  );
  const g = t.app.graphics;
  if (withPhoto) {
    // A 200 × 100 photo: white with a red box, opened as the image.
    const bitmap = fillRect(
      fillRect(
        createBitmap(200, 100),
        { x: 0, y: 0, width: 200, height: 100 },
        [255, 255, 255, 255],
      ),
      { x: 50, y: 20, width: 100, height: 60 },
      [200, 0, 0, 255],
    );
    const photo = createLayer('Photo', { pixels: { bitmap, x: 0, y: 0 } });
    g.store.update((s) => ({
      ...s,
      history: execute(s.history, {
        label: 'Open',
        apply: (d) => ({
          ...d,
          stage: { ...d.stage, width: 200, height: 100 },
          layers: [photo],
        }),
      }),
      layerId: photo.id,
    }));
    await tick();
  }
  const doc = () => g.store.get().history.present;
  return { ...t, g, doc };
}

const props = () => within(screen.getByRole('complementary', { name: 'Properties' }));
const dialog = (name: string) => within(screen.getByRole('dialog', { name }));
const type = (d: ReturnType<typeof dialog>, label: string, value: string) =>
  fireEvent.change(d.getByLabelText(label, { exact: true }), { target: { value } });

describe('M21 GB6: Image size…', () => {
  it('M21 GB6: 640 px wide, the height in proportion (workbook Task 3.5), resampled bicubic', async () => {
    const s = await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Image size…' }));
    const d = dialog('Image size');
    expect(d.getByText(/Now/).textContent).toMatch(/200 × 100 px/);
    await type(d, 'Width', '640');
    expect((d.getByLabelText('Height', { exact: true }) as HTMLInputElement).value).toBe('320');
    expect(d.getByText(/after:/).textContent).toMatch(/640 × 320 px/);
    expect(d.getByText(/guessed from those around them/)).toBeTruthy();
    await fireEvent.change(d.getByLabelText('Resample by'), { target: { value: 'nearest' } });
    await fireEvent.click(d.getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog', { name: 'Image size' })).toBeNull();
    expect(s.doc().stage).toMatchObject({ width: 640, height: 320 });
    expect(s.doc().layers[0]!.pixels!.bitmap.width).toBe(640);
  });

  it('M21 GB6: in % and cm; proportions free; a size too big is refused before Apply', async () => {
    const s = await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Image size…' }));
    const d = dialog('Image size');
    await fireEvent.change(d.getByLabelText('Units'), { target: { value: '%' } });
    expect((d.getByLabelText('Width', { exact: true }) as HTMLInputElement).value).toBe('100.0');
    await type(d, 'Height', '50');
    expect((d.getByLabelText('Width', { exact: true }) as HTMLInputElement).value).toBe('50.0');
    await fireEvent.click(d.getByLabelText('Keep proportions'));
    await type(d, 'Width', '25');
    expect(d.getByText(/after:/).textContent).toMatch(/50 × 50 px/);
    await fireEvent.change(d.getByLabelText('Units'), { target: { value: 'cm' } });
    await type(d, 'Width', '1000');
    expect(d.getByText(/must come to between 16 and 8192/)).toBeTruthy();
    expect((d.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    await type(d, 'Width', '0');
    expect(d.getByText('Type a size above 0.')).toBeTruthy();
    await type(d, 'Width', '2');
    await fireEvent.change(d.getByLabelText('Resolution'), { target: { value: '72' } });
    expect(d.getByText(/a print looks blocky/)).toBeTruthy();
    await fireEvent.change(d.getByLabelText('Resolution'), { target: { value: '5' } });
    expect(d.getByText(/resolution must be/)).toBeTruthy();
    await fireEvent.click(d.getByRole('button', { name: 'Cancel' }));
    expect(s.doc().stage.width).toBe(200);
  });

  it('benchmark G6: a size typed in cm is kept exactly (M/26: 10 × 6 cm, not 6.01)', async () => {
    const s = await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Image size…' }));
    const d = dialog('Image size');
    await fireEvent.click(d.getByLabelText('Keep proportions'));
    await fireEvent.change(d.getByLabelText('Units'), { target: { value: 'cm' } });
    await type(d, 'Width', '10');
    await type(d, 'Height', '6');
    await fireEvent.click(d.getByRole('button', { name: 'Apply' }));
    expect(s.doc().stage).toMatchObject({ width: 378, height: 227 });
    expect(s.doc().graphic?.size).toEqual({ width: 10, height: 6, units: 'cm' });
  });

  it('M21 GB6: proportions kept from the height in px; a web picture far bigger than a screen', async () => {
    await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Image size…' }));
    const d = dialog('Image size');
    await type(d, 'Height', '50');
    expect((d.getByLabelText('Width', { exact: true }) as HTMLInputElement).value).toBe('100');
    expect(d.getByText(/Bicubic suits photos/)).toBeTruthy();
    await type(d, 'Width', '8000');
    expect(d.getByText(/Far bigger than a screen needs/)).toBeTruthy();
  });

  it('M21 GB6: Resample off changes only the resolution: the pixels stay', async () => {
    const s = await graphicsMode();
    const bitmap = s.doc().layers[0]!.pixels!.bitmap;
    await fireEvent.click(props().getByRole('button', { name: 'Image size…' }));
    const d = dialog('Image size');
    await fireEvent.click(d.getByLabelText(/Resample \(change/));
    expect((d.getByLabelText('Width', { exact: true }) as HTMLInputElement).disabled).toBe(true);
    expect(d.getByText(/only how big the image prints changes/)).toBeTruthy();
    await fireEvent.change(d.getByLabelText('Resolution'), { target: { value: '300' } });
    await fireEvent.click(d.getByRole('button', { name: 'Apply' }));
    expect(s.doc().graphic?.dpi).toBe(300);
    expect(s.doc().layers[0]!.pixels!.bitmap).toBe(bitmap);
  });
});

describe('M21 GB6: Canvas size…', () => {
  it('M21 GB6: a bigger canvas at the top left, the new area transparent', async () => {
    const s = await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Canvas size…' }));
    const d = dialog('Canvas size');
    await type(d, 'Width', '300');
    await fireEvent.click(d.getByRole('button', { name: 'Anchor top left' }));
    expect(d.getByRole('button', { name: 'Anchor top left' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await fireEvent.click(d.getByLabelText('New area transparent'));
    expect(d.getByText(/The canvas:/).textContent).toMatch(/300 × 100 px/);
    await fireEvent.click(d.getByRole('button', { name: 'Apply' }));
    expect(s.doc().stage).toMatchObject({ width: 300, height: 100, background: 'none' });
    expect(s.doc().layers[0]!.pixels).toMatchObject({ x: 0, y: 0 });
  });

  it('M21 G8: a typed place crops a box; a smaller canvas says it crops', async () => {
    const s = await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Canvas size…' }));
    const d = dialog('Canvas size');
    await type(d, 'Width', '100');
    await type(d, 'Height', '60');
    expect(d.getByText(/what is outside it is cropped/)).toBeTruthy();
    // The centre anchor puts the new canvas's top left at (50, 20); typed instead:
    expect((d.getByLabelText('Left', { exact: true }) as HTMLInputElement).value).toBe('50');
    await type(d, 'Left', '60');
    await type(d, 'Top', '30');
    expect(d.getByRole('button', { name: 'Anchor centre' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    await fireEvent.change(d.getByLabelText('Units'), { target: { value: 'px' } });
    await fireEvent.click(d.getByRole('button', { name: 'Apply' }));
    expect(s.doc().stage).toMatchObject({ width: 100, height: 60 });
    expect(s.doc().layers[0]!.pixels).toMatchObject({ x: 0, y: 0 });
    expect(s.doc().layers[0]!.pixels!.bitmap.width).toBe(100);
  });

  it('M21 GB6: a size that cannot be is refused before Apply', async () => {
    await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Canvas size…' }));
    const d = dialog('Canvas size');
    await fireEvent.change(d.getByLabelText('Units'), { target: { value: '%' } });
    await type(d, 'Width', '5');
    expect(d.getByText(/must come to between/)).toBeTruthy();
    expect((d.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('M21 G8: Crop to content and Trim plain edges', () => {
  it('M21 G8: trims the white round the red box (O/N/19 Pearl); content alone keeps it', async () => {
    const s = await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Crop to content' }));
    expect(s.doc().stage).toMatchObject({ width: 200, height: 100 });
    await fireEvent.click(props().getByRole('button', { name: 'Trim plain edges' }));
    expect(s.doc().stage).toMatchObject({ width: 100, height: 60 });
  });
});

describe('M21 GB6: Reduce colours…', () => {
  it('M21 GB6: shows the colours used and the size before and after, then reduces', async () => {
    const s = await graphicsMode();
    await fireEvent.click(props().getByRole('button', { name: 'Reduce colours…' }));
    const d = dialog('Reduce colours');
    expect(d.getByText(/which uses/).textContent).toMatch(/2\s+colours/);
    expect(d.getByText(/File size estimate/).textContent).toMatch(/60 KB\s+at\s+24 bits/);
    await fireEvent.click(d.getByLabelText(/2 colours/));
    expect(d.getByText(/File size estimate/).textContent).toMatch(/at\s+1\s+bit a pixel/);
    await fireEvent.click(d.getByLabelText(/Greyscale/));
    expect((d.getByLabelText(/Dithering/) as HTMLInputElement).disabled).toBe(true);
    await fireEvent.click(d.getByLabelText(/16 colours/));
    await fireEvent.click(d.getByRole('button', { name: 'Apply' }));
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Reduce to 16 colours');
  });

  it('M21 GB6: asks for a pixel layer when the current one holds shapes', async () => {
    await graphicsMode(false);
    await fireEvent.click(props().getByRole('button', { name: 'Reduce colours…' }));
    const d = dialog('Reduce colours');
    expect(d.getByRole('alert').textContent).toMatch(/Choose a pixel layer first/);
    expect((d.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('M21 GB1: the view', () => {
  const area = () => document.querySelector('.stage-area') as HTMLDivElement;
  const stage = () => screen.getByRole('application', { name: 'Stage' });
  /** jsdom does not scroll: the area keeps what it is given. */
  function scrollable(el: HTMLElement) {
    let left = 0;
    let top = 0;
    Object.defineProperty(el, 'scrollLeft', { get: () => left, set: (v) => (left = v) });
    Object.defineProperty(el, 'scrollTop', { get: () => top, set: (v) => (top = v) });
    return () => ({ left, top });
  }

  it('M21 GB1: the Zoom tool zooms in a step where clicked, Alt-click out; to 3200 %', async () => {
    const s = await graphicsMode();
    await pickTool('Zoom');
    expect(s.g.store.get().tool).toBe('zoom');
    expect(stage().style.cursor).toBe('zoom-in');
    s.g.setZoom(4);
    await tick();
    await fireEvent.pointerDown(stage(), { clientX: 10, clientY: 10, button: 0 });
    await tick();
    expect(s.g.store.get().zoom).toBe(8);
    await fireEvent.pointerDown(stage(), { clientX: 10, clientY: 10, button: 0, altKey: true });
    await tick();
    expect(s.g.store.get().zoom).toBe(4);
    s.g.setZoom(16);
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(s.g.store.get().zoom).toBe(32);
    expect(screen.getByRole('button', { name: 'Zoom to fit' }).textContent).toBe('3200 %');
    // Z and H choose the tools.
    await fireEvent.keyDown(window, { key: 'h' });
    expect(s.g.store.get().tool).toBe('hand');
    await fireEvent.keyDown(window, { key: 'z' });
    expect(s.g.store.get().tool).toBe('zoom');
  });

  it('M21 GB1: the Hand drags the image: the area scrolls the other way', async () => {
    const s = await graphicsMode();
    const scrolled = scrollable(area());
    await pickTool('Hand');
    expect(stage().style.cursor).toBe('grab');
    await fireEvent.pointerDown(stage(), { clientX: 100, clientY: 100, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 70, clientY: 80 });
    await fireEvent.pointerUp(window, { clientX: 70, clientY: 80 });
    expect(scrolled()).toEqual({ left: 30, top: 20 });
    expect(s.doc().layers[0]!.pixels!.x).toBe(0);
  });

  it('M21 GB1: Space held pans whatever the tool; let go, the tool works again', async () => {
    const s = await graphicsMode();
    const scrolled = scrollable(area());
    s.g.setTool('rect');
    await fireEvent.keyDown(window, { key: ' ' });
    expect(stage().style.cursor).toBe('grab');
    await fireEvent.pointerDown(stage(), { clientX: 50, clientY: 50, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 40, clientY: 45 });
    await fireEvent.pointerUp(window, { clientX: 40, clientY: 45 });
    expect(scrolled()).toEqual({ left: 10, top: 5 });
    await fireEvent.keyUp(window, { key: ' ' });
    expect(stage().style.cursor).not.toBe('grab');
    // Leaving the window lets go of Space too.
    await fireEvent.keyDown(window, { key: ' ' });
    await fireEvent.blur(window);
    expect(stage().style.cursor).not.toBe('grab');
  });

  it('M21 GB1: Ctrl/Cmd + wheel zooms about the pointer; a plain wheel scrolls', async () => {
    const s = await graphicsMode();
    scrollable(area());
    s.g.setZoom(1);
    await tick();
    await fireEvent.wheel(area(), { deltaY: -100, ctrlKey: true, clientX: 50, clientY: 50 });
    await tick();
    expect(s.g.store.get().zoom).toBe(1.5);
    await fireEvent.wheel(area(), { deltaY: 100, metaKey: true });
    await tick();
    expect(s.g.store.get().zoom).toBe(1);
    await fireEvent.wheel(area(), { deltaY: 100 });
    await fireEvent.wheel(area(), { deltaY: 0, ctrlKey: true });
    await tick();
    expect(s.g.store.get().zoom).toBe(1);
  });

  it('M21 GB1: the pixel grid from 800 %, turned off and on; a large zoom draws only a part', async () => {
    const s = await graphicsMode();
    s.g.setZoom(4);
    await tick();
    expect(screen.queryByTestId('pixel-grid')).toBeNull();
    s.g.setZoom(8);
    await tick();
    expect(screen.getByTestId('pixel-grid').getAttribute('d')).toMatch(/^M0 0V100/);
    const toggle = await viewHelper('Pixel grid');
    await fireEvent.click(toggle);
    expect(screen.queryByTestId('pixel-grid')).toBeNull();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(toggle);
    // At 3200 % a 200 × 100 image would be a 6400 × 3200 canvas and more: a part only.
    s.g.setZoom(32);
    await tick();
    expect(document.querySelector('.stage-area canvas')!.classList.contains('part')).toBe(true);
  });
});
