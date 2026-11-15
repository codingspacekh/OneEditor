<script lang="ts">
  // The search box at the top of a property panel (property-search.ts does the filtering): what
  // is typed shows only the settings with those words; Escape or the × clears it.
  import Icon from './Icon.svelte';

  let { value = $bindable(''), found = -1 }: { value?: string; found?: number } = $props();
</script>

<div class="search">
  <Icon name="search" size={14} />
  <input
    type="search"
    aria-label="Search properties"
    placeholder="Search properties…"
    bind:value
    onkeydown={(e) => {
      if (e.key === 'Escape' && value) {
        e.stopPropagation();
        value = '';
      }
    }}
  />
</div>
{#if value.trim() && found === 0}
  <p class="none" role="status">No setting matches “{value.trim()}”.</p>
{/if}

<style>
  .search {
    position: relative;
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    color: var(--tx-3);
  }
  .search :global(svg) {
    position: absolute;
    left: 20px;
    pointer-events: none;
  }
  input {
    flex: 1;
    min-width: 0;
    padding-left: 28px;
  }
  .none {
    margin: 0;
    padding: 10px 12px;
    color: var(--tx-3);
    font-size: 12px;
  }
</style>
