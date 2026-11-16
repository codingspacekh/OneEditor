// M20 / GT1 on screen: Properties ▸ Spacing (letter spacing, line spacing, kerning at the cursor
// in the words box, Alt+← / Alt+→), the box refitted to the spaced words, and the size in points
// in Graphics mode (the papers' "12 pt"), px in Animation mode.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { roughTextWidth } from '../../../src/core/animation/factory.ts';
import { layoutText } from '../../../src/core/animation/text-layout.ts';
import type { TextObject } from '../../../src/core/animation/types.ts';
import { textBox, type Measurer } from '../../../src/ui/animation/measure.ts';
import { testApp } from '../../helpers/test-app.ts';

async function open(mode: 'Graphics' | 'Animation', words = 'AVATAR') {
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', { name: mode }),
  );
  const editor = mode === 'Graphics' ? t.app.graphics : t.app.animation;
  editor.addText({ x: 10, y: 10 }, words);
  await tick();
  const text = (): TextObject =>
    editor.store.get().history.present.layers[0]!.objects[0] as TextObject;
  const undo = () => editor.undo();
  return { ...t, editor, text, undo };
}

const typeIn = async (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const box = () => screen.getByLabelText('Words') as HTMLTextAreaElement;
const rough = (t: TextObject) => layoutText(t, (s) => roughTextWidth(s, t.size));

describe('GT1 Properties ▸ Spacing', () => {
  it('GT1: letter spacing typed spaces the whole text; the box grows with it (one undo step)', async () => {
    const s = await open('Graphics');
    const before = s.text();
    await typeIn('Letter spacing', '200');
    const spaced = s.text();
    expect(spaced.letterSpacing).toBe(200);
    expect(spaced.width).toBeCloseTo(rough(spaced).width, 1);
    expect(spaced.width).toBeGreaterThan(before.width);
    expect(spaced.x).toBe(before.x);
    s.undo();
    expect(s.text().letterSpacing).toBeUndefined();
    expect(s.text().width).toBe(before.width);
    // 0 is no spacing: nothing is saved.
    await typeIn('Letter spacing', '200');
    await typeIn('Letter spacing', '0');
    expect(s.text().letterSpacing).toBeUndefined();
  });

  it('GT1: too much spacing is explained under the field', async () => {
    const s = await open('Animation');
    await typeIn('Letter spacing', '3000');
    expect(screen.getByRole('alert').textContent).toBe(
      'The letter spacing must be between −500 and 2000 (thousandths of the size).',
    );
    expect(s.text().letterSpacing).toBeUndefined();
  });

  it('GT1: line spacing sets the lines apart; the box is as high as the lines', async () => {
    const s = await open('Animation', 'Two\nlines');
    expect((screen.getByLabelText('Line spacing') as HTMLInputElement).value).toBe('1.20');
    await typeIn('Line spacing', '2');
    const t = s.text();
    expect(t.lineSpacing).toBe(2);
    expect(t.height).toBeCloseTo(2 * 2 * t.size, 1);
    await typeIn('Line spacing', '9');
    expect(screen.getByRole('alert').textContent).toBe(
      'The line spacing must be between 0.5 and 5 times the size.',
    );
  });

  it('GT1: Alt+← / Alt+→ at the cursor kern the two letters there (Shift: 100); the field shows it', async () => {
    const s = await open('Graphics');
    const area = box();
    area.focus();
    area.setSelectionRange(2, 2); // between "V" and "A"
    await fireEvent.keyUp(area, { key: 'ArrowRight' });
    expect(screen.getByLabelText('Kerning VA')).toBeTruthy();
    await fireEvent.keyDown(area, { key: 'ArrowLeft', altKey: true });
    expect(s.text().kerning).toEqual([0, -20]);
    await fireEvent.keyDown(area, { key: 'ArrowLeft', altKey: true, shiftKey: true });
    expect(s.text().kerning).toEqual([0, -120]);
    await tick();
    expect((screen.getByLabelText('Kerning VA') as HTMLInputElement).value).toBe('-120');
    // The box follows the tighter letters.
    expect(s.text().width).toBeCloseTo(rough(s.text()).width, 1);
    // One undo step a press.
    s.undo();
    expect(s.text().kerning).toEqual([0, -20]);
    await fireEvent.keyDown(area, { key: 'ArrowRight', altKey: true });
    expect(s.text().kerning).toBeUndefined();
    // A plain arrow moves the cursor as usual.
    await fireEvent.keyDown(area, { key: 'ArrowRight' });
    expect(s.text().kerning).toBeUndefined();
  });

  it('GT1: the kerning can be typed for the pair at the cursor; with no pair the field is off', async () => {
    const s = await open('Animation');
    expect((screen.getByLabelText('Kerning at the cursor') as HTMLInputElement).disabled).toBe(
      true,
    );
    const area = box();
    area.setSelectionRange(1, 1);
    await fireEvent.click(area);
    await typeIn('Kerning AV', '-80');
    expect(s.text().kerning).toEqual([-80]);
    // At the end of the words there is no pair: Alt+→ explains.
    area.setSelectionRange(6, 6);
    await fireEvent.keyDown(area, { key: 'ArrowRight', altKey: true });
    expect(screen.getByRole('alert').textContent).toBe(
      'Put the cursor between two letters to kern them.',
    );
    expect(s.text().kerning).toEqual([-80]);
  });

  it('GT1: when the words change, the kerning stays with its letters', async () => {
    const s = await open('Animation');
    const area = box();
    area.setSelectionRange(1, 1);
    await fireEvent.keyDown(area, { key: 'ArrowLeft', altKey: true });
    expect(s.text().kerning).toEqual([-20]);
    await fireEvent.change(area, { target: { value: 'An AVATAR' } });
    expect(s.text().text).toBe('An AVATAR');
    expect(s.text().kerning).toEqual([0, 0, 0, -20]);
    // Typed but not yet applied, then kerned: both go in together.
    area.value = 'An AVATARS';
    area.setSelectionRange(9, 9);
    await fireEvent.keyDown(area, { key: 'ArrowRight', altKey: true });
    expect(s.text().text).toBe('An AVATARS');
    expect(s.text().kerning).toEqual([0, 0, 0, -20, 0, 0, 0, 0, 20]);
  });
});

describe('GT1 size in px or pt', () => {
  it('GT1: in Graphics mode the size can be typed in points (dpi / 72 px each), shown in both', async () => {
    const s = await open('Graphics');
    await s.editor.newImage({
      name: 'Poster',
      size: { width: 21, height: 29.7, units: 'cm', dpi: 300 },
      background: '#ffffff',
    });
    s.editor.addText({ x: 0, y: 0 }, 'Woodlands');
    await tick();
    await typeIn('Size in points', '12');
    // 12 pt at 300 dpi = 50 px.
    const t = s.editor.store.get().history.present.layers[0]!.objects[0] as TextObject;
    expect(t.size).toBe(50);
    expect((screen.getByLabelText('Size', { exact: true }) as HTMLInputElement).value).toBe('50');
    expect((screen.getByLabelText('Size in points') as HTMLInputElement).value).toBe('12.0');
  });

  it('GT1: Animation mode keeps px only', async () => {
    await open('Animation');
    expect(screen.queryByLabelText('Size in points')).toBeNull();
    expect(screen.getByLabelText('Size', { exact: true })).toBeTruthy();
  });
});

/** Ten px a letter. */
const fake = (): Measurer => ({ font: '', measureText: (s: string) => ({ width: 10 * s.length }) });

describe('GT1 textBox with spacing', () => {
  it('GT1: the box is the widest spaced line and the lines at their spacing', () => {
    const base = { kind: 'text', text: 'AB\nC', size: 50, align: 'left' } as TextObject;
    const t = { ...base, font: 'Inter', bold: false, italic: false } as TextObject;
    expect(textBox({ ...t, letterSpacing: 100 }, fake())).toEqual({ width: 25, height: 120 });
    expect(textBox({ ...t, kerning: [-100] }, fake())).toEqual({ width: 15, height: 120 });
    expect(textBox({ ...t, lineSpacing: 2 }, fake())).toEqual({ width: 20, height: 200 });
    // Without a canvas, from the rough widths.
    expect(textBox({ ...t, letterSpacing: 100 }, null).width).toBeCloseTo(2 * 27.5 + 5);
  });

  it('G12, GT1: in Graphics mode an outline width can be typed in points too ("a 1pt black outline")', async () => {
    const s = await open('Graphics');
    await s.editor.newImage({
      name: 'Woodlands',
      size: { width: 250, height: 200, units: 'px', dpi: 96 },
      background: '#ffffff',
    });
    s.editor.addShape('ellipse', { x: 10, y: 10, width: 80, height: 80 });
    await tick();
    await typeIn('Outline width in points', '3');
    // 3 pt at 96 dpi = 4 px.
    const o = s.editor.store.get().history.present.layers[0]!.objects[0]!;
    expect(o.stroke!.width).toBe(4);
    expect((screen.getByLabelText('Outline width in points') as HTMLInputElement).value).toBe(
      '3.0',
    );
  });

  it('G12: Animation mode keeps outline widths in px only', async () => {
    const s = await open('Animation');
    s.editor.addShape('ellipse', { x: 10, y: 10, width: 80, height: 80 });
    await tick();
    expect(screen.queryByLabelText('Outline width in points')).toBeNull();
  });
});
