// GL2 (M23): the papers' own pictures read by the task checker's image facts — the pixel size,
// dpi, printed size, depth and see-through pixels the tasks ask about, a JPEG's quality estimate,
// and ChipLeg.svg's size and bitmaps. Skipped where the papers' files are not on the computer (CI).
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { imageFacts } from '../../src/core/image/info.ts';
import { checkFile, imageInfo } from '../../src/core/teaching/task-check.ts';
import { hasPapers, paperFile } from './helpers/pixels.ts';

const facts = async (relative: string) =>
  imageFacts(new Uint8Array(await readFile(paperFile(relative))), relative.split('/').pop()!);

describe.skipIf(!hasPapers)('GL2 (M23) the papers’ pictures, read for the task checker', () => {
  it('M/26 Chip.png: 1181 × 709 px at 300 dpi is 10 × 6 cm, 32-bit, with see-through pixels', async () => {
    const f = await facts('2026_03_March/Chip.png');
    expect(f).toMatchObject({
      format: 'png',
      width: 1181,
      height: 709,
      dpi: { x: 300, y: 300 },
      depth: 32,
      seeThrough: 'used',
    });
    expect(f.print!.widthCm).toBeCloseTo(10, 1);
    expect(f.print!.heightCm).toBeCloseTo(6, 1);
    const task = {
      name: 'Chip',
      container: 'png',
      printWidth: 10,
      printHeight: 6,
      dpi: 300,
      transparent: true,
    };
    expect(checkFile(task, imageInfo(f, 'Chip.png')).pass).toBe(true);
  });

  it('M/26 ChipLeg.svg: 77.44 × 240 px, no viewBox, no bitmaps', async () => {
    const f = await facts('2026_03_March/ChipLeg.svg');
    expect(f).toMatchObject({
      format: 'svg',
      width: 77.44,
      height: 240,
      svg: { unit: 'px', bitmaps: 0 },
    });
    expect(f.svg!.viewBox).toBeUndefined();
  });

  it("the photos: sizes and dpi as the papers give them; libjpeg's quality 90–91", async () => {
    const photos: [string, number, number, number, number][] = [
      ['2023_11_November/Castle.jpg', 3630, 1155, 96, 91],
      ['2022_03_March/Heron.jpg', 3744, 2104, 180, 90],
      ['2024_11_November/Bay.jpg', 1600, 1200, 180, 91],
      ['2019_11_November/Pearl.jpg', 300, 300, 96, 91],
    ];
    for (const [file, width, height, dpi, quality] of photos) {
      const f = await facts(file);
      expect(f, file).toMatchObject({
        format: 'jpg',
        width,
        height,
        dpi: { x: dpi, y: dpi },
        depth: 24,
        seeThrough: 'none',
        jpeg: { quality, exact: true },
      });
    }
    // Ocean.jpg was saved by a program with tables of its own: an estimate, said to be one.
    const ocean = await facts('2023_11_November/Ocean.jpg');
    expect(ocean.jpeg!.exact).toBe(false);
    expect(ocean.jpeg!.quality).toBeGreaterThan(85);
  });

  it('the PNGs with an alpha channel: some use it, some are solid everywhere', async () => {
    expect((await facts('2025_03_March/Tier.png')).seeThrough).toBe('used');
    expect((await facts('2021_03_March/WorldMap.png')).seeThrough).toBe('used');
    expect((await facts('2024_11_November/Moonlight.png')).seeThrough).toBe('unused');
    expect((await facts('2021_11_November/Background1.png')).seeThrough).toBe('unused');
  });
});
