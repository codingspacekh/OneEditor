<script lang="ts">
  // The tool strip beside the stage (as Animate's and Hype's toolboxes): the drawing tools
  // (AN3, AN4, AN5) and the rulers / grid / snapping toggles (AN2). Vertical, so the header
  // never grows wider than the window.
  import type { App } from '../../app/app.ts';
  import { editorOf } from './editor.ts';
  import type { Tool } from '../../app/animation.ts';
  import { withWhy } from '../../core/effects/help.ts';
  import Icon, { type IconName } from '../Icon.svelte';
  import { animUi } from './animation-ui.svelte.ts';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);
  const view = $derived($store.history.present.view);

  const TOOLS: [Tool, string, IconName, string][] = [
    ['select', 'Select', 'select', 'Select, move, resize and turn objects (V)'],
    [
      'rect',
      'Rectangle',
      'rect',
      withWhy('Drag out a rectangle (R); Shift for a square', 'vectorShapes'),
    ],
    [
      'ellipse',
      'Ellipse',
      'ellipse',
      withWhy('Drag out an ellipse (E); Shift for a circle', 'vectorShapes'),
    ],
    ['star', 'Star', 'star', withWhy('Drag out a star (S)', 'vectorShapes')],
    ['polygon', 'Polygon', 'polygon', withWhy('Drag out a polygon (G)', 'vectorShapes')],
    ['line', 'Line', 'line', withWhy('Drag a straight line (L)', 'vectorShapes')],
    // GV1 (M19): an arc (ends and how it closes in Properties), a spiral, clicked straight lines.
    [
      'arc',
      'Arc',
      'arc',
      withWhy('Drag out an arc: half an ellipse (C); Shift for a circle’s', 'graphicShapes'),
    ],
    [
      'spiral',
      'Spiral',
      'spiral',
      withWhy('Drag out a spiral (O); its turns are in Properties', 'graphicShapes'),
    ],
    [
      'polyline',
      'Polyline',
      'polyline',
      withWhy(
        'Click points for straight lines (Y); double-click or Enter to finish, click the first point to close; Shift for 15° steps',
        'graphicShapes',
      ),
    ],
    [
      'pen',
      'Pen',
      'pen',
      withWhy(
        'Click points for a path (P); double-click or Enter to finish, click the first point to close',
        'vectorShapes',
      ),
    ],
    ['brush', 'Brush', 'brush', withWhy('Draw freehand (B)', 'vectorShapes')],
    ['text', 'Text', 'text', withWhy('Click to add text (T)', 'animText')],
    ['picture', 'Picture', 'picture', withWhy('Click to place a picture file (I)', 'animPicture')],
    [
      'button',
      'Button',
      'button',
      withWhy('Click to place a button: Pause, Continue, Restart or Go to frame (U)', 'animButton'),
    ],
  ];
  /** GB1 (M21): moving round the image (Graphics mode). */
  const VIEW_TOOLS: [Tool, string, IconName, string][] = [
    ['hand', 'Hand', 'hand', 'Hand: drag to move round the image (H); hold Space with any tool'],
    [
      'zoom',
      'Zoom',
      'zoomIn',
      'Zoom: click to zoom in there (Z), Alt-click to zoom out; Ctrl/Cmd + wheel zooms too',
    ],
  ];
  /** GB2 (M21): the selection tools (Graphics mode); their options show above the canvas. */
  const SELECT_TOOLS: [Tool, string, IconName, string][] = [
    [
      'select-rect',
      'Rectangle select',
      'marqueeRect',
      'Rectangle select: drag over the pixels (M); Shift while dragging for a square. Shift adds, Alt subtracts, both intersect',
    ],
    [
      'select-ellipse',
      'Ellipse select',
      'marqueeEllipse',
      'Ellipse select: drag over the pixels; Shift while dragging for a circle',
    ],
    ['lasso', 'Lasso', 'lasso', 'Lasso: drag round the part to select it freehand'],
    [
      'polygon-lasso',
      'Polygonal lasso',
      'polygonLasso',
      'Polygonal lasso: click the corners; double-click, Enter or click the first point to close',
    ],
    [
      'magnetic-lasso',
      'Magnetic lasso',
      'magneticLasso',
      'Magnetic lasso: drag along an edge and the line snaps to it',
    ],
    [
      'magic-wand',
      'Magic wand',
      'wand',
      'Magic wand: click a colour to select it (W): the tolerance and contiguous are above the canvas',
    ],
    [
      'colour-select',
      'Colour select',
      'colourSelect',
      'Colour select: click a colour to select every pixel like it, softly by the fuzziness',
    ],
  ];
  /** GB4, GB3 (M21): painting on a pixel layer (Graphics mode); their options are in Properties. */
  const PAINT_TOOLS: [Tool, string, IconName, string][] = [
    [
      'paintbrush',
      'Paintbrush',
      'paintbrush',
      withWhy(
        'Paintbrush: paint on a pixel layer; Shift-click for a straight line',
        'graphicPaint',
      ),
    ],
    [
      'pencil',
      'Pencil',
      'pencil',
      withWhy('Pencil: hard pixels, exactly (a 1 px pencil sets one pixel)', 'graphicPaint'),
    ],
    [
      'eraser',
      'Eraser',
      'eraser',
      withWhy('Eraser: rub pixels out to transparent (on a layer mask: hides)', 'graphicPaint'),
    ],
    [
      'airbrush',
      'Airbrush',
      'airbrush',
      withWhy('Airbrush: builds up colour softly, the longer it is held', 'graphicPaint'),
    ],
    [
      'bucket',
      'Paint bucket',
      'bucket',
      withWhy('Paint bucket: click an area to fill it with the colour', 'graphicFill'),
    ],
    [
      'gradient',
      'Gradient',
      'gradient',
      withWhy('Gradient: drag a line to fill the layer or the selection', 'graphicFill'),
    ],
  ];
  const snapping = $derived(
    view.snap.grid || view.snap.guides || view.snap.objects || view.snap.pixels,
  );
</script>

<div class="strip">
  <div
    class="tools"
    role="toolbar"
    aria-label={editor.still ? 'Drawing tools' : 'Animation tools'}
    aria-orientation="vertical"
  >
    <!-- M18: a still image has no buttons to click (AN18 is for animations). -->
    {#each TOOLS.filter(([tool]) => !editor.still || tool !== 'button') as [tool, label, icon, title] (tool)}
      <button
        class="tbtn"
        aria-label={label}
        aria-pressed={$store.tool === tool}
        {title}
        onclick={() => anim.setTool(tool)}><Icon name={icon} /></button
      >
    {/each}
    <!-- GB1 (M21): Graphics mode's Hand and Zoom. -->
    {#if editor.still}
      {#each VIEW_TOOLS as [tool, label, icon, title] (tool)}
        <button
          class="tbtn"
          aria-label={label}
          aria-pressed={$store.tool === tool}
          {title}
          onclick={() => anim.setTool(tool)}><Icon name={icon} /></button
        >
      {/each}
    {/if}
    <!-- GB2 (M21): Graphics mode's selection tools. -->
    {#if editor.still}
      {#each SELECT_TOOLS as [tool, label, icon, title] (tool)}
        <button
          class="tbtn"
          aria-label={label}
          aria-pressed={$store.tool === tool}
          {title}
          onclick={() => anim.setTool(tool)}><Icon name={icon} /></button
        >
      {/each}
    {/if}
    <!-- GB4, GB3 (M21): Graphics mode's painting tools. -->
    {#if editor.still}
      {#each PAINT_TOOLS as [tool, label, icon, title] (tool)}
        <button
          class="tbtn"
          aria-label={label}
          aria-pressed={$store.tool === tool}
          {title}
          onclick={() => anim.setTool(tool)}><Icon name={icon} /></button
        >
      {/each}
    {/if}
  </div>
  <div class="hsep"></div>
  <button
    class="tbtn"
    aria-label="Library"
    title={withWhy(
      'Library: ready-made cartoons, icons and backgrounds to add to the stage (K)',
      'animLibrary',
    )}
    onclick={() => (animUi.dialog = 'library')}><Icon name="sparkles" /></button
  >
  {#if !editor.still}
    <button
      class="tbtn"
      aria-label="Import frames"
      title={withWhy(
        'Import frames: a folder of pictures shown one after another (stop motion)',
        'animStopMotion',
      )}
      onclick={() => (animUi.dialog = 'frames')}><Icon name="import" /></button
    >
  {/if}
  <div class="hsep"></div>
  <div class="tools" role="group" aria-label="Stage helpers">
    <button
      class="tbtn"
      aria-label="Rulers"
      aria-pressed={view.rulers}
      title={withWhy('Show the rulers (drag a guide out of them)', 'rulersGrid')}
      onclick={() => anim.setView({ rulers: !view.rulers })}><Icon name="ruler" /></button
    >
    <button
      class="tbtn"
      aria-label="Grid"
      aria-pressed={view.grid.show}
      title={withWhy(`Show the grid (${view.grid.size} px)`, 'rulersGrid')}
      onclick={() => anim.setView({ grid: { ...view.grid, show: !view.grid.show } })}
      ><Icon name="grid" /></button
    >
    <button
      class="tbtn"
      aria-label="Snap"
      aria-pressed={snapping}
      title={withWhy('Snap to the grid, guides and objects (hold Alt to move freely)', 'snapping')}
      onclick={() => {
        const on = !(view.snap.grid || view.snap.guides || view.snap.objects);
        anim.setView({ snap: { ...view.snap, grid: on, guides: on, objects: on } });
      }}><Icon name="snap" /></button
    >
    <!-- GV7 (M19): View ▸ Outline. -->
    <button
      class="tbtn"
      aria-label="Outline view"
      aria-pressed={view.wireframe === true}
      title={withWhy(
        'Outline view: every shape as a thin line, no fills (⌘Y on a Mac, Ctrl+Shift+Y on Windows)',
        'outlineView',
      )}
      onclick={() => anim.toggleOutline()}><Icon name="wireframe" /></button
    >
    <!-- GB1 (M21): View ▸ Pixel grid (Graphics mode), drawn from 800 %. -->
    {#if editor.still}
      <button
        class="tbtn"
        aria-label="Pixel grid"
        aria-pressed={animUi.pixelGrid}
        title="Pixel grid: a line round every pixel when zoomed in to 800 % or more"
        onclick={() => (animUi.pixelGrid = !animUi.pixelGrid)}><Icon name="grid" /></button
      >
    {/if}
  </div>
</div>

<style>
  .strip {
    width: 44px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    background: var(--bg-1);
    border-right: 1px solid var(--line);
    overflow: auto;
  }
  .tools {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tbtn {
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    color: var(--tx-2);
  }
  .tbtn:hover:not(:disabled) {
    background: var(--bg-3);
    color: var(--tx-1);
  }
  .tbtn[aria-pressed='true'] {
    background: var(--bg-3);
    color: var(--tx-1);
    border-color: var(--line-strong);
  }
  .hsep {
    width: 24px;
    height: 1px;
    background: var(--line);
  }
  /* Short windows: smaller buttons so every tool stays reachable without scrolling. */
  @media (max-height: 700px) {
    .tbtn {
      width: 30px;
      height: 30px;
    }
  }
</style>
