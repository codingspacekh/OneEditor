// GV4, G3 (M19): Envelope in Properties (Graphics and Animation modes) — a preset with its bend
// typed in %, Perspective and Custom, Apply and Remove — and on the stage the corners and side
// handles to drag, shown instead of the box's handles. Gate: M/17 the flared rectangle.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import type { AnimObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

async function mode(name: 'Graphics' | 'Animation' = 'Graphics') {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', { name }),
  );
  const g = name === 'Graphics' ? t.app.graphics : t.app.animation;
  g.setView({ snap: { grid: false, guides: false, objects: false, pixels: false } });
  const objects = (): AnimObject[] =>
    g.store.get().history.present.layers.flatMap((l) => l.objects);
  return { ...t, g, objects };
}

const bendInto = async (value: string) =>
  fireEvent.change(screen.getByLabelText('Bend into'), { target: { value } });

async function drag(target: Element, from: [number, number], to: [number, number]) {
  await fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1], button: 0 });
  await fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] });
  await fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] });
}

describe('GV4 the Envelope section', () => {
  it('bends by a preset, its bend typed in %, and Apply makes a plain path', async () => {
    const s = await mode();
    s.g.addShape('rect', { x: 100, y: 100, width: 200, height: 100 });
    await tick();
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    await bendInto('arch');
    expect(s.objects()[0]!.envelope).toEqual({ kind: 'preset', preset: 'arch', bend: 50 });
    await fireEvent.change(screen.getByLabelText('Bend'), { target: { value: '-30' } });
    expect(s.objects()[0]!.envelope).toEqual({ kind: 'preset', preset: 'arch', bend: -30 });
    await fireEvent.change(screen.getByLabelText('Bend'), { target: { value: '150' } });
    expect(screen.getByRole('alert').textContent).toBe(
      'The bend must be between −100 % and 100 %.',
    );
    // Another preset keeps the bend.
    await bendInto('wave');
    expect(s.objects()[0]!.envelope).toEqual({ kind: 'preset', preset: 'wave', bend: -30 });
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(s.objects()[0]).toMatchObject({ kind: 'path' });
    expect(s.objects()[0]!.envelope).toBeUndefined();
    expect((screen.getByLabelText('Bend into') as HTMLSelectElement).value).toBe('none');
  });

  it('Remove takes the bend off; None does too', async () => {
    const s = await mode('Animation');
    s.g.addShape('ellipse', { x: 50, y: 50, width: 100, height: 100 });
    await tick();
    await bendInto('bulge');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(s.objects()[0]!.envelope).toBeUndefined();
    await bendInto('squeeze');
    await bendInto('none');
    expect(s.objects()[0]!.envelope).toBeUndefined();
  });

  it('GT5 (M20): is shown for text, and bends a group of a shape and text as one', async () => {
    const s = await mode();
    s.g.addText({ x: 10, y: 10 }, 'Roller');
    await tick();
    expect(screen.getByLabelText('Bend into')).toBeTruthy();
    s.g.addShape('rect', { x: 100, y: 100, width: 50, height: 50 });
    s.g.select(s.objects().map((o) => o.id));
    s.g.group();
    await tick();
    await bendInto('arch');
    expect(s.objects()[0]).toMatchObject({ kind: 'group', envelope: { preset: 'arch' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('G3 perspective and a custom envelope on the stage', () => {
  it('M/17 drags a corner in to flare the rectangle, live, one undo step', async () => {
    const s = await mode();
    s.g.addShape('rect', { x: 100, y: 100, width: 200, height: 100 });
    await tick();
    await bendInto('perspective');
    await tick();
    expect(screen.getByText(/Drag the four corners on the canvas/)).toBeTruthy();
    // The corners replace the box's handles.
    expect(screen.queryByLabelText('Rotate')).toBeNull();
    const corners = () => {
      const e = s.objects()[0]!.envelope;
      return e?.kind === 'perspective' ? e.corners : [];
    };
    const corner0 = () => corners()[0];
    const corner = screen.getByLabelText('Envelope corner, top left');
    await fireEvent.pointerDown(corner, { clientX: 100, clientY: 100, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 160, clientY: 100 });
    await tick();
    // While dragging the corner follows (the document is not changed yet).
    expect(screen.getByLabelText('Envelope corner, top left').getAttribute('x')).toBe('156');
    expect(corner0()).toEqual({ x: 0, y: 0 });
    await fireEvent.pointerUp(window, { clientX: 160, clientY: 100 });
    expect(s.objects()[0]!.envelope).toMatchObject({
      kind: 'perspective',
      corners: [
        { x: 0.3, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    });
    await drag(screen.getByLabelText('Envelope corner, top right'), [300, 100], [240, 100]);
    expect(corners().slice(0, 2)).toEqual([
      { x: 0.3, y: 0 },
      { x: 0.7, y: 0 },
    ]);
    s.g.undo();
    expect(corners()[1]).toEqual({ x: 1, y: 0 });
  });

  it('a custom envelope shows the sides’ handles; dragging one bends that side', async () => {
    const s = await mode();
    s.g.addShape('rect', { x: 100, y: 100, width: 300, height: 100 });
    await tick();
    await bendInto('custom');
    await tick();
    expect(screen.getAllByLabelText(/^Envelope (corner|handle)/)).toHaveLength(12);
    const handle = screen.getByLabelText('Envelope handle, top side, first');
    await drag(handle, [200, 100], [200, 40]);
    const e = s.objects()[0]!.envelope;
    expect(e?.kind).toBe('custom');
    if (e?.kind !== 'custom') return;
    expect(e.sides.top.c1).toEqual({ x: 0.3333, y: -0.6 });
    // A click without a move changes nothing.
    await fireEvent.pointerDown(screen.getByLabelText('Envelope corner, bottom left'), {
      clientX: 100,
      clientY: 200,
    });
    await fireEvent.pointerUp(window, { clientX: 100, clientY: 200 });
    expect(s.objects()[0]!.envelope).toBe(e);
  });
});
