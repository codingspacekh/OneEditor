<script lang="ts">
  // G14 (M19): Properties ▸ Filters — shadow, glow, bevel and blur on the selected objects, in
  // Graphics and Animation mode (not AN20's one-click Effects, which add keyframes). Filters are
  // drawn in order, each on what the ones before made: added from a list, their numbers and
  // colours typed, moved up or down, removed. Each change is one undo step.
  import { FILTER_KINDS, FILTER_LABELS, newFilter } from '../../core/animation/appearance.ts';
  import type { FilterKind, ObjectFilter } from '../../core/animation/types.ts';
  import Why from '../Why.svelte';
  import ColourField from './ColourField.svelte';
  import NumField from './NumField.svelte';

  let {
    filters,
    commit,
  }: {
    filters: readonly ObjectFilter[];
    /** Sets the selected objects' filters (none: an empty list); returns why not. */
    commit: (filters: ObjectFilter[] | undefined) => string | null;
  } = $props();

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
  <h4>Filters <span class="syl">shadow, glow, bevel, blur</span></h4>
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
        <div class="two">
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
        <div class="two">
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
        <div class="two">
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
  <div class="add">
    <label for="filter-kind" class="cap">Add</label>
    <select id="filter-kind" bind:value={adding}>
      {#each FILTER_KINDS as kind (kind)}<option value={kind}>{FILTER_LABELS[kind]}</option>{/each}
    </select>
    <button
      class="sm"
      title="Give the selected objects this filter, drawn after the ones they have"
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
  .filter {
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 6px;
    margin-bottom: 6px;
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
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 8px;
  }
  .add {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .cap {
    color: var(--tx-2);
    font-size: 12px;
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
