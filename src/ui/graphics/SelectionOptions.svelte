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
  import Icon from '../Icon.svelte';

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

  // The three menus (issues/graphics-3.png): one open at a time, under its button, in front of
  // everything (the top layer, where the browser has it); Escape or a click elsewhere closes it.
  type Menu = 'select' | 'modify' | 'pixels';
  let open: Menu | null = $state(null);
  const topLayer = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
  /** Shows a menu on the top layer as it appears (a Svelte action). */
  function onTop(node: HTMLElement) {
    if (topLayer) node.showPopover();
  }
  function toggle(menu: Menu): void {
    open = open === menu ? null : menu;
  }
  /** Runs a menu's command and closes the menu. */
  function close(_event: MouseEvent, run: () => void): void {
    open = null;
    run();
  }
  function outside(event: PointerEvent): void {
    const t = event.target as HTMLElement | null;
    if (open && !t?.closest('.menu, .menu-button')) open = null;
  }
  // Nothing selected any more: the Modify and Selected pixels menus go.
  $effect(() => {
    if (!selected && open !== 'select') open = null;
  });

  /** A number field's value kept between its limits (an empty field: the lowest). */
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
</script>

<svelte:window
  onpointerdown={outside}
  onkeydown={(e) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      open = null;
    }
  }}
/>

{#if selecting || selected}
  <!-- issues/graphics-3.png: one row of groups (wrapping as whole groups in a narrow window) —
       the tool's settings as they are now, then the commands in three menus under their names:
       Select, Modify, Selected pixels (the Select menu at the top has them too, with keys). -->
  <div class="bar" role="toolbar" aria-label="Selection options">
    {#if selecting}
      <div class="group seg-group" role="group" aria-label="Selection mode">
        {#each SELECT_MODES as mode (mode)}
          <button
            class="seg"
            aria-pressed={selUi.mode === mode}
            title={MODE_LABELS[mode][1]}
            onclick={() => (selUi.mode = mode)}>{MODE_LABELS[mode][0]}</button
          >
        {/each}
      </div>
      <div class="group">
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
          <label
            title="How far a colour may be from the one clicked; the selection fades out to it"
          >
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
          <label
            title="Look at the picture as drawn (every visible layer, shapes and text too), not only the current layer"
          >
            <input type="checkbox" bind:checked={selUi.allLayers} /> All layers
          </label>
        {:else}
          <label title="Soft edges: pixels on the edge partly selected">
            <input type="checkbox" bind:checked={selUi.antiAlias} /> Anti-alias
          </label>
        {/if}
      </div>
    {/if}
    <div class="group">
      <button
        class="menu-button"
        aria-expanded={open === 'select'}
        aria-haspopup="true"
        onclick={() => toggle('select')}
        style:anchor-name="--sel-menu-select"
        title="Select all, none, the opposite, a layer’s pixels or a shape’s area"
        >Select <Icon name="chevron" size={12} /></button
      >
      {#if selected}
        <button
          class="menu-button"
          aria-expanded={open === 'modify'}
          aria-haspopup="true"
          onclick={() => toggle('modify')}
          style:anchor-name="--sel-menu-modify"
          title="Feather, grow, shrink or smooth the selection by some px"
          >Modify <Icon name="chevron" size={12} /></button
        >
        <button
          class="menu-button"
          aria-expanded={open === 'pixels'}
          aria-haspopup="true"
          onclick={() => toggle('pixels')}
          style:anchor-name="--sel-menu-pixels"
          title="Copy, cut, delete, crop, fade or mask the selected pixels"
          >Selected pixels <Icon name="chevron" size={12} /></button
        >
      {/if}
    </div>

    {#if open === 'select'}
      <div
        id="sel-menu-select"
        class="menu"
        popover={topLayer ? 'manual' : undefined}
        use:onTop
        style:position-anchor="--sel-menu-select"
        role="group"
        aria-label="Select"
      >
        <button
          title="Select the whole image (Ctrl/Cmd + A)"
          onclick={(e) => close(e, () => g.selectAllPixels())}>All</button
        >
        <button
          title="Select nothing (Ctrl/Cmd + D)"
          disabled={!selected}
          onclick={(e) => close(e, () => g.deselectPixels())}>None</button
        >
        <button
          title="Select what is not selected (Ctrl/Cmd + Shift + I)"
          onclick={(e) => close(e, () => g.invertPixelSelection())}>Invert</button
        >
        <button
          title="Select what the current pixel layer shows"
          disabled={!onPixels}
          onclick={(e) => close(e, () => g.selectLayerPixels({ mode: 'new' }))}>Layer pixels</button
        >
        <button
          title="Select the area of the selected shapes or text (a template’s piece)"
          onclick={(e) =>
            close(e, () => {
              const why = g.selectFromObjects({ mode: 'new', feather: selUi.feather });
              if (why) g.store.update((s) => ({ ...s, message: { kind: 'error', text: why } }));
            })}>From shape</button
        >
      </div>
    {/if}
    {#if selected}
      <!-- Modify stays open: grow, then grow again. -->
      {#if open === 'modify'}
        <div
          id="sel-menu-modify"
          class="menu"
          popover={topLayer ? 'manual' : undefined}
          use:onTop
          style:position-anchor="--sel-menu-modify"
          role="group"
          aria-label="Modify"
        >
          <label
            class="amount"
            title="How many px Feather, Grow, Shrink and Smooth change the selection by"
          >
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
      {/if}
      {#if open === 'pixels'}
        <div
          id="sel-menu-pixels"
          class="menu"
          popover={topLayer ? 'manual' : undefined}
          use:onTop
          style:position-anchor="--sel-menu-pixels"
          role="group"
          aria-label="Selected pixels"
        >
          <button
            title="Copy the selected pixels to a new layer (Ctrl/Cmd + J)"
            disabled={!onPixels}
            onclick={(e) => close(e, () => g.copySelectionToLayer())}>Copy to layer</button
          >
          <button
            title="Cut the selected pixels out to a new layer (Ctrl/Cmd + Shift + J)"
            disabled={!onPixels}
            onclick={(e) => close(e, () => g.cutSelectionToLayer())}>Cut to layer</button
          >
          <button
            title="Make the selected pixels transparent (Delete): Remove background"
            disabled={!onPixels}
            onclick={(e) => close(e, () => g.deleteSelectedPixels())}>Delete</button
          >
          <button
            title="Crop the image to the selection"
            onclick={(e) => close(e, () => g.cropToPixelSelection())}>Crop</button
          >
          <button
            title="Make the selection the layer’s mask: the rest is hidden, not deleted"
            disabled={!onPixels}
            onclick={(e) => close(e, () => g.maskFromPixelSelection())}>Layer mask</button
          >
          <div class="fade">
            <button
              title="Edit ▸ Fade selection: lower the selected pixels’ opacity to the %"
              disabled={!onPixels}
              onclick={(e) => close(e, () => g.fadePixelSelection(selUi.fade))}>Fade</button
            >
            <label title="Fade the selected pixels to this % of their opacity">
              to
              <input
                type="number"
                min="0"
                max="100"
                aria-label="Fade to %"
                value={selUi.fade}
                onchange={(e) => (selUi.fade = clamp(e.currentTarget.valueAsNumber, 0, 100))}
              /> %
            </label>
          </div>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    min-height: 40px;
    padding: 5px 10px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--line);
    font-size: 12px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  label {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--tx-2);
    white-space: nowrap;
  }
  input[type='number'] {
    width: 52px;
    height: 26px;
    text-align: right;
  }
  button {
    height: 26px;
    padding: 0 10px;
  }
  /* The mode: one segmented control, its buttons joined. */
  .seg-group {
    gap: 0;
  }
  .seg {
    border-radius: 0;
    margin-left: -1px;
  }
  .seg:first-child {
    margin-left: 0;
    border-radius: var(--radius-s) 0 0 var(--radius-s);
  }
  .seg:last-child {
    border-radius: 0 var(--radius-s) var(--radius-s) 0;
  }
  .seg[aria-pressed='true'] {
    position: relative;
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--tx-1);
  }
  .menu-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-right: 6px;
  }
  .menu-button :global(svg) {
    color: var(--tx-3);
  }
  /* The menus: a list of their commands under the button (anchored), as the app's other lists. */
  .menu {
    position: fixed;
    inset: auto;
    top: anchor(bottom);
    left: anchor(left);
    margin: 4px 0 0;
    min-width: 168px;
    padding: 5px;
    color: var(--tx-1);
    background: var(--bg-2);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
    position-try-fallbacks: flip-inline;
  }
  .menu:popover-open {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .menu button {
    justify-content: flex-start;
    width: 100%;
    height: 28px;
    border-color: transparent;
    background: transparent;
    text-align: left;
  }
  .menu button:hover:not(:disabled) {
    background: var(--bg-3);
  }
  .menu .amount {
    padding: 2px 8px 6px;
    margin-bottom: 2px;
    border-bottom: 1px solid var(--line);
  }
  .fade {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 4px;
    margin-top: 2px;
    border-top: 1px solid var(--line);
  }
  .fade button {
    width: auto;
  }
</style>
