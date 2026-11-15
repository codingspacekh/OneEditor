<svelte:options namespace="svg" />

<script lang="ts">
  // GV4, G3 (M19): a perspective's four corners, or a custom envelope's corners and the control
  // points of its four sides, on the stage (inside its overlay), shown instead of the box's
  // handles: drag one and the object bends with it as it moves; it is one undo step when let go.
  import type { Point } from '../../core/animation/geometry.ts';
  import type { AnimObject, Envelope, Id } from '../../core/animation/types.ts';
  import {
    draggedTo,
    fractionAt,
    gripsOf,
    sidesPath,
    type EnvelopeGrip,
  } from './envelope-handles.ts';

  let {
    object,
    size,
    at,
    onpreview,
    oncommit,
  }: {
    /** The object as it looks now (during a drag too), with its perspective or custom envelope. */
    object: AnimObject & { envelope: Envelope };
    /** A handle's size, in stage pixels. */
    size: number;
    /** The stage point under the pointer. */
    at: (e: { clientX: number; clientY: number }) => Point;
    /** The object's envelope while dragging (null: the drag is over). */
    onpreview: (bending: { id: Id; envelope: Envelope } | null) => void;
    oncommit: (id: Id, envelope: Envelope) => void;
  } = $props();

  function start(e: PointerEvent, grip: EnvelopeGrip): void {
    e.stopPropagation();
    // The object as it was when the drag began: each move goes from there.
    const from = object;
    let now: Envelope | null = null;
    const move = (m: PointerEvent) => {
      const f = fractionAt(from, at(m));
      if (!f) return;
      now = draggedTo(from.envelope, grip, f);
      onpreview({ id: from.id, envelope: now });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onpreview(null);
      if (now) oncommit(from.id, now);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
</script>

<path class="sides" d={sidesPath(object)} vector-effect="non-scaling-stroke" />
{#each gripsOf(object) as g (g.label)}
  {#if g.from}
    <line
      class="arm"
      x1={g.from.x}
      y1={g.from.y}
      x2={g.at.x}
      y2={g.at.y}
      vector-effect="non-scaling-stroke"
    />
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <circle
      class="handle control"
      cx={g.at.x}
      cy={g.at.y}
      r={size / 2.5}
      vector-effect="non-scaling-stroke"
      aria-label={g.label}
      onpointerdown={(e) => start(e, g.grip)}
    >
      <title>Drag to bend this side</title>
    </circle>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <rect
      class="handle corner"
      x={g.at.x - size / 2}
      y={g.at.y - size / 2}
      width={size}
      height={size}
      vector-effect="non-scaling-stroke"
      aria-label={g.label}
      onpointerdown={(e) => start(e, g.grip)}
    >
      <title>Drag to move this corner</title>
    </rect>
  {/if}
{/each}

<style>
  .sides {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1;
    stroke-dasharray: 4 3;
    pointer-events: none;
  }
  .arm {
    stroke: var(--accent);
    stroke-width: 1;
    stroke-dasharray: 3 2;
    pointer-events: none;
  }
  .handle {
    fill: #fff;
    stroke: var(--accent);
    stroke-width: 1;
  }
  .handle.corner {
    fill: var(--accent);
    stroke: #fff;
    cursor: move;
  }
  .handle.control {
    cursor: crosshair;
  }
</style>
