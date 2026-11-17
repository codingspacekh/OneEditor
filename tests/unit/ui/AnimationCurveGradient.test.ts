// M17a, from the 2017–2021 animation benchmark: AN26 Curve in Properties ▸ Text (9626/04 M/J/17
// the HUNGRY logo, O/N/17 Rock ICT: curved logo words) and AN6 gradients with more colours and a
// radial centre in Properties ▸ Fill (M/J/20 the red–yellow–green meter, M/J/18 the bloom).
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { curvedText } from '../../../src/core/animation/curve.ts';
import { roughTextWidth } from '../../../src/core/animation/factory.ts';
import type { AnimObject, TextObject } from '../../../src/core/animation/types.ts';
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
  const objects = (): AnimObject[] =>
    anim.store.get().history.present.layers.flatMap((l) => l.objects);
  return { ...t, anim, objects };
}

const typeIn = async (label: string, value: string, scope: HTMLElement = document.body) =>
  fireEvent.change(within(scope).getByLabelText(label, { exact: true }), { target: { value } });

describe('AN26 Curve in Properties ▸ Text', () => {
  it('AN26 a curve typed bends the words; the box fits them and stays centred where it was; 0 makes them straight', async () => {
    const s = await mode();
    s.anim.addText({ x: 100, y: 100 }, 'HUNGRY');
    await tick();
    const before = s.objects()[0] as TextObject;
    const centre = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    await typeIn('Curve', '50');
    const bent = s.objects()[0] as TextObject;
    expect(bent.curve).toBe(50);
    const box = curvedText(bent, (w) => roughTextWidth(w, bent.size));
    expect(bent.width).toBeCloseTo(box.width, 1);
    expect(bent.height).toBeCloseTo(box.height, 1);
    expect(bent.x + bent.width / 2).toBeCloseTo(centre.x, 1);
    expect(bent.y + bent.height / 2).toBeCloseTo(centre.y, 1);
    // Straight again: no curve saved, the box as it was.
    await typeIn('Curve', '0');
    const straight = s.objects()[0] as TextObject;
    expect(straight.curve).toBeUndefined();
    expect(straight.width).toBeCloseTo(before.width, 1);
  });

  it('AN26 the slider bends them too (−100 to 100); too far is explained', async () => {
    const s = await mode();
    s.anim.addText({ x: 0, y: 0 }, 'Rock ICT');
    await tick();
    const slider = screen.getByRole('slider', { name: 'Curve slider' });
    expect(slider.getAttribute('min')).toBe('-100');
    expect(slider.getAttribute('max')).toBe('100');
    await fireEvent.change(slider, { target: { value: '-30' } });
    expect((s.objects()[0] as TextObject).curve).toBe(-30);
    await typeIn('Curve', '150');
    expect(screen.getByRole('alert').textContent).toBe('The curve must be between −100 and 100.');
    expect((s.objects()[0] as TextObject).curve).toBe(-30);
  });
});

describe('AN6 more colours in a gradient, and a radial centre (Properties ▸ Fill)', () => {
  it('AN6 Add a colour puts one between From and To; its colour and place can be typed; × takes it off', async () => {
    const s = await mode();
    s.anim.addShape('rect', { x: 0, y: 0, width: 200, height: 40 });
    await tick();
    await fireEvent.change(screen.getByLabelText('Fill', { exact: true }), {
      target: { value: 'linear' },
    });
    await typeIn('From', '#FF0000');
    await typeIn('To', '#00FF00');
    await fireEvent.click(screen.getByRole('button', { name: 'Add a colour' }));
    const stop = screen.getByRole('group', { name: 'Colour 2' });
    expect(s.objects()[0]!.fill).toMatchObject({ stops: [{ at: 50, colour: '#808000' }] });
    await typeIn('Colour 2', '#FFFF00', stop);
    await typeIn('At', '40', stop);
    expect(s.objects()[0]!.fill).toEqual({
      kind: 'linear',
      from: '#FF0000',
      to: '#00FF00',
      angle: 0,
      stops: [{ at: 40, colour: '#FFFF00' }],
    });
    await typeIn('At', '120', stop);
    expect(within(stop).getByRole('alert').textContent).toBe(
      'Each colour of a gradient is placed from 0 to 100 %.',
    );
    await fireEvent.click(within(stop).getByRole('button', { name: 'Remove colour 2' }));
    expect(s.objects()[0]!.fill).toEqual({
      kind: 'linear',
      from: '#FF0000',
      to: '#00FF00',
      angle: 0,
    });
  });

  it('AN6 a radial gradient’s centre is typed in % of the box; the colours between stay when it changes kind', async () => {
    const s = await mode();
    s.anim.addShape('ellipse', { x: 0, y: 0, width: 100, height: 100 });
    await tick();
    const fillKind = () => screen.getByLabelText('Fill', { exact: true });
    await fireEvent.change(fillKind(), { target: { value: 'linear' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add a colour' }));
    await fireEvent.change(fillKind(), { target: { value: 'radial' } });
    await typeIn('Centre X', '30');
    await typeIn('Centre Y', '20');
    expect(s.objects()[0]!.fill).toMatchObject({
      kind: 'radial',
      cx: 30,
      cy: 20,
      stops: [{ at: 50 }],
    });
    expect(screen.queryByLabelText('Angle', { exact: true })).toBeNull();
  });

  it('G8 (M23, J/22 Balloon2) each gradient colour has its own opacity: typed in %, kept with its colour', async () => {
    const s = await mode();
    s.anim.addShape('ellipse', { x: 0, y: 0, width: 100, height: 100 });
    await tick();
    await fireEvent.change(screen.getByLabelText('Fill', { exact: true }), {
      target: { value: 'radial' },
    });
    await typeIn('From', '#000000');
    await typeIn('To', '#000000');
    await typeIn('To opacity', '0');
    await typeIn('From opacity', '60');
    expect(s.objects()[0]!.fill).toMatchObject({ from: '#00000099', to: '#00000000' });
    // The colour changed keeps its opacity; the hex box shows the colour alone.
    await typeIn('From', '#FF0000');
    expect((s.objects()[0]!.fill as { from: string }).from).toMatch(/^#ff000099$/i);
    expect((screen.getByLabelText('From', { exact: true }) as HTMLInputElement).value).toMatch(
      /^#?ff0000$/i,
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Add a colour' }));
    const stop = screen.getByRole('group', { name: 'Colour 2' });
    await typeIn('Opacity', '25', stop);
    expect((s.objects()[0]!.fill as { stops: { colour: string }[] }).stops[0]!.colour).toMatch(
      /^#[0-9a-f]{6}40$/,
    );
    // Back to 100 %: an ordinary colour again.
    await typeIn('From opacity', '100');
    expect((s.objects()[0]!.fill as { from: string }).from).toMatch(/^#ff0000$/i);
    await typeIn('To opacity', '150');
    expect(screen.getByText('From 0 to 100 %.')).toBeTruthy();
  });
});
