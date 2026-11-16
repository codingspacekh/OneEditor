<script lang="ts">
  // GT1 (M20): a text's spacing in Properties — letter spacing for the whole text and line
  // spacing, and the kerning of the two letters either side of the cursor in the words box (also
  // Alt+← / Alt+→ there). Spacing is in thousandths of the size, as tracking is in Illustrator
  // and Photoshop, so it grows and shrinks with the letters.
  import { kerningAt, withKerning } from '../../core/animation/kerning.ts';
  import type { TextObject } from '../../core/animation/types.ts';
  import Why from '../Why.svelte';
  import NumField from './NumField.svelte';

  let {
    text,
    caret,
    patch,
  }: {
    text: TextObject;
    /** Where the cursor is in the words box (null: not in it, or letters selected). */
    caret: number | null;
    /** The change, with the box refitted to the words (one undo step); why not. */
    patch: (change: Partial<TextObject>) => string | null;
  } = $props();

  const kerning = $derived(caret === null ? null : kerningAt(text, caret));
  /** The two letters the kerning is between, for the label. */
  const pair = $derived.by(() => {
    if (caret === null || kerning === null) return '';
    const before = [...text.text.slice(0, caret)].at(-1) ?? '';
    const after = [...text.text.slice(caret)][0] ?? '';
    return `${before}${after}`;
  });

  function kern(value: number): string | null {
    if (caret === null) return null;
    try {
      return patch({ kerning: withKerning(text, caret, value) });
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }
</script>

<div class="sec">
  <h4>Spacing <span class="syl">19.5 kerning and spacing</span></h4>
  <div class="two">
    <NumField
      label="Letter spacing"
      value={text.letterSpacing ?? 0}
      unit="/1000"
      commit={(v) => patch({ letterSpacing: v === 0 ? undefined : v })}
    />
    <NumField
      label="Line spacing"
      value={text.lineSpacing ?? 1.2}
      unit="×"
      decimals={2}
      commit={(v) => patch({ lineSpacing: v })}
    />
  </div>
  <NumField
    label={pair ? `Kerning ${pair}` : 'Kerning at the cursor'}
    value={kerning ?? 0}
    unit="/1000"
    disabled={kerning === null}
    commit={kern}
  />
  <p class="hint">
    In thousandths of the size: 100 adds a tenth of the size after every letter, below 0 closes them
    up. For kerning, put the cursor between two letters in the words above; Alt+← moves them closer,
    Alt+→ apart (with Shift, five times as far).
  </p>
  <Why tool="textSpacing" />
</div>
