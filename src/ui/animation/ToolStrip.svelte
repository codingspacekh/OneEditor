<script lang="ts">
  // The tool strip beside the stage (as Animate's and Hype's toolboxes): the drawing tools
  // (AN3, AN4, AN5), Graphics mode's selection, painting and retouching tools (GB1–GB5), the
  // library, and the rulers / grid / snapping helpers (AN2). Vertical, so the header never grows
  // wider than the window. 2026-11-17 (issues/graphics-*.png: "instead of scroll, group and
  // classify the tools"): the tools come in families (tool-families.ts), as Photoshop's: one
  // button a family, showing the tool of it last used; holding it, right-clicking it or clicking
  // its corner opens the family's flyout. The view helpers are one View options flyout. So the
  // strip fits a small laptop's window without scrolling.
  import { tick } from 'svelte';
  import type { App } from '../../app/app.ts';
  import { editorOf } from './editor.ts';
  import { withWhy } from '../../core/effects/help.ts';
  import Icon, { type IconName } from '../Icon.svelte';
  import { animUi } from './animation-ui.svelte.ts';
  import {
    familiesFor,
    familyButtonName,
    VIEW_BUTTON,
    type ToolFamily,
    type ToolInfo,
  } from './tool-families.ts';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);
  const view = $derived($store.history.present.view);
  const families = $derived(familiesFor(editor.still));

  /** How long a press on a family's button opens its flyout (Photoshop's hold). */
  const HOLD_MS = 300;

  // A tool chosen any way (its button, its flyout, its key) is what its family shows next.
  $effect(() => {
    const tool = $store.tool;
    const f = families.find((x) => x.tools.some((t) => t.tool === tool));
    if (f && animUi.toolFamily[f.id] !== tool) animUi.toolFamily[f.id] = tool;
  });

  /** The tool a family's button shows: the one chosen, else the one of it last used. */
  function shown(f: ToolFamily): ToolInfo {
    const now = f.tools.find((t) => t.tool === $store.tool);
    if (now) return now;
    const last = f.tools.find((t) => t.tool === animUi.toolFamily[f.id]);
    return last ?? f.tools[0]!;
  }

  // ---- the flyout: one family's tools, or the view helpers ----
  /** The flyout that is open: a family's id, or 'view'. */
  let open: string | null = $state(null);
  let place = $state({ left: 0, top: 0 });
  let opener: HTMLElement | null = null;
  let menu: HTMLElement | null = $state(null);
  let held = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function show(id: string, from: HTMLElement) {
    opener = from.closest('.cell')?.querySelector<HTMLElement>('.tbtn') ?? from;
    const r = opener.getBoundingClientRect();
    place = { left: r.right + 6, top: r.top };
    open = id;
    await tick();
    if (!menu) return;
    // Kept on the screen: moved up when it would go below the window.
    const h = menu.getBoundingClientRect().height;
    if (place.top + h > window.innerHeight - 8)
      place = { ...place, top: Math.max(8, window.innerHeight - 8 - h) };
    const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    (items.find((i) => i.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
  }

  function close(refocus = false) {
    open = null;
    if (refocus) opener?.focus();
  }

  function pressStart(e: PointerEvent, f: ToolFamily) {
    held = false;
    if (e.button !== 0 || f.tools.length < 2) return;
    const el = e.currentTarget as HTMLElement;
    timer = setTimeout(() => {
      held = true;
      void show(f.id, el);
    }, HOLD_MS);
  }
  function pressEnd() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function use(t: ToolInfo) {
    // A press held to open the flyout chooses nothing by itself.
    if (held) {
      held = false;
      return;
    }
    anim.setTool(t.tool);
  }

  function pick(t: ToolInfo) {
    anim.setTool(t.tool);
    close(true);
  }

  function onMenuKey(e: KeyboardEvent) {
    const items = [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') close(true);
    else if (e.key === 'Tab') close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  // A press anywhere else closes it.
  $effect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const at = e.target as Node;
      if (menu?.contains(at) || opener?.closest('.cell')?.contains(at)) return;
      close();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  });

  const openFamily = $derived(families.find((f) => f.id === open));

  /** The view helpers (AN2, GV7, GB1), each shown and switched in the View options flyout. */
  const snapping = $derived(
    view.snap.grid || view.snap.guides || view.snap.objects || view.snap.pixels,
  );
  const helpers = $derived([
    {
      label: 'Rulers',
      icon: 'ruler' as IconName,
      on: view.rulers,
      title: withWhy('Show the rulers (drag a guide out of them)', 'rulersGrid'),
      flip: () => anim.setView({ rulers: !view.rulers }),
    },
    {
      label: 'Grid',
      icon: 'grid' as IconName,
      on: view.grid.show,
      title: withWhy(`Show the grid (${view.grid.size} px)`, 'rulersGrid'),
      flip: () => anim.setView({ grid: { ...view.grid, show: !view.grid.show } }),
    },
    {
      label: 'Snap',
      icon: 'snap' as IconName,
      on: snapping,
      title: withWhy('Snap to the grid, guides and objects (hold Alt to move freely)', 'snapping'),
      flip: () => {
        const on = !(view.snap.grid || view.snap.guides || view.snap.objects);
        anim.setView({ snap: { ...view.snap, grid: on, guides: on, objects: on } });
      },
    },
    // GV7 (M19): View ▸ Outline.
    {
      label: 'Outline view',
      icon: 'wireframe' as IconName,
      on: view.wireframe === true,
      title: withWhy(
        'Outline view: every shape as a thin line, no fills (⌘Y on a Mac, Ctrl+Shift+Y on Windows)',
        'outlineView',
      ),
      flip: () => anim.toggleOutline(),
    },
    // GB1 (M21): View ▸ Pixel grid (Graphics mode), drawn from 800 %.
    ...(editor.still
      ? [
          {
            label: 'Pixel grid',
            icon: 'grid' as IconName,
            on: animUi.pixelGrid,
            title: 'Pixel grid: a line round every pixel when zoomed in to 800 % or more',
            flip: () => (animUi.pixelGrid = !animUi.pixelGrid),
          },
        ]
      : []),
  ]);
</script>

<div class="strip">
  <div
    class="tools"
    role="toolbar"
    aria-label={editor.still ? 'Drawing tools' : 'Animation tools'}
    aria-orientation="vertical"
  >
    {#each families as f, i (f.id)}
      {@const t = shown(f)}
      {#if i > 0 && f.group !== families[i - 1]!.group}<div class="hsep"></div>{/if}
      <div class="cell">
        <button
          class="tbtn"
          aria-label={t.label}
          aria-pressed={$store.tool === t.tool}
          title={f.tools.length > 1
            ? `${t.title}\n(Hold for the other ${f.label.toLowerCase()} tools)`
            : t.title}
          onpointerdown={(e) => pressStart(e, f)}
          onpointerup={pressEnd}
          onpointerleave={pressEnd}
          oncontextmenu={(e) => {
            if (f.tools.length < 2) return;
            e.preventDefault();
            void show(f.id, e.currentTarget as HTMLElement);
          }}
          onclick={() => use(t)}><Icon name={t.icon as IconName} /></button
        >
        {#if f.tools.length > 1}
          <!-- The corner: the family's other tools (as Photoshop's little triangle). -->
          <button
            class="more"
            aria-label={familyButtonName(f)}
            aria-haspopup="menu"
            aria-expanded={open === f.id}
            tabindex="-1"
            title="The other {f.label.toLowerCase()} tools"
            onclick={(e) => (open === f.id ? close() : void show(f.id, e.currentTarget))}
          ></button>
        {/if}
      </div>
    {/each}
  </div>
  <div class="hsep"></div>
  <button
    class="tbtn"
    aria-label="Library"
    title={withWhy(
      'Library: ready-made cartoons, icons and backgrounds to add to the stage (K)',
      'animLibrary',
    )}
    onclick={() => (animUi.dialog = 'library')}><Icon name="sparkles" /></button
  >
  {#if !editor.still}
    <button
      class="tbtn"
      aria-label="Import frames"
      title={withWhy(
        'Import frames: a folder of pictures shown one after another (stop motion)',
        'animStopMotion',
      )}
      onclick={() => (animUi.dialog = 'frames')}><Icon name="import" /></button
    >
  {/if}
  <div class="tools" role="group" aria-label="Stage helpers">
    <div class="cell">
      <button
        class="tbtn"
        aria-label={VIEW_BUTTON}
        aria-haspopup="menu"
        aria-expanded={open === 'view'}
        title="View options: the rulers, the grid, snapping, the outline view{editor.still
          ? ' and the pixel grid'
          : ''}"
        onclick={(e) => (open === 'view' ? close() : void show('view', e.currentTarget))}
        ><Icon name="ruler" /></button
      >
      <span class="corner" aria-hidden="true"></span>
    </div>
  </div>

  {#if openFamily}
    <div
      class="flyout"
      role="menu"
      aria-label={openFamily.label}
      tabindex="-1"
      bind:this={menu}
      style:left="{place.left}px"
      style:top="{place.top}px"
      onkeydown={onMenuKey}
    >
      {#each openFamily.tools as t (t.tool)}
        <button
          role="menuitemradio"
          aria-label={t.label}
          aria-checked={$store.tool === t.tool}
          title={t.title}
          onclick={() => pick(t)}
        >
          <Icon name={t.icon as IconName} />
          <span class="name">{t.label}</span>
          {#if t.key}<kbd>{t.key}</kbd>{/if}
        </button>
      {/each}
    </div>
  {:else if open === 'view'}
    <div
      class="flyout"
      role="menu"
      aria-label="View options"
      tabindex="-1"
      bind:this={menu}
      style:left="{place.left}px"
      style:top="{place.top}px"
      onkeydown={onMenuKey}
    >
      {#each helpers as h (h.label)}
        <button
          role="menuitemcheckbox"
          aria-label={h.label}
          aria-checked={h.on}
          title={h.title}
          onclick={h.flip}
        >
          <Icon name={h.icon} />
          <span class="name">{h.label}</span>
          <span class="tick" aria-hidden="true">{h.on ? '✓' : ''}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .strip {
    width: 44px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    background: var(--bg-1);
    border-right: 1px solid var(--line);
    overflow: auto;
  }
  .tools {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .cell {
    position: relative;
  }
  .tbtn {
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    color: var(--tx-2);
  }
  .tbtn:hover:not(:disabled) {
    background: var(--bg-3);
    color: var(--tx-1);
  }
  .tbtn[aria-pressed='true'] {
    background: var(--bg-3);
    color: var(--tx-1);
    border-color: var(--line-strong);
  }
  /* The family's corner: a small triangle at the bottom right, its own (small) button. */
  .more,
  .corner {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 12px;
    height: 12px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .more::after,
  .corner::after {
    content: '';
    position: absolute;
    right: 3px;
    bottom: 3px;
    border-style: solid;
    border-width: 0 0 5px 5px;
    border-color: transparent transparent var(--tx-3) transparent;
  }
  .more:hover::after,
  .more[aria-expanded='true']::after {
    border-bottom-color: var(--tx-1);
  }
  .corner {
    pointer-events: none;
  }
  .hsep {
    width: 24px;
    height: 1px;
    margin: 3px 0;
    background: var(--line);
    flex: none;
  }
  /* The flyout: the family's tools by name and key, beside the strip, in front of everything. */
  .flyout {
    position: fixed;
    z-index: 50;
    min-width: 190px;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--bg-2);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  }
  .flyout button {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    align-items: center;
    gap: 10px;
    height: 30px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--tx-1);
    font-size: 12.5px;
    text-align: left;
  }
  .flyout button:hover,
  .flyout button:focus-visible {
    outline: none;
    background: var(--bg-3);
  }
  .flyout button[aria-checked='true'] {
    background: var(--accent-soft);
  }
  .flyout .name {
    white-space: nowrap;
  }
  .flyout kbd {
    font: 500 11px var(--mono);
    color: var(--tx-3);
  }
  .flyout .tick {
    color: var(--accent);
    font-weight: 700;
  }
  /* Short windows: smaller buttons so every tool stays reachable without scrolling. */
  @media (max-height: 760px) {
    .tbtn {
      width: 30px;
      height: 30px;
    }
    .strip {
      gap: 4px;
      padding: 6px 0;
    }
  }
</style>
