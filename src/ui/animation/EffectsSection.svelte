<script lang="ts">
  // One-click effects (AN20) for the selected objects, from the playhead: an entrance, an exit or
  // an emphasis, and how long it lasts. Only keyframes are added, so the timeline shows them and
  // they can be changed there afterwards.
  import type { App } from '../../app/app.ts';
  import { editorOf } from './editor.ts';
  import { ANIM_EFFECTS, effectOf, type EffectGroup } from '../../core/animation/effects.ts';
  import { timeLabel } from '../../core/animation/time.ts';
  import Why from '../Why.svelte';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);
  const stage = $derived($store.history.present.stage);

  const GROUPS: { id: EffectGroup; label: string }[] = [
    { id: 'entrance', label: 'Come in' },
    { id: 'exit', label: 'Go out' },
    { id: 'emphasis', label: 'Draw attention' },
  ];
  let chosen = $state('fadeIn');
  let seconds = $state(1);
  let error: string | null = $state(null);
  const effect = $derived(effectOf(chosen));

  function choose(id: string): void {
    chosen = id;
    seconds = effectOf(id)?.seconds ?? 1;
    error = null;
  }
</script>

<div class="sec effects">
  <h4>Effects <span class="syl">20.1 tweening</span></h4>
  <div class="field">
    <label for="effect-choice">Effect</label>
    <select
      id="effect-choice"
      value={chosen}
      onchange={(e) => choose((e.currentTarget as HTMLSelectElement).value)}
    >
      {#each GROUPS as g (g.id)}
        <optgroup label={g.label}>
          {#each ANIM_EFFECTS.filter((e) => e.group === g.id) as e (e.id)}
            <option value={e.id}>{e.label}{e.textOnly ? ' (text)' : ''}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </div>
  <div class="field">
    <label for="effect-seconds">Lasts (s)</label>
    <input id="effect-seconds" type="number" min="0.1" max="60" step="0.1" bind:value={seconds} />
  </div>
  <div class="prop-buttons">
    <button
      class="sm primary"
      title="Add the {effect?.label ??
        'effect'} to the selected objects, starting at the playhead ({timeLabel(
        $store.frame,
        stage.fps,
      )})"
      onclick={() => (error = anim.applyEffect(chosen, Number(seconds)))}>Add effect</button
    >
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="hint">
    Starts at the playhead. It adds keyframes you can change on the timeline; Undo takes it away.
  </p>
  <Why tool="animEffects" />
</div>

<style>
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
  /* A label and a menu or box in a row of its own: on the property grid (props.css), the control
     across the field columns. */
  .field {
    display: grid;
    grid-template-columns: var(--prop-cols);
    column-gap: var(--prop-gap-x);
    align-items: center;
    margin-bottom: var(--prop-gap-y);
    min-width: 0;
  }
  .field > :not(label) {
    grid-column: 2 / -1;
    min-width: 0;
  }
  .field label {
    color: var(--tx-2);
    font-size: 12px;
    line-height: 1.25;
  }
  .field input {
    /* A number alone: in the first field column, as wide as a pair's (props.css). */
    grid-column: 2 / 3;
    width: 100%;
    text-align: right;
  }
  .field select {
    /* Full width (so it never jumps with the choice), its words on the right as in the boxes
       (the teacher's layout check, 2026-11-15). A menu is a flex box (forms.css, base-select). */
    width: 100%;
    justify-content: safe flex-end; /* a choice too long for the box starts at its left */
  }
  .hint {
    margin: 0 0 6px;
    font-size: 11.5px;
    color: var(--tx-3);
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--danger);
  }
</style>
