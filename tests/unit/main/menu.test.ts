import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { menuTemplate } from '../../../src/main/menu.ts';
import type { MenuAction } from '../../../src/preload/api.ts';

type Item = MenuItemConstructorOptions;
const find = (menus: Item[], label: string) => menus.find((m) => m.label === label);
const items = (menu: Item | undefined) =>
  (menu?.submenu as Item[]).filter((i) => i.type !== 'separator');

describe('X3 native menus', () => {
  it('macOS has the app menu first, its About OneEditor going to the page; Windows does not', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const appMenu = menuTemplate('darwin', send, false)[0]!;
    expect(appMenu.label).toBe('OneEditor');
    const entries = items(appMenu);
    expect(entries[0]!.label).toBe('About OneEditor');
    (entries[0]!.click as () => void)();
    expect(send).toHaveBeenCalledWith('about');
    // Settings… (⌘,) where Mac apps have it, after About.
    expect(entries[1]).toMatchObject({ label: 'Settings…', accelerator: 'CmdOrCtrl+,' });
    (entries[1]!.click as () => void)();
    expect(send).toHaveBeenCalledWith('settings');
    expect(entries.slice(2).map((i) => i.role)).toEqual([
      'services',
      'hide',
      'hideOthers',
      'unhide',
      'quit',
    ]);
    expect(menuTemplate('win32', () => {}, false)[0]).toMatchObject({ label: 'File' });
  });

  it.each([
    ['New', 'CmdOrCtrl+N', 'new'],
    ['Open…', 'CmdOrCtrl+O', 'open'],
    ['Save', 'CmdOrCtrl+S', 'save'],
    ['Save As…', 'CmdOrCtrl+Shift+S', 'saveAs'],
    ['Import Media…', 'CmdOrCtrl+I', 'import'],
    ['Export Video…', 'CmdOrCtrl+E', 'export'],
    ['Export Audio…', 'CmdOrCtrl+Shift+E', 'exportAudio'],
    ['Package Project…', 'CmdOrCtrl+Shift+P', 'package'],
    ['New Animation', undefined, 'newAnimation'],
    ['Open Animation…', undefined, 'openAnimation'],
    ['Export Animation…', undefined, 'exportAnimation'],
    ['Candidate Details…', undefined, 'candidate'],
  ])('File ▸ %s (%s) sends "%s" to the page', (label, accelerator, action) => {
    const send = vi.fn<(a: MenuAction) => void>();
    const item = items(find(menuTemplate('darwin', send, false), 'File')).find(
      (i) => i.label === label,
    )!;
    expect(item.accelerator).toBe(accelerator);
    (item.click as () => void)();
    expect(send).toHaveBeenCalledWith(action);
  });

  it('Windows has Settings… (Ctrl+,) at the end of Edit; macOS has it in the app menu only', () => {
    const settingsIn = (platform: string) =>
      items(menuTemplate(platform, () => {}, false).find((m) => m.label === 'Edit')!).find(
        (i) => i.label === 'Settings…',
      );
    expect(settingsIn('win32')).toMatchObject({ accelerator: 'CmdOrCtrl+,' });
    expect(settingsIn('darwin')).toBeUndefined();
  });

  it('Redo is ⇧⌘Z on macOS and Ctrl+Y on Windows', () => {
    const redo = (p: string) =>
      items(
        find(
          menuTemplate(p, () => {}, false),
          'Edit',
        ),
      ).find((i) => i.label === 'Redo')!;
    expect(redo('darwin').accelerator).toBe('Shift+CmdOrCtrl+Z');
    expect(redo('win32').accelerator).toBe('Ctrl+Y');
  });

  it('Edit keeps cut / copy / paste (text boxes, and sound in Audio mode)', () => {
    const roles = items(
      find(
        menuTemplate('win32', () => {}, false),
        'Edit',
      ),
    ).map((i) => i.role);
    expect(roles).toEqual(expect.arrayContaining(['cut', 'copy', 'paste']));
  });

  it('Edit ▸ Select All (CmdOrCtrl+A) goes to the page: a text box, or all the sound (A5)', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const item = items(find(menuTemplate('darwin', send, false), 'Edit')).find(
      (i) => i.label === 'Select All',
    )!;
    expect(item.accelerator).toBe('CmdOrCtrl+A');
    (item.click as () => void)();
    expect(send).toHaveBeenCalledWith('selectAll');
  });

  it('Windows has Exit in the File menu; macOS quits from the app menu', () => {
    expect(
      items(
        find(
          menuTemplate('win32', () => {}, false),
          'File',
        ),
      ).at(-1),
    ).toMatchObject({ role: 'quit', label: 'Exit' });
    expect(
      items(
        find(
          menuTemplate('darwin', () => {}, false),
          'File',
        ),
      ).some((i) => i.role === 'quit'),
    ).toBe(false);
  });

  it('developer tools appear only while developing', () => {
    const view = (dev: boolean) =>
      items(
        find(
          menuTemplate('win32', () => {}, dev),
          'View',
        ),
      ).map((i) => i.role);
    expect(view(true)).toContain('toggleDevTools');
    expect(view(false)).not.toContain('toggleDevTools');
  });

  it('Help: Welcome, Check for Updates (M17a), Licences and (on Windows) About go to the page; the guides open as web pages (M12); Report a Problem is made by the main process (it works when the page does not)', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const open = vi.fn<(guide: 'user-guide' | 'teacher-notes') => void>();
    const report = vi.fn<() => void>();
    const help = items(find(menuTemplate('win32', send, false, open, report), 'Help'));
    expect(help.map((i) => i.label)).toEqual([
      'Welcome to OneEditor',
      'User guide',
      'Teacher notes',
      'Check for Updates…',
      'Report a Problem…',
      'Licences',
      'About OneEditor',
    ]);
    for (const i of help) (i.click as () => void)();
    expect(send.mock.calls.map(([a]) => a)).toEqual(['welcome', 'updates', 'licences', 'about']);
    // On a Mac, About is in the app menu, as Mac apps have it.
    expect(
      items(find(menuTemplate('darwin', send, false), 'Help')).map((i) => i.label),
    ).not.toContain('About OneEditor');
    expect(open.mock.calls.map(([g]) => g)).toEqual(['user-guide', 'teacher-notes']);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('N15 the Learn menu, after View, opens each Learn page and the glossary', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const menus = menuTemplate('win32', send, false);
    expect(menus.map((m) => m.label ?? m.role)).toEqual([
      'File',
      'Edit',
      'Image',
      'Layer',
      'Select',
      'Filter',
      'View',
      'Learn',
      'windowMenu',
      'Help',
    ]);
    const learn = items(find(menus, 'Learn'));
    expect(learn.map((i) => i.label)).toEqual([
      'Inspector & Sampling',
      'Formats & Compression',
      'Animation Theory',
      'Task Checker',
      'Glossary',
    ]);
    for (const i of learn) (i.click as () => void)();
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      'learnInspect',
      'learnFormats',
      'learnAnimation',
      'learnTask',
      'glossary',
    ]);
  });

  it("N16 View shows or hides the editor's left panel, right panel and timeline, and resets the layout", () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const view = items(find(menuTemplate('win32', send, false), 'View'));
    const ours = view.filter((i) => i.click);
    expect(ours.map((i) => [i.label, i.accelerator])).toEqual([
      ['Show / Hide Left Panel', 'CmdOrCtrl+Alt+1'],
      ['Show / Hide Right Panel', 'CmdOrCtrl+Alt+2'],
      ['Show / Hide Timeline', 'CmdOrCtrl+Alt+3'],
      ['Reset Layout', undefined],
      ['Outline', 'Ctrl+Shift+Y'],
      ['Pixel Grid', undefined],
    ]);
    for (const i of ours) (i.click as () => void)();
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      'toggleLeft',
      'toggleRight',
      'toggleBottom',
      'resetLayout',
      'outline',
      'pixelGrid',
    ]);
  });

  it('GV7: View ▸ Outline is ⌘Y on a Mac, as in Illustrator (Ctrl+Y is Redo on Windows)', () => {
    const outline = items(
      find(
        menuTemplate('darwin', () => {}, false),
        'View',
      ),
    ).find((i) => i.label === 'Outline')!;
    expect(outline.accelerator).toBe('Cmd+Y');
  });

  it('GV8: File ▸ Place Template… sends "placeTemplate" to the page', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const item = items(find(menuTemplate('win32', send, false), 'File')).find(
      (i) => i.label === 'Place Template…',
    )!;
    (item.click as () => void)();
    expect(send).toHaveBeenCalledWith('placeTemplate');
  });

  it('GV6: File ▸ Import SVG… sends "importSvg" to the page', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const item = items(find(menuTemplate('darwin', send, false), 'File')).find(
      (i) => i.label === 'Import SVG…',
    )!;
    (item.click as () => void)();
    expect(send).toHaveBeenCalledWith('importSvg');
  });
});

describe('M21: the Image menu', () => {
  it('M21 GB6, G8: Image ▸ Image Size…, Canvas Size…, Crop to Content, Trim Plain Edges, Reduce Colours…', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const image = items(find(menuTemplate('win32', send, false), 'Image')).filter((i) => i.click);
    expect(image.map((i) => i.label)).toEqual([
      'Image Size…',
      'Canvas Size…',
      'Crop to Content',
      'Trim Plain Edges',
      'Reduce Colours…',
      'Crop to Selection',
    ]);
    for (const i of image) (i.click as () => void)();
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      'imageSize',
      'canvasSize',
      'cropToContent',
      'trimPlain',
      'reduceColours',
      'cropToSelection',
    ]);
  });

  it('M21 G2, GB1: the Layer menu: new pixel layer, a picture as a layer, layers via copy and cut, a mask from the selection, merging', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const layer = items(find(menuTemplate('win32', send, false), 'Layer')).filter((i) => i.click);
    expect(layer.map((i) => [i.label, i.accelerator])).toEqual([
      ['New Pixel Layer', 'CmdOrCtrl+Shift+N'],
      ['Add Picture as Layer…', undefined],
      ['Layer via Copy', undefined],
      ['Layer via Cut', undefined],
      ['Layer Mask from Selection', undefined],
      // Not Ctrl+E: that exports the video.
      ['Merge Down', undefined],
      ['Merge Visible', undefined],
      ['Flatten Image', undefined],
    ]);
    for (const i of layer) (i.click as () => void)();
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      'newPixelLayer',
      'addPictureAsLayer',
      'layerViaCopy',
      'layerViaCut',
      'maskFromSelection',
      'mergeDown',
      'mergeVisible',
      'flatten',
    ]);
  });

  it('M21 GB2, G13: the Select menu sends each selection command to the page', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const select = items(find(menuTemplate('darwin', send, false), 'Select')).filter(
      (i) => i.click,
    );
    for (const i of select) (i.click as () => void)();
    expect(send.mock.calls.map((c) => c[0])).toEqual([
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
    ]);
  });

  it('M21 GB1: File ▸ Open Picture as Image… sends "openPictureAsImage"', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const item = items(find(menuTemplate('win32', send, false), 'File')).find(
      (i) => i.label === 'Open Picture as Image…',
    )!;
    (item.click as () => void)();
    expect(send).toHaveBeenCalledWith('openPictureAsImage');
  });
});

describe('M22: Image ▸ Adjustments', () => {
  it('M22 GB3: a submenu of the adjustments, each sending its own action', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const image = (find(menuTemplate('win32', send, false), 'Image')!.submenu as Item[]).find(
      (i) => i.label === 'Adjustments',
    )!;
    const adjustments = items(image);
    expect(adjustments.map((i) => i.label)).toEqual([
      'Brightness / Contrast…',
      'Levels…',
      'Exposure…',
      'Shadows / Highlights…',
      'Hue / Saturation…',
      'Colour Balance…',
      'Temperature / Tint…',
      'Replace Colour…',
      'Black and White…',
      'Greyscale',
      'Invert',
    ]);
    for (const i of adjustments) (i.click as () => void)();
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      'adjustBrightnessContrast',
      'adjustLevels',
      'adjustExposure',
      'adjustShadowsHighlights',
      'adjustHueSaturation',
      'adjustColourBalance',
      'adjustTemperatureTint',
      'adjustReplaceColour',
      'adjustThreshold',
      'adjustGreyscale',
      'adjustInvert',
    ]);
  });
});

describe('M22: the Filter menu', () => {
  it('M22 GB5: Filter ▸ Blur ▸ Gaussian / Motion / Zoom, Twirl…, Sharpen…, Distort ▸ Bulge / Perspective / Warp', () => {
    const send = vi.fn<(a: MenuAction) => void>();
    const filter = find(menuTemplate('darwin', send, false), 'Filter')!.submenu as Item[];
    const sub = (label: string) => items(filter.find((i) => i.label === label));
    expect(items(find(menuTemplate('darwin', send, false), 'Filter')).map((i) => i.label)).toEqual([
      'Blur',
      'Twirl…',
      'Sharpen…',
      'Distort',
    ]);
    expect(sub('Blur').map((i) => i.label)).toEqual([
      'Gaussian Blur…',
      'Motion Blur…',
      'Zoom Blur…',
    ]);
    expect(sub('Distort').map((i) => i.label)).toEqual(['Bulge / Pinch…', 'Perspective…', 'Warp…']);
    const all = [...sub('Blur'), ...filter.filter((i) => i.click), ...sub('Distort')];
    for (const i of all) (i.click as () => void)();
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      'filterGaussianBlur',
      'filterMotionBlur',
      'filterZoomBlur',
      'filterTwirl',
      'filterSharpen',
      'filterBulge',
      'filterPerspective',
      'filterWarp',
    ]);
  });
});
