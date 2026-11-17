// D9 (M21): squeezing and unsqueezing bytes the way PNG files do (zlib's deflate), with the
// web-standard CompressionStream and DecompressionStream, which Chromium and Node 18+ both have,
// so the PNG and .mveg code in core needs no library and no DOM. The PNG code takes a Compression
// as an argument: the tests can hand it another, or this one.

/** Bytes in, bytes out. */
export type Codec = (data: Uint8Array) => Promise<Uint8Array>;

export interface Compression {
  /** Into zlib's format (RFC 1950), as a PNG's image data is kept. */
  deflate: Codec;
  /** Back out of it; rejects when the bytes are damaged. */
  inflate: Codec;
}

type Transform = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };

/** The bytes sent through a compression stream, joined again. */
async function through(stream: Transform, data: Uint8Array): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Not awaited: the stream fills as it is read; a damaged input shows as the read failing.
  writer.write(data).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    length += value.length;
  }
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The page's and Node's own deflate (zlib format). */
export const webCompression: Compression = {
  deflate: (data) => through(new CompressionStream('deflate') as Transform, data),
  inflate: (data) => through(new DecompressionStream('deflate') as Transform, data),
};
