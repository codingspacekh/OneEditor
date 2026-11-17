<script lang="ts">
  // GL1 (M23): short pieces of theory, each with where it is tried in OneEditor.
  import type { GraphicsTopic } from '../../../core/teaching/graphics.ts';

  let { topics }: { topics: readonly GraphicsTopic[] } = $props();
</script>

{#each topics as t (t.id)}
  <article class="topic" aria-label={t.title}>
    <h4>{t.title}</h4>
    {#each t.text as para (para)}<p>{para}</p>{/each}
    {#if t.where}<p class="where"><b>Try it:</b> {t.where}</p>{/if}
  </article>
{/each}

<style>
  .topic h4 {
    margin: 0 0 4px;
    font-size: 13px;
    color: var(--tx-1);
  }
  .topic p {
    margin: 0 0 6px;
    color: var(--tx-2);
    font-size: 12px;
    line-height: 1.5;
  }
  .topic + .topic {
    margin-top: 12px;
  }
  .where {
    color: var(--tx-3);
  }
  .where b {
    color: var(--tx-2);
  }
</style>
