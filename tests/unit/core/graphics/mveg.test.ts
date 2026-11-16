// D9 (M21): the .mveg file — a stored zip of doc.json and one PNG per pixel layer and mask —
// written, read back exactly, checked when saved and when opened; a JSON .mveg made before M21
// still opens.
import { describe, expect, it, vi } from 'vitest';
import { createLayer } from '../../../../src/core/animation/factory.ts';
import {
  ANIMATION_DAMAGED,
  deserializeAnimation,
  serializeAnimation,
} from '../../../../src/core/animation/serialize.ts';
import type { AnimationDoc, Layer } from '../../../../src/core/animation/types.ts';
import { createGraphic } from '../../../../src/core/graphics/document.ts';
import { readGraphicFile, writeGraphicFile } from '../../../../src/core/graphics/mveg.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  readRegion,
} from '../../../../src/core/graphics/pixels/raster.ts';
import { webCompression, type Compression } from '../../../../src/core/image/deflate.ts';
import { readZip, writeZip } from '../../../../src/core/project/zip.ts';

function image(): AnimationDoc {
  const doc = createGraphic({
    name: 'Castle',
    size: { width: 300, height: 200, units: 'px', dpi: 300 },
    background: '#ffffff',
  });
  const bitmap = fillRect(
    fillRect(createBitmap(300, 260), { x: 0, y: 0, width: 300, height: 260 }, [10, 20, 30, 255]),
    { x: 280, y: 250, width: 20, height: 10 },
    [200, 100, 50, 128],
  );
  const mask = fillRect(createMask(300, 260), { x: 0, y: 0, width: 150, height: 260 }, 255);
  const castle: Layer = {
    ...createLayer('CastleLayer'),
    opacity: 0.75,
    blend: 'multiply',
    pixels: { bitmap, x: -5, y: 3, mask },
  };
  const sky: Layer = {
    ...createLayer('SkyLayer'),
    clip: true,
    pixels: { bitmap: createBitmap(10, 10), x: 0, y: 0 },
  };
  return { ...doc, layers: [...doc.layers, castle, sky] };
}

const text = (s: string) => new TextEncoder().encode(s);

describe('M21 D9: the .mveg file', () => {
  it('M22: never keeps a live preview’s reduced copy', async () => {
    const doc = image();
    const layers = doc.layers.map((l) =>
      l.pixels ? { ...l, pixels: { ...l.pixels, scale: 2 } } : l,
    );
    await expect(writeGraphicFile({ ...doc, layers }, webCompression)).rejects.toThrow();
  });

  it('is a zip of doc.json and a PNG per bitmap and mask, read back exactly', async () => {
    const doc = image();
    const file = await writeGraphicFile(doc, webCompression);
    const entries = readZip(file);
    expect([...entries.keys()]).toEqual([
      'doc.json',
      'pixels/1.png',
      'pixels/1-mask.png',
      'pixels/2.png',
    ]);
    const json = JSON.parse(new TextDecoder().decode(entries.get('doc.json')));
    expect(json.layers[1].pixels).toEqual({
      bitmap: { width: 300, height: 260, file: 'pixels/1.png' },
      x: -5,
      y: 3,
      mask: { width: 300, height: 260, file: 'pixels/1-mask.png' },
    });
    expect(new TextDecoder().decode(file)).toContain('"graphic"');
    const back = await readGraphicFile(file, webCompression);
    const castle = back.layers[1]!;
    expect(castle).toMatchObject({ name: 'CastleLayer', opacity: 0.75, blend: 'multiply' });
    expect(back.layers[2]).toMatchObject({ clip: true });
    const { bitmap, mask } = castle.pixels!;
    expect(readRegion(bitmap)).toEqual(readRegion(doc.layers[1]!.pixels!.bitmap));
    expect(pixelAt(bitmap, 290, 255)).toEqual([200, 100, 50, 128]);
    expect(pixelAt(mask!, 149, 0)).toBe(255);
    expect(pixelAt(mask!, 150, 0)).toBe(0);
    // An empty layer stays empty: no tiles.
    expect(back.layers[2]!.pixels!.bitmap.tiles.every((t) => t === null)).toBe(true);
    expect(back.graphic).toEqual({ dpi: 300, units: 'px' });
  });

  it('makes a layer’s PNG once: saving again writes again only what changed', async () => {
    const deflate = vi.fn(webCompression.deflate);
    const counting: Compression = { ...webCompression, deflate };
    const doc = image();
    await writeGraphicFile(doc, counting);
    expect(deflate).toHaveBeenCalledTimes(3);
    await writeGraphicFile({ ...doc, name: 'Renamed' }, counting);
    expect(deflate).toHaveBeenCalledTimes(3);
    // A file opened keeps the PNGs it was read from.
    const opened = await readGraphicFile(
      await writeGraphicFile(doc, webCompression),
      webCompression,
    );
    await writeGraphicFile(opened, counting);
    expect(deflate).toHaveBeenCalledTimes(3);
  });

  it('opens a .mveg made before M21: the JSON alone, with spaces or a byte order mark first', async () => {
    const old = createGraphic({
      name: 'Logo',
      size: { width: 100, height: 100, units: 'px', dpi: 96 },
      background: '#ffffff',
    });
    const json = serializeAnimation(old);
    expect(await readGraphicFile(text(json), webCompression)).toEqual(old);
    expect(await readGraphicFile(text(`\n  ${json}`), webCompression)).toEqual(old);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...text(json)]);
    expect((await readGraphicFile(bom, webCompression)).name).toBe('Logo');
  });

  it('writes an animation without pixel layers as it always was', () => {
    const doc = createGraphic({
      name: 'Logo',
      size: { width: 100, height: 100, units: 'px', dpi: 96 },
      background: '#ffffff',
    });
    expect(serializeAnimation(doc)).toBe(`${JSON.stringify(doc, null, 2)}\n`);
  });

  it('refuses a file that is neither, or is damaged', async () => {
    const damaged = (bytes: Uint8Array) =>
      expect(readGraphicFile(bytes, webCompression)).rejects.toThrow(ANIMATION_DAMAGED);
    await damaged(text('hello'));
    await damaged(writeZip([{ name: 'other.txt', data: text('x') }]));
    const file = await writeGraphicFile(image(), webCompression);
    await damaged(file.subarray(0, file.length - 40));
    const entries = readZip(file);
    const without = (name: string) =>
      writeZip([...entries].filter(([n]) => n !== name).map(([n, data]) => ({ name: n, data })));
    await damaged(without('pixels/1-mask.png'));
    // A PNG that is not one.
    await damaged(
      writeZip(
        [...entries].map(([name, data]) => ({
          name,
          data: name === 'pixels/2.png' ? text('no') : data,
        })),
      ),
    );
    // A bitmap's PNG used as a mask (the sizes differ).
    await damaged(
      writeZip(
        [...entries].map(([name, data]) => ({
          name,
          data: name === 'pixels/1-mask.png' ? entries.get('pixels/2.png')! : data,
        })),
      ),
    );
  });

  it('refuses to save what would not open again', async () => {
    const doc = image();
    const wrong = {
      ...doc,
      layers: doc.layers.map((l, i) => (i === 1 ? { ...l, opacity: 2 } : l)),
    };
    await expect(writeGraphicFile(wrong, webCompression)).rejects.toThrow(/could not be saved/);
    const animation = { ...wrong };
    delete animation.graphic;
    await expect(writeGraphicFile(animation, webCompression)).rejects.toThrow(
      /animation could not/,
    );
  });
});

describe('M21 G2: the file checks of a layer', () => {
  const layerJson = (extra: Record<string, unknown>) => {
    const doc = createGraphic({
      name: 'T',
      size: { width: 100, height: 100, units: 'px', dpi: 96 },
      background: '#ffffff',
    });
    return JSON.stringify({ ...doc, layers: [{ ...doc.layers[0], ...extra }] });
  };
  const ref = { width: 2, height: 2, file: 'pixels/0.png' };
  const bitmap = createBitmap(2, 2);

  it('takes opacity 0–1, a blend mode, clipping and pixels', () => {
    const doc = deserializeAnimation(
      layerJson({
        opacity: 0,
        blend: 'luminosity',
        clip: false,
        pixels: { bitmap: ref, x: 1, y: -1 },
      }),
      () => bitmap,
    );
    expect(doc.layers[0]).toMatchObject({ opacity: 0, blend: 'luminosity', clip: false });
    expect(doc.layers[0]!.pixels!.bitmap).toBe(bitmap);
  });

  it.each([
    ['an opacity above 1', { opacity: 1.5 }],
    ['an opacity below 0', { opacity: -0.1 }],
    ['an unknown blend mode', { blend: 'burn' }],
    ['clipping that is not yes or no', { clip: 'yes' }],
    ['pixels not at whole px', { pixels: { bitmap: ref, x: 0.5, y: 0 } }],
    ['pixels with no size', { pixels: { bitmap: { ...ref, width: 0 }, x: 0, y: 0 } }],
    ['pixels with no file', { pixels: { bitmap: { width: 2, height: 2 }, x: 0, y: 0 } }],
    ['a mask of another size', { pixels: { bitmap: ref, x: 0, y: 0, mask: { ...ref, width: 3 } } }],
    [
      'pixels and objects too',
      { pixels: { bitmap: ref, x: 0, y: 0 }, objects: [{ kind: 'rect' }] },
    ],
  ])('refuses %s', (_what, extra) => {
    expect(() => deserializeAnimation(layerJson(extra), () => bitmap)).toThrow(ANIMATION_DAMAGED);
  });

  it('refuses pixels it cannot find, of another size, or a mask that is a bitmap', () => {
    const pixels = { bitmap: ref, x: 0, y: 0 };
    expect(() => deserializeAnimation(layerJson({ pixels }))).toThrow(ANIMATION_DAMAGED);
    expect(() => deserializeAnimation(layerJson({ pixels }), () => createBitmap(3, 2))).toThrow(
      ANIMATION_DAMAGED,
    );
    expect(() =>
      deserializeAnimation(layerJson({ pixels: { ...pixels, mask: ref } }), () => bitmap),
    ).toThrow(ANIMATION_DAMAGED);
  });
});
