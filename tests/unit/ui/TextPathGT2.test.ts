// GT2, GT3 (M20): Text on a path and In a shape in Properties (Graphics and Animation modes) —
// with a text and a shape selected, Put on path (the path hidden, or shown) and Put in shape;
// a text on a path: Start, Side, Flip, Show path with its colour and width, Take off path; a text
// in a shape: Padding, the "does not fit" hint, Take out of shape. A curve takes the text off its
// path. Gate: M/17 Woodlands (a hidden path), M/22 Heron (centred through the outline).
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { textBox } from '../../../src/ui/animation/measure.ts';
import type { AnimObject, TextObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

async function mode(name: 'Graphics' | 'Animation' = 'Graphics') {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', { name }),
  );
  const g = name === 'Graphics' ? t.app.graphics : t.app.animation;
  const objects = (): AnimObject[] =>
    g.store.get().history.present.layers.flatMap((l) => l.objects);
  const text = () => objects().find((o) => o.kind === 'text') as TextObject;
  return { ...t, g, objects, text };
}

async function textAndShape(
  s: Awaited<ReturnType<typeof mode>>,
  kind: 'ellipse' | 'path' = 'ellipse',
) {
  if (kind === 'ellipse') s.g.addShape('ellipse', { x: 100, y: 100, width: 300, height: 200 });
  else
    s.g.addPath(
      [
        { x: 10, y: 200 },
        { x: 200, y: 100 },
        { x: 390, y: 200 },
      ],
      false,
    );
  s.g.addText({ x: 10, y: 10 }, 'Woodlands');
  s.g.select(s.objects().map((o) => o.id));
  await tick();
}

describe('GT2 Text on a path in Properties', () => {
  it('M/17 Woodlands: Put on path hides the path; Start, Side and Flip change it', async () => {
    const s = await mode();
    await textAndShape(s);
    await fireEvent.click(screen.getByRole('button', { name: 'Put on path' }));
    expect(s.objects()).toHaveLength(1);
    expect(s.text().path!.stroke).toBeUndefined();
    expect(screen.getByText('The path is hidden: only the words show its shape.')).toBeTruthy();
    await fireEvent.change(screen.getByLabelText('Start'), { target: { value: '25' } });
    expect(s.text().path!.start).toBe(25);
    await fireEvent.change(screen.getByLabelText('Side'), { target: { value: 'centred' } });
    expect(s.text().path!.side).toBe('centred');
    await fireEvent.click(screen.getByLabelText('Flip: run the other way round'));
    expect(s.text().path!.flip).toBe(true);
    await fireEvent.click(screen.getByLabelText('Flip: run the other way round'));
    expect(s.text().path!.flip).toBeUndefined();
    // The box is the path's: measuring the words leaves it.
    expect(textBox(s.text())).toEqual({ width: 300, height: 200 });
  });

  it('M/22 Heron: shown with the shape’s outline; its colour and width; hidden again', async () => {
    const s = await mode('Animation');
    await textAndShape(s);
    await fireEvent.click(screen.getByLabelText('Show the path (with the shape’s outline)'));
    await fireEvent.click(screen.getByRole('button', { name: 'Put on path' }));
    expect(s.text().path!.stroke).toBeDefined();
    await fireEvent.change(screen.getByLabelText('Path width'), { target: { value: '4' } });
    expect(s.text().path!.stroke!.width).toBe(4);
    await fireEvent.change(screen.getByLabelText('Path colour'), { target: { value: '#ff0000' } });
    expect(s.text().path!.stroke!.colour).toBe('#ff0000');
    await fireEvent.click(screen.getByLabelText('Show the path'));
    expect(s.text().path!.stroke).toBeUndefined();
    await fireEvent.click(screen.getByLabelText('Show the path'));
    expect(s.text().path!.stroke).toMatchObject({ width: 2 });
  });

  it('Take off path makes it straight text again; a curve takes it off too', async () => {
    const s = await mode();
    await textAndShape(s, 'path');
    await fireEvent.click(screen.getByRole('button', { name: 'Put on path' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Take off path' }));
    expect(s.text().path).toBeUndefined();
    expect(s.text().height).toBeCloseTo(s.text().size * 1.2);
    s.g.undo();
    await tick();
    expect(s.text().path).toBeDefined();
    await fireEvent.change(screen.getByLabelText('Curve'), { target: { value: '40' } });
    expect(s.text()).toMatchObject({ curve: 40 });
    expect(s.text().path).toBeUndefined();
  });

  it('Put in shape is for a closed shape only', async () => {
    const s = await mode();
    await textAndShape(s, 'path');
    expect(
      (screen.getByRole('button', { name: 'Put in shape' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('GT3 Text in a shape in Properties', () => {
  it('wraps the words in the ellipse; Padding; the hint; Take out of shape', async () => {
    const s = await mode();
    await textAndShape(s);
    await fireEvent.click(screen.getByRole('button', { name: 'Put in shape' }));
    expect(s.objects().map((o) => o.kind)).toEqual(['ellipse', 'text']);
    expect(s.text().inShape!.padding).toBe(8);
    expect(screen.queryByText(/Some words do not fit/)).toBeNull();
    await fireEvent.change(screen.getByLabelText('Padding'), { target: { value: '120' } });
    expect(s.text().inShape!.padding).toBe(120);
    expect(screen.getByRole('status').textContent).toMatch(/Some words do not fit \(9 letters/);
    await fireEvent.change(screen.getByLabelText('Padding'), { target: { value: '-1' } });
    expect(screen.getByText('The padding must be 0 px or more.')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Take out of shape' }));
    expect(s.text().inShape).toBeUndefined();
  });
});
