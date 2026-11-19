<script lang="ts">
  // 2026-11-18 (AN9): a custom ease drawn as a curve from the start (bottom left) to the end (top
  // right), time across and the share of the change up, with two handles to drag (or move with
  // the arrow keys, Shift: 10 times as far), as CSS's cubic-bezier and Animate's custom ease. A
  // handle above the box goes past the end; below it, the object pulls back first.
  import type { EaseCurve } from '../../core/animation/types.ts';

  let {
    curve,
    commit,
  }: {
    curve: EaseCurve;
    /** Called once a drag or a key press ends, with the new handles; returns why not. */
    commit: (curve: EaseCurve) => string | null;
  } = $props();

  /** The 0–1 square's size, and the room above and below it for handles that go past. */
  const S = 84;
  const PAD = 10;
  const ROOM = 34;
  const W = S + 2 * PAD;
  const H = S + 2 * ROOM;
  const Y_MIN = -ROOM / S;
  const Y_MAX = 1 + ROOM / S;

  let svg: SVGSVGElement | undefined = $state();
  /** The curve while a handle is dragged (null: the keyframe's own). */
  let dragging: EaseCurve | null = $state(null);
  const shown = $derived(dragging ?? curve);

  const px = (x: number) => PAD + x * S;
  const py = (y: number) => ROOM + (1 - y) * S;
  const round = (n: number) => Math.round(n * 100) / 100;
  const clampX = (x: number) => Math.max(0, Math.min(1, x));
  const clampY = (y: number) => Math.max(Y_MIN, Math.min(Y_MAX, y));

  function withHandle(c: EaseCurve, which: 0 | 1, x: number, y: number): EaseCurve {
    const next = [...c] as EaseCurve;
    next[which * 2] = round(clampX(x));
    next[which * 2 + 1] = round(clampY(y));
    return next;
  }

  function pointer(e: PointerEvent): { x: number; y: number } {
    const r = svg?.getBoundingClientRect() ?? { left: 0, top: 0, width: W, height: H };
    const sx = r.width ? W / r.width : 1;
    const sy = r.height ? H / r.height : 1;
    return {
      x: ((e.clientX - r.left) * sx - PAD) / S,
      y: 1 - ((e.clientY - r.top) * sy - ROOM) / S,
    };
  }

  function startDrag(e: PointerEvent, which: 0 | 1): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const move = (m: PointerEvent) => {
      const p = pointer(m);
      dragging = withHandle(dragging ?? curve, which, p.x, p.y);
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      move(u);
      const done = dragging;
      dragging = null;
      if (done) commit(done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onKey(e: KeyboardEvent, which: 0 | 1): void {
    const step = e.shiftKey ? 0.1 : 0.01;
    const by: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const d = by[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    commit(withHandle(curve, which, curve[which * 2]! + d[0], curve[which * 2 + 1]! + d[1]));
  }

  const path = $derived(
    `M ${px(0)} ${py(0)} C ${px(shown[0])} ${py(shown[1])} ${px(shown[2])} ${py(shown[3])} ${px(1)} ${py(1)}`,
  );
</script>

<div class="ease-curve">
  <svg
    bind:this={svg}
    viewBox="0 0 {W} {H}"
    width={W}
    height={H}
    role="group"
    aria-label="Ease curve"
  >
    <rect class="box" x={px(0)} y={py(1)} width={S} height={S} />
    <line class="diag" x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} />
    <line class="arm" x1={px(0)} y1={py(0)} x2={px(shown[0])} y2={py(shown[1])} />
    <line class="arm" x1={px(1)} y1={py(1)} x2={px(shown[2])} y2={py(shown[3])} />
    <path class="curve" d={path} />
    {#each [0, 1] as const as which (which)}
      <circle
        class="handle"
        cx={px(shown[which * 2]!)}
        cy={py(shown[which * 2 + 1]!)}
        r="6"
        role="slider"
        tabindex="0"
        aria-label="Curve handle {which + 1}"
        aria-valuetext="{shown[which * 2]}, {shown[which * 2 + 1]}"
        aria-valuenow={shown[which * 2 + 1]}
        onpointerdown={(e) => startDrag(e, which)}
        onkeydown={(e) => onKey(e, which)}
      >
        <title>Drag (or use the arrow keys) to shape the ease</title>
      </circle>
    {/each}
  </svg>
  <span class="values mono" aria-label="Curve numbers"
    >{shown.map((n) => n.toFixed(2)).join(', ')}</span
  >
</div>

<style>
  .ease-curve {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  svg {
    display: block;
    touch-action: none;
  }
  .box {
    fill: var(--bg-1);
    stroke: var(--line-strong);
    stroke-width: 1;
  }
  .diag {
    stroke: var(--line);
    stroke-dasharray: 3 3;
  }
  .arm {
    stroke: var(--tx-3);
    stroke-width: 1;
  }
  .curve {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
  }
  .handle {
    fill: var(--bg-0);
    stroke: var(--accent);
    stroke-width: 2;
    cursor: grab;
  }
  .handle:focus-visible {
    outline: none;
    stroke: var(--tx-1);
  }
  .values {
    white-space: nowrap;
    font-size: 10.5px;
    color: var(--tx-3);
  }
</style>
