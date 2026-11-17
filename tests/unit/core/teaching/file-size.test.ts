import { describe, expect, it } from 'vitest';
import {
  audioFileSize,
  group,
  imageFileSize,
  whatIf,
} from '../../../../src/core/teaching/file-size.ts';

const question5a = { sampleRate: 44100, bits: 16, channels: 1, seconds: 120 };

describe('T2 audio file-size calculator', () => {
  it('Book A Question 5a: 2 minutes at 44.1 kHz, 16-bit, mono = 84 672 000 bits = 10.58 MB', () => {
    const size = audioFileSize(question5a);
    expect(size.bitsPerSecond).toBe(705_600);
    expect(size.bits).toBe(84_672_000);
    expect(size.bytes).toBe(10_584_000);
    expect(size.mb).toBeCloseTo(10.584, 6);
  });

  it('Book A Question 5b: 32-bit doubles the size', () => {
    expect(audioFileSize({ ...question5a, bits: 32 }).bytes).toBe(2 * 10_584_000);
  });

  it('stereo doubles the size too', () => {
    expect(audioFileSize({ ...question5a, channels: 2 }).bits).toBe(2 * 84_672_000);
  });

  it('shows the working step by step, as screen 21: bits → bytes → MB', () => {
    expect(audioFileSize(question5a).steps).toEqual([
      { label: 'Bits each second', working: '44 100 × 16 × 1 = 705 600 bits' },
      { label: '× length', working: '705 600 × 120 = 84 672 000 bits' },
      { label: '÷ 8 → bytes', working: '84 672 000 ÷ 8 = 10 584 000 bytes' },
      { label: '÷ 1 000 000 → MB', working: '10 584 000 ÷ 1 000 000 = 10.58 MB' },
    ]);
  });

  it('a length with a fraction of a second keeps it in the working', () => {
    const size = audioFileSize({ ...question5a, seconds: 2.5 });
    expect(size.bits).toBe(1_764_000);
    expect(size.steps[1]!.working).toBe('705 600 × 2.5 = 1 764 000 bits');
  });

  it('"What if…": the resolution doubled and the sample rate halved', () => {
    expect(whatIf(question5a)).toEqual([
      { label: '16-bit (now)', mb: 10.584 },
      { label: '32-bit', mb: 21.168 },
      { label: '22 050 Hz', mb: 5.292 },
    ]);
  });

  it('"What if…" at 32-bit shows 16-bit instead (there is no 64-bit audio)', () => {
    expect(whatIf({ ...question5a, bits: 32 })[1]).toEqual({ label: '16-bit', mb: 10.584 });
  });

  it('groups digits in threes with a space, as the coursebooks', () => {
    expect(group(84672000)).toBe('84 672 000');
    expect(group(950)).toBe('950');
    expect(group(2.5)).toBe('2.5');
  });
});

describe('GC1 (M23) image file-size calculator: width × height × bits ÷ 8', () => {
  it('the coursebook’s photo: 1600 × 1200 at 2 bytes (16 bits) a pixel = 3.84 MB', () => {
    const size = imageFileSize({ width: 1600, height: 1200, bits: 16 });
    expect(size.pixels).toBe(1_920_000);
    expect(size.bits).toBe(30_720_000);
    expect(size.bytes).toBe(3_840_000);
    expect(size.mb).toBeCloseTo(3.84, 6);
    expect(size.steps).toEqual([
      { label: 'Pixels', working: '1 600 × 1 200 = 1 920 000 pixels' },
      { label: '× colour depth', working: '1 920 000 × 16 = 30 720 000 bits' },
      { label: '÷ 8 → bytes', working: '30 720 000 ÷ 8 = 3 840 000 bytes' },
      { label: '÷ 1 000 000 → MB', working: '3 840 000 ÷ 1 000 000 = 3.84 MB' },
    ]);
  });

  it('100 pixels at 1 bit = 100 bits = 12.5 bytes; a small picture is worked out in KB', () => {
    expect(imageFileSize({ width: 10, height: 10, bits: 1 }).bytes).toBe(12.5);
    const icon = imageFileSize({ width: 200, height: 200, bits: 24 });
    expect(icon.kb).toBe(120);
    expect(icon.steps[3]).toEqual({
      label: '÷ 1 000 → KB',
      working: '120 000 ÷ 1 000 = 120.00 KB',
    });
  });

  it('halving the bits halves the size; halving the width and height quarters it', () => {
    const full = imageFileSize({ width: 800, height: 600, bits: 24 }).bytes;
    expect(imageFileSize({ width: 800, height: 600, bits: 12 }).bytes).toBe(full / 2);
    expect(imageFileSize({ width: 400, height: 300, bits: 24 }).bytes).toBe(full / 4);
  });
});
