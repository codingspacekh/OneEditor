<script lang="ts">
  // G12 (M19): Properties ▸ Fill ▸ Pattern: the tile (weave, checks, stripes, dots, hatching,
  // crosshatch, bricks, or a picture tiled), its colour on a background or see-through between,
  // the size of a tile and its turn. A picture is one in the animation or a file chosen.
  import { TRANSPARENT } from '../../core/animation/rules.ts';
  import type { Paint, PatternName, Picture } from '../../core/animation/types.ts';
  import { PATTERN_LABELS } from '../../core/graphics/patterns.ts';
  import { fileNameOf } from '../../core/project/relocate.ts';
  import Why from '../Why.svelte';
  import ColourField from './ColourField.svelte';
  import NumField from './NumField.svelte';

  type PatternPaint = Extract<Paint, { kind: 'pattern' }>;
  let {
    fill,
    pictures,
    commit,
    choosePicture,
  }: {
    fill: PatternPaint;
    pictures: readonly Picture[];
    commit: (fill: Paint) => string | null;
    /** Picks a picture file to tile; returns why not. */
    choosePicture: () => Promise<string | null>;
  } = $props();

  let error: string | null = $state(null);
  const NAMES = Object.keys(PATTERN_LABELS) as PatternName[];
  const seeThrough = $derived(fill.background === TRANSPARENT);
  const change = (patch: Partial<PatternPaint>) => commit({ ...fill, ...patch });

  async function choose(): Promise<void> {
    error = await choosePicture();
  }

  function setPattern(pattern: PatternName): void {
    error = null;
    if (pattern !== 'picture') {
      const tile: PatternPaint = { ...fill, pattern };
      delete tile.pictureId;
      error = commit(tile);
      return;
    }
    // A picture in the animation is tiled at once; with none, one is chosen from the computer.
    const known = pictures.find((p) => p.id === fill.pictureId) ?? pictures[0];
    if (known) error = change({ pattern, pictureId: known.id });
    else void choose();
  }
</script>

<div class="field">
  <label for="prop-pattern">Pattern</label>
  <select
    id="prop-pattern"
    value={fill.pattern}
    onchange={(e) => setPattern((e.currentTarget as HTMLSelectElement).value as PatternName)}
  >
    {#each NAMES as name (name)}<option value={name}>{PATTERN_LABELS[name]}</option>{/each}
  </select>
</div>
{#if fill.pattern === 'picture'}
  <div class="field">
    <label for="prop-pattern-picture">Tiled picture</label>
    <select
      id="prop-pattern-picture"
      value={fill.pictureId ?? ''}
      onchange={(e) =>
        (error = change({ pictureId: (e.currentTarget as HTMLSelectElement).value }))}
    >
      {#each pictures as p (p.id)}<option value={p.id}>{fileNameOf(p.path)}</option>{/each}
    </select>
  </div>
  <div class="prop-buttons">
    <button class="sm" title="Tile a picture file from the computer" onclick={choose}
      >Choose a picture…</button
    >
  </div>
{:else}
  <ColourField label="Tile colour" value={fill.colour} commit={(c) => change({ colour: c })} />
  <label class="check">
    <input
      type="checkbox"
      checked={seeThrough}
      onchange={(e) =>
        (error = change({
          background: (e.currentTarget as HTMLInputElement).checked ? TRANSPARENT : '#ffffff',
        }))}
    />
    See-through between
  </label>
  {#if !seeThrough}
    <ColourField
      label="Background"
      value={fill.background}
      commit={(c) => change({ background: c })}
    />
  {/if}
{/if}
<div class="prop-row">
  <NumField
    label="Tile size"
    value={fill.size}
    unit="px"
    decimals={1}
    commit={(v) => change({ size: v })}
  />
  <NumField
    label="Tile angle"
    value={fill.angle ?? 0}
    unit="°"
    commit={(v) => change({ angle: v === 0 ? undefined : v })}
  />
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<Why tool="graphicPattern" />

<style>
  /* A label and a menu or box in a row of its own: on the property grid (props.css), the control
     across the field columns. */
  .field {
    display: grid;
    grid-template-columns: var(--prop-cols);
    column-gap: var(--prop-gap-x);
    align-items: center;
    margin-bottom: var(--prop-gap-y);
    min-width: 0;
  }
  .field > :not(label) {
    grid-column: 2 / -1;
    min-width: 0;
  }
  :global(.prop-row) > .field {
    display: contents;
  }
  :global(.prop-row) > .field > :not(label) {
    grid-column: auto;
  }
  .field label,
  .check {
    color: var(--tx-2);
    font-size: 12px;
  }
  select {
    width: 100%;
    justify-content: safe flex-end;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
  }
  .error {
    margin: 0 0 6px;
    color: var(--danger);
    font-size: 11.5px;
  }
</style>
