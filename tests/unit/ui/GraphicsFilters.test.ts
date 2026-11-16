// M22 GB5 on screen: the Filter menu opens one dialog for each filter — its sliders and typed
// numbers, a live preview on the stage shortly after a change, OK as one undo step, Cancel or
// Escape taking the preview away; the centre of a twirl, bulge or zoom typed or clicked on the
// image (its circle drawn there); the perspective's corners and the warp's mesh dragged on the
// image, Reset; refusals (numbers out of range, crossed corners, a vector layer).
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import { createBitmap, fillRect, pixelAt } from '../../../src/core/graphics/pixels/raster.ts';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { filterUi, handlesOf, withHandle } from '../../../src/ui/graphics/filter-ui.svelte.ts';
import { menuActions } from '../../../src/ui/menu-actions.ts';
import { ui } from '../../../src/ui/ui-state.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';

async function graphicsMode() {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  const g = t.app.graphics;
  // A 200 × 100 photo: white on the left, black on the right.
  const bitmap = fillRect(
    fillRect(createBitmap(200, 100), { x: 0, y: 0, width: 200, height: 100 }, [0, 0, 0, 255]),
    { x: 0, y: 0, width: 100, height: 100 },
    [255, 255, 255, 255],
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
  const menu = menuActions(t.app);
  const pixels = () => g.store.get().history.present.layers.find((l) => l.id === photo.id)!.pixels!;
  return { ...t, g, menu, pixels, photo, shapes };
}

type Setup = Awaited<ReturnType<typeof graphicsMode>>;

async function open(s: Setup, action: keyof ReturnType<typeof menuActions>, name: string) {
  await s.menu[action]();
  await tick();
  return within(screen.getByRole('dialog', { name }));
}

const slide = (d: ReturnType<typeof within>, label: string, value: number) =>
  fireEvent.input(d.getByLabelText(label, { exact: true }), { target: { value: String(value) } });
const type = (d: ReturnType<typeof within>, label: string, value: string) =>
  fireEvent.change(d.getByLabelText(label, { exact: true }), { target: { value } });

/** The stage drawn at 200 % from (100, 50) on the screen. */
function stageOnScreen() {
  const stage = screen.getByRole('application', { name: 'Stage' });
  stage.getBoundingClientRect = () =>
    ({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250 }) as DOMRect;
  return stage;
}
const screenOf = (x: number, y: number) => ({ clientX: 100 + x * 2, clientY: 50 + y * 2 });

describe('M22 GB5: the filter dialogs', () => {
  it('M22 GB5: Filter ▸ Blur ▸ Gaussian Blur… previewed live, then OK: one undo step, the preview gone', async () => {
    const s = await graphicsMode();
    ui.mode = 'Video';
    const d = await open(s, 'filterGaussianBlur', 'Gaussian blur');
    expect(ui.mode).toBe('Graphics');
    expect(d.getByText('19.3 tools/filters to alter parts of an image')).toBeTruthy();
    expect(d.getByRole('button', { name: /Why use this/ })).toBeTruthy();
    await slide(d, 'Radius', 4);
    await expect
      .poll(() => s.g.pixelPreview() && pixelAt(s.g.pixelPreview()!.pixels.bitmap, 99, 50)[0], {
        timeout: 2000,
      })
      .toBeLessThan(250);
    // The document is untouched until OK.
    expect(pixelAt(s.pixels().bitmap, 99, 50)[0]).toBe(255);
    const steps = s.g.store.get().history.past.length;
    await fireEvent.click(d.getByRole('button', { name: 'OK' }));
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(pixelAt(s.pixels().bitmap, 99, 50)[0]).toBeLessThan(250);
    expect(s.g.store.get().history.past.length).toBe(steps + 1);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Gaussian blur');
    expect(s.g.pixelPreview()).toBeUndefined();
    expect(filterUi.spec).toBeNull();
  });

  it('M22 GB5: Cancel and Escape take the preview away and leave the layer as it was', async () => {
    const s = await graphicsMode();
    let d = await open(s, 'filterMotionBlur', 'Motion blur');
    await type(d, 'Distance value', '30');
    await expect.poll(() => s.g.pixelPreview(), { timeout: 2000 }).toBeDefined();
    await fireEvent.click(d.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await expect.poll(() => s.g.pixelPreview()).toBeUndefined();
    d = await open(s, 'filterSharpen', 'Sharpen');
    await slide(d, 'Amount', 200);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await expect.poll(() => s.g.pixelPreview()).toBeUndefined();
    expect(pixelAt(s.pixels().bitmap, 99, 50)[0]).toBe(255);
  });

  it('M22 GB5: a number out of range is refused in words, OK not allowed until it is right', async () => {
    const s = await graphicsMode();
    const d = await open(s, 'filterGaussianBlur', 'Gaussian blur');
    await type(d, 'Radius value', '900');
    expect(d.getByRole('alert').textContent).toMatch(/Radius must be between 0.1 and 250 px/);
    // The typed value was not taken: the filter as it was can still be applied.
    expect((d.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled).toBe(false);
    await type(d, 'Radius value', '2');
    expect(d.queryByRole('alert')).toBeNull();
    expect(filterUi.spec).toMatchObject({ kind: 'gaussian', radius: 2 });
  });

  it('M22 GB5: Twirl: the centre typed, or clicked on the image; its circle drawn on the stage', async () => {
    const s = await graphicsMode();
    const d = await open(s, 'filterTwirl', 'Twirl');
    // It starts in the middle of the layer, as big as fits.
    expect((d.getByLabelText('Centre X') as HTMLInputElement).value).toBe('100');
    expect(filterUi.spec).toMatchObject({ radius: 50, angle: 90 });
    const circle = () =>
      document.querySelector('.filter-handles circle.over') as SVGCircleElement | null;
    expect(circle()!.getAttribute('r')).toBe('50');
    await type(d, 'Centre X', '60');
    expect(filterUi.spec).toMatchObject({ centre: { x: 60, y: 50 } });
    expect(circle()!.getAttribute('cx')).toBe('60');
    stageOnScreen();
    const backdrop = screen.getByRole('presentation');
    await fireEvent.pointerDown(backdrop, screenOf(120, 40));
    expect(filterUi.spec).toMatchObject({ centre: { x: 120, y: 40 } });
    // Held and dragged: the centre follows.
    await fireEvent.pointerMove(window, screenOf(130, 45));
    await fireEvent.pointerUp(window, screenOf(130, 45));
    await fireEvent.pointerMove(window, screenOf(10, 10));
    expect(filterUi.spec).toMatchObject({ centre: { x: 130, y: 45 } });
    await slide(d, 'Angle', 180);
    await fireEvent.click(d.getByRole('button', { name: 'OK' }));
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Twirl');
  });

  it('M22 GB5: Bulge and Zoom blur start on the selected part; a click off the stage’s box does nothing', async () => {
    const s = await graphicsMode();
    s.g.selectRect({ x: 80, y: 20, width: 40, height: 60 }, { antiAlias: false });
    let d = await open(s, 'filterBulge', 'Bulge / pinch');
    expect(filterUi.spec).toMatchObject({ centre: { x: 100, y: 50 }, radius: 20, amount: 50 });
    // No stage box on screen (not laid out): the press is ignored.
    await fireEvent.pointerDown(screen.getByRole('presentation'), { clientX: 5, clientY: 5 });
    expect(filterUi.spec).toMatchObject({ centre: { x: 100, y: 50 } });
    await slide(d, 'Amount', -40);
    // Off the white / black edge (a circle centred on it would leave the straight edge as it is).
    await type(d, 'Centre X', '90');
    await fireEvent.click(d.getByRole('button', { name: 'OK' }));
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Bulge / pinch');
    d = await open(s, 'filterZoomBlur', 'Zoom blur');
    expect(document.querySelector('.filter-handles')!.getAttribute('data-kind')).toBe('zoom');
    await type(d, 'Centre Y', 'x');
    expect(filterUi.spec).toMatchObject({ centre: { x: 100, y: 50 } });
    await fireEvent.click(d.getByRole('button', { name: 'Cancel' }));
  });

  it('M22 GB5: Perspective: corners typed or dragged on the image, Reset; crossed corners refused', async () => {
    const s = await graphicsMode();
    const d = await open(s, 'filterPerspective', 'Perspective');
    expect(document.querySelectorAll('.filter-handles circle.handle')).toHaveLength(4);
    await type(d, 'Top left X', '40');
    expect((filterUi.spec as { corners: readonly unknown[] }).corners[0]).toEqual({ x: 40, y: 0 });
    stageOnScreen();
    const backdrop = screen.getByRole('presentation');
    // Pressed 2 image px from the top right corner (200, 0), dragged 30 px in.
    await fireEvent.pointerDown(backdrop, screenOf(198, 2));
    await fireEvent.pointerMove(window, screenOf(168, 2));
    await fireEvent.pointerUp(window, screenOf(168, 2));
    expect((filterUi.spec as { corners: readonly { x: number }[] }).corners[1]).toEqual({
      x: 170,
      y: 0,
    });
    // Pressed far from any corner: nothing is dragged.
    await fireEvent.pointerDown(backdrop, screenOf(100, 50));
    await fireEvent.pointerMove(window, screenOf(110, 60));
    expect((filterUi.spec as { corners: readonly { x: number }[] }).corners[1]).toEqual({
      x: 170,
      y: 0,
    });
    // Crossed: refused, OK not allowed.
    await type(d, 'Top right X', '0');
    await type(d, 'Top right Y', '100');
    await type(d, 'Bottom left X', '200');
    expect(d.getByRole('alert').textContent).toMatch(/cross/);
    expect((d.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(d.getByRole('button', { name: 'Reset' }));
    expect(d.queryByRole('alert')).toBeNull();
    await type(d, 'Top left X', '50');
    await type(d, 'Top right X', '150');
    await fireEvent.click(d.getByRole('button', { name: 'OK' }));
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    // The top corners pulled in: the top-left pixel is now transparent.
    expect(pixelAt(s.pixels().bitmap, 2, 1)[3]).toBe(0);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Perspective');
  });

  it('M22 GB5: Warp: 16 points on the image, one dragged, then OK', async () => {
    const s = await graphicsMode();
    const d = await open(s, 'filterWarp', 'Warp');
    expect(document.querySelectorAll('.filter-handles circle.handle')).toHaveLength(16);
    expect(document.querySelectorAll('.filter-handles polyline.over')).toHaveLength(8);
    stageOnScreen();
    // Point 5 is at (66.7, 33.3): dragged 20 px right.
    await fireEvent.pointerDown(screen.getByRole('presentation'), screenOf(67, 33));
    await fireEvent.pointerMove(window, screenOf(87, 33));
    await fireEvent.pointerUp(window, screenOf(87, 33));
    const p5 = (filterUi.spec as { points: readonly { x: number; y: number }[] }).points[5]!;
    expect(p5.x).toBeCloseTo(86.7, 1);
    await fireEvent.click(d.getByRole('button', { name: 'OK' }));
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Warp');
    // The white half pulled right: a pixel that was black is white now.
    expect(pixelAt(s.pixels().bitmap, 105, 33)[0]).toBeGreaterThan(200);
  });

  it('M22 GB5: on a vector layer the dialog says to choose a pixel layer', async () => {
    const s = await graphicsMode();
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    const d = await open(s, 'filterBulge', 'Bulge / pinch');
    expect(d.getByRole('alert').textContent).toMatch(/Choose a pixel layer/);
    expect((d.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.pointerDown(screen.getByRole('presentation'), { clientX: 5, clientY: 5 });
    await fireEvent.click(d.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('M22 GB5: the handles a filter has', () => {
  it('M22 GB5: none for a blur or sharpen (nothing to drag), none with no settings', () => {
    const blur = { kind: 'gaussian', radius: 2 } as const;
    expect(handlesOf(null)).toEqual([]);
    expect(handlesOf(blur)).toEqual([]);
    expect(withHandle(blur, 0, { x: 1, y: 1 })).toBe(blur);
  });
});
