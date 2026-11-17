// GL2 (M23): a GIF's facts — its palette (the depth), its frames and their times, whether it
// loops, and whether a see-through colour is set *and used*: the first frame's LZW codes are
// followed (without building the pixels) to see whether the see-through index is ever drawn, or
// whether it leaves part of the picture uncovered. A later frame's see-through colour only keeps
// the frame before (FFmpeg's animated GIFs do this everywhere), so it is not counted.
import { EditError } from '../../model/errors.ts';
import { gifLoops } from '../gif.ts';
import type { Found } from './types.ts';

const DAMAGED = 'This GIF file is damaged.';

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);

/**
 * Whether palette index `target` is among the first `pixels` pixels of the LZW data (GIF's codes,
 * least significant bit first). Each table entry keeps only its length, its first index and
 * whether it holds the target, so nothing is expanded.
 */
export function gifUsesIndex(
  data: Uint8Array,
  minSize: number,
  target: number,
  pixels: number,
): boolean {
  const clear = 1 << minSize;
  const eoi = clear + 1;
  const has = new Uint8Array(4096);
  const first = new Uint16Array(4096);
  const length = new Uint32Array(4096);
  for (let i = 0; i < clear; i++) {
    has[i] = i === target ? 1 : 0;
    first[i] = i;
    length[i] = 1;
  }
  let size = minSize + 1;
  let next = eoi + 1;
  let prev = -1;
  let acc = 0;
  let bits = 0;
  let at = 0;
  let drawn = 0;
  while (drawn < pixels) {
    while (bits < size && at < data.length) {
      acc |= data[at++]! << bits;
      bits += 8;
    }
    if (bits < size) break;
    const code = acc & ((1 << size) - 1);
    acc >>>= size;
    bits -= size;
    if (code === clear) {
      size = minSize + 1;
      next = eoi + 1;
      prev = -1;
      continue;
    }
    if (code === eoi) break;
    if (prev < 0) {
      if (code >= clear) break; // damaged: the first code must be a colour
    } else if (code > next)
      break; // damaged: a code not yet in the table
    else if (next < 4096) {
      // The new entry is the previous string and the first index of this one (or of itself).
      const k = code < next ? first[code]! : first[prev]!;
      has[next] = has[prev]! | (k === target ? 1 : 0);
      first[next] = first[prev]!;
      length[next] = length[prev]! + 1;
      next++;
      if (next === 1 << size && size < 12) size++;
    }
    if (has[code]) return true;
    drawn += length[code]!;
    prev = code;
  }
  return false;
}

export function gifFacts(b: Uint8Array): Found {
  if (b.length < 13) throw new EditError(DAMAGED);
  const width = u16(b, 6);
  const height = u16(b, 8);
  const packed = b[10]!;
  const globalBits = packed & 0x80 ? (packed & 7) + 1 : 0;
  let at = 13 + (globalBits ? 3 * (1 << globalBits) : 0);
  let frames = 0;
  let duration = 0;
  let firstBits = 0;
  let transparent = -1;
  let anySet = false;
  let used = false;
  /** Joins a run of sub-blocks; `at` moves past them. */
  const blocks = (): Uint8Array => {
    const parts: Uint8Array[] = [];
    let total = 0;
    while (at < b.length) {
      const n = b[at++]!;
      if (n === 0) break;
      parts.push(b.subarray(at, at + n));
      total += n;
      at += n;
    }
    const out = new Uint8Array(total);
    let k = 0;
    for (const p of parts) {
      out.set(p, k);
      k += p.length;
    }
    return out;
  };
  while (at < b.length) {
    const kind = b[at++]!;
    if (kind === 0x3b) break;
    if (kind === 0x21) {
      const label = b[at++]!;
      const data = blocks();
      if (label === 0xf9 && data.length >= 4) {
        duration += u16(data, 1);
        transparent = data[0]! & 1 ? data[3]! : -1;
      }
    } else if (kind === 0x2c) {
      if (at + 9 > b.length) throw new EditError(DAMAGED);
      const left = u16(b, at);
      const top = u16(b, at + 2);
      const w = u16(b, at + 4);
      const h = u16(b, at + 6);
      const flags = b[at + 8]!;
      at += 9;
      const localBits = flags & 0x80 ? (flags & 7) + 1 : 0;
      if (localBits) at += 3 * (1 << localBits);
      if (frames === 0) firstBits = localBits || globalBits;
      const minSize = b[at++]!;
      const data = blocks();
      if (frames === 0) {
        // The first frame is drawn on a see-through screen: what it does not cover stays so.
        used = left > 0 || top > 0 || left + w < width || top + h < height;
        if (transparent >= 0 && !used && minSize >= 1 && minSize <= 11)
          used = gifUsesIndex(data, minSize, transparent, w * h);
      }
      if (transparent >= 0) anySet = true;
      frames++;
      transparent = -1;
    } else throw new EditError(DAMAGED);
  }
  if (!(width > 0) || !(height > 0) || frames === 0) throw new EditError(DAMAGED);
  return {
    width,
    height,
    ...(firstBits ? { depth: firstBits, palette: 1 << firstBits } : {}),
    seeThrough: used ? 'used' : anySet ? 'unused' : 'none',
    compression: 'LZW',
    gif: { frames, loop: gifLoops(b) === true, duration: Math.round(duration) / 100 },
  };
}
