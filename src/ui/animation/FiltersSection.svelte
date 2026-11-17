<script lang="ts">
  // G14 (M19): Properties ▸ Filters — shadow, glow, bevel and blur on the selected objects, in
  // Graphics and Animation mode (not AN20's one-click Effects, which add keyframes). Filters are
  // drawn in order, each on what the ones before made: added from a list, their numbers and
  // colours typed, moved up or down, removed. Each change is one undo step. G14 (M22): the same
  // for the current pixel layer's effects (Graphics mode, nothing selected), with the gate's
  // effects one click away: a glow (the halo, the light blooms), a drop shadow, a bevel.
  import { FILTER_KINDS, FILTER_LABELS, newFilter } from '../../core/animation/appearance.ts';
  import type { FilterKind, ObjectFilter } from '../../core/animation/types.ts';
  import Why from '../Why.svelte';
  import ColourField from './ColourField.svelte';
  import NumField from './NumField.svelte';

  let {
    filters,
    commit,
    heading = 'Filters',
    owner = 'the selected objects',
    quick = false,
  }: {
    filters: readonly ObjectFilter[];
    /** Sets the selected objects' filters (none: an empty list); returns why not. */
    commit: (filters: ObjectFilter[] | undefined) => string | null;
    /** M22: the section's name ("Effects on Moon"). */
    heading?: string;
    /** M22: what is given the filters, in the buttons' tips ("the layer"). */
    owner?: string;
    /** M22: a button each for a glow, a drop shadow and a bevel. */
    quick?: boolean;
  } = $props();
  /** M22: the effects the papers ask for most, added in one click. */
  const QUICK: { kind: FilterKind; label: string; tip: string }[] = [
    { kind: 'glow', label: 'Glow', tip: 'A soft colour all round: a halo, a light bloom' },
    { kind: 'dropShadow', label: 'Shadow', tip: 'A drop shadow, below and to the right' },
    { kind: 'bevel', label: 'Bevel', tip: 'Raised edges, lit from the top left: depth, metal' },
    // G10 (M23): M/21's globe outline round the map clipped into it.
    {
      kind: 'stroke',
      label: 'Stroke',
      tip: 'An outline round what is drawn: outside, centred or inside',
    },
  ];

  let adding: FilterKind = $state('dropShadow');
  let error: string | null = $state(null);

  const put = (list: ObjectFilter[]) => (error = commit(list.length ? list : undefined));
  /** One filter's numbers changed. */
  const edit =
    <F extends ObjectFilter>(i: number) =>
    (patch: Partial<F>): string | null =>
      commit(filters.map((f, k) => (k === i ? ({ ...f, ...patch } as ObjectFilter) : f)));
  function move(i: number, by: -1 | 1): void {
    const list = [...filters];
    const [f] = list.splice(i, 1);
    list.splice(i + by, 0, f!);
    put(list);
  }
  const nameOf = (i: number) =>
    filters.filter((f) => f.kind === filters[i]!.kind).length > 1
      ? `${FILTER_LABELS[filters[i]!.kind]} ${filters.slice(0, i + 1).filter((f) => f.kind === filters[i]!.kind).length}`
      : FILTER_LABELS[filters[i]!.kind];
</script>

<div class="sec filters">
  <h4>{heading} <span class="syl">shadow, glow, bevel, stroke, blur</span></h4>
  {#each filters as f, i (i)}
    {@const name = nameOf(i)}
    <div class="filter" role="group" aria-label={name}>
      <div class="head">
        <span class="name">{name}</span>
        <button
          class="sm"
          aria-label="Move {name} up"
          title="Draw it before the filter above"
          disabled={i === 0}
          onclick={() => move(i, -1)}>↑</button
        >
        <button
          class="sm"
          aria-label="Move {name} down"
          title="Draw it after the filter below"
          disabled={i === filters.length - 1}
          onclick={() => move(i, 1)}>↓</button
        >
        <button
          class="sm"
          aria-label="Remove {name}"
          title="Take this filter off"
          onclick={() => put(filters.filter((_, k) => k !== i))}>Remove</button
        >
      </div>
      {#if f.kind === 'dropShadow' || f.kind === 'innerShadow'}
        {@const set = edit<typeof f>(i)}
        <ColourField label="Colour" value={f.colour} commit={(c) => set({ colour: c })} />
        <div class="prop-row">
          <NumField
            label="Across"
            value={f.dx}
            unit="px"
            decimals={1}
            commit={(v) => set({ dx: v })}
          />
          <NumField
            label="Down"
            value={f.dy}
            unit="px"
            decimals={1}
            commit={(v) => set({ dy: v })}
          />
          <NumField
            label="Blur"
            value={f.blur}
            unit="px"
            decimals={1}
            commit={(v) => set({ blur: v })}
          />
          <NumField
            label="Opacity"
            value={f.opacity}
            unit="%"
            commit={(v) => set({ opacity: v })}
          />
        </div>
      {:else if f.kind === 'glow'}
        {@const set = edit<typeof f>(i)}
        <ColourField label="Colour" value={f.colour} commit={(c) => set({ colour: c })} />
        <div class="prop-row">
          <NumField
            label="Blur"
            value={f.blur}
            unit="px"
            decimals={1}
            commit={(v) => set({ blur: v })}
          />
          <NumField
            label="Opacity"
            value={f.opacity}
            unit="%"
            commit={(v) => set({ opacity: v })}
          />
        </div>
      {:else if f.kind === 'bevel'}
        {@const set = edit<typeof f>(i)}
        <div class="prop-row">
          <NumField
            label="Depth"
            value={f.depth}
            unit="px"
            decimals={1}
            commit={(v) => set({ depth: v })}
          />
          <NumField
            label="Soften"
            value={f.blur}
            unit="px"
            decimals={1}
            commit={(v) => set({ blur: v })}
          />
          <NumField label="Light from" value={f.angle} unit="°" commit={(v) => set({ angle: v })} />
          <NumField
            label="Opacity"
            value={f.opacity}
            unit="%"
            commit={(v) => set({ opacity: v })}
          />
        </div>
        <ColourField label="Light" value={f.light} commit={(c) => set({ light: c })} />
        <ColourField label="Shade" value={f.shadow} commit={(c) => set({ shadow: c })} />
        <p class="hint">Light from 90° is from above, 135° from the top left.</p>
      {:else if f.kind === 'stroke'}
        {@const set = edit<typeof f>(i)}
        <ColourField label="Colour" value={f.colour} commit={(c) => set({ colour: c })} />
        <div class="prop-row">
          <NumField
            label="Width"
            value={f.width}
            unit="px"
            decimals={1}
            commit={(v) => set({ width: v })}
          />
          <NumField
            label="Opacity"
            value={f.opacity}
            unit="%"
            commit={(v) => set({ opacity: v })}
          />
        </div>
        <div class="prop-row">
          <label for="stroke-lies-{i}">Lies</label>
          <select
            id="stroke-lies-{i}"
            value={f.position}
            onchange={(e) =>
              (error = set({
                position: (e.currentTarget as HTMLSelectElement).value as typeof f.position,
              }))}
          >
            <option value="outside">Outside the edge</option>
            <option value="centred">Centred on the edge</option>
            <option value="inside">Inside the edge</option>
          </select>
        </div>
      {:else}
        {@const set = edit<typeof f>(i)}
        <NumField
          label="Radius"
          value={f.radius}
          unit="px"
          decimals={1}
          commit={(v) => set({ radius: v })}
        />
      {/if}
    </div>
  {/each}
  {#if quick}
    <!-- One even row, the names alone (issues/graphics-1.png: a "+" above each name wrapped). -->
    <div class="prop-buttons" style:--n={QUICK.length} role="group" aria-label="Add quickly">
      {#each QUICK as q (q.kind)}
        <button
          class="sm"
          aria-label="Add {q.label.toLowerCase()}"
          title="{q.tip}, on {owner}"
          onclick={() => put([...filters, newFilter(q.kind)])}>{q.label}</button
        >
      {/each}
    </div>
  {/if}
  <div class="prop-row add">
    <label for="filter-kind">Add</label>
    <select id="filter-kind" bind:value={adding}>
      {#each FILTER_KINDS as kind (kind)}<option value={kind}>{FILTER_LABELS[kind]}</option>{/each}
    </select>
    <button
      class="sm"
      title="Give {owner} this filter, drawn after the ones there are"
      onclick={() => put([...filters, newFilter(adding)])}>Add filter</button
    >
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <Why tool="graphicFilters" />
</div>

<style>
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
  /* A filter: set apart by a line above, not boxed in (its fields stay on the grid's columns). */
  .filter {
    padding-top: 6px;
    margin-bottom: 6px;
    border-top: 1px dashed var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 6px;
  }
  .name {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--tx-1);
  }
  /* Add [menu] [Add filter]: the menu in columns 2–3, the button in 4. */
  .add > select {
    grid-column: 2 / 4;
  }
  .add > button {
    grid-column: 4;
    justify-content: center;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  select {
    width: 100%;
    justify-content: safe flex-end;
  }
  .hint {
    margin: 0 0 4px;
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .error {
    margin: 0 0 6px;
    color: var(--danger);
    font-size: 11.5px;
  }
</style>
