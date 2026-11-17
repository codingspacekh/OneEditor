// GN1 (M23): the undo history of a big photo keeps within a memory budget. A step keeps only the
// tiles it changed, but a whole-layer step (an adjustment, a filter, Image size) on 12 megapixels
// keeps ~38 MB; past the budget the oldest steps are let go, never the newest one.
import { describe, expect, it } from 'vitest';
import { createAnimationApp, GRAPHIC_KIND } from '../../../src/app/animation.ts';
import { createHistory, execute, undo } from '../../../src/app/history.ts';
import { historyTileBytes, keepWithin } from '../../../src/app/animation/history-budget.ts';
import { createLayer } from '../../../src/core/animation/factory.ts';
import type { AnimationDoc } from '../../../src/core/animation/types.ts';
import { defaultGraphic } from '../../../src/core/graphics/document.ts';
import { createBitmap, fillRect } from '../../../src/core/graphics/pixels/raster.ts';
import { testApp } from '../../helpers/test-app.ts';

const TILE_BYTES = 256 * 256 * 4;

/** A 512 × 256 photo (two tiles) filled with a shade: every step changes both tiles. */
function photo(shade: number): AnimationDoc {
  const bitmap = fillRect(createBitmap(512, 256), { x: 0, y: 0, width: 512, height: 256 }, [
    shade,
    shade,
    shade,
    255,
  ]);
  return {
    ...defaultGraphic(),
    layers: [createLayer('Photo', { pixels: { bitmap, x: 0, y: 0 } })],
  };
}

function steps(n: number) {
  let h = createHistory(photo(0));
  for (let i = 1; i <= n; i++) h = execute(h, { label: `Shade ${i}`, apply: () => photo(i) });
  return h;
}

describe('GN1 (M23): the undo history within a memory budget', () => {
  it('GN1 (M23): counts the tiles only the history holds, once each', () => {
    const h = steps(3);
    // Three earlier pictures of two tiles each; the present's own tiles are not the history's.
    expect(historyTileBytes(h)).toBe(3 * 2 * TILE_BYTES);
    // A step that shares the present's tiles costs nothing more.
    const same = execute(h, {
      label: 'Add guide',
      apply: (d) => ({ ...d, guides: { x: [10], y: [] } }),
    });
    expect(historyTileBytes(same)).toBe(3 * 2 * TILE_BYTES + 0);
    // Redo steps are held by the history too.
    expect(historyTileBytes(undo(h))).toBe(3 * 2 * TILE_BYTES);
  });

  it('GN1 (M23): lets the oldest steps go past the budget, keeping the newest', () => {
    const h = steps(5);
    const kept = keepWithin(h, 4 * TILE_BYTES);
    expect(kept.dropped).toBe(3);
    expect(kept.history.past.map((e) => e.label)).toEqual(['Shade 4', 'Shade 5']);
    expect(kept.history.present).toBe(h.present);
    expect(historyTileBytes(kept.history)).toBeLessThanOrEqual(4 * TILE_BYTES);
  });

  it('GN1 (M23): leaves a history within the budget as it is', () => {
    const h = steps(2);
    expect(keepWithin(h, 100 * TILE_BYTES)).toEqual({ history: h, dropped: 0 });
  });

  it('GN1 (M23): always keeps the last step, even when it alone is over', () => {
    const h = steps(2);
    const kept = keepWithin(h, TILE_BYTES);
    expect(kept.history.past.map((e) => e.label)).toEqual(['Shade 2']);
    expect(kept.dropped).toBe(1);
  });

  it('GN1 (M23): an animation (no pixels) costs nothing', () => {
    let h = createHistory(defaultGraphic());
    h = execute(h, { label: 'Add guide', apply: (d) => ({ ...d, guides: { x: [10], y: [] } }) });
    expect(historyTileBytes(h)).toBe(0);
  });
});

describe('GN1 (M23): the editor keeps its history within the budget', () => {
  it('GN1 (M23): lets old steps go as the student works, and says so once', () => {
    const t = testApp();
    const g = createAnimationApp({
      dialogs: t.dialogs,
      files: {
        read: async () => '',
        write: async () => {},
        remove: async () => {},
        copy: async () => {},
        saveImage: async () => '',
        saveSound: async () => '',
        writeBytes: async () => {},
        readBytes: async () => new Uint8Array(),
      },
      paths: { proxies: '/c', recovery: '/c/r.mve', snapshots: '/c', learn: '/c' },
      engine: t.engine,
      kind: GRAPHIC_KIND,
      historyBudget: 4 * TILE_BYTES,
    });
    const shade = (i: number) =>
      g.store.update((s) => ({
        ...s,
        history: execute(s.history, { label: `Shade ${i}`, apply: () => photo(i) }),
      }));
    shade(0);
    // Through the app's own edits (guides are cheap steps): the photo's steps are the cost.
    for (let i = 1; i <= 4; i++) {
      g.store.update((s) => ({
        ...s,
        history: { ...s.history, present: photo(i) },
      }));
      g.addGuide('x', 10 * i);
    }
    expect(historyTileBytes(g.store.get().history)).toBeLessThanOrEqual(4 * TILE_BYTES);
    expect(g.store.get().message?.text).toMatch(/oldest undo steps are let go/);
  });
});
