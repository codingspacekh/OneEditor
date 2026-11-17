<script lang="ts">
  // M21 step 4 (GB4, GB3): the painting tools' options in Properties (Graphics mode), shown while
  // one of them is chosen: the foreground and background colours (swap, black and white); for the
  // paintbrush, pencil, eraser and airbrush their brush — a preset (built in or saved), size,
  // hardness, opacity, flow, spacing, shape, pen pressure — and saving it as a preset; for the
  // paint bucket its tolerance, contiguous and opacity; for the gradient linear or radial, its
  // opacity and the colours between the foreground and the background.
  import type { App } from '../../app/app.ts';
  import { addStop, changeStop, removeStop } from '../../core/animation/gradient.ts';
  import type { GradientStop, Paint } from '../../core/animation/types.ts';
  import { BRUSH_SHAPES, type BrushShape } from '../../core/graphics/pixels/brush.ts';
  import {
    BUILT_IN_PRESETS,
    DEFAULT_PAINT,
    isBrushTool,
    type BrushPreset,
  } from '../../core/graphics/pixels/presets.ts';
  import Why from '../Why.svelte';
  import ColourField from '../animation/ColourField.svelte';
  import NumField from '../animation/NumField.svelte';
  import { editorOf } from '../animation/editor.ts';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);
  const saved = $derived(app.brushPresets.store);

  const tool = $derived($store.tool);
  const painting = $derived(isBrushTool(tool) || tool === 'bucket' || tool === 'gradient');
  const options = $derived($store.paint ?? DEFAULT_PAINT);
  const brush = $derived(isBrushTool(tool) ? options.brushes[tool] : null);

  const TITLES: Record<string, string> = {
    paintbrush: 'Paintbrush',
    pencil: 'Pencil',
    eraser: 'Eraser',
    airbrush: 'Airbrush',
    bucket: 'Paint bucket',
    gradient: 'Gradient',
  };
  const SHAPES: Record<BrushShape, string> = {
    round: 'Round',
    square: 'Square',
    star: 'Star',
    scatter: 'Scatter (stars, lights)',
  };

  let error: string | null = $state(null);
  let presetName = $state('');
  let chosen = $state('');
  /** The presets (each chooses its own tool): the built-in ones, then the student's. */
  const presets = $derived({ builtIn: BUILT_IN_PRESETS, mine: $saved });
  const findPreset = (key: string): BrushPreset | undefined => {
    const [kind, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    return (kind === 'mine' ? $saved : BUILT_IN_PRESETS).find((p) => p.name === name);
  };
  function choosePreset(key: string): void {
    chosen = key;
    const p = findPreset(key);
    if (p) anim.applyBrushPreset(p);
  }
  async function savePreset(): Promise<void> {
    if (!brush || !isBrushTool(tool)) return;
    try {
      await app.brushPresets.save({ name: presetName, tool, brush });
      chosen = `mine:${presetName.trim()}`;
      presetName = '';
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  async function deletePreset(): Promise<void> {
    const name = chosen.slice('mine:'.length);
    await app.brushPresets.remove(name);
    chosen = '';
  }

  /** The gradient as a fill (foreground → background through the stops), for its editor. */
  const asPaint = $derived<Extract<Paint, { kind: 'linear' }>>({
    kind: 'linear',
    from: options.foreground,
    to: options.background,
    angle: 0,
    stops: options.gradient.stops,
  });
  const setStops = (paint: { stops?: GradientStop[] }) =>
    anim.setGradientTool({ stops: paint.stops ?? [] });
</script>

{#if painting && editor.still}
  <div class="sec paint">
    <h4>
      {TITLES[tool]}
      <span class="syl"
        >{isBrushTool(tool)
          ? '19.3 brush, pencil and pen tools'
          : '19.1 changing solid and gradient fills'}</span
      >
    </h4>
    <ColourField
      label="Colour"
      value={options.foreground}
      commit={(c) => anim.setPaintColours({ foreground: c })}
    />
    <ColourField
      label="Background"
      value={options.background}
      commit={(c) => anim.setPaintColours({ background: c })}
    />
    <div class="prop-buttons">
      <button
        class="sm"
        title="Swap the colour and the background colour (X)"
        onclick={() => anim.swapPaintColours()}>Swap</button
      >
      <button
        class="sm"
        title="Black, on a white background colour (D)"
        onclick={() => anim.resetPaintColours()}>Black and white</button
      >
    </div>
    {#if $store.editingMask}
      <p class="hint">On the layer mask: black hides, white shows, grey shows partly.</p>
    {/if}

    {#if brush}
      <div class="field">
        <label for="paint-preset">Preset</label>
        <select
          id="paint-preset"
          value={chosen}
          onchange={(e) => choosePreset((e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="">Choose a preset…</option>
          <optgroup label="Built in">
            {#each presets.builtIn as p (p.name)}
              <option value="built:{p.name}">{p.name}</option>
            {/each}
          </optgroup>
          {#if presets.mine.length}
            <optgroup label="Saved">
              {#each presets.mine as p (p.name)}
                <option value="mine:{p.name}">{p.name}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
      </div>
      <div class="prop-row">
        <NumField
          label="Size"
          value={brush.size}
          unit="px"
          commit={(v) => anim.setBrush({ size: v })}
        />
        {#if tool !== 'pencil'}
          <NumField
            label="Hardness"
            value={brush.hardness}
            unit="%"
            commit={(v) => anim.setBrush({ hardness: v })}
          />
        {/if}
        <NumField
          label="Opacity"
          value={brush.opacity}
          unit="%"
          commit={(v) => anim.setBrush({ opacity: v })}
        />
        <NumField
          label="Flow"
          value={brush.flow}
          unit="%"
          commit={(v) => anim.setBrush({ flow: v })}
        />
        <NumField
          label="Spacing"
          value={brush.spacing}
          unit="%"
          commit={(v) => anim.setBrush({ spacing: v })}
        />
      </div>
      <div class="field">
        <label for="paint-shape">Shape</label>
        <select
          id="paint-shape"
          value={brush.shape}
          onchange={(e) =>
            (error = anim.setBrush({
              shape: (e.currentTarget as HTMLSelectElement).value as BrushShape,
            }))}
        >
          {#each BRUSH_SHAPES as s (s)}
            <option value={s}>{SHAPES[s]}</option>
          {/each}
        </select>
      </div>
      <div class="checks">
        <label class="check">
          <input
            type="checkbox"
            checked={brush.pressureSize}
            onchange={(e) =>
              anim.setBrush({ pressureSize: (e.currentTarget as HTMLInputElement).checked })}
          /> Pen pressure: size
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={brush.pressureFlow}
            onchange={(e) =>
              anim.setBrush({ pressureFlow: (e.currentTarget as HTMLInputElement).checked })}
          /> Pen pressure: flow
        </label>
      </div>
      <!-- The name in columns 2–3, Save in 4. -->
      <div class="prop-row save">
        <label for="paint-preset-name">Save as</label>
        <input
          id="paint-preset-name"
          type="text"
          placeholder="Preset name"
          bind:value={presetName}
        />
        <button class="sm" disabled={presetName.trim() === ''} onclick={savePreset}>Save</button>
      </div>
      {#if chosen.startsWith('mine:')}
        <div class="prop-buttons">
          <button class="sm" onclick={deletePreset}>Delete the preset</button>
        </div>
      {/if}
      <p class="hint">
        Drag on the image to paint; Shift-click draws a straight line from where the last stroke
        ended. [ and ] make the brush smaller and bigger.
      </p>
      <Why tool="graphicPaint" />
    {:else if tool === 'bucket'}
      <div class="prop-row">
        <NumField
          label="Tolerance"
          value={options.bucket.tolerance}
          commit={(v) => anim.setBucket({ tolerance: v })}
        />
        <NumField
          label="Opacity"
          value={options.bucket.opacity}
          unit="%"
          commit={(v) => anim.setBucket({ opacity: v })}
        />
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked={options.bucket.contiguous}
          onchange={(e) =>
            anim.setBucket({ contiguous: (e.currentTarget as HTMLInputElement).checked })}
        /> Contiguous: only the pixels joined to the one clicked
      </label>
      <p class="hint">Click the area to fill with the colour.</p>
      <Why tool="graphicFill" />
    {:else}
      <div class="field">
        <label for="paint-gradient-kind">Type</label>
        <select
          id="paint-gradient-kind"
          value={options.gradient.kind}
          onchange={(e) =>
            anim.setGradientTool({
              kind: (e.currentTarget as HTMLSelectElement).value as 'linear' | 'radial',
            })}
        >
          <option value="linear">Linear: along the line</option>
          <option value="radial">Radial: out from the line’s start</option>
        </select>
      </div>
      <NumField
        label="Opacity"
        value={options.gradient.opacity}
        unit="%"
        commit={(v) => anim.setGradientTool({ opacity: v })}
      />
      {#each options.gradient.stops as stop, i (i)}
        <div class="stop">
          <ColourField
            label="Colour {i + 2}"
            value={stop.colour}
            commit={(c) => setStops(changeStop(asPaint, i, { colour: c }))}
          />
          <div class="prop-row">
            <NumField
              label="At"
              value={stop.at}
              unit="%"
              commit={(v) =>
                v < 0 || v > 100
                  ? 'Between 0 and 100 %.'
                  : setStops(changeStop(asPaint, i, { at: v }))}
            />
            <button
              class="sm remove"
              aria-label="Take colour {i + 2} off"
              onclick={() => setStops(removeStop(asPaint, i))}>Remove</button
            >
          </div>
        </div>
      {/each}
      <div class="prop-buttons">
        <button class="sm" onclick={() => setStops(addStop(asPaint))}>Add a colour</button>
      </div>
      <p class="hint">
        Drag a line across the layer or the selection: from the colour to the background colour.
        Shift keeps the line to steps of 45°.
      </p>
      <Why tool="graphicFill" />
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
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
    margin-bottom: 4px;
  }
  .checks {
    margin-bottom: 6px;
  }
  .save > input {
    grid-column: 2 / 4;
  }
  .save > button,
  .remove {
    grid-column: 4;
    justify-content: center;
    min-width: 0;
  }
  select {
    width: 100%;
    justify-content: safe flex-end;
  }
  /* A colour between the two: set apart by a line above, not indented (the grid's columns). */
  .stop {
    padding-top: 6px;
    border-top: 1px dashed var(--line);
  }
  .hint {
    margin: 6px 0;
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .error {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
