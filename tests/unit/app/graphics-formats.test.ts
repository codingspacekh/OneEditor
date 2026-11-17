// M23 / G11, GC2, D5: Graphics mode's export as GIF, BMP and TIFF and PNG at 1, 4, 8 or 24 bits —
// the stage's pixels drawn at the export's size, written by our own writers at the depth chosen
// with the resolution inside; a 32-bit PNG and a JPG still made by the canvas — and an export
// never saved over the photo the image was opened from.
import { describe, expect, it } from 'vitest';
import { webCompression } from '../../../src/core/image/deflate.ts';
import { decodeBitmap } from '../../../src/core/image/decode/index.ts';
import { jpegWithDpi } from '../../../src/core/image/dpi.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';
import { TINY_JPEG } from '../../helpers/tiny-images.ts';

const PHOTO = { ...IMAGE, video: { codec: 'mjpeg', width: 40, height: 30 } };

function setup() {
  const t = testApp({ '/m/Castle.jpg': PHOTO });
  const g = t.app.graphics;
  const message = () => g.store.get().message?.text ?? '';
  const read = (path: string) => decodeBitmap(t.bytes.get(path)!, webCompression);
  return { ...t, g, message, read };
}

describe('G11 (M23): GIF, BMP, TIFF and PNG at a colour depth', () => {
  it.each([
    ['gif', '/work/Logo.gif', 'gif'],
    ['bmp', '/work/Logo.bmp', 'bmp'],
    ['tiff', '/work/Logo.tif', 'tiff'],
  ] as const)(
    '%s: the pixels at the export size, written by our own writer',
    async (format, path, read) => {
      const s = setup();
      s.g.setImage({ width: 400, height: 200, dpi: 300 });
      s.dialogs.exportGraphic.mockResolvedValueOnce(path);
      expect(await s.g.exportImage({ format, size: { by: 'width', px: 100 } })).toEqual([path]);
      expect(s.dialogs.exportGraphic).toHaveBeenCalledWith('Untitled', format);
      const [, size] = s.stageRenderer.renderPixels.mock.calls.at(-1)!;
      expect(size).toEqual({ width: 100, height: 50 });
      expect(s.stageRenderer.renderPng).not.toHaveBeenCalled();
      const back = await s.read(path);
      expect(back).toMatchObject({ format: read, width: 100, height: 50 });
      // The fake renderer draws everything red.
      expect([...back.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
      if (format !== 'gif') expect(back.dpi).toBe(300);
      expect(s.message()).toBe(`Saved ${path.slice(6)} (100 × 50 px, 300 dpi).`);
    },
  );

  it('a palette PNG (8 bits) by our writer, at the canvas size; a 32-bit PNG by the canvas', async () => {
    const s = setup();
    s.g.setImage({ width: 64, height: 32 });
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Small.png');
    await s.g.exportImage({ format: 'png', depth: 8 });
    const [, size] = s.stageRenderer.renderPixels.mock.calls.at(-1)!;
    expect(size).toBeUndefined();
    const bytes = s.bytes.get('/work/Small.png')!;
    expect(bytes[25]).toBe(3); // a palette
    expect(await s.read('/work/Small.png')).toMatchObject({ width: 64, height: 32, dpi: 96 });
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Full.png');
    await s.g.exportImage({ format: 'png', depth: 32 });
    expect(s.stageRenderer.renderPng).toHaveBeenCalledTimes(1);
  });

  it('takes the renderer’s pixels in a plain array too', async () => {
    const s = setup();
    s.g.setImage({ width: 16, height: 16 });
    s.stageRenderer.renderPixels.mockResolvedValueOnce({
      width: 1,
      height: 1,
      data: [0, 0, 255, 255],
    });
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Dot.bmp');
    await s.g.exportImage({ format: 'bmp' });
    expect([...(await s.read('/work/Dot.bmp')).data]).toEqual([0, 0, 255, 255]);
  });

  it('a depth the format cannot hold is refused before any save box', async () => {
    const s = setup();
    expect(await s.g.exportImage({ format: 'gif', depth: 24 })).toBeNull();
    expect(s.message()).toMatch(/A GIF holds 1, 4 or 8 bits a pixel, not 24/);
    expect(s.dialogs.exportGraphic).not.toHaveBeenCalled();
  });
});

describe('GC2 (M23): an export never saves over the opened original', () => {
  async function opened() {
    const s = setup();
    s.bytes.set('/m/Castle.jpg', jpegWithDpi(TINY_JPEG, 300));
    s.dialogs.openPicture.mockResolvedValueOnce('/m/Castle.jpg');
    s.stageRenderer.pixels.mockResolvedValueOnce({
      width: 40,
      height: 30,
      data: new Uint8ClampedArray(40 * 30 * 4).fill(200),
    });
    expect(await s.g.openPictureAsImage()).toBe(true);
    return s;
  }

  it('suggests another name when the format is the photo’s own, and refuses the photo itself', async () => {
    const s = await opened();
    s.dialogs.exportGraphic.mockResolvedValueOnce('/m/Castle.jpg');
    expect(await s.g.exportImage({ format: 'jpg' })).toBeNull();
    expect(s.dialogs.exportGraphic).toHaveBeenCalledWith('Castle-edited', 'jpg');
    expect(s.message()).toBe(
      'Castle.jpg is the file this image was opened from: saving over it would lose the original. Export it with another name, such as Castle-edited.jpg.',
    );
    expect(s.bytes.get('/m/Castle.jpg')!.length).toBe(jpegWithDpi(TINY_JPEG, 300).length);
    // Another case of the same name on a computer that does not mind case: the same file.
    s.dialogs.exportGraphic.mockResolvedValueOnce('/M/castle.JPG');
    expect(await s.g.exportImage({ format: 'jpg' })).toBeNull();
    // Another format is another file: its own name is offered.
    s.dialogs.exportGraphic.mockResolvedValueOnce('/m/Castle.png');
    expect(await s.g.exportImage({ format: 'png', depth: 24 })).toEqual(['/m/Castle.png']);
    expect(s.dialogs.exportGraphic).toHaveBeenLastCalledWith('Castle', 'png');
  });

  it('each layer into the photo’s folder: refused when one would be the photo', async () => {
    const s = await opened();
    s.dialogs.chooseFolder.mockResolvedValueOnce('/m');
    expect(await s.g.exportImage({ format: 'jpg', what: 'layers' })).toBeNull();
    expect(s.message()).toMatch(/Castle\.jpg is the file this image was opened from/);
  });

  it('nor over the SVG an image was opened from', async () => {
    const s = setup();
    s.disk.set(
      '/given/Logo.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><circle cx="5" cy="5" r="5"/></svg>',
    );
    s.dialogs.openGraphic.mockResolvedValueOnce('/given/Logo.svg');
    await s.g.open();
    s.dialogs.exportGraphic.mockResolvedValueOnce('/given/Logo.svg');
    expect(await s.g.exportImage({ format: 'svg' })).toBeNull();
    expect(s.dialogs.exportGraphic).toHaveBeenCalledWith('Logo-edited', 'svg');
    expect(s.message()).toMatch(/^Logo\.svg is the file this image was opened from/);
  });

  it('a new image forgets the photo', async () => {
    const s = await opened();
    await s.g.newImage({
      name: 'Castle',
      size: { width: 100, height: 100, units: 'px', dpi: 96 },
      background: '#ffffff',
    });
    s.dialogs.exportGraphic.mockResolvedValueOnce('/m/Castle.jpg');
    expect(await s.g.exportImage({ format: 'jpg' })).toEqual(['/m/Castle.jpg']);
  });
});
