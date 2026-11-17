// GC1 (M23): Learn ▸ Graphics's JPEG and picture decoding on an OffscreenCanvas — the same
// encoder the renderer uses for JPG exports (convertToBlob) — and createImageBitmap, which
// decodes off the page's thread. A big photo is drawn straight onto a smaller canvas, so only
// the reduced copy's pixels are ever read back.
import type { RgbaImage } from '../../core/image/encode/index.ts';
import { fitWithin, type PictureCodec } from '../../core/teaching/graphics.ts';

interface Context2d {
  createImageData(width: number, height: number): { data: Uint8ClampedArray };
  putImageData(data: unknown, x: number, y: number): void;
  drawImage(image: unknown, x: number, y: number, width: number, height: number): void;
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
}

interface Canvas {
  getContext(kind: '2d', options?: { willReadFrequently?: boolean }): Context2d | null;
  convertToBlob(options: { type: string; quality?: number }): Promise<Blob>;
}

interface Decoded {
  width: number;
  height: number;
  close?(): void;
}

export interface PictureCodecDeps {
  makeCanvas?: (width: number, height: number) => Canvas;
  createImageBitmap?: (blob: Blob, options: object) => Promise<Decoded>;
}

function context(canvas: Canvas): Context2d {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No canvas is available to draw the picture.');
  return ctx;
}

export function createCanvasPictureCodec({
  makeCanvas = (w, h) => new OffscreenCanvas(w, h) as unknown as Canvas,
  createImageBitmap: decodeImage = (blob, options) =>
    globalThis.createImageBitmap(blob, options as ImageBitmapOptions),
}: PictureCodecDeps = {}): PictureCodec {
  return {
    async jpeg(image: RgbaImage, quality: number): Promise<Uint8Array> {
      const canvas = makeCanvas(image.width, image.height);
      const ctx = context(canvas);
      const data = ctx.createImageData(image.width, image.height);
      data.data.set(image.data);
      ctx.putImageData(data, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
      return new Uint8Array(await blob.arrayBuffer());
    },

    async decode(bytes: Uint8Array, maxPixels = Infinity) {
      // The file's own numbers: no colour profile applied, alpha not premultiplied.
      const bitmap = await decodeImage(new Blob([bytes as BlobPart]), {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
      try {
        const { width, height } = fitWithin(bitmap.width, bitmap.height, maxPixels);
        const ctx = context(makeCanvas(width, height));
        ctx.drawImage(bitmap, 0, 0, width, height);
        const image = { width, height, data: ctx.getImageData(0, 0, width, height).data };
        return { image, width: bitmap.width, height: bitmap.height };
      } finally {
        bitmap.close?.();
      }
    },
  };
}
