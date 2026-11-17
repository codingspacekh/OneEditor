// Learn ▸ Graphics ▸ Compression (GC1, M23): the student's own picture — a file chosen, or the
// image open in Graphics mode — as a reduced copy, then saved as a JPEG at a quality, in five
// formats, at fewer colours and pixels, and again and again. The codec and the writers are fakes.
import { describe, expect, it, vi } from 'vitest';
import { createGraphicsLearnApp } from '../../../src/app/learn-graphics.ts';
import { createAnimation } from '../../../src/core/animation/factory.ts';
import type { AnimationDoc } from '../../../src/core/animation/types.ts';
import type { RgbaImage } from '../../../src/core/image/encode/index.ts';
import { EditError } from '../../../src/core/model/errors.ts';
import type { StageRenderer } from '../../../src/core/ports.ts';
import type { PictureCodec } from '../../../src/core/teaching/graphics.ts';

function picture(width: number, height: number, alpha = 255): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i / 4) % 256;
    data[i + 1] = 100;
    data[i + 2] = 200;
    data[i + 3] = alpha;
  }
  return { width, height, data };
}

/** Files are tagged by their first byte: 1 a JPEG (the quality next), 2 the picture the test opened. */
function fakeCodec(opened: RgbaImage, fileSize = { width: 4000, height: 3000 }) {
  const codec = {
    jpeg: vi.fn<PictureCodec['jpeg']>(async (image, quality) => {
      const bytes = new Uint8Array(10 + quality);
      bytes[0] = 1;
      bytes[1] = quality;
      bytes[2] = image.width;
      return bytes;
    }),
    decode: vi.fn<PictureCodec['decode']>(async (bytes) => {
      if (bytes[0] === 1) {
        const image = picture(bytes[2]!, opened.height);
        image.width = bytes[2]!;
        image.data = new Uint8ClampedArray(image.width * image.height * 4).fill(90);
        return { image, width: image.width, height: image.height };
      }
      if (bytes[0] === 2) return { image: opened, ...fileSize };
      throw new Error('not a picture');
    }),
  };
  return codec;
}

function setup(
  options: {
    opened?: RgbaImage;
    path?: string | null;
    graphic?: AnimationDoc;
    renderer?: boolean;
    encode?: Parameters<typeof createGraphicsLearnApp>[0]['encode'];
  } = {},
) {
  const opened = options.opened ?? picture(8, 4);
  const codec = fakeCodec(opened);
  const dialogs = {
    openPicture: vi.fn(async () => (options.path === undefined ? '/m/Beach.jpg' : options.path)),
  };
  const files = { readBytes: vi.fn(async () => new Uint8Array([2, 0, 0, 0, 0, 0])) };
  const renderer = {
    renderPng: vi.fn<StageRenderer['renderPng']>(async () => new Uint8Array([2])),
  };
  let doc = options.graphic ?? createAnimation({ name: 'Logo' });
  const app = createGraphicsLearnApp({
    dialogs,
    files,
    ...(options.renderer === false ? {} : { renderer }),
    graphic: () => doc,
    codec,
    encode:
      options.encode ??
      (async (format, _image, o) => new Uint8Array(format === 'bmp' ? 99 : o.depth + 1)),
    decodeFile: async () => picture(8, 4),
    compression: { deflate: async (d) => d, inflate: async (d) => d },
  });
  return {
    app,
    codec,
    dialogs,
    files,
    renderer,
    setDoc: (d: AnimationDoc) => (doc = d),
  };
}

describe('GC1 (M23) the picture to learn on', () => {
  it('a chosen file: read, opened as a copy of at most a million pixels, its own size and file size kept', async () => {
    const t = setup();
    await t.app.choosePicture();
    const p = t.app.store.get().picture!;
    expect(p).toMatchObject({ name: 'Beach.jpg', width: 4000, height: 3000, fileBytes: 6 });
    expect(p.image.width).toBe(8);
    expect(t.codec.decode.mock.calls[0]![1]).toBe(1_000_000);
    // The JPEG at the quality shown is made at once.
    expect(t.app.store.get().jpeg?.quality).toBe(60);
  });

  it('see-through parts are put on white (a JPEG cannot keep them)', async () => {
    const t = setup({ opened: picture(2, 2, 0) });
    await t.app.choosePicture();
    expect([...t.app.store.get().picture!.image.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });

  it('cancelled: nothing changes', async () => {
    const t = setup({ path: null });
    await t.app.choosePicture();
    expect(t.files.readBytes).not.toHaveBeenCalled();
    expect(t.app.store.get().picture).toBeNull();
  });

  it('an SVG is explained: it has no pixels to compress', async () => {
    const t = setup({ path: '/m/logo.svg' });
    await t.app.choosePicture();
    expect(t.app.store.get().picture).toBeNull();
    expect(t.app.store.get().message?.text).toMatch(/vector/);
  });

  it('a file that cannot be opened says so', async () => {
    const t = setup();
    t.files.readBytes.mockResolvedValueOnce(new Uint8Array([9]));
    await t.app.choosePicture();
    expect(t.app.store.get().message?.kind).toBe('error');
    expect(t.app.store.get().busy).toBeNull();
  });

  it('a refusal in words is shown as it is', async () => {
    const t = setup();
    t.files.readBytes.mockRejectedValueOnce(new EditError('The file has gone.'));
    await t.app.choosePicture();
    expect(t.app.store.get().message).toEqual({ kind: 'error', text: 'The file has gone.' });
  });

  it('the image open in Graphics mode, drawn at a size of at most a million pixels', async () => {
    const big = createAnimation({ name: 'Poster' });
    const t = setup({ graphic: { ...big, stage: { ...big.stage, width: 4000, height: 2000 } } });
    await t.app.useGraphic();
    expect(t.renderer.renderPng.mock.calls[0]![2]).toEqual({ width: 1414, height: 707 });
    expect(t.app.store.get().picture).toMatchObject({
      name: 'The image in Graphics mode',
      width: 4000,
      height: 2000,
      fileBytes: null,
    });
  });

  it('without a renderer the Graphics image cannot be used', async () => {
    const t = setup({ renderer: false });
    await t.app.useGraphic();
    expect(t.app.store.get().message?.kind).toBe('error');
  });

  it('without the app’s codec a picture cannot be opened, and says so', async () => {
    const app = createGraphicsLearnApp({
      dialogs: { openPicture: async () => '/m/a.png' },
      files: { readBytes: async () => new Uint8Array([1]) },
      graphic: () => createAnimation({ name: 'A' }),
    });
    await app.choosePicture();
    expect(app.store.get().message?.text).toBe('Opening a picture needs the OneEditor app.');
  });

  it('a Graphics image that cannot be drawn says why', async () => {
    const t = setup();
    t.renderer.renderPng.mockRejectedValueOnce(new EditError('No canvas.'));
    await t.app.useGraphic();
    expect(t.app.store.get().message?.text).toBe('No canvas.');
  });

  it('choosing another picture forgets the results of the last', async () => {
    const t = setup();
    await t.app.choosePicture();
    await t.app.compareFormats();
    expect(t.app.store.get().formats).not.toBeNull();
    await t.app.choosePicture();
    expect(t.app.store.get().formats).toBeNull();
  });
});

describe('GC1 (M23) JPEG quality', () => {
  it('a new quality makes a new JPEG; only the last asked for is kept', async () => {
    const t = setup();
    await t.app.choosePicture();
    const first = t.app.setQuality(20);
    const second = t.app.setQuality(90);
    await Promise.all([first, second]);
    expect(t.app.store.get().quality).toBe(90);
    expect(t.app.store.get().jpeg?.quality).toBe(90);
    expect(t.app.store.get().jpeg?.bytes).toBe(100);
  });

  it('with no picture it only remembers the quality', async () => {
    const t = setup();
    await t.app.setQuality(30);
    expect(t.app.store.get().quality).toBe(30);
    expect(t.codec.jpeg).not.toHaveBeenCalled();
  });

  it('the quality stays 1–100', async () => {
    const t = setup();
    await t.app.setQuality(500);
    expect(t.app.store.get().quality).toBe(100);
    await t.app.setQuality(-4);
    expect(t.app.store.get().quality).toBe(1);
  });

  it('a JPEG that fails says why', async () => {
    const t = setup();
    await t.app.choosePicture();
    t.codec.jpeg.mockRejectedValueOnce(new Error('no canvas'));
    await t.app.setQuality(50);
    expect(t.app.store.get().message?.kind).toBe('error');
  });
});

describe('GC1 (M23) five formats, fewer colours and pixels, saved again and again', () => {
  it('the five formats with their sizes, each opened again to show (or not, when it cannot be)', async () => {
    const t = setup({
      encode: async (format) => {
        if (format === 'tiff') throw new EditError('Saving as TIFF is not ready yet.');
        return new Uint8Array([7]);
      },
    });
    await t.app.choosePicture();
    await t.app.compareFormats();
    const rows = t.app.store.get().formats!;
    expect(rows.map((r) => [r.format, r.bytes])).toEqual([
      ['png', 1],
      ['gif', 1],
      ['bmp', 1],
      ['tiff', null],
      ['jpg', 70],
    ]);
    expect(rows[0]!.preview?.width).toBe(8);
    expect(rows[3]!.preview).toBeNull();
    expect(rows[4]!.preview?.width).toBe(8);
    expect(t.app.store.get().busy).toBeNull();
  });

  it('a file the reader cannot open still has its size', async () => {
    const t = setup();
    await t.app.choosePicture();
    t.codec.decode.mockRejectedValue(new Error('no'));
    await t.app.compareFormats();
    const jpg = t.app.store.get().formats!.find((r) => r.format === 'jpg')!;
    expect(jpg.bytes).toBe(70);
    expect(jpg.preview).toBeNull();
  });

  it('the colour depth and the resolution reduced', async () => {
    const t = setup();
    await t.app.choosePicture();
    await t.app.reduce();
    const s = t.app.store.get();
    expect(s.depths!.map((d) => [d.depth, d.bytes])).toEqual([
      [24, 25],
      [8, 9],
      [4, 5],
      [1, 2],
    ]);
    expect(s.resolutions!.map((r) => r.width)).toEqual([8, 4, 2]);
  });

  it('saved again and again, each save shown as it is made', async () => {
    const t = setup();
    await t.app.choosePicture();
    const seen: number[] = [];
    const stop = t.app.store.subscribe((s) => seen.push(s.generations?.length ?? 0));
    await t.app.resave(5, true);
    stop();
    expect(t.app.store.get().generations!.map((g) => g.quality)).toEqual([60, 50, 60, 50, 60]);
    expect(seen).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
  });

  it('without a picture, each asks for one first', async () => {
    const t = setup();
    await t.app.compareFormats();
    expect(t.app.store.get().message?.text).toMatch(/Choose a picture/);
    await t.app.reduce();
    await t.app.resave(3, false);
    expect(t.app.store.get().formats).toBeNull();
    expect(t.app.store.get().generations).toBeNull();
  });

  it('one job at a time: a second asked for while one runs is ignored', async () => {
    const t = setup();
    await t.app.choosePicture();
    const a = t.app.compareFormats();
    const b = t.app.reduce();
    await Promise.all([a, b]);
    expect(t.app.store.get().formats).not.toBeNull();
    expect(t.app.store.get().depths).toBeNull();
  });

  it('a job that fails says why and stops being busy', async () => {
    const t = setup();
    await t.app.choosePicture();
    t.codec.jpeg.mockRejectedValue(new Error('broken'));
    await t.app.resave(3, false);
    expect(t.app.store.get().message?.kind).toBe('error');
    expect(t.app.store.get().busy).toBeNull();
    t.app.dismiss();
    expect(t.app.store.get().message).toBeNull();
  });
});
