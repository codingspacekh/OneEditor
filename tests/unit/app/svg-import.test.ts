// GV6 (M19): SVG files in the app — Graphics mode's Open Image… opens an SVG as a new image of
// its size, and File ▸ Import SVG… (both modes) puts its shapes into the drawing as one group on
// the layer in use, selected, in one undo step (9626/04 M/26: ChipLeg.svg).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GroupObject, TextObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

const CHIP_LEG = readFileSync('tests/fixtures/graphics/ChipLeg.svg', 'utf8');

function setup() {
  const t = testApp();
  t.disk.set('/given/ChipLeg.svg', CHIP_LEG);
  return t;
}

describe('GV6: Open Image… of an SVG (Graphics mode)', () => {
  it('opens ChipLeg.svg as a new 78 × 240 px image of its group, not yet saved as .mveg', async () => {
    const { app, dialogs } = setup();
    const g = app.graphics;
    dialogs.openGraphic.mockResolvedValueOnce('/given/ChipLeg.svg');
    await g.open();
    const doc = g.store.get().history.present;
    expect(doc.name).toBe('ChipLeg');
    expect(doc.stage).toMatchObject({ width: 78, height: 240, background: 'none' });
    expect(doc.graphic).toEqual({ dpi: 96, units: 'px' });
    const [group] = doc.layers[0]!.objects as [GroupObject];
    expect(group.kind).toBe('group');
    expect(group.children).toHaveLength(4);
    expect(g.store.get().path).toBeNull();
    expect(g.store.get().message?.text).toBe(
      'Opened ChipLeg.svg as a new image of 1 object. Save it to keep it as an image (.mveg).',
    );
  });

  it('turns our own export’s background back into the canvas colour, and names what was left out', async () => {
    const { app, dialogs, disk } = setup();
    disk.set(
      '/given/Logo.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect x="0" y="0" width="40" height="30" fill="#f4c8ee"/><image href="a.png"/><circle cx="5" cy="5" r="5"/></svg>',
    );
    dialogs.openGraphic.mockResolvedValueOnce('/given/Logo.svg');
    await app.graphics.open();
    const doc = app.graphics.store.get().history.present;
    expect(doc.stage.background).toBe('#f4c8ee');
    expect(doc.layers[0]!.objects.map((o) => o.kind)).toEqual(['ellipse']);
    expect(app.graphics.store.get().message?.text).toMatch(
      /of 1 object\. 1 picture inside the SVG was left out\./,
    );
  });

  it('says so when the file is not an SVG picture', async () => {
    const { app, dialogs, disk } = setup();
    disk.set('/given/Bad.svg', 'not a picture');
    dialogs.openGraphic.mockResolvedValueOnce('/given/Bad.svg');
    await app.graphics.open();
    expect(app.graphics.store.get().message).toEqual({
      kind: 'error',
      text: 'This file is not an SVG picture.',
    });
  });
});

describe('GV6: File ▸ Import SVG…', () => {
  it('puts ChipLeg.svg into the image as one selected group on the layer in use, one undo step', async () => {
    const { app, dialogs } = setup();
    const g = app.graphics;
    g.addShape('rect', { x: 10, y: 10, width: 50, height: 50 });
    dialogs.openSvg.mockResolvedValueOnce('/given/ChipLeg.svg');
    await g.importSvg();
    const objects = g.store.get().history.present.layers[0]!.objects;
    expect(objects.map((o) => o.kind)).toEqual(['rect', 'group']);
    const group = objects[1] as GroupObject;
    expect(group.name).toBe('dp_dp001');
    expect(g.store.get().selection).toEqual([group.id]);
    expect(g.store.get().message?.text).toBe('Imported ChipLeg.svg: 1 object.');
    g.undo();
    expect(g.store.get().history.present.layers[0]!.objects).toHaveLength(1);
  });

  it('groups several shapes under the file’s name, at the image’s resolution', async () => {
    const { app, dialogs, disk } = setup();
    await app.graphics.newImage({
      name: 'A4',
      size: { width: 21, height: 29.7, units: 'cm', dpi: 300 },
      background: '#ffffff',
    });
    disk.set(
      '/given/Two.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in" viewBox="0 0 200 100"><rect width="100" height="100"/><rect x="100" width="100" height="100"/></svg>',
    );
    dialogs.openSvg.mockResolvedValueOnce('/given/Two.svg');
    await app.graphics.importSvg();
    const [group] = app.graphics.store.get().history.present.layers[0]!.objects as [GroupObject];
    expect(group.name).toBe('Two');
    // 2 in at 300 dpi.
    expect(group.width).toBe(600);
  });

  it('works in Animation mode too, on the drawing shown of a frame-by-frame layer', async () => {
    const { app, dialogs } = setup();
    const a = app.animation;
    expect(a.makeFrameByFrame()).toBeNull();
    dialogs.openSvg.mockResolvedValueOnce('/given/ChipLeg.svg');
    await a.importSvg();
    expect(a.store.get().history.present.layers[0]!.objects).toHaveLength(1);
  });

  it('places text with the fonts’ measured baselines', async () => {
    const { app, dialogs, disk, stageRenderer } = setup();
    disk.set(
      '/given/Word.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="0" y="50" font-size="10">Hi</text></svg>',
    );
    dialogs.openSvg.mockResolvedValueOnce('/given/Word.svg');
    await app.graphics.importSvg();
    expect(stageRenderer.textTops).toHaveBeenCalledWith(['400 10px "Inter"']);
    const [text] = app.graphics.store.get().history.present.layers[0]!.objects as [TextObject];
    expect(text.y).toBe(41);
  });

  it('does nothing when cancelled; says why when there is nothing to import or no layer', async () => {
    const { app, dialogs, disk } = setup();
    const g = app.graphics;
    await g.importSvg();
    expect(g.store.get().message).toBeNull();
    disk.set(
      '/given/Empty.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="x.png"/></svg>',
    );
    dialogs.openSvg.mockResolvedValueOnce('/given/Empty.svg');
    await g.importSvg();
    expect(g.store.get().message?.text).toBe(
      'There are no shapes in Empty.svg to import. 1 picture inside the SVG was left out.',
    );
    g.store.update((s) => ({ ...s, layerId: 'gone' }));
    dialogs.openSvg.mockResolvedValueOnce('/given/ChipLeg.svg');
    await g.importSvg();
    expect(g.store.get().message?.text).toBe('Choose a layer to import the SVG onto.');
    expect(g.store.get().busy).toBeNull();
  });
});
