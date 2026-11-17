<script lang="ts">
  // G5 (M18): Align and Distribute in the Properties panel, in Graphics and Animation modes:
  // edges and centres lined up with the selection, the first object chosen, or the canvas (one
  // object is lined up with the canvas), and three or more spaced evenly.
  import type { App } from '../../app/app.ts';
  import type { AlignEdge, AlignTo, DistributeBy } from '../../core/graphics/align.ts';
  import Icon, { type IconName } from '../Icon.svelte';
  import Why from '../Why.svelte';
  import { editorOf } from './editor.ts';

  let { app, count }: { app: App; count: number } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);

  let to: AlignTo = $state('selection');
  let by: DistributeBy = $state('centres');
  const where = $derived(editor.still ? 'canvas' : 'stage');

  const EDGES: [AlignEdge, string, IconName][] = [
    ['left', 'Align left edges', 'alignLeft'],
    ['centre', 'Align centres (across)', 'alignCentre'],
    ['right', 'Align right edges', 'alignRight'],
    ['top', 'Align top edges', 'alignTop'],
    ['middle', 'Align middles (down)', 'alignMiddle'],
    ['bottom', 'Align bottom edges', 'alignBottom'],
  ];
</script>

<div class="sec">
  <h4>Align <span class="syl">19.1 alignment and distribution</span></h4>
  <div class="prop-buttons" style:--n="6" role="group" aria-label="Align">
    {#each EDGES as [edge, label, icon] (edge)}
      <button
        class="sm"
        aria-label={label}
        title={count === 1 ? `${label} with the ${where}` : label}
        onclick={() => anim.align(edge, to)}><Icon name={icon} size={14} /></button
      >
    {/each}
  </div>
  <div class="prop-row">
    <label for="align-to">Relative to</label>
    <select id="align-to" bind:value={to} disabled={count === 1}>
      <option value="selection">The selected objects</option>
      <option value="first">The first one selected</option>
      <option value="canvas">The {where}</option>
    </select>
  </div>
  {#if count === 1}
    <p class="hint">One object lines up with the {where}.</p>
  {/if}
  <div class="prop-row">
    <span class="prop-label">Distribute</span>
    <div class="prop-buttons" role="group" aria-label="Distribute">
      <button
        class="sm"
        aria-label="Distribute across"
        title="Space three or more evenly from left to right"
        disabled={count < 3}
        onclick={() => anim.distribute('horizontal', by)}
        ><Icon name="distributeH" size={14} /> Across</button
      >
      <button
        class="sm"
        aria-label="Distribute down"
        title="Space three or more evenly from top to bottom"
        disabled={count < 3}
        onclick={() => anim.distribute('vertical', by)}
        ><Icon name="distributeV" size={14} /> Down</button
      >
    </div>
  </div>
  <div class="prop-row">
    <label for="distribute-by">Space</label>
    <select id="distribute-by" bind:value={by} disabled={count < 3}>
      <option value="centres">Centres the same distance apart</option>
      <option value="gaps">The same gap between them</option>
    </select>
  </div>
  <Why tool="graphicAlign" />
</div>

<style>
  /* The Properties panel's own look (its styles are its own: Svelte scopes them). */
  .sec {
    padding: 8px 0 10px;
    border-bottom: 1px solid var(--line);
  }
  h4 {
    margin: 0 0 8px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--tx-2);
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .syl {
    font-size: 10px;
    font-weight: 500;
    color: var(--tx-3);
  }
  select {
    /* Full width (so it never jumps with the choice), its words on the right as in the boxes
       (the teacher's layout check, 2026-11-15). A menu is a flex box (forms.css, base-select). */
    width: 100%;
    justify-content: safe flex-end; /* a choice too long for the box starts at its left */
  }
  .hint {
    margin: 0 0 6px;
    color: var(--tx-3);
    font-size: 11.5px;
  }
</style>
