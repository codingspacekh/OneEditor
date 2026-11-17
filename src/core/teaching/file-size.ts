// T2: the size of an uncompressed sound file, worked step by step as the coursebooks do it
// (Book A: sample rate × sample resolution × length; screen 21 adds the channels).
// 1 MB = 1 000 000 bytes, as in the books and the export dialogs.
import { hz } from '../render/audio-formats.ts';

export interface SoundSpec {
  sampleRate: number;
  /** Sample resolution (bit depth). */
  bits: number;
  channels: number;
  seconds: number;
}

export interface WorkingStep {
  label: string;
  working: string;
}

export interface AudioFileSize {
  bitsPerSecond: number;
  bits: number;
  bytes: number;
  mb: number;
  steps: WorkingStep[];
}

/** "84 672 000" — digits grouped in threes with a space, as in the coursebooks. */
export const group = (n: number): string => {
  const [whole, fraction] = String(n).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
};

export function audioFileSize({ sampleRate, bits, channels, seconds }: SoundSpec): AudioFileSize {
  const bitsPerSecond = sampleRate * bits * channels;
  const total = bitsPerSecond * seconds;
  const bytes = total / 8;
  const mb = bytes / 1_000_000;
  return {
    bitsPerSecond,
    bits: total,
    bytes,
    mb,
    steps: [
      {
        label: 'Bits each second',
        working: `${group(sampleRate)} × ${bits} × ${channels} = ${group(bitsPerSecond)} bits`,
      },
      { label: '× length', working: `${group(bitsPerSecond)} × ${seconds} = ${group(total)} bits` },
      { label: '÷ 8 → bytes', working: `${group(total)} ÷ 8 = ${group(bytes)} bytes` },
      { label: '÷ 1 000 000 → MB', working: `${group(bytes)} ÷ 1 000 000 = ${mb.toFixed(2)} MB` },
    ],
  };
}

/** "What if…" (screen 21): the size now, with the resolution doubled (or halved at 32-bit) and at half the sample rate. */
export function whatIf(spec: SoundSpec): { label: string; mb: number }[] {
  const other = spec.bits >= 32 ? spec.bits / 2 : spec.bits * 2;
  return [
    { label: `${spec.bits}-bit (now)`, mb: audioFileSize(spec).mb },
    { label: `${other}-bit`, mb: audioFileSize({ ...spec, bits: other }).mb },
    {
      label: hz(spec.sampleRate / 2),
      mb: audioFileSize({ ...spec, sampleRate: spec.sampleRate / 2 }).mb,
    },
  ];
}

export interface ImageSpec {
  width: number;
  height: number;
  /** Colour depth: bits a pixel. */
  bits: number;
}

export interface ImageFileSize {
  pixels: number;
  bits: number;
  bytes: number;
  kb: number;
  mb: number;
  steps: WorkingStep[];
}

/**
 * GC1 (M23): the size of an uncompressed picture, as the coursebook works it out: width × height
 * × colour depth (bits a pixel) ÷ 8 bytes; in MB (or KB when under 1 MB), 1 MB = 1 000 000 bytes.
 */
export function imageFileSize({ width, height, bits }: ImageSpec): ImageFileSize {
  const pixels = width * height;
  const total = pixels * bits;
  const bytes = total / 8;
  const kb = bytes / 1000;
  const mb = bytes / 1_000_000;
  return {
    pixels,
    bits: total,
    bytes,
    kb,
    mb,
    steps: [
      { label: 'Pixels', working: `${group(width)} × ${group(height)} = ${group(pixels)} pixels` },
      { label: '× colour depth', working: `${group(pixels)} × ${bits} = ${group(total)} bits` },
      { label: '÷ 8 → bytes', working: `${group(total)} ÷ 8 = ${group(bytes)} bytes` },
      mb >= 1
        ? {
            label: '÷ 1 000 000 → MB',
            working: `${group(bytes)} ÷ 1 000 000 = ${mb.toFixed(2)} MB`,
          }
        : { label: '÷ 1 000 → KB', working: `${group(bytes)} ÷ 1 000 = ${kb.toFixed(2)} KB` },
    ],
  };
}
