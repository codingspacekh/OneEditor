<script lang="ts">
  // M21 step 3 (GB2, G8, G13): the selection's option bar above the canvas (as Photoshop's
  // options bar), shown while a selection tool is chosen or something is selected: how a new
  // selection joins the one there is (new, add, subtract, intersect: Shift, Alt, both), its
  // feather, the wand's tolerance and contiguous, colour select's fuzziness; Select all / none /
  // invert / layer pixels / from shape; feather, grow, shrink and smooth by some px; and what to
  // do with the selected pixels: copy or cut to a new layer, delete, crop to it, fade, a layer
  // mask.
  import type { App } from '../../app/app.ts';
  import { SELECT_MODES, type SelectMode } from '../../core/graphics/pixels/selection.ts';
  import { cancelPolygonLasso, SELECTION_TOOL_NAMES } from './selection-tools.ts';
  import { selUi } from './selection-ui.svelte.ts';

  let { app }: { app: App } = $props();
  const g = $derived(app.graphics);
  const store = $derived(app.graphics.store);
  const tool = $derived($store.tool);
  const selecting = $derived((SELECTION_TOOL_NAMES as readonly string[]).includes(tool));
  // A polygonal lasso part drawn stops when another tool is chosen.
  $effect(() => {
    if (tool !== 'polygon-lasso') cancelPolygonLasso();
  });
  const selected = $derived.by(() => {
    void $store.pixelSelection;
    void $store.history.present.stage;
    return g.hasPixelSelection();
  });
  const onPixels = $derived.by(() => {
    void $store.layerId;
    void $store.history.present.layers;
    return g.onPixelLayer();
  });

  const MODE_LABELS: Record<SelectMode, [string, string]> = {
    new: ['New', 'A new selection in place of the one there is'],
    add: ['Add', 'Add to the selection (hold Shift)'],
    subtract: ['Subtract', 'Take away from the selection (hold Alt / Option)'],
    intersect: ['Intersect', 'Keep only where both are selected (hold Shift + Alt)'],
  };

  /** A number field's value kept between its limits (an empty field: the lowest). */
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
</script>

{#if selecting || selected}
  <div class="bar" role="toolbar" aria-label="Selection options">
    {#if selecting}
      <div class="group" role="group" aria-label="Selection mode">
        {#each SELECT_MODES as mode (mode)}
          <button
            class="seg"
            aria-pressed={selUi.mode === mode}
            title={MODE_LABELS[mode][1]}
            onclick={() => (selUi.mode = mode)}>{MODE_LABELS[mode][0]}</button
          >
        {/each}
      </div>
      <label title="Each new selection’s edge fades out over this many px">
        Feather
        <input
          type="number"
          min="0"
          max="250"
          value={selUi.feather}
          onchange={(e) => (selUi.feather = clamp(e.currentTarget.valueAsNumber, 0, 250))}
        /> px
      </label>
      {#if tool === 'magic-wand'}
        <label title="How far each colour channel may be from the clicked pixel’s (0–255)">
          Tolerance
          <input
            type="number"
            min="0"
            max="255"
            value={selUi.tolerance}
            onchange={(e) => (selUi.tolerance = clamp(e.currentTarget.valueAsNumber, 0, 255))}
          />
        </label>
        <label
          title="Only the pixels joined to the one clicked; off: every like pixel in the image"
        >
          <input type="checkbox" bind:checked={selUi.contiguous} /> Contiguous
        </label>
      {:else if tool === 'colour-select'}
        <label title="How far a colour may be from the one clicked; the selection fades out to it">
          Fuzziness
          <input
            type="number"
            min="0"
            max="255"
            value={selUi.fuzziness}
            onchange={(e) => (selUi.fuzziness = clamp(e.currentTarget.valueAsNumber, 0, 255))}
          />
        </label>
      {/if}
      {#if tool === 'magic-wand' || tool === 'colour-select'}
        <label title="Look at every visible pixel layer as drawn, not only the current layer">
          <input type="checkbox" bind:checked={selUi.allLayers} /> All layers
        </label>
      {:else}
        <label title="Soft edges: pixels on the edge partly selected">
          <input type="checkbox" bind:checked={selUi.antiAlias} /> Anti-alias
        </label>
      {/if}
    {/if}
    <div class="group" role="group" aria-label="Select">
      <button title="Select the whole image" onclick={() => g.selectAllPixels()}>All</button>
      <button
        title="Select nothing (Ctrl/Cmd + D)"
        disabled={!selected}
        onclick={() => g.deselectPixels()}>None</button
      >
      <button
        title="Select what is not selected (Ctrl/Cmd + Shift + I)"
        onclick={() => g.invertPixelSelection()}>Invert</button
      >
      <button
        title="Select what the current pixel layer shows"
        disabled={!onPixels}
        onclick={() => g.selectLayerPixels({ mode: 'new' })}>Layer pixels</button
      >
      <button
        title="Select the area of the selected shapes or text (a template’s piece)"
        onclick={() => {
          const why = g.selectFromObjects({ mode: 'new', feather: selUi.feather });
          if (why) g.store.update((s) => ({ ...s, message: { kind: 'error', text: why } }));
        }}>From shape</button
      >
    </div>
    {#if selected}
      <div class="group" role="group" aria-label="Modify">
        <label title="How many px Feather, Grow, Shrink and Smooth change the selection by">
          By
          <input
            type="number"
            min="1"
            max="250"
            value={selUi.amount}
            onchange={(e) => (selUi.amount = clamp(e.currentTarget.valueAsNumber, 1, 250))}
          /> px
        </label>
        <button
          title="Blur the selection’s edge"
          onclick={() => g.featherPixelSelection(selUi.amount)}>Feather</button
        >
        <button
          title="Make the selection bigger all round"
          onclick={() => g.growPixelSelection(selUi.amount)}>Grow</button
        >
        <button
          title="Make the selection smaller all round"
          onclick={() => g.growPixelSelection(-selUi.amount)}>Shrink</button
        >
        <button
          title="Round off jagged edges and drop specks"
          onclick={() => g.smoothPixelSelection(selUi.amount)}>Smooth</button
        >
      </div>
      <div class="group" role="group" aria-label="Selected pixels">
        <button
          title="Copy the selected pixels to a new layer (Ctrl/Cmd + J)"
          disabled={!onPixels}
          onclick={() => g.copySelectionToLayer()}>Copy to layer</button
        >
        <button
          title="Cut the selected pixels out to a new layer (Ctrl/Cmd + Shift + J)"
          disabled={!onPixels}
          onclick={() => g.cutSelectionToLayer()}>Cut to layer</button
        >
        <button
          title="Make the selected pixels transparent (Delete): Remove background"
          disabled={!onPixels}
          onclick={() => g.deleteSelectedPixels()}>Delete</button
        >
        <button title="Crop the image to the selection" onclick={() => g.cropToPixelSelection()}
          >Crop</button
        >
        <label title="Fade the selected pixels to this % of their opacity">
          <input
            type="number"
            min="0"
            max="100"
            aria-label="Fade to %"
            value={selUi.fade}
            onchange={(e) => (selUi.fade = clamp(e.currentTarget.valueAsNumber, 0, 100))}
          /> %
        </label>
        <button
          title="Edit ▸ Fade selection: lower the selected pixels’ opacity to the %"
          disabled={!onPixels}
          onclick={() => g.fadePixelSelection(selUi.fade)}>Fade</button
        >
        <button
          title="Make the selection the layer’s mask: the rest is hidden, not deleted"
          disabled={!onPixels}
          onclick={() => g.maskFromPixelSelection()}>Layer mask</button
        >
      </div>
    {/if}
  </div>
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding: 4px 10px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--line);
    font-size: 12px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--tx-2);
  }
  input[type='number'] {
    width: 52px;
  }
  button {
    padding: 2px 8px;
  }
  .seg[aria-pressed='true'] {
    background: var(--bg-3);
    border-color: var(--line-strong);
    color: var(--tx-1);
  }
</style>
