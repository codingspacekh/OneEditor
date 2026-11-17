// M21 GB1: the stage's view at high zoom — the steps to 3200 %, crisp pixels from 400 %, the pixel
// grid from 800 %, the visible part of a large image drawn alone, and zooming about the pointer.
import { describe, expect, it } from 'vitest';
import {
  GRAPHICS_ZOOM_STEPS,
  MAX_ZOOM,
  needsViewport,
  paperPad,
  pixelGridAt,
  pixelGridPath,
  scrollToKeep,
  sizeViewportCanvas,
  smoothAt,
  stepZoom,
  visibleRect,
} from '../../../src/ui/animation/stage-viewport.ts';

describe('M21 GB1: the stage view', () => {
  it('M21 GB1: zooms in steps to 3200 % and out to 25 %', () => {
    expect(GRAPHICS_ZOOM_STEPS.at(-1)).toBe(MAX_ZOOM);
    expect(stepZoom(4, 1, GRAPHICS_ZOOM_STEPS)).toBe(8);
    expect(stepZoom(16, 1, GRAPHICS_ZOOM_STEPS)).toBe(32);
    expect(stepZoom(32, 1, GRAPHICS_ZOOM_STEPS)).toBe(32);
    expect(stepZoom(5, -1, GRAPHICS_ZOOM_STEPS)).toBe(4);
    expect(stepZoom(0.25, -1, GRAPHICS_ZOOM_STEPS)).toBe(0.25);
  });

  it('M21 GB1: pixels are crisp from 400 %; the grid shows from 800 % when on', () => {
    expect(smoothAt(3)).toBe(true);
    expect(smoothAt(4)).toBe(false);
    expect(pixelGridAt(4, true)).toBe(false);
    expect(pixelGridAt(8, true)).toBe(true);
    expect(pixelGridAt(32, false)).toBe(false);
  });

  it('M21 GB1: a whole-image canvas is used until it would be too big', () => {
    expect(needsViewport({ width: 1280, height: 720 }, 2, 2)).toBe(false);
    expect(needsViewport({ width: 4000, height: 3000 }, 32, 1)).toBe(true);
    expect(needsViewport({ width: 9000, height: 10 }, 1, 1)).toBe(true);
    expect(needsViewport({ width: 4100, height: 4100 }, 1, 1)).toBe(true);
  });

  it('M21 GB1: the visible part, in whole image px with a pixel to spare', () => {
    const stage = { width: 4000, height: 3000 };
    // Scrolled 1000 px into a sheet where the paper starts at 44 px, at 3200 %.
    const part = visibleRect(
      { left: 1044, top: 44, width: 640, height: 320 },
      { left: 44, top: 44 },
      32,
      stage,
    );
    expect(part).toEqual({ x: 30, y: 0, width: 23, height: 11 });
    expect(
      visibleRect({ left: 0, top: 0, width: 10, height: 10 }, { left: 44, top: 44 }, 1, stage),
    ).toBeNull();
    // Kept to the image.
    expect(
      visibleRect({ left: 0, top: 0, width: 9e9, height: 9e9 }, { left: 0, top: 0 }, 1, stage),
    ).toEqual({ x: 0, y: 0, ...stage });
  });

  it('M21 GB1: the canvas is the visible part × zoom × screen density, set only when it changes', () => {
    const c = { width: 0, height: 0 };
    expect(sizeViewportCanvas(c, { x: 3, y: 4, width: 20, height: 10 }, 32, 2)).toBe(true);
    expect(c).toEqual({ width: 1280, height: 640 });
    expect(sizeViewportCanvas(c, { x: 9, y: 9, width: 20, height: 10 }, 32, 2)).toBe(false);
  });

  it('M21 GB1: zooming keeps the point under the pointer where it is', () => {
    const pad = paperPad(800, 20, 400, 1, 24);
    expect(pad).toBe(190);
    const before = { left: 20 + pad, top: 44 };
    const after = { left: 20 + paperPad(800, 20, 400, 4, 24), top: 44 };
    // The pointer 300 px into the area, nothing scrolled: stage x = (300 − 210) / 1 = 90.
    const next = scrollToKeep({ x: 300, y: 100 }, { left: 0, top: 0 }, before, after, 1, 4);
    expect((next.left + 300 - after.left) / 4).toBeCloseTo(90, 0);
    expect((next.top + 100 - after.top) / 4).toBeCloseTo(56, 0);
    // The same zoom: the same scroll.
    expect(scrollToKeep({ x: 300, y: 100 }, { left: 50, top: 20 }, before, before, 2, 2)).toEqual({
      left: 50,
      top: 20,
    });
  });

  it('M21 GB1: the pixel grid is a line at every pixel of the part shown (none when too many)', () => {
    expect(pixelGridPath({ x: 2, y: 3, width: 2, height: 1 })).toBe(
      'M2 3V4M3 3V4M4 3V4M2 3H4M2 4H4',
    );
    expect(pixelGridPath({ x: 0, y: 0, width: 4000, height: 3000 })).toBe('');
  });
});
