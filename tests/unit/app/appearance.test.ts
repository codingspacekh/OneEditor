// M19 / G12, G14: appearance in the app — a picture tiled in a pattern fill (J/22: the vector
// balloon), fill and outline opacity, and filters, each one undo step, in Graphics mode as in
// Animation mode.
import { describe, expect, it } from 'vitest';
import { newFilter } from '../../../src/core/animation/appearance.ts';
import type { ProbeInfo } from '../../../src/core/ports.ts';
import { IMAGE, testApp } from '../../helpers/test-app.ts';

const VIDEO: ProbeInfo = {
  kind: 'video',
  container: 'mp4',
  sizeBytes: 9,
  duration: 1,
  video: { codec: 'h264', width: 10, height: 10 },
};

function setup() {
  const t = testApp({ '/m/leaf.jpg': IMAGE, '/m/clip.mp4': VIDEO });
  const g = t.app.graphics;
  const doc = () => g.store.get().history.present;
  const objects = () => doc().layers.flatMap((l) => l.objects);
  const message = () => g.store.get().message?.text ?? '';
  g.addShape('ellipse', { x: 10, y: 10, width: 200, height: 260 });
  return { ...t, g, doc, objects, message };
}

describe('G12 a picture tiled in a pattern fill', () => {
  it('G12 (J/22 balloon): Choose a picture… tiles the file chosen, one undo step with the picture', async () => {
    const s = setup();
    s.dialogs.openPicture.mockResolvedValueOnce('/m/leaf.jpg');
    expect(await s.g.tilePicture()).toBeNull();
    const [picture] = s.doc().pictures;
    expect(picture).toMatchObject({ path: '/m/leaf.jpg', width: 100, height: 100 });
    expect(s.objects()[0]!.fill).toMatchObject({
      kind: 'pattern',
      pattern: 'picture',
      pictureId: picture!.id,
      background: 'none',
      size: 100,
    });
    s.g.undo();
    expect(s.doc().pictures).toEqual([]);
    expect(s.objects()[0]!.fill.kind).toBe('solid');
  });

  it('G12: a file the animation has is used again; a pattern’s size and angle are kept', async () => {
    const s = setup();
    s.dialogs.openPicture.mockResolvedValue('/m/leaf.jpg');
    await s.g.tilePicture();
    const fill = s.objects()[0]!.fill;
    if (fill.kind !== 'pattern') throw new Error('not a pattern');
    s.g.setProperties({ fill: { ...fill, size: 30, angle: 45 } });
    await s.g.tilePicture();
    expect(s.doc().pictures).toHaveLength(1);
    expect(s.objects()[0]!.fill).toMatchObject({ size: 30, angle: 45 });
  });

  it('G12: nothing selected, nothing chosen, or not a picture: nothing changes, and why', async () => {
    const s = setup();
    s.g.select([]);
    expect(await s.g.tilePicture()).toBe('Select the shapes to fill with a picture.');
    s.g.select([s.objects()[0]!.id]);
    expect(await s.g.tilePicture()).toBeNull();
    s.dialogs.openPicture.mockResolvedValueOnce('/m/clip.mp4');
    expect(await s.g.tilePicture()).toBeNull();
    expect(s.message()).toMatch(/Choose a picture file/);
    expect(s.objects()[0]!.fill.kind).toBe('solid');
  });
});

describe('G12, G14 opacity and filters are plain settings, each one undo step', () => {
  it('G12 (workbook): fill opacity 50 %; G14: a drop shadow, then undo takes it off', () => {
    const s = setup();
    expect(s.g.setProperties({ fillOpacity: 50 })).toBeNull();
    expect(s.objects()[0]!.fillOpacity).toBe(50);
    expect(s.g.setProperties({ fillOpacity: 120 })).toMatch(/fill opacity/);
    expect(s.g.setProperties({ filters: [newFilter('dropShadow')] })).toBeNull();
    expect(s.objects()[0]!.filters).toEqual([newFilter('dropShadow')]);
    s.g.undo();
    expect(s.objects()[0]!.filters).toBeUndefined();
    expect(s.objects()[0]!.fillOpacity).toBe(50);
  });

  it('G14 in Animation mode a filter set at a later frame is not a keyframe (it is always there)', () => {
    const t = testApp();
    const anim = t.app.animation;
    anim.addShape('rect', { x: 0, y: 0, width: 50, height: 50 });
    anim.setFrame(20);
    expect(anim.setProperties({ filters: [newFilter('glow')] })).toBeNull();
    const rect = anim.store.get().history.present.layers[0]!.objects[0]!;
    expect(rect.filters).toEqual([newFilter('glow')]);
    expect(rect.tracks ?? []).toEqual([]);
  });
});
