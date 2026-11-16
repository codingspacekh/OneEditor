// M21 G2, GB1, D9 (Graphics mode's app): pixel layers — new, a picture opened as an image or
// added as a layer, pasted; opacity, blend, clipping, layer masks, duplicate; merge down, merge
// visible, flatten (a vector layer drawn into pixels, with a note); the .mveg zip saved, opened,
// recovered and packaged; the SVG with its pixel layers inside; each layer exported apart; pixel
// layers sent to Animation mode as pictures.
import { describe, expect, it } from 'vitest';
import { readGraphicFile, writeGraphicFile } from '../../../src/core/graphics/mveg.ts';
import { createMask, fillRect, pixelAt } from '../../../src/core/graphics/pixels/raster.ts';
import { webCompression } from '../../../src/core/image/deflate.ts';
import { jpegWithDpi } from '../../../src/core/image/dpi.ts';
import { decodePng } from '../../../src/core/image/png.ts';
import { readZip } from '../../../src/core/project/zip.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';
import { TINY_JPEG } from '../../helpers/tiny-images.ts';

const PHOTO = { ...IMAGE, video: { codec: 'mjpeg', width: 40, height: 30 } };

function setup() {
  const t = testApp({ '/m/Castle.jpg': PHOTO, '/m/Ocean.png': PHOTO, '/m/notes.txt': PHOTO });
  const g = t.app.graphics;
  const doc = () => g.store.get().history.present;
  const message = () => g.store.get().message?.text ?? '';
  /** The picture the renderer decodes next: w × h of one colour. */
  const nextPicture = (width: number, height: number, rgba = [255, 0, 0, 255]) =>
    t.stageRenderer.pixels.mockResolvedValueOnce({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4).map((_, i) => rgba[i % 4]!),
    });
  const current = () => doc().layers.find((l) => l.id === g.store.get().layerId)!;
  return { ...t, g, doc, message, nextPicture, current };
}

/** An image with a 100 × 80 pixel layer of red, the current layer. */
async function withPhoto() {
  const s = setup();
  s.bytes.set('/m/Castle.jpg', jpegWithDpi(TINY_JPEG, 300));
  s.dialogs.openPicture.mockResolvedValueOnce('/m/Castle.jpg');
  s.nextPicture(100, 80);
  expect(await s.g.openPictureAsImage()).toBe(true);
  return s;
}

describe('M21 GB1: pixel layers', () => {
  it('adds an empty pixel layer the size of the image, as the current layer', () => {
    const s = setup();
    s.g.addPixelLayer();
    expect(s.doc().layers).toHaveLength(2);
    expect(s.current().pixels!.bitmap).toMatchObject({ width: 1280, height: 720 });
    s.g.undo();
    expect(s.doc().layers).toHaveLength(1);
  });

  it('is for Graphics mode only', async () => {
    const s = setup();
    const anim = s.app.animation;
    anim.addPixelLayer();
    expect(anim.store.get().message?.text).toMatch(/Graphics mode/);
    expect(await anim.openPictureAsImage()).toBe(false);
    await anim.addPictureAsLayer();
    anim.pastePixels({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    await anim.mergeLayers('flatten');
    expect(anim.store.get().history.present.layers).toHaveLength(1);
  });

  it('opens a photo as a new image of its size, at the resolution in its file', async () => {
    const s = await withPhoto();
    expect(s.doc().stage).toMatchObject({ width: 100, height: 80, background: 'none' });
    expect(s.doc().graphic).toEqual({ dpi: 300, units: 'px' });
    expect(s.doc().layers.map((l) => l.name)).toEqual(['Castle']);
    expect(s.doc().layers[0]!.pixels).toMatchObject({ x: 0, y: 0 });
    expect(pixelAt(s.doc().layers[0]!.pixels!.bitmap, 99, 79)).toEqual([255, 0, 0, 255]);
    expect(s.message()).toBe('Opened Castle.jpg as a new image: 100 × 80 px at 300 dpi.');
    expect(s.stageRenderer.pixels).toHaveBeenCalledWith('/m/Castle.jpg', Number.POSITIVE_INFINITY);
    expect(s.g.store.get().path).toBeNull();
  });

  it('opens at 96 dpi when the file says none, and keeps the image when asked not to discard', async () => {
    const s = setup();
    s.dialogs.openPicture.mockResolvedValueOnce('/m/Ocean.png');
    s.nextPicture(20, 20);
    await s.g.openPictureAsImage();
    expect(s.doc().graphic!.dpi).toBe(96);
    s.g.addPixelLayer();
    s.dialogs.confirm.mockResolvedValueOnce(false);
    s.dialogs.openPicture.mockResolvedValueOnce('/m/Ocean.png');
    s.nextPicture(30, 30);
    expect(await s.g.openPictureAsImage()).toBe(false);
    expect(s.doc().stage.width).toBe(20);
    s.dialogs.openPicture.mockResolvedValueOnce(null);
    expect(await s.g.openPictureAsImage()).toBe(false);
  });

  it('says why a file cannot be opened as a picture', async () => {
    const s = setup();
    s.dialogs.openPicture.mockResolvedValueOnce('/m/notes.txt');
    expect(await s.g.openPictureAsImage()).toBe(false);
    expect(s.message()).toMatch(/Choose a picture file/);
    s.dialogs.openPicture.mockResolvedValueOnce('/m/Castle.jpg');
    s.nextPicture(4, 4);
    expect(await s.g.openPictureAsImage()).toBe(false);
    expect(s.message()).toMatch(/between 16 and 8192/);
    expect(s.g.store.get().busy).toBeNull();
  });

  it('adds a picture as a new layer in the middle of the image, named after it', async () => {
    const s = await withPhoto();
    s.dialogs.openPicture.mockResolvedValueOnce('/m/Ocean.png');
    s.nextPicture(20, 10, [0, 0, 255, 255]);
    await s.g.addPictureAsLayer();
    expect(s.current()).toMatchObject({ name: 'Ocean', pixels: { x: 40, y: 35 } });
    expect(s.message()).toBe('Added Ocean.png as the pixel layer Ocean.');
    s.dialogs.openPicture.mockResolvedValueOnce('/m/notes.txt');
    await s.g.addPictureAsLayer();
    expect(s.message()).toMatch(/Choose a picture file/);
    s.dialogs.openPicture.mockResolvedValueOnce(null);
    await s.g.addPictureAsLayer();
    expect(s.doc().layers).toHaveLength(2);
  });

  it('pastes a picture as a new layer', async () => {
    const s = await withPhoto();
    s.g.pastePixels({ width: 2, height: 2, data: new Array(16).fill(255) });
    expect(s.current()).toMatchObject({ name: 'Pasted', pixels: { x: 49, y: 39 } });
    s.g.pastePixels({ width: 0, height: 2, data: new Uint8ClampedArray() });
    expect(s.message()).toMatch(/no picture to paste/);
  });

  it('refuses shapes on a pixel layer, with a clear reason', async () => {
    const s = await withPhoto();
    s.g.addShape('rect', { x: 1, y: 1, width: 5, height: 5 });
    expect(s.message()).toMatch(
      /Castle is a pixel layer: shapes, text and pictures go on a vector layer/,
    );
  });
});

describe('M21 G2: opacity, blend, clipping, masks, duplicate', () => {
  it('sets a layer’s opacity, blend mode and clipping as undo steps, or says why not', async () => {
    const s = await withPhoto();
    const id = s.current().id;
    expect(s.g.setLayerLook(id, { opacity: 0.4 })).toBeNull();
    expect(s.g.setLayerLook(id, { blend: 'screen' })).toBeNull();
    expect(s.g.setLayerLook(id, { clip: true })).toMatch(/bottom layer/);
    s.g.addPixelLayer();
    const top = s.current().id;
    expect(s.g.setLayerLook(top, { clip: true })).toBeNull();
    expect(s.doc().layers[1]).toMatchObject({ clip: true });
    expect(s.g.setLayerLook(top, { clip: false })).toBeNull();
    expect(s.doc().layers[0]).toMatchObject({ opacity: 0.4, blend: 'screen' });
    for (let i = 0; i < 4; i++) s.g.undo();
    expect(s.doc().layers[0]).toMatchObject({ opacity: 0.4 });
    expect(s.doc().layers[0]).not.toHaveProperty('blend');
  });

  it('adds a layer mask (from the selection when there is one), applies or deletes it', async () => {
    const s = await withPhoto();
    const id = s.current().id;
    s.g.addLayerMask(id);
    expect(pixelAt(s.current().pixels!.mask!, 50, 50)).toBe(255);
    s.g.removeLayerMask(id, false);
    expect(s.current().pixels).not.toHaveProperty('mask');
    s.g.store.update((st) => ({
      ...st,
      pixelSelection: fillRect(createMask(100, 80), { x: 0, y: 0, width: 50, height: 80 }, 255),
    }));
    s.g.addLayerMask(id);
    s.g.removeLayerMask(id, true);
    const bitmap = s.current().pixels!.bitmap;
    expect(pixelAt(bitmap, 49, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(bitmap, 50, 0)).toEqual([0, 0, 0, 0]);
    s.g.removeLayerMask(id, true);
    expect(s.message()).toMatch(/no layer mask/);
  });

  it('duplicates a layer above it, which becomes the current layer', async () => {
    const s = await withPhoto();
    s.g.duplicateLayer(s.current().id);
    expect(s.doc().layers.map((l) => l.name)).toEqual(['Castle', 'Castle copy']);
    expect(s.current().name).toBe('Castle copy');
    s.g.duplicateLayer('gone');
    expect(s.message()).toMatch(/no longer exists/);
  });
});

describe('M21 G2: merging', () => {
  it('merges the current layer down', async () => {
    const s = await withPhoto();
    s.g.pastePixels({ width: 2, height: 2, data: new Array(16).fill(255) });
    await s.g.mergeLayers('down');
    expect(s.doc().layers).toHaveLength(1);
    expect(s.current().name).toBe('Castle');
    expect(pixelAt(s.current().pixels!.bitmap, 49, 39)).toEqual([255, 255, 255, 255]);
    expect(s.g.store.get().busy).toBeNull();
    s.g.undo();
    expect(s.doc().layers).toHaveLength(2);
  });

  it('draws a vector layer into pixels first, and says its shapes are now pixels', async () => {
    const s = await withPhoto();
    s.g.selectLayer(s.doc().layers[0]!.id);
    s.g.addLayer();
    s.g.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    s.g.renameLayer(s.current().id, 'Logo');
    await s.g.mergeLayers('down');
    const alone = s.stageRenderer.renderPixels.mock.calls[0]![0];
    expect(alone.layers.map((l) => l.name)).toEqual(['Logo']);
    expect(alone.stage.background).toBe('none');
    expect(s.doc().layers).toHaveLength(1);
    expect(s.message()).toBe(
      'Logo is now pixels: its shapes and text can no longer be edited one by one. Undo brings them back.',
    );
  });

  it('merges every layer showing, or flattens the image', async () => {
    const s = await withPhoto();
    s.g.addLayer();
    s.g.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    s.g.addLayer();
    s.g.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    await s.g.mergeLayers('visible');
    expect(s.doc().layers.map((l) => l.name)).toEqual(['Castle']);
    expect(s.message()).toMatch(/^Layer 2, Layer 3 are now pixels: their shapes/);
    s.g.pastePixels({ width: 2, height: 2, data: new Array(16).fill(255) });
    await s.g.mergeLayers('flatten');
    expect(s.doc().layers.map((l) => l.name)).toEqual(['Background']);
    expect(s.current().name).toBe('Background');
  });

  it('says why it cannot merge, and does not merge twice at once', async () => {
    const s = await withPhoto();
    await s.g.mergeLayers('down');
    expect(s.message()).toMatch(/no layer below Castle/);
    s.g.addLayer();
    s.g.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    s.g.store.update((st) => ({ ...st, busy: 'Saving…' }));
    await s.g.mergeLayers('down');
    expect(s.doc().layers).toHaveLength(2);
    s.g.store.update((st) => ({ ...st, busy: null }));
    s.stageRenderer.renderPixels.mockRejectedValueOnce(new Error('no canvas'));
    await s.g.mergeLayers('down');
    expect(s.doc().layers).toHaveLength(2);
    expect(s.g.store.get().busy).toBeNull();
    expect(s.message()).not.toBe('');
  });
});

describe('M21 D9: the .mveg file in the app', () => {
  it('saves pixel layers as PNGs in the zip and opens them again exactly', async () => {
    const s = await withPhoto();
    s.g.setLayerLook(s.current().id, { opacity: 0.5 });
    s.dialogs.saveGraphic.mockResolvedValueOnce('/work/Castle.mveg');
    await s.g.saveAs();
    const file = s.bytes.get('/work/Castle.mveg')!;
    expect([...readZip(file).keys()]).toEqual(['doc.json', 'pixels/0.png']);
    expect(s.g.isDirty()).toBe(false);
    await s.g.newAnimation();
    s.dialogs.openGraphic.mockResolvedValueOnce('/work/Castle.mveg');
    await s.g.open();
    expect(s.doc().layers[0]).toMatchObject({ name: 'Castle', opacity: 0.5 });
    expect(pixelAt(s.doc().layers[0]!.pixels!.bitmap, 10, 10)).toEqual([255, 0, 0, 255]);
    expect(s.g.store.get().path).toBe('/work/Castle.mveg');
  });

  it('opens a .mveg made before M21 (the JSON alone)', async () => {
    const s = setup();
    s.g.addShape('rect', { x: 1, y: 1, width: 5, height: 5 });
    s.bytes.set('/work/Old.mveg', new TextEncoder().encode(s.g.text()));
    s.dialogs.confirm.mockResolvedValueOnce(true);
    s.dialogs.openGraphic.mockResolvedValueOnce('/work/Old.mveg');
    await s.g.open();
    expect(s.doc().layers[0]!.objects).toHaveLength(1);
    s.bytes.set('/work/Bad.mveg', new TextEncoder().encode('nonsense'));
    s.dialogs.openGraphic.mockResolvedValueOnce('/work/Bad.mveg');
    await s.g.open();
    expect(s.message()).toMatch(/damaged/);
  });

  it('restores unsaved work from the recovery zip, and drops a damaged one', async () => {
    const s = await withPhoto();
    const recovery = '/cache/recovery.mveg';
    s.bytes.set(recovery, await writeGraphicFile(s.doc(), webCompression));
    const t = setup();
    for (const [path, b] of s.bytes) t.bytes.set(path, b);
    t.dialogs.confirm.mockResolvedValue(true);
    await t.g.start();
    expect(t.doc().layers[0]!.pixels!.bitmap).toMatchObject({ width: 100, height: 80 });
    expect(t.g.isDirty()).toBe(true);
    const u = setup();
    u.bytes.set(recovery, new TextEncoder().encode('{ broken'));
    await u.g.start();
    expect(u.bytes.has(recovery)).toBe(false);
  });

  it('packages the image as a zip too', async () => {
    const s = await withPhoto();
    s.dialogs.chooseFolder.mockResolvedValueOnce('/usb/Castle');
    await s.g.packageAnimation();
    const doc = await readGraphicFile(s.bytes.get('/usb/Castle/Castle.mveg')!, webCompression);
    expect(doc.layers[0]!.pixels!.bitmap.width).toBe(100);
  });

  it('says so when the image cannot be saved, and keeps it unsaved', async () => {
    const s = await withPhoto();
    s.g.store.update((st) => ({
      ...st,
      history: {
        ...st.history,
        present: {
          ...st.history.present,
          layers: st.history.present.layers.map((l) => ({ ...l, opacity: 3 })),
        },
      },
    }));
    s.dialogs.saveGraphic.mockResolvedValueOnce('/work/Castle.mveg');
    await s.g.saveAs();
    expect(s.message()).toMatch(/could not be saved/);
    expect(s.bytes.has('/work/Castle.mveg')).toBe(false);
  });
});

describe('M21 G2, G11: exports with pixel layers', () => {
  it('puts each pixel layer shown into the SVG as a PNG, its mask applied', async () => {
    const s = await withPhoto();
    s.g.store.update((st) => ({
      ...st,
      pixelSelection: fillRect(createMask(100, 80), { x: 0, y: 0, width: 10, height: 80 }, 255),
    }));
    s.g.addLayerMask(s.current().id);
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Castle.svg');
    await s.g.exportImage({ format: 'svg' });
    const svg = s.disk.get('/work/Castle.svg')!;
    const href = /<image href="data:image\/png;base64,([^"]+)"/.exec(svg)![1]!;
    const png = await decodePng(new Uint8Array(Buffer.from(href, 'base64')), webCompression);
    expect(png.width).toBe(100);
    expect([...png.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...png.data.subarray(40, 44)]).toEqual([0, 0, 0, 0]);
  });

  it('draws pixel layers into the PNG export (the renderer is given them)', async () => {
    const s = await withPhoto();
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Castle.png');
    await s.g.exportImage({ format: 'png' });
    const drawn = s.stageRenderer.renderPng.mock.calls[0]![0];
    expect(drawn.layers[0]!.pixels!.bitmap.width).toBe(100);
  });

  it('exports each layer in a file of its own, named after it (O/N/23)', async () => {
    const s = await withPhoto();
    s.g.renameLayer(s.current().id, 'CastleLayer');
    s.dialogs.openPicture.mockResolvedValueOnce('/m/Ocean.png');
    s.nextPicture(20, 10);
    await s.g.addPictureAsLayer();
    s.g.renameLayer(s.current().id, 'OceanLayer');
    s.g.addLayer();
    s.dialogs.chooseFolder.mockResolvedValueOnce('/work/layers');
    const made = await s.g.exportImage({ format: 'png', what: 'layers' });
    expect(made).toEqual(['/work/layers/CastleLayer.png', '/work/layers/OceanLayer.png']);
    const second = s.stageRenderer.renderPng.mock.calls[1]![0];
    expect(second.layers.map((l) => l.name)).toEqual(['OceanLayer']);
    expect(second.stage.background).toBe('none');
  });

  it('leaves pixel layers out of an export of the selected objects', async () => {
    const s = await withPhoto();
    s.g.addLayer();
    s.g.addShape('rect', { x: 10, y: 10, width: 20, height: 20 });
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Part.png');
    await s.g.exportImage({ format: 'png', what: 'selection' });
    const drawn = s.stageRenderer.renderPng.mock.calls[0]![0];
    expect(drawn.layers.some((l) => l.pixels)).toBe(false);
  });
});

describe('M21 G2: Send to Animation', () => {
  it('sends each pixel layer shown as a picture saved in the app’s folder, in its place', async () => {
    const s = await withPhoto();
    const id = s.current().id;
    s.g.setLayerLook(id, { opacity: 0.5 });
    s.g.addLayer();
    s.g.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    s.g.select([]);
    expect(await s.app.sendGraphicToAnimation()).toBe(true);
    const anim = s.app.animation.store.get().history.present;
    const layer = anim.layers.at(-1)!;
    expect(layer.objects.map((o) => o.kind)).toEqual(['picture', 'rect']);
    expect(layer.objects[0]).toMatchObject({
      name: 'Castle',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      opacity: 0.5,
    });
    const picture = anim.pictures.at(-1)!;
    expect(picture.path).toMatch(/^\/cache\/text\/layer-[\w-]+\.png$/);
    expect(picture).toMatchObject({ width: 100, height: 80 });
  });

  it('applies the layer mask in the picture sent', async () => {
    const s = await withPhoto();
    s.g.store.update((st) => ({
      ...st,
      pixelSelection: fillRect(createMask(100, 80), { x: 0, y: 0, width: 10, height: 80 }, 255),
    }));
    s.g.addLayerMask(s.current().id);
    const sent = (await s.g.toSend())!;
    expect(sent.objects).toHaveLength(1);
    expect(sent.pictures).toHaveLength(1);
  });

  it('says so when a picture cannot be saved', async () => {
    const s = await withPhoto();
    s.g.toSend = async () => {
      throw new Error('The disk is full.');
    };
    expect(await s.app.sendGraphicToAnimation()).toBe(false);
    expect(s.message()).toBe('The disk is full.');
  });
});
