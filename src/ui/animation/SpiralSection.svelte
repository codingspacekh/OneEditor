<script lang="ts">
  // GV1 (M19): the Spiral tool's options in Properties — how many turns, the inner radius (% of
  // the spiral) and how it grows — shown while the tool is chosen, and while the spiral just drawn
  // is selected and unchanged: then a change draws it again in its place.
  import type { App } from '../../app/app.ts';
  import { findObject } from '../../core/animation/layers.ts';
  import { DEFAULT_SPIRAL, isSpiralOf, type SpiralOptions } from '../../core/graphics/shapes.ts';
  import Why from '../Why.svelte';
  import { editorOf } from './editor.ts';
  import NumField from './NumField.svelte';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);

  const options = $derived($store.spiral ?? DEFAULT_SPIRAL);
  /** The one spiral selected, still as these options drew it. */
  const spiral = $derived.by(() => {
    const ids = $store.selection;
    const o = ids.length === 1 ? findObject($store.history.present, ids[0]!)?.object : undefined;
    return o?.kind === 'path' && isSpiralOf(o, options) ? o : null;
  });
  let error: string | null = $state(null);
  /** A number box shows its own refusal; the menu's is shown under the section. */
  const change = (patch: Partial<SpiralOptions>): string | null =>
    (error = anim.setSpiralOptions(patch));
</script>

{#if $store.tool === 'spiral' || spiral}
  <div class="sec">
    <h4>Spiral <span class="syl">19.2 spirals</span></h4>
    <div class="two">
      <NumField
        label="Turns"
        value={options.turns}
        decimals={Number.isInteger(options.turns) ? 0 : 2}
        commit={(v) => anim.setSpiralOptions({ turns: v })}
      />
      <NumField
        label="Inner"
        value={options.inner}
        unit="%"
        commit={(v) => anim.setSpiralOptions({ inner: v })}
      />
    </div>
    <div class="field">
      <label for="spiral-growth">Grows</label>
      <select
        id="spiral-growth"
        value={options.growth}
        onchange={(e) =>
          change({
            growth: (e.currentTarget as HTMLSelectElement).value as SpiralOptions['growth'],
          })}
      >
        <option value="even">Evenly: the same gap each turn</option>
        <option value="opening">Opening out: each turn wider</option>
      </select>
    </div>
    <p class="hint">
      {spiral
        ? 'A change draws the selected spiral again in its place.'
        : 'Drag out the next spiral on the canvas.'}
    </p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <Why tool="graphicShapes" />
  </div>
{/if}

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
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 8px;
  }
  .field {
    display: grid;
    grid-template-columns: 58px 1fr;
    align-items: center;
    gap: 3px 6px;
    margin-bottom: 6px;
    min-width: 0;
  }
  .field label {
    color: var(--tx-2);
    font-size: 12px;
  }
  select {
    width: 100%;
    justify-content: safe flex-end;
  }
  .hint {
    margin: 0 0 6px;
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .error {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
