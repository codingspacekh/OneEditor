// Native menu items act on the mode that is showing (Video or Audio).
import { describe, expect, it, vi } from 'vitest';
import { menuActions } from '../../../src/ui/menu-actions.ts';
import { leaveLearn, ui } from '../../../src/ui/ui-state.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';

describe('menu actions follow the mode', () => {
  it('Undo / Redo / Import act on the video project in Video mode', async () => {
    const { app } = testApp();
    const undo = vi.spyOn(app, 'undo');
    const audioUndo = vi.spyOn(app.audio, 'undo');
    menuActions(app).undo();
    expect([undo.mock.calls.length, audioUndo.mock.calls.length]).toEqual([1, 0]);
  });

  it('… and on the sound in Audio mode', async () => {
    const { app } = testApp();
    ui.mode = 'Audio';
    const spies = {
      undo: vi.spyOn(app.audio, 'undo'),
      redo: vi.spyOn(app.audio, 'redo'),
      importAudio: vi.spyOn(app.audio, 'importAudio'),
      selectAll: vi.spyOn(app.audio, 'selectAll'),
    };
    const actions = menuActions(app);
    actions.undo();
    actions.redo();
    await actions.import();
    actions.selectAll();
    expect(Object.values(spies).map((s) => s.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it('Export Audio… switches to Audio mode and opens its export dialog', () => {
    const { app } = testApp();
    menuActions(app).exportAudio();
    expect([ui.mode, ui.audioExport]).toEqual(['Audio', true]);
  });

  it('Select All in a text box selects its text, not the sound', () => {
    const { app } = testApp();
    ui.mode = 'Audio';
    const input = document.createElement('input');
    input.value = 'Task_11j';
    document.body.append(input);
    input.focus();
    const selectAll = vi.spyOn(app.audio, 'selectAll');
    menuActions(app).selectAll();
    expect(selectAll).not.toHaveBeenCalled();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 8]);
    input.remove();
  });

  it('N15 a Learn menu item shows that Learn page; Back returns to the editor it came from', () => {
    const { app } = testApp();
    ui.mode = 'Animation';
    const actions = menuActions(app);
    actions.learnFormats();
    expect([ui.mode, ui.learnTab, ui.learnFrom]).toEqual(['Learn', 'formats', 'Animation']);
    // Another Learn page keeps where it came from.
    actions.learnTask();
    expect([ui.learnTab, ui.learnFrom]).toEqual(['task', 'Animation']);
    actions.learnInspect();
    actions.learnAnimation();
    expect(ui.learnTab).toBe('animation');
    leaveLearn();
    expect(ui.mode).toBe('Animation');
  });

  it('N15 Glossary opens over any mode, without leaving it', () => {
    const { app } = testApp();
    ui.mode = 'Audio';
    menuActions(app).glossary();
    expect([ui.mode, ui.glossary]).toEqual(['Audio', true]);
    ui.glossary = false;
  });

  it('N16 View ▸ Show / Hide acts on the panels of the editor that is showing; Reset Layout on all', async () => {
    const { app } = testApp();
    const actions = menuActions(app);
    ui.mode = 'Animation';
    await actions.toggleLeft();
    await actions.toggleBottom();
    expect(app.layout.store.get().hidden).toEqual(['animation.layers', 'animation.timeline']);
    ui.mode = 'Video';
    await actions.toggleRight();
    expect(app.layout.store.get().hidden).toContain('video.inspector');
    ui.mode = 'Audio';
    await actions.toggleLeft(); // Audio mode has no left panel: nothing changes
    expect(app.layout.store.get().hidden).toHaveLength(3);
    await actions.resetLayout();
    expect(app.layout.store.get().hidden).toEqual([]);
    ui.mode = 'Video';
  });

  it('GV7 View ▸ Outline turns the outline view on and off in the drawing modes only', () => {
    const { app } = testApp();
    const actions = menuActions(app);
    const wire = (a: typeof app.graphics) => a.store.get().history.present.view.wireframe;
    ui.mode = 'Graphics';
    actions.outline();
    expect(wire(app.graphics)).toBe(true);
    ui.mode = 'Animation';
    actions.outline();
    expect(wire(app.animation)).toBe(true);
    ui.mode = 'Video';
    actions.outline();
    expect(wire(app.animation)).toBe(true);
    expect(wire(app.graphics)).toBe(true);
  });

  it('GV8 File ▸ Place Template… places it in the drawing mode showing, else in Graphics mode', async () => {
    const { app } = testApp();
    const actions = menuActions(app);
    const animPlace = vi.spyOn(app.animation, 'placeTemplate');
    const graphicsPlace = vi.spyOn(app.graphics, 'placeTemplate');
    ui.mode = 'Animation';
    await actions.placeTemplate();
    expect(animPlace).toHaveBeenCalledTimes(1);
    ui.mode = 'Video';
    await actions.placeTemplate();
    expect(ui.mode).toBe('Graphics');
    expect(graphicsPlace).toHaveBeenCalledTimes(1);
    ui.mode = 'Video';
  });

  it('GV6 File ▸ Import SVG… imports into the drawing mode showing, else into Graphics mode', async () => {
    const { app } = testApp();
    const actions = menuActions(app);
    const animImport = vi.spyOn(app.animation, 'importSvg');
    const graphicsImport = vi.spyOn(app.graphics, 'importSvg');
    ui.mode = 'Animation';
    await actions.importSvg();
    expect(animImport).toHaveBeenCalledTimes(1);
    ui.mode = 'Video';
    await actions.importSvg();
    expect(ui.mode).toBe('Graphics');
    expect(graphicsImport).toHaveBeenCalledTimes(1);
    ui.mode = 'Video';
  });
});

describe('M21: the Image menu and View ▸ Pixel Grid', () => {
  it('M21 GB6, G8: open Graphics mode and its dialogs, or trim its image', async () => {
    const { animUi } = await import('../../../src/ui/animation/animation-ui.svelte.ts');
    const { app } = testApp();
    const actions = menuActions(app);
    ui.mode = 'Video';
    actions.imageSize();
    expect([ui.mode, animUi.dialog]).toEqual(['Graphics', 'imageSize']);
    actions.canvasSize();
    expect(animUi.dialog).toBe('canvasSize');
    actions.reduceColours();
    expect(animUi.dialog).toBe('reduceColours');
    animUi.dialog = null;
    const trim = vi.spyOn(app.graphics, 'trimCanvas');
    actions.cropToContent();
    actions.trimPlain();
    expect(trim.mock.calls).toEqual([[false], [true]]);
    const was = animUi.pixelGrid;
    actions.pixelGrid();
    expect(animUi.pixelGrid).toBe(!was);
    actions.pixelGrid();
    ui.mode = 'Video';
  });
});

describe('M21: the Layer and Select menus', () => {
  it('M21 G2, GB2, G13: each item opens Graphics mode and acts on its image, with the option bar’s amounts', async () => {
    const { selUi } = await import('../../../src/ui/graphics/selection-ui.svelte.ts');
    const { app } = testApp();
    const g = app.graphics;
    const actions = menuActions(app);
    const calls: string[] = [];
    const methods = g as unknown as Record<string, (...args: unknown[]) => unknown>;
    const spy = (name: string) =>
      vi.spyOn(methods, name).mockImplementation((...args: unknown[]) => {
        calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`);
      });
    for (const name of [
      'openPictureAsImage',
      'cropToPixelSelection',
      'addPixelLayer',
      'addPictureAsLayer',
      'copySelectionToLayer',
      'cutSelectionToLayer',
      'maskFromPixelSelection',
      'mergeLayers',
      'selectAllPixels',
      'deselectPixels',
      'invertPixelSelection',
      'selectLayerPixels',
      'selectFromObjects',
      'featherPixelSelection',
      'growPixelSelection',
      'smoothPixelSelection',
      'fadePixelSelection',
    ] as const)
      spy(name);
    selUi.amount = 4;
    selUi.fade = 30;
    selUi.feather = 2;
    ui.mode = 'Video';
    actions.openPictureAsImage();
    expect(ui.mode).toBe('Graphics');
    for (const a of [
      'cropToSelection',
      'newPixelLayer',
      'addPictureAsLayer',
      'layerViaCopy',
      'layerViaCut',
      'maskFromSelection',
      'mergeDown',
      'mergeVisible',
      'flatten',
      'selectAllPixels',
      'deselectPixels',
      'invertSelection',
      'selectLayerPixels',
      'selectFromShape',
      'featherSelection',
      'growSelection',
      'shrinkSelection',
      'smoothSelection',
      'fadeSelection',
    ] as const)
      actions[a]();
    expect(calls).toEqual([
      'openPictureAsImage()',
      'cropToPixelSelection()',
      'addPixelLayer()',
      'addPictureAsLayer()',
      'copySelectionToLayer()',
      'cutSelectionToLayer()',
      'maskFromPixelSelection()',
      'mergeLayers("down")',
      'mergeLayers("visible")',
      'mergeLayers("flatten")',
      'selectAllPixels()',
      'deselectPixels()',
      'invertPixelSelection()',
      'selectLayerPixels()',
      'selectFromObjects({"feather":2})',
      'featherPixelSelection(4)',
      'growPixelSelection(4)',
      'growPixelSelection(-4)',
      'smoothPixelSelection(4)',
      'fadePixelSelection(30)',
    ]);
    ui.mode = 'Video';
  });

  it('M21 GB2: Select All on a pixel layer selects its pixels, else the objects', () => {
    const { app } = testApp();
    const g = app.graphics;
    const actions = menuActions(app);
    const pixels = vi.spyOn(g, 'selectAllPixels').mockImplementation(() => {});
    const objects = vi.spyOn(g, 'selectAll').mockImplementation(() => {});
    ui.mode = 'Graphics';
    actions.selectAll();
    expect([pixels.mock.calls.length, objects.mock.calls.length]).toEqual([0, 1]);
    g.addPixelLayer();
    actions.selectAll();
    expect([pixels.mock.calls.length, objects.mock.calls.length]).toEqual([1, 1]);
    ui.mode = 'Video';
  });
});
