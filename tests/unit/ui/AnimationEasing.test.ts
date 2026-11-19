// 2026-11-18 (AN9): the new eases in the keyframe bar, and the custom curve's editor: its two
// handles dragged or moved with the arrow keys, one undo step each.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { trackOf } from '../../../src/core/animation/tween.ts';
import { testApp } from '../../helpers/test-app.ts';

async function keyed() {
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Animation',
    }),
  );
  const anim = t.app.animation;
  anim.addShape('ellipse', { x: 0, y: 0, width: 20, height: 20 });
  anim.setFrame(24);
  anim.setProperties({ x: 200 });
  await tick();
  const key = () =>
    trackOf(anim.store.get().history.present.layers[0]!.objects[0]!, 'x')!.keyframes[0]!;
  await fireEvent.click(screen.getByRole('button', { name: 'X keyframe at frame 0' }));
  return { anim, key, state: () => anim.store.get() };
}

describe('the keyframe bar’s eases', () => {
  it('offers Overshoot, Anticipate, Elastic and Custom curve', async () => {
    const s = await keyed();
    const easing = screen.getByLabelText('Easing') as HTMLSelectElement;
    const labels = [...easing.options].map((o) => o.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(['Overshoot', 'Anticipate', 'Elastic', 'Custom curve']),
    );
    await fireEvent.change(easing, { target: { value: 'elastic' } });
    expect(s.key().easing).toBe('elastic');
    expect(screen.queryByRole('group', { name: 'Ease curve' })).toBeNull();
  });

  it('Custom curve shows the curve; a handle dragged or moved by the arrow keys changes it', async () => {
    const s = await keyed();
    await fireEvent.change(screen.getByLabelText('Easing'), { target: { value: 'custom' } });
    expect(s.key()).toMatchObject({ easing: 'custom', curve: [0.42, 0, 0.58, 1] });
    const handle = screen.getByRole('slider', { name: 'Curve handle 1' });
    // jsdom has no layout: the box is placed at (0, 0) at its own size (10 px in, 34 px down).
    await fireEvent.pointerDown(handle, { clientX: 10 + 0.42 * 84, clientY: 34 + 84, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 10 + 0.2 * 84, clientY: 34 - 0.3 * 84 });
    await fireEvent.pointerUp(window, { clientX: 10 + 0.2 * 84, clientY: 34 - 0.3 * 84 });
    expect(s.key().curve).toEqual([0.2, 1.3, 0.58, 1]);
    expect(s.state().history.past.at(-1)!.label).toBe('Ease curve');
    await fireEvent.keyDown(screen.getByRole('slider', { name: 'Curve handle 2' }), {
      key: 'ArrowLeft',
      shiftKey: true,
    });
    expect(s.key().curve).toEqual([0.2, 1.3, 0.48, 1]);
    expect(screen.getByLabelText('Curve numbers').textContent).toBe('0.20, 1.30, 0.48, 1.00');
    // Done closes the box; the little curve opens it again.
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Custom curve' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit the curve' }));
    expect(screen.getByRole('dialog', { name: 'Custom curve' })).toBeTruthy();
  });

  it('a path’s easing has no Custom curve (a path has no keyframe to keep it)', async () => {
    const s = await keyed();
    s.anim.addShape('rect', { x: 0, y: 200, width: 200, height: 100 });
    const ring = s.anim.store.get().history.present.layers[0]!.objects.at(-1)!;
    const ball = s.anim.store.get().history.present.layers[0]!.objects[0]!;
    s.anim.followPath(ball.id, ring.id);
    s.anim.select([ball.id]);
    await tick();
    const pathEasing = screen.getByLabelText('Path 1 easing') as HTMLSelectElement;
    expect([...pathEasing.options].map((o) => o.value)).not.toContain('custom');
    expect([...pathEasing.options].map((o) => o.value)).toContain('back-out');
  });
});
