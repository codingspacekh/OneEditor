// M21 (GB1, D9): the papers' pictures load as bitmaps (helpers/pixels.ts) and keep every pixel
// through a .mveg. Skipped where the papers' files are not on the computer (CI).
import { describe, expect, it } from 'vitest';
import { createLayer } from '../../src/core/animation/factory.ts';
import { createGraphic } from '../../src/core/graphics/document.ts';
import { readGraphicFile, writeGraphicFile } from '../../src/core/graphics/mveg.ts';
import { contentBounds, pixelAt, readRegion } from '../../src/core/graphics/pixels/raster.ts';
import { webCompression } from '../../src/core/image/deflate.ts';
import { hasPapers, loadBitmap, paperFile } from './helpers/pixels.ts';

describe.skipIf(!hasPapers)('M21 GB1: the papers’ pictures as bitmaps', () => {
  it('loads Tier.png (1200 × 1200, see-through round the tiers) with our PNG reader', async () => {
    const { bitmap } = await loadBitmap(paperFile('2025_03_March/Tier.png'));
    expect(bitmap).toMatchObject({ width: 1200, height: 1200 });
    expect(contentBounds(bitmap)).not.toBeNull();
  });

  it('loads Castle.jpg through FFmpeg and keeps it exactly in a .mveg (D9)', async () => {
    const { bitmap } = await loadBitmap(paperFile('2023_11_November/Castle.jpg'));
    expect(pixelAt(bitmap, 0, 0)[3]).toBe(255);
    const doc = createGraphic({
      name: 'Castle',
      size: { width: bitmap.width, height: bitmap.height, units: 'px', dpi: 96 },
      background: 'none',
    });
    const layer = { ...createLayer('CastleLayer'), pixels: { bitmap, x: 0, y: 0 } };
    const file = await writeGraphicFile({ ...doc, layers: [layer] }, webCompression);
    const back = await readGraphicFile(file, webCompression);
    // Compared as bytes: a deep comparison of 38 million numbers would run out of memory.
    const same = Buffer.compare(
      Buffer.from(readRegion(back.layers[0]!.pixels!.bitmap).buffer),
      Buffer.from(readRegion(bitmap).buffer),
    );
    expect(same).toBe(0);
  });
});
