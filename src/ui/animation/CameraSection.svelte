<script lang="ts">
  // 2026-11-18 (AN8, as Animate's camera): the camera, in Properties when nothing is selected —
  // where it is centred (X, Y), its zoom and its turn at the playhead (a keyframe after frame 0,
  // eased in and out), looking through it on the stage, its keyframe here removed, Reset.
  import type { App } from '../../app/app.ts';
  import { cameraAt, cameraKeyedAt } from '../../core/animation/camera.ts';
  import type { CameraProperty } from '../../core/animation/types.ts';
  import { animUi } from './animation-ui.svelte.ts';
  import { editorOf } from './editor.ts';
  import NumField from './NumField.svelte';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);
  const doc = $derived($store.history.present);
  const view = $derived(cameraAt(doc, $store.frame));
  const keyedHere = $derived(cameraKeyedAt(doc, $store.frame));
  let error: string | null = $state(null);
  // A field shows its own refusal under it.
  const set = (property: CameraProperty) => (v: number) => anim.setCamera(property, v);
</script>

<div class="sec" aria-label="Camera" role="group">
  <h4>Camera <span class="syl">20.1 animation</span></h4>
  <div class="prop-row">
    <NumField label="Camera X" value={view.x} decimals={1} commit={set('x')} />
    <NumField label="Camera Y" value={view.y} decimals={1} commit={set('y')} />
  </div>
  <div class="prop-row">
    <NumField label="Zoom" unit="%" value={view.zoom} decimals={1} commit={set('zoom')} />
    <NumField label="Turn" unit="°" value={view.rotation} decimals={1} commit={set('rotation')} />
  </div>
  <div class="prop-row">
    <label class="prop-check" title="See the stage as the camera sees it (editing is off meanwhile)"
      ><input
        type="checkbox"
        aria-label="Look through the camera"
        checked={animUi.cameraView}
        onchange={(e) => (animUi.cameraView = (e.currentTarget as HTMLInputElement).checked)}
      /> Look through the camera</label
    >
  </div>
  <div class="prop-buttons">
    <button
      class="sm"
      aria-label="Remove camera keyframe"
      title="Remove the camera's keyframes at the playhead"
      disabled={!keyedHere}
      onclick={() => (error = anim.removeCameraKeys())}>Remove keyframe</button
    >
    <button
      class="sm"
      title="Take the camera away: the whole stage is seen again"
      disabled={!doc.camera}
      onclick={() => {
        error = anim.resetCamera();
        animUi.cameraView = false;
      }}>Reset camera</button
    >
  </div>
  <p class="hint">
    Set where the camera looks at the playhead: a later frame makes a keyframe, and the camera
    glides between them. The dashed frame on the stage shows what the video, GIF and web page will
    show.
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
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
  .hint {
    margin: 4px 0 4px;
    color: var(--tx-2);
    font-size: 12px;
  }
  .error {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: 11.5px;
  }
</style>
