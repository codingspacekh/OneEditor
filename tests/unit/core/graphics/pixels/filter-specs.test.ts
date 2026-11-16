// M22 step 4 (GB5, GN2): a filter as data — its kind and settings in image px as the student types
// them — checked (a refusal in words), first placed on the layer's pixels (a reduced preview's
// radii shrunk with it), its defaults taken from the layer or the selection, and run in the pixel
// worker as a job that answers with only the tiles it changed.
import { describe, expect, it } from 'vitest';
import {
  defaultFilter,
  FILTER_FIELDS,
  FILTER_KINDS,
  FILTER_NAMES,
  filterInRaster,
  filterProblem,
  runFilter,
  type FilterSpec,
} from '../../../../../src/core/graphics/pixels/filter-specs.ts';
import { restMesh } from '../../../../../src/core/graphics/pixels/distort.ts';
import { answerPixelJob, runPixelJob } from '../../../../../src/core/graphics/pixels/jobs.ts';
import { createBitmap, fillRect, pixelAt } from '../../../../../src/core/graphics/pixels/raster.ts';

const box = { x: 100, y: 50, width: 400, height: 200 };

describe('M22 GB5: a filter as data', () => {
  it('M22 GB5: eight filters, each with a name and its defaults on the layer', () => {
    expect(FILTER_KINDS).toEqual([
      'gaussian',
      'motion',
      'zoom',
      'twirl',
      'sharpen',
      'bulge',
      'perspective',
      'warp',
    ]);
    for (const k of FILTER_KINDS) {
      expect(FILTER_NAMES[k].length).toBeGreaterThan(3);
      expect(filterProblem(defaultFilter(k, box))).toBeNull();
    }
    // The centre in the middle of the layer, the circle as big as fits.
    expect(defaultFilter('twirl', box)).toMatchObject({ centre: { x: 300, y: 150 }, radius: 100 });
    // With a selection: its middle and its size.
    expect(defaultFilter('bulge', box, { x: 200, y: 100, width: 60, height: 80 })).toMatchObject({
      centre: { x: 230, y: 140 },
      radius: 30,
    });
    expect(defaultFilter('perspective', box)).toEqual({
      kind: 'perspective',
      corners: [
        { x: 100, y: 50 },
        { x: 500, y: 50 },
        { x: 500, y: 250 },
        { x: 100, y: 250 },
      ],
    });
    expect((defaultFilter('warp', box) as { points: readonly unknown[] }).points).toEqual(
      restMesh(400, 200, 100, 50),
    );
  });

  it('M22 GB5: numbers out of range are refused in words', () => {
    expect(filterProblem({ kind: 'gaussian', radius: 0 })).toMatch(/Radius.*0\.1.*250/);
    expect(filterProblem({ kind: 'gaussian', radius: Number.NaN })).toMatch(/number/);
    expect(
      filterProblem({ kind: 'twirl', centre: { x: 0, y: 0 }, radius: 10, angle: 1200 }),
    ).toMatch(/Angle/);
    expect(filterProblem({ kind: 'zoom', centre: { x: Number.NaN, y: 0 }, amount: 20 })).toMatch(
      /centre/,
    );
    expect(filterProblem({ kind: 'sharpen', amount: 100, radius: 1, threshold: 300 })).toMatch(
      /Threshold/,
    );
    expect(
      filterProblem({
        kind: 'perspective',
        corners: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
      }),
    ).toMatch(/cross/);
    expect(filterProblem({ kind: 'warp', points: [] })).toMatch(/16/);
    // Each kind's typed fields are listed, with their range.
    expect(FILTER_FIELDS.bulge.map((f) => f.key)).toEqual(['radius', 'amount']);
    expect(FILTER_FIELDS.bulge[1]).toMatchObject({ min: -100, max: 100, unit: '%' });
  });

  it('M22 GN2: placed on the layer’s pixels: points from its corner, lengths over a preview’s scale', () => {
    const place = { x: 100, y: 50, scale: 4 };
    expect(
      filterInRaster({ kind: 'twirl', centre: { x: 300, y: 150 }, radius: 100, angle: 90 }, place),
    ).toEqual({ kind: 'twirl', centre: { x: 50, y: 25 }, radius: 25, angle: 90 });
    expect(filterInRaster({ kind: 'gaussian', radius: 8 }, place)).toEqual({
      kind: 'gaussian',
      radius: 2,
    });
    expect(filterInRaster({ kind: 'motion', angle: 30, distance: 40 }, place)).toEqual({
      kind: 'motion',
      angle: 30,
      distance: 10,
    });
    expect(
      filterInRaster({ kind: 'sharpen', amount: 150, radius: 2, threshold: 4 }, place),
    ).toEqual({ kind: 'sharpen', amount: 150, radius: 0.5, threshold: 4 });
    expect(filterInRaster({ kind: 'zoom', centre: { x: 104, y: 58 }, amount: 30 }, place)).toEqual({
      kind: 'zoom',
      centre: { x: 1, y: 2 },
      amount: 30,
    });
    expect(
      filterInRaster({ kind: 'bulge', centre: { x: 100, y: 50 }, radius: 40, amount: 50 }, place),
    ).toEqual({ kind: 'bulge', centre: { x: 0, y: 0 }, radius: 10, amount: 50 });
    const corners = defaultFilter('perspective', box);
    expect(filterInRaster(corners, { x: 100, y: 50, scale: 1 })).toEqual({
      kind: 'perspective',
      corners: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 200 },
        { x: 0, y: 200 },
      ],
    });
    const mesh = filterInRaster(defaultFilter('warp', box), { x: 100, y: 50, scale: 2 });
    expect((mesh as { points: readonly unknown[] }).points).toEqual(restMesh(200, 100));
  });

  it('M22 GB5: runFilter does each kind; a refused one throws its words', () => {
    // A blue square on grey (on transparent, sharpening would find no colour edge to sharpen).
    const grey = fillRect(
      createBitmap(40, 40),
      { x: 0, y: 0, width: 40, height: 40 },
      [200, 200, 200, 255],
    );
    const b = fillRect(grey, { x: 10, y: 10, width: 20, height: 20 }, [0, 0, 200, 255]);
    const specs: FilterSpec[] = [
      { kind: 'gaussian', radius: 2 },
      { kind: 'motion', angle: 0, distance: 6 },
      { kind: 'zoom', centre: { x: 20, y: 20 }, amount: 40 },
      { kind: 'twirl', centre: { x: 20, y: 20 }, radius: 15, angle: 90 },
      { kind: 'sharpen', amount: 100, radius: 1, threshold: 0 },
      { kind: 'bulge', centre: { x: 20, y: 20 }, radius: 15, amount: 50 },
      {
        kind: 'perspective',
        corners: [
          { x: 5, y: 0 },
          { x: 35, y: 0 },
          { x: 40, y: 40 },
          { x: 0, y: 40 },
        ],
      },
      { kind: 'warp', points: restMesh(40, 40).map((p) => ({ x: p.x * 0.9, y: p.y })) },
    ];
    for (const s of specs) expect(runFilter(b, s), s.kind).not.toBe(b);
    expect(() => runFilter(b, { kind: 'gaussian', radius: -1 })).toThrow(/Radius/);
  });

  it('M22 GN2: the worker job answers with only the tiles the filter changed', () => {
    let b = fillRect(
      createBitmap(600, 300),
      { x: 0, y: 0, width: 600, height: 300 },
      [9, 9, 9, 255],
    );
    b = fillRect(b, { x: 20, y: 20, width: 10, height: 10 }, [255, 255, 255, 255]);
    const patch = runPixelJob('filter', {
      raster: b,
      spec: { kind: 'bulge', centre: { x: 25, y: 25 }, radius: 20, amount: 60 },
    });
    expect(patch.changes.map(([i]) => i)).toEqual([0]);
    expect(pixelAt(b, 25, 25)).toEqual([255, 255, 255, 255]);
    const refused = answerPixelJob({
      id: 3,
      job: 'filter',
      input: { raster: b, spec: { kind: 'gaussian', radius: 0 } },
    });
    expect(refused.reply).toMatchObject({ id: 3, ok: false, edit: true });
  });
});
