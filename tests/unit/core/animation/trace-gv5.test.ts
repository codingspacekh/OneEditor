// GV5 (M19): Trace bitmap in black and white (a threshold: the dark parts become black
// silhouettes, their light insides holes, the light parts left out), of only a part of the
// picture, and the picture kept underneath on a hidden layer to compare.
import { describe, expect, it } from 'vitest';
import { createAnimation, createPicture } from '../../../../src/core/animation/factory.ts';
import {
  keepPictureUnder,
  traceBitmap,
  tracedGroup,
  type Pixels,
  type TraceOptions,
} from '../../../../src/core/animation/trace.ts';
import { validateObject } from '../../../../src/core/animation/rules.ts';
import type { PathObject } from '../../../../src/core/animation/types.ts';
import { EditError } from '../../../../src/core/model/errors.ts';

type RGBA = [number, number, number, number];
const WHITE: RGBA = [255, 255, 255, 255];
const DARK: RGBA = [40, 40, 60, 255];
const GREY: RGBA = [140, 140, 140, 255];

function picture(width: number, height: number, at: (x: number, y: number) => RGBA): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(at(x, y), (y * width + x) * 4);
  return { width, height, data };
}

/** A dark ring (an O) round a white middle at (30, 30), a grey square at the right, 80 × 60. */
const ring = picture(80, 60, (x, y) => {
  const d = Math.hypot(x + 0.5 - 30, y + 0.5 - 30);
  if (d <= 20 && d >= 10) return DARK;
  if (x >= 60 && x < 75 && y >= 20 && y < 35) return GREY;
  return WHITE;
});

const bw = (more: Partial<TraceOptions> = {}): TraceOptions => ({
  colours: 8,
  detail: 100,
  smoothing: 0,
  mode: 'blackWhite',
  ...more,
});

const xsOf = (points: { x: number }[]) => points.map((p) => p.x);

describe('GV5: black and white', () => {
  it('the dark ring becomes one black shape with its middle cut out; grey and white are left out', () => {
    const regions = traceBitmap(ring, bw());
    expect(regions).toHaveLength(1);
    expect(regions[0]!.colour).toBe('#000000');
    expect(regions[0]!.holes).toHaveLength(1);
    const hole = xsOf(regions[0]!.holes![0]!);
    expect(Math.min(...hole)).toBeGreaterThan(18);
    expect(Math.max(...hole)).toBeLessThan(42);
  });

  it('a higher threshold takes the grey square in too (silhouettes of everything darker)', () => {
    const regions = traceBitmap(ring, bw({ threshold: 200 }));
    expect(regions).toHaveLength(2);
    expect(regions.every((r) => r.colour === '#000000')).toBe(true);
    // 0 makes nothing black.
    expect(traceBitmap(ring, bw({ threshold: 0 }))).toEqual([]);
  });

  it('a light part reaching the edge is not a hole; tiny holes go with less detail', () => {
    // A dark bar with a notch open to the top edge.
    const notch = picture(30, 20, (x, y) => (y < 10 && x >= 12 && x < 18 ? WHITE : DARK));
    expect(traceBitmap(notch, bw())[0]!.holes).toBeUndefined();
    // A one-pixel speck of white inside dark: a hole only at full detail.
    const speck = picture(40, 40, (x, y) => (x === 20 && y === 20 ? WHITE : DARK));
    expect(traceBitmap(speck, bw())[0]!.holes).toHaveLength(1);
    expect(traceBitmap(speck, bw({ detail: 0 }))[0]!.holes).toBeUndefined();
  });

  it('see-through pixels are left out too', () => {
    const clear = picture(10, 10, () => [0, 0, 0, 0]);
    expect(traceBitmap(clear, bw())).toEqual([]);
  });

  it('the shapes keep their holes in the traced group', () => {
    const pic = createPicture(
      { id: 'p', path: '/m/O.png', width: 160, height: 120 },
      { x: 0, y: 0 },
    );
    const regions = traceBitmap(ring, bw({ smoothing: 50 }));
    const group = tracedGroup(pic, regions, ring);
    const shape = group.children[0] as PathObject;
    expect(shape.holes).toHaveLength(1);
    expect(shape.holes![0]![0]!.in).toBeDefined();
    validateObject(group);
  });
});

describe('GV5: only a part of the picture', () => {
  it('traces only the area chosen, placed where it is in the picture', () => {
    const right = traceBitmap(ring, {
      colours: 2,
      detail: 100,
      smoothing: 0,
      area: { x: 0.7, y: 0, width: 0.3, height: 1 },
    });
    // The grey square, and the white round it: nothing of the ring at the left.
    expect(right.map((r) => r.colour)).toContain('#8c8c8c');
    for (const r of right) expect(Math.min(...xsOf(r.points))).toBeGreaterThanOrEqual(56);
    const grey = right.find((r) => r.colour === '#8c8c8c')!;
    expect(Math.min(...xsOf(grey.points))).toBe(60);
  });

  it('moves holes and handles with it', () => {
    const regions = traceBitmap(
      ring,
      bw({ smoothing: 50, area: { x: 0, y: 0, width: 0.75, height: 1 } }),
    );
    expect(regions[0]!.holes).toHaveLength(1);
    expect(regions[0]!.points[0]!.in).toBeDefined();
  });

  it('refuses an area of nothing', () => {
    expect(() =>
      traceBitmap(ring, bw({ area: { x: 0.5, y: 0.5, width: 0, height: 0.2 } })),
    ).toThrow(EditError);
    expect(() => traceBitmap(ring, bw({ area: { x: NaN, y: 0, width: 1, height: 1 } }))).toThrow(
      'Choose a part of the picture to trace.',
    );
  });
});

describe('GV5: the picture kept underneath', () => {
  it('goes on a hidden layer of its own just below, named after it, out of any drawing', () => {
    const base = createAnimation({ name: 'Plane' });
    const top = { ...base.layers[0]!, id: 'top', folderId: 'f' };
    const doc = { ...base, layers: [{ ...base.layers[0]!, id: 'under' }, top] };
    const pic = {
      ...createPicture({ id: 'p', path: '/m/Plane.jpg', width: 100, height: 50 }, { x: 5, y: 5 }),
      drawing: 0,
    };
    const { doc: next, layerId } = keepPictureUnder(doc, 'top', pic);
    expect(next.layers.map((l) => l.id)).toEqual(['under', layerId, 'top']);
    const kept = next.layers[1]!;
    expect(kept).toMatchObject({ name: 'Plane.jpg (traced)', visible: false, folderId: 'f' });
    expect(kept.objects[0]).toMatchObject({ kind: 'picture', x: 5 });
    expect(kept.objects[0]!.drawing).toBeUndefined();
    expect(keepPictureUnder(doc, 'under', pic).doc.layers[0]!.folderId).toBeUndefined();
    expect(() => keepPictureUnder(doc, 'gone', pic)).toThrow(EditError);
  });
});
