<script lang="ts">
  // Layers (AN7): the top layer is in front. Each layer can be hidden, locked, renamed, moved,
  // coloured and put in a folder; new objects go on the selected layer. Folder makes a folder
  // holding the selected layer; a layer is dragged onto a folder (in it), onto another layer (next
  // to it, in its folder) or onto empty space (out of its folder); a folder is renamed by
  // double-clicking it. G2, GB1 (M21), Graphics mode only: pixel layers (new, a picture as a
  // layer), each layer's opacity, blend mode and clipping mask, a pixel layer's layer mask,
  // duplicate, merge down, merge visible and flatten. 2026-11-18: under each layer, its objects
  // (front first; on a frame-by-frame layer, the drawing shown): a click selects one (Shift: one
  // more), a double-click renames it, its bin deletes it; the layer's arrow folds them away.
  import type { App } from '../../app/app.ts';
  import { editorOf } from './editor.ts';
  import type { LayerDrop } from '../../core/animation/layers.ts';
  import { objectsShown } from '../../core/animation/frames.ts';
  import { BLEND_MODES, type BlendMode, type Id, type Layer } from '../../core/animation/types.ts';
  import NumField from './NumField.svelte';
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

  // ---- 2026-11-18: the objects in each layer ----
  /** Layers whose object list is folded away (open unless folded). */
  let folded: Record<Id, boolean> = $state({});
  /** The objects listed under a layer, front first. */
  const objectsOf = (l: Layer) => (l.pixels ? [] : [...objectsShown(l, $store.frame)].reverse());
  let renamingObject: Id | null = $state(null);
  function commitObjectName(id: Id, event: Event): void {
    if (renamingObject !== id) return;
    renameError = anim.renameObject(id, (event.currentTarget as HTMLInputElement).value);
    if (!renameError) renamingObject = null;
  }
  function pickObject(id: Id, e: MouseEvent): void {
    const sel = $store.selection;
    if (e.shiftKey) anim.select(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
    else anim.select([id]);
  }

  // ---- G2, GB1 (M21): Graphics mode's layer look, masks and merging ----
  const current = $derived(doc.layers.find((l) => l.id === $store.layerId));
  const BLEND_LABELS: Record<BlendMode, string> = {
    normal: 'Normal',
    multiply: 'Multiply',
    screen: 'Screen',
    overlay: 'Overlay',
    darken: 'Darken',
    lighten: 'Lighten',
    colour: 'Colour',
    luminosity: 'Luminosity',
    difference: 'Difference',
  };
  let lookError: string | null = $state(null);
  function setBlend(id: Id, event: Event): void {
    lookError = anim.setLayerLook(id, {
      blend: (event.currentTarget as HTMLSelectElement).value as BlendMode,
    });
  }
</script>

<aside class="layers" aria-label="Layers">
  <div class="panel-h">Layers</div>
  <!-- issues/graphics-2.png: one row of equal icon buttons in two groups — make (a layer, a pixel
       layer, a picture, a folder, a template) and arrange (duplicate, up, down, delete) — which
       wrap as whole groups in a narrow panel, never one button at a time. -->
  <div class="actions" role="toolbar" aria-label="Layer actions">
    <div class="group" role="group" aria-label="New">
      <button
        class="sm icon-only"
        aria-label="Layer"
        title="New layer above the selected one"
        onclick={() => anim.addLayer()}><Icon name="plus" size={15} /></button
      >
      {#if editor.still}
        <!-- GB1 (M21): a pixel layer to paint on, or a picture's pixels as a layer. -->
        <button
          class="sm icon-only"
          aria-label="New pixel layer"
          title="New pixel layer: empty, the size of the image, to paint and select on"
          onclick={() => anim.addPixelLayer()}><Icon name="paintbrush" size={15} /></button
        >
        <button
          class="sm icon-only"
          aria-label="Add picture as layer"
          title="Add a picture (JPG, PNG, GIF, BMP or WebP) as a new pixel layer"
          onclick={() => anim.addPictureAsLayer()}><Icon name="image" size={15} /></button
        >
      {/if}
      <button
        class="sm icon-only"
        aria-label="Folder"
        title="New folder holding the selected layer: drag more layers onto it"
        onclick={() => anim.addFolder()}><Icon name="folder" size={15} /></button
      >
      <!-- GV8 (M19): a picture to draw over, on a template layer of its own at the bottom. -->
      <button
        class="sm icon-only"
        aria-label="Place template"
        title={withWhy(
          'Place template…: a picture under the drawing, faded and locked, to draw over (never exported)',
          'templateLayer',
        )}
        onclick={() => anim.placeTemplate()}><Icon name="template" size={15} /></button
      >
    </div>
    <div class="group" role="group" aria-label="Arrange">
      {#if editor.still}
        <button
          class="sm icon-only"
          aria-label="Duplicate layer"
          title="Duplicate the selected layer"
          disabled={!current}
          onclick={() => anim.duplicateLayer($store.layerId)}><Icon name="copy" size={15} /></button
        >
      {/if}
      <button
        class="sm icon-only"
        aria-label="Move layer up"
        title="Move the layer up (in front)"
        disabled={selectedIndex < 0 || selectedIndex >= doc.layers.length - 1}
        onclick={() => anim.moveLayer($store.layerId, selectedIndex + 1)}
        ><Icon name="up" size={15} /></button
      >
      <button
        class="sm icon-only"
        aria-label="Move layer down"
        title="Move the layer down (behind)"
        disabled={selectedIndex <= 0}
        onclick={() => anim.moveLayer($store.layerId, selectedIndex - 1)}
        ><Icon name="down" size={15} /></button
      >
      <button
        class="sm icon-only"
        aria-label="Delete layer"
        title="Delete the selected layer and its objects"
        disabled={doc.layers.length <= 1}
        onclick={() => anim.removeLayer($store.layerId)}><Icon name="delete" size={15} /></button
      >
    </div>
  </div>
  {#if editor.still && current}
    <!-- G2 (M21): how the selected layer is drawn, its layer mask, and merging. -->
    <div class="look" role="group" aria-label="Layer look">
      <!-- The properties grid (props.css), as in Properties: the fields start on one line. -->
      <div class="prop-row">
        <NumField
          label="Opacity"
          unit="%"
          value={Math.round((current.opacity ?? 1) * 100)}
          commit={(v) => anim.setLayerLook(current.id, { opacity: v / 100 })}
        />
      </div>
      <div class="prop-row">
        <label for="layer-blend">Blend</label>
        <select
          id="layer-blend"
          aria-label="Blend mode"
          value={current.blend ?? 'normal'}
          onchange={(e) => setBlend(current.id, e)}
        >
          {#each BLEND_MODES as mode (mode)}<option value={mode}>{BLEND_LABELS[mode]}</option
            >{/each}
        </select>
      </div>
      <div class="prop-buttons cmds">
        <button
          class="sm"
          class:on={current.clip}
          aria-pressed={current.clip === true}
          title={current.clip
            ? 'Clipped: seen only where the layer below has something drawn. Click to release it.'
            : 'Clipping mask: show this layer only where the layer below has something drawn (the photo inside the circle)'}
          disabled={selectedIndex <= 0}
          onclick={() => (lookError = anim.setLayerLook(current.id, { clip: !current.clip }))}
          >Clip</button
        >
        {#if current.pixels}
          {#if current.pixels.mask}
            <button
              class="sm"
              title="Apply the layer mask: what it hides becomes transparent"
              onclick={() => anim.removeLayerMask(current.id, true)}>Apply mask</button
            >
            <button
              class="sm"
              title="Delete the layer mask: the whole layer shows again"
              onclick={() => anim.removeLayerMask(current.id, false)}>Delete mask</button
            >
          {:else}
            <button
              class="sm"
              title="Add a layer mask: from the selection if there is one, else showing everything. Paint on it to hide parts without erasing them."
              onclick={() => anim.addLayerMask(current.id)}>Add mask</button
            >
          {/if}
        {/if}
        <button
          class="sm"
          title="Merge the selected layer into the layer below it (shapes and text become pixels)"
          disabled={selectedIndex <= 0}
          onclick={() => anim.mergeLayers('down')}>Merge down</button
        >
        <button
          class="sm"
          title="Merge every layer showing into one pixel layer"
          onclick={() => anim.mergeLayers('visible')}>Merge visible</button
        >
        <button
          class="sm"
          title="Flatten: every layer into one on the background; hidden layers are thrown away"
          onclick={() => anim.mergeLayers('flatten')}>Flatten</button
        >
      </div>
    </div>
    {#if lookError}<p class="error" role="alert">{lookError}</p>{/if}
  {/if}
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
          class:clipped={layer.clip === true}
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
          {#if objectsOf(layer).length}
            <button
              class="ghost sm icon-only twist"
              class:closed={folded[layer.id]}
              aria-label="{folded[layer.id] ? 'Show' : 'Hide'} the objects in {layer.name}"
              aria-expanded={!folded[layer.id]}
              title={folded[layer.id] ? 'Show its objects' : 'Hide its objects'}
              onclick={(e) => {
                e.stopPropagation();
                folded = { ...folded, [layer.id]: !folded[layer.id] };
              }}><Icon name="chevron" size={11} /></button
            >
          {:else}
            <span class="twist-space"></span>
          {/if}
          <span class="tag" style:background={layer.colour ?? 'var(--accent)'}></span>
          <button
            class="ghost sm icon-only"
            aria-label="{layer.visible ? 'Hide' : 'Show'} {layer.name}"
            aria-pressed={!layer.visible}
            title={layer.visible ? 'Hide the layer' : 'Show the layer'}
            onclick={(e) => {
              e.stopPropagation();
              anim.toggleLayer(layer.id, 'visible');
            }}><Icon name={layer.visible ? 'eye' : 'eyeOff'} size={13} /></button
          >
          <button
            class="ghost sm icon-only"
            aria-label="{layer.locked ? 'Unlock' : 'Lock'} {layer.name}"
            aria-pressed={layer.locked}
            title={layer.locked ? 'Unlock the layer' : 'Lock the layer (the padlock)'}
            onclick={(e) => {
              e.stopPropagation();
              anim.toggleLayer(layer.id, 'locked');
            }}><Icon name={layer.locked ? 'lock' : 'unlock'} size={13} /></button
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
            }}><Icon name="mask" size={13} /></button
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
            }}><Icon name="template" size={13} /></button
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
            <!-- The name on a line of its own (the whole width the icons leave), what the layer
                 is under it: its objects, or Pixels, Template, Mask, Clip. -->
            <span class="text">
              <span class="name" title="Double-click to rename; drag to move">{layer.name}</span>
              <span class="meta">
                {#if layer.template}<span class="badge" title="Faded, locked and never exported"
                    >Template</span
                  >{:else if layer.pixels}<span
                    class="badge"
                    title="A pixel layer: paint, select and erase its pixels">Pixels</span
                  >{#if layer.pixels.mask}<span class="badge" title="It has a layer mask">Mask</span
                    >{/if}{:else}<span class="count">{count(layer)}</span>{/if}
                {#if layer.clip}<span class="badge" title="Clipped to the layer below it">Clip</span
                  >{/if}
              </span>
            </span>
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
        {@const objects = objectsOf(layer)}
        {#if objects.length && !folded[layer.id]}
          <li class="objects" class:infolder={layer.folderId !== undefined} role="presentation">
            <ul aria-label="Objects in {layer.name}">
              {#each objects as o (o.id)}
                <li class="obj" class:sel={$store.selection.includes(o.id)}>
                  {#if renamingObject === o.id}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      class="rename"
                      aria-label="Object name"
                      value={o.name}
                      autofocus
                      aria-invalid={renameError !== null}
                      onchange={(e) => commitObjectName(o.id, e)}
                      onblur={(e) => commitObjectName(o.id, e)}
                      onkeydown={(e) => {
                        if (e.key === 'Escape') {
                          renamingObject = null;
                          renameError = null;
                        }
                      }}
                    />
                  {:else}
                    <button
                      class="ghost sm obj-name"
                      aria-label="Select {o.name}"
                      aria-pressed={$store.selection.includes(o.id)}
                      title="Click to select (Shift: one more) · double-click to rename"
                      onclick={(e) => pickObject(o.id, e)}
                      ondblclick={() => {
                        renameError = null;
                        renamingObject = o.id;
                      }}>{o.name}</button
                    >
                    <button
                      class="ghost sm icon-only"
                      aria-label="Delete {o.name}"
                      title="Delete {o.name}"
                      onclick={() => anim.deleteObject(o.id)}
                      ><Icon name="delete" size={11} /></button
                    >
                  {/if}
                </li>
              {/each}
            </ul>
          </li>
        {/if}
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
    font-size: 9.5px;
    line-height: 14px;
    padding: 0 5px;
    border-radius: 8px;
    border: 1px solid var(--line-strong);
    color: var(--tx-2);
  }
  .layers {
    /* N16: the size is the panel slot's (App, PanelSlot.svelte). */
    container: layers / inline-size;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-1);
    border-right: 1px solid var(--line);
  }
  /* issues/graphics-2.png: equal icon buttons, evenly spaced; the two groups wrap as wholes in a
     narrow panel (N10), the second one then under the first, both from the left. */
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 10px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .group {
    display: flex;
    gap: 4px;
  }
  /* (as specific as theme.css's button.sm.icon-only, which they would otherwise take) */
  .actions button.sm.icon-only {
    width: 28px;
    height: 28px;
    padding: 0;
    justify-content: center;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow: auto;
    flex: 1;
  }
  /* A layer's row: the colour, then its icons in columns of one width (so every row's icons line
     up), then its name with what it is under it. */
  .layer,
  .folder {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 2px;
    min-height: 34px;
    padding: 2px 8px 2px 6px;
    font-size: 12px;
    cursor: pointer;
    border-left: 3px solid transparent;
  }
  .layer > button.sm.icon-only,
  .folder > button.sm.icon-only {
    flex: none;
    width: 21px;
    height: 24px;
    padding: 0;
    justify-content: center;
  }
  .layer.infolder {
    padding-left: 14px;
  }
  /* 2026-11-18: a layer's objects, under it, in from its name. */
  .twist-space {
    flex: none;
    width: 21px;
  }
  .objects {
    padding: 0 8px 2px 34px;
  }
  .objects.infolder {
    padding-left: 42px;
  }
  .objects ul {
    list-style: none;
    margin: 0;
    padding: 0 0 0 6px;
    border-left: 1px solid var(--line);
  }
  .obj {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 24px;
    font-size: 11.5px;
    border-radius: 3px;
  }
  .obj.sel {
    background: var(--accent-soft);
  }
  .obj-name {
    flex: 1;
    min-width: 0;
    justify-content: flex-start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tx-2);
    font-weight: 400;
  }
  .obj.sel .obj-name {
    color: var(--tx-1);
  }
  .obj > button.sm.icon-only {
    flex: none;
    width: 21px;
    height: 22px;
    padding: 0;
    justify-content: center;
    opacity: 0.6;
  }
  .obj:hover > button.sm.icon-only,
  .obj.sel > button.sm.icon-only {
    opacity: 1;
  }
  /* G2 (M21): a layer clipped to the one below sits in from it. */
  .layer.clipped {
    padding-left: 22px;
  }
  .look {
    /* The properties grid's columns, as fractions only: the Layers panel is narrower than the
       Properties panel the grid's minimum widths are for, and here a row is a label with one
       field (Opacity in the first field column, Blend across). */
    --prop-cols: minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 0.6fr) minmax(0, 1fr);
    padding: 8px 8px 2px;
    border-bottom: 1px solid var(--line);
  }
  .look select {
    justify-content: safe flex-end;
  }
  /* Clip, the mask's buttons and the merges: two even columns, three in a wide panel; one left
     over fills its row. */
  .cmds {
    --n: 2;
  }
  .cmds > button:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
  @container layers (min-width: 300px) {
    .cmds {
      --n: 3;
    }
    .cmds > button:last-child:nth-child(odd) {
      grid-column: auto;
    }
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
    margin-right: 4px;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding-left: 4px;
    line-height: 1.25;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .folder .name {
    flex: 1;
    padding-left: 6px;
  }
  .meta {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }
  .meta:empty {
    display: none;
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
