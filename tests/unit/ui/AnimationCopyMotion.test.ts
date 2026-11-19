// 2026-11-18 (AN9, AN11): Copy motion / Paste motion in Properties — the moving object's motion
// put on two others at once, from where each is, one undo step.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { trackOf } from '../../../src/core/animation/tween.ts';
import { testApp } from '../../helpers/test-app.ts';

describe('copy and paste motion', () => {
  it('copies one object’s motion and pastes it on two others', async () => {
    const t = testApp();
    render(App, { props: { app: t.app } });
    await fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
        name: 'Animation',
      }),
    );
    const anim = t.app.animation;
    const objects = () => anim.store.get().history.present.layers[0]!.objects;
    anim.addShape('ellipse', { x: 0, y: 0, width: 20, height: 20 });
    anim.addShape('rect', { x: 100, y: 100, width: 20, height: 20 });
    anim.addShape('star', { x: 200, y: 300, width: 20, height: 20 });
    const [ball, box, star] = objects();
    anim.select([ball!.id]);
    anim.setFrame(24);
    anim.setProperties({ x: 300 });
    anim.setFrame(0);
    await tick();
    const props = within(screen.getByRole('complementary', { name: 'Properties' }));
    expect(
      (props.getByRole('button', { name: 'Paste motion' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await fireEvent.click(props.getByRole('button', { name: 'Copy motion' }));
    expect(anim.store.get().message?.text).toMatch(/Motion copied from Ellipse/);
    anim.select([box!.id, star!.id]);
    await tick();
    expect((props.getByRole('button', { name: 'Copy motion' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await fireEvent.click(props.getByRole('button', { name: 'Paste motion' }));
    const [, b, s] = objects();
    expect(trackOf(b!, 'x')!.keyframes.map((k) => k.value)).toEqual([100, 400]);
    expect(trackOf(s!, 'x')!.keyframes.map((k) => k.value)).toEqual([200, 500]);
    expect(anim.store.get().history.past.at(-1)!.label).toBe('Paste motion');
  });

  it('a still object says it has no motion', async () => {
    const t = testApp();
    render(App, { props: { app: t.app } });
    await fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
        name: 'Animation',
      }),
    );
    t.app.animation.addShape('rect', { x: 0, y: 0, width: 20, height: 20 });
    await tick();
    const props = within(screen.getByRole('complementary', { name: 'Properties' }));
    await fireEvent.click(props.getByRole('button', { name: 'Copy motion' }));
    expect(props.getByRole('alert').textContent).toMatch(/no motion to copy/);
  });
});
