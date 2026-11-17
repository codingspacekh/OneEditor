// GC1 (M23): Learn ▸ Graphics's JPEG and decoding on a canvas. The canvas and the decoder are
// fakes here; the real ones run in the app.
import { describe, expect, it, vi } from 'vitest';
import { createCanvasPictureCodec } from '../../../src/adapters/canvas/picture-codec.ts';

function fakes(options: { noContext?: boolean } = {}) {
  const calls: string[] = [];
  const sizes: number[][] = [];
  const close = vi.fn();
  const makeCanvas = (width: number, height: number) => {
    sizes.push([width, height]);
    return {
      getContext: () =>
        options.noContext
          ? null
          : {
              createImageData: (w: number, h: number) => ({
                data: new Uint8ClampedArray(w * h * 4),
              }),
              putImageData: (d: { data: Uint8ClampedArray }) => calls.push(`put ${d.data[0]}`),
              drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) =>
                calls.push(`draw ${w}×${h}`),
              getImageData: (_x: number, _y: number, w: number, h: number) => ({
                data: new Uint8ClampedArray(w * h * 4).fill(7),
              }),
            },
      convertToBlob: async (o: { type: string; quality?: number }) => {
        calls.push(`${o.type} ${o.quality}`);
        return new Blob([new Uint8Array([0xff, 0xd8, 0xff])]);
      },
    };
  };
  const createImageBitmap = vi.fn<
    (blob: Blob, options: object) => Promise<{ width: number; height: number; close(): void }>
  >(async () => ({
    width: 4000,
    height: 3000,
    close,
  }));
  return { calls, sizes, close, makeCanvas, createImageBitmap };
}

const image = { width: 2, height: 1, data: new Uint8ClampedArray([9, 0, 0, 255, 0, 0, 0, 255]) };

describe('GC1 (M23) the canvas picture codec', () => {
  it('a JPEG of the pixels at a quality (0–1 for the canvas)', async () => {
    const f = fakes();
    const codec = createCanvasPictureCodec(f);
    const bytes = await codec.jpeg(image, 40);
    expect([...bytes]).toEqual([0xff, 0xd8, 0xff]);
    expect(f.sizes).toEqual([[2, 1]]);
    expect(f.calls).toEqual(['put 9', 'image/jpeg 0.4']);
  });

  it('decodes a big picture straight to a copy of at most the pixels asked for, with its own size', async () => {
    const f = fakes();
    const codec = createCanvasPictureCodec(f);
    const d = await codec.decode(new Uint8Array([1]), 1_000_000);
    expect([d.width, d.height]).toEqual([4000, 3000]);
    expect([d.image.width, d.image.height]).toEqual([1154, 866]);
    expect(d.image.data.length).toBe(1154 * 866 * 4);
    expect(f.calls).toEqual(['draw 1154×866']);
    expect(f.createImageBitmap.mock.calls[0]![1]).toEqual({
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    expect(f.close).toHaveBeenCalled();
  });

  it('at its own size when no limit is given', async () => {
    const f = fakes();
    const d = await createCanvasPictureCodec(f).decode(new Uint8Array([1]));
    expect(d.image.width).toBe(4000);
  });

  it('in the app: an OffscreenCanvas and the page’s createImageBitmap', async () => {
    const f = fakes();
    const made: number[][] = [];
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(w: number, h: number) {
          made.push([w, h]);
          return f.makeCanvas(w, h);
        }
      },
    );
    vi.stubGlobal('createImageBitmap', f.createImageBitmap);
    try {
      const codec = createCanvasPictureCodec();
      await codec.decode(new Uint8Array([1]), 100);
      await codec.jpeg(image, 90);
      expect(made).toEqual([
        [11, 8],
        [2, 1],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with no canvas it says so (and still lets the decoded picture go)', async () => {
    const f = fakes({ noContext: true });
    const codec = createCanvasPictureCodec(f);
    await expect(codec.jpeg(image, 50)).rejects.toThrow(/No canvas/);
    await expect(codec.decode(new Uint8Array([1]))).rejects.toThrow(/No canvas/);
    expect(f.close).toHaveBeenCalled();
  });
});
