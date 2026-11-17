// T1: the media inspector (screen 21) — what is inside a file, in the coursebooks' words:
// the container, the codec of each stream (lossy, lossless or not compressed), and the
// numbers that decide the quality and the size, each with a short explanation.
// GL2 (M23): a picture's own facts (image/info.ts) — format, pixels, dpi, printed size, colour
// depth, see-through pixels, a JPEG's quality, an SVG's units and bitmaps — and its name (P8).
import { candidateInName, checkExamName, type Candidate } from '../exam-name.ts';
import { FORMAT_INFO } from '../graphics/export.ts';
import type { ImageFacts } from '../image/info.ts';
import type { ProbeInfo } from '../ports.ts';
import { group } from './file-size.ts';
import { depthWords } from './task-check.ts';

export type Compression = 'lossy' | 'lossless' | 'uncompressed';

export interface InspectRow {
  label: string;
  value: string;
  /** For a codec: how it compresses its stream. */
  compression?: Compression;
  explain: string;
}

export const FILE_VS_CONTAINER =
  'File vs container. MP4 is a container: a box that holds the video stream, the audio stream and information about them. A codec (for example H.264 and AAC) is the method used to compress and decompress each stream. A player needs the right codec to play what is inside the box.';

const VIDEO_CODECS: Record<string, { name: string; compression: Compression }> = {
  h264: { name: 'H.264', compression: 'lossy' },
  hevc: { name: 'H.265 (HEVC)', compression: 'lossy' },
  mpeg4: { name: 'MPEG-4 Part 2', compression: 'lossy' },
  mpeg2video: { name: 'MPEG-2', compression: 'lossy' },
  mpeg1video: { name: 'MPEG-1', compression: 'lossy' },
  wmv1: { name: 'Windows Media Video 7', compression: 'lossy' },
  wmv2: { name: 'Windows Media Video 8', compression: 'lossy' },
  wmv3: { name: 'Windows Media Video 9', compression: 'lossy' },
  vc1: { name: 'VC-1', compression: 'lossy' },
  vp8: { name: 'VP8', compression: 'lossy' },
  vp9: { name: 'VP9', compression: 'lossy' },
  av1: { name: 'AV1', compression: 'lossy' },
  prores: { name: 'Apple ProRes', compression: 'lossy' },
  mjpeg: { name: 'JPEG', compression: 'lossy' },
  webp: { name: 'WebP', compression: 'lossy' },
  png: { name: 'PNG', compression: 'lossless' },
  ffv1: { name: 'FFV1', compression: 'lossless' },
  utvideo: { name: 'Ut Video', compression: 'lossless' },
  huffyuv: { name: 'HuffYUV', compression: 'lossless' },
  tiff: { name: 'TIFF', compression: 'lossless' },
  gif: { name: 'GIF', compression: 'lossless' },
  rawvideo: { name: 'Raw video', compression: 'uncompressed' },
  bmp: { name: 'BMP', compression: 'uncompressed' },
};

const AUDIO_CODECS: Record<string, { name: string; compression: Compression }> = {
  aac: { name: 'AAC', compression: 'lossy' },
  mp3: { name: 'MP3', compression: 'lossy' },
  mp2: { name: 'MP2', compression: 'lossy' },
  ac3: { name: 'Dolby Digital (AC-3)', compression: 'lossy' },
  wmav1: { name: 'Windows Media Audio', compression: 'lossy' },
  wmav2: { name: 'Windows Media Audio', compression: 'lossy' },
  opus: { name: 'Opus', compression: 'lossy' },
  vorbis: { name: 'Vorbis', compression: 'lossy' },
  flac: { name: 'FLAC', compression: 'lossless' },
  alac: { name: 'Apple Lossless', compression: 'lossless' },
};

/** The codec's everyday name and how it compresses; an unknown codec keeps its own name. */
export function codecInfo(
  kind: 'video' | 'audio',
  codec: string,
): { name: string; compression?: Compression } {
  if (kind === 'audio' && codec.startsWith('pcm_'))
    return { name: 'PCM', compression: 'uncompressed' };
  return (kind === 'video' ? VIDEO_CODECS : AUDIO_CODECS)[codec] ?? { name: codec };
}

const COMMON_RATIOS = [
  [16, 9],
  [4, 3],
  [3, 2],
  [5, 4],
  [16, 10],
  [21, 9],
  [1, 1],
] as const;

/** "16:9" — whole numbers, or the common ratio it is within 1 % of (1366 × 768 is 16:9). */
export function aspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  const [w, h] = [width / d, height / d];
  if (w <= 21 && h <= 21) return `${w}:${h}`;
  const ratio = width / height;
  for (const [a, b] of COMMON_RATIOS) {
    if (Math.abs(ratio / (a / b) - 1) < 0.01) return `${a}:${b}`;
    if (Math.abs(ratio / (b / a) - 1) < 0.01) return `${b}:${a}`;
  }
  return `${ratio.toFixed(2)}:1`;
}

const size = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : bytes >= 1e6
      ? `${(bytes / 1e6).toFixed(1)} MB`
      : `${Math.round(bytes / 1e3)} KB`;

const bitRate = (bps: number) =>
  bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mbit/s` : `${Math.round(bps / 1e3)} kbit/s`;

function codecRow(kind: 'video' | 'audio', codec: string): InspectRow {
  const { name, compression } = codecInfo(kind, codec);
  const stream = kind === 'video' ? 'picture' : 'sound';
  const what = `The codec (coder / decoder) compresses the ${stream} to store it and decompresses it to play it.`;
  const how = {
    lossy: `${name} is lossy: it throws away detail that is hard to ${kind === 'video' ? 'see' : 'hear'}, so the file is much smaller, but that detail is lost for good.`,
    lossless: `${name} is lossless: the file is smaller than the raw ${stream}, yet every ${kind === 'video' ? 'pixel' : 'sample'} can be rebuilt exactly.`,
    uncompressed: `${name} is not compressed at all: every value is stored exactly, so the file is very large.`,
  };
  return {
    label: kind === 'video' ? 'Video codec' : 'Audio codec',
    value: name,
    ...(compression ? { compression } : {}),
    explain: `${what} ${compression ? how[compression] : `OneEditor does not know whether ${name} is lossy or lossless.`}`,
  };
}

export function inspect(info: ProbeInfo): InspectRow[] {
  const rows: InspectRow[] = [];
  const container = info.container.toUpperCase();
  rows.push({
    label: 'Container',
    value: container,
    explain:
      info.kind === 'image'
        ? `${container} is the picture's file format: it holds the pixels (compressed or not) and information about them, such as the size.`
        : `${container} is a container: a box that holds the ${info.video ? 'picture and sound streams' : 'sound stream'} and information about them, such as their length. The codec inside decides whether the data is lossy or lossless.`,
  });
  const v = info.video;
  if (v && info.kind === 'video') rows.push(codecRow('video', v.codec));
  if (v) {
    const ratio = aspectRatio(v.width, v.height);
    rows.push({
      label: 'Resolution',
      value:
        v.displayAspect && v.displayAspect !== ratio
          ? `${v.width} × ${v.height}, shown as ${v.displayAspect}`
          : `${v.width} × ${v.height} (${ratio})`,
      explain: `The number of pixels across × down in each ${info.kind === 'image' ? 'picture' : 'frame'}: more pixels give a sharper picture but a bigger file. The aspect ratio is the width of the frame compared with its height; 16:9 is used by almost all screens today.`,
    });
  }
  if (v?.fps)
    rows.push({
      label: 'Frame rate',
      value: `${v.fps} fps`,
      explain:
        'How many pictures (frames) are shown each second. More frames make movement smoother but need more data: 30 fps needs twice the data of 15 fps.',
    });
  if (v?.bitRate)
    rows.push({
      label: 'Video bit rate',
      value: bitRate(v.bitRate),
      explain:
        'How much data each second of the picture uses after compression. A higher bit rate keeps more detail but makes the file bigger.',
    });
  const a = info.audio;
  if (a) {
    rows.push(codecRow('audio', a.codec));
    if (a.bitRate)
      rows.push({
        label: 'Audio bit rate',
        value: bitRate(a.bitRate),
        explain:
          'How much data each second of the sound uses after compression. 128 kbit/s is common for MP3; a lower bit rate makes a smaller file that sounds worse.',
      });
    rows.push({
      label: 'Sample rate',
      value: `${group(a.sampleRate)} Hz`,
      explain:
        'How many times each second the sound was measured (sampled). 44 100 Hz is CD quality; a higher sample rate is more accurate but makes the file bigger.',
    });
    if (a.bitDepth)
      rows.push({
        label: 'Bit depth',
        value: `${a.bitDepth}-bit`,
        explain: `The sample resolution: the number of bits used for each sample. ${a.bitDepth} bits give ${group(2 ** a.bitDepth)} levels; more bits record the sound more accurately but make the file bigger.`,
      });
    rows.push({
      label: 'Channels',
      value: a.channels === 1 ? '1 (mono)' : a.channels === 2 ? '2 (stereo)' : `${a.channels}`,
      explain:
        'Stereo has two channels (left and right) that can play different sounds; mono has one, played the same through every speaker. Mono needs half the data.',
    });
  }
  if (info.duration !== undefined)
    rows.push({
      label: 'Duration',
      value: `${info.duration.toFixed(2)} s`,
      explain: 'How long the file plays for. The longer it is, the more storage it needs.',
    });
  rows.push({
    label: 'File size',
    value: size(info.sizeBytes),
    explain:
      'How much storage the file takes. It depends on the resolution, frame rate, sample rate, length and how much the codecs compress (1 MB = 1 000 000 bytes).',
  });
  return rows;
}

const cm = (n: number) => n.toFixed(2);

/** How the format squeezes its pixels, as the codec rows say it (a vector file: none). */
function imageCompression(facts: ImageFacts): Compression | undefined {
  if (facts.kind === 'vector') return undefined;
  if (facts.format === 'jpg') return 'lossy';
  if (facts.format === 'bmp' || facts.format === 'tiff')
    return facts.compression === 'none' || facts.compression === undefined
      ? 'uncompressed'
      : facts.compression.startsWith('JPEG')
        ? 'lossy'
        : 'lossless';
  return 'lossless';
}

function seeThroughRow(facts: ImageFacts): InspectRow {
  const value = {
    used: 'Yes: some pixels are see-through',
    unused: 'No: it has a see-through colour or channel, but every pixel is solid',
    none: 'No: this file cannot hold see-through pixels',
    possible:
      facts.kind === 'vector'
        ? 'Can hold them: wherever nothing is drawn shows what is behind'
        : 'Can hold them: OneEditor did not look pixel by pixel',
  }[facts.seeThrough];
  return {
    label: 'See-through pixels',
    value,
    explain: `A see-through (transparent) pixel lets what is behind the picture show, as a logo on a web page needs. ${FORMAT_INFO[facts.format].transparency ? `${facts.format.toUpperCase()} can keep them${facts.format === 'gif' ? ', but only fully see-through or not at all (one colour of its palette)' : ''}.` : `${facts.format.toUpperCase()} cannot keep them: see-through parts become the background colour.`}`,
  };
}

/**
 * GL2 (M23): what is inside a picture file (PNG, JPG, GIF, BMP, TIFF, SVG or PDF), row by row in
 * the coursebook's words, and whether its name is in the papers' form (P8). `candidate`: the
 * student's details (File ▸ Candidate Details…), if set.
 */
export function inspectImage(
  facts: ImageFacts,
  fileName: string,
  candidate: Candidate | null,
): InspectRow[] {
  const rows: InspectRow[] = [];
  const info = FORMAT_INFO[facts.format];
  const name = facts.format.toUpperCase();
  const compression = imageCompression(facts);
  rows.push({
    label: 'Format',
    value: `${name}${facts.extensionSays ? ` (named .${facts.extension})` : ''} · ${facts.kind}`,
    ...(compression ? { compression } : {}),
    explain: `${info.label}. ${info.about}${facts.extensionSays ? ` The name ends in .${facts.extension} but it is really a ${name}: OneEditor reads what is inside, but a program that goes by the name may refuse to open it. Save it again as ${facts.extensionSays.toUpperCase()}, or rename it .${info.extension}.` : ''}`,
  });
  const { width, height, dpi, print } = facts;
  if (facts.format === 'svg') {
    const s = facts.svg!;
    rows.push({
      label: 'Width and height',
      value: s.width && s.height ? `${s.width} × ${s.height}` : `${width} × ${height} px`,
      explain: `How big the drawing is shown. An SVG's width and height may be in px, cm, mm, in or pt; without a unit they are px (${width} × ${height} px here). Its shapes are drawn again at any size, so they stay sharp.`,
    });
    rows.push({
      label: 'viewBox',
      value: s.viewBox ?? 'none',
      explain:
        'The part of the drawing (in its own numbers: x, y, width, height) that fills the width and height. With a viewBox, the picture scales to fit any size; without one, the shapes are drawn at their own numbers in px.',
    });
  } else if (width && height) {
    rows.push({
      label: 'Pixel size',
      value: `${width} × ${height} px (${aspectRatio(width, height)})`,
      explain: `A bitmap is a grid of pixels: ${group(width)} across and ${group(height)} down, ${group(width * height)} pixels in all. More pixels keep more detail but make a bigger file; enlarged past its pixels, a bitmap goes blocky (pixelated).`,
    });
  }
  if (facts.kind === 'bitmap')
    rows.push({
      label: 'Resolution (dpi)',
      value: dpi
        ? dpi.x === dpi.y
          ? `${dpi.x} dpi`
          : `${dpi.x} × ${dpi.y} dpi`
        : 'not in the file',
      explain: `Dots (pixels) per inch: how many of the picture's pixels are printed in each inch (2.54 cm). It sets the printed size, not the pixels${width && dpi ? `: ${group(width)} px at ${dpi.x} dpi print ${cm((width / dpi.x) * 2.54)} cm wide` : ''}. Without it, most programs take 72 or 96 dpi. For print, 300 dpi is usual; a screen needs only the pixels.`,
    });
  if (facts.format === 'pdf') {
    const p = facts.pdf!;
    const pages = `${p.pages} page${p.pages === 1 ? '' : 's'}`;
    rows.push({
      label: 'Page size',
      value:
        p.widthPt !== undefined && p.heightPt !== undefined
          ? `${Math.round(p.widthPt)} × ${Math.round(p.heightPt)} pt, ${pages}`
          : `unknown, ${pages}`,
      explain:
        'A PDF page is measured in points: 72 points an inch (2.54 cm), so 595 × 842 pt is an A4 page. It prints at exactly this size.',
    });
  }
  if (print)
    rows.push({
      label: 'Printed size',
      value: `${cm(print.widthCm)} × ${cm(print.heightCm)} cm (${print.widthIn.toFixed(2)} × ${print.heightIn.toFixed(2)} in)`,
      explain: {
        dpi: 'The size it prints at: the pixels ÷ the dpi gives inches; × 2.54 gives cm. The same pixels at a higher dpi print smaller and sharper.',
        units:
          'The size its own units give (cm, mm, in or pt): it prints at this size, sharp at any zoom.',
        css: "It gives its size in px, so it prints at the web's 96 px an inch. A vector picture can be printed at any size without going blurry.",
        page: 'The size of the page: the PDF prints at exactly this size.',
      }[print.from],
    });
  if (facts.depth)
    rows.push({
      label: 'Colour depth',
      value: `${depthWords(facts.depth, facts.grey)}${facts.palette ? `, a palette of ${group(facts.palette)}` : ''}`,
      explain: `The bits stored for each pixel: 1 bit gives 2 colours, 4 bits 16, 8 bits 256, 24 bits (8 each for red, green and blue) about 16.7 million; 32 bits add 8 bits of transparency (alpha). ${facts.palette ? 'A palette is the list of colours the picture uses: each pixel keeps only its number in the list. ' : ''}More bits a pixel make a bigger file.`,
    });
  if (facts.jpeg) {
    const j = facts.jpeg;
    rows.push({
      label: 'JPEG quality',
      value: `${j.exact ? `${j.quality} (the standard table for ${j.quality})` : `about ${j.quality}`}${j.progressive ? ' (progressive)' : ''}`,
      explain: `A JPEG keeps no quality number: the quality chosen when saving scales its tables, which decide how much detail is thrown away (lossy). OneEditor compares this file's table with the standard ones${j.exact ? ': it is exactly the table for this quality' : ': the program that saved it uses tables of its own, so this is an estimate'}. Lower quality, smaller file, more blocks and smudges.${j.progressive ? ' Progressive: a browser shows it blurred first, then sharper.' : ''}`,
    });
  }
  if (facts.gif) {
    const g = facts.gif;
    rows.push({
      label: 'Frames',
      value:
        g.frames === 1
          ? '1 (a still picture)'
          : `${g.frames} frames, ${g.duration.toFixed(2)} s, ${g.loop ? 'plays again and again' : 'plays once'}`,
      explain:
        'A GIF can hold several pictures (frames) shown one after the other, each for so many hundredths of a second: an animated GIF. It loops when the file says so.',
    });
  }
  if (facts.kind === 'vector') {
    const count = facts.svg ? facts.svg.bitmaps : facts.pdf!.bitmaps;
    rows.push({
      label: 'Bitmaps inside',
      value:
        count === null
          ? 'Cannot tell: the PDF keeps its parts compressed'
          : count === 0
            ? 'none: only shapes'
            : `${count} bitmap${count === 1 ? '' : 's'} (pictures made of pixels)`,
      explain:
        'A vector file can carry bitmaps (photos) inside it; they go blocky when enlarged, unlike the shapes. The papers can say "the SVG must not contain bitmap elements": trace the picture into shapes, or remove it.',
    });
  }
  rows.push(seeThroughRow(facts));
  const checked = checkExamName(fileName, candidate);
  const found = candidateInName(fileName);
  rows.push({
    label: 'File name',
    value: checked.pass
      ? `${checked.actual}: centre ${found!.centre}, candidate ${found!.number}`
      : `${checked.actual}: ${checked.why}`,
    explain:
      'The 9626 papers ask for each file to be named <name>_<centre number>_<candidate number>, for example Gas_ZZ999_9999, where ZZ999 and 9999 stand for your own centre and candidate number. Set them once in File ▸ Candidate Details… and every Save and Export box suggests the name.',
  });
  const raw = width && height && facts.depth ? (width * height * facts.depth) / 8 : undefined;
  rows.push({
    label: 'File size',
    value: facts.sizeBytes < 1000 ? `${facts.sizeBytes} bytes` : size(facts.sizeBytes),
    explain: `${group(facts.sizeBytes)} bytes (1 KB = 1 000 bytes).${raw ? ` Before compression the pixels take width × height × bits ÷ 8: ${width} × ${height} × ${facts.depth} ÷ 8 = ${group(Math.round(raw))} bytes${facts.sizeBytes < raw ? `; this file is ${Math.round((1 - facts.sizeBytes / raw) * 100)} % smaller` : ''}.` : ' A vector file stores shapes, not pixels: its size depends on how many shapes and points it has, not on how big it is shown.'}`,
  });
  return rows;
}
