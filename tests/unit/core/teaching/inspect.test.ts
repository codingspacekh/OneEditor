import { describe, expect, it } from 'vitest';
import type { ProbeInfo } from '../../../../src/core/ports.ts';
import type { ImageFacts } from '../../../../src/core/image/info.ts';
import {
  FILE_VS_CONTAINER,
  aspectRatio,
  codecInfo,
  inspect,
  inspectImage,
} from '../../../../src/core/teaching/inspect.ts';

// Screen 21: Task_11e.mp4
const mp4: ProbeInfo = {
  kind: 'video',
  container: 'mp4',
  duration: 40.7,
  sizeBytes: 25_300_000,
  bitRate: 4_973_000,
  video: { codec: 'h264', width: 1920, height: 1080, fps: 30, bitRate: 4_800_000 },
  audio: { codec: 'aac', sampleRate: 44100, channels: 2, bitRate: 128_000 },
};
const wav: ProbeInfo = {
  kind: 'audio',
  container: 'wav',
  duration: 120,
  sizeBytes: 10_584_044,
  audio: { codec: 'pcm_s16le', sampleRate: 44100, channels: 1, bitDepth: 16 },
};
const value = (info: ProbeInfo, label: string) => inspect(info).find((r) => r.label === label);

describe('T1 media inspector', () => {
  it('shows what is inside an MP4, as screen 21', () => {
    expect(inspect(mp4).map((r) => [r.label, r.value])).toEqual([
      ['Container', 'MP4'],
      ['Video codec', 'H.264'],
      ['Resolution', '1920 × 1080 (16:9)'],
      ['Frame rate', '30 fps'],
      ['Video bit rate', '4.8 Mbit/s'],
      ['Audio codec', 'AAC'],
      ['Audio bit rate', '128 kbit/s'],
      ['Sample rate', '44 100 Hz'],
      ['Channels', '2 (stereo)'],
      ['Duration', '40.70 s'],
      ['File size', '25.3 MB'],
    ]);
  });

  it('explains every row', () => {
    for (const info of [mp4, wav])
      for (const row of inspect(info)) expect(row.explain.length, row.label).toBeGreaterThan(40);
  });

  it('a WAV shows its bit depth and no picture rows; mono is one channel', () => {
    const rows = inspect(wav);
    expect(rows.map((r) => r.label)).toEqual([
      'Container',
      'Audio codec',
      'Sample rate',
      'Bit depth',
      'Channels',
      'Duration',
      'File size',
    ]);
    expect(value(wav, 'Bit depth')!.value).toBe('16-bit');
    expect(value(wav, 'Channels')!.value).toBe('1 (mono)');
    expect(value(wav, 'Audio codec')!.value).toBe('PCM');
  });

  it('marks codecs lossy, lossless or uncompressed', () => {
    expect(value(mp4, 'Video codec')!.compression).toBe('lossy');
    expect(value(mp4, 'Audio codec')!.compression).toBe('lossy');
    expect(value(wav, 'Audio codec')!.compression).toBe('uncompressed');
    expect(value(mp4, 'Container')!.compression).toBeUndefined();
    for (const [kind, codec] of [
      ['video', 'h264'],
      ['video', 'mpeg2video'],
      ['video', 'wmv2'],
      ['audio', 'aac'],
      ['audio', 'mp3'],
    ] as const)
      expect(codecInfo(kind, codec).compression, codec).toBe('lossy');
    for (const [kind, codec] of [
      ['video', 'png'],
      ['video', 'ffv1'],
      ['audio', 'flac'],
      ['audio', 'alac'],
    ] as const)
      expect(codecInfo(kind, codec).compression, codec).toBe('lossless');
    expect(codecInfo('audio', 'pcm_f32le').compression).toBe('uncompressed');
    expect(codecInfo('video', 'rawvideo').compression).toBe('uncompressed');
  });

  it('a codec it does not know keeps its own name and says so', () => {
    const odd = codecInfo('video', 'cinepak');
    expect(odd).toEqual({ name: 'cinepak' });
    expect(
      value({ ...mp4, video: { ...mp4.video!, codec: 'cinepak' } }, 'Video codec')!.explain,
    ).toMatch(/does not know/);
  });

  it('names the aspect ratio, also for screens that are only nearly 16:9', () => {
    expect(aspectRatio(1920, 1080)).toBe('16:9');
    expect(aspectRatio(640, 480)).toBe('4:3');
    expect(aspectRatio(1366, 768)).toBe('16:9');
    expect(aspectRatio(1080, 1920)).toBe('9:16');
    expect(aspectRatio(1000, 1000)).toBe('1:1');
    expect(aspectRatio(1000, 300)).toBe('10:3');
  });

  it('a DVD stored at 720 × 576 but shown as 16:9 says both', () => {
    const dvd: ProbeInfo = {
      ...mp4,
      container: 'mpg',
      video: { codec: 'mpeg2video', width: 720, height: 576, fps: 25, displayAspect: '16:9' },
    };
    expect(value(dvd, 'Resolution')!.value).toBe('720 × 576, shown as 16:9');
  });

  it('a still image has a size but no duration or frame rate', () => {
    const png: ProbeInfo = {
      kind: 'image',
      container: 'png',
      sizeBytes: 812_000,
      video: { codec: 'png', width: 800, height: 600 },
    };
    expect(inspect(png).map((r) => r.label)).toEqual(['Container', 'Resolution', 'File size']);
    expect(value(png, 'File size')!.value).toBe('812 KB');
  });

  it('"File vs container" uses the coursebook words', () => {
    expect(FILE_VS_CONTAINER).toMatch(/container/);
    expect(FILE_VS_CONTAINER).toMatch(/codec/);
  });
});

// GL2 (M23): Learn ▸ Inspect on a picture — its facts as rows, each with a short explanation.
describe('GL2 (M23) inspecting a picture', () => {
  const chip: ImageFacts = {
    format: 'png',
    kind: 'bitmap',
    extension: 'png',
    sizeBytes: 3_355_527,
    width: 1181,
    height: 709,
    dpi: { x: 300, y: 300 },
    print: { widthCm: 10, heightCm: 6.0, widthIn: 3.937, heightIn: 2.363, from: 'dpi' },
    depth: 32,
    seeThrough: 'used',
    compression: 'deflate (lossless)',
  };
  const me = { centre: 'KH012', number: '0042', name: '' };
  const rows = (f: ImageFacts, name = 'Chip.png', who: typeof me | null = null) =>
    inspectImage(f, name, who);
  const row = (f: ImageFacts, label: string, name?: string, who: typeof me | null = null) =>
    rows(f, name, who).find((r) => r.label === label);

  it('a PNG: format, pixel size, dpi, printed size, depth, see-through, name and size; each explained', () => {
    const r = rows(chip);
    expect(r.map((x) => x.label)).toEqual([
      'Format',
      'Pixel size',
      'Resolution (dpi)',
      'Printed size',
      'Colour depth',
      'See-through pixels',
      'File name',
      'File size',
    ]);
    for (const x of r) expect(x.explain.length).toBeGreaterThan(40);
    expect(r[0]).toMatchObject({ value: 'PNG · bitmap', compression: 'lossless' });
    expect(r[1]!.value).toBe('1181 × 709 px (1.67:1)');
    expect(r[2]!.value).toBe('300 dpi');
    expect(r[3]!.value).toBe('10.00 × 6.00 cm (3.94 × 2.36 in)');
    expect(r[4]!.value).toBe('32 bits a pixel (millions of colours and see-through)');
    expect(r[5]!.value).toMatch(/^Yes/);
    expect(r[7]!.value).toBe('3.4 MB');
    expect(r[7]!.explain).toMatch(/1181 × 709 × 32 ÷ 8 = 3 349 316 bytes/);
  });

  it('a JPEG named .png says so; its quality is estimated; no dpi', () => {
    const jpg: ImageFacts = {
      ...chip,
      format: 'jpg',
      extensionSays: 'png',
      depth: 24,
      seeThrough: 'none',
      jpeg: { quality: 91, exact: true, progressive: false },
      dpi: undefined,
      print: undefined,
      sizeBytes: 800,
    };
    const r = rows(jpg);
    expect(r[0]).toMatchObject({ value: 'JPG (named .png) · bitmap', compression: 'lossy' });
    expect(r[0]!.explain).toMatch(/ends in \.png but it is really a JPG/);
    expect(row(jpg, 'Resolution (dpi)')!.value).toBe('not in the file');
    expect(row(jpg, 'Printed size')).toBeUndefined();
    expect(row(jpg, 'JPEG quality')!.value).toBe('91 (the standard table for 91)');
    const other = { ...jpg, jpeg: { quality: 80, exact: false, progressive: true } };
    expect(row(other, 'JPEG quality')!.value).toBe('about 80 (progressive)');
    expect(row(jpg, 'See-through pixels')!.value).toMatch(/^No/);
    expect(row(jpg, 'File size')!.value).toBe('800 bytes');
  });

  it('a GIF: palette, frames and looping; a BMP is not compressed; a TIFF with LZW is lossless', () => {
    const gif: ImageFacts = {
      ...chip,
      format: 'gif',
      depth: 8,
      palette: 256,
      seeThrough: 'unused',
      gif: { frames: 3, loop: true, duration: 0.12 },
    };
    expect(row(gif, 'Colour depth')!.value).toBe('8 bits a pixel (256 colours), a palette of 256');
    expect(row(gif, 'Frames')!.value).toBe('3 frames, 0.12 s, plays again and again');
    expect(row({ ...gif, gif: { frames: 1, loop: false, duration: 0 } }, 'Frames')!.value).toBe(
      '1 (a still picture)',
    );
    expect(row(gif, 'See-through pixels')!.value).toMatch(/^No: it has a see-through colour/);
    expect(row({ ...chip, format: 'bmp', compression: 'none' }, 'Format')!.compression).toBe(
      'uncompressed',
    );
    expect(row({ ...chip, format: 'tiff', compression: 'LZW' }, 'Format')!.compression).toBe(
      'lossless',
    );
    expect(row({ ...chip, format: 'tiff', compression: 'none' }, 'Format')!.compression).toBe(
      'uncompressed',
    );
    expect(row({ ...chip, seeThrough: 'possible' }, 'See-through pixels')!.value).toMatch(
      /^Can hold them/,
    );
  });

  it('an SVG: its width and height as written, the viewBox, bitmaps inside; no dpi or depth', () => {
    const svg: ImageFacts = {
      format: 'svg',
      kind: 'vector',
      extension: 'svg',
      sizeBytes: 2190,
      width: 377.95,
      height: 188.98,
      seeThrough: 'possible',
      svg: { width: '10cm', height: '5cm', unit: 'cm', viewBox: '0 0 100 50', bitmaps: 1 },
      print: { widthCm: 10, heightCm: 5, widthIn: 3.94, heightIn: 1.97, from: 'units' },
    };
    const r = rows(svg, 'Logo.svg');
    expect(r.map((x) => x.label)).toEqual([
      'Format',
      'Width and height',
      'viewBox',
      'Printed size',
      'Bitmaps inside',
      'See-through pixels',
      'File name',
      'File size',
    ]);
    expect(r[0]!.compression).toBeUndefined();
    expect(r[1]!.value).toBe('10cm × 5cm');
    expect(r[2]!.value).toBe('0 0 100 50');
    expect(r[4]!.value).toMatch(/^1 bitmap/);
    expect(r[4]!.explain).toMatch(/must not contain bitmap elements/);
    const bare = { ...svg, width: 77.44, height: 240, svg: { unit: 'px', bitmaps: 0 } };
    expect(row(bare, 'Width and height')!.value).toBe('77.44 × 240 px');
    expect(row(bare, 'viewBox')!.value).toBe('none');
    expect(row(bare, 'Bitmaps inside')!.value).toBe('none: only shapes');
    expect(row(bare, 'File size')!.explain).not.toMatch(/÷ 8/);
  });

  it('a PDF: the page size and pages, pictures inside (or cannot tell)', () => {
    const pdf: ImageFacts = {
      format: 'pdf',
      kind: 'vector',
      extension: 'pdf',
      sizeBytes: 120_000,
      seeThrough: 'none',
      pdf: { pages: 2, widthPt: 283.46, heightPt: 141.73, bitmaps: null },
      print: { widthCm: 10, heightCm: 5, widthIn: 3.94, heightIn: 1.97, from: 'page' },
    };
    expect(row(pdf, 'Page size')!.value).toBe('283 × 142 pt, 2 pages');
    expect(row(pdf, 'Bitmaps inside')!.value).toMatch(/^Cannot tell/);
    expect(row({ ...pdf, pdf: { pages: 1, bitmaps: 0 } }, 'Page size')!.value).toBe(
      'unknown, 1 page',
    );
  });

  it("P8: the file name holds the candidate details in the papers' form, or says what is missing", () => {
    expect(row(chip, 'File name', 'Chip_ZZ999_9999.png')!.value).toMatch(
      /^Chip_ZZ999_9999: centre ZZ999, candidate 9999/,
    );
    expect(row(chip, 'File name', 'Chip.png')!.value).toBe(
      'Chip: it does not end with a centre and candidate number',
    );
    expect(row(chip, 'File name', 'Chip_KH012_0043.png', me)!.value).toMatch(
      /KH012_0043 are not your numbers/,
    );
    expect(row(chip, 'File name', 'Chip.png')!.explain).toMatch(/Gas_ZZ999_9999/);
  });
});
