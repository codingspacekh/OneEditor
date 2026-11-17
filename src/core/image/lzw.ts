// G11, D5 (M23): LZW, the lossless compression inside a GIF (and a TIFF's "Compression: LZW"),
// written and read by our own code. Each run of bytes seen before gets a code of its own, so a
// pattern met again (a flat colour, a stripe) is sent as one code: what the coursebook calls
// dictionary compression. GIF sends the codes least significant bit first, starting one bit wider
// than its colours (at least 3 bits), in blocks of up to 255 bytes; TIFF most significant bit
// first, 9 to 12 bits, widening one code early ("early change"). Both start again (a clear code)
// when 4096 codes are used.

const MAX_BITS = 12;
const MAX_CODES = 1 << MAX_BITS;

/** A hash table from (code, next byte) to the code for the longer run: cleared in a moment. */
class Dictionary {
  private readonly keys = new Int32Array(8192);
  private readonly codes = new Int16Array(8192);

  clear(): void {
    this.keys.fill(-1);
  }

  private slot(key: number): number {
    let h = ((key * 2654435761) >>> 19) & 8191;
    while (this.keys[h] !== -1 && this.keys[h] !== key) h = (h + 1) & 8191;
    return h;
  }

  get(prefix: number, byte: number): number {
    const h = this.slot((prefix << 8) | byte);
    return this.keys[h] === -1 ? -1 : this.codes[h]!;
  }

  set(prefix: number, byte: number, code: number): void {
    const key = (prefix << 8) | byte;
    const h = this.slot(key);
    this.keys[h] = key;
    this.codes[h] = code;
  }
}

/** Bytes that grow as they are written. */
class ByteSink {
  bytes = new Uint8Array(1 << 16);
  length = 0;

  push(b: number): void {
    if (this.length === this.bytes.length) {
      const more = new Uint8Array(this.bytes.length * 2);
      more.set(this.bytes);
      this.bytes = more;
    }
    this.bytes[this.length++] = b;
  }

  done(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

/**
 * The LZW codes for `data`, given to `emit(code, bits)` in order. `early`: TIFF's rule (the code
 * widens one code sooner, and the table is cleared at 4094); otherwise GIF's.
 */
function lzwCodes(
  data: Uint8Array,
  minBits: number,
  early: boolean,
  emit: (code: number, bits: number) => void,
): void {
  const clear = 1 << minBits;
  const end = clear + 1;
  const limit = early ? MAX_CODES - 2 : MAX_CODES;
  const dict = new Dictionary();
  dict.clear();
  let next = clear + 2;
  let bits = minBits + 1;
  emit(clear, bits);
  if (data.length === 0) {
    emit(end, bits);
    return;
  }
  let prefix = data[0]!;
  for (let i = 1; i < data.length; i++) {
    const byte = data[i]!;
    const found = dict.get(prefix, byte);
    if (found >= 0) {
      prefix = found;
      continue;
    }
    emit(prefix, bits);
    if (next < limit) {
      dict.set(prefix, byte, next++);
      if (early ? next >= 1 << bits : next > 1 << bits) bits = Math.min(MAX_BITS, bits + 1);
    } else {
      emit(clear, bits);
      dict.clear();
      next = clear + 2;
      bits = minBits + 1;
    }
    prefix = byte;
  }
  emit(prefix, bits);
  // The reader makes one more code on reading the last: it may read the end code a bit wider.
  if ((early ? next >= (1 << bits) - 1 : next >= 1 << bits) && bits < MAX_BITS) bits++;
  emit(end, bits);
}

/** G11: a GIF's image data: LZW codes, least significant bit first (without the block framing). */
export function gifLzwEncode(indices: Uint8Array, minBits: number): Uint8Array {
  const out = new ByteSink();
  let acc = 0;
  let count = 0;
  lzwCodes(indices, minBits, false, (code, bits) => {
    acc |= code << count;
    count += bits;
    while (count >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      count -= 8;
    }
  });
  if (count > 0) out.push(acc & 0xff);
  return out.done();
}

/** D5: a TIFF strip compressed by LZW (most significant bit first, 8-bit bytes). */
export function tiffLzwEncode(data: Uint8Array): Uint8Array {
  const out = new ByteSink();
  let acc = 0;
  let count = 0;
  lzwCodes(data, 8, true, (code, bits) => {
    acc = (acc << bits) | code;
    count += bits;
    while (count >= 8) {
      count -= 8;
      out.push((acc >>> count) & 0xff);
    }
    acc &= (1 << count) - 1;
  });
  if (count > 0) out.push((acc << (8 - count)) & 0xff);
  return out.done();
}

/**
 * The bytes LZW codes stand for: `read(bits)` gives the next code (or -1 at the end of the data);
 * at most `expected` bytes are made. `early`: TIFF's rule.
 */
function lzwBytes(
  read: (bits: number) => number,
  minBits: number,
  early: boolean,
  expected: number,
): Uint8Array {
  const clear = 1 << minBits;
  const end = clear + 1;
  // Each code: the code before it and its last byte; its first byte and its length.
  const prefix = new Int16Array(MAX_CODES);
  const suffix = new Uint8Array(MAX_CODES);
  const first = new Uint8Array(MAX_CODES);
  const length = new Uint16Array(MAX_CODES);
  for (let c = 0; c < clear; c++) {
    suffix[c] = c;
    first[c] = c;
    length[c] = 1;
  }
  const out = new Uint8Array(expected);
  let at = 0;
  let bits = minBits + 1;
  let next = clear + 2;
  let previous = -1;
  while (at < expected) {
    const code = read(bits);
    if (code < 0 || code === end) break;
    if (code === clear) {
      bits = minBits + 1;
      next = clear + 2;
      previous = -1;
      continue;
    }
    let size: number;
    if (code < next) {
      // A code known already: its bytes, and a new code (the one before + its first byte).
      size = length[code]!;
      if (previous >= 0 && next < MAX_CODES) {
        prefix[next] = previous;
        suffix[next] = first[code]!;
        first[next] = first[previous]!;
        length[next] = length[previous]! + 1;
        next++;
      }
    } else if (code === next && previous >= 0) {
      // The code being made: the one before and its own first byte.
      prefix[next] = previous;
      suffix[next] = first[previous]!;
      first[next] = first[previous]!;
      length[next] = length[previous]! + 1;
      size = length[next]!;
      next++;
    } else break; // damaged: a code not made yet
    // Written from its end back to its start.
    let c = code;
    const stop = Math.min(expected, at + size);
    for (let k = at + size - 1; k >= at; k--) {
      if (k < stop) out[k] = suffix[c]!;
      c = prefix[c]!;
    }
    at = stop;
    previous = code;
    if ((early ? next >= (1 << bits) - 1 : next >= 1 << bits) && bits < MAX_BITS) bits++;
  }
  return at === expected ? out : out.slice(0, at);
}

/** G11: a GIF's image data back to its palette indices (`count` of them, or fewer if cut short). */
export function gifLzwDecode(data: Uint8Array, minBits: number, count: number): Uint8Array {
  let at = 0;
  let acc = 0;
  let have = 0;
  return lzwBytes(
    (bits) => {
      while (have < bits) {
        if (at >= data.length) return -1;
        acc |= data[at++]! << have;
        have += 8;
      }
      const code = acc & ((1 << bits) - 1);
      acc >>>= bits;
      have -= bits;
      return code;
    },
    minBits,
    false,
    count,
  );
}

/** D5: a TIFF strip compressed by LZW back to its bytes (`count` of them, or fewer). */
export function tiffLzwDecode(data: Uint8Array, count: number): Uint8Array {
  let at = 0;
  let acc = 0;
  let have = 0;
  return lzwBytes(
    (bits) => {
      while (have < bits) {
        if (at >= data.length) return -1;
        acc = ((acc << 8) | data[at++]!) & 0xffffff;
        have += 8;
      }
      have -= bits;
      return (acc >>> have) & ((1 << bits) - 1);
    },
    8,
    true,
    count,
  );
}
