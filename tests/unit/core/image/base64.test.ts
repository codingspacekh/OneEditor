// G2, GB1 (M21): a pixel layer's PNG as base64 inside an SVG.
import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from '../../../../src/core/image/base64.ts';

describe('M21 GB1: base64', () => {
  it('gives what Node gives, for small and large bytes', () => {
    for (const length of [0, 1, 2, 3, 4, 0x18000 * 2 + 5]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 31) & 255);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
