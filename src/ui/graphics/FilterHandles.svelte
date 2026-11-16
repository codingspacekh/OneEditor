<script lang="ts">
  // M22 (GB5): what a filter's dialog shows on the image while it is open (inside the stage's SVG,
  // image px; drawn only — the dialog takes the presses beside it): the centre of a zoom, twirl
  // or bulge with the circle it works in, the perspective's four corners and sides, the warp's
  // 4 × 4 mesh. White over black, so they show on any photo; the same size at any zoom.
  import { animUi } from '../animation/animation-ui.svelte.ts';
  import { MESH } from '../../core/graphics/pixels/distort.ts';
  import { filterUi, handlesOf } from './filter-ui.svelte.ts';

  let { zoom }: { zoom: number } = $props();
  const spec = $derived(animUi.dialog === 'filter' ? filterUi.spec : null);
  const points = $derived(handlesOf(spec));
  /** A handle's radius and the centre's cross, in image px (5 and 9 screen px). */
  const r = $derived(5 / zoom);
  const arm = $derived(9 / zoom);
  const line = (ps: readonly { x: number; y: number }[]) =>
    ps.map((p) => `${p.x},${p.y}`).join(' ');
  /** The warp mesh's rows and columns, as lines through its points. */
  const mesh = $derived.by(() => {
    if (spec?.kind !== 'warp') return [];
    const at = (i: number, j: number) => spec.points[j * MESH + i]!;
    const lines: string[] = [];
    for (let j = 0; j < MESH; j++)
      lines.push(line(Array.from({ length: MESH }, (_, i) => at(i, j))));
    for (let i = 0; i < MESH; i++)
      lines.push(line(Array.from({ length: MESH }, (_, j) => at(i, j))));
    return lines;
  });
</script>

{#if spec}
  <g class="filter-handles" data-kind={spec.kind}>
    {#if 'centre' in spec}
      {#if 'radius' in spec}
        <circle
          class="under"
          cx={spec.centre.x}
          cy={spec.centre.y}
          r={spec.radius}
          vector-effect="non-scaling-stroke"
        />
        <circle
          class="over"
          cx={spec.centre.x}
          cy={spec.centre.y}
          r={spec.radius}
          vector-effect="non-scaling-stroke"
        />
      {/if}
      {#each ['under', 'over'] as k (k)}
        <path
          class={k}
          d="M {spec.centre.x - arm} {spec.centre.y} H {spec.centre.x + arm} M {spec.centre.x} {spec
            .centre.y - arm} V {spec.centre.y + arm}"
          vector-effect="non-scaling-stroke"
        />
      {/each}
    {:else if spec.kind === 'perspective'}
      <polygon class="under" points={line(spec.corners)} vector-effect="non-scaling-stroke" />
      <polygon class="over" points={line(spec.corners)} vector-effect="non-scaling-stroke" />
    {:else if spec.kind === 'warp'}
      {#each mesh as l, i (i)}
        <polyline class="under" points={l} vector-effect="non-scaling-stroke" />
        <polyline class="over" points={l} vector-effect="non-scaling-stroke" />
      {/each}
    {/if}
    {#if spec.kind === 'perspective' || spec.kind === 'warp'}
      {#each points as p, i (i)}
        <circle class="handle" cx={p.x} cy={p.y} {r} vector-effect="non-scaling-stroke" />
      {/each}
    {/if}
  </g>
{/if}

<style>
  .under,
  .over {
    fill: none;
    stroke-width: 1px;
  }
  .under {
    stroke: #000;
    stroke-width: 3px;
    opacity: 0.6;
  }
  .over {
    stroke: #fff;
  }
  .handle {
    fill: #fff;
    stroke: #000;
    stroke-width: 1px;
  }
</style>
