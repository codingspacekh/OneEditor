// 2026-11-18 (AN8, as Animate's camera): the camera shows part of the stage — centred on a point,
// zoomed in or out, turned — keyed at the playhead like an object, smoothly (ease in and out).
// Every export draws the stage through it; the editing stage shows its frame, or looks through it.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createButton,
  createRect,
} from '../../../../src/core/animation/factory.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import {
  cameraAt,
  cameraFrame,
  cameraMatrix,
  fromCamera,
  removeCameraKeysAt,
  resetCamera,
  setCameraAt,
} from '../../../../src/core/animation/camera.ts';
import { buttonAt } from '../../../../src/core/animation/buttons.ts';
import { drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import {
  deserializeAnimation,
  serializeAnimation,
} from '../../../../src/core/animation/serialize.ts';
import type { AnimationDoc } from '../../../../src/core/animation/types.ts';

const doc0 = (): AnimationDoc => createAnimation({ name: 'Shot' }); // 1280 × 720
const apply = (m: readonly number[], p: { x: number; y: number }) => ({
  x: Math.round((m[0]! * p.x + m[2]! * p.y + m[4]!) * 1000) / 1000,
  y: Math.round((m[1]! * p.x + m[3]! * p.y + m[5]!) * 1000) / 1000,
});

describe('the camera’s view', () => {
  it('with no camera it sees the whole stage as it is', () => {
    const view = cameraAt(doc0(), 30);
    expect(view).toEqual({ x: 640, y: 360, zoom: 100, rotation: 0 });
    expect(apply(cameraMatrix(view, doc0().stage), { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it('zooms about the point it is centred on, pans, and turns the picture the other way', () => {
    const stage = doc0().stage;
    const zoomed = { x: 640, y: 360, zoom: 200, rotation: 0 };
    expect(apply(cameraMatrix(zoomed, stage), { x: 740, y: 360 })).toEqual({ x: 840, y: 360 });
    const panned = { x: 740, y: 360, zoom: 100, rotation: 0 };
    expect(apply(cameraMatrix(panned, stage), { x: 740, y: 360 })).toEqual({ x: 640, y: 360 });
    // The camera turned 90° clockwise: what was right of the centre is now above it.
    const turned = { x: 640, y: 360, zoom: 100, rotation: 90 };
    expect(apply(cameraMatrix(turned, stage), { x: 740, y: 360 })).toEqual({ x: 640, y: 260 });
    // fromCamera undoes it: a click on the picture finds the stage point under it.
    const any = { x: 500, y: 300, zoom: 150, rotation: 30 };
    const out = apply(cameraMatrix(any, stage), { x: 123, y: 456 });
    const back = fromCamera(any, stage, out);
    expect(back.x).toBeCloseTo(123, 2);
    expect(back.y).toBeCloseTo(456, 2);
  });

  it('its frame on the stage: zoomed in twice, the middle half each way', () => {
    expect(cameraFrame({ x: 640, y: 360, zoom: 200, rotation: 0 }, doc0().stage)).toEqual([
      { x: 320, y: 180 },
      { x: 960, y: 180 },
      { x: 960, y: 540 },
      { x: 320, y: 540 },
    ]);
  });
});

describe('keying the camera', () => {
  it('at frame 0 with no keyframes it is just set; later it makes keyframes, eased in and out', () => {
    let doc = setCameraAt(doc0(), 'x', 0, 400);
    expect(doc.camera).toMatchObject({ x: 400 });
    expect(doc.camera!.tracks ?? []).toEqual([]);
    doc = setCameraAt(doc, 'zoom', 24, 200);
    expect(doc.camera!.tracks).toEqual([
      {
        property: 'zoom',
        keyframes: [
          { frame: 0, value: 100, easing: 'ease-in-out', hold: false },
          { frame: 24, value: 200, easing: 'ease-in-out', hold: false },
        ],
      },
    ]);
    expect(cameraAt(doc, 12).zoom).toBeCloseTo(150, 6);
    expect(cameraAt(doc, 6).zoom).toBeLessThan(125);
    expect(cameraAt(doc, 40)).toEqual({ x: 400, y: 360, zoom: 200, rotation: 0 });
  });

  it('refuses a zoom under 10 % or over 1000 %, and numbers that are not numbers', () => {
    expect(() => setCameraAt(doc0(), 'zoom', 0, 5)).toThrow(/10 %/);
    expect(() => setCameraAt(doc0(), 'zoom', 0, 2000)).toThrow(/1000 %/);
    expect(() => setCameraAt(doc0(), 'x', 0, Number.NaN)).toThrow(/number/i);
  });

  it('its keyframes at a frame are removed; Reset puts it back to the whole stage', () => {
    let doc = setCameraAt(doc0(), 'zoom', 24, 200);
    doc = setCameraAt(doc, 'x', 24, 300);
    expect(() => removeCameraKeysAt(doc, 10)).toThrow(/no camera keyframe/i);
    doc = removeCameraKeysAt(doc, 24);
    expect(cameraAt(doc, 24)).toEqual({ x: 640, y: 360, zoom: 100, rotation: 0 });
    expect(resetCamera(setCameraAt(doc0(), 'zoom', 0, 300)).camera).toBeUndefined();
  });

  it('a file keeps the camera', () => {
    const doc = setCameraAt(setCameraAt(doc0(), 'rotation', 0, 10), 'zoom', 24, 250);
    expect(deserializeAnimation(serializeAnimation(doc))).toEqual(doc);
  });
});

describe('through the camera', () => {
  function recorder() {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, key: string) =>
          key === 'withLayer' || key === 'withFilters'
            ? undefined
            : (...a: unknown[]) => {
                calls.push(
                  `${key}(${a.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : '…')).join(',')})`,
                );
                return key === 'measureText' ? { width: 10 } : undefined;
              },
        set: () => true,
      },
    ) as unknown as StageCanvas;
    return { ctx, calls };
  }

  it('an export draws the objects through the camera, the background as it is', () => {
    const base = doc0();
    let doc = addObject(
      base,
      base.layers[0]!.id,
      createRect({ x: 0, y: 0, width: 10, height: 10 }),
    );
    doc = setCameraAt(doc, 'zoom', 0, 200);
    const { ctx, calls } = recorder();
    drawStage(ctx, doc, { frame: 0 });
    const fill = calls.indexOf('fillRect(0,0,1280,720)');
    const camera = calls.indexOf('transform(2,0,0,2,-640,-360)');
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(camera).toBeGreaterThan(fill);
    expect(calls.at(-1)).toBe('restore()');
  });

  it('the editing stage can leave the camera out', () => {
    const doc = setCameraAt(doc0(), 'zoom', 0, 200);
    const { ctx, calls } = recorder();
    drawStage(ctx, doc, { frame: 0, camera: false });
    expect(calls.some((c) => c.startsWith('transform(2,'))).toBe(false);
  });

  it('a click on the web page finds the button under it through the camera', () => {
    const base = doc0();
    const button = { ...createButton('pause', { x: 600, y: 340 }), width: 80, height: 40 };
    let doc = addObject(base, base.layers[0]!.id, button);
    expect(buttonAt(doc, 0, { x: 620, y: 350 })?.id).toBe(button.id);
    // Zoomed in twice on the centre, the button (600–680 across) is drawn at 560–720.
    doc = setCameraAt(doc, 'zoom', 0, 200);
    expect(buttonAt(doc, 0, { x: 570, y: 330 })?.id).toBe(button.id);
    expect(buttonAt(doc, 0, { x: 540, y: 330 })).toBeNull();
  });
});
