// T6: the task checker. A teacher sets what an exported file must be (format, resolution,
// duration ± a tolerance, mono / stereo, sample rate; for an animation, AN17, the frame rate and
// whether it loops) and saves it as a small file for the students; a student opens it with their
// export (a video, sound, GIF, web page or PNG sequence) and sees pass or fail for each row.
// GL2 (M23): a picture (PNG, JPG, GIF, BMP, TIFF, SVG or PDF) is read from its bytes (image/info.ts)
// and checked for the numbers the Graphics papers give — the pixel size (or only a width: "a width
// of 600 px"), the dpi, the printed size, the colour depth, see-through pixels, no bitmaps in an
// SVG, at most so many KB — and any file for its name in the papers' form (P8).
import { checkExamName, type Candidate } from '../exam-name.ts';
import type { ImageFacts } from '../image/info.ts';
import { EditError } from '../model/errors.ts';
import type { ProbeInfo } from '../ports.ts';
import { group } from './file-size.ts';

export interface TaskSpec {
  name: string;
  /** File type as the media probe names it: mp4, mov, avi, wmv, mpg, gif, mp3, m4a, aac, wav, flac. */
  container?: string;
  width?: number;
  height?: number;
  duration?: number;
  /** How far the duration may be out, in seconds (default 0.5). */
  tolerance?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  /** AN17: frames per second. */
  fps?: number;
  /** AN17: plays again and again (an animated GIF or a web page). */
  loop?: boolean;
  /** GL2 (M23): the resolution a picture keeps, in dots per inch. */
  dpi?: number;
  /** GL2: the printed size at the picture's dpi (or an SVG's own units, a PDF's page), in cm. */
  printWidth?: number;
  printHeight?: number;
  /** How far the printed size may be out, in cm (default 0.1). */
  printTolerance?: number;
  /** GL2: bits a pixel (1, 4, 8, 24 or 32). */
  depth?: number;
  /** GL2: true — some pixels must be see-through (a transparent background); false — none may be. */
  transparent?: boolean;
  /** GL2: no bitmaps inside an SVG or PDF (9626/04 M/26: "must not contain any bitmap elements"). */
  noBitmaps?: boolean;
  /** GL2: at most this many KB (1 KB = 1000 bytes). */
  maxKB?: number;
  /** P8: the name the paper gives the file, before _<centre>_<candidate> (Gas). */
  fileName?: string;
  /** P8: the name must end with a centre and candidate number. */
  examName?: boolean;
}

/**
 * What is checked: a probed file, or a PNG sequence with its number of pictures (AN17); GL2: a
 * picture's facts and any file's name.
 */
export type CheckedFile = ProbeInfo & { frames?: number; image?: ImageFacts; fileName?: string };

export interface CheckRow {
  label: string;
  expected: string;
  actual: string;
  pass: boolean;
}

/** M14: gif for animation tasks (AN15); M16: html (a web animation) and png (a PNG sequence). */
export const TASK_FORMATS = [
  'mp4',
  'mov',
  'avi',
  'wmv',
  'mpg',
  'gif',
  'html',
  'png',
  // GL2 (M23): the other picture formats of syllabus 19.1.
  'jpg',
  'bmp',
  'tiff',
  'svg',
  'pdf',
  'mp3',
  'm4a',
  'aac',
  'wav',
  'flac',
];
const DEFAULT_TOLERANCE = 0.5;
const DEFAULT_PRINT_TOLERANCE = 0.1;
/** GL2: the colour depths a task can ask for (core/graphics/export.ts COLOUR_DEPTHS). */
export const TASK_DEPTHS = [1, 4, 8, 24, 32];
const KIND = 'easymedia-task-check';

const channels = (n: number) => (n === 1 ? '1 (mono)' : n === 2 ? '2 (stereo)' : String(n));

/** AN17: a PNG sequence as one file to check: the first picture, and how many there are. */
export function sequenceInfo(first: ProbeInfo, frames: number): CheckedFile {
  return { ...first, frames, sizeBytes: first.sizeBytes * frames };
}

/**
 * GL2 (M23): a picture's facts as a file to check: its format, pixel size and size in bytes, and
 * for an animated GIF its frame rate, length and looping (from its own frame times).
 */
export function imageInfo(facts: ImageFacts, fileName: string): CheckedFile {
  const { width, height, gif } = facts;
  const moving = gif && gif.frames > 1 && gif.duration > 0;
  return {
    kind: 'image',
    container: facts.format,
    sizeBytes: facts.sizeBytes,
    ...(width && height
      ? {
          video: {
            codec: facts.format,
            width,
            height,
            ...(moving ? { fps: gif.frames / gif.duration } : {}),
          },
        }
      : {}),
    ...(moving ? { duration: gif.duration } : {}),
    ...(gif ? { loop: gif.loop } : {}),
    image: facts,
    fileName,
  };
}

/** "32 bits a pixel (millions of colours and see-through)". */
export function depthWords(bits: number, grey = false): string {
  const what =
    bits >= 32
      ? 'millions of colours and see-through'
      : bits >= 24
        ? 'millions of colours'
        : `${group(2 ** bits)} ${grey ? 'greys' : 'colours'}`;
  return `${bits} bits a pixel (${what})`;
}

const kb = (bytes: number) => `${group(Math.round(bytes / 1000))} KB`;
const NOT_A_PICTURE = 'not a picture';

/**
 * The same frame rate. A GIF keeps each frame's time in hundredths of a second, so 24 fps is
 * stored as 4/100 s (25 fps): for a GIF the rates match when they round to the same time.
 */
function sameRate(container: string, expected: number, actual: number): boolean {
  if (container === 'gif') return Math.round(100 / expected) === Math.round(100 / actual);
  return Math.abs(expected - actual) < 0.01;
}

const showFps = (fps: number) => `${Math.round(fps * 100) / 100} fps`;
const looping = (loop: boolean) => (loop ? 'plays again and again' : 'plays once');

/** `candidate`: the student's details (File ▸ Candidate Details…), for the file name (P8). */
export function checkFile(
  spec: TaskSpec,
  info: CheckedFile,
  candidate: Candidate | null = null,
): { rows: CheckRow[]; pass: boolean } {
  const rows: CheckRow[] = [];
  const row = (label: string, expected: string, actual: string, pass: boolean) =>
    rows.push({ label, expected, actual, pass });
  const image = info.image;
  if (spec.container) {
    const named = image?.extensionSays ? ` (named .${image.extension})` : '';
    row(
      'File format',
      spec.container.toUpperCase(),
      info.container.toUpperCase() + named,
      info.container === spec.container,
    );
  }
  const v = info.video;
  if (spec.width && spec.height) {
    row(
      'Resolution',
      `${spec.width} × ${spec.height}`,
      v ? `${v.width} × ${v.height}` : 'no picture',
      !!v && v.width === spec.width && v.height === spec.height,
    );
  } else if (spec.width || spec.height) {
    // GL2: one side only, the other in proportion (9626/04 J/20: "a width of 600px").
    const side = spec.width ? 'width' : 'height';
    const px = v?.[side];
    row(
      spec.width ? 'Width' : 'Height',
      `${spec[side]} px`,
      px === undefined ? 'no picture' : `${px} px`,
      px === spec[side],
    );
  }
  const sequence = info.frames !== undefined;
  if (spec.fps && !sequence) {
    const fps = info.video?.fps;
    row(
      'Frame rate',
      showFps(spec.fps),
      fps ? showFps(fps) : 'unknown',
      !!fps && sameRate(info.container, spec.fps, fps),
    );
  }
  if (sequence && spec.duration !== undefined && spec.fps) {
    const wanted = Math.round(spec.duration * spec.fps);
    row(
      'Frames',
      `${wanted} (${spec.duration} s × ${spec.fps} fps)`,
      String(info.frames),
      info.frames === wanted,
    );
  } else if (spec.duration !== undefined && !sequence) {
    const tolerance = spec.tolerance ?? DEFAULT_TOLERANCE;
    const d = info.duration;
    row(
      'Duration',
      `${spec.duration.toFixed(2)} s ± ${tolerance.toFixed(2)} s`,
      d === undefined ? 'no length' : `${d.toFixed(2)} s`,
      d !== undefined && Math.abs(d - spec.duration) <= tolerance + 1e-9,
    );
  }
  const a = info.audio;
  if (spec.channels)
    row(
      'Channels',
      channels(spec.channels),
      a ? channels(a.channels) : 'no sound',
      a?.channels === spec.channels,
    );
  if (spec.sampleRate)
    row(
      'Sample rate',
      `${group(spec.sampleRate)} Hz`,
      a ? `${group(a.sampleRate)} Hz` : 'no sound',
      a?.sampleRate === spec.sampleRate,
    );
  if (spec.loop !== undefined)
    row(
      'Looping',
      looping(spec.loop),
      info.loop === undefined ? 'not set in the file' : looping(info.loop),
      info.loop === spec.loop,
    );
  pictureRows(spec, image, row);
  if (spec.maxKB)
    row(
      'File size',
      `at most ${group(spec.maxKB)} KB`,
      kb(info.sizeBytes),
      info.sizeBytes <= spec.maxKB * 1000,
    );
  if ((spec.fileName || spec.examName) && info.fileName) {
    const name = checkExamName(info.fileName, candidate, spec.fileName);
    row(
      'File name',
      name.expected,
      name.why ? `${name.actual} — ${name.why}` : name.actual,
      name.pass,
    );
  }
  return { rows, pass: rows.every((r) => r.pass) };
}

const SEE_THROUGH: Record<ImageFacts['seeThrough'], string> = {
  used: 'some',
  unused: 'none (every pixel is solid)',
  none: 'none (this file cannot hold any)',
  possible: 'cannot tell (it can hold them; not checked pixel by pixel)',
};

/** GL2 (M23): the rows only a picture can pass. */
function pictureRows(
  spec: TaskSpec,
  image: ImageFacts | undefined,
  row: (label: string, expected: string, actual: string, pass: boolean) => void,
): void {
  const vector = image?.kind === 'vector';
  if (spec.dpi) {
    const d = image?.dpi;
    row(
      'Resolution (dpi)',
      `${spec.dpi} dpi`,
      !image
        ? NOT_A_PICTURE
        : vector
          ? 'a vector file has no dpi (it is sharp at any size)'
          : !d
            ? 'none in the file'
            : d.x === d.y
              ? `${d.x} dpi`
              : `${d.x} × ${d.y} dpi`,
      !!d && Math.abs(d.x - spec.dpi) <= 0.5 && Math.abs(d.y - spec.dpi) <= 0.5,
    );
  }
  const tolerance = spec.printTolerance ?? DEFAULT_PRINT_TOLERANCE;
  for (const side of ['width', 'height'] as const) {
    const wanted = side === 'width' ? spec.printWidth : spec.printHeight;
    if (!wanted) continue;
    const p = image?.print;
    const cm = p ? (side === 'width' ? p.widthCm : p.heightCm) : undefined;
    const at =
      p?.from === 'dpi'
        ? ` (at ${image!.dpi!.x} dpi)`
        : p?.from === 'css'
          ? ' (at 96 px an inch)'
          : '';
    row(
      side === 'width' ? 'Printed width' : 'Printed height',
      `${wanted.toFixed(1)} cm ± ${tolerance} cm`,
      cm !== undefined
        ? `${cm.toFixed(2)} cm${at}`
        : image
          ? 'no dpi in the file, so no printed size'
          : NOT_A_PICTURE,
      cm !== undefined && Math.abs(cm - wanted) <= tolerance + 1e-9,
    );
  }
  if (spec.depth)
    row(
      'Colour depth',
      depthWords(spec.depth),
      image?.depth
        ? depthWords(image.depth, image.grey)
        : vector
          ? 'a vector file (no pixels)'
          : NOT_A_PICTURE,
      image?.depth === spec.depth,
    );
  if (spec.transparent !== undefined) {
    const s = image?.seeThrough;
    row(
      'See-through pixels',
      spec.transparent ? 'some (a transparent background)' : 'none',
      s ? SEE_THROUGH[s] : NOT_A_PICTURE,
      spec.transparent ? s === 'used' : s === 'unused' || s === 'none',
    );
  }
  if (spec.noBitmaps) {
    const count = image?.svg ? image.svg.bitmaps : image?.pdf ? image.pdf.bitmaps : undefined;
    row(
      'Bitmaps inside',
      'none (only shapes)',
      !image
        ? NOT_A_PICTURE
        : !vector
          ? `it is a bitmap (${image.format.toUpperCase()})`
          : count === null || count === undefined
            ? 'cannot tell (the PDF keeps its parts compressed)'
            : count === 0
              ? 'none'
              : count === 1
                ? '1 bitmap'
                : `${count} bitmaps`,
      vector && count === 0,
    );
  }
}

export function serializeTaskSpec(spec: TaskSpec): string {
  return JSON.stringify({ kind: KIND, version: 1, ...spec }, null, 2);
}

/** Reads a task check file; throws an EditError the teacher or student can act on. */
export function parseTaskSpec(text: string): TaskSpec {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (data?.kind !== KIND) throw new EditError('This file is not a OneEditor task check.');
  const positive = (key: keyof TaskSpec) => {
    const v = data[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'number' || !(v > 0)) throw new EditError(`The task's ${key} is not valid.`);
    return v;
  };
  const spec: TaskSpec = { name: typeof data.name === 'string' ? data.name : 'Task' };
  if (data.container !== undefined) {
    if (typeof data.container !== 'string' || !TASK_FORMATS.includes(data.container))
      throw new EditError("The task's file format is not valid.");
    spec.container = data.container;
  }
  // GL2 (M23): a width or a height alone is a task too (the other in proportion).
  const width = positive('width');
  const height = positive('height');
  if (width) spec.width = width;
  if (height) spec.height = height;
  const duration = positive('duration');
  if (duration !== undefined) spec.duration = duration;
  const tolerance = data.tolerance;
  if (tolerance !== undefined) {
    if (typeof tolerance !== 'number' || tolerance < 0)
      throw new EditError("The task's tolerance is not valid.");
    spec.tolerance = tolerance;
  }
  if (data.channels !== undefined) {
    if (data.channels !== 1 && data.channels !== 2)
      throw new EditError('The task must ask for 1 or 2 channels.');
    spec.channels = data.channels;
  }
  const sampleRate = positive('sampleRate');
  if (sampleRate !== undefined) spec.sampleRate = sampleRate;
  const fps = positive('fps');
  if (fps !== undefined) spec.fps = fps;
  if (data.loop !== undefined) {
    if (typeof data.loop !== 'boolean') throw new EditError("The task's looping is not valid.");
    spec.loop = data.loop;
  }
  pictureSpec(data, spec, positive);
  // A name and tolerances alone check nothing.
  const checks = Object.keys(spec).filter(
    (k) => !['name', 'tolerance', 'printTolerance'].includes(k),
  );
  if (checks.length === 0) throw new EditError('This task has nothing to check.');
  return spec;
}

/** GL2 (M23), P8: a task file's numbers for a picture and its name. */
function pictureSpec(
  data: Record<string, unknown>,
  spec: TaskSpec,
  positive: (key: keyof TaskSpec) => number | undefined,
): void {
  for (const key of ['dpi', 'printWidth', 'printHeight', 'maxKB'] as const) {
    const v = positive(key);
    if (v !== undefined) spec[key] = v;
  }
  const tolerance = data.printTolerance;
  if (tolerance !== undefined) {
    if (typeof tolerance !== 'number' || !(tolerance >= 0))
      throw new EditError("The task's printed size's tolerance is not valid.");
    spec.printTolerance = tolerance;
  }
  if (data.depth !== undefined) {
    if (typeof data.depth !== 'number' || !TASK_DEPTHS.includes(data.depth))
      throw new EditError("The task's colour depth must be 1, 4, 8, 24 or 32 bits.");
    spec.depth = data.depth;
  }
  if (data.transparent !== undefined) {
    if (typeof data.transparent !== 'boolean')
      throw new EditError("The task's see-through pixels are not valid.");
    spec.transparent = data.transparent;
  }
  if (data.noBitmaps !== undefined) {
    if (typeof data.noBitmaps !== 'boolean')
      throw new EditError("The task's no bitmaps setting is not valid.");
    if (data.noBitmaps) spec.noBitmaps = true;
  }
  if (data.fileName !== undefined) {
    if (typeof data.fileName !== 'string')
      throw new EditError("The task's file name is not valid.");
    if (data.fileName.trim()) spec.fileName = data.fileName.trim();
  }
  if (data.examName !== undefined) {
    if (typeof data.examName !== 'boolean')
      throw new EditError("The task's file name setting is not valid.");
    if (data.examName) spec.examName = true;
  }
}
