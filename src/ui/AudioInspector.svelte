<script lang="ts">
  // Music or voiceover in Video mode (screen 08, V13): start, trim, volume, fades, lowering the
  // music under the voiceover, and which track it is on.
  import Why from './Why.svelte';
  import type { App } from '../app/app.ts';
  import {
    addVolumeChange,
    moveAudioToTrack,
    moveTimedItem,
    removeVolumeChange,
    setAudioFades,
    setAudioVolume,
    setDucking,
    setSoundSpeed,
    setVolumeChange,
    trimAudio,
  } from '../app/commands.ts';
  import { VOLUME_RAMP } from '../core/model/volume-changes.ts';
  import { AUDIO_TRACK_NAMES, audioDuration, mainTrackDuration } from '../core/model/timeline.ts';
  import type { AudioItem, AudioTrackIndex, VolumeChange } from '../core/model/types.ts';
  import { fileNameOf } from '../core/project/relocate.ts';
  import { mediaName } from '../core/audio/sound-effects.ts';
  import Icon from './Icon.svelte';
  import PercentField from './PercentField.svelte';
  import NumberField from './NumberField.svelte';
  import TimeField from './TimeField.svelte';

  let { app, item, track }: { app: App; item: AudioItem; track: AudioTrackIndex } = $props();
  const KIND = ['music', 'voice', 'fx', 'fx'] as const;
  const ICON = ['music', 'mic', 'sfx', 'sfx'] as const;
  const store = $derived(app.store);
  const project = $derived($store.history.present);
  const asset = $derived(project.media.find((m) => m.id === item.assetId));
  const videoEnd = $derived(mainTrackDuration(project.timeline.main));
  const length = $derived(audioDuration(item));
  const speed = $derived(item.speed ?? 1);
  const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];
  const end = $derived(Math.min(item.start + length, videoEnd));
  let actionError: string | null = $state(null);
  let changeError: string | null = $state(null);
  const changes = $derived(item.volumeChanges ?? []);

  /** V13: a new change from the playhead (or the sound's start) for up to 5 s, at 50 %. */
  function addChange(): void {
    const at = $store.playhead;
    const from = at >= item.start && at < end ? at : item.start;
    const to = Math.max(Math.min(from + 5, end), from + 0.5);
    const round = (t: number) => Math.round(t * 100) / 100;
    changeError = app.edit(
      addVolumeChange(item.id, { from: round(from), to: round(to), volume: 0.5 }),
    );
  }

  const summary = (c: VolumeChange) =>
    `${Math.round(c.volume * 100)} % from ${c.from.toFixed(2)} s to ${c.to.toFixed(2)} s`;
  const editChange = (index: number, change: Partial<VolumeChange>): string | null =>
    app.edit(setVolumeChange(item.id, index, { ...changes[index]!, ...change }));
</script>

<div class="head">
  <div class="thumb {KIND[track]}">
    <Icon name={ICON[track]} />
  </div>
  <div class="who">
    <div class="title">{asset ? mediaName(asset, fileNameOf(asset.path)) : 'Missing file'}</div>
    <div class="kind">
      {AUDIO_TRACK_NAMES[track]} · Audio {track + 1} ·
      <span class="len">{length.toFixed(2)} s</span>
    </div>
  </div>
</div>

<section>
  <h3>
    <Icon name="music" size={14} /> Position &amp; trim <span class="syl">11.1 adding audio</span>
  </h3>
  <div class="prop-row">
    <TimeField
      label="Starts at"
      value={item.start}
      commit={(t) => app.edit(moveTimedItem(item.id, t))}
    />
  </div>
  <div class="prop-buttons">
    <button onclick={() => (actionError = app.edit(moveTimedItem(item.id, $store.playhead)))}
      >Start at the playhead</button
    >
  </div>
  {#if actionError}<p class="error" role="alert">{actionError}</p>{/if}
  <div class="prop-row">
    <TimeField
      label="Trim start"
      value={item.in}
      commit={(t) => app.edit(trimAudio(item.id, { in: t, out: item.out }))}
    />
    <TimeField
      label="Trim end"
      value={item.out}
      commit={(t) => app.edit(trimAudio(item.id, { in: item.in, out: t }))}
    />
  </div>
  <p class="hint">
    {#if item.start >= videoEnd}
      Starts after the video ends ({videoEnd.toFixed(2)} s), so it will not be heard.
    {:else}
      Plays {item.start.toFixed(2)} – {end.toFixed(2)} s{item.start + length > videoEnd + 1e-9
        ? ', ending with the video'
        : ''}.
    {/if}
  </p>
</section>

<section>
  <h3><Icon name="speed" size={14} /> Speed <span class="syl">11.1</span></h3>
  <div class="prop-buttons speeds" style:--n="6">
    {#each SPEEDS as s (s)}
      <button
        aria-pressed={speed === s}
        onclick={() => (actionError = app.edit(setSoundSpeed(item.id, s)))}>{s}×</button
      >
    {/each}
  </div>
  <div class="prop-row">
    <NumberField
      label="Speed"
      value={speed}
      unit="×"
      example="1.25"
      commit={(n) => app.edit(setSoundSpeed(item.id, n))}
    />
  </div>
  <p class="hint">
    {(item.out - item.in).toFixed(2)} s ÷ {speed} = {length.toFixed(2)} s on the timeline. The pitch stays
    the same.
  </p>
</section>

<section>
  <h3>
    <Icon name="volume" size={14} /> Volume &amp; fades <span class="syl">11.1 editing audio</span>
  </h3>
  <div class="prop-row">
    <PercentField
      label="Volume"
      value={item.volume}
      commit={(v) => app.edit(setAudioVolume(item.id, v))}
    />
  </div>
  <div class="prop-row">
    <TimeField
      label="Fade in"
      value={item.fadeIn}
      commit={(t) => app.edit(setAudioFades(item.id, { in: t, out: item.fadeOut }))}
    />
    <TimeField
      label="Fade out"
      value={item.fadeOut}
      commit={(t) => app.edit(setAudioFades(item.id, { in: item.fadeIn, out: t }))}
    />
  </div>
  {#if track === 0}
    <div class="prop-row">
      <label class="prop-check">
        <input
          type="checkbox"
          checked={item.duck === true}
          onchange={(e) => (actionError = app.edit(setDucking(item.id, e.currentTarget.checked)))}
        />
        Lower under voiceover (−6 dB)
      </label>
    </div>
    <p class="hint">Makes the voiceover easier to hear over the music.</p>
  {/if}
</section>

<section>
  <h3>
    <Icon name="volume" size={14} /> Volume changes <span class="syl">11.1 editing audio</span>
  </h3>
  {#each changes as change, i (i)}
    <div class="change" role="group" aria-label={`Volume change ${i + 1}`}>
      <div class="change-head">
        <span>{summary(change)}</span>
        <button
          aria-label={`Remove volume change ${i + 1}`}
          title="Remove this volume change"
          onclick={() => (changeError = app.edit(removeVolumeChange(item.id, i)))}
          ><Icon name="delete" size={12} /></button
        >
      </div>
      <div class="prop-row">
        <TimeField label="From" value={change.from} commit={(t) => editChange(i, { from: t })} />
        <TimeField label="To" value={change.to} commit={(t) => editChange(i, { to: t })} />
        <PercentField
          label="New volume"
          value={change.volume}
          commit={(v) => editChange(i, { volume: v })}
        />
        <TimeField
          label="Glide"
          value={change.ramp ?? VOLUME_RAMP}
          commit={(t) => editChange(i, { ramp: t })}
        />
      </div>
    </div>
  {/each}
  <div class="prop-buttons">
    <button onclick={addChange}>Add a volume change</button>
  </div>
  {#if changeError}<p class="error" role="alert">{changeError}</p>{/if}
  <p class="hint">
    Quieter or louder between two times on the timeline, e.g. the music at 30 % from 10 s to 15 s.
    The sound glides to the new volume just before "From" and back just after "To", so it does not
    click.{track === 0 ? ' Lowering under the voiceover still applies on top.' : ''}
  </p>
</section>

<section>
  <div class="prop-row">
    <label for="audio-track">Track</label>
    <select
      id="audio-track"
      value={String(track)}
      onchange={(e) =>
        (actionError = app.edit(
          moveAudioToTrack(item.id, Number(e.currentTarget.value) as AudioTrackIndex),
        ))}
    >
      {#each AUDIO_TRACK_NAMES as name, i (name)}
        <option value={String(i)}>{name} (Audio {i + 1})</option>
      {/each}
    </select>
  </div>
  <p class="hint">
    Echo, EQ, noise reduction, pitch and more are in Audio mode: open the sound there (the mode
    switch at the top).
  </p>
  <Why tool="audio" title="Why add music or a voiceover?" />
</section>

<style>
  .head {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid var(--line);
  }
  .thumb {
    width: 54px;
    height: 32px;
    flex: none;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #06241a;
  }
  .thumb.music {
    background: var(--c-music);
  }
  .thumb.voice {
    background: var(--c-voice);
  }
  .thumb.fx {
    background: var(--c-fx);
  }
  .who {
    min-width: 0;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kind {
    color: var(--tx-3);
    font-size: 12px;
  }
  section {
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
  }
  h3 {
    font-size: 12.5px;
    margin: 0 0 8px;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .syl {
    font-size: 10px;
    color: var(--tx-3);
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    padding: 0 4px;
  }
  .prop-buttons button {
    font-size: 12px;
  }
  .speeds button[aria-pressed='true'] {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .hint {
    color: var(--tx-3);
    font-size: 11.5px;
    margin: 6px 0 0;
  }
  .change {
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 8px;
  }
  .change-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--tx-2);
    margin-bottom: 4px;
  }
  .change-head button {
    padding: 2px 6px;
  }
  .error {
    margin: 0 0 8px;
    color: var(--danger);
    font-size: 11.5px;
  }
</style>
