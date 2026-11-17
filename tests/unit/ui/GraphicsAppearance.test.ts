// M19 / G12, G14 on screen: Properties ▸ Fill ▸ Pattern (the tiles, colour, background, size,
// angle, a picture tiled), the fill's and outline's own opacity, and Properties ▸ Filters
// (shadow, glow, bevel, blur: added, typed, reordered, removed) in Graphics and Animation mode.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { newFilter } from '../../../src/core/animation/appearance.ts';
import { WHY } from '../../../src/core/effects/help.ts';
import type { AnimObject } from '../../../src/core/animation/types.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';
import { expectWhy, whyTexts } from '../../helpers/why.ts';

async function open(mode: 'Graphics' | 'Animation') {
  const t = testApp({ '/m/leaf.jpg': IMAGE, '/m/bark.jpg': IMAGE });
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', { name: mode }),
  );
  const editor = mode === 'Graphics' ? t.app.graphics : t.app.animation;
  const shape = (): AnimObject => editor.store.get().history.present.layers[0]!.objects[0]!;
  editor.addShape('rect', { x: 10, y: 10, width: 200, height: 100 });
  await tick();
  return { ...t, editor, shape };
}

const typeIn = async (label: string, value: string, scope: HTMLElement = document.body) =>
  fireEvent.change(within(scope).getByLabelText(label, { exact: true }), { target: { value } });
const choose = async (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

describe('G12 Properties ▸ Fill ▸ Pattern', () => {
  it('G12: Pattern fills with stripes in the colour it had; the tile, colours, size and angle are typed', async () => {
    const s = await open('Graphics');
    const was = s.shape().fill;
    await choose('Fill', 'pattern');
    expect(s.shape().fill).toMatchObject({
      kind: 'pattern',
      pattern: 'stripes',
      colour: was.kind === 'solid' ? was.colour : '',
      background: '#ffffff',
      size: 16,
    });
    await choose('Pattern', 'bricks');
    await typeIn('Tile colour', '#B40000');
    await typeIn('Background', '#EEEEEE');
    await typeIn('Tile size', '24');
    await typeIn('Tile angle', '45');
    expect(s.shape().fill).toEqual({
      kind: 'pattern',
      pattern: 'bricks',
      colour: '#B40000',
      background: '#EEEEEE',
      size: 24,
      angle: 45,
    });
    // See-through between the bricks: no background colour to type.
    await fireEvent.click(screen.getByLabelText('See-through between'));
    expect(s.shape().fill).toMatchObject({ background: 'none' });
    expect(screen.queryByLabelText('Background', { exact: true })).toBeNull();
    await fireEvent.click(screen.getByLabelText('See-through between'));
    expect(s.shape().fill).toMatchObject({ background: '#ffffff' });
    // An angle of 0 is not kept; a tile too small is explained.
    await typeIn('Tile angle', '0');
    expect(s.shape().fill).not.toHaveProperty('angle', 45);
    await typeIn('Tile size', '1');
    expect(screen.getByRole('alert').textContent).toBe('A pattern tile is from 2 to 1000 px.');
    expectWhy(whyTexts(document.body), WHY.graphicPattern);
  });

  it('G12 (J/22): A picture tiled: chosen from the computer when the image has none, then picked from its pictures', async () => {
    const s = await open('Graphics');
    await choose('Fill', 'pattern');
    s.dialogs.openPicture.mockResolvedValueOnce('/m/leaf.jpg');
    await choose('Pattern', 'picture');
    await vi.waitFor(() => expect(s.shape().fill).toMatchObject({ pattern: 'picture' }));
    await tick();
    const pictures = () => s.editor.store.get().history.present.pictures;
    expect(pictures()).toHaveLength(1);
    s.dialogs.openPicture.mockResolvedValueOnce('/m/bark.jpg');
    await fireEvent.click(screen.getByRole('button', { name: 'Choose a picture…' }));
    await vi.waitFor(() => expect(pictures()).toHaveLength(2));
    await tick();
    const picker = screen.getByLabelText('Tiled picture', { exact: true }) as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toEqual(['leaf.jpg', 'bark.jpg']);
    await choose('Tiled picture', pictures()[0]!.id);
    expect(s.shape().fill).toMatchObject({ pictureId: pictures()[0]!.id });
    // Back to a tile: the picture is no longer part of the fill; a picture known is tiled at once.
    await choose('Pattern', 'dots');
    expect(s.shape().fill).not.toHaveProperty('pictureId');
    await choose('Pattern', 'picture');
    expect(s.shape().fill).toMatchObject({ pictureId: pictures()[0]!.id });
  });
});

describe('G12 the fill’s and the outline’s own opacity', () => {
  it('G12 (workbook): Fill opacity 50 %, Outline opacity 30 %; 100 % keeps nothing; too much is explained', async () => {
    const s = await open('Graphics');
    await typeIn('Fill opacity', '50');
    expect(s.shape().fillOpacity).toBe(50);
    await typeIn('Outline opacity', '30');
    expect(s.shape().stroke?.opacity).toBe(30);
    await typeIn('Fill opacity', '100');
    expect(s.shape().fillOpacity).toBeUndefined();
    await typeIn('Outline opacity', '100');
    expect(s.shape().stroke).not.toHaveProperty('opacity');
    await typeIn('Fill opacity', '150');
    expect(screen.getByRole('alert').textContent).toBe(
      'The fill opacity must be between 0 and 100 %.',
    );
  });
});

describe('G14 Properties ▸ Filters', () => {
  it.each(['Graphics', 'Animation'] as const)(
    'G14 (%s): a filter is added from the list, its numbers typed, moved and removed',
    async (mode) => {
      const s = await open(mode);
      const section = () => screen.getByRole('heading', { name: /^Filters/ }).parentElement!;
      expect(within(section()).getByText('shadow, glow, bevel, stroke, blur')).toBeTruthy();
      await fireEvent.click(within(section()).getByRole('button', { name: 'Add filter' }));
      expect(s.shape().filters).toEqual([newFilter('dropShadow')]);
      const shadow = screen.getByRole('group', { name: 'Drop shadow' });
      await typeIn('Across', '10', shadow);
      await typeIn('Colour', '#333333', shadow);
      expect(s.shape().filters![0]).toMatchObject({ dx: 10, colour: '#333333' });
      await typeIn('Opacity', '200', shadow);
      expect(within(shadow).getByRole('alert').textContent).toBe(
        "A filter's opacity must be between 0 and 100 %.",
      );
      await choose('Add', 'bevel');
      await fireEvent.click(within(section()).getByRole('button', { name: 'Add filter' }));
      expect(s.shape().filters!.map((f) => f.kind)).toEqual(['dropShadow', 'bevel']);
      const bevel = screen.getByRole('group', { name: 'Bevel' });
      await typeIn('Depth', '6', bevel);
      await typeIn('Light from', '90', bevel);
      await typeIn('Light', '#FFFFCC', bevel);
      expect(s.shape().filters![1]).toMatchObject({ depth: 6, angle: 90, light: '#FFFFCC' });
      await fireEvent.click(screen.getByRole('button', { name: 'Move Bevel up' }));
      expect(s.shape().filters!.map((f) => f.kind)).toEqual(['bevel', 'dropShadow']);
      expect(
        (screen.getByRole('button', { name: 'Move Bevel up' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      await fireEvent.click(screen.getByRole('button', { name: 'Move Bevel down' }));
      expect(s.shape().filters!.map((f) => f.kind)).toEqual(['dropShadow', 'bevel']);
      await fireEvent.click(screen.getByRole('button', { name: 'Remove Drop shadow' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Remove Bevel' }));
      expect(s.shape().filters).toBeUndefined();
      expectWhy(whyTexts(section()), WHY.graphicFilters);
    },
  );

  it('G14: glow, inner shadow and blur have their own numbers; two of a kind are numbered', async () => {
    const s = await open('Graphics');
    const add = async (kind: string) => {
      await choose('Add', kind);
      await fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    };
    await add('glow');
    await add('innerShadow');
    await add('blur');
    await add('blur');
    await typeIn('Blur', '30', screen.getByRole('group', { name: 'Glow' }));
    await typeIn('Down', '-3', screen.getByRole('group', { name: 'Inner shadow' }));
    await typeIn('Radius', '2', screen.getByRole('group', { name: 'Blur 2' }));
    expect(s.shape().filters).toEqual([
      { ...newFilter('glow'), blur: 30 },
      { ...newFilter('innerShadow'), dy: -3 },
      newFilter('blur'),
      { kind: 'blur', radius: 2 },
    ]);
    expect(screen.getByRole('group', { name: 'Blur 1' })).toBeTruthy();
  });

  it('G10 (M23, M/21 globe): a stroke effect: its colour, width, opacity and where it lies', async () => {
    const s = await open('Graphics');
    await choose('Add', 'stroke');
    await fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    const stroke = screen.getByRole('group', { name: 'Stroke' });
    await typeIn('Width', '5', stroke);
    await typeIn('Colour', '#222222', stroke);
    await fireEvent.change(within(stroke).getByLabelText('Lies', { exact: true }), {
      target: { value: 'centred' },
    });
    expect(s.shape().filters).toEqual([
      { kind: 'stroke', colour: '#222222', width: 5, opacity: 100, position: 'centred' },
    ]);
    await typeIn('Width', '0', stroke);
    expect(within(stroke).getByRole('alert').textContent).toMatch(/stroke effect's width/);
  });

  it('G14: a group has filters too (the whole group’s look)', async () => {
    const s = await open('Graphics');
    s.editor.addShape('ellipse', { x: 300, y: 10, width: 50, height: 50 });
    const doc = () => s.editor.store.get().history.present;
    s.editor.select(doc().layers[0]!.objects.map((o) => o.id));
    s.editor.group();
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(doc().layers[0]!.objects[0]).toMatchObject({
      kind: 'group',
      filters: [newFilter('dropShadow')],
    });
  });
});
