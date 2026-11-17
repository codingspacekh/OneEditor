// M21, M22: Graphics mode's app on the papers' own files, for the acceptance tests — pictures read
// by helpers/pixels.ts where the page would decode them on a canvas, and PNG exports drawn by the
// pixel compositor (the app draws them on a canvas, which the e2e tests check).
import { readFile } from 'node:fs/promises';
import { expect } from 'vitest';
import type { AnimationDoc, PixelContent } from '../../../src/core/animation/types.ts';
import { compositeLayers, drawnPixelLayers } from '../../../src/core/graphics/pixels/merge.ts';
import { readRegion, type Bitmap } from '../../../src/core/graphics/pixels/raster.ts';
import { resampleBitmap } from '../../../src/core/graphics/pixels/resample.ts';
import { webCompression } from '../../../src/core/image/deflate.ts';
import { decodePng, encodePng } from '../../../src/core/image/png.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';
import { loadBitmap, paperFile } from './pixels.ts';

/** The image as the PNG export draws its pixel layers (at its size or scaled to `size`). */
export function drawnImage(doc: AnimationDoc, size?: { width: number; height: number }): Bitmap {
  const { width, height } = doc.stage;
  const whole = compositeLayers(drawnPixelLayers(doc), { x: 0, y: 0, width, height });
  return size && (size.width !== width || size.height !== height)
    ? resampleBitmap(whole, size.width, size.height, 'bicubic')
    : whole;
}

export async function graphics(files: string[]) {
  const t = testApp(Object.fromEntries(files.map((f) => [paperFile(f), IMAGE])));
  await t.app.candidate.set({ centre: 'ZZ999', number: '9999', name: 'Ann' });
  const g = t.app.graphics;
  // The app reads a picture's file for its resolution.
  for (const f of files) t.bytes.set(paperFile(f), new Uint8Array(await readFile(paperFile(f))));
  // The page decodes pictures on a canvas; here the papers' files are read by helpers/pixels.ts.
  t.stageRenderer.pixels.mockImplementation(async (path) => {
    const { bitmap } = await loadBitmap(path);
    return { width: bitmap.width, height: bitmap.height, data: readRegion(bitmap) };
  });
  t.stageRenderer.renderPng.mockImplementation(async (doc, _frame, size) => {
    const b = drawnImage(doc, size);
    return encodePng(
      { width: b.width, height: b.height, channels: 4, data: readRegion(b) },
      webCompression,
    );
  });
  const doc = () => g.store.get().history.present;
  const layer = () => doc().layers.find((l) => l.id === g.store.get().layerId)!;
  const pixels = (): PixelContent => layer().pixels!;
  async function open(file: string) {
    t.dialogs.openPicture.mockResolvedValueOnce(paperFile(file));
    expect(await g.openPictureAsImage()).toBe(true);
  }
  async function addLayer(file: string) {
    t.dialogs.openPicture.mockResolvedValueOnce(paperFile(file));
    await g.addPictureAsLayer();
  }
  async function exportTo(path: string, options: Parameters<typeof g.exportImage>[0]) {
    t.dialogs.exportGraphic.mockResolvedValueOnce(path);
    const written = await g.exportImage(options);
    expect(g.store.get().message?.kind).not.toBe('error');
    expect(written).toContain(path);
    return t.bytes.get(path) ?? new TextEncoder().encode(t.disk.get(path) ?? '');
  }
  const png = async (bytes: Uint8Array) => decodePng(bytes, webCompression);
  return { ...t, g, doc, layer, pixels, open, addLayer, exportTo, png };
}

/** The share of a bitmap's pixels that are wholly transparent. */
export function clearShare(b: { width: number; height: number; data: Uint8ClampedArray }): number {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i] === 0) n++;
  return n / (b.width * b.height);
}
