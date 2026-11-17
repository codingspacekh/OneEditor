// What every part of Animation mode shares: the store, running a command as one undo step
// (refused edits become a message, or a reason for the field that asked), the player (an edit
// pauses it), and small questions about the selection and the current layer. Each feature
// (files, exporting, pictures, drawing, timeline, document) is a module taking this context.
import type * as cmd from '../animation-commands.ts';
import { createHistory, execute } from '../history.ts';
import { HISTORY_BUDGET, keepWithin } from './history-budget.ts';
import { createStore, type Store } from '../store.ts';
import { roughTextWidth } from '../../core/animation/factory.ts';
import { isShown } from '../../core/animation/frames.ts';
import type { AnimationDoc, Id, Layer } from '../../core/animation/types.ts';
import type { Mask } from '../../core/graphics/pixels/raster.ts';
import { EditError, MediaError, ProjectFileError } from '../../core/model/errors.ts';
import type { PageAssets, StageRenderer } from '../../core/ports.ts';
import { fileNameOf } from '../../core/project/relocate.ts';
import { IN_PROCESS_PIXELS } from '../../core/graphics/pixels/jobs.ts';
import type { AnimationDeps, AnimationState } from './state.ts';
import { ANIMATION_KIND, withoutExtension } from './kind.ts';
import { unexpected } from '../problems.ts';

export { UNEXPECTED } from '../problems.ts';

const NO_RENDERER: StageRenderer = {
  renderPng: () => Promise.reject(new EditError('Exporting needs the OneEditor app.')),
  renderJpeg: () => Promise.reject(new EditError('Exporting needs the OneEditor app.')),
  pixels: () => Promise.reject(new EditError('Tracing needs the OneEditor app.')),
  renderPixels: () => Promise.reject(new EditError('Merging layers needs the OneEditor app.')),
  textTops: async () => ({}), // the SVG then keeps the font's own top edge
  // AN26: curved text then has its letters roughly where the stage puts them.
  textWidths: async () => (font, text) =>
    roughTextWidth(text, Number(/([\d.]+)px/.exec(font)?.[1] ?? 0)),
};
const NO_PAGE_ASSETS: PageAssets = {
  playerScript: () => Promise.reject(new EditError('Exporting needs the OneEditor app.')),
  pictureDataUrl: () => Promise.reject(new EditError('Exporting needs the OneEditor app.')),
  fontDataUrl: () => Promise.reject(new EditError('Exporting needs the OneEditor app.')),
  soundDataUrl: () => Promise.reject(new EditError('Exporting needs the OneEditor app.')),
  openTest: () => Promise.reject(new EditError('Testing needs the OneEditor app.')),
  svgToPdf: () => Promise.reject(new EditError('Exporting needs the OneEditor app.')),
};

/** The playback clock ticks this often; the frame follows the time, so slow laptops drop frames. */
const TICK_MS = 10;

export function createAnimationContext(deps: AnimationDeps) {
  const services = {
    ...deps,
    renderer: deps.renderer ?? NO_RENDERER,
    pageAssets: deps.pageAssets ?? NO_PAGE_ASSETS,
    autosaveMs: deps.autosaveMs ?? 60_000,
    pixelWorker: deps.pixelWorker ?? IN_PROCESS_PIXELS,
    historyBudget: deps.historyBudget ?? HISTORY_BUDGET,
  };
  /** M18: an animation, or Graphics mode's image (one frame, its own file type). */
  const kind = deps.kind ?? ANIMATION_KIND;
  const fresh = kind.fresh();
  const store: Store<AnimationState> = createStore<AnimationState>({
    history: createHistory(fresh),
    path: null,
    saved: fresh,
    selection: [],
    layerId: fresh.layers[0]!.id,
    tool: 'select',
    zoom: 'fit',
    frame: 0,
    playing: false,
    loop: { on: false },
    onionSkin: false,
    exporting: null,
    busy: null,
    message: null,
  });
  const patch = (change: Partial<AnimationState>) => store.update((s) => ({ ...s, ...change }));
  const present = (): AnimationDoc => store.get().history.present;

  function showError(error: unknown): void {
    const known =
      error instanceof EditError ||
      error instanceof MediaError ||
      error instanceof ProjectFileError;
    patch({
      message: { kind: 'error', text: known ? (error as Error).message : unexpected(error) },
    });
  }

  // ---- the player (AN8) ----

  let player: ReturnType<typeof setInterval> | null = null;
  /** AN28: plays the sounds from a frame to a frame (not heard) while the animation plays. */
  let soundtrack: { play(from: number, end: number): void; stop(): void } | null = null;

  function pause(): void {
    if (player) clearInterval(player);
    player = null;
    soundtrack?.stop();
    if (store.get().playing) patch({ playing: false });
  }

  /** The frames playback runs over: [first, last]; `wraps` when it loops. */
  function playRange(): { first: number; last: number; wraps: boolean } {
    const { loop } = store.get();
    const { length } = present().stage;
    if (loop.on && loop.from !== undefined && loop.to !== undefined)
      return { first: loop.from, last: loop.to, wraps: true };
    // Looping the whole animation does not show the end frame and frame 0 one after the other.
    return loop.on
      ? { first: 0, last: length - 1, wraps: true }
      : { first: 0, last: length, wraps: false };
  }

  function play(): void {
    pause();
    const { first, last, wraps } = playRange();
    let from = store.get().frame;
    if (from < first || from >= last) from = first;
    patch({ playing: true, frame: from });
    // AN28: the sounds to the end, or to the end of the loop (its last frame is shown).
    const end = wraps ? last + 1 : last;
    soundtrack?.play(from, end);
    let round = 0;
    const started = Date.now();
    const fps = present().stage.fps;
    player = setInterval(() => {
      const n = Math.floor(((Date.now() - started) * fps) / 1000);
      let frame = from + n;
      if (wraps) {
        const span = last - first + 1;
        // Each time round the loop its sounds play again from its first frame.
        const now = Math.floor((frame - first) / span);
        if (now !== round) {
          round = now;
          soundtrack?.play(first, end);
        }
        frame = first + ((frame - first) % span);
      } else if (frame >= last) {
        patch({ frame: last });
        pause();
        return;
      }
      if (frame !== store.get().frame) patch({ frame });
    }, TICK_MS);
    (player as { unref?: () => void }).unref?.();
  }

  // ---- running commands ----

  /**
   * M23 (GB2): the pixel selection before and after each edit that moved it with the picture
   * (Image size, Canvas size, a crop, the selected pixels transformed, cut to a new layer), by the
   * document the edit started from: undo puts back the one there was, redo the one it left.
   */
  const selectionMoves = new WeakMap<
    AnimationDoc,
    { before: Mask | undefined; after: Mask | undefined }
  >();

  /** GN1 (M23): said once, the first time old undo steps are let go. */
  let toldOfLimit = false;

  /** One undo step more (or none, when it changed nothing). */
  function executed(command: cmd.AnimCommand): void {
    let dropped = 0;
    store.update((s) => {
      const next = execute(s.history, command);
      if (next === s.history) return s;
      // A new edit from this picture: any edit undone from it before is gone.
      selectionMoves.delete(s.history.present);
      // GN1 (M23): a big photo's oldest undo steps are let go past the memory budget.
      const kept = keepWithin(next, services.historyBudget);
      dropped = kept.dropped;
      return { ...s, history: kept.history };
    });
    if (dropped > 0 && !toldOfLimit) {
      toldOfLimit = true;
      patch({
        message: {
          kind: 'info',
          text: 'This picture is big: to keep the computer’s memory free, the oldest undo steps are let go as you work.',
        },
      });
    }
  }

  /**
   * M23 (GB2): the edit just done, from `before`, takes the pixel selection to `after` (moved,
   * resized or cropped with the picture; undefined: none), and undo will put it back. Nothing
   * when that edit was refused or changed nothing.
   */
  function moveSelection(before: AnimationDoc, after: Mask | undefined): void {
    const { history, pixelSelection } = store.get();
    if (history.present === before || history.past.at(-1)?.project !== before) return;
    selectionMoves.set(before, { before: pixelSelection, after });
    patch({ pixelSelection: after });
  }

  // ---- M23 (GN2): big pixel work in the pixel worker ----

  /** Pixel work waiting or under way, one after another; how many. */
  let pixelWork: Promise<void> = Promise.resolve();
  let working = 0;

  /**
   * M23 (GN2): `work` (pixel jobs in the worker, then its one undo step) after any still under
   * way, `label…` shown meanwhile, so a 12-megapixel image never stalls the window. A refusal
   * (an EditError thrown) or a fault becomes the message.
   */
  function inBackground(label: string, work: () => Promise<void>): void {
    working++;
    patch({ busy: `${label}…` });
    pixelWork = pixelWork
      .then(work)
      .catch(showError)
      .finally(() => {
        if (--working === 0) patch({ busy: null });
      });
  }

  /** Applies a command as one undo step; a refused edit becomes a message. True when applied. */
  function run(command: cmd.AnimCommand): boolean {
    pause();
    try {
      executed(command);
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }

  /** For panel fields: applies the edit, or returns why it is not allowed (shown by the field). */
  function edit(command: cmd.AnimCommand): string | null {
    pause();
    try {
      executed(command);
      return null;
    } catch (error) {
      return error instanceof EditError ? error.message : unexpected(error);
    }
  }

  // ---- questions the features ask ----

  return {
    services,
    kind,
    store,
    patch,
    present,
    showError,
    play,
    pause,
    /** AN28: what plays the sounds while the animation plays (the sounds module sets it). */
    setSoundtrack: (track: typeof soundtrack) => void (soundtrack = track),
    run,
    edit,
    moveSelection,
    /** M23 (GB2): how an edit from `doc` moved the pixel selection, if it did (undo, redo). */
    selectionMove: (doc: AnimationDoc) => selectionMoves.get(doc),
    inBackground,
    /** M23 (GN2): settles when the pixel work waiting or under way is done (tests, saving). */
    pixelWork: (): Promise<void> => pixelWork,
    /** The selected objects still there and on the stage at the playhead (AN14: in its drawing). */
    liveSelection: (): Id[] =>
      store.get().selection.filter((id) => isShown(present(), id, store.get().frame)),
    /** The layer new objects go on. */
    currentLayer: (): Layer | undefined =>
      present().layers.find((l) => l.id === store.get().layerId),
    /** A frame kept inside the animation (the end shows the last pose). */
    clampFrame: (frame: number): number =>
      Math.max(0, Math.min(present().stage.length, Math.round(frame))),
    /** The animation's name for files: its file's name, or the document's name if never saved. */
    fileBase: (): string => {
      const { path } = store.get();
      return path ? withoutExtension(fileNameOf(path), kind) : present().name;
    },
  };
}

export type AnimationContext = ReturnType<typeof createAnimationContext>;
