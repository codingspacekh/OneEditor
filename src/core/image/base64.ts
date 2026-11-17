// G2, GB1 (M21): bytes as base64, for a pixel layer's PNG inside an SVG (a data: URL). A large
// photo's PNG is tens of megabytes: it is turned into text a slice at a time, never one huge
// string of characters first.

const SLICE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let at = 0; at < bytes.length; at += SLICE * 3) {
    // Whole groups of three bytes per slice, so only the last slice can end in padding.
    const slice = bytes.subarray(at, Math.min(bytes.length, at + SLICE * 3));
    let text = '';
    for (let i = 0; i < slice.length; i += SLICE)
      text += String.fromCharCode(...slice.subarray(i, i + SLICE));
    parts.push(btoa(text));
  }
  return parts.join('');
}
