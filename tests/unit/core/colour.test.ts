import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normaliseHex } from '../../../src/core/colour.ts';

describe("the colour picker's colour maths", () => {
  it('reads the hex codes people type: with or without #, 3 or 6 digits, any capitals', () => {
    expect(normaliseHex('#F4C8EE')).toBe('#f4c8ee');
    expect(normaliseHex('f4c8ee')).toBe('#f4c8ee');
    expect(normaliseHex(' #abc ')).toBe('#aabbcc');
    expect(normaliseHex('#12345')).toBeNull();
    expect(normaliseHex('red')).toBeNull();
  });

  it('turns a colour into hue, saturation and brightness and back without change', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 });
    expect(hexToHsv('#00ff00').h).toBeCloseTo(120, 6);
    for (const hex of ['#f4c8ee', '#333333', '#2f7fe0', '#c8901a', '#00008b', '#7c3aed'])
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
});

describe('G8 (M23): a colour with its own opacity, #rrggbbaa', () => {
  it('G8 the opacity in %, the colour without it, and the two put together', async () => {
    const { alphaOf, opaqueOf, withAlpha } = await import('../../../src/core/colour.ts');
    expect(alphaOf('#ff0000')).toBe(100);
    expect(alphaOf('#ff000080')).toBe(50);
    expect(alphaOf('#FF000000')).toBe(0);
    expect(opaqueOf('#ff000080')).toBe('#ff0000');
    expect(opaqueOf('#FF0000')).toBe('#FF0000');
    expect(withAlpha('#ff0000', 100)).toBe('#ff0000');
    expect(withAlpha('#ff0000', 50)).toBe('#ff000080');
    expect(withAlpha('#ff000080', 0)).toBe('#ff000000');
    expect(withAlpha('#ff000080', 100)).toBe('#ff0000');
  });
});
