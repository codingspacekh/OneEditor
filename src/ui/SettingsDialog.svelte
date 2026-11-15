<script lang="ts">
  // Settings… (OneEditor ▸ Settings… on a Mac, Edit ▸ Settings… on Windows; Ctrl/⌘ + ,): choices
  // kept for the whole app between sessions. The teacher's request (2026-11-15): "Why use this?"
  // can be hidden once students know the tools.
  import type { App } from '../app/app.ts';
  import Dialog from './Dialog.svelte';

  let { app, onclose }: { app: App; onclose: () => void } = $props();
  const settings = $derived(app.settings.store);
</script>

<Dialog label="Settings" width={460} {onclose}>
  <label class="option">
    <span class="words">
      <span class="name">Show “Why use this?”</span>
      <span class="hint">
        The links under the tools and settings, and the Why? part of the tooltips: what each one is
        for, and when to use it.
      </span>
    </span>
    <input
      type="checkbox"
      checked={$settings.showWhy}
      onchange={(e) => app.settings.set({ showWhy: e.currentTarget.checked })}
    />
  </label>
  {#snippet buttons()}
    <button class="primary" onclick={onclose}>Close</button>
  {/snippet}
</Dialog>

<style>
  .option {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 4px 0;
    cursor: pointer;
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .name {
    color: var(--tx-1);
  }
  .hint {
    color: var(--tx-3);
    font-size: 12px;
  }
  input {
    margin-top: 2px;
    flex: none;
  }
</style>
