// M22 step 4 (GB5, GN2): the Filter menu in Graphics mode's app — each filter done on the current
// pixel layer through the pixel worker, its settings in image px placed on the layer's pixels, one
// undo step named after it, kept inside the selection, refused in words when a setting is out of
// range; previewed live on a reduced copy of a big layer; its dialog's starting settings taken from
// the layer or the selection.
import { describe, expect, it } from 'vitest';
import { execute } from '../../../src/app/history.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import { restMesh } from '../../../src/core/graphics/pixels/distort.ts';
import {
  createBitmap,
  fillRect,
  maskFromBytes,
  pixelAt,
  type Bitmap,
} from '../../../src/core/graphics/pixels/raster.ts';
import { testApp } from '../../helpers/test-app.ts';

/** A layer whose red is its x (on the layer), green 0, opaque. */
function rampBitmap(width: number, height: number): Bitmap {
  let b = createBitmap(width, height);
  for (let x = 0; x < width; x++)
    b = fillRect(b, { x, y: 0, width: 1, height }, [x % 256, 0, 0, 255]);
  return b;
}

function setup(bitmap: Bitmap = rampBitmap(200, 100), at = { x: 20, y: 10 }) {
  const t = testApp();
  const g = t.app.graphics;
  const photo = createLayer('Photo', { pixels: { bitmap, ...at } });
  const shapes = createLayer('Shapes');
  g.store.update((s) => ({
    ...s,
    history: execute(s.history, {
      label: 'Open',
      apply: (d) => ({
        ...d,
        stage: { ...d.stage, width: 300, height: 200 },
        layers: [photo, shapes],
      }),
    }),
    layerId: photo.id,
  }));
  const pixels = () => g.store.get().history.present.layers.find((l) => l.id === photo.id)!.pixels!;
  return { ...t, g, pixels, photo, shapes };
}

describe('M22 GB5: the filters in the app', () => {
  it('M22 GB5: a bulge centred in image px on a layer placed at (20, 10): one undo step, “Bulge / pinch”', async () => {
    const s = setup();
    const steps = s.g.store.get().history.past.length;
    // The lens centred on the image's (120, 60): the layer's own (100, 50).
    const done = await s.g.applyFilter({
      kind: 'bulge',
      centre: { x: 120, y: 60 },
      radius: 40,
      amount: 50,
    });
    expect(done).toBe(true);
    // Magnified about the layer's x 100: the pixel 10 px right of it shows about 6 px right.
    const red = pixelAt(s.pixels().bitmap, 110, 50)[0];
    expect(red).toBeGreaterThan(104);
    expect(red).toBeLessThan(108);
    expect(pixelAt(s.pixels().bitmap, 10, 50)[0]).toBe(10);
    expect(s.g.store.get().history.past.length).toBe(steps + 1);
    expect(s.g.store.get().history.past.at(-1)!.label).toBe('Bulge / pinch');
    s.g.undo();
    expect(pixelAt(s.pixels().bitmap, 110, 50)[0]).toBe(110);
  });

  it('M22 GB5: a Gaussian blur is kept inside the selection', async () => {
    const stripes = fillRect(
      fillRect(createBitmap(100, 40), { x: 0, y: 0, width: 100, height: 40 }, [0, 0, 0, 255]),
      { x: 0, y: 0, width: 100, height: 20 },
      [255, 255, 255, 255],
    );
    const s = setup(stripes, { x: 0, y: 0 });
    s.g.selectRect({ x: 0, y: 0, width: 50, height: 40 }, { antiAlias: false });
    expect(await s.g.applyFilter({ kind: 'gaussian', radius: 3 })).toBe(true);
    // The edge between white and black softened on the left, still hard on the right.
    expect(pixelAt(s.pixels().bitmap, 20, 19)[0]).toBeLessThan(250);
    expect(pixelAt(s.pixels().bitmap, 80, 19)[0]).toBe(255);
    expect(pixelAt(s.pixels().bitmap, 80, 20)[0]).toBe(0);
  });

  it('M22 GB5: works on the layer mask while it is edited', async () => {
    const s = setup();
    const bytes = new Uint8ClampedArray(200 * 100);
    for (let y = 0; y < 100; y++) for (let x = 100; x < 200; x++) bytes[y * 200 + x] = 255;
    s.g.store.update((st) => ({
      ...st,
      history: execute(st.history, {
        label: 'Mask',
        apply: (d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === s.photo.id
              ? { ...l, pixels: { ...l.pixels!, mask: maskFromBytes(200, 100, bytes) } }
              : l,
          ),
        }),
      }),
      editingMask: true,
    }));
    await s.g.applyFilter({ kind: 'motion', angle: 0, distance: 10 });
    const m = s.pixels().mask!;
    expect(pixelAt(m, 98, 50)).toBeGreaterThan(0);
    expect(pixelAt(m, 98, 50)).toBeLessThan(255);
    expect(pixelAt(s.pixels().bitmap, 98, 50)[0]).toBe(98);
  });

  it('M22 GB5: a setting out of range is refused in words, the layer as it was', async () => {
    const s = setup();
    const before = s.pixels().bitmap;
    expect(
      await s.g.applyFilter({ kind: 'twirl', centre: { x: 50, y: 50 }, radius: 0, angle: 90 }),
    ).toBe(false);
    expect(s.g.store.get().message).toMatchObject({ kind: 'error' });
    expect(s.g.store.get().message!.text).toMatch(/Radius/);
    expect(s.pixels().bitmap).toBe(before);
    // On a vector layer: refused as any pixel edit is.
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    expect(await s.g.applyFilter({ kind: 'gaussian', radius: 2 })).toBe(false);
  });

  it('M22 GN2: the live preview of a big layer is a reduced copy, its centre and radius scaled with it', async () => {
    const s = setup(rampBitmap(2000, 1000), { x: 0, y: 0 });
    await s.g.previewFilter({ kind: 'twirl', centre: { x: 1000, y: 500 }, radius: 400, angle: 90 });
    const shown = s.g.pixelPreview()!;
    expect(shown.layerId).toBe(s.photo.id);
    expect(shown.pixels.bitmap.width).toBeLessThan(2000);
    // The rim of the circle (400 px out) is not turned: just outside it, the ramp as it was.
    const k = (shown.pixels as { scale?: number }).scale!;
    expect(k).toBeGreaterThan(1);
    const outside = Math.round((1000 + 410) / k);
    expect(
      Math.abs(pixelAt(shown.pixels.bitmap, outside, 10)[0] - ((outside * k) % 256)),
    ).toBeLessThan(4);
    // The document is not changed; settings that cannot be used take the preview away.
    expect(s.pixels().bitmap.width).toBe(2000);
    await s.g.previewFilter({ kind: 'gaussian', radius: -1 });
    expect(s.g.pixelPreview()).toBeUndefined();
    await s.g.previewFilter({ kind: 'gaussian', radius: 2 });
    expect(s.g.pixelPreview()).toBeDefined();
    await s.g.previewFilter(null);
    expect(s.g.pixelPreview()).toBeUndefined();
  });

  it('M22 GB5: a dialog starts on the layer, or on the selected part of it', () => {
    const s = setup();
    expect(s.g.filterStart('twirl')).toMatchObject({ centre: { x: 120, y: 60 }, radius: 50 });
    expect(s.g.filterStart('warp')).toEqual({ kind: 'warp', points: restMesh(200, 100, 20, 10) });
    s.g.selectRect({ x: 40, y: 20, width: 40, height: 20 }, { antiAlias: false });
    expect(s.g.filterStart('bulge')).toMatchObject({ centre: { x: 60, y: 30 }, radius: 10 });
    s.g.store.update((st) => ({ ...st, layerId: s.shapes.id }));
    expect(s.g.filterStart('zoom')).toBeNull();
  });
});
