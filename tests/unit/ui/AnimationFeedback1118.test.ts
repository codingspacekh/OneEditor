// Pilot feedback 2026-11-18 on Animation mode:
// 1. the Layers panel lists each layer's objects (front first): click selects, double-click
//    renames, the bin deletes; the list folds away with the layer's arrow.
// 2. the pen: another tool (or Escape, whatever has the focus) ends the path being drawn — the
//    points drawn so far are kept as a path, as Animate's and Illustrator's pens do (Escape throws
//    them away); a click and drag makes a curve point; a segment of the selected path is bent by
//    dragging it.
// 3. a keyframe made by mistake is removed: Delete on the picked dot, the timeline's Remove
//    keyframe button (every property of the selected objects at the playhead) or Shift + F6;
//    an object row's dots take the playhead there.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { anchorsOnStage } from '../../../src/core/animation/pen.ts';
import { trackOf } from '../../../src/core/animation/tween.ts';
import type { AnimObject, PathObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';
import { pickTool } from '../../helpers/tools.ts';

async function mode() {
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Animation',
    }),
  );
  const anim = t.app.animation;
  anim.setView({ snap: { grid: false, guides: false, objects: false, pixels: false } });
  const objects = (): AnimObject[] =>
    anim.store.get().history.present.layers.flatMap((l) => l.objects);
  return {
    anim,
    objects,
    state: () => anim.store.get(),
    stage: () => screen.getByRole('application', { name: 'Stage' }),
    layers: () => within(screen.getByRole('complementary', { name: 'Layers' })),
    timeline: () => within(screen.getByRole('region', { name: 'Timeline' })),
  };
}
const key = (k: string, init: Record<string, unknown> = {}, target: Element | Window = window) =>
  fireEvent.keyDown(target, { key: k, ...init });

describe('objects in the Layers panel', () => {
  it('lists the layer’s objects, front first; a click selects one', async () => {
    const s = await mode();
    s.anim.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    s.anim.addShape('ellipse', { x: 20, y: 0, width: 10, height: 10 });
    s.anim.select([]);
    await tick();
    const list = s.layers().getByRole('list', { name: 'Objects in Layer 1' });
    const rows = within(list).getAllByRole('button', { name: /^Select / });
    expect(rows.map((r) => r.textContent?.trim())).toEqual(['Ellipse', 'Rectangle']);
    await fireEvent.click(rows[1]!);
    expect(s.state().selection).toEqual([s.objects()[0]!.id]);
    // Shift-click adds one more.
    await fireEvent.click(rows[0]!, { shiftKey: true });
    expect(s.state().selection).toHaveLength(2);
    // The layer's arrow folds the list away.
    await fireEvent.click(s.layers().getByRole('button', { name: 'Hide the objects in Layer 1' }));
    expect(s.layers().queryByRole('list', { name: 'Objects in Layer 1' })).toBeNull();
    await fireEvent.click(s.layers().getByRole('button', { name: 'Show the objects in Layer 1' }));
    expect(s.layers().getByRole('list', { name: 'Objects in Layer 1' })).toBeTruthy();
  });

  it('double-click renames an object (Enter keeps it, Escape does not); the bin deletes it', async () => {
    const s = await mode();
    s.anim.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    await tick();
    await fireEvent.dblClick(s.layers().getByRole('button', { name: 'Select Rectangle' }));
    const box = s.layers().getByLabelText('Object name') as HTMLInputElement;
    await fireEvent.change(box, { target: { value: 'Sun' } });
    expect(s.objects()[0]!.name).toBe('Sun');
    expect(s.layers().queryByLabelText('Object name')).toBeNull();
    await fireEvent.dblClick(s.layers().getByRole('button', { name: 'Select Sun' }));
    await key('Escape', {}, s.layers().getByLabelText('Object name'));
    expect(s.layers().queryByLabelText('Object name')).toBeNull();
    expect(s.objects()[0]!.name).toBe('Sun');
    // An empty name is refused, with why.
    await fireEvent.dblClick(s.layers().getByRole('button', { name: 'Select Sun' }));
    await fireEvent.change(s.layers().getByLabelText('Object name'), { target: { value: ' ' } });
    expect(s.objects()[0]!.name).toBe('Sun');
    expect(s.layers().getByRole('alert').textContent).toMatch(/name/i);
    await key('Escape', {}, s.layers().getByLabelText('Object name'));
    await fireEvent.click(s.layers().getByRole('button', { name: 'Delete Sun' }));
    expect(s.objects()).toHaveLength(0);
    expect(s.state().selection).toEqual([]);
  });
});

describe('the pen', () => {
  const click = (s: Awaited<ReturnType<typeof mode>>, x: number, y: number) =>
    fireEvent.pointerDown(s.stage(), { clientX: x, clientY: y, button: 0 });

  it('another tool ends the path being drawn: its points are kept as a path', async () => {
    const s = await mode();
    await pickTool('Pen');
    await click(s, 10, 10);
    await click(s, 110, 10);
    await click(s, 110, 110);
    await pickTool('Rectangle');
    expect(s.objects()).toHaveLength(1);
    expect((s.objects()[0] as PathObject).points).toHaveLength(3);
    expect(document.querySelector('.pen')).toBeNull();
    // One point alone is not a path: it just goes.
    await pickTool('Pen');
    await click(s, 300, 300);
    await pickTool('Rectangle');
    expect(s.objects()).toHaveLength(1);
    expect(document.querySelector('.pen')).toBeNull();
  });

  it('Escape throws the points away even while a tool button has the focus', async () => {
    const s = await mode();
    await pickTool('Pen');
    await click(s, 10, 10);
    await click(s, 110, 10);
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    await key('Escape', {}, button);
    expect(document.querySelector('.pen')).toBeNull();
    await click(s, 200, 200);
    await click(s, 300, 200);
    await key('Enter');
    // Only the two new points: the old ones did not come back.
    expect((s.objects()[0] as PathObject).points).toHaveLength(2);
    button.remove();
  });

  it('a click and drag makes a curve point: its handles follow the pointer', async () => {
    const s = await mode();
    await pickTool('Pen');
    await click(s, 100, 100);
    await fireEvent.pointerMove(window, { clientX: 150, clientY: 60, buttons: 1 });
    await fireEvent.pointerUp(window, { clientX: 150, clientY: 60 });
    await click(s, 300, 100);
    await fireEvent.pointerUp(window, { clientX: 300, clientY: 100 });
    await key('Enter');
    const [a, b] = anchorsOnStage(s.objects()[0] as PathObject);
    expect(a).toMatchObject({ x: 100, y: 100 });
    for (const [h, x, y] of [
      [a!.out, 150, 60],
      [a!.in, 50, 140],
    ] as const) {
      expect(h!.x).toBeCloseTo(x, 6);
      expect(h!.y).toBeCloseTo(y, 6);
    }
    expect(b!.in).toBeUndefined();
  });

  it('a segment of the selected path dragged bends into a curve', async () => {
    const s = await mode();
    s.anim.addPath(
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
      false,
    );
    await tick();
    const segment = s.stage().querySelector('[aria-label="Segment 1"]')!;
    expect(segment).toBeTruthy();
    await fireEvent.pointerDown(segment, { clientX: 100, clientY: 100, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 100, clientY: 60, buttons: 1 });
    await fireEvent.pointerUp(window, { clientX: 100, clientY: 60 });
    const [a, b] = anchorsOnStage(s.objects()[0] as PathObject);
    expect(a!.out).toBeDefined();
    expect(b!.in).toBeDefined();
    expect([a!.x, a!.y, b!.x, b!.y]).toEqual([0, 100, 200, 100]);
    expect(s.state().history.past.at(-1)?.label).toBe('Bend segment');
  });
});

describe('removing a keyframe', () => {
  async function keyed() {
    const s = await mode();
    s.anim.addShape('ellipse', { x: 0, y: 0, width: 20, height: 20 });
    s.anim.setFrame(72);
    s.anim.setProperties({ x: 396 });
    await tick();
    return { ...s, x: () => trackOf(s.objects()[0]!, 'x')! };
  }

  it('Delete on the picked dot removes that keyframe, not the object', async () => {
    const s = await keyed();
    const dot = s.timeline().getByRole('button', { name: 'X keyframe at frame 72' });
    await fireEvent.click(dot);
    await key('Delete', {}, dot);
    expect(s.objects()).toHaveLength(1);
    expect(s.x().keyframes.map((k) => k.frame)).toEqual([0]);
  });

  it('Remove keyframe removes every property’s keyframe of the selection at the playhead', async () => {
    const s = await keyed();
    s.anim.setProperties({ opacity: 40 });
    await tick();
    const remove = s.timeline().getByRole('button', { name: 'Remove keyframes at the playhead' });
    expect((remove as HTMLButtonElement).disabled).toBe(false);
    await fireEvent.click(remove);
    expect(s.x().keyframes.map((k) => k.frame)).toEqual([0]);
    expect(trackOf(s.objects()[0]!, 'opacity')?.keyframes.map((k) => k.frame)).toEqual([0]);
    // None left at the playhead: the button is off.
    expect((remove as HTMLButtonElement).disabled).toBe(true);
  });

  it('Shift + F6 does the same, and Keyframe pressed by mistake is undone by it', async () => {
    const s = await mode();
    s.anim.addShape('rect', { x: 0, y: 0, width: 20, height: 20 });
    s.anim.setFrame(30);
    await tick();
    await fireEvent.click(s.timeline().getByRole('button', { name: 'Insert keyframe' }));
    expect(s.objects()[0]!.tracks?.length).toBeGreaterThan(0);
    await key('F6', { shiftKey: true });
    expect(s.objects()[0]!.tracks).toBeUndefined();
  });

  it('a dot on the object’s row selects it and takes the playhead to that frame', async () => {
    const s = await keyed();
    s.anim.select([]);
    s.anim.setFrame(0);
    await tick();
    await fireEvent.click(
      s.timeline().getByRole('button', { name: 'Keyframes of Ellipse at frame 72' }),
    );
    expect(s.state().frame).toBe(72);
    expect(s.state().selection).toEqual([s.objects()[0]!.id]);
  });
});
