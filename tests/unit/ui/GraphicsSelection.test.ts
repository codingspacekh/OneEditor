// M21 step 3 on screen (GB2, G8, G13): the selection tools on the strip (M, W), dragged and
// clicked on the canvas with Shift / Alt to add, subtract and intersect; the polygonal lasso's
// clicks, Enter, Backspace and Escape; the outline drawn as marching ants; the option bar above
// the canvas (mode, feather, tolerance, contiguous, fuzziness, the commands); and the keys:
// Delete, Ctrl/Cmd + D, J, Shift + J, Shift + I.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { createHistory } from '../../../src/app/history.ts';
import { createLayer, createRect } from '../../../src/core/animation/factory.ts';
import {
  contentBounds,
  createBitmap,
  fillRect,
  pixelAt,
} from '../../../src/core/graphics/pixels/raster.ts';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { selUi } from '../../../src/ui/graphics/selection-ui.svelte.ts';
import { cancelPolygonLasso } from '../../../src/ui/graphics/selection-tools.ts';
import { testApp } from '../../helpers/test-app.ts';

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
  // A white 200 × 100 photo at (0, 0) with a red 40 × 40 square at (100, 30); a vector square.
  let bitmap = fillRect(
    createBitmap(200, 100),
    { x: 0, y: 0, width: 200, height: 100 },
    [255, 255, 255, 255],
  );
  bitmap = fillRect(bitmap, { x: 100, y: 30, width: 40, height: 40 }, [255, 0, 0, 255]);
  const photo = createLayer('Photo', { pixels: { bitmap, x: 0, y: 0 } });
  const shapes = createLayer('Shapes', {
    objects: [createRect({ x: 300, y: 300, width: 50, height: 50 })],
  });
  g.store.update((s) => ({
    ...s,
    history: createHistory({ ...s.history.present, layers: [photo, shapes] }),
    layerId: photo.id,
  }));
  g.setZoom(1);
  await tick();
  const bounds = () => {
    const m = g.pixelSelection();
    return m ? contentBounds(m) : null;
  };
  return {
    ...t,
    g,
    photo,
    shapes,
    bounds,
    pixels: () => g.store.get().history.present.layers.find((l) => l.id === photo.id)!.pixels!,
    stage: () => screen.getByRole('application', { name: 'Stage' }),
    bar: () => within(screen.getByRole('toolbar', { name: 'Selection options' })),
  };
}

type Mods = { shiftKey?: boolean; altKey?: boolean };
async function drag(target: Element, path: [number, number][], mods: Mods = {}) {
  const [first, ...rest] = path;
  await fireEvent.pointerDown(target, {
    clientX: first![0],
    clientY: first![1],
    button: 0,
    ...mods,
  });
  for (const [x, y] of rest)
    await fireEvent.pointerMove(window, { clientX: x, clientY: y, ...mods });
  const last = path.at(-1)!;
  await fireEvent.pointerUp(window, { clientX: last[0], clientY: last[1], ...mods });
}
const click = (target: Element, x: number, y: number, mods: Mods = {}) =>
  drag(target, [[x, y]], mods);
const key = (k: string, init: Record<string, unknown> = {}) =>
  fireEvent.keyDown(window, { key: k, ...init });

afterEach(() => {
  cancelPolygonLasso();
  Object.assign(selUi, {
    mode: 'new',
    feather: 0,
    antiAlias: true,
    tolerance: 32,
    contiguous: true,
    fuzziness: 40,
    amount: 5,
    fade: 50,
    allLayers: false,
  });
});

describe('M21 GB2: the selection tools on the strip', () => {
  it('shows the seven tools in Graphics mode; M and W choose the marquee and the wand', async () => {
    const s = await open();
    const tools = within(screen.getByRole('toolbar', { name: 'Drawing tools' }));
    for (const name of [
      'Rectangle select',
      'Ellipse select',
      'Lasso',
      'Polygonal lasso',
      'Magnetic lasso',
      'Magic wand',
      'Colour select',
    ])
      expect(tools.getByRole('button', { name })).toBeTruthy();
    await key('m');
    expect(s.g.store.get().tool).toBe('select-rect');
    await key('w');
    expect(s.g.store.get().tool).toBe('magic-wand');
    await fireEvent.click(tools.getByRole('button', { name: 'Lasso' }));
    expect(s.g.store.get().tool).toBe('lasso');
    // The option bar shows while a selection tool is chosen.
    expect(screen.getByRole('toolbar', { name: 'Selection options' })).toBeTruthy();
  });
});

describe('M21 GB2: drawing selections', () => {
  it('drags a rectangle, outlined by marching ants; Shift adds, Alt subtracts, both intersect', async () => {
    const s = await open();
    s.g.setTool('select-rect');
    await drag(s.stage(), [
      [10, 10],
      [60, 40],
    ]);
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 50, height: 30 });
    await tick();
    const ants = document.querySelector('.selection-outline');
    expect(ants?.getAttribute('data-runs')).toBe('4');
    await drag(
      s.stage(),
      [
        [60, 10],
        [100, 40],
      ],
      { shiftKey: true },
    );
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 90, height: 30 });
    await drag(
      s.stage(),
      [
        [10, 10],
        [50, 40],
      ],
      { altKey: true },
    );
    expect(s.bounds()).toEqual({ x: 50, y: 10, width: 50, height: 30 });
    await drag(
      s.stage(),
      [
        [0, 0],
        [70, 20],
      ],
      { shiftKey: true, altKey: true },
    );
    expect(s.bounds()).toEqual({ x: 50, y: 10, width: 20, height: 10 });
    // A click without a drag deselects.
    await click(s.stage(), 5, 5);
    expect(s.bounds()).toBeNull();
    await tick();
    expect(document.querySelector('.selection-outline')).toBeNull();
  });

  it('shows the box while it is dragged, and Shift makes an ellipse a circle', async () => {
    const s = await open();
    s.g.setTool('select-ellipse');
    await fireEvent.pointerDown(s.stage(), { clientX: 0, clientY: 0, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 80, clientY: 40, shiftKey: true });
    expect(document.querySelector('.selection-draft')).not.toBeNull();
    await fireEvent.pointerUp(window, { clientX: 80, clientY: 40 });
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 80, height: 80 });
    await tick();
    expect(document.querySelector('.selection-draft')).toBeNull();
  });

  it('Shift held from the start adds; let go and pressed again, it makes a square', async () => {
    const s = await open();
    s.g.setTool('select-rect');
    await fireEvent.pointerDown(s.stage(), { clientX: 0, clientY: 0, button: 0, shiftKey: true });
    await fireEvent.pointerMove(window, { clientX: 80, clientY: 40, shiftKey: true });
    await fireEvent.pointerMove(window, { clientX: 80, clientY: 40 });
    await fireEvent.pointerMove(window, { clientX: 80, clientY: 40, shiftKey: true });
    await fireEvent.pointerUp(window, { clientX: 80, clientY: 40, shiftKey: true });
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 80, height: 80 });
  });

  it('the option bar’s mode and feather are used when no key is held', async () => {
    const s = await open();
    s.g.setTool('select-rect');
    await drag(s.stage(), [
      [0, 0],
      [100, 100],
    ]);
    await fireEvent.click(s.bar().getByRole('button', { name: 'Subtract' }));
    expect(selUi.mode).toBe('subtract');
    await drag(s.stage(), [
      [50, 0],
      [100, 100],
    ]);
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 50, height: 100 });
    await fireEvent.click(s.bar().getByRole('button', { name: 'New' }));
    await fireEvent.change(s.bar().getByLabelText(/Feather/), { target: { value: '4' } });
    expect(selUi.feather).toBe(4);
    await fireEvent.click(s.bar().getByLabelText(/Anti-alias/));
    expect(selUi.antiAlias).toBe(false);
    await drag(s.stage(), [
      [20, 20],
      [60, 60],
    ]);
    expect(pixelAt(s.g.pixelSelection()!, 20, 40)).toBeLessThan(255);
  });

  it('lasso: dragged round; a click alone deselects', async () => {
    const s = await open();
    s.g.setTool('lasso');
    await drag(s.stage(), [
      [10, 10],
      [50, 10],
      [50, 50],
      [10, 50],
    ]);
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 40, height: 40 });
    await click(s.stage(), 5, 5);
    expect(s.bounds()).toBeNull();
  });

  it('polygonal lasso: clicked corners, Backspace, Enter; the first point closes; Escape stops', async () => {
    const s = await open();
    s.g.setTool('polygon-lasso');
    await click(s.stage(), 10, 10);
    await fireEvent.pointerMove(window, { clientX: 30, clientY: 30 });
    expect(document.querySelector('.selection-draft')).not.toBeNull();
    await click(s.stage(), 90, 10);
    await click(s.stage(), 150, 150);
    await key('Backspace');
    await click(s.stage(), 90, 60);
    await click(s.stage(), 10, 60);
    await key('Enter');
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 80, height: 50 });
    // Backspace took a point back, not a layer's objects.
    expect(s.g.store.get().history.present.layers[1]!.objects).toHaveLength(1);
    // A click near the first point closes it.
    await click(s.stage(), 200, 200, { shiftKey: true });
    await new Promise((r) => setTimeout(r, 450));
    await click(s.stage(), 260, 200);
    await new Promise((r) => setTimeout(r, 450));
    await click(s.stage(), 260, 260);
    await new Promise((r) => setTimeout(r, 450));
    await click(s.stage(), 201, 201);
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 250, height: 250 });
    // Escape stops one part drawn.
    s.g.deselectPixels();
    await click(s.stage(), 10, 10);
    await click(s.stage(), 50, 10);
    await key('Escape');
    await click(s.stage(), 50, 50);
    expect(s.bounds()).toBeNull();
    expect(s.g.store.get().tool).toBe('polygon-lasso');
  });

  it('polygonal lasso: a double-click closes it; choosing another tool stops it', async () => {
    const s = await open();
    s.g.setTool('polygon-lasso');
    await click(s.stage(), 10, 10);
    await new Promise((r) => setTimeout(r, 450));
    await click(s.stage(), 60, 10);
    await new Promise((r) => setTimeout(r, 450));
    await click(s.stage(), 60, 60);
    await click(s.stage(), 60, 60);
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 50, height: 50 });
    await click(s.stage(), 100, 100);
    s.g.setTool('lasso');
    await tick();
    expect(document.querySelector('.selection-draft')).toBeNull();
  });

  it('magnetic lasso: dragged along the red square’s edge, it snaps to it', async () => {
    const s = await open();
    s.g.setTool('magnetic-lasso');
    await drag(s.stage(), [
      [98, 32],
      [98, 50],
      [98, 68],
      [120, 75],
      [142, 68],
      [142, 32],
    ]);
    const b = s.bounds()!;
    expect(b.x).toBeGreaterThanOrEqual(97);
    expect(b.x).toBeLessThanOrEqual(100);
    // A click alone deselects.
    await click(s.stage(), 5, 5);
    expect(s.bounds()).toBeNull();
  });

  it('with All layers on, the wand and colour select look at the picture as drawn, vector layers too (M23)', async () => {
    const s = await open();
    // The renderer stands in for the canvas: the photo's red square and the vector square, blue.
    s.stageRenderer.renderPixels.mockImplementation(async (doc) => {
      const { width, height } = doc.stage;
      const data = new Uint8ClampedArray(width * height * 4);
      const paint = (r: { x: number; y: number; width: number; height: number }, c: number[]) => {
        for (let y = r.y; y < r.y + r.height; y++)
          for (let x = r.x; x < r.x + r.width; x++) data.set(c, (y * width + x) * 4);
      };
      paint({ x: 0, y: 0, width: 200, height: 100 }, [255, 255, 255, 255]);
      paint({ x: 100, y: 30, width: 40, height: 40 }, [255, 0, 0, 255]);
      paint({ x: 300, y: 300, width: 50, height: 50 }, [0, 0, 255, 255]);
      return { width, height, data };
    });
    selUi.allLayers = true;
    s.g.setTool('magic-wand');
    await click(s.stage(), 110, 40);
    await s.g.pixelWork();
    expect(s.bounds()).toEqual({ x: 100, y: 30, width: 40, height: 40 });
    await click(s.stage(), 310, 310);
    await s.g.pixelWork();
    expect(s.bounds()).toEqual({ x: 300, y: 300, width: 50, height: 50 });
    s.g.setTool('colour-select');
    await click(s.stage(), 110, 40);
    await s.g.pixelWork();
    expect(s.bounds()).toEqual({ x: 100, y: 30, width: 40, height: 40 });
    // Drawn once for the picture as it is.
    expect(s.stageRenderer.renderPixels).toHaveBeenCalledTimes(1);
  });

  it('other keys pass by a polygonal lasso being drawn; an emptied field is the lowest value', async () => {
    const s = await open();
    s.g.setTool('polygon-lasso');
    await click(s.stage(), 10, 10);
    await key('m');
    expect(s.g.store.get().tool).toBe('select-rect');
    await tick();
    await fireEvent.change(s.bar().getByLabelText(/Feather/), { target: { value: '' } });
    expect(selUi.feather).toBe(0);
  });

  it('magic wand: tolerance and contiguous in the bar; colour select with fuzziness', async () => {
    const s = await open();
    s.g.setTool('magic-wand');
    await tick();
    await fireEvent.change(s.bar().getByLabelText(/Tolerance/), { target: { value: '300' } });
    expect(selUi.tolerance).toBe(255);
    await fireEvent.change(s.bar().getByLabelText(/Tolerance/), { target: { value: '10' } });
    await click(s.stage(), 110, 40);
    expect(s.bounds()).toEqual({ x: 100, y: 30, width: 40, height: 40 });
    await fireEvent.click(s.bar().getByLabelText(/Contiguous/));
    expect(selUi.contiguous).toBe(false);
    await click(s.stage(), 5, 5);
    expect(pixelAt(s.g.pixelSelection()!, 110, 40)).toBe(0);
    s.g.setTool('colour-select');
    await tick();
    await fireEvent.change(s.bar().getByLabelText(/Fuzziness/), { target: { value: '20' } });
    expect(selUi.fuzziness).toBe(20);
    await click(s.stage(), 110, 40);
    expect(s.bounds()).toEqual({ x: 100, y: 30, width: 40, height: 40 });
  });
});

describe('M21 GB2, G8, G13: the commands in the option bar', () => {
  it('All, None, Invert, Layer pixels and From shape', async () => {
    const s = await open();
    s.g.setTool('select-rect');
    await tick();
    const bar = s.bar();
    await fireEvent.click(bar.getByRole('button', { name: 'All' }));
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    await fireEvent.click(s.bar().getByRole('button', { name: 'None' }));
    expect(s.bounds()).toBeNull();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Layer pixels' }));
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    await fireEvent.click(s.bar().getByRole('button', { name: 'Invert' }));
    expect(pixelAt(s.g.pixelSelection()!, 10, 10)).toBe(0);
    await fireEvent.click(s.bar().getByRole('button', { name: 'From shape' }));
    expect(s.g.store.get().message?.text).toMatch(/Select the shapes or text/);
    s.g.select([s.shapes.objects[0]!.id]);
    await fireEvent.click(s.bar().getByRole('button', { name: 'From shape' }));
    expect(s.bounds()).toEqual({ x: 300, y: 300, width: 50, height: 50 });
  });

  it('Feather, Grow, Shrink and Smooth by the px given', async () => {
    const s = await open();
    s.g.selectRect({ x: 100, y: 100, width: 50, height: 50 });
    await tick();
    const bar = s.bar();
    await fireEvent.change(bar.getByLabelText(/By/), { target: { value: '5' } });
    await fireEvent.click(bar.getByRole('button', { name: 'Grow' }));
    expect(s.bounds()).toEqual({ x: 95, y: 95, width: 60, height: 60 });
    await fireEvent.click(bar.getByRole('button', { name: 'Shrink' }));
    expect(s.bounds()).toEqual({ x: 100, y: 100, width: 50, height: 50 });
    await fireEvent.click(bar.getByRole('button', { name: 'Smooth' }));
    expect(pixelAt(s.g.pixelSelection()!, 100, 100)).toBe(0);
    await fireEvent.click(bar.getByRole('button', { name: 'Feather' }));
    expect(pixelAt(s.g.pixelSelection()!, 100, 125)).toBeLessThan(255);
  });

  it('Copy to layer, Cut to layer, Delete, Fade, Layer mask and Crop', async () => {
    const s = await open();
    s.g.selectRect({ x: 100, y: 30, width: 40, height: 40 });
    await tick();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Copy to layer' }));
    expect(s.g.store.get().history.present.layers).toHaveLength(3);
    s.g.store.update((st) => ({ ...st, layerId: s.photo.id }));
    s.g.selectRect({ x: 100, y: 30, width: 40, height: 40 });
    await tick();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Cut to layer' }));
    expect(pixelAt(s.pixels().bitmap, 110, 40)[3]).toBe(0);
    s.g.store.update((st) => ({ ...st, layerId: s.photo.id }));
    s.g.selectRect({ x: 0, y: 0, width: 10, height: 10 });
    await tick();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Delete' }));
    expect(pixelAt(s.pixels().bitmap, 5, 5)[3]).toBe(0);
    s.g.selectRect({ x: 10, y: 0, width: 10, height: 10 });
    await tick();
    await fireEvent.change(s.bar().getByLabelText('Fade to %'), { target: { value: '40' } });
    await fireEvent.click(s.bar().getByRole('button', { name: 'Fade' }));
    expect(pixelAt(s.pixels().bitmap, 15, 5)[3]).toBe(102);
    await fireEvent.click(s.bar().getByRole('button', { name: 'Layer mask' }));
    expect(s.pixels().mask).toBeDefined();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Crop' }));
    expect(s.g.store.get().history.present.stage).toMatchObject({ width: 16, height: 16 });
    // Nothing selected after the crop: the bar goes with the tool not a selection tool.
    await tick();
    expect(screen.queryByRole('toolbar', { name: 'Selection options' })).toBeNull();
  });
});

describe('M21 GB2: the keys', () => {
  it('Delete deletes the selected pixels on a pixel layer, else the selected objects', async () => {
    const s = await open();
    s.g.selectRect({ x: 0, y: 0, width: 10, height: 10 });
    await key('Delete');
    expect(pixelAt(s.pixels().bitmap, 5, 5)[3]).toBe(0);
    s.g.deselectPixels();
    s.g.select([s.shapes.objects[0]!.id]);
    await key('Delete');
    expect(s.g.store.get().history.present.layers[1]!.objects).toHaveLength(0);
  });

  it('Ctrl/Cmd + J copies, + Shift + J cuts, + Shift + I inverts, + D deselects', async () => {
    const s = await open();
    s.g.selectRect({ x: 100, y: 30, width: 40, height: 40 });
    await key('j', { ctrlKey: true });
    expect(s.g.store.get().history.present.layers).toHaveLength(3);
    s.g.store.update((st) => ({ ...st, layerId: s.photo.id }));
    s.g.selectRect({ x: 100, y: 30, width: 40, height: 40 });
    await key('J', { ctrlKey: true, shiftKey: true });
    expect(s.g.store.get().history.present.layers).toHaveLength(4);
    expect(pixelAt(s.pixels().bitmap, 110, 40)[3]).toBe(0);
    s.g.store.update((st) => ({ ...st, layerId: s.photo.id }));
    s.g.selectRect({ x: 0, y: 0, width: 640, height: 720 });
    await key('I', { metaKey: true, shiftKey: true });
    expect(s.bounds()).toEqual({ x: 640, y: 0, width: 640, height: 720 });
    await key('d', { ctrlKey: true });
    expect(s.bounds()).toBeNull();
  });
});
