// M21/M22: a stroke's preview is shown at most once a frame; at pointer up the frame asked for is
// cancelled, so a late frame never puts the stroke's preview back after the stroke was kept.
import { describe, expect, it, vi } from 'vitest';
import { oncePerFrame } from '../../../src/ui/graphics/paint-tools.ts';

describe('M22: the preview once a frame', () => {
  it('shows once for many asks, and not at all once cancelled', () => {
    vi.useFakeTimers();
    const raf = globalThis.requestAnimationFrame;
    // jsdom's frames as timers.
    globalThis.requestAnimationFrame = ((f: FrameRequestCallback) =>
      setTimeout(() => f(0), 16)) as unknown as typeof requestAnimationFrame;
    try {
      const show = vi.fn();
      const frame = oncePerFrame(show);
      frame.ask();
      frame.ask();
      vi.advanceTimersByTime(20);
      expect(show).toHaveBeenCalledTimes(1);
      frame.ask();
      frame.cancel();
      vi.advanceTimersByTime(20);
      expect(show).toHaveBeenCalledTimes(1);
      frame.now();
      expect(show).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.requestAnimationFrame = raf;
      vi.useRealTimers();
    }
  });
});
