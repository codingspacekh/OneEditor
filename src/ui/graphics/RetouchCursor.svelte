<script lang="ts">
  // M22 (GB5): over the image while a retouching tool is chosen — the brush's size under the
  // pointer (a circle), and for the clone stamp and the heal brush a cross where they copy from
  // (aligned, it follows the pointer at the offset; while a stroke is painted, always); for red
  // eye, the pupil size under the pointer, or the box being dragged with the ellipse it works on.
  // Drawn black on white, one screen pixel wide at any zoom, as the brush cursor is.
  import type { AnimationApp } from '../../app/animation.ts';
  import {
    DEFAULT_RETOUCH,
    isRetouchBrushTool,
  } from '../../core/graphics/pixels/retouch-options.ts';
  import { animUi } from '../animation/animation-ui.svelte.ts';
  import { retouchUi } from './retouch-ui.svelte.ts';

  let { anim, zoom }: { anim: AnimationApp; zoom: number } = $props();
  const store = $derived(anim.store);
  const tool = $derived($store.tool);
  const options = $derived($store.retouch ?? DEFAULT_RETOUCH);
  const brush = $derived(isRetouchBrushTool(tool) ? options.brushes[tool] : null);
  const at = $derived(animUi.pointer);
  const source = $derived.by(() => {
    if (tool !== 'clone' && tool !== 'heal') return null;
    void options; // the source and offset are read from the store
    return anim.cloneSourceFor(at, retouchUi.painting);
  });
  /** The cross's arms: 8 screen px at any zoom. */
  const arm = $derived(8 / zoom);
  const box = $derived(tool === 'red-eye' ? retouchUi.eyeBox : null);
</script>

{#if brush && at}
  <g class="retouch-cursor" data-size={brush.size}>
    {#each ['under', 'over'] as cls (cls)}
      <circle
        class={cls}
        cx={at.x}
        cy={at.y}
        r={brush.size / 2}
        vector-effect="non-scaling-stroke"
      />
    {/each}
  </g>
{/if}
{#if source}
  <g class="clone-source" data-x={source.x} data-y={source.y}>
    {#each ['under', 'over'] as cls (cls)}
      <path
        class={cls}
        d="M{source.x - arm} {source.y}H{source.x + arm}M{source.x} {source.y - arm}V{source.y +
          arm}"
        vector-effect="non-scaling-stroke"
      />
      {#if brush}
        <circle
          class="{cls} faint"
          cx={source.x}
          cy={source.y}
          r={brush.size / 2}
          vector-effect="non-scaling-stroke"
        />
      {/if}
    {/each}
  </g>
{/if}
{#if tool === 'red-eye'}
  {#if box}
    {@const x = Math.min(box.from.x, box.to.x)}
    {@const y = Math.min(box.from.y, box.to.y)}
    {@const w = Math.abs(box.to.x - box.from.x)}
    {@const h = Math.abs(box.to.y - box.from.y)}
    <g class="eye-box">
      {#each ['under', 'over'] as cls (cls)}
        <rect class={cls} {x} {y} width={w} height={h} vector-effect="non-scaling-stroke" />
        <ellipse
          class={cls}
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          vector-effect="non-scaling-stroke"
        />
      {/each}
    </g>
  {:else if at}
    <g class="eye-cursor">
      {#each ['under', 'over'] as cls (cls)}
        <circle
          class={cls}
          cx={at.x}
          cy={at.y}
          r={options.pupilSize / 2}
          vector-effect="non-scaling-stroke"
        />
      {/each}
    </g>
  {/if}
{/if}

<style>
  .under,
  .over {
    fill: none;
  }
  .under {
    stroke: #fff;
    stroke-width: 3px;
  }
  .over {
    stroke: #000;
    stroke-width: 1px;
  }
  .faint {
    opacity: 0.5;
  }
</style>
