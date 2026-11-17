// GL2 (M23): Learn mode reads a picture from its own bytes — inspected (T1) and checked against a
// task's numbers (T6) — and checks every file's name for the candidate details (P8).
import { describe, expect, it } from 'vitest';
import { webCompression } from '../../../src/core/image/deflate.ts';
import { encodePng } from '../../../src/core/image/png.ts';
import type { ProbeInfo } from '../../../src/core/ports.ts';
import { gifFile, text } from '../../helpers/image-files.ts';
import { testApp, VIDEO } from '../../helpers/test-app.ts';

const PROBED_PNG: ProbeInfo = {
  kind: 'image',
  container: 'png',
  sizeBytes: 9000,
  video: { codec: 'png', width: 600, height: 400 },
};

async function setup() {
  const t = testApp(
    { '/m/clip.mp4': VIDEO, '/e/old.png': PROBED_PNG },
    { preferences: '/prefs.json' },
  );
  // A 1181 × 709 PNG at 300 dpi (10 × 6 cm) with a see-through corner, as 9626/04 M/26's Chip.
  const data = new Uint8ClampedArray(1181 * 709 * 4).fill(255);
  data[3] = 0;
  const chip = await encodePng({ width: 1181, height: 709, channels: 4, data }, webCompression, {
    dpi: 300,
  });
  t.bytes.set('/e/Chip_KH012_0042.png', chip);
  t.bytes.set(
    '/e/ChipLeg.svg',
    text(
      '<svg xmlns="http://www.w3.org/2000/svg" width="77.44" height="240"><image href="a.png"/></svg>',
    ),
  );
  return { ...t, learn: t.app.learn, state: () => t.app.learn.store.get(), chip };
}

describe('GL2 (M23) Learn ▸ Inspect on a picture', () => {
  it('a PNG is read from its bytes: its facts and the candidate details now set', async () => {
    const s = await setup();
    await s.app.candidate.set({ centre: 'KH012', number: '42', name: '' });
    s.dialogs.openInspect.mockResolvedValueOnce('/e/Chip_KH012_0042.png');
    await s.learn.inspect();
    const inspected = s.state().inspected!;
    expect(inspected.name).toBe('Chip_KH012_0042.png');
    expect(inspected.info).toMatchObject({
      kind: 'image',
      container: 'png',
      sizeBytes: s.chip.length,
    });
    expect(inspected.image!.facts).toMatchObject({
      width: 1181,
      height: 709,
      dpi: { x: 300, y: 300 },
      seeThrough: 'used',
    });
    expect(inspected.image!.candidate).toMatchObject({ centre: 'KH012', number: '0042' });
  });

  it('an SVG (which the media probe cannot read) is inspected; a video is still probed', async () => {
    const s = await setup();
    await s.learn.inspect('/e/ChipLeg.svg');
    expect(s.state().inspected!.image!.facts.svg).toMatchObject({ bitmaps: 1, unit: 'px' });
    await s.learn.inspect('/m/clip.mp4');
    expect(s.state().inspected!.image).toBeUndefined();
    expect(s.state().inspected!.info.video!.codec).toBe('h264');
  });

  it('a PNG it cannot read from its bytes is left to the media probe; a missing SVG says so', async () => {
    const s = await setup();
    await s.learn.inspect('/e/old.png');
    expect(s.state().inspected).toMatchObject({ name: 'old.png', info: PROBED_PNG });
    expect(s.state().inspected!.image).toBeUndefined();
    await s.learn.inspect('/e/missing.svg');
    expect(s.state().message?.kind).toBe('error');
  });

  it('cancelling the dialog does nothing', async () => {
    const s = await setup();
    await s.learn.inspect();
    expect(s.state().inspected).toBeNull();
    expect(s.dialogs.openInspect).toHaveBeenCalledTimes(1);
  });
});

describe('GL2 (M23) the task checker on a picture', () => {
  it("passes the paper's numbers: PNG, 10 × 6 cm at 300 dpi, 32-bit, see-through, the name (P8)", async () => {
    const s = await setup();
    await s.app.candidate.set({ centre: 'KH012', number: '0042', name: '' });
    s.learn.setTask({
      name: 'Chip',
      container: 'png',
      dpi: 300,
      printWidth: 10,
      printHeight: 6,
      depth: 32,
      transparent: true,
      fileName: 'Chip',
    });
    s.dialogs.openExport.mockResolvedValueOnce(['/e/Chip_KH012_0042.png']);
    await s.learn.checkExport();
    const checked = s.state().task.checked!;
    expect(checked.rows.filter((r) => !r.pass)).toEqual([]);
    expect(checked).toMatchObject({ name: 'Chip_KH012_0042.png', pass: true });
    expect(checked.rows.map((r) => r.label)).toContain('File name');
  });

  it('another candidate\'s numbers fail the name; an SVG with a bitmap fails "no bitmaps"', async () => {
    const s = await setup();
    await s.app.candidate.set({ centre: 'KH012', number: '0043', name: '' });
    s.learn.setTask({ name: 'Chip', examName: true });
    await s.learn.checkExport('/e/Chip_KH012_0042.png');
    expect(s.state().task.checked!.rows[0]!.actual).toMatch(/are not your numbers \(KH012_0043\)/);
    s.learn.setTask({ name: 'Leg', container: 'svg', noBitmaps: true });
    await s.learn.checkExport('/e/ChipLeg.svg');
    expect(s.state().task.checked).toMatchObject({ pass: false });
    expect(s.state().task.checked!.rows[1]).toMatchObject({ actual: '1 bitmap', pass: false });
  });

  it('a video is checked for its name and size too', async () => {
    const s = await setup();
    s.learn.setTask({ name: 'V', maxKB: 5000, examName: true });
    await s.learn.checkExport('/m/clip.mp4');
    expect(s.state().task.checked!.rows.map((r) => [r.label, r.pass])).toEqual([
      ['File size', false],
      ['File name', false],
    ]);
  });

  it('an animated GIF is read from its bytes: frames, frame rate and looping', async () => {
    const s = await setup();
    const frame = { indices: Array(16).fill(1), delay: 4 };
    s.bytes.set(
      '/e/Spin.gif',
      gifFile({
        width: 4,
        height: 4,
        palette: [0, 0, 0, 255, 255, 255],
        frames: Array(75).fill(frame),
        loop: true,
      }),
    );
    s.learn.setTask({
      name: 'G',
      container: 'gif',
      width: 4,
      height: 4,
      fps: 25,
      duration: 3,
      loop: true,
    });
    await s.learn.checkExport('/e/Spin.gif');
    expect(s.state().task.checked).toMatchObject({ pass: true });
    // Two GIFs are not a sequence.
    s.dialogs.openExport.mockResolvedValueOnce(['/e/Spin.gif', '/e/Spin.gif']);
    await s.learn.checkExport();
    expect(s.state().message?.text).toMatch(/every picture of a PNG sequence/);
  });

  it('every picture of a PNG sequence read from its bytes is still one sequence', async () => {
    const s = await setup();
    s.learn.setTask({ name: 'F', container: 'png', fps: 1, duration: 2 });
    s.dialogs.openExport.mockResolvedValueOnce(['/e/Chip_KH012_0042.png', '/e/b.png']);
    await s.learn.checkExport();
    expect(s.state().task.checked).toMatchObject({
      name: 'Chip_KH012_0042.png … (2 pictures)',
      pass: true,
    });
  });
});
