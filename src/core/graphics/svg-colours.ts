// GV6 (M19): the colours an SVG file may give — #rgb, #rrggbb (and with alpha), rgb(), rgba(),
// hsl(), the CSS colour names (ChipLeg.svg's `white`), `none` and `transparent` — as the hex
// colours the app keeps and a see-through amount. Pure.

/** The CSS colour names (CSS Color 4), as hex without the #. */
const NAMED = Object.fromEntries(
  (
    'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff ' +
    'beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff ' +
    'blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 ' +
    'chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c ' +
    'cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 ' +
    'darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b ' +
    'darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 ' +
    'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f ' +
    'darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 ' +
    'deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 ' +
    'floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff ' +
    'gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 ' +
    'honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c ' +
    'lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd ' +
    'lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 ' +
    'lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a ' +
    'lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 ' +
    'lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 ' +
    'magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd ' +
    'mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee ' +
    'mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 ' +
    'midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead ' +
    'navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 ' +
    'orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee ' +
    'palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb ' +
    'plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 ' +
    'rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 ' +
    'seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb ' +
    'slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f ' +
    'steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 ' +
    'violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32'
  )
    .split(' ')
    .map((pair) => pair.split(':') as [string, string]),
);

/** A colour read from a file: hex as the app keeps it ("#ff7f00") and its opacity, 0–1. */
export interface ReadColour {
  hex: string;
  alpha: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const byte = (v: number) =>
  Math.round(clamp(v, 0, 255))
    .toString(16)
    .padStart(2, '0');
const hexOf = (r: number, g: number, b: number) => `#${byte(r)}${byte(g)}${byte(b)}`;

/** "50%" → 0.5 × `full`; "128" → 128. NaN when it is not a number. */
function part(text: string, full: number): number {
  const t = text.trim();
  return t.endsWith('%') ? (Number(t.slice(0, -1)) / 100) * full : Number(t);
}

/** The hue (0–360) of HSL as red, green and blue (0–255). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * A colour, `'none'` for none or transparent, or null when it cannot be read (or is
 * `currentColor`, which the caller resolves).
 */
export function parseColour(value: string): ReadColour | 'none' | null {
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return 'none';
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = [...hex].map((c) => parseInt(c + c, 16));
      return { hex: hexOf(r!, g!, b!), alpha: a === undefined ? 1 : a / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const at = (i: number) => parseInt(hex.slice(i, i + 2), 16);
      return { hex: `#${hex.slice(0, 6)}`, alpha: hex.length === 8 ? at(6) / 255 : 1 };
    }
    return null;
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(v);
  if (fn) {
    const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const alpha = parts[3] === undefined ? 1 : clamp(part(parts[3], 1), 0, 1);
    let rgb: [number, number, number];
    if (fn[1]!.startsWith('rgb')) rgb = [0, 1, 2].map((i) => part(parts[i]!, 255)) as typeof rgb;
    else {
      const h = ((parseFloat(parts[0]!) % 360) + 360) % 360;
      rgb = hslToRgb(h, clamp(part(parts[1]!, 1), 0, 1), clamp(part(parts[2]!, 1), 0, 1));
    }
    if (![...rgb, alpha].every(Number.isFinite)) return null;
    return { hex: hexOf(...rgb), alpha };
  }
  const named = NAMED[v];
  return named ? { hex: `#${named}`, alpha: 1 } : null;
}

/** Between two hex colours, `t` of the way (0–1). */
export function mixColours(a: string, b: string, t: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [p, q] = [rgb(a), rgb(b)];
  return hexOf(...(p.map((v, i) => v + (q[i]! - v) * t) as [number, number, number]));
}
