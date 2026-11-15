<script lang="ts">
  // GV2 (M19): Step and repeat… — copies of the selection, each moved across and down by the same
  // step (in the image's units in Graphics mode) and / or turned by the same angle about the middle
  // of the selection, of the canvas, or a typed point: J/23's 12 spokes are 11 copies turned 30°
  // about the hub, M/26's chip legs copies each the same distance along.
  import { untrack } from 'svelte';
  import type { App } from '../../app/app.ts';
  import { graphicOf } from '../../core/graphics/document.ts';
  import type { StepRepeat } from '../../core/graphics/replicate.ts';
  import { DECIMALS, fromPx, toPx } from '../../core/graphics/units.ts';
  import Dialog from '../Dialog.svelte';
  import Why from '../Why.svelte';
  import { editorOf } from './editor.ts';
  import NumField from './NumField.svelte';

  let { app, onclose }: { app: App; onclose: () => void } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const doc = untrack(() => editor.anim.store.get().history.present);
  /** G6: lengths in the image's units in Graphics mode (px in an animation). */
  const image = editor.still ? graphicOf(doc) : { units: 'px' as const, dpi: 96 };
  const decimals = image.units === 'px' ? 0 : DECIMALS[image.units];
  const shown = (px: number) => fromPx(px, image.units, image.dpi);
  const typed = (v: number) => toPx(v, image.units, image.dpi);
  const where = editor.still ? 'canvas' : 'stage';

  let copies = $state(1);
  let dx = $state(0);
  let dy = $state(0);
  let angle = $state(0);
  let about: 'selection' | 'canvas' | 'point' = $state('selection');
  let point = $state({ x: doc.stage.width / 2, y: doc.stage.height / 2 });
  let error: string | null = $state(null);
  const count = untrack(() => editor.anim.store.get().selection.length);

  /** A typed number kept (the dialog's fields apply together, on Make copies). */
  const keep = (set: (v: number) => void) => (v: number) => {
    set(v);
    return null;
  };

  function make(): void {
    const step: StepRepeat = {
      copies,
      dx,
      dy,
      angle,
      about: about === 'point' ? point : about,
    };
    error = anim.stepAndRepeat(step);
    if (!error) onclose();
  }
</script>

<Dialog label="Step and repeat" syllabus="19.2 replication" width={440} {onclose}>
  <div class="grid">
    <NumField label="Copies" value={copies} commit={keep((v) => (copies = Math.round(v)))} />
    <span class="hint">{copies + 1} in all, with the {count === 1 ? 'original' : 'originals'}</span>
    <NumField
      label="Move across"
      value={shown(dx)}
      unit={image.units}
      {decimals}
      commit={keep((v) => (dx = typed(v)))}
    />
    <NumField
      label="Move down"
      value={shown(dy)}
      unit={image.units}
      {decimals}
      commit={keep((v) => (dy = typed(v)))}
    />
    <NumField label="Turn" value={angle} unit="°" commit={keep((v) => (angle = v))} />
    <span class="hint">each copy from the one before</span>
  </div>
  <div class="field">
    <label for="repeat-about">Turn about</label>
    <select id="repeat-about" bind:value={about} disabled={angle === 0}>
      <option value="selection">The middle of the selection</option>
      <option value="canvas">The middle of the {where}</option>
      <option value="point">A point…</option>
    </select>
  </div>
  {#if about === 'point' && angle !== 0}
    <div class="grid">
      <NumField
        label="Point X"
        value={shown(point.x)}
        unit={image.units}
        {decimals}
        commit={keep((v) => (point = { ...point, x: typed(v) }))}
      />
      <NumField
        label="Point Y"
        value={shown(point.y)}
        unit={image.units}
        {decimals}
        commit={keep((v) => (point = { ...point, y: typed(v) }))}
      />
    </div>
  {/if}
  <p class="hint">
    Spokes evenly round a hub: 11 copies turned 30° about the hub's centre (12 in all, 360° ÷ 12).
    Legs evenly spaced: copies moved across by the gap from one leg to the next.
  </p>
  <Why tool="graphicReplicate" />
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet buttons()}
    <button onclick={onclose}>Cancel</button>
    <button class="primary" onclick={make}>Make copies</button>
  {/snippet}
</Dialog>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 16px;
    align-items: center;
  }
  .field {
    display: grid;
    grid-template-columns: 90px 1fr;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .field label {
    color: var(--tx-2);
    font-size: 12px;
  }
  select {
    width: 100%;
  }
  .hint {
    margin: 0 0 6px;
    color: var(--tx-2);
    font-size: 11.5px;
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
