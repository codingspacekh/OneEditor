<script lang="ts">
  // AN9: the bar for the keyframe picked on the timeline: its easing, hold, the property's
  // repeat, Reverse, and Delete.
  import type { App } from '../../app/app.ts';
  import { editorOf } from './editor.ts';
  import { DEFAULT_CURVE, EASINGS } from '../../core/animation/tween.ts';
  import EaseCurveEditor from './EaseCurveEditor.svelte';
  import type { Id, Keyframe, Track, TweenProperty } from '../../core/animation/types.ts';
  import Icon from '../Icon.svelte';
  import { PROPERTY_LABEL } from './timeline-rows.ts';

  let {
    app,
    picked = $bindable(),
    track,
    key,
  }: {
    app: App;
    /** The keyframe picked (Delete clears it). */
    picked: { id: Id; property: TweenProperty; frame: number } | null;
    /** Its property's track and the keyframe itself. */
    track: Track;
    key: Keyframe;
  } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);

  let curveError: string | null = $state(null);
  /** The custom curve's box is open. */
  let curveOpen = $state(false);

  function setRepeat(event: Event): void {
    if (!picked) return;
    const value = (event.currentTarget as HTMLSelectElement).value;
    anim.setRepeat(
      picked.id,
      picked.property,
      value === '' ? undefined : value === 'end' ? 'end' : Number(value),
    );
  }
</script>

{#if picked}
  <div class="key-bar" aria-label="Keyframe">
    <span class="key-name">{PROPERTY_LABEL[picked.property]} · frame {picked.frame}</span>
    <label
      >Easing
      <select
        aria-label="Easing"
        value={key.easing}
        title="How the change runs to the next keyframe"
        onchange={(e) => {
          if (!picked) return;
          const easing = (e.currentTarget as HTMLSelectElement).value as never;
          anim.setEasing(picked.id, picked.property, picked.frame, easing);
          // The curve opens to be shaped as soon as it is chosen.
          curveOpen = easing === 'custom';
        }}
      >
        {#each EASINGS as e (e.id)}
          <option value={e.id} title={e.hint}>{e.label}</option>
        {/each}
      </select></label
    >
    {#if key.easing === 'custom'}
      <!-- 2026-11-18: the custom ease's curve, in a box over the timeline (the bar keeps its
           height, so the stage keeps its room), opened by its little picture. -->
      {@const c = key.curve ?? DEFAULT_CURVE}
      <span class="curve-wrap">
        <button
          class="sm curve-button"
          aria-label="Edit the curve"
          aria-expanded={curveOpen}
          title="Shape the custom ease by dragging its two handles"
          onclick={() => (curveOpen = !curveOpen)}
          ><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"
            ><path
              d="M 2 18 C {2 + c[0] * 16} {18 - c[1] * 16} {2 + c[2] * 16} {18 - c[3] * 16} 18 2"
            /></svg
          > Curve</button
        >
        {#if curveOpen}
          <div class="curve-pop" role="dialog" aria-label="Custom curve">
            <EaseCurveEditor
              curve={c}
              commit={(next) =>
                picked
                  ? (curveError = anim.setCurve(picked.id, picked.property, picked.frame, next))
                  : null}
            />
            {#if curveError}<span class="error" role="alert">{curveError}</span>{/if}
            <button class="sm" onclick={() => (curveOpen = false)}>Done</button>
          </div>
        {/if}
      </span>
    {/if}
    <label title="Keep this value until the next keyframe (no tween), for frame-by-frame work"
      ><input
        type="checkbox"
        aria-label="Hold"
        checked={key.hold}
        onchange={(e) =>
          picked &&
          anim.setHold(
            picked.id,
            picked.property,
            picked.frame,
            (e.currentTarget as HTMLInputElement).checked,
          )}
      /> Hold</label
    >
    <label
      >Repeat
      <select
        aria-label="Repeat"
        value={track.repeat === undefined ? '' : String(track.repeat)}
        title="Play this property's keyframes again after the last one"
        onchange={setRepeat}
      >
        <option value="">No repeat</option>
        <option value="end">Until the end</option>
        {#each [1, 2, 3, 4, 5] as n (n)}
          <option value={String(n)}>{n} more time{n === 1 ? '' : 's'}</option>
        {/each}
      </select></label
    >
    <button
      class="sm"
      title="Copy the keyframes mirrored after the last one, so the motion runs back"
      onclick={() => picked && anim.reverse(picked.id, picked.property)}>Reverse</button
    >
    <button
      class="sm"
      aria-label="Delete keyframe"
      title="Delete this keyframe (or press Delete)"
      onclick={() => {
        if (!picked) return;
        anim.removeKeyframe(picked.id, picked.property, picked.frame);
        picked = null;
      }}><Icon name="delete" size={14} /> Delete</button
    >
  </div>
{/if}

<style>
  .key-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
    background: var(--bg-2);
  }
  .key-bar label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--tx-2);
  }
  .error {
    color: var(--danger);
    font-size: 11.5px;
  }
  .curve-wrap {
    position: relative;
  }
  .curve-button svg path {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
  }
  /* Upwards, over the stage: under the bar the timeline runs out at the window's foot. */
  .curve-pop {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    background: var(--bg-2);
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  }
  .key-name {
    font-weight: 600;
    margin-right: 6px;
  }
  /* One width for every choice (a menu sized by its chosen option would jump), and room on the
     right for the arrow. */
  select {
    width: 136px;
    height: 26px;
    font-size: 12px;
    padding: 0 22px 0 6px;
  }
</style>
