// M23 step 5 (GN4): the Graphics document the Cross-platform job exports on Windows and macOS —
// built the same every time (so the other computer's layers can be checked byte for byte), with
// every kind of drawing the check is for, saved as a .mveg and opened again unchanged — and how
// two exports are compared: the same picture passes; one drawn a little differently, or with the
// words moved, does not.
import { describe, expect, it } from 'vitest';
import {
  comparePictures,
  CROSS_GRAPHIC,
  crossGraphic,
  inkBox,
  TEXT_BOX,
  type Picture,
} from '../../../scripts/lib/cross-graphic.ts';
import { readGraphicFile, writeGraphicFile } from '../../../src/core/graphics/mveg.ts';
import { webCompression } from '../../../src/core/image/deflate.ts';
import { readRegion } from '../../../src/core/graphics/pixels/raster.ts';

const bytesOf = (doc: ReturnType<typeof crossGraphic>) =>
  doc.layers.flatMap((l) => (l.pixels ? [Buffer.from(readRegion(l.pixels.bitmap).buffer)] : []));

/** A white picture with black "ink" in a box. */
function picture(ink: { x: number; y: number; width: number; height: number }): Picture {
  const { width, height } = CROSS_GRAPHIC;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = ink.y; y < ink.y + ink.height; y++)
    for (let x = ink.x; x < ink.x + ink.width; x++) data.set([0, 0, 0, 255], (y * width + x) * 4);
  return { width, height, data };
}

describe('GN4 (M23): the cross-platform Graphics document', () => {
  it('GN4 (M23): a filtered photo, gradient shapes, a screened layer with a glow and words', () => {
    const doc = crossGraphic();
    expect(doc.stage).toMatchObject({ ...CROSS_GRAPHIC, background: '#ffffff' });
    expect(doc.layers.map((l) => l.name)).toEqual(['Photo', 'Shapes', 'Glow', 'Words']);
    const [photo, shapes, glow, words] = doc.layers;
    expect(photo!.pixels!.bitmap).toMatchObject(CROSS_GRAPHIC);
    expect(shapes!.objects.map((o) => o.fill.kind)).toEqual(['linear', 'radial', 'solid', 'solid']);
    expect(glow).toMatchObject({ blend: 'screen', opacity: 0.85, effects: [{ kind: 'glow' }] });
    expect(words!.objects[0]).toMatchObject({ kind: 'text', text: 'Lake Naivasha' });
  });

  it('GN4 (M23): the same bytes every time it is built, and after a .mveg is saved and opened', async () => {
    const made = bytesOf(crossGraphic());
    bytesOf(crossGraphic()).forEach((b, i) => expect(b.equals(made[i]!)).toBe(true));
    const again = await readGraphicFile(
      await writeGraphicFile(crossGraphic(), webCompression),
      webCompression,
    );
    bytesOf(again).forEach((b, i) => expect(b.equals(made[i]!)).toBe(true));
    expect(again.layers[2]).toMatchObject({ blend: 'screen', effects: [{ kind: 'glow' }] });
  });
});

describe('GN4 (M23): comparing two exports', () => {
  const words = { x: TEXT_BOX.x + 12, y: TEXT_BOX.y + 10, width: 200, height: 40 };

  it('GN4 (M23): the same picture: no difference anywhere; the ink in the same box', () => {
    const a = picture(words);
    const diff = comparePictures(a, picture(words));
    expect(diff).toMatchObject({ psnr: Infinity, largest: 0, textPsnr: Infinity });
    expect(diff.ink[0]).toEqual(diff.ink[1]);
    expect(inkBox(a, TEXT_BOX)).toEqual([
      words.y,
      words.y + words.height - 1,
      words.x,
      words.x + words.width - 1,
    ]);
  });

  it('GN4 (M23): drawn differently outside the words, or the words moved: it shows', () => {
    const a = picture(words);
    const b = picture(words);
    for (let i = 0; i < 4000; i += 4) b.data[i] = 0; // a stripe drawn wrongly at the top
    const off = comparePictures(a, b);
    expect(off.psnr).toBeLessThan(40);
    expect(off.largest).toBe(255);
    expect(off.textPsnr).toBe(Infinity);
    const moved = comparePictures(a, picture({ ...words, x: words.x + 3 }));
    expect(moved.psnr).toBe(Infinity);
    expect(moved.ink[1][2] - moved.ink[0][2]).toBe(3);
    expect(() => comparePictures(a, { width: 1, height: 1, data: new Uint8Array(4) })).toThrow(
      /Different sizes/,
    );
  });
});
