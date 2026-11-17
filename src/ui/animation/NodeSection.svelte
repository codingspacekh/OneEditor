<script lang="ts">
  // GV3 (M19): the node bar in the Properties panel, under the selected pen path, in Graphics and
  // Animation modes: the chosen nodes' X / Y (one node; in the image's units in Graphics mode),
  // node types (cusp, smooth, symmetrical), the segment after a node made a line or a curve,
  // nodes lined up and spaced, and the path broken, joined, closed or opened, reversed,
  // simplified or its nodes deleted. Nodes are chosen on the stage (click, Shift-click, a box).
  import type { App } from '../../app/app.ts';
  import { withWhy } from '../../core/effects/help.ts';
  import { anchorsOnStage } from '../../core/animation/pen.ts';
  import type { NodeType, PathObject } from '../../core/animation/types.ts';
  import type { AlignEdge } from '../../core/graphics/align.ts';
  import { graphicOf } from '../../core/graphics/document.ts';
  import { nodeTypeOf } from '../../core/graphics/nodes.ts';
  import { DECIMALS, fromPx, toPx } from '../../core/graphics/units.ts';
  import Icon, { type IconName } from '../Icon.svelte';
  import Why from '../Why.svelte';
  import { editorOf } from './editor.ts';
  import NumField from './NumField.svelte';

  let { app, path }: { app: App; path: PathObject } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);

  const chosen = $derived.by((): number[] => {
    void $store;
    return anim.chosenNodes();
  });
  const anchors = $derived(anchorsOnStage(path));
  const one = $derived(chosen.length === 1 ? anchors[chosen[0]!] : undefined);
  /** The type all the chosen nodes have (none when they differ). */
  const sharedType = $derived.by((): NodeType | null => {
    const types = new Set(chosen.map((i) => nodeTypeOf(path.points[i] ?? { x: 0, y: 0 })));
    return types.size === 1 ? [...types][0]! : null;
  });
  /** The two end nodes of an open path are chosen: they can be joined. */
  const ends = $derived(
    !path.closed && chosen.length === 2 && chosen[0] === 0 && chosen[1] === path.points.length - 1,
  );
  const lastOfOpen = $derived(
    !path.closed && chosen.length > 0 && chosen.every((i) => i === path.points.length - 1),
  );

  // G1, G6: Graphics mode types positions in the image's units (px in Animation mode).
  const image = $derived(
    editor.still ? graphicOf($store.history.present) : { units: 'px' as const, dpi: 96 },
  );
  const decimals = $derived(image.units === 'px' ? 2 : DECIMALS[image.units]);
  const shown = (px: number) => fromPx(px, image.units, image.dpi);
  const typed = (v: number) =>
    image.units === 'px' ? v : Math.round(toPx(v, image.units, image.dpi) * 100) / 100;

  const TYPES: [NodeType, string, string][] = [
    ['cusp', 'Cusp', 'A sharp point: each handle moves on its own'],
    ['smooth', 'Smooth', 'A flowing curve: the handles stay in line, each its own length'],
    ['symmetrical', 'Symmetrical', 'An even curve: the handles stay in line and the same length'],
  ];
  const EDGES: [AlignEdge, string, IconName][] = [
    ['left', 'Line up the chosen nodes on the left', 'alignLeft'],
    ['centre', 'Line up the chosen nodes on their centre (across)', 'alignCentre'],
    ['right', 'Line up the chosen nodes on the right', 'alignRight'],
    ['top', 'Line up the chosen nodes along the top', 'alignTop'],
    ['middle', 'Line up the chosen nodes on their middle (down)', 'alignMiddle'],
    ['bottom', 'Line up the chosen nodes along the bottom', 'alignBottom'],
  ];

  let simplifying = $state(false);
  let tolerance = $state(2);
  let simplifyError: string | null = $state(null);
  function setTolerance(v: number): string | null {
    if (!(v > 0)) return 'The tolerance must be more than 0 px.';
    tolerance = v;
    return null;
  }
  function simplify(): void {
    simplifyError = anim.simplifyPath(tolerance);
    if (!simplifyError) simplifying = false;
  }
  // A different path closes the Simplify row.
  let lastPath = '';
  $effect(() => {
    if (path.id !== lastPath) {
      lastPath = path.id;
      simplifying = false;
      simplifyError = null;
    }
  });
</script>

<div class="sec" role="group" aria-label="Nodes">
  <h4>Nodes <span class="syl">19.2 nodes</span></h4>
  <p class="hint">
    {chosen.length
      ? `${chosen.length} of ${path.points.length} nodes chosen.`
      : 'Click a node on the stage to choose it.'} Shift-click or drag a box round nodes to choose more;
    arrow keys move them.
  </p>
  {#if one}
    <div class="prop-row">
      <NumField
        label="Node X"
        value={shown(one.x)}
        unit={image.units}
        {decimals}
        commit={(v) => anim.placeNode({ x: typed(v) })}
      />
      <NumField
        label="Node Y"
        value={shown(one.y)}
        unit={image.units}
        {decimals}
        commit={(v) => anim.placeNode({ y: typed(v) })}
      />
    </div>
  {/if}
  <div class="prop-row">
    <span class="prop-label">Type</span>
    <div class="prop-buttons" style:--n="3" role="group" aria-label="Node type">
      {#each TYPES as [type, label, tip] (type)}
        <button
          class="sm"
          aria-pressed={sharedType === type}
          title={withWhy(tip, 'graphicNodes')}
          disabled={chosen.length === 0}
          onclick={() => anim.setNodeType(type)}>{label}</button
        >
      {/each}
    </div>
  </div>
  <div class="prop-row">
    <span class="prop-label">Segment</span>
    <div class="prop-buttons" role="group" aria-label="Segment">
      <button
        class="sm"
        title="Make the segment after each chosen node a straight line"
        disabled={chosen.length === 0 || lastOfOpen}
        onclick={() => anim.segmentsTo('line')}>To line</button
      >
      <button
        class="sm"
        title="Make the segment after each chosen node a curve, with handles to drag"
        disabled={chosen.length === 0 || lastOfOpen}
        onclick={() => anim.segmentsTo('curve')}>To curve</button
      >
    </div>
  </div>
  <div class="prop-buttons" style:--n="6" role="group" aria-label="Align nodes">
    {#each EDGES as [edge, label, icon] (edge)}
      <button
        class="sm"
        aria-label={label}
        title={label}
        disabled={chosen.length < 2}
        onclick={() => anim.alignNodes(edge)}><Icon name={icon} size={14} /></button
      >
    {/each}
  </div>
  <div class="prop-row">
    <span class="prop-label">Space</span>
    <div class="prop-buttons" role="group" aria-label="Distribute nodes">
      <button
        class="sm"
        aria-label="Space the chosen nodes evenly across"
        title="Space three or more chosen nodes evenly from left to right"
        disabled={chosen.length < 3}
        onclick={() => anim.distributeNodes('horizontal')}
        ><Icon name="distributeH" size={14} /> Across</button
      >
      <button
        class="sm"
        aria-label="Space the chosen nodes evenly down"
        title="Space three or more chosen nodes evenly from top to bottom"
        disabled={chosen.length < 3}
        onclick={() => anim.distributeNodes('vertical')}
        ><Icon name="distributeV" size={14} /> Down</button
      >
    </div>
  </div>
  <div class="prop-buttons" style:--n="3" role="group" aria-label="Path">
    <button
      class="sm"
      title="Break the path at the chosen node: a shape opens there, a line becomes two"
      disabled={chosen.length !== 1}
      onclick={() => anim.breakAtNode()}>Break</button
    >
    <button
      class="sm"
      title="Join the two chosen end nodes: the path closes there"
      disabled={!ends}
      onclick={() => anim.joinNodes()}>Join</button
    >
    <button
      class="sm"
      title={path.closed
        ? 'Open the shape: the segment back to its first node goes'
        : 'Close the path: a segment from its last node back to the first'}
      onclick={() => anim.setPathClosed(!path.closed)}>{path.closed ? 'Open' : 'Close'}</button
    >
    <button
      class="sm"
      title="Reverse the path’s direction: its start becomes its end"
      onclick={() => anim.reversePath()}>Reverse</button
    >
    <button
      class="sm"
      title="Delete the chosen nodes (Delete); the curves either side keep the shape as close as they can"
      disabled={chosen.length === 0}
      onclick={() => anim.deleteNodes()}>Delete</button
    >
    <button
      class="sm"
      aria-expanded={simplifying}
      title={withWhy(
        'Fewer nodes, the same look within a tolerance: a brush stroke’s many points become a few smooth curves',
        'graphicNodes',
      )}
      onclick={() => {
        simplifying = !simplifying;
        simplifyError = null;
      }}>Simplify…</button
    >
  </div>
  {#if simplifying}
    <NumField
      label="Tolerance"
      value={tolerance}
      unit="px"
      step={0.5}
      decimals={1}
      commit={setTolerance}
    />
    <div class="prop-buttons">
      <button class="sm" onclick={simplify}>Simplify</button>
      <button class="sm" onclick={() => (simplifying = false)}>Cancel</button>
    </div>
    {#if simplifyError}<p class="error" role="alert">{simplifyError}</p>{/if}
  {/if}
  <Why tool="graphicNodes" />
</div>

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
  .hint {
    margin: 0 0 6px;
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .error {
    margin: 0 0 6px;
    color: var(--danger, #e5484d);
    font-size: 11.5px;
  }
</style>
