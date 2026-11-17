<script lang="ts">
  // Learn ▸ Graphics (GL1, G9, G10, GC1, M23): the theory of syllabus 19.1, 19.2 (trace) and 19.4,
  // one page at a time, chosen on the left; the page last seen stays chosen.
  import type { GraphicsLearnApp } from '../../../app/learn-graphics.ts';
  import { SOCIETY_TOPICS, TRACE_TOPICS } from '../../../core/teaching/graphics.ts';
  import LearnCard from '../LearnCard.svelte';
  import BitmapVector from './BitmapVector.svelte';
  import ColourSystems from './ColourSystems.svelte';
  import Compression from './Compression.svelte';
  import FileFormats from './FileFormats.svelte';
  import Resolution from './Resolution.svelte';
  import Topics from './Topics.svelte';
  import { GRAPHICS_PAGES, graphicsLearn } from './graphics-learn-ui.svelte.ts';

  let { learn }: { learn: GraphicsLearnApp } = $props();
</script>

<div class="graphics-learn">
  <nav aria-label="Graphics topics">
    {#each GRAPHICS_PAGES as [page, label] (page)}
      <button
        aria-current={graphicsLearn.page === page ? 'page' : undefined}
        onclick={() => (graphicsLearn.page = page)}>{label}</button
      >
    {/each}
  </nav>
  <div
    class="page"
    class:pair={graphicsLearn.page === 'bitmap' || graphicsLearn.page === 'resolution'}
  >
    {#if graphicsLearn.page === 'bitmap'}
      <BitmapVector />
    {:else if graphicsLearn.page === 'resolution'}
      <Resolution />
    {:else if graphicsLearn.page === 'colour'}
      <ColourSystems />
    {:else if graphicsLearn.page === 'formats'}
      <FileFormats />
    {:else if graphicsLearn.page === 'compression'}
      <Compression {learn} />
    {:else if graphicsLearn.page === 'trace'}
      <LearnCard title="Bitmap to vector" icon="wand" tag="19.2 converting bitmaps to vectors">
        <Topics topics={TRACE_TOPICS} />
      </LearnCard>
    {:else}
      <LearnCard title="Image editing and society" icon="info" tag="the impact of image editing">
        <Topics topics={SOCIETY_TOPICS} />
      </LearnCard>
    {/if}
  </div>
</div>

<style>
  .graphics-learn {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    min-width: 0;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: sticky;
    top: 0;
  }
  nav button {
    text-align: left;
    justify-content: flex-start;
    border-color: transparent;
    background: none;
    color: var(--tx-2);
    font-size: 12.5px;
  }
  nav button:hover {
    background: var(--bg-2);
  }
  nav button[aria-current='page'] {
    background: var(--accent-soft);
    color: var(--tx-1);
    font-weight: 600;
  }
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  .page.pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
</style>
