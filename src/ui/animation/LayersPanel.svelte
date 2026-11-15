<script lang="ts">
  // Layers (AN7): the top layer is in front. Each layer can be hidden, locked, renamed, moved,
  // coloured and put in a folder; new objects go on the selected layer. Folder makes a folder
  // holding the selected layer; a layer is dragged onto a folder (in it), onto another layer (next
  // to it, in its folder) or onto empty space (out of its folder); a folder is renamed by
  // double-clicking it.
  import type { App } from '../../app/app.ts';
  import { editorOf } from './editor.ts';
  import type { LayerDrop } from '../../core/animation/layers.ts';
  import type { Id, Layer } from '../../core/animation/types.ts';
  import { withWhy } from '../../core/effects/help.ts';
  import Icon from '../Icon.svelte';
  import Why from '../Why.svelte';
  import { ui } from '../ui-state.svelte.ts';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);
  const doc = $derived($store.history.present);
  /** Top first, grouped by folder (a folder's layers under its header). */
  const rows = $derived.by(() => {
    const top = [...doc.layers].reverse();
    const loose = top.filter((l) => !l.folderId || !doc.folders.some((f) => f.id === l.folderId));
    const out: (
      | { kind: 'folder'; id: string; name: string; open: boolean; count: number }
      | { kind: 'layer'; layer: Layer }
      | { kind: 'empty'; id: string }
    )[] = [];
    for (const folder of doc.folders) {
      const inside = top.filter((l) => l.folderId === folder.id);
      out.push({ ...folder, kind: 'folder', count: inside.length });
      if (!folder.open) continue;
      for (const layer of inside) out.push({ kind: 'layer', layer });
      if (!inside.length) out.push({ kind: 'empty', id: folder.id });
    }
    for (const layer of loose) out.push({ kind: 'layer', layer });
    return out;
  });
  const selectedIndex = $derived(doc.layers.findIndex((l) => l.id === $store.layerId));
  let renaming: string | null = $state(null);
  let renamingFolder: string | null = $state(null);
  /** The layer whose "In folder" box is open (Move to a folder). */
  let picking: Id | null = $state(null);
  let renameError: string | null = $state(null);

  function commitRename(id: string, event: Event): void {
    const name = (event.currentTarget as HTMLInputElement).value;
    renameError = anim.renameLayer(id, name);
    if (!renameError) renaming = null;
  }
  function commitFolderName(id: string, event: Event): void {
    if (renamingFolder !== id) return;
    const name = (event.currentTarget as HTMLInputElement).value;
    renameError = anim.renameFolder(id, name);
    if (!renameError) renamingFolder = null;
  }

  // ---- dragging a layer (AN7) ----
  let dragged: Id | null = $state(null);
  /** The row under the dragged layer: a layer's or folder's id. */
  let dropOn: Id | null = $state(null);

  function onDragStart(e: DragEvent, id: Id): void {
    dragged = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  }
  function onDragOver(e: DragEvent, on: Id | null): void {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropOn = on;
  }
  function onDrop(e: DragEvent, target: LayerDrop): void {
    e.preventDefault();
    e.stopPropagation();
    const id = dragged;
    endDrag();
    if (!id) return;
    if (typeof target === 'object' && 'layer' in target && target.layer === id) return;
    if (target === 'out' && !doc.layers.find((l) => l.id === id)?.folderId) return;
    anim.dropLayer(id, target);
  }
  function endDrag(): void {
    dragged = null;
    dropOn = null;
  }
  const count = (l: Layer) => `${l.objects.length} object${l.objects.length === 1 ? '' : 's'}`;
</script>

<aside class="layers" aria-label="Layers">
  <div class="panel-h">Layers</div>
  <div class="actions">
    <button class="sm" title="New layer above the selected one" onclick={() => anim.addLayer()}>
      <Icon name="plus" size={14} /> Layer
    </button>
    <button
      class="sm"
      title="New folder holding the selected layer: drag more layers onto it"
      onclick={() => anim.addFolder()}
    >
      <Icon name="folder" size={14} /> Folder
    </button>
    <!-- GV8 (M19): a picture to draw over, on a template layer of its own at the bottom. -->
    <button
      class="sm icon-only"
      aria-label="Place template"
      title={withWhy(
        'Place template…: a picture under the drawing, faded and locked, to draw over (never exported)',
        'templateLayer',
      )}
      onclick={() => anim.placeTemplate()}><Icon name="template" size={14} /></button
    >
    <span class="spacer"></span>
    <button
      class="sm icon-only"
      aria-label="Move layer up"
      title="Move the layer up (in front)"
      disabled={selectedIndex < 0 || selectedIndex >= doc.layers.length - 1}
      onclick={() => anim.moveLayer($store.layerId, selectedIndex + 1)}
      ><Icon name="up" size={14} /></button
    >
    <button
      class="sm icon-only"
      aria-label="Move layer down"
      title="Move the layer down (behind)"
      disabled={selectedIndex <= 0}
      onclick={() => anim.moveLayer($store.layerId, selectedIndex - 1)}
      ><Icon name="down" size={14} /></button
    >
    <button
      class="sm icon-only"
      aria-label="Delete layer"
      title="Delete the selected layer and its objects"
      disabled={doc.layers.length <= 1}
      onclick={() => anim.removeLayer($store.layerId)}><Icon name="delete" size={14} /></button
    >
  </div>
  <ul
    class="list"
    role="listbox"
    aria-label="Layer list"
    tabindex="-1"
    ondragover={(e) => onDragOver(e, null)}
    ondrop={(e) => onDrop(e, 'out')}
  >
    {#each rows as row (row.kind === 'layer' ? row.layer.id : `${row.kind}${row.id}`)}
      {#if row.kind === 'folder'}
        <li
          class="folder"
          class:drop={dropOn === row.id}
          ondragover={(e) => onDragOver(e, row.id)}
          ondrop={(e) => onDrop(e, { folder: row.id })}
        >
          <button
            class="ghost sm icon-only twist"
            class:closed={!row.open}
            aria-label="{row.open ? 'Close' : 'Open'} folder {row.name}"
            onclick={() => anim.setFolderOpen(row.id, !row.open)}
          >
            <Icon name="chevron" size={12} />
          </button>
          <Icon name="folder" size={14} />
          {#if renamingFolder === row.id}
            <input
              class="rename"
              aria-label="Folder name"
              value={row.name}
              aria-invalid={renameError !== null}
              onchange={(e) => commitFolderName(row.id, e)}
              onblur={(e) => commitFolderName(row.id, e)}
              onkeydown={(e) => {
                if (e.key === 'Escape') {
                  renamingFolder = null;
                  renameError = null;
                }
              }}
            />
          {:else}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="name"
              title="Double-click to rename"
              ondblclick={() => (renamingFolder = row.id)}>{row.name}</span
            >
            <span class="count">{row.count} layer{row.count === 1 ? '' : 's'}</span>
          {/if}
          <button
            class="ghost sm icon-only"
            aria-label="Delete folder {row.name}"
            title="Delete the folder (its layers stay)"
            onclick={() => anim.removeFolder(row.id)}
          >
            <Icon name="delete" size={12} />
          </button>
        </li>
      {:else if row.kind === 'empty'}
        <li
          class="empty"
          class:drop={dropOn === row.id}
          ondragover={(e) => onDragOver(e, row.id)}
          ondrop={(e) => onDrop(e, { folder: row.id })}
        >
          Empty: drag layers here
        </li>
      {:else}
        {@const layer = row.layer}
        <li
          class="layer"
          class:cur={layer.id === $store.layerId}
          class:infolder={layer.folderId !== undefined}
          class:drop={dropOn === layer.id && dragged !== layer.id}
          class:dragging={dragged === layer.id}
          role="option"
          aria-selected={layer.id === $store.layerId}
          aria-label={layer.name}
          tabindex="0"
          draggable={renaming !== layer.id}
          ondragstart={(e) => onDragStart(e, layer.id)}
          ondragend={endDrag}
          ondragover={(e) => onDragOver(e, layer.id)}
          ondrop={(e) => onDrop(e, { layer: layer.id })}
          onclick={() => anim.selectLayer(layer.id)}
          onkeydown={(e) => e.key === 'Enter' && anim.selectLayer(layer.id)}
          ondblclick={() => (renaming = layer.id)}
        >
          <span class="tag" style:background={layer.colour ?? 'var(--accent)'}></span>
          <button
            class="ghost sm icon-only"
            aria-label="{layer.visible ? 'Hide' : 'Show'} {layer.name}"
            aria-pressed={!layer.visible}
            title={layer.visible ? 'Hide the layer' : 'Show the layer'}
            onclick={(e) => {
              e.stopPropagation();
              anim.toggleLayer(layer.id, 'visible');
            }}><Icon name={layer.visible ? 'eye' : 'eyeOff'} size={14} /></button
          >
          <button
            class="ghost sm icon-only"
            aria-label="{layer.locked ? 'Unlock' : 'Lock'} {layer.name}"
            aria-pressed={layer.locked}
            title={layer.locked ? 'Unlock the layer' : 'Lock the layer (the padlock)'}
            onclick={(e) => {
              e.stopPropagation();
              anim.toggleLayer(layer.id, 'locked');
            }}><Icon name={layer.locked ? 'lock' : 'unlock'} size={14} /></button
          >
          <button
            class="ghost sm icon-only"
            class:on={layer.mask}
            aria-label="Mask {layer.name}"
            aria-pressed={layer.mask === true}
            title={layer.mask
              ? 'This layer is a mask: only what is under its shapes shows of the layer beneath. Lock it to see the effect.'
              : 'Make this layer a mask for the layer beneath it'}
            onclick={(e) => {
              e.stopPropagation();
              anim.toggleLayer(layer.id, 'mask');
            }}><Icon name="mask" size={14} /></button
          >
          <button
            class="ghost sm icon-only"
            class:on={layer.template}
            aria-label="Template {layer.name}"
            aria-pressed={layer.template === true}
            title={layer.template
              ? 'This layer is a template: faded, locked and never exported. Click to make it an ordinary layer.'
              : 'Make this layer a template: faded and locked, to draw over, and never exported'}
            onclick={(e) => {
              e.stopPropagation();
              anim.toggleTemplate(layer.id);
            }}><Icon name="template" size={14} /></button
          >
          {#if renaming === layer.id}
            <input
              class="rename"
              aria-label="Layer name"
              value={layer.name}
              aria-invalid={renameError !== null}
              onchange={(e) => commitRename(layer.id, e)}
              onblur={(e) => commitRename(layer.id, e)}
              onkeydown={(e) => e.key === 'Escape' && (renaming = null)}
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <span class="name" title="Double-click to rename; drag to move">{layer.name}</span>
            <!-- The selected layer shows its folder button instead, so its name keeps its room. -->
            {#if !(doc.folders.length && layer.id === $store.layerId)}
              {#if layer.template}<span class="badge" title="Faded, locked and never exported"
                  >Template</span
                >{:else}<span class="count">{count(layer)}</span>{/if}
            {/if}
          {/if}
          {#if doc.folders.length && layer.id === $store.layerId}
            <button
              class="ghost sm icon-only"
              class:on={picking === layer.id}
              aria-label="Move {layer.name} to a folder"
              aria-expanded={picking === layer.id}
              title="Move to a folder (or drag the layer onto one)"
              onclick={(e) => {
                e.stopPropagation();
                picking = picking === layer.id ? null : layer.id;
              }}><Icon name="folder" size={14} /></button
            >
          {/if}
          {#if picking === layer.id && layer.id === $store.layerId}
            <!-- Only when asked for, on a line of its own, so the layer's name keeps its room. -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <label class="in-folder" onclick={(e) => e.stopPropagation()}>
              In folder
              <!-- svelte-ignore a11y_autofocus -->
              <select
                aria-label="Folder of {layer.name}"
                value={layer.folderId ?? ''}
                autofocus
                onchange={(e) => {
                  picking = null;
                  anim.moveLayerToFolder(
                    layer.id,
                    (e.currentTarget as HTMLSelectElement).value || null,
                  );
                }}
                onblur={() => (picking = null)}
                onkeydown={(e) => e.key === 'Escape' && (picking = null)}
              >
                <option value="">No folder</option>
                {#each doc.folders as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
              </select>
            </label>
          {/if}
        </li>
      {/if}
    {/each}
  </ul>
  {#if renameError}<p class="error" role="alert">{renameError}</p>{/if}
  {#if ui.showWhy}<div class="why">
      <Why tool={editor.still ? 'graphicLayers' : 'animLayers'} title="Why use layers?" /><Why
        tool="animMask"
        title="Why use a mask?"
      />
    </div>{/if}
</aside>

<style>
  .on {
    color: var(--accent);
  }
  /* GV8 (M19): a template layer's badge, where the count of objects is. */
  .badge {
    flex: none;
    font-size: 10px;
    padding: 0 5px;
    border-radius: 8px;
    border: 1px solid var(--line-strong);
    color: var(--tx-2);
  }
  .layers {
    /* N16: the size is the panel slot's (App, PanelSlot.svelte). */
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-1);
    border-right: 1px solid var(--line);
  }
  .actions {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow: auto;
    flex: 1;
  }
  .layer,
  .folder {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: 3px 8px 3px 6px;
    font-size: 12px;
    cursor: pointer;
    border-left: 3px solid transparent;
  }
  .layer.infolder {
    padding-left: 18px;
  }
  .layer.cur {
    background: var(--bg-3);
    border-left-color: var(--accent);
  }
  .folder {
    color: var(--tx-2);
    cursor: default;
    font-weight: 500;
  }
  .twist :global(svg) {
    transition: transform 0.1s;
  }
  .twist.closed :global(svg) {
    transform: rotate(-90deg);
  }
  .layer.dragging {
    opacity: 0.5;
  }
  /* Where the dragged layer goes: in front of (above) a layer, or into a folder. */
  .layer.drop {
    box-shadow: inset 0 2px 0 var(--accent);
  }
  .folder.drop,
  .empty.drop {
    background: var(--accent-soft);
    outline: 1px dashed var(--accent);
    outline-offset: -1px;
  }
  .empty {
    padding: 4px 8px 4px 30px;
    color: var(--tx-3);
    font-size: 11.5px;
    font-style: italic;
  }
  .tag {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex: none;
    margin-right: 2px;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: 4px;
  }
  .count {
    color: var(--tx-3);
    font-size: 10.5px;
    white-space: nowrap;
  }
  .rename {
    flex: 1;
    min-width: 0;
    font: inherit;
    background: var(--bg-2);
    color: var(--tx-1);
    border: 1px solid var(--accent);
    border-radius: 3px;
    padding: 1px 4px;
  }
  .in-folder {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0 2px 64px;
    color: var(--tx-2);
    font-size: 11.5px;
  }
  .in-folder select {
    flex: 1;
    min-width: 0;
    max-width: 160px;
    font-size: 11.5px;
  }
  .error {
    margin: 0;
    padding: 4px 10px;
    color: var(--danger);
    font-size: 11.5px;
  }
  .why {
    padding: 6px 10px 8px;
    border-top: 1px solid var(--line);
  }
</style>
