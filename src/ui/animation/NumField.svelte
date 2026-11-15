<script lang="ts">
  // A number box of the Properties panel (AN6): exact values typed, applied on Enter or when
  // leaving the box; a refused value is explained right under it.
  let {
    label,
    value,
    unit = '',
    step = 1,
    decimals = 0,
    commit,
    disabled = false,
  }: {
    label: string;
    value: number;
    unit?: string;
    step?: number;
    decimals?: number;
    commit: (value: number) => string | null;
    disabled?: boolean;
  } = $props();

  let error: string | null = $state(null);
  const id = `num-${Math.random().toString(36).slice(2, 9)}`;
  const shown = $derived(Number.isFinite(value) ? value.toFixed(decimals) : '');
  /**
   * As wide as the numbers it holds need (the teacher's layout check: the boxes were wider than
   * their numbers, squeezing the labels): "-360", "100.0", "1280.00"; wider for a longer value.
   */
  const chars = $derived(Math.max(decimals === 0 ? 4 : decimals === 1 ? 5 : 7, shown.length));

  function onchange(event: Event): void {
    const text = (event.currentTarget as HTMLInputElement).value.trim().replace(unit, '');
    const n = text === '' ? NaN : Number(text);
    error = Number.isFinite(n) ? commit(n) : 'Type a number.';
  }
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="box" class:disabled>
    <input
      {id}
      type="text"
      inputmode="decimal"
      value={shown}
      style:width="{chars + 0.5}ch"
      {step}
      {disabled}
      {onchange}
      aria-invalid={error !== null}
    />
    {#if unit}<span class="unit">{unit}</span>{/if}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .field {
    display: grid;
    /* The label takes the room the box does not need. */
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 3px 6px;
    margin-bottom: 6px;
    min-width: 0;
  }
  label {
    color: var(--tx-2);
    font-size: 12px;
    line-height: 1.25;
  }
  .box {
    display: flex;
    align-items: center;
    background: var(--bg-2);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0 5px;
    min-width: 0;
  }
  .box.disabled {
    opacity: 0.5;
  }
  .box:focus-within {
    border-color: var(--accent);
  }
  input {
    flex: none;
    min-width: 0;
    border: 0;
    text-align: right;
    background: transparent;
    color: var(--tx-1);
    font: 500 12.5px var(--mono);
    padding: 4px 0;
    outline: none;
    height: auto;
    box-shadow: none;
    border-radius: 0;
  }
  input[aria-invalid='true'] {
    color: var(--danger);
  }
  .unit {
    margin-left: 2px;
    color: var(--tx-3);
    font-size: 10.5px;
  }
  .error {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--danger);
    font-size: 11.5px;
  }
</style>
