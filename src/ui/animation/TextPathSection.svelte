<script lang="ts">
  // GT2, GT3 (M20): text on a path and in a shape, in the Properties panel of Graphics and
  // Animation modes. With one text and one shape or path selected: *Put on path* (the words follow
  // its outline; the shape is used up, its outline hidden unless "Show the path" is ticked) and
  // *Put in shape* (the lines wrap inside a closed shape, which stays). With a text on a path:
  // where the words start, which side of the outline they are on (outside, inside, or centred:
  // "each letter halfway through the outline"), Flip, whether the path is shown (its colour and
  // width), and *Take off path*. A text in a shape has its own section (TextShapeSection).
  import type { App } from '../../app/app.ts';
  import { DEFAULT_STROKE } from '../../core/animation/factory.ts';
  import { isClosed, isShape } from '../../core/animation/geometry.ts';
  import type { AnimObject, TextObject, TextPath, TextSide } from '../../core/animation/types.ts';
  import { withWhy } from '../../core/effects/help.ts';
  import Why from '../Why.svelte';
  import ColourField from './ColourField.svelte';
  import { editorOf } from './editor.ts';
  import { textBox } from './measure.ts';
  import NumField from './NumField.svelte';
  import TextShapeSection from './TextShapeSection.svelte';

  let { app, objects }: { app: App; objects: readonly AnimObject[] } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);

  const SIDES: [TextSide, string][] = [
    // G12: outside or inside a shape (above or under a line as drawn), flipped or not.
    ['outside', 'Outside the shape (above a line)'],
    ['inside', 'Inside the shape (under a line)'],
    ['centred', 'Centred: through the letters'],
  ];

  /** The one text selected, if that is all that is. */
  const text = $derived(
    objects.length === 1 && objects[0]!.kind === 'text' ? (objects[0] as TextObject) : null,
  );
  /** A text and a shape selected together, to be put one on (or in) the other. */
  const shape = $derived(
    objects.length === 2 && objects.some((o) => o.kind === 'text')
      ? (objects.find((o) => o.kind !== 'text' && isShape(o)) ?? null)
      : null,
  );
  let show = $state(false);
  let error: string | null = $state(null);

  const setPath = (path: TextPath, change: Partial<TextPath>): string | null =>
    anim.setProperties({ path: { ...path, ...change } } as Partial<AnimObject>);
  /** Shown with a plain outline, or hidden (it keeps nothing: "do not show the path"). */
  function showPath(path: TextPath, on: boolean): void {
    const next = { ...path };
    if (on) next.stroke = { ...DEFAULT_STROKE };
    else delete next.stroke;
    error = anim.setProperties({ path: next } as Partial<AnimObject>);
  }
  const takeOff = () => (error = anim.takeOffOutline((t) => textBox(t)));
</script>

{#if shape}
  <div class="sec">
    <h4>Text on a path <span class="syl">19.5 fitting text to path or shape</span></h4>
    <label class="check">
      <input type="checkbox" bind:checked={show} />
      Show the path (with the shape’s outline)
    </label>
    <div class="cells two-up">
      <button
        class="sm"
        title={withWhy(
          'Make the words follow the outline of the selected shape or path',
          'textPath',
        )}
        onclick={() => (error = anim.putOnPath(show))}>Put on path</button
      >
      <button
        class="sm"
        title={withWhy('Wrap the lines of the words inside the selected closed shape', 'textShape')}
        disabled={!isClosed(shape)}
        onclick={() => (error = anim.putInShape())}>Put in shape</button
      >
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <Why tool="textPath" />
  </div>
{:else if text?.path}
  {@const path = text.path}
  <div class="sec">
    <h4>On a path <span class="syl">19.5 fitting text to path or shape</span></h4>
    <NumField
      label="Start"
      value={path.start}
      unit="%"
      decimals={1}
      commit={(v) => setPath(path, { start: v })}
    />
    <div class="field">
      <label for="path-side">Side</label>
      <select
        id="path-side"
        value={path.side}
        onchange={(e) =>
          (error = setPath(path, {
            side: (e.currentTarget as HTMLSelectElement).value as TextSide,
          }))}
      >
        {#each SIDES as [side, label] (side)}<option value={side}>{label}</option>{/each}
      </select>
    </div>
    <label class="check">
      <input
        type="checkbox"
        checked={path.flip ?? false}
        onchange={(e) => {
          const next = { ...path };
          if ((e.currentTarget as HTMLInputElement).checked) next.flip = true;
          else delete next.flip;
          error = anim.setProperties({ path: next } as Partial<AnimObject>);
        }}
      />
      Flip: run the other way round
    </label>
    <label class="check">
      <input
        type="checkbox"
        checked={!!path.stroke}
        onchange={(e) => showPath(path, (e.currentTarget as HTMLInputElement).checked)}
      />
      Show the path
    </label>
    {#if path.stroke}
      {@const stroke = path.stroke}
      <ColourField
        label="Path colour"
        value={stroke.colour}
        commit={(colour) => setPath(path, { stroke: { ...stroke, colour } })}
      />
      <NumField
        label="Path width"
        value={stroke.width}
        unit="px"
        decimals={1}
        commit={(width) => setPath(path, { stroke: { ...stroke, width } })}
      />
    {:else}
      <p class="hint">The path is hidden: only the words show its shape.</p>
    {/if}
    <button class="sm" title="Make the words a straight line again" onclick={takeOff}
      >Take off path</button
    >
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <Why tool="textPath" />
  </div>
{:else if text?.inShape}
  <TextShapeSection {app} {text} inShape={text.inShape} />
{/if}

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
  .field {
    display: grid;
    grid-template-columns: 58px 1fr;
    align-items: center;
    gap: 3px 6px;
    margin-bottom: 6px;
    min-width: 0;
  }
  .field label {
    color: var(--tx-2);
    font-size: 12px;
  }
  select {
    width: 100%;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    color: var(--tx-2);
    font-size: 12px;
  }
  .cells {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .cells.two-up {
    grid-template-columns: repeat(2, 1fr);
  }
  button {
    justify-content: center;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
