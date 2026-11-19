// 2026-11-18 (AN8): the camera in Properties (nothing selected) — X, Y, Zoom and Turn at the
// playhead, a keyframe after frame 0; its frame on the stage; looking through it; its keyframes
// on the timeline; Remove camera keyframe and Reset camera.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
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
  const camera = () => within(screen.getByRole('group', { name: 'Camera' }));
  const type = async (label: string, value: string) =>
    fireEvent.change(camera().getByLabelText(label, { exact: true }), { target: { value } });
  return { anim, camera, type, doc: () => anim.store.get().history.present };
}

describe('the camera', () => {
  it('is set in Properties; a later frame makes keyframes, shown on the timeline', async () => {
    const s = await mode();
    animUi.cameraView = false;
    expect(screen.queryByLabelText('Camera frame')).toBeNull();
    await s.type('Zoom', '200');
    expect(s.doc().camera).toMatchObject({ zoom: 200 });
    expect(screen.getByLabelText('Camera frame')).toBeTruthy();
    s.anim.setFrame(48);
    await tick();
    await s.type('Camera X', '900');
    expect(s.doc().camera!.tracks![0]!.keyframes.map((k) => [k.frame, k.value])).toEqual([
      [0, 640],
      [48, 900],
    ]);
    const timeline = within(screen.getByRole('region', { name: 'Timeline' }));
    await fireEvent.click(timeline.getByRole('button', { name: 'Camera keyframe at frame 48' }));
    expect(s.anim.store.get().frame).toBe(48);
    expect(
      (s.camera().getByLabelText('Camera X', { exact: true }) as HTMLInputElement).value,
    ).toMatch(/^900/);
    await fireEvent.click(s.camera().getByRole('button', { name: 'Remove camera keyframe' }));
    expect(s.doc().camera!.tracks![0]!.keyframes.map((k) => k.frame)).toEqual([0]);
    await fireEvent.click(s.camera().getByRole('button', { name: 'Reset camera' }));
    expect(s.doc().camera).toBeUndefined();
  });

  it('looking through it hides the handles and turns editing off', async () => {
    const s = await mode();
    await s.type('Zoom', '150');
    await fireEvent.click(s.camera().getByLabelText('Look through the camera'));
    expect(animUi.cameraView).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/Looking through the camera/);
    // A drag with the Rectangle tool draws nothing.
    s.anim.setTool('rect');
    const stage = screen.getByRole('application', { name: 'Stage' });
    await fireEvent.pointerDown(stage, { clientX: 10, clientY: 10, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });
    await fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
    expect(s.doc().layers[0]!.objects).toHaveLength(0);
    await fireEvent.click(s.camera().getByLabelText('Look through the camera'));
    expect(animUi.cameraView).toBe(false);
  });

  it('refuses a zoom out of range, with why', async () => {
    const s = await mode();
    await s.type('Zoom', '5');
    expect(
      s
        .camera()
        .getAllByRole('alert')
        .some((a) => /10 %/.test(a.textContent ?? '')),
    ).toBe(true);
  });
});
