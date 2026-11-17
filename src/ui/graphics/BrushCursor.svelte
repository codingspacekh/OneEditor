<script lang="ts">
  // M21 step 4 (GB4, GB3): over the image, the brush's size and shape under the pointer while a
  // brush tool is chosen (a square for a square brush, else a circle; a 1 px box for a pencil
  // that small), drawn black on white so it shows on any picture, one screen pixel wide at any
  // zoom; and the gradient tool's line while it is dragged.
  import type { AnimationApp } from '../../app/animation.ts';
  import { DEFAULT_PAINT, isBrushTool } from '../../core/graphics/pixels/presets.ts';
  import { animUi } from '../animation/animation-ui.svelte.ts';
  import { paintUi } from './paint-ui.svelte.ts';

  let { anim }: { anim: AnimationApp } = $props();
  const store = $derived(anim.store);
  const tool = $derived($store.tool);
  const brush = $derived(isBrushTool(tool) ? ($store.paint ?? DEFAULT_PAINT).brushes[tool] : null);
  const at = $derived(animUi.pointer);
  /** The pencil's dab sits on whole pixels (its odd sizes on the pixel under the pointer). */
  const box = $derived(
    brush && at && (tool === 'pencil' || brush.shape === 'square')
      ? {
          size: tool === 'pencil' ? Math.max(1, Math.round(brush.size)) : brush.size,
          odd: tool === 'pencil' && Math.round(brush.size) % 2 === 1,
        }
      : null,
  );
  const line = $derived(paintUi.gradientLine);
</script>

{#if brush && at}
  <g class="brush-cursor" data-size={brush.size}>
    {#if box}
      {@const x = box.odd ? at.x - (box.size - 1) / 2 : at.x - box.size / 2}
      {@const y = box.odd ? at.y - (box.size - 1) / 2 : at.y - box.size / 2}
      {#each ['under', 'over'] as cls (cls)}
        <rect
          class={cls}
          {x}
          {y}
          width={box.size}
          height={box.size}
          vector-effect="non-scaling-stroke"
        />
      {/each}
    {:else}
      {#each ['under', 'over'] as cls (cls)}
        <circle
          class={cls}
          cx={at.x}
          cy={at.y}
          r={brush.size / 2}
          vector-effect="non-scaling-stroke"
        />
      {/each}
    {/if}
  </g>
{/if}
{#if line}
  <g class="gradient-line">
    {#each ['under', 'over'] as cls (cls)}
      <line
        class={cls}
        x1={line.from.x}
        y1={line.from.y}
        x2={line.to.x}
        y2={line.to.y}
        vector-effect="non-scaling-stroke"
      />
    {/each}
  </g>
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
</style>
