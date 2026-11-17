// AN19: more backgrounds, drawn at 1280 × 720 like backgrounds.ts — IT scenes and everyday places.
// As there, each is calm enough for cartoons and text on top, its moving things (lights, clouds,
// the sun, a cursor, leaves) are parts of their own, and each stays well under 250 shapes.
import {
  arc,
  circle,
  ellipse,
  group,
  line,
  rect,
  shape,
  star,
  turnedRect,
  type Fill,
  type LibraryItem,
  type Part,
} from './build.ts';

const W = 1280;
const H = 720;

type Pt = readonly [number, number];

const background = (id: string, name: string, keywords: string[], parts: Part[]): LibraryItem => ({
  id,
  name,
  category: 'backgrounds',
  keywords: ['background', 'scene', ...keywords],
  width: W,
  height: H,
  parts,
});

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** The same "random" numbers every time, so a background looks the same on every computer. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A colour part of the way from one to another (#rrggbb). */
function mix(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const n = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(n(a, i) + (n(b, i) - n(a, i)) * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Land from a wavy top edge down to the bottom of the stage. */
function hills(name: string, top: number, height: number, waves: number, fill: Fill, phase = 0) {
  const edge = range(41).map((i): Pt => [
    (i / 40) * W,
    top + height * (0.5 - 0.5 * Math.sin((i / 40) * waves * 2 * Math.PI + phase)),
  ]);
  return shape(name, [...edge, [W, H], [0, H]], fill);
}

const cloud = (name: string, x: number, y: number, s: number, colour = '#ffffff'): Part =>
  group(name, [
    rect('Base', x, y + 20 * s, 120 * s, 34 * s, colour, { radius: 17 * s }),
    circle('Left puff', x + 34 * s, y + 26 * s, 26 * s, colour),
    circle('Right puff', x + 76 * s, y + 20 * s, 32 * s, colour),
  ]);

/** A leaf from its stalk at (x, y), pointing at `deg`. */
function leaf(
  name: string,
  x: number,
  y: number,
  deg: number,
  len: number,
  wide: number,
  fill: Fill,
) {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const side = (sign: number) =>
    range(9).map((i): Pt => {
      const t = i / 8;
      const w = (sign * wide * Math.sin(Math.PI * Math.pow(t, 0.8))) / 2;
      return [x + dx * len * t - dy * w, y + dy * len * t + dx * w];
    });
  return shape(name, [...side(1), ...side(-1).reverse().slice(1, -1)], fill);
}

/** A tree: a trunk and a crown of overlapping circles. */
function roundTree(name: string, x: number, base: number, s: number, colours: readonly string[]) {
  const puffs: [number, number, number][] = [
    [-34, -150, 52],
    [32, -156, 56],
    [0, -196, 56],
    [-4, -128, 50],
  ];
  return group(name, [
    shape(
      'Trunk',
      [
        [x - 12 * s, base],
        [x - 7 * s, base - 120 * s],
        [x + 7 * s, base - 120 * s],
        [x + 12 * s, base],
      ],
      '#7a5236',
    ),
    group(
      'Crown',
      puffs.map(([dx, dy, r], i) =>
        circle(`Leaves ${i + 1}`, x + dx * s, base + dy * s, r * s, colours[i % colours.length]!),
      ),
    ),
  ]);
}

/** A potted plant on a floor or a desk at (x, base). */
function pottedPlant(name: string, x: number, base: number, s: number, pot = '#c46a45') {
  const green = ['#4f9a5a', '#5fae68', '#3f8a4c'];
  return group(name, [
    group(
      'Leaves',
      [-120, -100, -80, -60, -140, -40].map((deg, i) =>
        leaf(
          `Leaf ${i + 1}`,
          x,
          base - 52 * s,
          deg,
          (70 + (i % 3) * 18) * s,
          26 * s,
          green[i % 3]!,
        ),
      ),
    ),
    shape(
      'Pot',
      [
        [x - 30 * s, base - 56 * s],
        [x + 30 * s, base - 56 * s],
        [x + 22 * s, base],
        [x - 22 * s, base],
      ],
      pot,
    ),
    rect('Pot rim', x - 34 * s, base - 62 * s, 68 * s, 12 * s, pot, { radius: 3 * s }),
  ]);
}

// ---- code shown as coloured bars (no letters), for screens ----

const CODE = {
  kw: '#c792ea',
  fn: '#82aaff',
  str: '#c3e88d',
  num: '#f78c6c',
  txt: '#a6accd',
  com: '#5f6b80',
} as const;
type Token = readonly [width: number, kind: keyof typeof CODE];
type CodeLine = readonly [indent: number, ...tokens: Token[]];

/** Each line's words as rounded bars, from (x, y), one line every `step` px. */
function codeBars(
  lines: readonly CodeLine[],
  x: number,
  y: number,
  step: number,
  scale: number,
): Part[] {
  return lines.flatMap(([indent, ...tokens], n) => {
    let at = x + indent * 28 * scale;
    return tokens.map(([w, kind], k) => {
      const bar = rect(
        `Line ${n + 1} word ${k + 1}`,
        at,
        y + n * step,
        w * scale,
        11 * scale,
        CODE[kind],
        { radius: 5 * scale },
      );
      at += (w + 10) * scale;
      return bar;
    });
  });
}

const PROGRAM: readonly CodeLine[] = [
  [0, [64, 'kw'], [120, 'fn'], [44, 'txt']],
  [1, [56, 'kw'], [90, 'txt'], [24, 'txt'], [48, 'num']],
  [1, [130, 'txt'], [24, 'txt'], [170, 'str']],
  [1, [40, 'kw'], [100, 'txt'], [24, 'txt'], [56, 'num']],
  [2, [80, 'fn'], [210, 'str']],
  [2, [110, 'txt'], [24, 'txt'], [90, 'txt']],
  [1, [64, 'kw']],
  [2, [80, 'fn'], [150, 'str']],
  [1, [70, 'kw'], [120, 'txt']],
  [0],
  [0, [280, 'com']],
  [0, [64, 'kw'], [100, 'fn'], [90, 'txt']],
  [1, [120, 'txt'], [24, 'txt'], [40, 'num']],
  [1, [50, 'kw'], [110, 'txt'], [30, 'kw'], [130, 'fn']],
  [2, [40, 'kw'], [90, 'txt'], [24, 'txt'], [70, 'txt']],
  [3, [100, 'txt'], [24, 'txt'], [80, 'txt'], [40, 'num']],
  [2, [60, 'kw'], [140, 'txt']],
  [1, [64, 'kw'], [110, 'txt']],
  [0],
  [0, [90, 'txt'], [24, 'txt'], [120, 'fn'], [70, 'num']],
  [0, [80, 'fn'], [160, 'txt']],
  [0, [200, 'com']],
];

// ---- the scenes ----

const serverRoom = (): LibraryItem => {
  const rnd = seeded(11);
  const lightColours = ['#4ade80', '#4ade80', '#4ade80', '#38bdf8', '#fbbf24'];
  const vp: Pt = [640, 300];
  return background(
    'background.serverroom',
    'Server room',
    ['it', 'computer', 'technology', 'data centre', 'data center', 'servers', 'network', 'cloud'],
    [
      rect('Wall', 0, 0, W, 570, { from: '#dfe6ee', to: '#c9d3de', angle: 90 }),
      rect('Ceiling', 0, 0, W, 64, '#b9c4d1'),
      group(
        'Ceiling lights',
        [140, 520, 900].map((x, i) =>
          rect(`Ceiling light ${i + 1}`, x, 22, 240, 14, '#f7fbff', { radius: 4 }),
        ),
      ),
      rect('Cable tray', 0, 88, W, 12, '#9aa6b4'),
      rect('Floor', 0, 570, W, 150, { from: '#aab6c4', to: '#8a97a8', angle: 90 }),
      group('Floor tiles', [
        ...[600, 640, 690].map((y, i) =>
          line(
            `Tile row ${i + 1}`,
            [
              [0, y],
              [W, y],
            ],
            '#9aa7b6',
            2,
          ),
        ),
        ...range(9).map((i) => {
          const xb = i * 160;
          const t = (570 - vp[1]) / (720 - vp[1]);
          return line(
            `Tile column ${i + 1}`,
            [
              [vp[0] + (xb - vp[0]) * t, 570],
              [xb, 720],
            ],
            '#9aa7b6',
            2,
          );
        }),
      ]),
      ...range(5).map((r) => {
        const x = 115 + r * 220;
        const top = 120;
        const w = 170;
        return group(`Rack ${r + 1}`, [
          rect('Frame', x, top, w, 456, '#2b333d', { radius: 6 }),
          rect('Top vent', x + 24, top + 8, w - 48, 8, '#1d232b', { radius: 4 }),
          ...range(9).flatMap((k) => [
            rect(`Server ${k + 1}`, x + 12, top + 26 + k * 47, w - 24, 38, '#3b4654', {
              radius: 3,
            }),
            rect(`Drive slots ${k + 1}`, x + 70, top + 41 + k * 47, 80, 8, '#2b333d', {
              radius: 2,
            }),
          ]),
          group(
            'Lights',
            range(9).flatMap((k) =>
              [0, 1].map((j) =>
                circle(
                  `Light ${k + 1}${j ? 'b' : 'a'}`,
                  x + 30 + j * 16,
                  top + 45 + k * 47,
                  4,
                  lightColours[Math.floor(rnd() * lightColours.length)]!,
                ),
              ),
            ),
          ),
        ]);
      }),
      rect('Floor shadow', 100, 576, 1080, 10, '#000000', { opacity: 10, radius: 5 }),
    ],
  );
};

const codingDesk = (): LibraryItem =>
  background(
    'background.codingdesk',
    "Programmer's desk",
    ['it', 'computer', 'technology', 'programming', 'coding', 'desk', 'home', 'indoors'],
    [
      rect('Wall', 0, 0, W, 600, { from: '#eef2f5', to: '#e1e7ec', angle: 90 }),
      rect('Floor', 0, 600, W, 120, '#b7a58f'),
      group('Window', [
        rect('Frame', 880, 60, 330, 260, '#ffffff', { radius: 4 }),
        rect('Glass', 894, 74, 302, 232, { from: '#8fcaf2', to: '#dff1fd', angle: 90 }),
        cloud('Cloud', 930, 110, 0.7),
        rect('Upright bar', 1041, 74, 8, 232, '#ffffff'),
        rect('Cross bar', 894, 186, 302, 8, '#ffffff'),
        rect('Sill', 868, 316, 354, 14, '#f4f4f4', { radius: 3 }),
      ]),
      group('Shelf', [
        rect('Board', 90, 190, 300, 12, '#a87447', { radius: 2 }),
        ...[
          [104, 84, '#5b7fb3'],
          [130, 96, '#d0694f'],
          [158, 78, '#e8b24a'],
          [182, 92, '#5a9a6e'],
          [210, 70, '#8c6bb1'],
        ].map(([x, h, c], i) =>
          rect(`Book ${i + 1}`, x as number, 190 - (h as number), 24, h as number, c as string, {
            radius: 2,
          }),
        ),
        circle('Ball', 330, 166, 24, '#f2a65a'),
      ]),
      group('Desk', [
        rect('Desk top', 50, 470, 1180, 24, '#b98555', { radius: 4 }),
        rect('Desk edge', 50, 494, 1180, 14, '#9c6c42'),
        rect('Left leg', 90, 508, 26, 212, '#7a5233'),
        rect('Right leg', 1164, 508, 26, 212, '#7a5233'),
      ]),
      group('Monitor', [
        rect('Neck', 615, 420, 50, 44, '#4b5563'),
        rect('Foot', 566, 460, 148, 12, '#4b5563', { radius: 6 }),
        rect('Bezel', 400, 170, 480, 262, '#1f2937', { radius: 12 }),
        rect('Screen', 414, 184, 452, 234, '#1e2533'),
        group('Code', codeBars(PROGRAM.slice(0, 11), 432, 198, 20, 0.85)),
        rect('Cursor', 432 + 28 * 0.85 * 1, 198 + 6 * 20 - 3, 4, 16, '#e5e7eb'),
      ]),
      rect('Keyboard', 500, 458, 270, 12, '#d9dde2', { radius: 4, stroke: ['#b8bec6', 1] }),
      ellipse('Mouse', 800, 456, 34, 15, '#d9dde2', { stroke: ['#b8bec6', 1] }),
      group('Mug', [
        rect('Cup', 290, 406, 52, 64, '#e07a5f', { radius: 6 }),
        ellipse('Handle', 328, 420, 32, 34, null, { stroke: ['#e07a5f', 8] }),
        group('Steam', [
          line(
            'Steam 1',
            range(7).map((k): Pt => [306 + 6 * Math.sin(k), 392 - k * 9]),
            '#c7cdd4',
            4,
          ),
          line(
            'Steam 2',
            range(7).map((k): Pt => [326 + 6 * Math.sin(k + 2), 390 - k * 9]),
            '#c7cdd4',
            4,
          ),
        ]),
      ]),
      pottedPlant('Plant', 170, 470, 1.1),
      group('Desk lamp', [
        ellipse('Base', 1000, 458, 90, 16, '#3d4a5c'),
        ellipse('Glow', 900, 440, 150, 30, '#fff4c2', { opacity: 60 }),
        line(
          'Arm',
          [
            [1045, 462],
            [1085, 360],
            [1020, 306],
          ],
          '#3d4a5c',
          8,
        ),
        shape(
          'Shade',
          [
            [1008, 292],
            [1034, 314],
            [998, 360],
            [956, 326],
          ],
          '#5a7bb0',
        ),
        ellipse('Bulb', 966, 334, 30, 22, '#fff4c2'),
      ]),
    ],
  );

const codeEditor = (): LibraryItem => {
  const top = 70;
  const step = 28;
  return background(
    'background.codeeditor',
    'Code editor',
    ['it', 'computer', 'technology', 'programming', 'coding', 'screen', 'software', 'dark'],
    [
      rect('Background', 0, 0, W, H, '#1e2230'),
      rect('Title bar', 0, 0, W, 40, '#161a25'),
      group('Window buttons', [
        circle('Close', 24, 20, 7, '#ff6b6b'),
        circle('Minimise', 48, 20, 7, '#ffc75f'),
        circle('Maximise', 72, 20, 7, '#5fd38d'),
      ]),
      group('Tabs', [
        rect('Open tab', 190, 6, 190, 34, '#1e2230', { radius: 4 }),
        rect('Open tab name', 214, 18, 110, 10, '#a6accd', { radius: 5 }),
        rect('Other tab', 384, 6, 160, 34, '#232838', { radius: 4 }),
        rect('Other tab name', 406, 18, 90, 10, '#5f6b80', { radius: 5 }),
      ]),
      rect('Side bar', 0, 40, 180, 656, '#191d29'),
      group(
        'Files',
        [
          [0, 120, '#82aaff'],
          [1, 90, '#ffc75f'],
          [1, 100, '#c3e88d'],
          [1, 70, '#a6accd'],
          [0, 110, '#82aaff'],
          [1, 80, '#f78c6c'],
          [1, 96, '#c792ea'],
          [0, 90, '#a6accd'],
        ].flatMap(([indent, w, c], i) => {
          const x = 18 + (indent as number) * 18;
          const y = 66 + i * 30;
          return [
            rect(`File icon ${i + 1}`, x, y, 12, 14, c as string, { radius: 2 }),
            rect(`File name ${i + 1}`, x + 20, y + 2, w as number, 10, '#7d859c', {
              radius: 5,
              opacity: i === 1 ? 100 : 70,
            }),
          ];
        }),
      ),
      rect('Selected file', 0, 92, 180, 30, '#82aaff', { opacity: 12 }),
      rect('Current line', 180, top + 4 * step - 9, 1000, step, '#ffffff', { opacity: 5 }),
      group(
        'Line numbers',
        PROGRAM.map((_, n) =>
          rect(`Number ${n + 1}`, 200, top + n * step, n < 9 ? 12 : 22, 11, '#4a5266', {
            radius: 4,
          }),
        ),
      ),
      group('Code', codeBars(PROGRAM, 250, top, step, 1)),
      rect('Cursor', 250 + 2 * 28 + 80 + 10 + 210 + 6, top + 4 * step - 5, 3, 22, '#e5e7eb'),
      rect('Mini map', 1180, 40, 100, 656, '#1a1e2b'),
      rect('Scroll thumb', 1186, 52, 88, 180, '#ffffff', { opacity: 6, radius: 4 }),
      rect('Status bar', 0, 696, W, 24, '#2b4c7e'),
      group('Status', [
        rect('Branch', 16, 703, 80, 10, '#c9d6ee', { radius: 5, opacity: 70 }),
        rect('Position', 1100, 703, 120, 10, '#c9d6ee', { radius: 5, opacity: 70 }),
      ]),
    ],
  );
};

const digitalRain = (): LibraryItem => {
  const rnd = seeded(23);
  return background(
    'background.digitalrain',
    'Digital rain',
    ['it', 'computer', 'technology', 'binary', 'matrix', 'code', 'data', 'dark', 'pattern'],
    [
      rect('Background', 0, 0, W, H, { from: '#04120b', to: '#0b2618', angle: 90 }),
      ...range(26).map((c) => {
        const x = 24 + c * 49;
        const len = 5 + Math.floor(rnd() * 5);
        const head = 110 + rnd() * 590;
        const bits = range(len).flatMap((k) => {
          const y = head - k * 30;
          if (y - 11 < 0) return [];
          const colour = k === 0 ? '#d9ffe6' : '#3ddc84';
          const opacity = Math.round(95 - (k * 80) / len);
          return [
            rnd() < 0.5
              ? rect(`Bit ${k + 1}`, x - 2.5, y - 11, 5, 22, colour, { opacity, radius: 2 })
              : ellipse(`Bit ${k + 1}`, x - 7, y - 11, 14, 22, null, {
                  stroke: [colour, 3],
                  opacity,
                }),
          ];
        });
        return group(`Column ${c + 1}`, bits);
      }),
    ],
  );
};

const network = (): LibraryItem => {
  const rnd = seeded(5);
  const cols = 7;
  const rows = 4;
  const nodes: Pt[] = range(cols * rows).map((i) => [
    90 + (i % cols) * 183 + (rnd() - 0.5) * 100,
    105 + Math.floor(i / cols) * 170 + (rnd() - 0.5) * 90,
  ]);
  const links: [number, number][] = [];
  nodes.forEach((_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    if (c < cols - 1) links.push([i, i + 1]);
    if (r < rows - 1 && rnd() < 0.75) links.push([i, i + cols]);
    if (c < cols - 1 && r < rows - 1 && rnd() < 0.35) links.push([i, i + cols + 1]);
  });
  const at = (i: number) => nodes[i]!;
  return background(
    'background.network',
    'Network nodes',
    ['it', 'computer', 'technology', 'network', 'internet', 'connections', 'data', 'pattern'],
    [
      rect('Background', 0, 0, W, H, { from: '#f1f6fc', to: '#dbe7f5', angle: 120 }),
      group(
        'Links',
        links.map(([a, b], i) => line(`Link ${i + 1}`, [at(a), at(b)], '#b8cbe3', 2)),
      ),
      group(
        'Glows',
        [3, 9, 15, 19, 24].map((n, i) =>
          circle(`Glow ${i + 1}`, at(n)[0], at(n)[1], 26, '#8fb0d6', { opacity: 22 }),
        ),
      ),
      group(
        'Nodes',
        nodes.map(([x, y], i) => circle(`Node ${i + 1}`, x, y, 5 + (i % 4) * 2, '#8eaed4')),
      ),
      group(
        'Data packets',
        [2, 9, 16, 24, 31].map((l, i) => {
          const [a, b] = links[l % links.length]!;
          const t = 0.35 + 0.1 * i;
          return circle(
            `Packet ${i + 1}`,
            at(a)[0] + (at(b)[0] - at(a)[0]) * t,
            at(a)[1] + (at(b)[1] - at(a)[1]) * t,
            4,
            '#5b8fd0',
          );
        }),
      ),
    ],
  );
};

const techGrid = (): LibraryItem => {
  const horizon = 380;
  const vp: Pt = [640, horizon];
  const skyTop = '#0b1026';
  const skyLow = '#1d2556';
  const rnd = seeded(31);
  /** A line from the vanishing point to (xb, bottom), cut at the stage's sides. */
  const ray = (xb: number): Pt[] => {
    if (xb >= 0 && xb <= W) return [vp, [xb, H]];
    const edge = xb < 0 ? 0 : W;
    const t = (edge - vp[0]) / (xb - vp[0]);
    return [vp, [edge, vp[1] + (H - vp[1]) * t]];
  };
  return background(
    'background.techgrid',
    'Futuristic grid',
    ['it', 'computer', 'technology', 'future', 'digital', 'cyber', 'retro', 'dark', 'grid'],
    [
      rect('Sky', 0, 0, W, horizon, { from: skyTop, to: skyLow, angle: 90 }),
      group(
        'Stars',
        range(22).map((i) =>
          circle(
            `Star ${i + 1}`,
            20 + rnd() * 1240,
            16 + rnd() * 220,
            1.5 + rnd() * 1.5,
            '#cfd8ff',
            {
              opacity: 70,
            },
          ),
        ),
      ),
      ellipse(
        'Horizon glow',
        0,
        320,
        1280,
        120,
        { from: '#39c6f0', to: skyLow, radial: true },
        {
          opacity: 45,
        },
      ),
      group('Sun', [
        circle(
          'Sun disc',
          640,
          300,
          120,
          { from: '#ff7ac6', to: '#ffc070', angle: 90 },
          {
            opacity: 85,
          },
        ),
        ...[300, 326, 348, 366].map((y, i) =>
          rect(`Sun stripe ${i + 1}`, 510, y, 260, 6 + i * 2, mix(skyTop, skyLow, y / horizon)),
        ),
      ]),
      shape(
        'Mountains',
        [
          [0, horizon],
          [0, 330],
          [120, 290],
          [230, 340],
          [330, 300],
          [450, 360],
          [520, horizon],
          [770, horizon],
          [860, 330],
          [960, 280],
          [1060, 335],
          [1160, 300],
          [W, 340],
          [W, horizon],
        ],
        '#121838',
        { stroke: ['#5866d8', 2] },
      ),
      rect('Floor', 0, horizon, W, H - horizon, { from: '#0e1330', to: '#1a1f48', angle: 90 }),
      group('Grid', [
        ...range(10).map((k) => {
          const y = horizon + (H - horizon) * Math.pow((k + 1) / 10, 1.9);
          return line(
            `Grid row ${k + 1}`,
            [
              [0, Math.min(H - 1, y)],
              [W, Math.min(H - 1, y)],
            ],
            '#38bdf8',
            2,
          );
        }),
        ...range(31).map((k) => line(`Grid line ${k + 1}`, ray(-1760 + k * 160), '#38bdf8', 2)),
      ]),
      rect('Horizon line', 0, horizon - 1, W, 3, '#7dd3fc', { opacity: 80 }),
    ],
  );
};

const office = (): LibraryItem =>
  background(
    'background.office',
    'Office',
    ['it', 'computer', 'technology', 'work', 'business', 'desks', 'indoors'],
    [
      rect('Wall', 0, 0, W, 560, '#eef1f4'),
      group('Windows', [
        rect('Frame', 120, 90, 1040, 220, '#ffffff'),
        rect('Glass', 132, 102, 1016, 196, { from: '#a9d6f5', to: '#e6f5ff', angle: 90 }),
        group(
          'City view',
          [
            [150, 190, 90],
            [250, 150, 70],
            [330, 210, 110],
            [460, 130, 80],
            [560, 180, 120],
            [700, 160, 80],
            [800, 200, 100],
            [920, 140, 90],
            [1030, 190, 110],
          ].map(([x, y, w], i) =>
            rect(`Tower ${i + 1}`, x!, y!, w!, 298 - y!, i % 2 ? '#c4d3e1' : '#b5c6d6'),
          ),
        ),
        ...[392, 652, 912].map((x, i) => rect(`Window bar ${i + 1}`, x, 102, 8, 196, '#ffffff')),
        rect('Sill', 110, 306, 1060, 12, '#e3e7eb'),
      ]),
      ...[260, 640, 1020].map((x, i) =>
        group(`Ceiling lamp ${i + 1}`, [
          rect('Cord', x - 1.5, 0, 3, 24, '#6b7480'),
          shape('Shade', arc(x, 46, 36, 24, 180, 360, 12), '#3f4b5a'),
          ellipse('Light', x - 22, 40, 44, 12, '#fff3c4'),
        ]),
      ),
      rect('Floor', 0, 560, W, 160, { from: '#bfc7d0', to: '#a7b1bc', angle: 90 }),
      rect('Skirting', 0, 552, W, 10, '#d5dbe1'),
      ...[120, 720].map((x, i) =>
        group(`Desk ${i + 1}`, [
          rect('Monitor back', x + 120, 300, 200, 128, '#596473', { radius: 8 }),
          rect('Monitor stand', x + 205, 426, 30, 18, '#596473'),
          rect('Desk top', x, 440, 440, 20, '#d8c4a4', { radius: 3 }),
          rect('Desk panel', x + 20, 460, 400, 110, '#c6b08d'),
          rect('Left leg', x + 10, 460, 14, 150, '#8e9aa8'),
          rect('Right leg', x + 416, 460, 14, 150, '#8e9aa8'),
          group('Chair', [
            rect('Pole', x + 213, 560, 14, 100, '#2f3640'),
            rect('Base', x + 160, 652, 120, 12, '#2f3640', { radius: 6 }),
            circle('Left wheel', x + 166, 672, 9, '#2f3640'),
            circle('Right wheel', x + 274, 672, 9, '#2f3640'),
            rect('Seat', x + 150, 540, 140, 26, '#35506f', { radius: 10 }),
            rect('Back', x + 160, 420, 120, 130, '#3d5a80', { radius: 22 }),
          ]),
        ]),
      ),
      pottedPlant('Plant', 640, 600, 1.4, '#e5e1d8'),
      pottedPlant('Corner plant', 1170, 650, 1.05, '#e5e1d8'),
    ],
  );

const csClassroom = (): LibraryItem => {
  const beamFrom: Pt = [1090, 70];
  return background(
    'background.csclassroom',
    'Computer science classroom',
    ['it', 'computer', 'technology', 'classroom', 'school', 'projector', 'lesson', 'indoors'],
    [
      rect('Wall', 0, 0, W, 520, '#e8edf3'),
      rect('Floor', 0, 520, W, 200, { from: '#cdb99a', to: '#b59f7f', angle: 90 }),
      rect('Skirting', 0, 512, W, 10, '#d3dae2'),
      group('Window', [
        rect('Frame', 50, 90, 230, 230, '#ffffff', { radius: 4 }),
        rect('Glass', 62, 102, 206, 206, { from: '#9fd1f4', to: '#e3f3fe', angle: 90 }),
        rect('Bar', 161, 102, 8, 206, '#ffffff'),
        rect('Sill', 42, 316, 246, 12, '#f4f4f4'),
      ]),
      group('Projector screen', [
        rect('Case', 330, 26, 620, 16, '#6b7480', { radius: 6 }),
        rect('Screen', 350, 42, 580, 320, '#fbfcfe', { stroke: ['#d5dbe3', 2] }),
        group('Slide', [
          rect('Slide title', 390, 72, 260, 18, '#5b7fb3', { radius: 9 }),
          ...range(3).flatMap((k) => [
            circle(`Bullet ${k + 1}`, 398, 130 + k * 40, 6, '#e8a44a'),
            rect(`Point ${k + 1}`, 414, 124 + k * 40, [180, 140, 160][k]!, 12, '#c3ccd8', {
              radius: 6,
            }),
          ]),
          rect('Box 1', 680, 100, 100, 50, '#d6e6f8', { radius: 8, stroke: ['#5b7fb3', 3] }),
          shape(
            'Decision',
            [
              [730, 190],
              [790, 225],
              [730, 260],
              [670, 225],
            ],
            '#fbe7c6',
            { stroke: ['#e8a44a', 3] },
          ),
          rect('Box 2', 680, 290, 100, 50, '#d6f0dc', { radius: 8, stroke: ['#4f9a5a', 3] }),
          line(
            'Arrow 1',
            [
              [730, 150],
              [730, 190],
            ],
            '#6b7480',
            3,
          ),
          line(
            'Arrow 2',
            [
              [730, 260],
              [730, 290],
            ],
            '#6b7480',
            3,
          ),
        ]),
      ]),
      shape(
        'Light beam',
        [beamFrom, [930, 50], [930, 356]],
        { from: '#ffffff', to: '#fff7d6', angle: 0 },
        { opacity: 35 },
      ),
      group('Projector', [
        rect('Mount', 1112, 0, 10, 50, '#7d8792'),
        rect('Body', 1080, 46, 90, 40, '#d9dee4', { radius: 8, stroke: ['#9aa4af', 2] }),
        circle('Lens', 1090, 66, 12, '#3b4552'),
      ]),
      group("Teacher's desk", [
        rect('Desk top', 40, 420, 300, 20, '#a87447', { radius: 3 }),
        rect('Desk front', 50, 440, 280, 110, '#8f6039'),
        rect('Laptop lid', 170, 352, 110, 70, '#4b5563', { radius: 6 }),
        rect('Laptop base', 160, 414, 130, 8, '#6b7480', { radius: 3 }),
      ]),
      ...(
        [
          ['Back row', 360, 520, 18, '#d8bf98', [470, 710, 950, 1170], 0.8],
          ['Front row', 0, 650, 22, '#c9a77b', [240, 640, 1040], 1.05],
        ] as const
      ).map(([name, x0, y, depth, wood, monitors, s]) =>
        group(name, [
          ...monitors.flatMap((cx, k) => [
            rect(`Monitor ${k + 1}`, cx - 80 * s, y - 112 * s, 160 * s, 100 * s, '#6f7a89', {
              radius: 8,
            }),
            rect(`Stand ${k + 1}`, cx - 10 * s, y - 14 * s, 20 * s, 16 * s, '#6f7a89'),
          ]),
          rect('Bench', x0, y, W - x0 - (x0 ? 40 : 0), depth, wood, { radius: 3 }),
        ]),
      ),
    ],
  );
};

const street = (): LibraryItem => {
  const buildings: [number, number, number, string][] = [
    [0, 150, 250, '#d9a68a'],
    [250, 210, 230, '#c9d3dc'],
    [480, 120, 260, '#e3c79b'],
    [740, 180, 220, '#b9c7d6'],
    [960, 140, 320, '#d6b3a3'],
  ];
  return background(
    'background.street',
    'City street',
    ['town', 'city', 'road', 'pavement', 'shops', 'urban', 'outdoors'],
    [
      rect('Sky', 0, 0, W, 470, { from: '#8ec9f4', to: '#e3f3fd', angle: 90 }),
      cloud('Cloud 1', 300, 50, 1),
      cloud('Cloud 2', 820, 30, 0.8),
      group(
        'Far buildings',
        [
          [60, 110, 120],
          [380, 70, 110],
          [700, 90, 120],
          [1020, 60, 140],
        ].map(([x, y, w], i) => rect(`Far building ${i + 1}`, x!, y!, w!, 470 - y!, '#cbd8e4')),
      ),
      ...buildings.map(([x, top, w, colour], i) =>
        group(`Building ${i + 1}`, [
          rect('Front', x, top, w, 470 - top, colour),
          rect('Roof edge', x, top, w, 10, mix(colour, '#000000', 0.15)),
          ...range(Math.floor((390 - top) / 80) * 3).map((k) =>
            rect(
              `Window ${k + 1}`,
              x + 26 + (k % 3) * ((w - 52 - 40) / 2),
              top + 34 + Math.floor(k / 3) * 80,
              40,
              48,
              '#eaf4fb',
              { stroke: ['#ffffff', 3] },
            ),
          ),
          rect('Door', x + w / 2 - 24, 396, 48, 74, mix(colour, '#3b2a20', 0.6), { radius: 3 }),
        ]),
      ),
      group('Shop awning', [
        rect('Awning', 500, 370, 220, 26, '#d9534f'),
        ...range(5).map((k) => rect(`Stripe ${k + 1}`, 510 + k * 44, 370, 22, 26, '#f6f1e8')),
      ]),
      rect('Pavement', 0, 470, W, 72, '#cfc9be'),
      group(
        'Paving lines',
        range(10).map((k) =>
          line(
            `Paving line ${k + 1}`,
            [
              [64 + k * 128, 470],
              [56 + k * 128, 540],
            ],
            '#bdb6aa',
            2,
          ),
        ),
      ),
      rect('Kerb', 0, 540, W, 12, '#9d978c'),
      rect('Road', 0, 552, W, 168, '#4a4d55'),
      group(
        'Road markings',
        range(8).map((k) => rect(`Marking ${k + 1}`, 30 + k * 160, 632, 90, 8, '#eeeeee')),
      ),
      roundTree('Tree', 180, 500, 0.9, ['#6aa85b', '#5b9a4f', '#79b768', '#6aa85b']),
      group('Street lamp', [
        rect('Post', 852, 250, 10, 260, '#3d4652'),
        line(
          'Arm',
          [
            [857, 256],
            [900, 240],
          ],
          '#3d4652',
          8,
        ),
        rect('Lamp', 888, 236, 40, 14, '#3d4652', { radius: 4 }),
        ellipse('Lamp light', 892, 248, 32, 10, '#fff1b8'),
      ]),
      group('Traffic light', [
        rect('Pole', 1096, 330, 12, 180, '#3d4652'),
        rect('Box', 1078, 236, 48, 110, '#2b3038', { radius: 8 }),
        circle('Red light', 1102, 260, 12, '#e5534b'),
        circle('Amber light', 1102, 291, 12, '#6b5a2a'),
        circle('Green light', 1102, 322, 12, '#2f5a3a'),
      ]),
    ],
  );
};

const playpark = (): LibraryItem =>
  background(
    'background.playpark',
    'Playground',
    ['park', 'swings', 'slide', 'play', 'children', 'outdoors'],
    [
      rect('Sky', 0, 0, W, 460, { from: '#73c0f6', to: '#e2f3fe', angle: 90 }),
      circle('Sun', 1130, 96, 50, '#ffe27a'),
      cloud('Cloud 1', 180, 60, 1.1),
      cloud('Cloud 2', 700, 110, 0.8),
      hills('Far hills', 340, 70, 1.2, '#9fd68f', 0.8),
      roundTree('Tree 1', 90, 440, 0.9, ['#5b9a4f', '#6aa85b', '#79b768', '#6aa85b']),
      roundTree('Tree 2', 1190, 450, 1, ['#6aa85b', '#5b9a4f', '#79b768', '#5b9a4f']),
      rect('Grass', 0, 440, W, 280, { from: '#7cc66a', to: '#5aa64c', angle: 90 }),
      group('Fence', [
        rect('Top rail', 0, 404, W, 8, '#e7d3b0'),
        rect('Bottom rail', 0, 428, W, 8, '#e7d3b0'),
        ...range(16).map((k) => rect(`Post ${k + 1}`, 20 + k * 82, 392, 10, 56, '#d9c19a')),
      ]),
      ellipse('Play area', 160, 520, 960, 170, '#e8d29c', { opacity: 60 }),
      group('Slide', [
        rect('Ladder left', 230, 330, 10, 270, '#5b7fb3'),
        rect('Ladder right', 290, 330, 10, 270, '#5b7fb3'),
        ...range(6).map((k) => rect(`Rung ${k + 1}`, 240, 360 + k * 40, 50, 7, '#5b7fb3')),
        rect('Platform', 220, 320, 120, 16, '#e05a4f', { radius: 4 }),
        shape(
          'Chute',
          [
            [330, 320],
            [350, 320],
            [500, 560],
            [520, 600],
            [480, 600],
            [470, 572],
            [326, 340],
          ],
          '#f2b134',
        ),
        line(
          'Hand rail',
          [
            [228, 320],
            [228, 280],
            [330, 280],
            [338, 320],
          ],
          '#e05a4f',
          6,
        ),
      ]),
      group('Swing frame', [
        line(
          'Left legs',
          [
            [660, 600],
            [700, 300],
            [740, 600],
          ],
          '#c0563f',
          10,
        ),
        line(
          'Right legs',
          [
            [960, 600],
            [1000, 300],
            [1040, 600],
          ],
          '#c0563f',
          10,
        ),
        rect('Top bar', 690, 294, 320, 12, '#c0563f', { radius: 6 }),
      ]),
      ...[790, 900].map((x, i) =>
        group(`Swing ${i + 1}`, [
          rect('Left rope', x - 28, 306, 3, 200, '#6b5a4a'),
          rect('Right rope', x + 25, 306, 3, 200, '#6b5a4a'),
          rect('Seat', x - 36, 504, 72, 10, '#3d4a5c', { radius: 4 }),
        ]),
      ),
      group('Sandpit', [
        rect('Edge', 1040, 600, 200, 60, '#b98555', { radius: 8 }),
        rect('Sand', 1052, 610, 176, 40, '#f1dc9b', { radius: 6 }),
        shape(
          'Bucket',
          [
            [1100, 606],
            [1130, 606],
            [1126, 632],
            [1104, 632],
          ],
          '#e05a4f',
        ),
      ]),
      group('See-saw', [
        shape(
          'Pivot',
          [
            [180, 660],
            [200, 620],
            [220, 660],
          ],
          '#5b7fb3',
        ),
        shape('Plank', turnedRect(200, 616, 300, 14, -10), '#f2b134'),
      ]),
    ],
  );

const kitchen = (): LibraryItem =>
  background(
    'background.kitchen',
    'Kitchen',
    ['home', 'cooking', 'food', 'house', 'indoors'],
    [
      rect('Wall', 0, 0, W, 660, '#f6efe2'),
      rect('Splashback', 0, 300, 1100, 120, '#e2eef0'),
      group('Tiles', [
        ...[330, 360, 390].map((y, i) =>
          line(
            `Tile row ${i + 1}`,
            [
              [0, y],
              [1100, y],
            ],
            '#cfdfe2',
            2,
          ),
        ),
        ...range(13).map((k) =>
          line(
            `Tile column ${k + 1}`,
            [
              [40 + k * 80, 300],
              [40 + k * 80, 420],
            ],
            '#cfdfe2',
            2,
          ),
        ),
      ]),
      group('Window', [
        rect('Frame', 590, 80, 240, 200, '#ffffff', { radius: 4 }),
        rect('Glass', 602, 92, 216, 176, { from: '#9fd1f4', to: '#e3f3fe', angle: 90 }),
        rect('Bar', 706, 92, 8, 176, '#ffffff'),
        rect('Sill', 580, 276, 260, 12, '#f2f2f2'),
        pottedPlant('Herbs', 790, 276, 0.45, '#d9824f'),
      ]),
      group(
        'Wall cupboards',
        [40, 170, 300, 430, 870, 980].flatMap((x, i) => [
          rect(`Door ${i + 1}`, x, 70, x < 800 ? 124 : 104, 190, '#d7b48b', {
            radius: 4,
            stroke: ['#c19a6f', 2],
          }),
          rect(
            `Handle ${i + 1}`,
            x + (i % 2 ? 12 : (x < 800 ? 124 : 104) - 18),
            220,
            6,
            26,
            '#8a8f96',
            {
              radius: 3,
            },
          ),
        ]),
      ),
      rect('Base cupboards', 0, 444, 1100, 216, '#d7b48b'),
      group(
        'Cupboard doors',
        [10, 150, 290, 760, 900].flatMap((x, i) => [
          rect(`Door ${i + 1}`, x, 460, 128, 186, '#ddbd96', { radius: 4, stroke: ['#c19a6f', 2] }),
          rect(`Handle ${i + 1}`, x + 54, 476, 20, 6, '#8a8f96', { radius: 3 }),
        ]),
      ),
      group('Oven', [
        rect('Oven front', 440, 456, 300, 196, '#e6e8eb', { radius: 4, stroke: ['#c3c8ce', 2] }),
        rect('Oven door glass', 470, 520, 240, 110, '#3b4452', { radius: 8 }),
        rect('Oven handle', 490, 500, 200, 8, '#9aa2ab', { radius: 4 }),
        ...range(4).map((k) => circle(`Knob ${k + 1}`, 500 + k * 60, 476, 8, '#6b7480')),
      ]),
      rect('Worktop', 0, 420, 1100, 24, '#7e8b98'),
      group('Hob', [
        ellipse('Back ring', 470, 412, 90, 12, '#2f3640'),
        ellipse('Front ring', 620, 412, 90, 12, '#2f3640'),
      ]),
      group('Pan', [
        rect('Pot', 470, 350, 100, 64, '#c0563f', { radius: 6 }),
        rect('Lid', 462, 340, 116, 12, '#a54834', { radius: 6 }),
        rect('Knob', 510, 330, 20, 12, '#a54834', { radius: 4 }),
        group('Steam', [
          line(
            'Steam 1',
            range(7).map((k): Pt => [500 + 7 * Math.sin(k), 318 - k * 10]),
            '#ffffff',
            5,
          ),
          line(
            'Steam 2',
            range(7).map((k): Pt => [540 + 7 * Math.sin(k + 2), 314 - k * 10]),
            '#ffffff',
            5,
          ),
        ]),
      ]),
      group('Sink', [
        rect('Basin', 790, 420, 200, 10, '#5d6772', { radius: 4 }),
        line(
          'Tap',
          [
            [890, 420],
            [890, 360],
            [930, 360],
            [930, 380],
          ],
          '#9aa2ab',
          8,
        ),
      ]),
      group('Fridge', [
        rect('Body', 1110, 120, 160, 540, '#f2f4f6', { radius: 10, stroke: ['#cfd5db', 2] }),
        rect('Freezer line', 1110, 300, 160, 4, '#cfd5db'),
        rect('Top handle', 1124, 200, 8, 80, '#9aa2ab', { radius: 4 }),
        rect('Bottom handle', 1124, 320, 8, 110, '#9aa2ab', { radius: 4 }),
        rect('Magnet note', 1180, 160, 50, 50, '#fff3a3'),
      ]),
      rect('Floor', 0, 660, W, 60, '#c9bba6'),
    ],
  );

const bedroom = (): LibraryItem =>
  background(
    'background.bedroom',
    'Bedroom',
    ['home', 'bed', 'sleep', 'house', 'night', 'indoors'],
    [
      rect('Wall', 0, 0, W, 540, '#e7e4f2'),
      rect('Floor', 0, 540, W, 180, { from: '#c99f74', to: '#b28a62', angle: 90 }),
      rect('Skirting', 0, 532, W, 10, '#f7f6fb'),
      group('Window', [
        rect('Frame', 800, 80, 260, 250, '#ffffff', { radius: 4 }),
        rect('Glass', 812, 92, 236, 226, { from: '#8ec9f4', to: '#e3f3fd', angle: 90 }),
        cloud('Cloud', 840, 130, 0.6),
        rect('Bar', 926, 92, 8, 226, '#ffffff'),
        rect('Curtain rail', 760, 64, 340, 8, '#9b8c7a', { radius: 4 }),
        shape(
          'Left curtain',
          [
            [770, 70],
            [850, 70],
            [820, 220],
            [800, 380],
            [770, 380],
          ],
          '#8fb4d9',
        ),
        shape(
          'Right curtain',
          [
            [1010, 70],
            [1090, 70],
            [1090, 380],
            [1060, 380],
            [1040, 220],
          ],
          '#8fb4d9',
        ),
      ]),
      group('Shelf', [
        rect('Board', 210, 200, 280, 12, '#a87447'),
        ...[
          [226, 70, '#d0694f'],
          [252, 84, '#5b7fb3'],
          [280, 64, '#e8b24a'],
        ].map(([x, h, c], i) =>
          rect(`Book ${i + 1}`, x as number, 200 - (h as number), 24, h as number, c as string, {
            radius: 2,
          }),
        ),
        rect('Photo frame', 380, 130, 70, 70, '#ffffff', { stroke: ['#a87447', 5] }),
        shape(
          'Photo',
          [
            [388, 192],
            [410, 160],
            [426, 178],
            [436, 166],
            [444, 192],
          ],
          '#7cbf8a',
        ),
      ]),
      group('Bed', [
        rect('Headboard', 120, 300, 30, 300, '#7d5a8a', { radius: 8 }),
        rect('Frame', 140, 480, 570, 40, '#8f6a9b'),
        rect('Mattress', 150, 432, 545, 52, '#fbfbfd', { radius: 10 }),
        ellipse('Pillow', 160, 400, 150, 54, '#ffffff', { stroke: ['#dcd8e6', 2] }),
        shape(
          'Blanket',
          [
            [300, 420],
            [700, 420],
            [710, 520],
            [300, 520],
            [290, 470],
          ],
          '#7aa6d8',
        ),
        rect('Blanket stripe', 360, 420, 40, 100, '#a9c6e8'),
        rect('Footboard', 700, 420, 26, 180, '#7d5a8a', { radius: 6 }),
        rect('Left leg', 150, 520, 16, 70, '#6b4c78'),
        rect('Right leg', 680, 520, 16, 70, '#6b4c78'),
      ]),
      group('Bedside table', [
        rect('Table', 18, 450, 92, 120, '#c08a5c', { radius: 4 }),
        rect('Drawer', 28, 470, 72, 40, '#d4a171', { radius: 3 }),
        circle('Knob', 64, 490, 5, '#7a5233'),
        rect('Lamp stem', 60, 400, 8, 50, '#5c6672'),
        shape(
          'Lamp shade',
          [
            [40, 400],
            [88, 400],
            [76, 360],
            [52, 360],
          ],
          '#f4c96b',
        ),
        circle('Lamp glow', 64, 384, 46, '#fff4c2', { opacity: 35 }),
      ]),
      ellipse('Rug', 420, 600, 520, 90, '#d88f8f', { opacity: 80 }),
      group('Wardrobe', [
        rect('Body', 1120, 140, 150, 400, '#b98555', { radius: 4 }),
        rect('Line', 1194, 150, 3, 380, '#9c6c42'),
        rect('Left knob', 1180, 320, 6, 24, '#7a5233', { radius: 3 }),
        rect('Right knob', 1204, 320, 6, 24, '#7a5233', { radius: 3 }),
      ]),
    ],
  );

const stadium = (): LibraryItem => {
  const rnd = seeded(41);
  const crowd = ['#e05a4f', '#5b7fb3', '#f2b134', '#ffffff', '#7cbf8a', '#d6a3c9'];
  const stripes = [380, 400, 424, 452, 486, 526, 574, 632, 700];
  const white = '#f4fbf2';
  return background(
    'background.stadium',
    'Football stadium',
    ['sports', 'football', 'soccer', 'pitch', 'match', 'pe', 'outdoors'],
    [
      rect('Sky', 0, 0, W, 200, { from: '#5f8fd8', to: '#bcd6f3', angle: 90 }),
      cloud('Cloud', 860, 40, 0.8),
      rect('Stand', 0, 150, W, 214, '#5d6b82'),
      group(
        'Seat rows',
        range(6).map((k) => rect(`Row ${k + 1}`, 0, 180 + k * 30, W, 12, '#6e7c93')),
      ),
      group(
        'Crowd',
        range(6).flatMap((k) =>
          range(16).map((j) =>
            circle(
              `Fan ${k * 16 + j + 1}`,
              36 + j * 78 + (k % 2) * 28 + (rnd() - 0.5) * 12,
              174 + k * 30,
              7,
              crowd[Math.floor(rnd() * crowd.length)]!,
              { opacity: 75 },
            ),
          ),
        ),
      ),
      rect('Roof', 0, 130, W, 24, '#3a4556'),
      ...[100, 1180].map((x, i) =>
        group(`Floodlight ${i + 1}`, [
          rect('Mast', x - 6, 40, 12, 100, '#3a4556'),
          rect('Panel', x - 50, 12, 100, 40, '#3a4556', { radius: 4 }),
          ...range(6).map((k) =>
            circle(
              `Lamp ${k + 1}`,
              x - 32 + (k % 3) * 32,
              24 + Math.floor(k / 3) * 16,
              6,
              '#fff6c8',
            ),
          ),
          ellipse('Glow', x - 70, 2, 140, 60, '#fff6c8', { opacity: 25 }),
        ]),
      ),
      group(
        'Advert boards',
        range(6).map((k) =>
          rect(
            `Board ${k + 1}`,
            (k * W) / 6,
            362,
            k === 5 ? W / 6 : W / 6 - 2,
            20,
            ['#2f6db0', '#e05a4f', '#2f9e5a', '#f2b134', '#7d5a8a', '#2f6db0'][k]!,
          ),
        ),
      ),
      ...stripes
        .slice(0, -1)
        .map((y, i) =>
          rect(
            `Grass stripe ${i + 1}`,
            0,
            y,
            W,
            stripes[i + 1]! - y + (i === 7 ? H - 700 : 0),
            i % 2 ? '#5fae55' : '#6abb5f',
          ),
        ),
      group('Pitch lines', [
        line(
          'Touch line',
          [
            [2, 400],
            [W - 2, 400],
          ],
          white,
          4,
        ),
        line(
          'Halfway line',
          [
            [640, 400],
            [640, 720],
          ],
          white,
          4,
        ),
        ellipse('Centre circle', 470, 470, 340, 120, null, { stroke: [white, 4] }),
        circle('Centre spot', 640, 530, 6, white),
        line(
          'Left box',
          [
            [2, 440],
            [190, 440],
            [140, 640],
            [2, 640],
          ],
          white,
          4,
        ),
        line(
          'Right box',
          [
            [W - 2, 440],
            [1090, 440],
            [1140, 640],
            [W - 2, 640],
          ],
          white,
          4,
        ),
      ]),
    ],
  );
};

const rainbow = (): LibraryItem => {
  const colours = ['#ef6f6c', '#f4a259', '#f6d55c', '#7cc57f', '#5fa8d3', '#6c7fd0', '#a77ccf'];
  const [cx, cy, outer, band] = [640, 600, 520, 24];
  return background(
    'background.rainbow',
    'Rainbow over hills',
    ['weather', 'rain', 'colours', 'sky', 'nature', 'outdoors', 'happy'],
    [
      rect('Sky', 0, 0, W, 560, { from: '#7cc4f4', to: '#e6f5ff', angle: 90 }),
      circle('Sun', 1150, 90, 48, '#ffe27a'),
      group(
        'Rainbow',
        colours.map((c, i) => {
          const r = outer - i * band;
          return shape(
            `Band ${i + 1}`,
            [...arc(cx, cy, r, r, 180, 360, 40), ...arc(cx, cy, r - band, r - band, 360, 180, 40)],
            c,
            { opacity: 80 },
          );
        }),
      ),
      cloud('Left cloud', 40, 470, 1.6),
      cloud('Right cloud', 1040, 460, 1.6),
      cloud('Cloud', 420, 80, 0.8),
      hills('Back hills', 470, 90, 1.5, '#9fd68f', 0.5),
      hills('Front hills', 560, 70, 1, { from: '#72c063', to: '#4f9a45', angle: 90 }, 2),
      group(
        'Flowers',
        [
          [120, 650],
          [260, 690],
          [380, 640],
          [560, 680],
          [700, 650],
          [860, 690],
          [990, 645],
          [1150, 680],
        ].flatMap(([x, y], i) => [
          star(
            `Flower ${i + 1}`,
            x! - 13,
            y! - 13,
            26,
            26,
            ['#ffffff', '#ffd1dc', '#fff3a3'][i % 3]!,
            6,
            0.55,
          ),
          circle(`Flower centre ${i + 1}`, x!, y!, 5, '#f2b134'),
        ]),
      ),
    ],
  );
};

const autumn = (): LibraryItem => {
  const rnd = seeded(77);
  const warm = ['#e9762b', '#d9502f', '#f2b134', '#c8642d'];
  return background(
    'background.autumn',
    'Autumn park',
    ['fall', 'season', 'trees', 'leaves', 'park', 'nature', 'outdoors'],
    [
      rect('Sky', 0, 0, W, 460, { from: '#9fcbe8', to: '#f4e6cc', angle: 90 }),
      cloud('Cloud', 760, 70, 1),
      hills('Far hills', 360, 60, 1.3, '#cdbb83', 1),
      hills('Ground', 430, 30, 1, { from: '#a9b664', to: '#86934a', angle: 90 }, 0.3),
      shape(
        'Footpath',
        [
          [600, 452],
          [680, 452],
          [900, 720],
          [380, 720],
        ],
        '#dcc59a',
      ),
      roundTree('Tree 1', 130, 520, 1.2, warm),
      roundTree('Tree 2', 340, 470, 0.9, ['#f2b134', '#e9762b', '#f2c45a', '#e9762b']),
      roundTree('Tree 3', 950, 480, 1, ['#d9502f', '#e9762b', '#c8642d', '#f2b134']),
      roundTree('Tree 4', 1140, 540, 1.2, ['#e9762b', '#f2b134', '#d9502f', '#c8642d']),
      group('Leaf piles', [
        ellipse('Pile 1', 60, 506, 150, 28, '#d9702f'),
        ellipse('Pile 2', 1060, 526, 160, 30, '#e08a33'),
      ]),
      group('Bench', [
        rect('Back top', 640, 540, 200, 12, '#8a5a35', { radius: 3 }),
        rect('Back low', 640, 560, 200, 12, '#8a5a35', { radius: 3 }),
        rect('Seat', 630, 590, 220, 14, '#9c6c42', { radius: 3 }),
        rect('Left leg', 650, 540, 10, 100, '#3d4652'),
        rect('Right leg', 820, 540, 10, 100, '#3d4652'),
      ]),
      group('Lamp post', [
        rect('Post', 535, 360, 10, 200, '#3d4652'),
        rect('Lamp', 524, 340, 32, 30, '#3d4652', { radius: 4 }),
        rect('Lamp glass', 530, 346, 20, 18, '#fff1b8'),
      ]),
      group(
        'Falling leaves',
        range(12).map((i) => {
          const x = 60 + rnd() * 1160;
          const y = 60 + rnd() * 560;
          return leaf(`Leaf ${i + 1}`, x, y, rnd() * 360, 22, 12, warm[i % warm.length]!);
        }),
      ),
    ],
  );
};

const volcano = (): LibraryItem =>
  background(
    'background.volcano',
    'Volcano',
    ['geography', 'lava', 'eruption', 'mountain', 'nature', 'outdoors'],
    [
      rect('Sky', 0, 0, W, H, { from: '#8496b8', to: '#f2c9a0', angle: 90 }),
      group(
        'Smoke',
        [
          [640, 180, 70],
          [580, 130, 60],
          [700, 110, 64],
          [630, 70, 56],
          [760, 50, 46],
          [540, 60, 40],
        ].map(([x, y, r], i) =>
          circle(`Smoke puff ${i + 1}`, x!, y!, r!, '#8d8a91', { opacity: 75 }),
        ),
      ),
      hills('Far mountains', 380, 90, 1.4, '#9a8c9c', 2.2),
      shape(
        'Volcano',
        [
          [220, 720],
          [540, 270],
          [600, 250],
          [680, 250],
          [740, 270],
          [1080, 720],
        ],
        { from: '#6b4a3a', to: '#4a3328', angle: 90 },
      ),
      ellipse('Crater glow', 556, 236, 168, 40, { from: '#ffd166', to: '#e8471c', radial: true }),
      group('Lava flows', [
        shape(
          'Lava flow 1',
          [
            [580, 256],
            [612, 256],
            [570, 380],
            [600, 470],
            [560, 560],
            [540, 556],
            [570, 470],
            [540, 380],
          ],
          { from: '#ffb13b', to: '#e8471c', angle: 90 },
        ),
        shape(
          'Lava flow 2',
          [
            [660, 256],
            [690, 256],
            [760, 360],
            [800, 440],
            [780, 450],
            [736, 372],
          ],
          { from: '#ffb13b', to: '#e8471c', angle: 90 },
        ),
      ]),
      group(
        'Sparks',
        [
          [600, 200],
          [650, 180],
          [690, 205],
          [620, 150],
          [710, 160],
        ].map(([x, y], i) => circle(`Spark ${i + 1}`, x!, y!, 5, '#ffb13b')),
      ),
      hills('Foreground', 600, 50, 1.2, '#5a6b3c', 1),
      group('Rocks', [
        ellipse('Rock 1', 120, 640, 90, 40, '#4a4440'),
        ellipse('Rock 2', 1040, 660, 120, 46, '#4a4440'),
        ellipse('Rock 3', 1150, 640, 60, 30, '#5a524c'),
      ]),
    ],
  );

const moon = (): LibraryItem => {
  const rnd = seeded(91);
  return background(
    'background.moon',
    'Surface of the Moon',
    ['space', 'moon', 'lunar', 'craters', 'astronomy', 'earth', 'night'],
    [
      rect('Space', 0, 0, W, H, { from: '#04060e', to: '#161c33', angle: 90 }),
      group(
        'Stars',
        range(40).map((i) =>
          circle(`Star ${i + 1}`, 10 + rnd() * 1260, 10 + rnd() * 380, 1 + rnd() * 1.6, '#ffffff', {
            opacity: 60 + Math.round(rnd() * 40),
          }),
        ),
      ),
      group('Earth', [
        circle('Ocean', 1040, 140, 64, { from: '#6fb6ff', to: '#1f5fae', radial: true }),
        ellipse('Land 1', 1004, 108, 44, 30, '#5fae68'),
        ellipse('Land 2', 1046, 140, 30, 46, '#5fae68'),
        ellipse('Cloud band', 1000, 160, 70, 14, '#ffffff', { opacity: 70 }),
        shape(
          'Night side',
          [...arc(1040, 140, 64, 64, -60, 120, 16), ...arc(1072, 140, 40, 64, 120, -60, 16)],
          '#04060e',
          { opacity: 55 },
        ),
      ]),
      hills('Far ridge', 420, 50, 1.6, '#4d505c', 0.4),
      hills('Ground', 470, 30, 1, { from: '#a3a5ae', to: '#73767f', angle: 90 }, 1.1),
      ...[
        [180, 540, 200, 46],
        [560, 600, 280, 60],
        [960, 520, 160, 36],
        [1000, 640, 220, 54],
        [380, 660, 120, 30],
        [780, 500, 100, 22],
      ].map(([x, y, w, h], i) =>
        group(`Crater ${i + 1}`, [
          ellipse('Rim', x!, y!, w!, h!, '#8e9099'),
          ellipse('Hollow', x! + w! * 0.08, y! + h! * 0.18, w! * 0.84, h! * 0.7, '#6b6e77'),
        ]),
      ),
      group('Rocks', [
        ellipse('Rock 1', 80, 640, 60, 26, '#5d6068'),
        ellipse('Rock 2', 860, 670, 80, 30, '#5d6068'),
        ellipse('Rock 3', 470, 560, 40, 16, '#5d6068'),
      ]),
    ],
  );
};

const mars = (): LibraryItem =>
  background(
    'background.mars',
    'Mars',
    ['space', 'planet', 'red planet', 'rover', 'desert', 'astronomy'],
    [
      rect('Sky', 0, 0, W, 480, { from: '#d99a74', to: '#f3d6b8', angle: 90 }),
      circle('Sun', 260, 120, 30, '#fff4e0', { opacity: 80 }),
      group('Moons', [
        ellipse('Phobos', 900, 90, 26, 18, '#b7a79a'),
        ellipse('Deimos', 1010, 150, 12, 10, '#c2b3a6'),
      ]),
      hills('Far mountains', 330, 110, 0.9, '#c98a66', 0.3),
      shape(
        'Mesa',
        [
          [700, 450],
          [760, 370],
          [940, 370],
          [1000, 450],
        ],
        '#b8693f',
      ),
      hills('Ground', 440, 40, 1.3, { from: '#c4683f', to: '#9c4a2c', angle: 90 }, 2),
      hills('Dunes', 560, 50, 2, '#b85d36', 0.7),
      group('Rocks', [
        shape(
          'Rock 1',
          [
            [120, 650],
            [150, 620],
            [200, 630],
            [215, 660],
            [120, 660],
          ],
          '#7a3b24',
        ),
        shape(
          'Rock 2',
          [
            [980, 640],
            [1010, 600],
            [1070, 610],
            [1090, 650],
          ],
          '#7a3b24',
        ),
        shape(
          'Rock 3',
          [
            [560, 690],
            [580, 670],
            [610, 675],
            [620, 695],
          ],
          '#7a3b24',
        ),
        ellipse('Pebble', 400, 620, 30, 12, '#7a3b24'),
      ]),
      group('Rover', [
        rect('Body', 690, 548, 150, 40, '#e8e4dc', { radius: 6 }),
        rect('Solar panel', 670, 538, 190, 12, '#3b4a6b', { radius: 2 }),
        rect('Mast', 812, 476, 8, 64, '#9aa2ab'),
        rect('Camera', 800, 464, 34, 18, '#e8e4dc', { radius: 4 }),
        line(
          'Suspension',
          [
            [700, 610],
            [740, 588],
            [790, 588],
            [830, 610],
          ],
          '#6b7480',
          5,
        ),
        circle('Back wheel', 700, 612, 16, '#3d4652'),
        circle('Middle wheel', 765, 612, 16, '#3d4652'),
        circle('Front wheel', 830, 612, 16, '#3d4652'),
      ]),
    ],
  );

export const MORE_BACKGROUNDS: readonly LibraryItem[] = [
  serverRoom(),
  codingDesk(),
  codeEditor(),
  digitalRain(),
  network(),
  techGrid(),
  office(),
  csClassroom(),
  street(),
  playpark(),
  kitchen(),
  bedroom(),
  stadium(),
  rainbow(),
  autumn(),
  volcano(),
  moon(),
  mars(),
];
