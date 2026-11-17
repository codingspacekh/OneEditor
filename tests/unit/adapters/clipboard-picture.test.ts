// GB1 (M21): a picture on the clipboard read as pixels, to paste as a pixel layer.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readClipboardPicture } from '../../../src/adapters/canvas/clipboard-picture.ts';

const item = (types: string[]) => ({
  types,
  getType: async (type: string) => new Blob([type], { type }),
});

describe('M21 GB1: a picture on the clipboard', () => {
  it('is read as pixels: the first picture there', async () => {
    const decoded: string[] = [];
    const pixels = await readClipboardPicture({
      read: async () => [item(['text/plain']), item(['text/html', 'image/png'])],
      decode: async (blob) => (decoded.push(blob.type), { width: 2, height: 1 }),
      pixelsOf: (image) => ({ ...image, data: new Uint8ClampedArray(8).fill(9) }),
    });
    expect(decoded).toEqual(['image/png']);
    expect(pixels).toMatchObject({ width: 2, height: 1 });
  });

  it('is null when there is no picture, it is empty or it cannot be read', async () => {
    const pixelsOf = () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    expect(
      await readClipboardPicture({ read: async () => [item(['text/plain'])], pixelsOf }),
    ).toBeNull();
    expect(
      await readClipboardPicture({
        read: async () => [item(['image/png'])],
        decode: async () => ({ width: 0, height: 0 }),
        pixelsOf,
      }),
    ).toBeNull();
    expect(
      await readClipboardPicture({
        read: async () => Promise.reject(new Error('NotAllowedError')),
        pixelsOf,
      }),
    ).toBeNull();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reads the decoded picture’s pixels from a canvas of its size', async () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return {
            drawImage: () => {},
            getImageData: (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4).fill(7),
            }),
          };
        }
      },
    );
    const pixels = await readClipboardPicture({
      read: async () => [item(['image/png'])],
      decode: async () => ({ width: 3, height: 2 }),
    });
    expect(pixels!.data).toHaveLength(24);
  });
});
