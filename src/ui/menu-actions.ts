// What each native menu item does (X3). New, Open, Save, Export, Undo, Redo, Import and Select
// All act on the mode that is showing: the video project in Video mode, the sound in Audio
// mode, the animation in Animation mode. The Learn menu shows a Learn page (N15).
import type { App } from '../app/app.ts';
import type { MenuAction } from '../preload/api.ts';
import { animUi } from './animation/animation-ui.svelte.ts';
import { openLearn, ui } from './ui-state.svelte.ts';
import { selUi } from './graphics/selection-ui.svelte.ts';
import { adjustUi } from './graphics/adjust-ui.svelte.ts';
import { filterUi } from './graphics/filter-ui.svelte.ts';
import type { FilterKind } from '../core/graphics/pixels/filter-specs.ts';
import type { AdjustmentKind } from '../core/graphics/pixels/adjust.ts';

const inTextBox = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
};

export function menuActions(app: App): Record<MenuAction, () => unknown> {
  const audio = () => ui.mode === 'Audio';
  const anim = () => ui.mode === 'Animation';
  /** M18: Graphics mode is Animation mode's app on an image: the same actions on its own file. */
  const graphics = () => ui.mode === 'Graphics';
  const a = app.animation;
  const g = app.graphics;
  /** The Animation-mode app the menus act on: Graphics mode's when it is showing. */
  const drawing = () => (graphics() ? g : a);
  const inDrawing = () => anim() || graphics();
  /** M21: a Graphics-only action: Graphics mode is shown first. */
  const inGraphics = (act: () => unknown) => {
    ui.mode = 'Graphics';
    return act();
  };
  /** GB3 (M22): an adjustment's dialog, in Graphics mode. */
  const adjustment = (kind: AdjustmentKind) => () => {
    ui.mode = 'Graphics';
    adjustUi.kind = kind;
    animUi.dialog = 'adjust';
  };
  /** GB5 (M22): a filter's dialog, in Graphics mode. */
  const filter = (kind: FilterKind) => () => {
    ui.mode = 'Graphics';
    filterUi.kind = kind;
    animUi.dialog = 'filter';
  };
  /** N16: the panel on that edge of the editor that is showing (none in Learn). */
  const toggleEdge = (edge: 'left' | 'right' | 'bottom') =>
    ui.mode === 'Learn' ? Promise.resolve() : app.layout.toggleEdge(ui.mode, edge);
  return {
    new: () =>
      graphics() ? void (animUi.dialog = 'newImage') : anim() ? a.newAnimation() : app.newProject(),
    open: () => (inDrawing() ? drawing().open() : app.open()),
    save: () => (inDrawing() ? drawing().save() : app.save()),
    saveAs: () => (inDrawing() ? drawing().saveAs() : app.saveAs()),
    import: () =>
      inDrawing()
        ? drawing().addPicture({ x: 20, y: 20 })
        : audio()
          ? app.audio.importAudio()
          : app.importMedia(),
    export: () => (inDrawing() ? void (animUi.dialog = 'export') : app.exportVideo()),
    newImage: () => {
      ui.mode = 'Graphics';
      animUi.dialog = 'newImage';
    },
    openImage: () => {
      ui.mode = 'Graphics';
      return g.open();
    },
    exportImage: () => {
      ui.mode = 'Graphics';
      animUi.dialog = 'export';
    },
    /** GV8 (M19): a template in the drawing mode showing; from Video or Audio, in Graphics. */
    placeTemplate: () => {
      if (!inDrawing()) ui.mode = 'Graphics';
      return drawing().placeTemplate();
    },
    /** GV6 (M19): an SVG's shapes into the drawing showing; from Video or Audio, into Graphics. */
    importSvg: () => {
      if (!inDrawing()) ui.mode = 'Graphics';
      return drawing().importSvg();
    },
    /** GB6, G8 (M21): the Image menu acts on Graphics mode's image (shown first). */
    imageSize: () => {
      ui.mode = 'Graphics';
      animUi.dialog = 'imageSize';
    },
    canvasSize: () => {
      ui.mode = 'Graphics';
      animUi.dialog = 'canvasSize';
    },
    cropToContent: () => {
      ui.mode = 'Graphics';
      return g.trimCanvas(false);
    },
    trimPlain: () => {
      ui.mode = 'Graphics';
      return g.trimCanvas(true);
    },
    reduceColours: () => {
      ui.mode = 'Graphics';
      animUi.dialog = 'reduceColours';
    },
    // GB3 (M22): Image ▸ Adjustments; Greyscale and Invert have nothing to set: done at once.
    adjustBrightnessContrast: adjustment('brightnessContrast'),
    adjustLevels: adjustment('levels'),
    adjustExposure: adjustment('exposure'),
    adjustShadowsHighlights: adjustment('shadowsHighlights'),
    adjustHueSaturation: adjustment('hueSaturation'),
    adjustColourBalance: adjustment('colourBalance'),
    adjustTemperatureTint: adjustment('temperatureTint'),
    adjustReplaceColour: adjustment('replaceColour'),
    adjustThreshold: adjustment('threshold'),
    adjustGreyscale: () => inGraphics(() => g.adjust('greyscale', {})),
    adjustInvert: () => inGraphics(() => g.adjust('invert', {})),
    /** GB1 (M21): a photo as a new image (Graphics mode shown first). */
    openPictureAsImage: () => {
      ui.mode = 'Graphics';
      return g.openPictureAsImage();
    },
    cropToSelection: () => inGraphics(() => g.cropToPixelSelection()),
    // G2, GB1 (M21): the Layer menu, on Graphics mode's image.
    newPixelLayer: () => inGraphics(() => g.addPixelLayer()),
    addPictureAsLayer: () => inGraphics(() => g.addPictureAsLayer()),
    layerViaCopy: () => inGraphics(() => g.copySelectionToLayer()),
    layerViaCut: () => inGraphics(() => g.cutSelectionToLayer()),
    maskFromSelection: () => inGraphics(() => g.maskFromPixelSelection()),
    mergeDown: () => inGraphics(() => g.mergeLayers('down')),
    mergeVisible: () => inGraphics(() => g.mergeLayers('visible')),
    flatten: () => inGraphics(() => g.mergeLayers('flatten')),
    // GB2, G13 (M21): the Select menu; the amounts are the option bar's.
    selectAllPixels: () => inGraphics(() => g.selectAllPixels()),
    deselectPixels: () => inGraphics(() => g.deselectPixels()),
    invertSelection: () => inGraphics(() => g.invertPixelSelection()),
    selectLayerPixels: () => inGraphics(() => g.selectLayerPixels()),
    selectFromShape: () => inGraphics(() => g.selectFromObjects({ feather: selUi.feather })),
    featherSelection: () => inGraphics(() => g.featherPixelSelection(selUi.amount)),
    growSelection: () => inGraphics(() => g.growPixelSelection(selUi.amount)),
    shrinkSelection: () => inGraphics(() => g.growPixelSelection(-selUi.amount)),
    smoothSelection: () => inGraphics(() => g.smoothPixelSelection(selUi.amount)),
    fadeSelection: () => inGraphics(() => g.fadePixelSelection(selUi.fade)),
    // GB5 (M22): the Filter menu.
    filterGaussianBlur: filter('gaussian'),
    filterMotionBlur: filter('motion'),
    filterZoomBlur: filter('zoom'),
    filterTwirl: filter('twirl'),
    filterSharpen: filter('sharpen'),
    filterBulge: filter('bulge'),
    filterPerspective: filter('perspective'),
    filterWarp: filter('warp'),
    /** GB1 (M21): View ▸ Pixel Grid (Graphics mode, from 800 %). */
    pixelGrid: () => {
      animUi.pixelGrid = !animUi.pixelGrid;
    },
    /** GV7 (M19): View ▸ Outline in Animation and Graphics mode. */
    outline: () => (inDrawing() ? drawing().toggleOutline() : undefined),
    newAnimation: () => {
      ui.mode = 'Animation';
      return a.newAnimation();
    },
    openAnimation: () => {
      ui.mode = 'Animation';
      return a.open();
    },
    exportAnimation: () => {
      ui.mode = 'Animation';
      animUi.dialog = 'export';
    },
    exportAudio: () => {
      ui.mode = 'Audio';
      ui.audioExport = true;
    },
    package: () => (inDrawing() ? drawing().packageAnimation() : app.packageProject()),
    undo: () => (inDrawing() ? drawing().undo() : audio() ? app.audio.undo() : app.undo()),
    redo: () => (inDrawing() ? drawing().redo() : audio() ? app.audio.redo() : app.redo()),
    learnInspect: () => openLearn('inspect'),
    learnFormats: () => openLearn('formats'),
    learnAnimation: () => openLearn('animation'),
    learnGraphics: () => openLearn('graphics'),
    learnTask: () => openLearn('task'),
    glossary: () => {
      ui.glossary = true;
    },
    toggleLeft: () => toggleEdge('left'),
    toggleRight: () => toggleEdge('right'),
    toggleBottom: () => toggleEdge('bottom'),
    resetLayout: () => app.layout.reset(),
    welcome: app.showWelcome,
    licences: app.showLicences,
    about: app.showAbout,
    updates: () => app.updates.openDialog(),
    candidate: () => app.candidate.openDialog(),
    settings: () => {
      ui.settings = true;
    },
    selectAll: () => {
      const box = inTextBox();
      if (box) box.select();
      else if (audio()) app.audio.selectAll();
      // GB2 (M21): on a pixel layer, Select All selects its pixels.
      else if (graphics() && g.onPixelLayer()) g.selectAllPixels();
      else if (inDrawing()) drawing().selectAll();
    },
  };
}
