<script lang="ts">
  // GV2 (M19): Curves and copies in the Properties panel, in Graphics and Animation modes:
  // Convert to curves (shapes become pen paths that look the same), Step and repeat… (n copies,
  // each moved and / or turned), Paste in place and Mirror copy (a flipped copy beside the
  // selection). The dialog is opened from here.
  import type { App } from '../../app/app.ts';
  import type { AnimObject } from '../../core/animation/types.ts';
  import { withWhy } from '../../core/effects/help.ts';
  import { whyNotCurves } from '../../core/graphics/curves.ts';
  import Why from '../Why.svelte';
  import { animUi } from './animation-ui.svelte.ts';
  import { editorOf } from './editor.ts';
  import StepRepeatDialog from './StepRepeatDialog.svelte';

  let { app, objects }: { app: App; objects: readonly AnimObject[] } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);

  const curvable = $derived(objects.some((o) => whyNotCurves(o) === null));
  let error: string | null = $state(null);
</script>

<div class="sec">
  <h4>Curves and copies <span class="syl">19.2 selection tools</span></h4>
  <div class="line">
    <span class="cap">Curves</span>
    <button
      class="sm"
      title={withWhy(
        'Turn the selected shapes into paths of nodes and curves that look the same',
        'graphicCurves',
      )}
      disabled={!curvable}
      onclick={() => (error = anim.convertToCurves())}>Convert to curves</button
    >
  </div>
  <div class="line">
    <span class="cap">Copies</span>
    <div class="cells two-up">
      <button
        class="sm"
        title={withWhy(
          'Make several copies at once, each moved and / or turned by the same amount',
          'graphicReplicate',
        )}
        onclick={() => (animUi.dialog = 'stepRepeat')}>Step and repeat…</button
      >
      <button
        class="sm"
        title="Paste what was copied exactly where it was (Ctrl/Cmd + Shift + V)"
        onclick={() => anim.pasteInPlace()}>Paste in place</button
      >
    </div>
  </div>
  <div class="line">
    <span class="cap">Mirror copy</span>
    <div class="cells two-up" role="group" aria-label="Mirror copy">
      <button
        class="sm"
        aria-label="Mirror copy left to right"
        title="A copy mirrored left to right, beside the selection on its right"
        onclick={() => (error = anim.mirrorCopy('horizontal'))}>↔ Beside</button
      >
      <button
        class="sm"
        aria-label="Mirror copy top to bottom"
        title="A copy mirrored top to bottom, below the selection"
        onclick={() => (error = anim.mirrorCopy('vertical'))}>↕ Below</button
      >
    </div>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <Why tool="graphicReplicate" />
</div>
{#if animUi.dialog === 'stepRepeat'}
  <StepRepeatDialog {app} onclose={() => (animUi.dialog = null)} />
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
  .line {
    display: grid;
    grid-template-columns: 76px 1fr;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    min-width: 0;
  }
  .cap {
    color: var(--tx-2);
    font-size: 12px;
  }
  .cells {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .cells.two-up {
    grid-template-columns: repeat(2, 1fr);
  }
  button {
    justify-content: center;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .error {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
