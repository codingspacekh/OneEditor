import { describe, expect, it } from 'vitest';
import { EditError } from '../../../../src/core/model/errors.ts';
import type { ProbeInfo } from '../../../../src/core/ports.ts';
import type { ImageFacts } from '../../../../src/core/image/info.ts';
import {
  checkFile,
  imageInfo,
  parseTaskSpec,
  sequenceInfo,
  serializeTaskSpec,
  type TaskSpec,
} from '../../../../src/core/teaching/task-check.ts';

// Book B Task 11b: an MP4 at 1920 × 1080, 5 s long, with stereo sound at 44 100 Hz.
const spec: TaskSpec = {
  name: 'Task 11b',
  container: 'mp4',
  width: 1920,
  height: 1080,
  duration: 5,
  tolerance: 0.1,
  channels: 2,
  sampleRate: 44100,
};
const good: ProbeInfo = {
  kind: 'video',
  container: 'mp4',
  duration: 5.03,
  sizeBytes: 3_000_000,
  video: { codec: 'h264', width: 1920, height: 1080, fps: 30 },
  audio: { codec: 'aac', sampleRate: 44100, channels: 2 },
};
const failed = (info: ProbeInfo) =>
  checkFile(spec, info)
    .rows.filter((r) => !r.pass)
    .map((r) => r.label);

describe('T6 task checker', () => {
  it('passes a correct export, row by row', () => {
    const result = checkFile(spec, good);
    expect(result.pass).toBe(true);
    expect(result.rows.map((r) => [r.label, r.expected, r.actual, r.pass])).toEqual([
      ['File format', 'MP4', 'MP4', true],
      ['Resolution', '1920 × 1080', '1920 × 1080', true],
      ['Duration', '5.00 s ± 0.10 s', '5.03 s', true],
      ['Channels', '2 (stereo)', '2 (stereo)', true],
      ['Sample rate', '44 100 Hz', '44 100 Hz', true],
    ]);
  });

  it('fails an export with the wrong resolution', () => {
    const small = { ...good, video: { ...good.video!, width: 1280, height: 720 } };
    expect(checkFile(spec, small).pass).toBe(false);
    expect(failed(small)).toEqual(['Resolution']);
  });

  it('fails an export that is too long or too short', () => {
    expect(failed({ ...good, duration: 5.2 })).toEqual(['Duration']);
    expect(failed({ ...good, duration: 4.85 })).toEqual(['Duration']);
  });

  it('fails an export with the wrong channel count', () => {
    expect(failed({ ...good, audio: { ...good.audio!, channels: 1 } })).toEqual(['Channels']);
  });

  it('fails the wrong format and the wrong sample rate', () => {
    expect(failed({ ...good, container: 'mov' })).toEqual(['File format']);
    expect(failed({ ...good, audio: { ...good.audio!, sampleRate: 48000 } })).toEqual([
      'Sample rate',
    ]);
  });

  it('a file with no sound fails the sound rows; no picture fails the resolution', () => {
    const silent: ProbeInfo = { ...good, audio: undefined };
    expect(failed(silent)).toEqual(['Channels', 'Sample rate']);
    expect(checkFile(spec, silent).rows[3]!.actual).toBe('no sound');
    const sound: ProbeInfo = { ...good, container: 'mp4', video: undefined, kind: 'audio' };
    expect(checkFile(spec, sound).rows[1]!.actual).toBe('no picture');
  });

  it('only checks what the teacher set; the duration tolerance defaults to 0.5 s', () => {
    const result = checkFile(
      { name: 'Mono only', channels: 1, duration: 10 },
      {
        ...good,
        duration: 10.4,
        audio: { ...good.audio!, channels: 1 },
      },
    );
    expect(result.rows.map((r) => r.label)).toEqual(['Duration', 'Channels']);
    expect(result.rows[0]!.expected).toBe('10.00 s ± 0.50 s');
    expect(result.pass).toBe(true);
  });

  it('M14: an animated GIF can be the task (exam-style question 3), saved and opened again', () => {
    const gif: TaskSpec = { name: 'Films by Ying', container: 'gif', width: 600, height: 400 };
    const made: ProbeInfo = {
      kind: 'video',
      container: 'gif',
      duration: 4,
      sizeBytes: 900_000,
      video: { codec: 'gif', width: 600, height: 400 },
    };
    expect(checkFile(gif, made).pass).toBe(true);
    expect(parseTaskSpec(serializeTaskSpec(gif))).toEqual(gif);
  });

  it('saves a task as a small file and opens it again', () => {
    expect(parseTaskSpec(serializeTaskSpec(spec))).toEqual(spec);
  });

  it('refuses a file that is not a task check, or a task with nothing to check', () => {
    expect(() => parseTaskSpec('{"schemaVersion": 3, "tracks": []}')).toThrow(EditError);
    expect(() => parseTaskSpec('not json')).toThrow(/not a OneEditor task/);
    expect(() => parseTaskSpec(serializeTaskSpec({ name: 'Empty' } as TaskSpec))).toThrow(
      /nothing to check/,
    );
    expect(() => parseTaskSpec(serializeTaskSpec({ ...spec, width: -5 }))).toThrow(EditError);
  });

  // AN17: animation exports — the frame rate and, for a GIF or a web page, looping.
  const anim: TaskSpec = {
    name: 'Star Designs',
    container: 'mp4',
    width: 600,
    height: 400,
    fps: 24,
    duration: 3,
  };
  const mp4: ProbeInfo = {
    kind: 'video',
    container: 'mp4',
    duration: 3,
    sizeBytes: 200_000,
    video: { codec: 'h264', width: 600, height: 400, fps: 24 },
  };

  it('AN17 an MP4 of a 600 × 400, 24 fps, 3 s animation passes; the same task at 30 fps fails', () => {
    const result = checkFile(anim, mp4);
    expect(result.rows.map((r) => r.label)).toEqual([
      'File format',
      'Resolution',
      'Frame rate',
      'Duration',
    ]);
    expect(result.rows[2]).toMatchObject({ expected: '24 fps', actual: '24 fps', pass: true });
    expect(result.pass).toBe(true);
    const at30 = checkFile({ ...anim, fps: 30 }, mp4);
    expect(at30.pass).toBe(false);
    expect(at30.rows.filter((r) => !r.pass).map((r) => r.label)).toEqual(['Frame rate']);
    expect(
      checkFile(anim, { ...mp4, video: { ...mp4.video!, fps: undefined } }).rows[2],
    ).toMatchObject({ actual: 'unknown', pass: false });
  });

  it('AN17 a GIF stores its frame times in hundredths of a second: 24 fps is kept as 25', () => {
    const gif: ProbeInfo = {
      ...mp4,
      container: 'gif',
      video: { ...mp4.video!, codec: 'gif', fps: 25 },
    };
    expect(checkFile({ ...anim, container: 'gif' }, gif).pass).toBe(true);
    expect(checkFile({ ...anim, container: 'gif', fps: 12 }, gif).pass).toBe(false);
  });

  it('AN17 looping: a GIF or web page that plays again and again, or one that plays once', () => {
    const task: TaskSpec = { name: 'Banner', container: 'gif', loop: true };
    const looping: ProbeInfo = { ...mp4, container: 'gif', loop: true };
    expect(checkFile(task, looping).rows.at(-1)).toMatchObject({
      label: 'Looping',
      expected: 'plays again and again',
      actual: 'plays again and again',
      pass: true,
    });
    expect(checkFile(task, { ...looping, loop: false }).rows.at(-1)).toMatchObject({
      actual: 'plays once',
      pass: false,
    });
    expect(checkFile({ ...task, loop: false }, { ...looping, loop: false }).pass).toBe(true);
    // An MP4 cannot say: the player decides.
    expect(checkFile(task, mp4).rows.at(-1)).toMatchObject({
      actual: 'not set in the file',
      pass: false,
    });
  });

  it('AN17 a PNG sequence is checked by its number of frames (the length × the frame rate)', () => {
    const png: ProbeInfo = {
      kind: 'image',
      container: 'png',
      sizeBytes: 9_000,
      video: { codec: 'png', width: 600, height: 400 },
    };
    const seq = sequenceInfo(png, 72);
    const task: TaskSpec = { ...anim, container: 'png' };
    const result = checkFile(task, seq);
    expect(result.rows.map((r) => r.label)).toEqual(['File format', 'Resolution', 'Frames']);
    expect(result.rows[2]).toMatchObject({
      expected: '72 (3 s × 24 fps)',
      actual: '72',
      pass: true,
    });
    expect(checkFile(task, sequenceInfo(png, 60)).pass).toBe(false);
    expect(seq.sizeBytes).toBe(9_000 * 72);
  });

  it('AN17 frame rate, looping, HTML and PNG are saved with the task and checked when opened', () => {
    const page: TaskSpec = {
      name: 'Task 4',
      container: 'html',
      width: 600,
      height: 400,
      fps: 24,
      loop: true,
    };
    expect(parseTaskSpec(serializeTaskSpec(page))).toEqual(page);
    expect(parseTaskSpec(serializeTaskSpec({ name: 'Seq', container: 'png', fps: 12 }))).toEqual({
      name: 'Seq',
      container: 'png',
      fps: 12,
    });
    expect(parseTaskSpec(serializeTaskSpec({ name: 'L', loop: false }))).toEqual({
      name: 'L',
      loop: false,
    });
    expect(() => parseTaskSpec(serializeTaskSpec({ ...page, fps: 0 }))).toThrow(/fps/);
    expect(() => parseTaskSpec(serializeTaskSpec({ ...page, loop: 'yes' as never }))).toThrow(
      /loop/i,
    );
  });
});

// GL2 (M23): a picture's numbers — the papers' "a width of 600 px", "10 cm wide at 300 dpi",
// "a transparent background", "the SVG must not contain any bitmap elements", "under 200 KB",
// and the file named Chip_<centre>_<candidate> (P8).
describe('GL2 (M23) the task checker for pictures', () => {
  const chip: ImageFacts = {
    format: 'png',
    kind: 'bitmap',
    extension: 'png',
    sizeBytes: 150_000,
    width: 1181,
    height: 709,
    dpi: { x: 300, y: 300 },
    print: { widthCm: 10.0, heightCm: 6.0, widthIn: 3.94, heightIn: 2.36, from: 'dpi' },
    depth: 32,
    seeThrough: 'used',
  };
  const logo: ImageFacts = {
    format: 'svg',
    kind: 'vector',
    extension: 'svg',
    sizeBytes: 2190,
    width: 400,
    height: 200,
    seeThrough: 'possible',
    svg: { unit: 'px', bitmaps: 0 },
    print: { widthCm: 10.58, heightCm: 5.29, widthIn: 4.17, heightIn: 2.08, from: 'css' },
  };
  const task: TaskSpec = {
    name: 'Chip',
    container: 'png',
    width: 1181,
    height: 709,
    dpi: 300,
    printWidth: 10,
    printHeight: 6,
    depth: 32,
    transparent: true,
    maxKB: 200,
    fileName: 'Chip',
  };
  const me = { centre: 'KH012', number: '0042', name: '' };
  const rows = (spec: TaskSpec, facts: ImageFacts, name = 'Chip_KH012_0042.png') =>
    checkFile(spec, imageInfo(facts, name), me).rows;
  const failing = (spec: TaskSpec, facts: ImageFacts, name?: string) =>
    rows(spec, facts, name)
      .filter((r) => !r.pass)
      .map((r) => r.label);

  it('a PNG that meets every number passes, row by row', () => {
    const r = rows(task, chip);
    expect(r.map((x) => x.label)).toEqual([
      'File format',
      'Resolution',
      'Resolution (dpi)',
      'Printed width',
      'Printed height',
      'Colour depth',
      'See-through pixels',
      'File size',
      'File name',
    ]);
    expect(r.every((x) => x.pass)).toBe(true);
    expect(r.find((x) => x.label === 'Printed width')).toMatchObject({
      expected: '10.0 cm ± 0.1 cm',
      actual: '10.00 cm (at 300 dpi)',
    });
    expect(r.find((x) => x.label === 'Colour depth')!.actual).toMatch(/32 bits a pixel/);
    expect(r.find((x) => x.label === 'File size')!.actual).toBe('150 KB');
    expect(r.find((x) => x.label === 'File name')!.actual).toBe('Chip_KH012_0042');
  });

  it('each number wrong fails its own row, and says why', () => {
    const bad: ImageFacts = {
      ...chip,
      format: 'jpg',
      extensionSays: 'png',
      dpi: { x: 72, y: 72 },
      print: { ...chip.print!, widthCm: 41.66, heightCm: 25.01 },
      depth: 24,
      seeThrough: 'none',
      sizeBytes: 250_000,
    };
    expect(failing(task, bad, 'Chip.png')).toEqual([
      'File format',
      'Resolution (dpi)',
      'Printed width',
      'Printed height',
      'Colour depth',
      'See-through pixels',
      'File size',
      'File name',
    ]);
    const r = rows(task, bad, 'Chip.png');
    expect(r[0]!.actual).toBe('JPG (named .png)');
    expect(r.find((x) => x.label === 'See-through pixels')!.actual).toMatch(/none/);
    expect(r.find((x) => x.label === 'File name')!.actual).toMatch(
      /Chip — it does not end with a centre and candidate number/,
    );
  });

  it('only the width (600 px wide, the height in proportion) or only the height', () => {
    const wide = rows({ name: 'W', width: 1181 }, chip);
    expect(wide).toEqual([{ label: 'Width', expected: '1181 px', actual: '1181 px', pass: true }]);
    expect(rows({ name: 'H', height: 500 }, chip)[0]).toMatchObject({
      label: 'Height',
      actual: '709 px',
      pass: false,
    });
  });

  it('no see-through pixels allowed; see-through not checkable; no dpi in the file', () => {
    const solid = { name: 'S', transparent: false };
    expect(rows(solid, { ...chip, seeThrough: 'unused' })[0]!.pass).toBe(true);
    expect(rows(solid, chip)[0]!.pass).toBe(false);
    const unsure = rows({ name: 'T', transparent: true }, { ...chip, seeThrough: 'possible' })[0]!;
    expect(unsure).toMatchObject({ pass: false });
    expect(unsure.actual).toMatch(/cannot tell/);
    const noDpi: ImageFacts = { ...chip, dpi: undefined, print: undefined };
    const r = rows({ name: 'D', dpi: 300, printWidth: 10 }, noDpi);
    expect(r.map((x) => [x.actual, x.pass])).toEqual([
      ['none in the file', false],
      ['no dpi in the file, so no printed size', false],
    ]);
  });

  it('"the SVG must not contain any bitmap elements": passes with none, fails with one or for a bitmap', () => {
    const spec: TaskSpec = { name: 'Logo', container: 'svg', noBitmaps: true, dpi: 300, depth: 24 };
    const r = rows(spec, logo, 'Logo_KH012_0042.svg');
    expect(r.map((x) => [x.label, x.pass])).toEqual([
      ['File format', true],
      ['Resolution (dpi)', false],
      ['Colour depth', false],
      ['Bitmaps inside', true],
    ]);
    expect(r[1]!.actual).toMatch(/vector file has no dpi/);
    expect(r[3]!.actual).toBe('none');
    const withPhoto = { ...logo, svg: { ...logo.svg!, bitmaps: 2 } };
    expect(rows(spec, withPhoto).find((x) => x.label === 'Bitmaps inside')).toMatchObject({
      actual: '2 bitmaps',
      pass: false,
    });
    expect(rows({ name: 'B', noBitmaps: true }, chip)[0]!.actual).toMatch(/it is a bitmap \(PNG\)/);
    const pdf: ImageFacts = {
      ...logo,
      format: 'pdf',
      svg: undefined,
      pdf: { pages: 1, bitmaps: null },
    } as ImageFacts;
    expect(rows({ name: 'P', noBitmaps: true }, pdf)[0]!.actual).toMatch(/cannot tell/);
  });

  it("an SVG's printed size comes from its units; a video has no picture facts", () => {
    expect(rows({ name: 'L', printWidth: 10.6 }, logo)[0]).toMatchObject({
      actual: '10.58 cm (at 96 px an inch)',
      pass: true,
    });
    const video = checkFile(
      {
        name: 'V',
        dpi: 300,
        depth: 24,
        transparent: true,
        noBitmaps: true,
        printHeight: 5,
        maxKB: 5000,
      },
      good,
    ).rows;
    expect(video.map((x) => [x.actual, x.pass])).toEqual([
      ['not a picture', false],
      ['not a picture', false],
      ['not a picture', false],
      ['not a picture', false],
      ['not a picture', false],
      ['3 000 KB', true],
    ]);
  });

  it('an animated GIF read from its bytes is checked for its frame rate, length and looping', () => {
    const gif: ImageFacts = {
      format: 'gif',
      kind: 'bitmap',
      extension: 'gif',
      sizeBytes: 9000,
      width: 600,
      height: 400,
      depth: 8,
      palette: 256,
      seeThrough: 'none',
      gif: { frames: 75, loop: true, duration: 3 },
    };
    const info = imageInfo(gif, 'Stars.gif');
    expect(info).toMatchObject({ container: 'gif', duration: 3, loop: true, video: { fps: 25 } });
    const spec: TaskSpec = { name: 'G', container: 'gif', fps: 24, duration: 3, loop: true };
    expect(checkFile(spec, info).pass).toBe(true);
    const still = imageInfo({ ...gif, gif: { frames: 1, loop: false, duration: 0 } }, 'a.gif');
    expect(still.duration).toBeUndefined();
    expect(still.video!.fps).toBeUndefined();
  });

  it("the name check without the student's details set accepts any centre and candidate number", () => {
    const r = checkFile({ name: 'N', examName: true }, imageInfo(chip, 'Gas_ZZ999_9999.png')).rows;
    expect(r).toEqual([
      {
        label: 'File name',
        expected: '<name>_<centre>_<candidate>',
        actual: 'Gas_ZZ999_9999',
        pass: true,
      },
    ]);
  });

  it('the picture numbers are saved with the task and opened again; old task files still open', () => {
    expect(parseTaskSpec(serializeTaskSpec(task))).toEqual(task);
    const more: TaskSpec = {
      name: 'M',
      printTolerance: 0.2,
      printWidth: 5,
      noBitmaps: true,
      examName: true,
      transparent: false,
    };
    expect(parseTaskSpec(serializeTaskSpec(more))).toEqual(more);
    for (const f of ['jpg', 'gif', 'bmp', 'tiff', 'svg', 'pdf'])
      expect(parseTaskSpec(serializeTaskSpec({ name: f, container: f })).container).toBe(f);
    // A task file from before M23 (1.5), as the teacher saved it.
    const old =
      '{"kind":"easymedia-task-check","version":1,"name":"Task 11b","container":"mp4","width":1920,"height":1080,"duration":30,"tolerance":0.5}';
    expect(parseTaskSpec(old)).toEqual({
      name: 'Task 11b',
      container: 'mp4',
      width: 1920,
      height: 1080,
      duration: 30,
      tolerance: 0.5,
    });
  });

  it('refuses picture numbers that are not valid', () => {
    const bad = (extra: object) => () =>
      parseTaskSpec(
        JSON.stringify({ kind: 'easymedia-task-check', version: 1, name: 'x', ...extra }),
      );
    expect(bad({ depth: 16 })).toThrow(/colour depth/);
    expect(bad({ dpi: 0 })).toThrow(/dpi/);
    expect(bad({ printWidth: -1 })).toThrow(/printWidth/);
    expect(bad({ printWidth: 5, printTolerance: -1 })).toThrow(/printed size's tolerance/);
    expect(bad({ transparent: 'yes' })).toThrow(/see-through/);
    expect(bad({ noBitmaps: 1 })).toThrow(/bitmaps/);
    expect(bad({ fileName: 5 })).toThrow(/file name/);
    expect(bad({ examName: 'yes' })).toThrow(/file name/);
    expect(bad({ maxKB: 0 })).toThrow(/maxKB/);
    for (const ok of [
      { depth: 8 },
      { dpi: 72 },
      { maxKB: 100 },
      { fileName: 'Gas' },
      { noBitmaps: true },
    ])
      expect(bad(ok)).not.toThrow();
  });
});
