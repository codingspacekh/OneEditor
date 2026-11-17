<script lang="ts">
  // GV1 (M19): the Arc part of an ellipse's Properties: only part of the ellipse, from its start
  // to its end (degrees clockwise, 0 at the right), left open (a meter's scale), closed to the
  // centre (a pie slice: J/24's cake) or straight across (a chord); or the whole ellipse again.
  import type { App } from '../../app/app.ts';
  import type { AnimObject, ArcClose, EllipseObject } from '../../core/animation/types.ts';
  import Why from '../Why.svelte';
  import { editorOf } from './editor.ts';
  import NumField from './NumField.svelte';

  let { app, ellipse }: { app: App; ellipse: EllipseObject } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);

  /** A filled ellipse made an arc: three quarters, a slice cut out of the top right. */
  const FIRST_ARC: NonNullable<EllipseObject['arc']> = { start: 0, end: 270, close: 'pie' };
  const CLOSES: [ArcClose, string][] = [
    ['open', 'Open: just the line'],
    ['pie', 'Pie slice: to the centre'],
    ['chord', 'Chord: straight across'],
  ];
  let error: string | null = $state(null);
  const arc = $derived(ellipse.arc);
  /** The menu's and buttons' changes (a number box shows its own refusal). */
  const setArc = (next: EllipseObject['arc']): string | null =>
    (error = anim.setProperties({ arc: next } as Partial<AnimObject>));
</script>

<div class="sec">
  <h4>Arc <span class="syl">19.2 arcs</span></h4>
  {#if arc}
    <div class="prop-row">
      <NumField
        label="Start"
        value={arc.start}
        unit="°"
        commit={(v) => anim.setProperties({ arc: { ...arc, start: v } } as Partial<AnimObject>)}
      />
      <NumField
        label="End"
        value={arc.end}
        unit="°"
        commit={(v) => anim.setProperties({ arc: { ...arc, end: v } } as Partial<AnimObject>)}
      />
    </div>
    <div class="field">
      <label for="arc-close">Closed</label>
      <select
        id="arc-close"
        value={arc.close}
        onchange={(e) =>
          setArc({ ...arc, close: (e.currentTarget as HTMLSelectElement).value as ArcClose })}
      >
        {#each CLOSES as [close, label] (close)}<option value={close}>{label}</option>{/each}
      </select>
    </div>
    <p class="hint">Degrees clockwise from the right: 180 to 360 is the top half.</p>
    <div class="prop-buttons">
      <button class="sm" title="Draw the whole ellipse again" onclick={() => setArc(undefined)}
        >Whole ellipse</button
      >
    </div>
  {:else}
    <p class="hint">Only part of the ellipse: a meter's scale, a slice of cake.</p>
    <!-- A lone button fills the row (issues/graphics-4.png). -->
    <div class="prop-buttons">
      <button class="sm" title="Draw only part of the ellipse" onclick={() => setArc(FIRST_ARC)}
        >Make an arc</button
      >
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <Why tool="graphicShapes" />
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
  .field label {
    color: var(--tx-2);
    font-size: 12px;
  }
  select {
    width: 100%;
    justify-content: safe flex-end;
  }
  .hint {
    margin: 0 0 6px;
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .error {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
