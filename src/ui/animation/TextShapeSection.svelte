<script lang="ts">
  // GT3 (M20): a text set in a shape, in the Properties panel: how far in from the outline the
  // lines are (Padding), a hint when some words do not fit (they are not drawn), and *Take out of
  // shape* (a straight text again where the shape was).
  import type { App } from '../../app/app.ts';
  import { fontOf } from '../../core/animation/draw.ts';
  import { roughTextWidth } from '../../core/animation/factory.ts';
  import type { AnimObject, TextObject, TextShape } from '../../core/animation/types.ts';
  import { lettersLeftOut } from '../../core/graphics/text-shape.ts';
  import Why from '../Why.svelte';
  import { editorOf } from './editor.ts';
  import { textBox, type Measurer } from './measure.ts';
  import NumField from './NumField.svelte';

  let { app, text, inShape }: { app: App; text: TextObject; inShape: TextShape } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  let error: string | null = $state(null);

  /** The words measured in their font, as the stage measures them (roughly without a canvas). */
  let measurer: Measurer | null | undefined;
  function widthOf(t: TextObject): (s: string) => number {
    measurer ??=
      typeof document === 'undefined'
        ? null
        : (document.createElement('canvas').getContext('2d') as Measurer | null);
    const m = measurer;
    if (!m) return (s) => roughTextWidth(s, t.size);
    m.font = fontOf(t);
    return (s) => m.measureText(s).width;
  }
  const leftOut = $derived(lettersLeftOut({ ...text, inShape }, widthOf(text)));
</script>

<div class="sec">
  <h4>In a shape <span class="syl">19.5 setting text in a shape</span></h4>
  <NumField
    label="Padding"
    value={inShape.padding}
    unit="px"
    commit={(padding) =>
      anim.setProperties({ inShape: { ...inShape, padding } } as Partial<AnimObject>)}
  />
  {#if leftOut > 0}
    <p class="hint warn" role="status">
      Some words do not fit ({leftOut} letters left out). Make the text smaller, the padding less or the
      shape bigger.
    </p>
  {/if}
  <button
    class="sm"
    title="Make the words a straight text again"
    onclick={() => (error = anim.takeOffOutline((t) => textBox(t)))}>Take out of shape</button
  >
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <Why tool="textShape" />
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
    margin: 0 0 6px;
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .warn {
    color: var(--danger);
  }
  .error {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
