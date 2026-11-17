<script lang="ts">
  // M22 (GB5, D8): the retouching tools' options in Properties (Graphics mode), shown while one of
  // them is chosen: for the clone stamp and the heal brush the source (Alt-click, Option-click on
  // a Mac), Aligned and what is copied from; for every retouching brush its size, hardness,
  // opacity (clone and heal) or strength (blur, sharpen, smudge) and spacing; for red eye the
  // pupil size and how much it darkens.
  import type { App } from '../../app/app.ts';
  import {
    DEFAULT_RETOUCH,
    isRetouchBrushTool,
    isStrengthTool,
  } from '../../core/graphics/pixels/retouch-options.ts';
  import Why from '../Why.svelte';
  import NumField from '../animation/NumField.svelte';
  import { editorOf } from '../animation/editor.ts';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);

  const tool = $derived($store.tool);
  const shown = $derived(isRetouchBrushTool(tool) || tool === 'red-eye');
  const options = $derived($store.retouch ?? DEFAULT_RETOUCH);
  const brush = $derived(isRetouchBrushTool(tool) ? options.brushes[tool] : null);
  const copies = $derived(tool === 'clone' || tool === 'heal');

  const TITLES: Record<string, string> = {
    clone: 'Clone stamp',
    heal: 'Heal',
    'blur-brush': 'Blur brush',
    'sharpen-brush': 'Sharpen brush',
    smudge: 'Smudge',
    'red-eye': 'Red eye',
  };
  const HINTS: Record<string, string> = {
    clone:
      'Alt-click (Option-click on a Mac) a clean place to copy from, then paint over what to remove. The cross shows where the pixels come from.',
    heal: 'Alt-click (Option-click on a Mac) a clean place to copy from, then paint over what to remove, a little beyond its edge: when you let go, the colour and light are matched to the surroundings. Best on sky, sea, sand and walls; on busy textures use the clone stamp. A selection round the part keeps the heal from borrowing colour from what is next to it.',
    'blur-brush': 'Paint over the places to soften; go over again to soften more.',
    'sharpen-brush': 'Paint over the places to bring out detail; too much shows bright edges.',
    smudge: 'Drag from a colour into its neighbour to smear it, as a finger in wet paint.',
    'red-eye':
      'Click the middle of a red eye, or drag a box over it: only the red inside is made dark and grey.',
  };
</script>

{#if shown && editor.still}
  <div class="sec retouch">
    <h4>
      {TITLES[tool]}
      <span class="syl">19.3 tools/filters to alter parts of an image</span>
    </h4>
    {#if copies}
      <p class="source" data-testid="clone-source">
        {#if options.source}
          Copying from {options.source.x}, {options.source.y}
        {:else}
          No source yet: Alt-click (Option-click) the place to copy from.
        {/if}
      </p>
      <label class="check">
        <input
          type="checkbox"
          checked={options.aligned}
          onchange={(e) =>
            anim.setRetouch({ aligned: (e.currentTarget as HTMLInputElement).checked })}
        /> Aligned: each stroke keeps the same distance from the source
      </label>
      <div class="field">
        <label for="retouch-sample">Copy from</label>
        <select
          id="retouch-sample"
          value={options.sample}
          onchange={(e) =>
            anim.setRetouch({
              sample: (e.currentTarget as HTMLSelectElement).value as 'layer' | 'all',
            })}
        >
          <option value="layer">This layer</option>
          <option value="all">All visible layers</option>
        </select>
      </div>
    {/if}
    {#if brush}
      <div class="prop-row">
        <NumField
          label="Size"
          value={brush.size}
          unit="px"
          commit={(v) => anim.setRetouchBrush({ size: v })}
        />
        <NumField
          label="Hardness"
          value={brush.hardness}
          unit="%"
          commit={(v) => anim.setRetouchBrush({ hardness: v })}
        />
        {#if isStrengthTool(tool)}
          <NumField
            label="Strength"
            value={options.strength[tool]}
            unit="%"
            commit={(v) => anim.setRetouch({ strength: { [tool]: v } })}
          />
        {:else}
          <NumField
            label="Opacity"
            value={brush.opacity}
            unit="%"
            commit={(v) => anim.setRetouchBrush({ opacity: v })}
          />
        {/if}
        <NumField
          label="Spacing"
          value={brush.spacing}
          unit="%"
          commit={(v) => anim.setRetouchBrush({ spacing: v })}
        />
      </div>
    {:else}
      <div class="prop-row">
        <NumField
          label="Pupil size"
          value={options.pupilSize}
          unit="px"
          commit={(v) => anim.setRetouch({ pupilSize: v })}
        />
        <NumField
          label="Darken"
          value={options.darken}
          unit="%"
          commit={(v) => anim.setRetouch({ darken: v })}
        />
      </div>
    {/if}
    {#if $store.editingMask && tool !== 'red-eye'}
      <p class="hint">On the layer mask: the mask’s greys are copied, blurred or smudged.</p>
    {/if}
    <p class="hint">{HINTS[tool]}</p>
    <Why tool={copies ? 'graphicClone' : 'graphicRetouch'} />
  </div>
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
  .field label,
  .check {
    color: var(--tx-2);
    font-size: 12px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  select {
    width: 100%;
  }
  .source {
    margin: 0 0 6px;
    color: var(--tx-2);
    font-size: 12px;
  }
  .hint {
    margin: 6px 0;
    color: var(--tx-3);
    font-size: 11.5px;
  }
</style>
