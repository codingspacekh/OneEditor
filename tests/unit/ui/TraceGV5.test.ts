// GV5 (M19): the Trace bitmap dialog in black and white (a threshold), of only a part of the
// picture, keeping the picture underneath to compare, and the pros and cons of tracing.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import type { Pixels } from '../../../src/core/animation/trace.ts';
import { testApp } from '../../helpers/test-app.ts';

/** A dark square with a light middle on white, 60 × 40. */
const PIXELS: Pixels = (() => {
  const data = new Uint8ClampedArray(60 * 40 * 4);
  for (let i = 0; i < 60 * 40; i++) {
    const [x, y] = [i % 60, Math.floor(i / 60)];
    const square = x >= 10 && x < 50 && y >= 5 && y < 35;
    const middle = x >= 25 && x < 35 && y >= 15 && y < 25;
    data.set(square && !middle ? [30, 30, 30, 255] : [255, 255, 255, 255], i * 4);
  }
  return { width: 60, height: 40, data };
})();

async function open() {
  const t = testApp();
  t.stageRenderer.pixels.mockResolvedValue(PIXELS);
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Animation',
    }),
  );
  const anim = t.app.animation;
  t.dialogs.openPicture.mockResolvedValueOnce('/m/photo.jpg');
  await anim.addPicture({ x: 0, y: 0 });
  await fireEvent.click(await screen.findByRole('button', { name: 'Trace bitmap…' }));
  const d = within(screen.getByRole('dialog', { name: 'Trace bitmap' }));
  return { ...t, anim, d };
}

describe('GV5: the Trace bitmap dialog', () => {
  it('lists what tracing is good and bad for', async () => {
    const { d } = await open();
    const list = within(d.getByRole('group', { name: 'Tracing: for and against' }));
    expect(list.getByText(/without going blurry/)).toBeTruthy();
    expect(list.getByText(/many shapes and a large file/)).toBeTruthy();
  });

  it('black and white swaps Colours for a threshold and previews one black shape', async () => {
    const { d } = await open();
    await fireEvent.click(d.getByRole('radio', { name: 'Black and white' }));
    expect(d.queryByLabelText('Colours')).toBeNull();
    expect(await d.findByText('1 shape in 1 colour')).toBeTruthy();
    await fireEvent.input(d.getByLabelText('Threshold'), { target: { value: '0' } });
    expect(await d.findByText('0 shapes in 0 colours')).toBeTruthy();
    await fireEvent.click(d.getByRole('radio', { name: 'In colour' }));
    expect(d.getByLabelText('Colours')).toBeTruthy();
  });

  it('Trace passes the part chosen; the picture is not kept unless asked', async () => {
    const s = await open();
    const trace = vi.spyOn(s.anim, 'traceBitmap');
    await fireEvent.click(s.d.getByRole('radio', { name: 'Black and white' }));
    await fireEvent.click(s.d.getByLabelText('Only a part of the picture'));
    await fireEvent.input(s.d.getByLabelText('Left %'), { target: { value: '10' } });
    await fireEvent.input(s.d.getByLabelText('Width %'), { target: { value: '150' } });
    await fireEvent.click(s.d.getByRole('button', { name: 'Trace' }));
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'blackWhite',
        threshold: 128,
        area: { x: 0.1, y: 0.25, width: 1, height: 0.5 },
      }),
      false,
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Trace bitmap' })).toBeNull(),
    );
  });

  it('keeps the picture underneath, hidden, when ticked', async () => {
    const s = await open();
    const trace = vi.spyOn(s.anim, 'traceBitmap');
    await fireEvent.click(s.d.getByLabelText(/Keep the picture underneath/));
    await fireEvent.click(s.d.getByRole('button', { name: 'Trace' }));
    expect(trace).toHaveBeenCalledWith(
      expect.not.objectContaining({ area: expect.anything() }),
      true,
    );
    await vi.waitFor(() =>
      expect(s.anim.store.get().history.present.layers[0]!.visible).toBe(false),
    );
  });
});
