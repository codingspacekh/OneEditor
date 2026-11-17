// M19 / GV3 on screen: nodes chosen on the stage (click, Shift-click, a box), dragged together,
// moved by the arrow keys, and the node bar in Properties — X / Y in the image's units, node
// types, segments, align and distribute, Break, Join, Close / Open, Reverse, Delete, Simplify….
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { anchorsOnStage } from '../../../src/core/animation/pen.ts';
import type { PathObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

async function graphicsMode(mode: 'Graphics' | 'Animation' = 'Graphics') {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', { name: mode }),
  );
  const g = mode === 'Graphics' ? t.app.graphics : t.app.animation;
  g.setView({ snap: { grid: false, guides: false, objects: false, pixels: false } });
  const path = () =>
    g.store
      .get()
      .history.present.layers.flatMap((l) => l.objects)
      .at(-1) as PathObject;
  const xy = () => anchorsOnStage(path()).map((a) => [Math.round(a.x), Math.round(a.y)]);
  g.addPath(
    [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
      { x: 300, y: 100 },
    ],
    false,
  );
  await tick();
  const bar = () => within(screen.getByRole('group', { name: 'Nodes' }));
  return {
    ...t,
    g,
    path,
    xy,
    bar,
    stage: () => screen.getByRole('application', { name: 'Stage' }),
  };
}

async function click(target: Element, at: [number, number], init = {}) {
  await fireEvent.pointerDown(target, { clientX: at[0], clientY: at[1], button: 0, ...init });
  await fireEvent.pointerUp(window, { clientX: at[0], clientY: at[1], ...init });
}

async function drag(target: Element, from: [number, number], to: [number, number], init = {}) {
  await fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1], button: 0, ...init });
  await fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1], ...init });
  await fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1], ...init });
}

const chosenOnStage = () =>
  screen
    .getAllByLabelText(/^Point \d+$/)
    .flatMap((p, i) => (p.getAttribute('data-chosen') === 'true' ? [i] : []));

describe('GV3: choosing and moving nodes on the stage', () => {
  it('a click chooses a node, Shift-click another; a drag moves both together', async () => {
    const s = await graphicsMode();
    await click(screen.getByLabelText('Point 1'), [100, 100]);
    expect(chosenOnStage()).toEqual([0]);
    await click(screen.getByLabelText('Point 2'), [200, 200], { shiftKey: true });
    expect(chosenOnStage()).toEqual([0, 1]);
    expect(s.bar().getByText(/2 of 3 nodes chosen/)).toBeTruthy();
    await drag(screen.getByLabelText('Point 2'), [200, 200], [220, 230]);
    expect(s.xy()).toEqual([
      [120, 130],
      [220, 230],
      [300, 100],
    ]);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Move nodes');
  });

  it('a box dragged round nodes chooses them and keeps the path selected; arrows move them', async () => {
    const s = await graphicsMode();
    await drag(s.stage(), [150, 50], [350, 150]);
    expect(s.g.store.get().selection).toEqual([s.path().id]);
    expect(chosenOnStage()).toEqual([2]);
    await drag(s.stage(), [50, 50], [150, 150], { shiftKey: true });
    expect(chosenOnStage()).toEqual([0, 2]);
    await fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
    expect(s.xy()).toEqual([
      [100, 110],
      [200, 200],
      [300, 110],
    ]);
    // A box round no nodes chooses objects as before.
    await drag(s.stage(), [500, 500], [600, 600]);
    expect(s.g.store.get().selection).toEqual([]);
  });
});

describe('GV3: the node bar in Properties', () => {
  it('shows the chosen node’s X / Y and places it where typed', async () => {
    const s = await graphicsMode();
    expect(s.bar().getByText(/Click a node on the stage/)).toBeTruthy();
    expect(s.bar().queryByLabelText('Node X')).toBeNull();
    s.g.chooseNodes([1]);
    await tick();
    const x = s.bar().getByLabelText('Node X') as HTMLInputElement;
    expect(x.value).toBe('200.00');
    await fireEvent.change(x, { target: { value: '250' } });
    expect(s.xy()[1]).toEqual([250, 200]);
    await fireEvent.change(s.bar().getByLabelText('Node Y'), { target: { value: '40' } });
    expect(s.xy()[1]).toEqual([250, 40]);
  });

  it('types its nodes: Smooth, Symmetrical, Cusp (the chosen type pressed)', async () => {
    const s = await graphicsMode();
    const smooth = s.bar().getByRole('button', { name: 'Smooth' });
    expect((smooth as HTMLButtonElement).disabled).toBe(true);
    expect(smooth.title).toMatch(/Why\?/);
    s.g.chooseNodes([1]);
    await tick();
    expect(s.bar().getByRole('button', { name: 'Cusp' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(smooth);
    expect(s.path().points[1]!.type).toBe('smooth');
    expect(smooth.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(s.bar().getByRole('button', { name: 'Symmetrical' }));
    expect(s.path().points[1]!.type).toBe('symmetrical');
    await fireEvent.click(s.bar().getByRole('button', { name: 'Cusp' }));
    expect(s.path().points[1]!.type).toBe('cusp');
  });

  it('To curve and To line; the last node of an open path has no segment after it', async () => {
    const s = await graphicsMode();
    s.g.chooseNodes([2]);
    await tick();
    expect((s.bar().getByRole('button', { name: 'To curve' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    s.g.chooseNodes([0]);
    await tick();
    await fireEvent.click(s.bar().getByRole('button', { name: 'To curve' }));
    expect(s.path().points[0]!.out).toBeDefined();
    await fireEvent.click(s.bar().getByRole('button', { name: 'To line' }));
    expect(s.path().points[0]!.out).toBeUndefined();
  });

  it('lines up and spaces the chosen nodes', async () => {
    const s = await graphicsMode();
    s.g.chooseNodes([0, 1, 2]);
    await tick();
    await fireEvent.click(s.bar().getByLabelText('Line up the chosen nodes along the top'));
    expect(s.xy().map((a) => a[1])).toEqual([100, 100, 100]);
    await fireEvent.click(s.bar().getByLabelText('Space the chosen nodes evenly down'));
    await fireEvent.click(s.bar().getByLabelText('Space the chosen nodes evenly across'));
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Distribute nodes');
  });

  it('Close / Open, Join, Break, Reverse and Delete', async () => {
    const s = await graphicsMode();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Close' }));
    expect(s.path().closed).toBe(true);
    await fireEvent.click(s.bar().getByRole('button', { name: 'Open' }));
    expect(s.path().closed).toBe(false);
    const join = s.bar().getByRole('button', { name: 'Join' }) as HTMLButtonElement;
    expect(join.disabled).toBe(true);
    s.g.chooseNodes([0, 2]);
    await tick();
    await fireEvent.click(join);
    expect(s.path().closed).toBe(true);
    s.g.chooseNodes([1]);
    await tick();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Break' }));
    expect(s.path().closed).toBe(false);
    await fireEvent.click(s.bar().getByRole('button', { name: 'Reverse' }));
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Reverse path');
    // The two ends left chosen by Break go.
    await fireEvent.click(s.bar().getByRole('button', { name: 'Delete' }));
    expect(s.path().points).toHaveLength(2);
  });

  it('Simplify… asks for a tolerance, explains a bad one, and simplifies', async () => {
    const s = await graphicsMode();
    s.g.addPath(
      Array.from({ length: 50 }, (_, i) => ({ x: i * 4, y: 100 + 20 * Math.sin(i / 8) })),
      false,
    );
    await tick();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Simplify…' }));
    const tolerance = s.bar().getByLabelText('Tolerance');
    await fireEvent.change(tolerance, { target: { value: '0' } });
    expect(s.bar().getByRole('alert').textContent).toMatch(/more than 0 px/);
    await fireEvent.change(tolerance, { target: { value: '1' } });
    await fireEvent.click(s.bar().getByRole('button', { name: 'Simplify' }));
    expect(s.path().points.length).toBeLessThan(10);
    expect(s.bar().queryByLabelText('Tolerance')).toBeNull();
    await fireEvent.click(s.bar().getByRole('button', { name: 'Simplify…' }));
    await fireEvent.click(s.bar().getByRole('button', { name: 'Cancel' }));
    expect(s.bar().queryByLabelText('Tolerance')).toBeNull();
  });

  it('shows the X / Y in cm in an image measured in cm', async () => {
    const s = await graphicsMode();
    s.g.setImage({ units: 'cm' });
    s.g.chooseNodes([0]);
    await tick();
    const x = s.bar().getByLabelText('Node X') as HTMLInputElement;
    expect(Number(x.value)).toBeCloseTo((100 / 96) * 2.54, 2);
  });

  it('is there in Animation mode too; not for a shape or with several objects', async () => {
    const s = await graphicsMode('Animation');
    expect(screen.getByRole('group', { name: 'Nodes' })).toBeTruthy();
    s.g.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    await tick();
    expect(screen.queryByRole('group', { name: 'Nodes' })).toBeNull();
  });
});
