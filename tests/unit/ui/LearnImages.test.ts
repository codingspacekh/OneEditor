// GL2 (M23): Learn ▸ Inspect shows a picture's facts as rows, each explained; the task checker's
// teacher sets a picture's numbers and the file's name (P8), and a student sees a row for each.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { menuActions } from '../../../src/ui/menu-actions.ts';
import { ui } from '../../../src/ui/ui-state.svelte.ts';
import { jpegFile, ijgTable, text } from '../../helpers/image-files.ts';
import { testApp } from '../../helpers/test-app.ts';

async function learnMode(tab?: string) {
  const t = testApp();
  // A JPEG renamed .png, at 180 dpi, saved at quality 91 (the papers' photos).
  t.bytes.set(
    '/e/Heron_ZZ999_9999.png',
    jpegFile({
      width: 3744,
      height: 2104,
      table: ijgTable(91),
      jfif: { units: 1, x: 180, y: 180 },
    }),
  );
  t.bytes.set(
    '/e/Logo.svg',
    text(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10cm" height="5cm" viewBox="0 0 100 50"/>',
    ),
  );
  render(App, { props: { app: t.app } });
  menuActions(t.app).learnInspect();
  await tick();
  if (tab) await fireEvent.click(screen.getByRole('tab', { name: tab }));
  return { ...t, learn: t.app.learn };
}
const card = (name: string) => screen.getByRole('region', { name });

afterEach(() => {
  ui.mode = 'Video';
  ui.learnTab = 'inspect';
});

describe('GL2 (M23) Learn ▸ Inspect on a picture', () => {
  it('a JPEG named .png: its format, dpi, printed size, depth, quality and name, each explained', async () => {
    const t = await learnMode();
    t.dialogs.openInspect.mockResolvedValueOnce('/e/Heron_ZZ999_9999.png');
    const box = card('Media inspector');
    await fireEvent.click(within(box).getByRole('button', { name: /Choose a file/ }));
    await vi.waitFor(() => expect(box.textContent).toContain('Heron_ZZ999_9999.png'));
    const row = (label: string) => within(box).getByRole('button', { name: label }).closest('tr')!;
    expect(row('Format').textContent).toMatch(/JPG \(named \.png\) · bitmap\s*lossy/);
    expect(row('Resolution (dpi)').textContent).toContain('180 dpi');
    expect(row('Printed size').textContent).toContain('52.83 × 29.69 cm');
    expect(row('Colour depth').textContent).toContain('24 bits a pixel');
    expect(row('JPEG quality').textContent).toContain('91 (the standard table for 91)');
    expect(row('File name').textContent).toMatch(/centre ZZ999, candidate 9999/);
    await fireEvent.click(within(box).getByRole('button', { name: 'Format' }));
    expect(box.textContent).toMatch(/it is really a JPG/);
  });

  it('an SVG shows its units, viewBox and bitmaps', async () => {
    const t = await learnMode();
    await t.learn.inspect('/e/Logo.svg');
    await tick();
    const box = card('Media inspector');
    const row = (label: string) => within(box).getByRole('button', { name: label }).closest('tr')!;
    expect(row('Width and height').textContent).toContain('10cm × 5cm');
    expect(row('viewBox').textContent).toContain('0 0 100 50');
    expect(row('Bitmaps inside').textContent).toContain('none: only shapes');
  });
});

describe('GL2 (M23) the task checker for pictures', () => {
  it("the teacher sets a picture's numbers and the name; a student sees a row for each", async () => {
    const t = await learnMode('Task checker');
    const task = within(card('Task'));
    for (const [label, value] of [
      ['File format', 'png'],
      ['Width', ''],
      ['Height', ''],
      ['Duration (s)', ''],
      ['Tolerance (s)', ''],
      ['Resolution (dpi)', '300'],
      ['Colour depth', '32'],
      ['Printed width (cm)', '10'],
      ['Printed height (cm)', '6'],
      ['Printed size tolerance (cm)', '0.2'],
      ['At most (KB)', '200'],
      ['See-through pixels', 'true'],
      ['File name', 'Heron'],
    ] as const)
      await fireEvent.change(task.getByLabelText(label), { target: { value } });
    await fireEvent.click(task.getByRole('checkbox', { name: /No bitmaps inside/ }));
    expect(t.learn.store.get().task.spec).toEqual({
      name: 'My task',
      container: 'png',
      dpi: 300,
      depth: 32,
      printWidth: 10,
      printHeight: 6,
      printTolerance: 0.2,
      maxKB: 200,
      transparent: true,
      noBitmaps: true,
      fileName: 'Heron',
    });
    // A name given means it must end with the numbers: the box is ticked and cannot be cleared.
    const ends = task.getByRole('checkbox', { name: /Ends with the centre and candidate number/ });
    expect((ends as HTMLInputElement).checked).toBe(true);
    expect((ends as HTMLInputElement).disabled).toBe(true);
    t.dialogs.openExport.mockResolvedValueOnce(['/e/Heron_ZZ999_9999.png']);
    await fireEvent.click(
      within(card('Check an export')).getByRole('button', { name: 'Check a file…' }),
    );
    const result = card('Check an export');
    await vi.waitFor(() => expect(result.textContent).toMatch(/Not yet/));
    const row = (name: RegExp) => within(result).getByRole('row', { name });
    expect(row(/File format/).textContent).toMatch(/PNG.*JPG \(named \.png\).*✗/);
    expect(row(/Resolution \(dpi\)/).textContent).toMatch(/300 dpi.*180 dpi.*✗/);
    expect(row(/Bitmaps inside/).textContent).toMatch(/it is a bitmap \(JPG\).*✗/);
    expect(row(/File name/).textContent).toMatch(/Heron_ZZ999_9999.*✓/);
  });

  it('the boxes clear again: any depth, any see-through, no name check', async () => {
    const t = await learnMode('Task checker');
    const task = within(card('Task'));
    await fireEvent.change(task.getByLabelText('Colour depth'), { target: { value: '8' } });
    await fireEvent.change(task.getByLabelText('See-through pixels'), {
      target: { value: 'false' },
    });
    const ends = task.getByRole('checkbox', { name: /Ends with the centre/ });
    await fireEvent.click(ends);
    expect(t.learn.store.get().task.spec).toMatchObject({
      depth: 8,
      transparent: false,
      examName: true,
    });
    await fireEvent.change(task.getByLabelText('Colour depth'), { target: { value: '' } });
    await fireEvent.change(task.getByLabelText('See-through pixels'), { target: { value: '' } });
    await fireEvent.click(ends);
    await fireEvent.change(task.getByLabelText('File name'), { target: { value: '  ' } });
    const spec = t.learn.store.get().task.spec;
    expect(spec.depth).toBeUndefined();
    expect(spec.transparent).toBeUndefined();
    expect(spec.examName).toBeUndefined();
    expect(spec.fileName).toBeUndefined();
    expect(
      within(task.getByLabelText('File format')).getByRole('option', { name: 'TIFF' }),
    ).toBeTruthy();
    expect(
      within(task.getByLabelText('Colour depth')).getByRole('option', {
        name: '4 bits a pixel (16 colours)',
      }),
    ).toBeTruthy();
  });
});
