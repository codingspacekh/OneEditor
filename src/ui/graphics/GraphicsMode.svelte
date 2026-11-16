<script lang="ts">
  // Graphics mode (M18, syllabus 19): Animation mode's Layers panel, tool strip, stage (here the
  // canvas) and Properties panel, on Graphics mode's own app (EditorScope), with no timeline. The
  // keyboard is Animation mode's without the timeline's keys: V R E S G L P B T I choose tools,
  // Delete, arrows nudge (Shift: 10 px), Ctrl/Cmd + D duplicates, G groups, Shift + G
  // ungroups, 0 fits, + / − zoom, K the library (M21: [ ] the brush's size, X swaps the colours,
  // D black and white, with a painting tool); cut, copy and paste work on the selection and
  // between Graphics and Animation modes (one clipboard). M19: C O Y the arc, spiral and
  // polyline; Ctrl/Cmd + Shift + V pastes in place. M21 (GB2): M the marquee, W the magic wand;
  // on a pixel layer with pixels selected, Delete clears them and Ctrl/Cmd + D deselects;
  // Ctrl/Cmd + J copies the selection to a new layer, + Shift + J cuts it, + Shift + I inverts it;
  // the selection's options show above the canvas. G3 (M21): on a pixel layer with no objects
  // selected, the arrows move the layer or the selected pixels (Shift: 10 px).
  import type { App } from '../../app/app.ts';
  import type { Tool } from '../../app/animation.ts';
  import { shortcutAllowed } from '../keys.ts';
  import { readClipboardPicture } from '../../adapters/canvas/clipboard-picture.ts';
  import { BRUSH_TOOLS, isBrushTool } from '../../core/graphics/pixels/presets.ts';
  import PanelSlot from '../PanelSlot.svelte';
  import { animUi } from '../animation/animation-ui.svelte.ts';
  // GB1 (M21): Graphics mode zooms to 3200 %.
  import { GRAPHICS_ZOOM_STEPS as ZOOM_STEPS } from '../animation/stage-viewport.ts';
  import LayersPanel from '../animation/LayersPanel.svelte';
  import LibraryDialog from '../animation/LibraryDialog.svelte';
  import PictureCropDialog from '../animation/PictureCropDialog.svelte';
  import PropertiesPanel from '../animation/PropertiesPanel.svelte';
  import SeeThroughDialog from '../animation/SeeThroughDialog.svelte';
  import Stage from '../animation/Stage.svelte';
  import ToolStrip from '../animation/ToolStrip.svelte';
  import TraceDialog from '../animation/TraceDialog.svelte';
  import EditorScope from './EditorScope.svelte';
  import GraphicsExportDialog from './GraphicsExportDialog.svelte';
  import ImageSettings from './ImageSettings.svelte';
  import SelectionOptions from './SelectionOptions.svelte';
  import CanvasSizeDialog from './CanvasSizeDialog.svelte';
  import ImageSizeDialog from './ImageSizeDialog.svelte';
  import ReduceColoursDialog from './ReduceColoursDialog.svelte';

  /** GB4, GB3 (M21): the tools that paint with the foreground and background colours. */
  const PAINT_KEYS_TOOLS: Tool[] = [...BRUSH_TOOLS, 'bucket', 'gradient'];

  let { app }: { app: App } = $props();
  const g = $derived(app.graphics);
  const store = $derived(app.graphics.store);

  const TOOL_KEYS: Record<string, Tool> = {
    v: 'select',
    r: 'rect',
    e: 'ellipse',
    s: 'star',
    g: 'polygon',
    l: 'line',
    // GV1 (M19): the arc, spiral and polyline.
    c: 'arc',
    o: 'spiral',
    y: 'polyline',
    p: 'pen',
    b: 'brush',
    t: 'text',
    i: 'picture',
    // GB1 (M21): the hand and the zoom.
    h: 'hand',
    z: 'zoom',
    // GB2 (M21): the rectangle select (marquee) and the magic wand.
    m: 'select-rect',
    w: 'magic-wand',
  };

  function busy(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return (
      animUi.dialog !== null ||
      (el instanceof HTMLElement &&
        (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)))
    );
  }

  function onkeydown(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !busy(e.target)) {
      const key = e.key.toLowerCase();
      // GB2 (M21): on a pixel layer with pixels selected, Ctrl/Cmd + D deselects (as Photoshop).
      if (key === 'd' && g.onPixelLayer() && g.hasPixelSelection()) {
        e.preventDefault();
        g.deselectPixels();
      } else if (key === 'd') {
        e.preventDefault();
        g.duplicate();
      } else if (key === 'j') {
        // GB2: Layer via Copy, with Shift via Cut.
        e.preventDefault();
        if (e.shiftKey) g.cutSelectionToLayer();
        else g.copySelectionToLayer();
      } else if (key === 'i' && e.shiftKey) {
        e.preventDefault();
        g.invertPixelSelection();
      } else if (key === 'v' && e.shiftKey) {
        // GV2 (M19): Paste in place.
        e.preventDefault();
        g.pasteInPlace();
      } else if (key === 'g') {
        e.preventDefault();
        if (e.shiftKey) g.ungroup();
        else g.group();
      } else if (key === '0') {
        e.preventDefault();
        g.setZoom('fit');
      } else if (key === '=' || key === '+') {
        e.preventDefault();
        const z = $store.zoom === 'fit' ? 1 : $store.zoom;
        g.setZoom(ZOOM_STEPS.find((s) => s > z + 1e-9) ?? ZOOM_STEPS.at(-1)!);
      } else if (key === '-') {
        e.preventDefault();
        const z = $store.zoom === 'fit' ? 1 : $store.zoom;
        g.setZoom([...ZOOM_STEPS].reverse().find((s) => s < z - 1e-9) ?? ZOOM_STEPS[0]!);
      }
      return;
    }
    if (!shortcutAllowed(e) || animUi.dialog !== null) return;
    if (e.key.toLowerCase() === 'k' && !e.shiftKey) {
      e.preventDefault();
      animUi.dialog = 'library';
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      // GB2 (M21): the selected pixels on a pixel layer, else the selected objects.
      if (!g.deleteSelectedPixels()) g.deleteSelection();
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      // G3 (M21): on a pixel layer with no objects selected, the layer (or the selected pixels).
      if (g.onPixelLayer() && $store.selection.length === 0) g.movePixelLayer(dx, dy);
      else g.nudge(dx, dy);
    } else if (e.key === 'Escape') {
      if ($store.tool !== 'select') g.setTool('select');
      else g.select([]);
    } else if (paintKey(e.key)) {
      e.preventDefault();
    } else {
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool && !e.shiftKey) g.setTool(tool);
    }
  }

  /**
   * GB4 (M21): with a painting tool, [ and ] make the brush smaller and bigger, X swaps the colour
   * and the background colour, D makes them black and white (as Photoshop). True when it was one.
   */
  function paintKey(key: string): boolean {
    const tool = $store.tool;
    if (key === 'x' || key === 'd') {
      if (!PAINT_KEYS_TOOLS.includes(tool)) return false;
      if (key === 'x') g.swapPaintColours();
      else g.resetPaintColours();
      return true;
    }
    if ((key !== '[' && key !== ']') || !isBrushTool(tool)) return false;
    const size = g.paintOptions().brushes[tool].size;
    const step = size < 10 ? 1 : size < 50 ? 5 : size < 200 ? 10 : 50;
    g.setBrush({ size: Math.min(2500, Math.max(1, key === ']' ? size + step : size - step)) });
    return true;
  }

  function clipboard(action: 'cut' | 'copy' | 'paste') {
    return (e: ClipboardEvent) => {
      if (busy(e.target)) return;
      e.preventDefault();
      // GB1 (M21): a picture copied from a browser or another program is pasted as a pixel layer.
      const picture =
        action === 'paste'
          ? [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
          : undefined;
      const file = picture?.getAsFile();
      if (picture && file) {
        const type = picture.type;
        void readClipboardPicture({
          read: async () => [{ types: [type], getType: async () => file }],
        }).then((pixels) => (pixels ? g.pastePixels(pixels) : g.paste()));
        return;
      }
      g[action]();
    };
  }
</script>

<svelte:window {onkeydown} />
<svelte:document oncut={clipboard('cut')} oncopy={clipboard('copy')} onpaste={clipboard('paste')} />

<EditorScope {app}>
  <div class="graphics-mode">
    <PanelSlot layout={app.layout} id="graphics.layers"><LayersPanel {app} /></PanelSlot>
    <ToolStrip {app} />
    <div class="centre">
      <SelectionOptions {app} />
      <Stage {app} />
    </div>
    <PanelSlot layout={app.layout} id="graphics.properties"><PropertiesPanel {app} /></PanelSlot>
  </div>
  {#if animUi.dialog === 'newImage' || animUi.dialog === 'image'}
    <ImageSettings
      {app}
      mode={animUi.dialog === 'newImage' ? 'new' : 'edit'}
      onclose={() => (animUi.dialog = null)}
    />
  {:else if animUi.dialog === 'imageSize'}
    <!-- GB6 (M21): Image size, Canvas size and Reduce colours. -->
    <ImageSizeDialog {app} onclose={() => (animUi.dialog = null)} />
  {:else if animUi.dialog === 'canvasSize'}
    <CanvasSizeDialog {app} onclose={() => (animUi.dialog = null)} />
  {:else if animUi.dialog === 'reduceColours'}
    <ReduceColoursDialog {app} onclose={() => (animUi.dialog = null)} />
  {:else if animUi.dialog === 'export'}
    <GraphicsExportDialog {app} onclose={() => (animUi.dialog = null)} />
  {:else if animUi.dialog === 'trace'}
    <TraceDialog {app} onclose={() => (animUi.dialog = null)} />
  {:else if animUi.dialog === 'library'}
    <LibraryDialog {app} onclose={() => (animUi.dialog = null)} />
  {:else if animUi.dialog === 'cropPicture'}
    <PictureCropDialog {app} onclose={() => (animUi.dialog = null)} />
  {:else if animUi.dialog === 'seeThrough'}
    <SeeThroughDialog {app} onclose={() => (animUi.dialog = null)} />
  {/if}
</EditorScope>

<style>
  .centre {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .graphics-mode {
    flex: 1;
    display: flex;
    min-height: 0;
    min-width: 0;
  }
</style>
