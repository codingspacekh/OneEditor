// Pilot request 2026-11-18 (AN11), in Properties: a path's Direction (clockwise or anticlockwise
// round a closed shape, start to end or end to start along an open path) and Times round; and
// Moves with, listing the other objects on the stage but not one that would make a loop.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { findObject } from '../../../src/core/animation/layers.ts';
import { testApp } from '../../helpers/test-app.ts';

async function mode() {
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Animation',
    }),
  );
  const anim = t.app.animation;
  const doc = () => anim.store.get().history.present;
  const add = async (kind: 'ellipse' | 'rect', x: number, name: string) => {
    anim.addShape(kind, { x, y: 100, width: 40, height: 40 });
    const o = doc().layers[0]!.objects.at(-1)!;
    anim.select([o.id]);
    anim.setProperties({ name });
    await tick();
    return o.id;
  };
  const props = () => within(screen.getByRole('complementary', { name: 'Properties' }));
  return { anim, doc, add, props, object: (id: string) => findObject(doc(), id)!.object };
}

describe('a path’s direction and times round', () => {
  it('round a closed shape: clockwise or anticlockwise; Times round is typed', async () => {
    const s = await mode();
    const orbit = await s.add('ellipse', 300, 'Orbit');
    const earth = await s.add('ellipse', 0, 'Earth');
    s.anim.followPath(earth, orbit);
    await tick();
    const direction = s.props().getByLabelText('Path 1 direction') as HTMLSelectElement;
    const labels = [...direction.options].map((o) => o.textContent?.trim());
    expect(labels.sort()).toEqual(['Anticlockwise', 'Clockwise']);
    const other = [...direction.options].find((o) => o.value !== direction.value)!;
    await fireEvent.change(direction, { target: { value: other.value } });
    expect(s.object(earth).paths![0]!.reverse).toBe(other.value === 'reverse');
    await fireEvent.change(s.props().getByLabelText('Times round', { exact: true }), {
      target: { value: '4' },
    });
    expect(s.object(earth).paths![0]!.laps).toBe(4);
  });

  it('along an open path: start to end, or end to start', async () => {
    const s = await mode();
    s.anim.addPath(
      [
        { x: 0, y: 300 },
        { x: 400, y: 300 },
      ],
      false,
    );
    const road = s.doc().layers[0]!.objects.at(-1)!.id;
    const car = await s.add('rect', 0, 'Car');
    s.anim.followPath(car, road);
    await tick();
    const direction = s.props().getByLabelText('Path 1 direction') as HTMLSelectElement;
    expect([...direction.options].map((o) => o.textContent?.trim())).toEqual([
      'Start to end',
      'End to start',
    ]);
    await fireEvent.change(direction, { target: { value: 'reverse' } });
    expect(s.object(car).paths![0]!.reverse).toBe(true);
  });
});

describe('Follow path is a pick', () => {
  it('shows its first choice again after a path is picked', async () => {
    const s = await mode();
    const orbit = await s.add('ellipse', 300, 'Orbit');
    const earth = await s.add('ellipse', 0, 'Earth');
    await fireEvent.change(s.props().getByLabelText('Follow path'), { target: { value: orbit } });
    expect(s.object(earth).paths).toHaveLength(1);
    const moon = await s.add('ellipse', 400, 'Moon');
    expect(s.object(moon).paths).toBeUndefined();
    expect((s.props().getByLabelText('Follow path') as HTMLSelectElement).value).toBe('');
  });
});

describe('Moves with', () => {
  it('links the Moon to the Earth and back; the Sun cannot move with the Moon', async () => {
    const s = await mode();
    const sun = await s.add('ellipse', 100, 'Sun');
    const earth = await s.add('ellipse', 300, 'Earth');
    const moon = await s.add('ellipse', 400, 'Moon');
    const pick = () => s.props().getByLabelText('Moves with') as HTMLSelectElement;
    expect([...pick().options].map((o) => o.textContent?.trim())).toEqual([
      'Nothing (on its own)',
      'Sun',
      'Earth',
    ]);
    await fireEvent.change(pick(), { target: { value: earth } });
    expect(s.object(moon).link?.to).toBe(earth);
    s.anim.select([earth]);
    await tick();
    await fireEvent.change(pick(), { target: { value: sun } });
    s.anim.select([sun]);
    await tick();
    // The Earth and the Moon already move with the Sun: neither is offered.
    expect([...pick().options].map((o) => o.textContent?.trim())).toEqual(['Nothing (on its own)']);
    s.anim.select([moon]);
    await tick();
    expect(pick().value).toBe(earth);
    await fireEvent.change(pick(), { target: { value: '' } });
    expect(s.object(moon).link).toBeUndefined();
  });
});
