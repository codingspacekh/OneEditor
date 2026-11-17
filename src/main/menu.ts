// Native menus (X3): platform conventions, CmdOrCtrl shortcuts; items send actions to the page.
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '../preload/api.ts';

export type Guide = 'user-guide' | 'teacher-notes';

export function menuTemplate(
  platform: string,
  send: (action: MenuAction) => void,
  developer: boolean,
  /** Opens a guide shipped with the app (a web page) in the browser. */
  openGuide: (guide: Guide) => void = () => {},
  /** Help ▸ Report a Problem…: made by the main process, so it works when the page does not. */
  reportProblem: () => void = () => {},
): MenuItemConstructorOptions[] {
  const mac = platform === 'darwin';
  const item = (
    label: string,
    accelerator: string,
    action: MenuAction,
  ): MenuItemConstructorOptions => ({
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => send(action),
  });
  return [
    // macOS: the app menu as Mac apps have it, with OneEditor's own About box (the page's).
    ...(mac
      ? [
          {
            label: 'OneEditor',
            submenu: [
              item('About OneEditor', '', 'about'),
              item('Settings…', 'CmdOrCtrl+,', 'settings'),
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        item('New', 'CmdOrCtrl+N', 'new'),
        item('Open…', 'CmdOrCtrl+O', 'open'),
        item('Save', 'CmdOrCtrl+S', 'save'),
        item('Save As…', 'CmdOrCtrl+Shift+S', 'saveAs'),
        { type: 'separator' },
        item('New Animation', '', 'newAnimation'),
        item('Open Animation…', '', 'openAnimation'),
        item('New Image…', '', 'newImage'),
        item('Open Image…', '', 'openImage'),
        // GB1 (M21): a photo opened as a new image of its size, on a pixel layer.
        item('Open Picture as Image…', '', 'openPictureAsImage'),
        // GV8 (M19): a picture to draw over, faded and locked, never exported.
        item('Place Template…', '', 'placeTemplate'),
        // GV6 (M19): a given SVG's shapes into the drawing, editable.
        item('Import SVG…', '', 'importSvg'),
        { type: 'separator' },
        item('Import Media…', 'CmdOrCtrl+I', 'import'),
        item('Export Video…', 'CmdOrCtrl+E', 'export'),
        item('Export Audio…', 'CmdOrCtrl+Shift+E', 'exportAudio'),
        item('Export Animation…', '', 'exportAnimation'),
        item('Export Image…', '', 'exportImage'),
        item('Package Project…', 'CmdOrCtrl+Shift+P', 'package'),
        { type: 'separator' },
        item('Candidate Details…', '', 'candidate'),
        ...(mac ? [] : [{ type: 'separator' } as const, { role: 'quit', label: 'Exit' } as const]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'CmdOrCtrl+Z', 'undo'),
        item('Redo', mac ? 'Shift+CmdOrCtrl+Z' : 'Ctrl+Y', 'redo'),
        { type: 'separator' },
        // Cut, copy and paste work in text boxes and, in Audio mode, on the selected sound
        // (the page listens for the clipboard events). Select All is decided by the page too.
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        item('Select All', 'CmdOrCtrl+A', 'selectAll'),
        // Settings…: on a Mac in the app menu, as Mac apps have it.
        ...(mac
          ? []
          : [{ type: 'separator' } as const, item('Settings…', 'CmdOrCtrl+,', 'settings')]),
      ],
    },
    {
      // GB6, G8 (M21): Graphics mode's image as a whole (from another mode: Graphics mode).
      label: 'Image',
      submenu: [
        item('Image Size…', '', 'imageSize'),
        item('Canvas Size…', '', 'canvasSize'),
        { type: 'separator' },
        item('Crop to Content', '', 'cropToContent'),
        item('Trim Plain Edges', '', 'trimPlain'),
        { type: 'separator' },
        item('Reduce Colours…', '', 'reduceColours'),
        { type: 'separator' },
        // GB3 (M22): on the current pixel layer (or its mask), inside the selection, previewed.
        {
          label: 'Adjustments',
          submenu: [
            item('Brightness / Contrast…', '', 'adjustBrightnessContrast'),
            item('Levels…', '', 'adjustLevels'),
            item('Exposure…', '', 'adjustExposure'),
            item('Shadows / Highlights…', '', 'adjustShadowsHighlights'),
            { type: 'separator' },
            item('Hue / Saturation…', '', 'adjustHueSaturation'),
            item('Colour Balance…', '', 'adjustColourBalance'),
            item('Temperature / Tint…', '', 'adjustTemperatureTint'),
            item('Replace Colour…', '', 'adjustReplaceColour'),
            { type: 'separator' },
            item('Black and White…', '', 'adjustThreshold'),
            item('Greyscale', '', 'adjustGreyscale'),
            item('Invert', '', 'adjustInvert'),
          ],
        },
        { type: 'separator' },
        // GB2, G8 (M21): the image cut down to the selected pixels.
        item('Crop to Selection', '', 'cropToSelection'),
      ],
    },
    {
      // G2, GB1, GB2 (M21): Graphics mode's pixel layers.
      label: 'Layer',
      submenu: [
        item('New Pixel Layer', 'CmdOrCtrl+Shift+N', 'newPixelLayer'),
        item('Add Picture as Layer…', '', 'addPictureAsLayer'),
        { type: 'separator' },
        item('Layer via Copy', '', 'layerViaCopy'),
        item('Layer via Cut', '', 'layerViaCut'),
        item('Layer Mask from Selection', '', 'maskFromSelection'),
        { type: 'separator' },
        item('Merge Down', '', 'mergeDown'),
        item('Merge Visible', '', 'mergeVisible'),
        item('Flatten Image', '', 'flatten'),
      ],
    },
    {
      // GB2, G13 (M21): Graphics mode's pixel selection; the amounts are the option bar's.
      label: 'Select',
      submenu: [
        item('All Pixels', '', 'selectAllPixels'),
        item('Deselect', '', 'deselectPixels'),
        item('Inverse', '', 'invertSelection'),
        { type: 'separator' },
        item('Layer Pixels', '', 'selectLayerPixels'),
        item('From Shape or Text', '', 'selectFromShape'),
        { type: 'separator' },
        item('Feather', '', 'featherSelection'),
        item('Grow', '', 'growSelection'),
        item('Shrink', '', 'shrinkSelection'),
        item('Smooth', '', 'smoothSelection'),
        { type: 'separator' },
        item('Fade Selected Pixels', '', 'fadeSelection'),
      ],
    },
    {
      // GB5 (M22): Graphics mode's filters, on the current pixel layer (or its mask), inside the
      // selection, previewed live (from another mode: Graphics mode).
      label: 'Filter',
      submenu: [
        {
          label: 'Blur',
          submenu: [
            item('Gaussian Blur…', '', 'filterGaussianBlur'),
            item('Motion Blur…', '', 'filterMotionBlur'),
            item('Zoom Blur…', '', 'filterZoomBlur'),
          ],
        },
        item('Twirl…', '', 'filterTwirl'),
        item('Sharpen…', '', 'filterSharpen'),
        { type: 'separator' },
        {
          label: 'Distort',
          submenu: [
            item('Bulge / Pinch…', '', 'filterBulge'),
            item('Perspective…', '', 'filterPerspective'),
            item('Warp…', '', 'filterWarp'),
          ],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        // N16: the panels of the editor that is showing.
        item('Show / Hide Left Panel', 'CmdOrCtrl+Alt+1', 'toggleLeft'),
        item('Show / Hide Right Panel', 'CmdOrCtrl+Alt+2', 'toggleRight'),
        item('Show / Hide Timeline', 'CmdOrCtrl+Alt+3', 'toggleBottom'),
        item('Reset Layout', '', 'resetLayout'),
        // GV7 (M19): Animation and Graphics mode's outline view; ⌘Y as Illustrator (Ctrl+Y is
        // Redo on Windows).
        item('Outline', mac ? 'Cmd+Y' : 'Ctrl+Shift+Y', 'outline'),
        // GB1 (M21): Graphics mode's lines between the pixels from 800 %.
        item('Pixel Grid', '', 'pixelGrid'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(developer ? [{ role: 'toggleDevTools' } as const] : []),
      ],
    },
    {
      // N15: Learn's pages fill the window in place of the editor, with Back.
      label: 'Learn',
      submenu: [
        item('Inspector & Sampling', '', 'learnInspect'),
        item('Formats & Compression', '', 'learnFormats'),
        item('Animation Theory', '', 'learnAnimation'),
        item('Graphics Theory', '', 'learnGraphics'),
        item('Task Checker', '', 'learnTask'),
        { type: 'separator' },
        item('Glossary', '', 'glossary'),
      ],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        item('Welcome to OneEditor', '', 'welcome'),
        { label: 'User guide', click: () => openGuide('user-guide') },
        { label: 'Teacher notes', click: () => openGuide('teacher-notes') },
        { type: 'separator' },
        item('Check for Updates…', '', 'updates'),
        { label: 'Report a Problem…', click: () => reportProblem() },
        item('Licences', '', 'licences'),
        ...(mac ? [] : [{ type: 'separator' } as const, item('About OneEditor', '', 'about')]),
      ],
    },
  ];
}
