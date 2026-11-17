<script lang="ts">
  // Properties (AN6): the selected object's exact numbers — position, size, rotation, opacity,
  // fill, stroke, and what its kind adds (corners, points, sides, words and font, what a button
  // does). With several objects selected, a value typed here goes to all of them.
  import { tick } from 'svelte';
  import PropertySearch from '../PropertySearch.svelte';
  import { propertyFilter } from '../property-search.ts';
  import { editorOf } from './editor.ts';
  import type { App } from '../../app/app.ts';
  import { BUTTON_ACTIONS } from '../../core/animation/buttons.ts';
  import { DEFAULT_STROKE } from '../../core/animation/factory.ts';
  import { isClosed, isShape } from '../../core/animation/geometry.ts';
  import type { CombineHow } from '../../core/animation/combine.ts';
  import { addStop, changeStop, removeStop } from '../../core/animation/gradient.ts';
  import { alphaOf, opaqueOf, withAlpha } from '../../core/colour.ts';
  import { findObject } from '../../core/animation/layers.ts';
  import { stateAt } from '../../core/animation/state.ts';
  import { aspectOf, MAX_CURVE } from '../../core/animation/rules.ts';
  import { EASINGS } from '../../core/animation/tween.ts';
  import type {
    AnimObject,
    ButtonAction,
    Dash,
    Easing,
    Paint,
    TextAlign,
    TextObject,
  } from '../../core/animation/types.ts';
  import FontPicker from '../FontPicker.svelte';
  import Icon from '../Icon.svelte';
  import Why from '../Why.svelte';
  import { animUi } from './animation-ui.svelte.ts';
  import ColourField from './ColourField.svelte';
  import EffectsSection from './EffectsSection.svelte';
  import FiltersSection from './FiltersSection.svelte';
  import PatternFill from './PatternFill.svelte';
  import AlignSection from './AlignSection.svelte';
  import EnvelopeSection from './EnvelopeSection.svelte';
  import NodeSection from './NodeSection.svelte';
  import ArcSection from './ArcSection.svelte';
  import ShapeToolsSection from './ShapeToolsSection.svelte';
  import TextPathSection from './TextPathSection.svelte';
  import SpiralSection from './SpiralSection.svelte';
  import PaintSection from '../graphics/PaintSection.svelte';
  import RetouchSection from '../graphics/RetouchSection.svelte';
  import PixelTransformSection from '../graphics/PixelTransformSection.svelte';
  import { graphicOf } from '../../core/graphics/document.ts';
  import { DECIMALS, fromPx, toPx, UNIT_NAMES } from '../../core/graphics/units.ts';
  import { textBox } from './measure.ts';
  import NumField from './NumField.svelte';
  import TextSpacing from './TextSpacing.svelte';
  import {
    KERN_BIG_STEP,
    KERN_STEP,
    kernedBy,
    kerningAfterEdit,
  } from '../../core/animation/kerning.ts';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);
  // M14: what the student sees and edits is the animation at the playhead.
  const doc = $derived(stateAt($store.history.present, $store.frame));
  const found = $derived(
    $store.selection.flatMap((id) => {
      const f = findObject(doc, id);
      return f ? [f] : [];
    }),
  );
  const first = $derived(found[0]?.object ?? null);
  /** G14 (M22): the current layer when it is a pixel layer (Graphics mode), for its effects. */
  /** G14 (M22): the current layer's effects; G10 (M23): a vector layer's too (not a mask's). */
  const effectsLayer = $derived(
    editor.still
      ? doc.layers.find((l) => l.id === $store.layerId && !l.mask && !l.template)
      : undefined,
  );
  /** G1, G6 (M18): Graphics mode shows lengths in the image's units (px in Animation mode). */
  const image = $derived(editor.still ? graphicOf(doc) : { units: 'px' as const, dpi: 96 });
  const lengthDecimals = $derived(image.units === 'px' ? 2 : DECIMALS[image.units]);
  const shownLength = (px: number) => fromPx(px, image.units, image.dpi);
  const typedLength = (v: number) =>
    image.units === 'px' ? v : Math.round(toPx(v, image.units, image.dpi) * 100) / 100;
  let pathError: string | null = $state(null);
  /** AN24: two or more closed shapes can be combined. */
  const canCombine = $derived(
    found.length >= 2 && found.every((f) => isShape(f.object) && isClosed(f.object)),
  );
  let combineError: string | null = $state(null);
  const COMBINE: [CombineHow, string, string][] = [
    ['union', 'Union', 'Make one shape of the selected shapes'],
    ['cutOut', 'Cut out', 'Cut the shapes in front out of the one at the back (a bite)'],
    ['intersect', 'Intersect', 'Keep only where the selected shapes overlap'],
    // G4 (M19): beside them, Exclude and Combine; Join is for two open lines.
    ['exclude', 'Exclude', 'Keep only where the shapes do not overlap'],
    ['combine', 'Combine', 'Make one path of all the outlines: where two overlap is a hole'],
  ];
  /** G4 (M19): two open lines (paths, arcs, spirals) can be joined at their nearest ends. */
  const canJoin = $derived(
    found.length === 2 && found.every((f) => isShape(f.object) && !isClosed(f.object)),
  );
  /** The other objects a path or a morph can be taken from (shapes only for a morph). */
  const others = (id: string, shapesOnly: boolean): AnimObject[] =>
    doc.layers.flatMap((l) => l.objects).filter((o) => o.id !== id && (!shapesOnly || isShape(o)));
  function frames(id: string, index: number, which: 'from' | 'to', e: Event): void {
    const n = Number((e.currentTarget as HTMLInputElement).value);
    pathError = anim.setMotion(id, index, { [which]: n });
  }
  const many = $derived(found.length > 1);
  const KINDS: Record<AnimObject['kind'], string> = {
    rect: 'Rectangle',
    ellipse: 'Ellipse',
    star: 'Star',
    polygon: 'Polygon',
    path: 'Path',
    text: 'Text',
    picture: 'Picture',
    button: 'Button',
    group: 'Group',
  };
  let buttonError: string | null = $state(null);
  const DASHES: [Dash, string][] = [
    ['solid', 'Solid'],
    ['dashed', 'Dashed'],
    ['dotted', 'Dotted'],
  ];
  const set = (patch: Partial<AnimObject>) => anim.setProperties(patch);
  let words: HTMLTextAreaElement | undefined = $state();
  let lastFocus = 0;
  $effect(() => {
    if (animUi.focusText !== lastFocus && first?.kind === 'text') {
      lastFocus = animUi.focusText;
      void tick().then(() => {
        words?.focus();
        words?.select();
      });
    }
  });

  function setWidth(typed: number): string | null {
    const w = typedLength(typed);
    if (!first) return null;
    if (animUi.lockRatio && first.width > 0)
      return set({ width: w, height: Math.round(((w * first.height) / first.width) * 100) / 100 });
    return set({ width: w });
  }
  function setHeight(typed: number): string | null {
    const h = typedLength(typed);
    if (!first) return null;
    if (animUi.lockRatio && first.height > 0)
      return set({ width: Math.round(((h * first.width) / first.height) * 100) / 100, height: h });
    return set({ height: h });
  }
  function setFillKind(kind: Paint['kind']): void {
    if (!first) return;
    const current = first.fill;
    const base =
      current.kind === 'solid' || current.kind === 'pattern'
        ? current.colour
        : current.kind === 'linear' || current.kind === 'radial'
          ? current.from
          : '#9aa4b2';
    const to = current.kind === 'linear' || current.kind === 'radial' ? current.to : '#ffffff';
    // AN6: the colours between stay when a gradient changes kind.
    const stops =
      (current.kind === 'linear' || current.kind === 'radial') && current.stops
        ? { stops: current.stops }
        : {};
    const fill: Paint =
      kind === 'none'
        ? { kind: 'none' }
        : kind === 'solid'
          ? { kind: 'solid', colour: base }
          : kind === 'linear'
            ? { kind: 'linear', from: base, to, angle: 0, ...stops }
            : kind === 'pattern'
              ? // G12 (M19): stripes in the colour it had, on white, to change from there.
                {
                  kind: 'pattern',
                  pattern: 'stripes',
                  colour: base,
                  background: '#ffffff',
                  size: 16,
                }
              : { kind: 'radial', from: base, to, ...stops };
    set({ fill });
  }
  /** AN6: a gradient changed as a whole (a colour between added, changed or taken off). */
  const setFill = (fill: Paint): string | null => set({ fill });

  const fillPatch = (change: Partial<Extract<Paint, { kind: 'linear' }>>) => {
    if (!first || first.fill.kind === 'none') return null;
    return set({ fill: { ...first.fill, ...change } as Paint });
  };
  /** G8 (M23): a gradient colour's own opacity, 0–100 %, kept in it as #rrggbbaa. */
  const opacityOf = (colour: string, percent: number): string | null =>
    percent < 0 || percent > 100 ? null : withAlpha(colour, percent);
  const OPACITY_RANGE = 'From 0 to 100 %.';
  /** AN4: words, font, size and style change the box with them (one undo step). */
  const textPatch = (change: Partial<TextObject>): string | null => {
    if (!first || first.kind !== 'text') return null;
    // GT1 (M20): new words keep the kerning with the letters it was between.
    if (change.text !== undefined && !('kerning' in change) && first.kerning)
      change = { ...change, kerning: kerningAfterEdit(first.text, change.text, first.kerning) };
    const next = { ...first, ...change } as TextObject;
    return set({ ...change, ...textBox(next) } as Partial<AnimObject>);
  };
  /** GT1 (M20): where the cursor is in the words box, for the text it is in (kerning). */
  let caret = $state<{ id: string; at: number } | null>(null);
  const caretAt = $derived(first && caret?.id === first.id ? caret.at : null);
  let kernError: string | null = $state(null);
  function trackCaret(e: Event): void {
    const area = e.currentTarget as HTMLTextAreaElement;
    if (!first) return;
    caret =
      area.selectionStart === area.selectionEnd ? { id: first.id, at: area.selectionStart } : null;
  }
  /**
   * GT1 (M20): Alt+← / Alt+→ in the words box moves the two letters at the cursor closer or apart
   * (with Shift, five times as far), one undo step a press; words typed but not yet applied go in
   * with it.
   */
  function kernKey(e: KeyboardEvent): void {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // One text at a time: each has its own letters.
    if (!first || first.kind !== 'text' || many) return;
    e.preventDefault();
    const area = e.currentTarget as HTMLTextAreaElement;
    const at = area.selectionStart;
    const by = (e.shiftKey ? KERN_BIG_STEP : KERN_STEP) * (e.key === 'ArrowLeft' ? -1 : 1);
    const text = area.value;
    const kerning =
      text === first.text ? first.kerning : kerningAfterEdit(first.text, text, first.kerning);
    try {
      const change = { kerning: kernedBy({ text, kerning }, at, by) };
      kernError = textPatch(text === first.text ? change : { ...change, text });
    } catch (err) {
      kernError = err instanceof Error ? err.message : String(err);
    }
    caret = { id: first.id, at };
    void tick().then(() => area.setSelectionRange(at, at));
  }
  /**
   * AN26: a new curve bends the words; their box follows the bent words and stays centred where
   * it was (one undo step). 0 makes them straight again (and nothing is saved).
   */
  const curvePatch = (curve: number): string | null => {
    if (!first || first.kind !== 'text') return null;
    // GT2, GT3 (M20): curved words are taken off their path or out of their shape.
    const off = curve === 0 ? {} : { path: undefined, inShape: undefined };
    const next = { ...first, curve: curve === 0 ? undefined : curve, ...off } as TextObject;
    const box = textBox(next);
    const hundredths = (n: number) => Math.round(n * 100) / 100;
    return set({
      curve: next.curve,
      ...off,
      ...box,
      x: hundredths(first.x + (first.width - box.width) / 2),
      y: hundredths(first.y + (first.height - box.height) / 2),
    } as Partial<AnimObject>);
  };
  const strokePatch = (change: Partial<NonNullable<AnimObject['stroke']>>) => {
    if (!first) return null;
    return set({ stroke: { ...(first.stroke ?? DEFAULT_STROKE), ...change } });
  };
  /** Property search: the words typed, and how many settings match (−1: no search). */
  let search = $state('');
  let matching = $state(-1);
</script>

<aside class="props prop-panel" aria-label="Properties">
  <div class="panel-h">Properties</div>
  <PropertySearch bind:value={search} found={matching} />
  <div class="body" {@attach propertyFilter(search, (n) => (matching = n))}>
    <!-- GV1 (M19): the Spiral tool's options (and the spiral just drawn). -->
    <SpiralSection {app} />
    <!-- GB4, GB3 (M21): the painting tools' colours, brush, bucket and gradient. -->
    <PaintSection {app} />
    <!-- GB5 (M22): the retouching tools' source, brush, strength and red eye's settings. -->
    <RetouchSection {app} />
    <!-- G3 (M21): the current pixel layer (or the selected pixels) moved, scaled, turned. -->
    <PixelTransformSection {app} />
    {#if !first}
      <p class="hint">
        Click an object on the stage, or draw one with a tool from the strip on the left.
      </p>
      {#if effectsLayer}
        <!-- G14 (M22): the current layer's effects (the halo, light blooms, a bevel); G10 (M23):
             a stroke round a clipping group (M/21's globe), on a vector layer too. -->
        <FiltersSection
          heading="Effects on {effectsLayer.name}"
          owner="the layer"
          quick
          filters={effectsLayer.effects ?? []}
          commit={(effects) => anim.setLayerEffects(effectsLayer.id, effects)}
        />
      {/if}
      {#if editor.still}
        <!-- G1, G10 (M18): the image: its canvas, printed size, resolution and background. -->
        <div class="sec">
          <h4>Image <span class="syl">19.1 image resolutions</span></h4>
          <div class="prop-facts">
            <div class="prop-row">
              <span class="prop-label">Canvas</span>
              <span class="prop-fact">{doc.stage.width} × {doc.stage.height} px</span>
            </div>
            {#if image.units !== 'px'}
              <div class="prop-row">
                <span class="prop-label">Size</span>
                <span class="prop-fact"
                  >{Number(shownLength(doc.stage.width).toFixed(DECIMALS[image.units]))} × {Number(
                    shownLength(doc.stage.height).toFixed(DECIMALS[image.units]),
                  )}
                  {image.units}</span
                >
              </div>
            {/if}
            <div class="prop-row">
              <span class="prop-label">Resolution</span>
              <span class="prop-fact">{image.dpi} dpi</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Background</span>
              <span class="prop-fact"
                >{doc.stage.background === 'none'
                  ? 'Transparent'
                  : doc.stage.background.toUpperCase()}</span
              >
            </div>
          </div>
          <!-- GB6, G8 (M21): the whole image resized, its canvas, trimmed, its colours reduced:
               one even grid of buttons (issues/graphics-1.png: the same gap between every row). -->
          <div class="prop-buttons" role="group" aria-label="Image">
            <button class="sm" onclick={() => (animUi.dialog = 'image')}>Image settings…</button>
            <button
              class="sm"
              title="Make the canvas just big enough for everything drawn"
              onclick={() => anim.cropCanvas('drawing')}>Fit to drawing</button
            >
            <button
              class="sm"
              title="Image size: every layer resampled to a new size, or only the resolution changed"
              onclick={() => (animUi.dialog = 'imageSize')}>Image size…</button
            >
            <button
              class="sm"
              title="Canvas size: more room round the picture, or less (it crops), at an anchor"
              onclick={() => (animUi.dialog = 'canvasSize')}>Canvas size…</button
            >
            <button
              class="sm"
              title="Crop to content: the canvas cut to the pixels and shapes drawn (transparent edges trimmed)"
              onclick={() => anim.trimCanvas(false)}>Crop to content</button
            >
            <button
              class="sm"
              title="Trim plain edges: a border of one colour (white round a photo) cut off too"
              onclick={() => anim.trimCanvas(true)}>Trim plain edges</button
            >
            <button
              class="sm"
              title="Reduce colours: the current pixel layer to 2, 16 or 256 colours or greys"
              onclick={() => (animUi.dialog = 'reduceColours')}>Reduce colours…</button
            >
          </div>
        </div>
        <Why tool="graphicImage" />
      {:else}
        <div class="sec">
          <h4>Stage</h4>
          <div class="prop-facts">
            {#each [['Size', `${doc.stage.width} × ${doc.stage.height} px`], ['Aspect ratio', aspectOf(doc.stage.width, doc.stage.height)], ['Frame rate', `${doc.stage.fps} fps`], ['Colour', doc.stage.background.toUpperCase()]] as [name, fact] (name)}
              <div class="prop-row">
                <span class="prop-label">{name}</span>
                <span class="prop-fact">{fact}</span>
              </div>
            {/each}
          </div>
        </div>
        <Why tool="objectProperties" />
      {/if}
    {:else}
      <div class="sec">
        <h4>
          {many ? `${found.length} objects` : KINDS[first.kind]}
          <span class="syl">20.1 object properties</span>
        </h4>
        {#if !many}
          <div class="prop-row">
            <label for="prop-name">Name</label>
            <input
              id="prop-name"
              type="text"
              class="text"
              value={first.name}
              onchange={(e) =>
                set({ name: (e.currentTarget as HTMLInputElement).value.trim() || first!.name })}
            />
          </div>
        {/if}
        <div class="prop-row">
          <NumField
            label="X"
            value={shownLength(first.x)}
            unit={image.units}
            decimals={lengthDecimals}
            commit={(v) => set({ x: typedLength(v) })}
          />
          <NumField
            label="Y"
            value={shownLength(first.y)}
            unit={image.units}
            decimals={lengthDecimals}
            commit={(v) => set({ y: typedLength(v) })}
          />
          <NumField
            label="W"
            value={shownLength(first.width)}
            unit={image.units}
            decimals={lengthDecimals}
            commit={setWidth}
          />
          <NumField
            label="H"
            value={shownLength(first.height)}
            unit={image.units}
            decimals={lengthDecimals}
            commit={setHeight}
          />
        </div>
        {#if image.units !== 'px'}
          <p class="hint units">
            In {UNIT_NAMES[image.units]} at {image.dpi} dpi: {Math.round(first.width)} × {Math.round(
              first.height,
            )} px.
          </p>
        {/if}
        <div class="prop-row">
          <label class="prop-check">
            <input type="checkbox" bind:checked={animUi.lockRatio} /> Lock proportions
          </label>
        </div>
        {#if many || first.kind === 'group'}
          <!-- G3 (Graphics benchmark): Illustrator's Scale Strokes & Effects, for the image. -->
          <div class="prop-row">
            <label
              class="prop-check"
              title="On: a resized group's outlines and shadows grow and shrink with it. Off: they stay as typed (a 1 pt outline stays 1 pt), here and in Image size."
            >
              <input
                type="checkbox"
                checked={$store.history.present.view.scaleOutlines !== false}
                onchange={(e) =>
                  anim.setView({ scaleOutlines: (e.currentTarget as HTMLInputElement).checked })}
              /> Scale outlines and effects
            </label>
          </div>
        {/if}
        <div class="prop-row">
          <NumField
            label="Rotation"
            value={first.rotation}
            unit="°"
            commit={(v) => set({ rotation: ((v % 360) + 360) % 360 })}
          />
          <NumField
            label="Opacity"
            value={first.opacity}
            unit="%"
            commit={(v) => set({ opacity: v })}
          />
          <!-- AN25: slanted in its box (a shield turned sideways), keyed like the turn. -->
          <NumField
            label="Skew ↔"
            value={first.skewX ?? 0}
            unit="°"
            commit={(v) => set({ skewX: v })}
          />
          <NumField
            label="Skew ↕"
            value={first.skewY ?? 0}
            unit="°"
            commit={(v) => set({ skewY: v })}
          />
          <!-- AN27: the point it turns about, in % of its box from the top left (a needle's end). -->
          <NumField
            label="Turn about X"
            value={(first.pivot?.x ?? 0.5) * 100}
            unit="%"
            decimals={1}
            commit={(v) => anim.setPivot({ x: v / 100 })}
          />
          <NumField
            label="Turn about Y"
            value={(first.pivot?.y ?? 0.5) * 100}
            unit="%"
            decimals={1}
            commit={(v) => anim.setPivot({ y: v / 100 })}
          />
        </div>
        <div class="prop-buttons" role="group" aria-label="Turn about">
          <button
            class="sm"
            aria-label="Turn about the centre"
            title="Turn about the centre of the box again (or double-click the dot on the stage)"
            disabled={!found.some((f) => f.object.pivot)}
            onclick={() => anim.setPivot(null)}>Centre</button
          >
        </div>
        <Why tool="objectProperties" />
      </div>

      {#if first.kind === 'picture' && !many}
        <div class="sec">
          <h4>Picture <span class="syl">20.1 tracing bitmaps</span></h4>
          <div class="prop-buttons" style:--n="1" role="group" aria-label="Picture">
            <!-- AN5: a new picture beside this one (O/N/19: the pearl cut from its photo). -->
            <button
              class="sm"
              title="Keep only part of the picture"
              onclick={() => (animUi.dialog = 'cropPicture')}>Crop…</button
            >
            <button
              class="sm"
              title="A plain background (or any colour) becomes see-through"
              onclick={() => (animUi.dialog = 'seeThrough')}>Make a colour see-through…</button
            >
            <button class="sm" onclick={() => (animUi.dialog = 'trace')}>Trace bitmap…</button>
          </div>
          <Why tool="animTrace" />
        </div>
      {/if}

      {#if first.kind !== 'picture' && first.kind !== 'group'}
        <div class="sec">
          <h4>Fill</h4>
          <div class="field">
            <label for="prop-fill">Fill</label>
            <select
              id="prop-fill"
              value={first.fill.kind}
              onchange={(e) =>
                setFillKind((e.currentTarget as HTMLSelectElement).value as Paint['kind'])}
            >
              <option value="none">None</option>
              <option value="solid">Solid colour</option>
              <option value="linear">Gradient (linear)</option>
              <option value="radial">Gradient (radial)</option>
              <option value="pattern">Pattern</option>
            </select>
          </div>
          {#if first.fill.kind === 'solid'}
            <ColourField
              label="Colour"
              value={first.fill.colour}
              commit={(c) => set({ fill: { kind: 'solid', colour: c } })}
            />
          {:else if first.fill.kind === 'linear' || first.fill.kind === 'radial'}
            {@const fill = first.fill}
            <!-- G8 (M23): each colour with its own opacity (J/22: dark fading to see-through). -->
            <ColourField
              label="From"
              value={opaqueOf(fill.from)}
              commit={(c) => fillPatch({ from: withAlpha(c, alphaOf(fill.from)) })}
            />
            <NumField
              label="From opacity"
              value={alphaOf(fill.from)}
              unit="%"
              commit={(v) => {
                const from = opacityOf(fill.from, v);
                return from ? fillPatch({ from }) : OPACITY_RANGE;
              }}
            />
            <!-- AN6: the colours between From and To (M/J/20: a red, yellow and green meter). -->
            {#each fill.stops ?? [] as stop, i (i)}
              <div class="stop" role="group" aria-label="Colour {i + 2}">
                <ColourField
                  label="Colour {i + 2}"
                  value={opaqueOf(stop.colour)}
                  commit={(c) =>
                    setFill(changeStop(fill, i, { colour: withAlpha(c, alphaOf(stop.colour)) }))}
                />
                <div class="prop-row">
                  <NumField
                    label="Opacity"
                    value={alphaOf(stop.colour)}
                    unit="%"
                    commit={(v) => {
                      const colour = opacityOf(stop.colour, v);
                      return colour ? setFill(changeStop(fill, i, { colour })) : OPACITY_RANGE;
                    }}
                  />
                  <NumField
                    label="At"
                    value={stop.at}
                    unit="%"
                    decimals={1}
                    commit={(v) => setFill(changeStop(fill, i, { at: v }))}
                  />
                </div>
                <div class="prop-buttons">
                  <button
                    class="sm"
                    aria-label="Remove colour {i + 2}"
                    title="Take this colour off the gradient"
                    onclick={() => setFill(removeStop(fill, i))}>Remove</button
                  >
                </div>
              </div>
            {/each}
            <ColourField
              label="To"
              value={opaqueOf(fill.to)}
              commit={(c) => fillPatch({ to: withAlpha(c, alphaOf(fill.to)) })}
            />
            <NumField
              label="To opacity"
              value={alphaOf(fill.to)}
              unit="%"
              commit={(v) => {
                const to = opacityOf(fill.to, v);
                return to ? fillPatch({ to }) : OPACITY_RANGE;
              }}
            />
            <div class="prop-buttons">
              <button
                class="sm"
                title="Another colour between From and To, in the middle of the widest gap"
                onclick={() => setFill(addStop(fill))}>Add a colour</button
              >
            </div>
            {#if fill.kind === 'linear'}
              <NumField
                label="Angle"
                value={fill.angle}
                unit="°"
                commit={(v) => fillPatch({ angle: v })}
              />
            {:else}
              <!-- AN6: where the gradient starts, in % of the box (M/J/18: the bloom's light). -->
              <div class="prop-row">
                <NumField
                  label="Centre X"
                  value={fill.cx ?? 50}
                  unit="%"
                  decimals={1}
                  commit={(v) => setFill({ ...fill, cx: v })}
                />
                <NumField
                  label="Centre Y"
                  value={fill.cy ?? 50}
                  unit="%"
                  decimals={1}
                  commit={(v) => setFill({ ...fill, cy: v })}
                />
              </div>
            {/if}
          {:else if first.fill.kind === 'pattern'}
            <PatternFill
              fill={first.fill}
              pictures={doc.pictures}
              commit={setFill}
              choosePicture={() => anim.tilePicture()}
            />
          {/if}
          {#if first.fill.kind !== 'none'}
            <!-- G12 (M19): the fill's own opacity, under the object's (workbook: 50 %). -->
            <NumField
              label="Fill opacity"
              value={first.fillOpacity ?? 100}
              unit="%"
              commit={(v) => set({ fillOpacity: v === 100 ? undefined : v })}
            />
          {/if}
        </div>
        <div class="sec">
          <h4>Stroke</h4>
          <div class="prop-row">
            <label class="prop-check">
              <input
                type="checkbox"
                checked={first.stroke !== undefined}
                onchange={(e) =>
                  set({
                    stroke: (e.currentTarget as HTMLInputElement).checked
                      ? { ...DEFAULT_STROKE }
                      : undefined,
                  })}
              />
              Outline
            </label>
          </div>
          {#if first.stroke}
            <ColourField
              label="Colour"
              value={first.stroke.colour}
              commit={(c) => strokePatch({ colour: c })}
            />
            <div class="prop-row">
              <NumField
                label="Width"
                value={first.stroke.width}
                unit="px"
                decimals={1}
                commit={(v) => strokePatch({ width: v })}
              />
              <div class="field">
                <label for="prop-dash">Style</label>
                <select
                  id="prop-dash"
                  value={first.stroke.dash}
                  onchange={(e) =>
                    strokePatch({ dash: (e.currentTarget as HTMLSelectElement).value as Dash })}
                >
                  {#each DASHES as [d, label] (d)}<option value={d}>{label}</option>{/each}
                </select>
              </div>
            </div>
            {#if editor.still}
              <!-- G12, GT1 (M20): the papers give outlines in points ("a 1pt black outline",
                   "a 3pt red outline"): dpi / 72 px each at the image's resolution. -->
              <NumField
                label="Outline width in points"
                value={fromPx(first.stroke.width, 'pt', image.dpi)}
                unit="pt"
                decimals={DECIMALS.pt}
                commit={(v) =>
                  strokePatch({ width: Math.round(toPx(v, 'pt', image.dpi) * 100) / 100 })}
              />
            {/if}
            <!-- G12 (M19): the outline's own opacity, under the object's. -->
            <NumField
              label="Outline opacity"
              value={first.stroke.opacity ?? 100}
              unit="%"
              commit={(v) => strokePatch({ opacity: v === 100 ? undefined : v })}
            />
          {/if}
        </div>
      {/if}

      {#if first.kind === 'rect'}
        <div class="sec">
          <h4>Corners</h4>
          <NumField
            label="Radius"
            value={first.radius}
            unit="px"
            commit={(v) => set({ radius: v } as Partial<AnimObject>)}
          />
        </div>
      {:else if first.kind === 'star'}
        <div class="sec">
          <h4>Star</h4>
          <div class="prop-row">
            <NumField
              label="Points"
              value={first.points}
              commit={(v) => set({ points: Math.round(v) } as Partial<AnimObject>)}
            />
            <NumField
              label="Inner"
              value={first.inner * 100}
              unit="%"
              commit={(v) => set({ inner: v / 100 } as Partial<AnimObject>)}
            />
          </div>
        </div>
      {:else if first.kind === 'ellipse' && found.every((f) => f.object.kind === 'ellipse')}
        <ArcSection {app} ellipse={first} />
      {:else if first.kind === 'polygon'}
        <div class="sec">
          <h4>Polygon</h4>
          <NumField
            label="Sides"
            value={first.sides}
            commit={(v) => set({ sides: Math.round(v) } as Partial<AnimObject>)}
          />
        </div>
      {:else if first.kind === 'button'}
        <div class="sec">
          <h4>Button <span class="syl">20.1 stopping animations</span></h4>
          <div class="field">
            <label for="prop-label">Label</label>
            <input
              id="prop-label"
              type="text"
              value={first.label}
              onchange={(e) =>
                (buttonError = set({
                  label: (e.currentTarget as HTMLInputElement).value,
                } as Partial<AnimObject>))}
            />
          </div>
          <div class="field">
            <label for="prop-action">Action</label>
            <select
              id="prop-action"
              value={first.action}
              onchange={(e) =>
                (buttonError = anim.setButtonAction(
                  (e.currentTarget as HTMLSelectElement).value as ButtonAction,
                ))}
            >
              {#each BUTTON_ACTIONS as a (a.id)}<option value={a.id} title={a.hint}
                  >{a.label}</option
                >{/each}
            </select>
          </div>
          {#if first.action === 'goto'}
            <NumField
              label="Go to"
              value={first.frame ?? 0}
              unit="frame"
              commit={(v) => set({ frame: v } as Partial<AnimObject>)}
            />
          {/if}
          <div class="prop-row">
            <NumField
              label="Label size"
              value={first.size}
              unit="px"
              commit={(v) => set({ size: v } as Partial<AnimObject>)}
            />
          </div>
          <ColourField
            label="Label colour"
            value={first.colour}
            commit={(c) => set({ colour: c } as Partial<AnimObject>)}
          />
          {#if buttonError}<p class="error" role="alert">{buttonError}</p>{/if}
          <p class="hint">Clicking it works in Test and in an HTML web animation.</p>
          <Why tool="animButton" />
        </div>
      {:else if first.kind === 'text'}
        <div class="sec">
          <h4>Text <span class="syl">20.1 adding text</span></h4>
          <textarea
            class="words"
            aria-label="Words"
            bind:this={words}
            value={first.text}
            rows="3"
            onchange={(e) => textPatch({ text: (e.currentTarget as HTMLTextAreaElement).value })}
            onkeydown={kernKey}
            onkeyup={trackCaret}
            onclick={trackCaret}
            onselect={trackCaret}
            onfocus={trackCaret}
            oninput={trackCaret}></textarea>
          {#if kernError}<p class="error" role="alert">{kernError}</p>{/if}
          <div class="field">
            <label for="prop-font">Font</label>
            <FontPicker value={first.font} onchange={(font) => textPatch({ font })} />
          </div>
          <div class="prop-row">
            <NumField
              label="Size"
              value={first.size}
              unit="px"
              commit={(v) => textPatch({ size: v })}
            />
            <div class="field">
              <label for="prop-align">Align</label>
              <select
                id="prop-align"
                value={first.align}
                onchange={(e) =>
                  set({
                    align: (e.currentTarget as HTMLSelectElement).value as TextAlign,
                  } as Partial<AnimObject>)}
              >
                <option value="left">Left</option>
                <option value="centre">Centre</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
          {#if editor.still}
            <!-- GT1 (M20): the papers give sizes in points ("12 pt"): 1 pt is a 72nd of an inch,
                 so dpi / 72 px at the image's resolution. -->
            <NumField
              label="Size in points"
              value={fromPx(first.size, 'pt', image.dpi)}
              unit="pt"
              decimals={DECIMALS.pt}
              commit={(v) => textPatch({ size: Math.round(toPx(v, 'pt', image.dpi) * 100) / 100 })}
            />
          {/if}
          <!-- AN26: the words bent along an arch, for a logo (M/J/17 HUNGRY, O/N/17 Rock ICT);
               one text at a time, as each box follows its own words. -->
          {#if !many}
            <NumField label="Curve" value={first.curve ?? 0} commit={curvePatch} />
            <div class="prop-row">
              <span class="prop-label" aria-hidden="true"></span>
              <div class="prop-wide curve">
                <span aria-hidden="true">⌣</span>
                <input
                  type="range"
                  aria-label="Curve slider"
                  title="Bend the words: up like a rainbow, or down like a smile"
                  min={-MAX_CURVE}
                  max={MAX_CURVE}
                  step="1"
                  value={first.curve ?? 0}
                  onchange={(e) => curvePatch(Number((e.currentTarget as HTMLInputElement).value))}
                />
                <span aria-hidden="true">⌢</span>
              </div>
            </div>
            <p class="hint">
              0 is straight, 50 a half circle (a rainbow), 100 a whole circle; below 0 the words
              bend down like a smile.
            </p>
          {/if}
          <div class="prop-buttons">
            <button
              class="sm"
              aria-pressed={first.bold}
              onclick={() => textPatch({ bold: !(first as TextObject).bold })}><b>B</b> Bold</button
            >
            <button
              class="sm"
              aria-pressed={first.italic}
              onclick={() => textPatch({ italic: !(first as TextObject).italic })}
              ><i>I</i> Italic</button
            >
          </div>
          <div class="prop-buttons">
            <button
              class="sm"
              title="One text object per letter, so the letters can move one at a time"
              onclick={() => anim.splitText((t) => textBox(t))}>Split into letters</button
            >
          </div>
          <Why tool="animText" />
        </div>
        <!-- GT1 (M20): letter spacing, line spacing and kerning at the cursor. -->
        <TextSpacing text={first} caret={many ? null : caretAt} patch={textPatch} />
      {/if}

      {#if !many && !editor.still}
        {@const paths = first.paths ?? []}
        <div class="sec">
          <h4>Motion path <span class="syl">20.1 setting paths</span></h4>
          {#each paths as m, i (i)}
            {@const n = i + 1}
            <div class="path-head">Path {n}: {m.source ?? 'a path'}</div>
            <div class="prop-row frames">
              <label for="path-{n}-from">From</label>
              <input
                id="path-{n}-from"
                class="frame"
                aria-label="Path {n} from frame"
                value={m.from}
                onchange={(e) => frames(first!.id, i, 'from', e)}
              />
              <label for="path-{n}-to">To</label>
              <input
                id="path-{n}-to"
                class="frame"
                aria-label="Path {n} to frame"
                value={m.to}
                onchange={(e) => frames(first!.id, i, 'to', e)}
              />
            </div>
            <div class="prop-row">
              <label class="prop-check" title="Turn with the path, as a car turns with the road"
                ><input
                  type="checkbox"
                  aria-label="Orient to path {n}"
                  checked={m.orient}
                  onchange={(e) =>
                    (pathError = anim.setMotion(first!.id, i, {
                      orient: (e.currentTarget as HTMLInputElement).checked,
                    }))}
                /> Orient to path</label
              >
            </div>
            <div class="prop-row">
              <label
                class="prop-check"
                title="The same speed all along the path (off: each part takes the same time)"
                ><input
                  type="checkbox"
                  aria-label="Even speed {n}"
                  checked={m.even}
                  onchange={(e) =>
                    (pathError = anim.setMotion(first!.id, i, {
                      even: (e.currentTarget as HTMLInputElement).checked,
                    }))}
                /> Even speed</label
              >
            </div>
            <div class="prop-row">
              <label for="path-{n}-easing">Easing</label>
              <select
                id="path-{n}-easing"
                aria-label="Path {n} easing"
                title="How the object speeds up or slows down along the path"
                value={m.easing}
                onchange={(e) =>
                  (pathError = anim.setMotion(first!.id, i, {
                    easing: (e.currentTarget as HTMLSelectElement).value as Easing,
                  }))}
              >
                {#each EASINGS as ez (ez.id)}<option value={ez.id}>{ez.label}</option>{/each}
              </select>
            </div>
            <div class="prop-buttons">
              <button
                class="sm"
                aria-label="Remove path {n}"
                onclick={() => anim.removeMotion(first!.id, i)}>Remove</button
              >
            </div>
          {/each}
          <div class="field">
            <label for="prop-follow">{paths.length ? 'Then follow' : 'Follow path'}</label>
            <select
              id="prop-follow"
              aria-label="Follow path"
              value=""
              title="Choose a pen path or shape: the object's centre follows it (a further path starts where the last ends)"
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                if (v) pathError = anim.followPath(first!.id, v);
              }}
            >
              <option value="">{paths.length ? 'Another path…' : 'None'}</option>
              {#each others(first.id, false) as o (o.id)}<option value={o.id}>{o.name}</option
                >{/each}
            </select>
          </div>
          {#if pathError}<p class="error" role="alert">{pathError}</p>{/if}
          <Why tool="animPath" />
        </div>
        {#if isShape(first)}
          <div class="sec">
            <h4>Morph <span class="syl">20.1 morphing</span></h4>
            <div class="field">
              <label for="prop-morph">Morph into</label>
              <select
                id="prop-morph"
                value=""
                title="At the playhead this shape becomes the one you pick, which is then removed"
                onchange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value;
                  if (v) pathError = anim.morphInto(first!.id, v);
                }}
              >
                <option value="">Pick a shape…</option>
                {#each others(first.id, true) as o (o.id)}<option value={o.id}>{o.name}</option
                  >{/each}
              </select>
            </div>
            <p class="hint">
              Draw the new shape, then pick it here with the playhead where the change should end
              (frame {$store.frame}).
            </p>
            <Why tool="animMorph" />
          </div>
        {/if}
      {/if}

      <!-- GV3 (M19): the node bar while a pen path's nodes are edited (its own, not a morph's). -->
      {#if !many && first.kind === 'path' && $store.tool === 'select' && findObject($store.history.present, first.id)?.object.kind === 'path'}
        <NodeSection {app} path={first} />
      {/if}
      <FiltersSection filters={first.filters ?? []} commit={(filters) => set({ filters })} />
      {#if !editor.still}<EffectsSection {app} />{/if}
      <AlignSection {app} count={found.length} />
      <TextPathSection {app} objects={found.map((f) => f.object)} />
      <ShapeToolsSection {app} objects={found.map((f) => f.object)} />
      <EnvelopeSection {app} />
      <div class="sec arrange">
        <h4>Arrange</h4>
        <div class="prop-row">
          <span class="prop-label">Order</span>
          <div class="prop-buttons" style:--n="4" role="group" aria-label="Order">
            <button
              class="sm"
              aria-label="Bring to front"
              title="Bring to front"
              onclick={() => anim.reorder('front')}><Icon name="front" size={14} /></button
            >
            <button
              class="sm"
              aria-label="Bring forward"
              title="Bring forward"
              onclick={() => anim.reorder('forward')}><Icon name="up" size={14} /></button
            >
            <button
              class="sm"
              aria-label="Send backward"
              title="Send backward"
              onclick={() => anim.reorder('back')}><Icon name="down" size={14} /></button
            >
            <button
              class="sm"
              aria-label="Send to back"
              title="Send to back"
              onclick={() => anim.reorder('backmost')}><Icon name="back" size={14} /></button
            >
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Parts</span>
          <div class="prop-buttons">
            <button
              class="sm"
              title="Group the selected objects into one (Ctrl/Cmd + G)"
              disabled={found.length < 2}
              onclick={() => anim.group()}><Icon name="group" size={14} /> Group</button
            >
            <button
              class="sm"
              title="Take the group apart (Ctrl/Cmd + Shift + G)"
              disabled={!found.some((f) => f.object.kind === 'group')}
              onclick={() => anim.ungroup()}>Ungroup</button
            >
          </div>
        </div>
        <!-- AN5: after Trace bitmap, all the parts of one colour at once. -->
        <div class="prop-row">
          <span class="prop-label">Select</span>
          <div class="prop-buttons" role="group" aria-label="Select same colour">
            <button
              class="sm"
              aria-label="Select same fill colour"
              title="Select every object on this layer with the same fill (after Trace bitmap: all the parts of one colour)"
              disabled={first.kind === 'group' || first.kind === 'picture'}
              onclick={() => anim.selectSameColour('fill')}>Same fill</button
            >
            <button
              class="sm"
              aria-label="Select same outline colour"
              title="Select every object on this layer with the same outline colour"
              disabled={!first.stroke || first.kind === 'group' || first.kind === 'picture'}
              onclick={() => anim.selectSameColour('outline')}>Same outline</button
            >
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Object</span>
          <div class="prop-buttons">
            <button
              class="sm"
              title="Make a copy 10 px away (Ctrl/Cmd + D)"
              onclick={() => anim.duplicate()}><Icon name="copy" size={14} /> Duplicate</button
            >
            <button
              class="sm"
              title="Delete the selected objects (Delete)"
              onclick={() => anim.deleteSelection()}><Icon name="delete" size={14} /> Delete</button
            >
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Flip</span>
          <div class="prop-buttons" role="group" aria-label="Flip">
            <button
              class="sm"
              aria-label="Flip horizontal"
              title="Mirror left to right (a plane flying back the other way)"
              onclick={() => anim.flip('horizontal')}>↔ Horizontal</button
            >
            <button
              class="sm"
              aria-label="Flip vertical"
              title="Mirror top to bottom"
              onclick={() => anim.flip('vertical')}>↕ Vertical</button
            >
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">Combine</span>
          <div class="prop-buttons" style:--n="3" role="group" aria-label="Combine shapes">
            {#each COMBINE as [how, label, hint] (how)}
              <button
                class="sm"
                title={hint}
                disabled={!canCombine}
                onclick={() => (combineError = anim.combine(how))}>{label}</button
              >
            {/each}
            <button
              class="sm"
              title="Join two open lines where their ends are nearest (closed if the other ends meet too)"
              disabled={!canJoin}
              onclick={() => (combineError = anim.combine('join'))}>Join</button
            >
          </div>
        </div>
        {#if combineError}<p class="error" role="alert">{combineError}</p>{/if}
        <div class="field">
          <label for="prop-layer">On layer</label>
          <select
            id="prop-layer"
            value={found[0]!.layerId}
            onchange={(e) =>
              anim.moveSelectionToLayer((e.currentTarget as HTMLSelectElement).value)}
          >
            {#each [...doc.layers].reverse() as layer (layer.id)}
              <option value={layer.id}>{layer.name}</option>
            {/each}
          </select>
        </div>
        <Why tool="animGroup" />
      </div>
    {/if}
  </div>
</aside>

<style>
  .props {
    /* N16: the size is the panel slot's (App, PanelSlot.svelte). */
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-1);
    border-left: 1px solid var(--line);
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 8px 12px 12px;
  }
  .hint {
    margin: 4px 0 12px;
    color: var(--tx-2);
    font-size: 12px;
  }
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
  /* A row of its own (a label and a menu, a text box or the font list): on the property grid
     (props.css), the control across the field columns. */
  .field {
    display: grid;
    grid-template-columns: var(--prop-cols);
    column-gap: var(--prop-gap-x);
    align-items: center;
    margin-bottom: var(--prop-gap-y);
    min-width: 0;
  }
  /* (global: the font list is another component's element) */
  .field > :global(:not(label)) {
    grid-column: 2 / -1;
    width: 100%;
    min-width: 0;
  }
  /* Beside a number in a pair (Width | Style, Size | Align): the label and menu in columns 3–4. */
  :global(.prop-row) > .field {
    display: contents;
  }
  :global(.prop-row) > .field > :global(:not(label)) {
    grid-column: auto;
  }
  .field label {
    color: var(--tx-2);
    font-size: 12px;
    line-height: 1.25;
  }
  input.text,
  .words {
    width: 100%;
  }
  select {
    /* Full width (so it never jumps with the choice), its words on the right as in the boxes
       (the teacher's layout check, 2026-11-15). A menu is a flex box (forms.css, base-select). */
    width: 100%;
    justify-content: safe flex-end; /* a choice too long for the box starts at its left */
  }
  .words {
    display: block;
    margin-bottom: 6px;
    resize: vertical;
    font-family: var(--font);
  }
  .path-head {
    font-size: 12px;
    font-weight: 600;
    margin: 6px 0 4px;
  }
  /* AN26: the curve's slider, between a smile and a rainbow. */
  /* Two numbers in a row of their own (a path's From and To frames). */
  .frames > input {
    grid-column: auto;
    text-align: right;
    font-family: var(--mono);
  }
  .curve {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: center;
    margin-bottom: 2px;
    color: var(--tx-2);
  }
  .curve input {
    width: 100%;
    min-width: 0;
  }
  /* AN6: a colour between From and To (its opacity, where it is, Remove), set apart by a line
     above, not indented (the fields stay on the grid's columns). */
  .stop {
    padding-top: 6px;
    border-top: 1px dashed var(--line);
  }
</style>
