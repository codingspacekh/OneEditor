// M23 / G10: Image size warns when a print would be blocky (below 150 dpi at its printed size)
// and when a picture for the web is far bigger than a screen (more than 4 times a 1920 × 1080
// one) — both at once if both are so; nothing for a sensible size.
import { describe, expect, it } from 'vitest';
import { PRINT_DPI, resolutionWarnings, SCREEN } from '../../../../src/core/graphics/image-size.ts';

describe('G10 (M23): resolution warnings', () => {
  it('below 150 dpi for print: blocky, with the printed size', () => {
    expect(PRINT_DPI).toBe(150);
    const [warning] = resolutionWarnings({ width: 1000, height: 500 }, 100, { print: true });
    expect(warning).toBe(
      'At 100 dpi a print looks blocky (pixelated): 1000 × 500 px prints 25.4 × 12.7 cm. Print at 150 dpi or more (300 is usual).',
    );
    expect(resolutionWarnings({ width: 1000, height: 500 }, 150, { print: true })).toEqual([]);
    // A picture for the screen is not printed: its dpi does not matter.
    expect(resolutionWarnings({ width: 1000, height: 500 }, 72, { print: false })).toEqual([]);
  });

  it('more than 4 times a screen: far too big for the web', () => {
    expect(SCREEN).toEqual({ width: 1920, height: 1080 });
    expect(resolutionWarnings({ width: 7680, height: 4320 }, 96, { print: false })).toEqual([]);
    const [wide] = resolutionWarnings({ width: 7681, height: 100 }, 96, { print: false });
    expect(wide).toMatch(/^Far bigger than a screen needs: 7681 × 100 px is more than 4 times/);
    expect(resolutionWarnings({ width: 100, height: 4321 }, 96, { print: false })).toHaveLength(1);
  });

  it('both at once', () => {
    expect(resolutionWarnings({ width: 8000, height: 6000 }, 72, { print: true })).toHaveLength(2);
  });
});
