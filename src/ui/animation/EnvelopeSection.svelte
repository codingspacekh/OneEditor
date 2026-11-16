<script lang="ts">
  // GV4, G3 (M19): Envelope in the Properties panel, in Graphics and Animation modes, for the
  // selected shapes and groups of shapes: a preset (arch, arc, bulge, flag, wave, rise, squeeze)
  // with its bend typed in %, Perspective (its four corners dragged on the stage) or Custom (the
  // corners and the sides' handles dragged); Apply makes plain paths, Remove takes the bend off.
  // The bend stays live until applied: the shape underneath can still be changed. GT5 (M20): text
  // too, bent as its letters' outlines while its words, font and size can still be changed.
  import type { App } from '../../app/app.ts';
  import { findObject } from '../../core/animation/layers.ts';
  import type { AnimObject, Envelope, EnvelopePreset } from '../../core/animation/types.ts';
  import {
    BOX_CORNERS,
    cornersOf,
    DEFAULT_BEND,
    ENVELOPE_PRESETS,
    PRESET_LABELS,
    sidesFromCorners,
    sidesOf,
    type Corners,
  } from '../../core/graphics/envelope.ts';
  import Why from '../Why.svelte';
  import { editorOf } from './editor.ts';
  import NumField from './NumField.svelte';
  import { whyNotBendable } from '../../core/graphics/warp.ts';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);

  const chosen = $derived(
    $store.selection.flatMap((id) => {
      const f = findObject($store.history.present, id);
      return f ? [f.object] : [];
    }),
  );
  /** Shown for shapes, text (GT5) and groups of them (pictures and buttons cannot be bent). */
  const bendable = (o: AnimObject) => whyNotBendable(o) === null;
  const shown = $derived(chosen.length > 0 && chosen.every(bendable));
  const words = $derived(chosen.some((o) => o.kind === 'text'));
  const envelope = $derived(chosen[0]?.envelope ?? null);
  type Choice = 'none' | EnvelopePreset | 'perspective' | 'custom';
  const choice: Choice = $derived(
    !envelope ? 'none' : envelope.kind === 'preset' ? envelope.preset : envelope.kind,
  );
  const where = $derived(editor.still ? 'canvas' : 'stage');
  let error: string | null = $state(null);

  /** The envelope for a choice, starting from the one there is (a preset made custom keeps its shape). */
  function envelopeFor(c: Choice): Envelope | null {
    switch (c) {
      case 'none':
        return null;
      case 'perspective':
        return {
          kind: 'perspective',
          corners: envelope ? cornersOf(envelope) : (BOX_CORNERS.map((p) => ({ ...p })) as Corners),
        };
      case 'custom':
        return {
          kind: 'custom',
          sides: envelope ? sidesOf(envelope) : sidesFromCorners(BOX_CORNERS),
        };
      default:
        return {
          kind: 'preset',
          preset: c,
          bend: envelope?.kind === 'preset' ? envelope.bend : DEFAULT_BEND,
        };
    }
  }

  function choose(c: Choice): void {
    error = anim.setEnvelope(envelopeFor(c));
  }
</script>

{#if shown}
  <div class="sec">
    <h4>Envelope <span class="syl">19.2 envelopes and perspective</span></h4>
    <div class="field">
      <label for="envelope-kind">Bend into</label>
      <select
        id="envelope-kind"
        value={choice}
        title="Bend the selected shapes into another outline, or put them in perspective"
        onchange={(e) => choose((e.currentTarget as HTMLSelectElement).value as Choice)}
      >
        <option value="none">None</option>
        <optgroup label="Presets">
          {#each ENVELOPE_PRESETS as p (p)}<option value={p}>{PRESET_LABELS[p]}</option>{/each}
        </optgroup>
        <option value="perspective">Perspective</option>
        <option value="custom">Custom</option>
      </select>
    </div>
    {#if envelope?.kind === 'preset'}
      {@const bent = envelope}
      <NumField
        label="Bend"
        value={bent.bend}
        unit="%"
        commit={(v) => anim.setEnvelope({ ...bent, bend: v })}
      />
      <p class="hint">Below 0 % it bends the other way.</p>
    {:else if envelope?.kind === 'perspective'}
      <p class="hint">Drag the four corners on the {where}: the far end gets smaller.</p>
    {:else if envelope?.kind === 'custom'}
      <p class="hint">Drag the corners and the sides’ round handles on the {where}.</p>
    {/if}
    <div class="cells two-up" role="group" aria-label="Envelope">
      <button
        class="sm"
        disabled={!envelope}
        title="Make the bent shapes plain paths, whose points can then be edited"
        onclick={() => (error = anim.applyEnvelope())}>Apply</button
      >
      <button
        class="sm"
        disabled={!envelope}
        title="Take the bend off: the shapes as they were"
        onclick={() => (error = anim.setEnvelope(null))}>Remove</button
      >
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <Why tool={words ? 'textWarp' : 'graphicEnvelope'} />
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
    margin: 0 0 6px;
    color: var(--danger);
    font-size: 11.5px;
  }
  .cells {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
    min-width: 0;
    margin-bottom: 6px;
  }
  .cells button {
    justify-content: center;
    min-width: 0;
  }
</style>
