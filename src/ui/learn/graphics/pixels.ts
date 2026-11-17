// GC1 (M23): a picture's pixels drawn on a <canvas> for Learn ▸ Graphics (none in jsdom).
import type { RgbaImage } from '../../../core/image/encode/index.ts';

interface Paintable {
  width: number;
  height: number;
  getContext(kind: '2d'): {
    createImageData(w: number, h: number): { data: Uint8ClampedArray };
    putImageData(data: unknown, x: number, y: number): void;
  } | null;
}

/** Sizes the canvas to the picture and draws it; false when there is no canvas to draw on. */
export function paint(canvas: Paintable, image: RgbaImage): boolean {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const data = ctx.createImageData(image.width, image.height);
  data.data.set(image.data);
  ctx.putImageData(data, 0, 0);
  return true;
}
