// The timeline (AN8, AN9, AN13, AN14): the playhead and playback, loops, keyframes, the length
// and frame rate, and frame-by-frame layers with onion skin.
import * as cmd from '../animation-commands.ts';
import { drawingAt } from '../../core/animation/frames.ts';
import { copyMotion, type Motion } from '../../core/animation/copy-motion.ts';
import { findObject } from '../../core/animation/layers.ts';
import type { CameraProperty } from '../../core/animation/types.ts';
import { parseFrame } from '../../core/animation/time.ts';
import type { EaseCurve, Easing, Id, TweenProperty } from '../../core/animation/types.ts';
import type { AnimationContext } from './context.ts';
import type { Loop } from './state.ts';

const TYPE_TIME = 'Type a frame number, or a time such as 3 s or 0:03.00.';

/** 2026-11-18: the motion Copy Motion took, for Paste Motion (in this window, any animation). */
let motionClip: Motion | null = null;

export function timelineActions(ctx: AnimationContext) {
  const { store, patch, present, run, edit, play, pause, currentLayer, clampFrame } = ctx;
  return {
    // ---- 2026-11-18: the camera ----

    /** The camera's X, Y, zoom (%) or turn set at the playhead; returns why not. */
    setCamera(property: CameraProperty, value: number): string | null {
      const { frame } = store.get();
      return edit(cmd.setCamera(property, frame, value));
    },
    /** The camera's keyframes at the playhead removed; returns why not. */
    removeCameraKeys(): string | null {
      return edit(cmd.removeCameraKeys(store.get().frame));
    },
    /** The camera taken away: the whole stage is seen again. */
    resetCamera: (): string | null => edit(cmd.resetCamera()),
    // ---- 2026-11-18: Copy Motion / Paste Motion ----

    /** The selected object's keyframes and paths kept, to paste on others; returns why not. */
    copyMotion(): string | null {
      const ids = ctx.liveSelection();
      if (ids.length !== 1) return 'Select the one object whose motion you want to copy.';
      const found = findObject(present(), ids[0]!);
      if (!found) return 'That object is no longer on the stage.';
      try {
        motionClip = copyMotion(found.object);
      } catch (error) {
        return (error as Error).message;
      }
      patch({
        message: {
          kind: 'info',
          text: `Motion copied from ${found.object.name}: select other objects and Paste motion.`,
        },
      });
      return null;
    },
    /** True when there is motion to paste. */
    hasMotion: (): boolean => motionClip !== null,
    /** The copied motion put on every selected object, from where each one is; returns why not. */
    pasteMotion(): string | null {
      const ids = ctx.liveSelection();
      if (!motionClip) return 'Copy the motion of an object first.';
      if (ids.length === 0) return 'Select the objects to paste the motion on.';
      return edit(cmd.pasteMotion(ids, motionClip));
    },

    // ---- the playhead and playback (AN8) ----

    setFrame(frame: number): void {
      patch({ frame: clampFrame(frame) });
    },
    step(by: number): void {
      pause();
      patch({ frame: clampFrame(store.get().frame + by) });
    },
    /** A frame, seconds or a clock time typed in the playhead box; returns why not. */
    goTo(text: string): string | null {
      const frame = parseFrame(text, present().stage.fps);
      if (frame === null) return TYPE_TIME;
      patch({ frame: clampFrame(frame) });
      return null;
    },
    play,
    pause,
    togglePlay(): void {
      if (store.get().playing) pause();
      else play();
    },
    stop(): void {
      pause();
      patch({ frame: 0 });
    },
    setLoop(loop: Loop): string | null {
      if (loop.from !== undefined && loop.to !== undefined) {
        if (loop.from > loop.to) return 'The loop must start before it ends.';
        if (loop.from < 0 || loop.to > present().stage.length)
          return 'The loop must be inside the animation.';
      }
      const playing = store.get().playing;
      patch({ loop });
      if (playing) play();
      return null;
    },

    // ---- keyframes (AN9, AN13) ----

    insertKeyframe: (id: Id, property: cmd.PropertyChoice) =>
      void run(cmd.insertKeyframe(id, property, store.get().frame)),
    removeKeyframe: (id: Id, property: TweenProperty, frame: number) =>
      void run(cmd.removeKeyframe(id, property, frame)),
    /**
     * Pilot feedback 2026-11-18: the selected objects' keyframes at the playhead removed, every
     * property's (Remove keyframe, Shift + F6); returns why not.
     */
    removeKeyframesHere(): string | null {
      return edit(cmd.removeKeyframesAt(ctx.liveSelection(), store.get().frame));
    },
    moveKeyframe: (id: Id, property: TweenProperty, frame: number, to: number) =>
      void run(cmd.moveKeyframe(id, property, frame, to)),
    copyKeyframe: (id: Id, property: TweenProperty, frame: number, to: number) =>
      void run(cmd.copyKeyframe(id, property, frame, to)),
    setEasing: (id: Id, property: TweenProperty, frame: number, easing: Easing) =>
      void run(cmd.setEasing(id, property, frame, easing)),
    /** 2026-11-18: a custom ease's curve; returns why not. */
    setCurve: (id: Id, property: TweenProperty, frame: number, curve: EaseCurve): string | null =>
      edit(cmd.setCurve(id, property, frame, curve)),
    setHold: (id: Id, property: TweenProperty, frame: number, hold: boolean) =>
      void run(cmd.setHold(id, property, frame, hold)),
    setRepeat: (id: Id, property: TweenProperty, repeat: 'end' | number | undefined) =>
      void run(cmd.setRepeat(id, property, repeat)),
    reverse: (id: Id, property: cmd.PropertyChoice) => void run(cmd.reverse(id, property)),

    /** AN8: the length, typed as frames or a time; the playhead stays inside it. */
    setLength(text: string): string | null {
      const length = parseFrame(text, present().stage.fps);
      if (length === null) return TYPE_TIME;
      const refused = edit(cmd.setLength(length));
      if (!refused) patch({ frame: clampFrame(store.get().frame) });
      return refused;
    },

    /** AN8: a new frame rate; with 'times' the playhead keeps its time too. */
    setFps(fps: number, keep: 'times' | 'frames'): string | null {
      const before = present().stage.fps;
      const refused = edit(cmd.setFps(fps, keep));
      if (!refused && keep === 'times')
        patch({ frame: clampFrame((store.get().frame * fps) / before) });
      return refused;
    },

    /** AN14: the current layer becomes frame-by-frame; what is on it is the first drawing. */
    makeFrameByFrame(): string | null {
      return edit(cmd.makeFrameByFrame(store.get().layerId));
    },

    /**
     * AN14: a keyframe at the playhead on the frame-by-frame layer: blank (*Insert blank
     * keyframe*) or a copy of the drawing shown (*Duplicate frame*), which is then selected.
     */
    insertDrawing(how: 'blank' | 'copy'): string | null {
      let made: Id[] = [];
      const { layerId, frame } = store.get();
      const error = edit(cmd.addDrawing(layerId, frame, how, (ids) => (made = ids)));
      if (error === null) patch({ selection: made });
      return error;
    },

    /** AN14: removes the keyframe at the playhead and its drawing. */
    removeDrawing(): string | null {
      const { layerId, frame } = store.get();
      return edit(cmd.removeDrawing(layerId, frame));
    },

    /** AN14: shows the drawings before and after faintly, to draw the next one in step. */
    setOnionSkin: (on: boolean) => patch({ onionSkin: on }),

    /** AN14: the keyframe of the drawing shown on the current layer; undefined if not frame-by-frame. */
    drawingShown(): number | undefined {
      const layer = currentLayer();
      return layer ? drawingAt(layer, store.get().frame) : undefined;
    },
  };
}
