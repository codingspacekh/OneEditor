// M19 step 2 on screen (GV1, GV2, G4): the Arc, Spiral and Polyline tools and their keys, the
// Arc and Spiral parts of Properties, Curves and copies (Convert to curves, Step and repeat…,
// Paste in place, Mirror copy), Ctrl/Cmd + D repeating the last move, Ctrl/Cmd + Shift + V, and
// Exclude / Combine / Join beside Union.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import type { AnimObject, PathObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';
import { whyTexts } from '../../helpers/why.ts';

async function open(modeName: 'Graphics' | 'Animation' = 'Graphics') {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: modeName,
    }),
  );
  const g = modeName === 'Graphics' ? t.app.graphics : t.app.animation;
  g.setView({ snap: { grid: false, guides: false, objects: false, pixels: false } });
  const doc = () => g.store.get().history.present;
  const objects = (): AnimObject[] => doc().layers.flatMap((l) => l.objects);
  return {
    ...t,
    g,
    doc,
    objects,
    last: () => objects().at(-1)!,
    stage: () => screen.getByRole('application', { name: 'Stage' }),
    props: () => within(screen.getByRole('complementary', { name: 'Properties' })),
  };
}

async function drag(target: Element, from: [number, number], to: [number, number]) {
  await fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1], button: 0 });
  await fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] });
  await fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] });
}
const key = (k: string, init: Record<string, unknown> = {}) =>
  fireEvent.keyDown(window, { key: k, ...init });

describe('GV1: the new tools on the strip', () => {
  it('shows Arc, Spiral and Polyline, chosen by C, O and Y, with a "Why use this?"', async () => {
    const s = await open();
    const tools = within(screen.getByRole('toolbar', { name: 'Drawing tools' }));
    for (const [name, letter, tool] of [
      ['Arc', 'c', 'arc'],
      ['Spiral', 'o', 'spiral'],
      ['Polyline', 'y', 'polyline'],
    ] as const) {
      expect(tools.getByRole('button', { name }).getAttribute('title')).toMatch(
        /Why\? Arcs, spirals/,
      );
      await key(letter);
      expect(s.g.store.get().tool).toBe(tool);
    }
  });

  it('also in Animation mode', async () => {
    const s = await open('Animation');
    await key('c');
    expect(s.g.store.get().tool).toBe('arc');
    await drag(s.stage(), [100, 100], [300, 300]);
    expect(s.last()).toMatchObject({ kind: 'ellipse', name: 'Arc' });
  });
});

describe('GV1: the arc', () => {
  it('is dragged out and changed in its Arc part of Properties', async () => {
    const s = await open();
    await key('c');
    await drag(s.stage(), [100, 100], [300, 300]);
    expect(s.last()).toMatchObject({ arc: { start: 180, end: 360, close: 'open' } });
    const props = s.props();
    await fireEvent.change(props.getByLabelText('Closed'), { target: { value: 'pie' } });
    expect(s.last()).toMatchObject({ arc: { close: 'pie' } });
    await fireEvent.change(props.getByLabelText('Start'), { target: { value: '90' } });
    expect(s.last()).toMatchObject({ arc: { start: 90, end: 360 } });
    await fireEvent.change(props.getByLabelText('End'), { target: { value: '0' } });
    expect(s.last()).toMatchObject({ arc: { end: 0 } });
    expect(whyTexts(screen.getByRole('complementary', { name: 'Properties' }))).toMatch(
      /part of an ellipse/,
    );
    await fireEvent.click(props.getByRole('button', { name: 'Whole ellipse' }));
    expect((s.last() as { arc?: unknown }).arc).toBeUndefined();
    await fireEvent.click(props.getByRole('button', { name: 'Make an arc' }));
    expect(s.last()).toMatchObject({ arc: { start: 0, end: 270, close: 'pie' } });
  });
});

describe('GV1: the spiral', () => {
  it('draws with the options shown while the tool is chosen, and draws the new one again', async () => {
    const s = await open();
    await key('o');
    await tick();
    const props = s.props();
    expect(props.getByText(/Drag out the next spiral/)).toBeTruthy();
    await fireEvent.change(props.getByLabelText('Turns'), { target: { value: '5' } });
    await drag(s.stage(), [100, 100], [300, 300]);
    expect((s.last() as PathObject).points).toHaveLength(21);
    await tick();
    expect(s.props().getByText(/draws the selected spiral again/)).toBeTruthy();
    await fireEvent.change(s.props().getByLabelText('Grows'), { target: { value: 'opening' } });
    expect(s.g.spiralOptions().growth).toBe('opening');
    await fireEvent.change(s.props().getByLabelText('Inner'), { target: { value: '95' } });
    expect(s.props().getByRole('alert').textContent).toMatch(/0 to 90 %/);
  });
});

describe('GV1: the polyline', () => {
  it('clicks straight lines, Shift in 15° steps, Enter to finish', async () => {
    const s = await open();
    await key('y');
    await fireEvent.pointerDown(s.stage(), { clientX: 100, clientY: 100, button: 0 });
    await fireEvent.pointerMove(s.stage(), { clientX: 200, clientY: 104, shiftKey: true });
    await fireEvent.pointerDown(s.stage(), {
      clientX: 200,
      clientY: 104,
      button: 0,
      shiftKey: true,
    });
    await fireEvent.pointerDown(s.stage(), { clientX: 200, clientY: 200, button: 0 });
    await key('Enter');
    const line = s.last() as PathObject;
    expect(line).toMatchObject({ name: 'Polyline', closed: false, y: 100 });
    expect(line.points[1]!.y).toBeCloseTo(0, 6);
    expect(line.points).toHaveLength(3);
  });

  it('closes on the first point, and a double-click finishes', async () => {
    const s = await open();
    await key('y');
    for (const [x, y] of [
      [0, 0],
      [100, 0],
      [50, 80],
      [1, 1],
    ])
      await fireEvent.pointerDown(s.stage(), { clientX: x, clientY: y, button: 0 });
    expect((s.last() as PathObject).closed).toBe(true);
    await key('y');
    await fireEvent.pointerDown(s.stage(), { clientX: 300, clientY: 300, button: 0 });
    await fireEvent.pointerDown(s.stage(), { clientX: 400, clientY: 300, button: 0 });
    await fireEvent.dblClick(s.stage());
    expect(s.objects()).toHaveLength(2);
    expect(s.g.store.get().tool).toBe('select');
    await key('y');
    await fireEvent.pointerDown(s.stage(), { clientX: 300, clientY: 300, button: 0 });
    await key('Escape');
    await fireEvent.dblClick(s.stage());
    expect(s.objects()).toHaveLength(2);
  });
});

describe('GV2: Curves and copies', () => {
  it('converts the selected shape to curves', async () => {
    const s = await open();
    s.g.addShape('star', { x: 10, y: 10, width: 100, height: 100 });
    await tick();
    await fireEvent.click(s.props().getByRole('button', { name: 'Convert to curves' }));
    expect(s.last().kind).toBe('path');
    s.g.addText({ x: 0, y: 300 }, 'Logo');
    await tick();
    // GT4 (M20): text can be converted too (TextCurvesGT4.test.ts).
    const convert = s.props().getByRole('button', { name: 'Convert to curves' });
    expect((convert as HTMLButtonElement).disabled).toBe(false);
    expect(convert.title).toMatch(/letters’ shapes/);
  });

  it('J/23: Step and repeat… makes 11 spokes turned 30° about the hub', async () => {
    const s = await open();
    s.g.addShape('rect', { x: 295, y: 200, width: 10, height: 100 });
    await tick();
    await fireEvent.click(s.props().getByRole('button', { name: 'Step and repeat…' }));
    const d = within(screen.getByRole('dialog', { name: 'Step and repeat' }));
    await fireEvent.change(d.getByLabelText('Copies'), { target: { value: '11' } });
    expect(d.getByText('12 in all, with the original')).toBeTruthy();
    await fireEvent.change(d.getByLabelText('Turn'), { target: { value: '30' } });
    await fireEvent.change(d.getByLabelText('Turn about'), { target: { value: 'point' } });
    await fireEvent.change(d.getByLabelText('Point X'), { target: { value: '300' } });
    await fireEvent.change(d.getByLabelText('Point Y'), { target: { value: '300' } });
    await fireEvent.click(d.getByRole('button', { name: 'Make copies' }));
    expect(s.objects()).toHaveLength(12);
    expect(screen.queryByRole('dialog', { name: 'Step and repeat' })).toBeNull();
  });

  it('M/26: steps in the image’s units, and says why it cannot', async () => {
    const s = await open();
    await s.g.newImage({
      name: 'Chip',
      size: { width: 10, height: 6, units: 'cm', dpi: 300 },
      background: '#ffffff',
    });
    s.g.addShape('rect', { x: 100, y: 600, width: 30, height: 90 });
    await tick();
    await fireEvent.click(s.props().getByRole('button', { name: 'Step and repeat…' }));
    const d = within(screen.getByRole('dialog', { name: 'Step and repeat' }));
    await fireEvent.click(d.getByRole('button', { name: 'Make copies' }));
    expect(d.getByRole('alert').textContent).toMatch(/sit on the one before/);
    await fireEvent.change(d.getByLabelText('Copies'), { target: { value: '3' } });
    await fireEvent.change(d.getByLabelText('Move across'), { target: { value: '1' } });
    await fireEvent.click(d.getByRole('button', { name: 'Make copies' }));
    // 1 cm at 300 dpi is 118.11 px.
    expect(s.objects().map((o) => Math.round(o.x))).toEqual([100, 218, 336, 454]);
    await fireEvent.click(s.props().getByRole('button', { name: 'Step and repeat…' }));
    await fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Step and repeat' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(s.objects()).toHaveLength(4);
  });

  it('says why a copy cannot be made on a locked layer; in Animation mode, steps in px', async () => {
    const s = await open('Animation');
    s.g.addShape('rect', { x: 10, y: 10, width: 40, height: 20 });
    const id = s.last().id;
    s.g.toggleLayer(s.doc().layers[0]!.id, 'locked');
    s.g.select([id]);
    await tick();
    await fireEvent.click(s.props().getByRole('button', { name: 'Mirror copy left to right' }));
    expect(s.props().getByRole('alert').textContent).toMatch(/locked/);
    await fireEvent.click(s.props().getByRole('button', { name: 'Step and repeat…' }));
    const d = within(screen.getByRole('dialog', { name: 'Step and repeat' }));
    expect(d.getByLabelText('Move across').closest('.field')?.textContent).toMatch(/px/);
    expect(d.getByRole('option', { name: 'The middle of the stage' })).toBeTruthy();
  });

  it('Mirror copy puts a flipped copy beside or below', async () => {
    const s = await open();
    s.g.addShape('rect', { x: 10, y: 10, width: 40, height: 20 });
    await tick();
    await fireEvent.click(s.props().getByRole('button', { name: 'Mirror copy left to right' }));
    expect(s.last()).toMatchObject({ x: 50, flipX: true });
    await tick();
    await fireEvent.click(s.props().getByRole('button', { name: 'Mirror copy top to bottom' }));
    expect(s.last()).toMatchObject({ y: 30, flipY: true });
  });

  it('Paste in place from its button and Ctrl/Cmd + Shift + V; Ctrl/Cmd + D repeats a move', async () => {
    const s = await open();
    s.g.addShape('ellipse', { x: 20, y: 30, width: 40, height: 40 });
    s.g.copy();
    await tick();
    await fireEvent.click(s.props().getByRole('button', { name: 'Paste in place' }));
    expect(s.last()).toMatchObject({ x: 20, y: 30 });
    await key('V', { ctrlKey: true, shiftKey: true });
    expect(s.objects()).toHaveLength(3);
    expect(s.last()).toMatchObject({ x: 20, y: 30 });
    await key('d', { ctrlKey: true });
    s.g.moveSelection(30, -10);
    await key('d', { ctrlKey: true });
    expect(s.last()).toMatchObject({ x: 100, y: 30 });
  });
});

describe('G4: Exclude, Combine and Join beside Union', () => {
  it('offers Exclude and Combine for shapes, Join for two open lines', async () => {
    const s = await open();
    s.g.addShape('rect', { x: 0, y: 0, width: 100, height: 100 });
    s.g.addShape('rect', { x: 50, y: 50, width: 100, height: 100 });
    s.g.select(s.objects().map((o) => o.id));
    await tick();
    const combine = within(s.props().getByRole('group', { name: 'Combine shapes' }));
    expect((combine.getByRole('button', { name: 'Join' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await fireEvent.click(combine.getByRole('button', { name: 'Combine' }));
    expect(s.objects()).toHaveLength(1);
    expect((s.last() as PathObject).holes).toHaveLength(1);
    s.g.undo();
    s.g.select(s.objects().map((o) => o.id));
    await tick();
    await fireEvent.click(
      within(s.props().getByRole('group', { name: 'Combine shapes' })).getByRole('button', {
        name: 'Exclude',
      }),
    );
    expect(s.objects().every((o) => o.kind === 'path')).toBe(true);
  });

  it('joins two lines into one', async () => {
    const s = await open();
    s.g.addLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    s.g.addLine({ x: 100, y: 0 }, { x: 100, y: 100 });
    s.g.select(s.objects().map((o) => o.id));
    await tick();
    const combine = within(s.props().getByRole('group', { name: 'Combine shapes' }));
    await fireEvent.click(combine.getByRole('button', { name: 'Join' }));
    expect(s.objects()).toHaveLength(1);
    expect((s.last() as PathObject).points).toHaveLength(3);
  });
});
