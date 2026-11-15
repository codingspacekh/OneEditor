// M19 / GV7, GV8: View ▸ Outline in the app (a view setting, not an edit) and template layers
// (Place template…, the Template toggle), which no export, Send to Animation or part export sees
// (9626/04 O/N/22 Plane.jpg traced over, M/26 Chip.png drawn over).
import { describe, expect, it } from 'vitest';
import type { ProbeInfo } from '../../../src/core/ports.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';

const PLANE: ProbeInfo = {
  kind: 'image',
  container: 'jpg',
  sizeBytes: 1,
  video: { codec: 'mjpeg', width: 640, height: 360 },
};
const CLIP: ProbeInfo = {
  kind: 'video',
  container: 'mp4',
  duration: 3,
  sizeBytes: 1,
  video: { codec: 'h264', width: 640, height: 360, fps: 30 },
};

function setup() {
  const t = testApp({ '/m/Plane.jpg': PLANE, '/m/photo.jpg': IMAGE, '/m/clip.mp4': CLIP });
  const g = t.app.graphics;
  const doc = () => g.store.get().history.present;
  const message = () => g.store.get().message?.text ?? '';
  return { ...t, g, doc, message };
}

async function withTemplate() {
  const s = setup();
  s.g.setImage({ width: 1280, height: 720 });
  s.dialogs.openPicture.mockResolvedValueOnce('/m/Plane.jpg');
  await s.g.placeTemplate();
  return s;
}

describe('GV7: View ▸ Outline', () => {
  it('GV7: turns the outline view on and off, kept with the image but not an edit', () => {
    const s = setup();
    expect(s.doc().view.wireframe).toBeFalsy();
    s.g.toggleOutline();
    expect(s.doc().view.wireframe).toBe(true);
    expect(s.g.isDirty()).toBe(false);
    s.g.toggleOutline();
    expect(s.doc().view.wireframe).toBe(false);
  });
});

describe('GV8: template layers', () => {
  it('GV8: Place template… puts the picture faded and locked on a bottom layer, fitted to the canvas', async () => {
    const s = await withTemplate();
    const [template, drawing] = s.doc().layers;
    expect(template).toMatchObject({ name: 'Template', locked: true, template: true });
    expect(template!.objects[0]).toMatchObject({ kind: 'picture', x: 0, y: 0, width: 1280 });
    expect(template!.objects[0]!.height).toBe(720);
    // New objects still go on the layer being drawn on.
    expect(s.g.store.get().layerId).toBe(drawing!.id);
    expect(s.message()).toMatch(/Plane\.jpg.*template/);
    s.g.undo();
    expect(s.doc().layers).toHaveLength(1);
  });

  it('GV8: does nothing when the box is closed, and refuses a file that is not a picture', async () => {
    const s = setup();
    await s.g.placeTemplate();
    expect(s.doc().layers).toHaveLength(1);
    s.dialogs.openPicture.mockResolvedValueOnce('/m/clip.mp4');
    await s.g.placeTemplate();
    expect(s.doc().layers).toHaveLength(1);
    expect(s.message()).toMatch(/Choose a picture file/);
  });

  it('GV8: the Template toggle marks any layer, and unmarks it, as one undo step each', () => {
    const s = setup();
    const id = s.doc().layers[0]!.id;
    s.g.toggleTemplate(id);
    expect(s.doc().layers[0]).toMatchObject({ template: true, locked: true });
    s.g.toggleTemplate(id);
    expect(s.doc().layers[0]!.template).toBeUndefined();
    s.g.undo();
    expect(s.doc().layers[0]!.template).toBe(true);
    s.g.toggleTemplate('gone');
    expect(s.message()).toMatch(/not there/);
  });

  it('GV8: never exported: PNG and SVG are drawn without it, and its picture is not inside', async () => {
    const s = await withTemplate();
    s.g.addShape('rect', { x: 10, y: 10, width: 50, height: 50 });
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Plane.png');
    await s.g.exportImage({ format: 'png' });
    const [drawn] = s.stageRenderer.renderPng.mock.calls.at(-1)!;
    expect(drawn.layers.some((l) => l.template)).toBe(false);
    s.dialogs.exportGraphic.mockResolvedValueOnce('/work/Plane.svg');
    await s.g.exportImage({ format: 'svg' });
    expect(s.disk.get('/work/Plane.svg')).not.toContain('<image');
    expect(s.pageAssets.pictureDataUrl).not.toHaveBeenCalled();
  });

  it('GV8: not sent to Animation mode', async () => {
    const s = await withTemplate();
    expect(s.g.toSend()).toBeNull();
    s.g.addShape('rect', { x: 10, y: 10, width: 50, height: 50 });
    expect(s.g.toSend()!.objects).toHaveLength(1);
    expect(s.g.toSend()!.pictures).toEqual([]);
  });

  it('GV8: an animation is exported without its template too', async () => {
    const s = setup();
    const a = s.app.animation;
    s.dialogs.openPicture.mockResolvedValueOnce('/m/Plane.jpg');
    await a.placeTemplate();
    expect(a.store.get().history.present.layers[0]!.template).toBe(true);
    s.dialogs.exportAnimation.mockResolvedValueOnce('/work/frame.png');
    await a.exportAnimation('png');
    const [drawn] = s.stageRenderer.renderPng.mock.calls.at(-1)!;
    expect(drawn.layers.some((l) => l.template)).toBe(false);
  });
});
