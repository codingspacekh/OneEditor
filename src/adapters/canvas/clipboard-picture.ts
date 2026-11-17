// GB1 (M21): a picture on the clipboard (copied from a browser or another program) as pixels, so
// Graphics mode can paste it as a new pixel layer (app: pastePixels). The page reads the
// clipboard (navigator.clipboard.read), decodes the picture with createImageBitmap and reads its
// pixels from a canvas. Null when the clipboard holds no picture or cannot be read.
import type { Pixels } from '../../core/animation/trace.ts';

export interface ClipboardPictureDeps {
  read?: () => Promise<
    readonly { types: readonly string[]; getType(type: string): Promise<Blob> }[]
  >;
  decode?: (blob: Blob) => Promise<{ width: number; height: number }>;
  /** The decoded picture's pixels (an OffscreenCanvas in the app). */
  pixelsOf?: (image: { width: number; height: number }) => Pixels;
}

const canvasPixels = (image: { width: number; height: number }): Pixels => {
  const ctx = new OffscreenCanvas(image.width, image.height).getContext('2d', {
    willReadFrequently: true,
  })!;
  ctx.drawImage(image as ImageBitmap, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: ctx.getImageData(0, 0, image.width, image.height).data,
  };
};

export async function readClipboardPicture({
  read = () => navigator.clipboard.read(),
  decode = (blob) => createImageBitmap(blob),
  pixelsOf = canvasPixels,
}: ClipboardPictureDeps = {}): Promise<Pixels | null> {
  try {
    for (const item of await read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (!type) continue;
      const image = await decode(await item.getType(type));
      if (!(image.width > 0 && image.height > 0)) return null;
      return pixelsOf(image);
    }
  } catch {
    // No permission, or nothing that can be read: as if there were no picture.
  }
  return null;
}
