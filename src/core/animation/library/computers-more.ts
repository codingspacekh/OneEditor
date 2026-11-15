// AN19: more Computers & IT pictures — AI, cloud, security, the web, programming and networks.
import {
  arc,
  circle,
  ellipse,
  group,
  line,
  rect,
  shape,
  turnedRect,
  type LibraryItem,
  type Part,
} from './build.ts';

const INK = '#2d2a32';
const OUTLINE = [INK, 3] as const;
const THIN = [INK, 2] as const;
const BLUE = '#2f7fe0';
const RED = '#e84545';
const GREEN = '#5cbf60';
const GOLD = '#ffc83d';
const STEEL = '#9aa4b2';
const LIGHT = '#e9edf2';
const SLATE = '#3d4452';
const SKY = '#c7e3ff';
const GLOW = '#5ec8ff';
const SCREEN = { from: '#4f8cff', to: '#7fd0ff', angle: 90 } as const;

type Pt = [number, number];

const item = (
  id: string,
  name: string,
  keywords: string[],
  parts: Part[],
  width = 100,
  height = 100,
): LibraryItem => ({ id, name, category: 'computers', keywords, width, height, parts });

const HARDWARE = ['computer', 'hardware', 'device'];
const AI = ['ai', 'artificial intelligence', 'machine learning'];
const SECURITY = ['security', 'cyber security', 'online safety', 'data protection'];
const WEB = ['internet', 'web', 'online', 'world wide web'];
const PROGRAMMING = ['programming', 'algorithm', 'computer science', 'code'];
const COMMS = ['network', 'communication', 'telecommunications', 'signal', 'wireless'];

/** A person: a head and shoulders, `s` times the size of the 80 × 100 one, at (x, y). */
const person = (prefix: string, x: number, y: number, s: number, fill: string): Part[] => [
  circle(`${prefix}head`, x + 40 * s, y + 26 * s, 22 * s, fill),
  shape(`${prefix}body`, arc(x + 40 * s, y + 96 * s, 36 * s, 40 * s, 180, 360, 20), fill),
];

/** A bar `w` thick from one point to another, with square ends just past both points. */
const bar = (
  name: string,
  [x1, y1]: Pt,
  [x2, y2]: Pt,
  w: number,
  fill: string,
  o: { stroke?: readonly [string, number] } = {},
): Part =>
  shape(
    name,
    turnedRect(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      Math.hypot(x2 - x1, y2 - y1) + w * 0.6,
      w,
      (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
    ),
    fill,
    o,
  );

/** An arrow: a line and a triangle head at its end. */
const arrow = (name: string, pts: Pt[], colour: string, width: number, head = 6): Part => {
  const [x2, y2] = pts[pts.length - 1]!;
  const [x1, y1] = pts[pts.length - 2]!;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const back = (d: number, side: number): Pt => [
    x2 - d * Math.cos(a) - side * Math.sin(a),
    y2 - d * Math.sin(a) + side * Math.cos(a),
  ];
  const shaft = [...pts.slice(0, -1), back(head * 1.2, 0)];
  return group(name, [
    line(`${name} line`, shaft, colour, width),
    shape(`${name} head`, [[x2, y2], back(head * 1.6, head), back(head * 1.6, -head)], colour),
  ]);
};

/** Points along a curve from p0 to p2, pulled towards p1. */
function curve(p0: Pt, p1: Pt, p2: Pt, steps = 10): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ] as Pt;
  });
}

/** Points along an ellipse's arc whose edge bulges out in `bumps` lobes (a brain, a cloud). */
function bumpy(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  bumps: number,
): Pt[] {
  const steps = bumps * 8;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const deg = from + ((to - from) * i) / steps;
    const k = 0.9 + 0.1 * Math.abs(Math.sin((Math.PI * bumps * i) / steps));
    const a = (deg * Math.PI) / 180;
    return [cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)] as Pt;
  });
}

/** The points turned by `deg` about (0, 0), then moved to (cx, cy). */
const turn = (pts: Pt[], cx: number, cy: number, deg: number): Pt[] => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as Pt);
};

/** A heart whose lobes have radius `r`, its notch at (cx, cy). */
const heart = (cx: number, cy: number, r: number): Pt[] => [
  [cx, cy + 2.3 * r],
  ...arc(cx - r, cy, r, r, 145, 360, 12),
  ...arc(cx + r, cy, r, r, 180, 395, 12),
];

/** A tick (check mark) centred on (cx, cy), `s` px across. */
const tick = (cx: number, cy: number, s: number): Pt[] => [
  [cx - s / 2, cy],
  [cx - s / 6, cy + s / 3],
  [cx + s / 2, cy - s / 3],
];

/** A small padlock, its body `w` wide, its top-left at (x, y). */
const padlock = (prefix: string, x: number, y: number, w: number): Part[] => [
  line(
    `${prefix}shackle`,
    [
      [x + w * 0.22, y + w * 0.1],
      ...arc(x + w / 2, y, w * 0.28, w * 0.32, 180, 360, 12),
      [x + w * 0.78, y + w * 0.1],
    ],
    STEEL,
    w * 0.16,
  ),
  rect(`${prefix}body`, x, y, w, w * 0.8, GOLD, { radius: w * 0.12, stroke: THIN }),
  circle(`${prefix}keyhole`, x + w / 2, y + w * 0.36, w * 0.1, INK),
];

/** The parts of an envelope in the box (x, y, w, h). */
const envelope = (x: number, y: number, w: number, h: number): Part[] => [
  rect('Envelope', x, y, w, h, '#ffffff', { radius: 4, stroke: OUTLINE }),
  line(
    'Flap',
    [
      [x + 2, y + 2],
      [x + w / 2, y + h * 0.55],
      [x + w - 2, y + 2],
    ],
    INK,
    3,
  ),
];

export const MORE_COMPUTERS: readonly LibraryItem[] = [
  // ---- artificial intelligence ----
  item(
    'computer.ai',
    'Artificial intelligence',
    [...AI, 'brain', 'smart', 'thinking', 'neural', 'computer science'],
    [
      shape('Brain', bumpy(57, 50, 48, 46, 90, 270, 7), '#f6a5c0', { stroke: OUTLINE }),
      line('Top fold', arc(36, 34, 13, 9, 200, 340, 8), INK, 2.5),
      line('Middle fold', arc(30, 54, 12, 8, 160, 380, 8), INK, 2.5),
      line('Bottom fold', arc(44, 72, 12, 8, 190, 340, 8), INK, 2.5),
      line('Centre fold', arc(52, 48, 6, 14, -80, 80, 8), INK, 2.5),
      shape('Chip half', bumpy(63, 50, 48, 46, -90, 90, 7), SKY, { stroke: OUTLINE }),
      line(
        'Track 1',
        [
          [64, 28],
          [78, 28],
          [86, 20],
        ],
        BLUE,
        3,
      ),
      line(
        'Track 2',
        [
          [64, 50],
          [94, 50],
        ],
        BLUE,
        3,
      ),
      line(
        'Track 3',
        [
          [64, 72],
          [78, 72],
          [86, 80],
        ],
        BLUE,
        3,
      ),
      line(
        'Track 4',
        [
          [64, 39],
          [72, 39],
        ],
        BLUE,
        3,
      ),
      line(
        'Track 5',
        [
          [64, 61],
          [72, 61],
        ],
        BLUE,
        3,
      ),
      circle('Node 1', 88, 18, 4, GOLD, { stroke: THIN }),
      circle('Node 2', 97, 50, 4, GOLD, { stroke: THIN }),
      circle('Node 3', 88, 82, 4, GOLD, { stroke: THIN }),
      circle('Node 4', 75, 39, 3.5, GOLD, { stroke: THIN }),
      circle('Node 5', 75, 61, 3.5, GOLD, { stroke: THIN }),
    ],
    120,
    100,
  ),
  item(
    'computer.neuralnetwork',
    'Neural network',
    [...AI, 'neural network', 'deep learning', 'nodes', 'layers', 'network'],
    (() => {
      const layers: Pt[][] = [
        [22, 50, 78].map((y) => [16, y] as Pt),
        [14, 38, 62, 86].map((y) => [60, y] as Pt),
        [34, 66].map((y) => [104, y] as Pt),
      ];
      const links: Part[] = [];
      for (let l = 0; l < 2; l++)
        for (const a of layers[l]!)
          for (const b of layers[l + 1]!)
            links.push(line(`Link ${links.length + 1}`, [a, b], STEEL, 2));
      const colours = [GREEN, BLUE, GOLD];
      const names = ['Input', 'Hidden', 'Output'];
      return [
        group('Links', links),
        ...layers.map((nodes, l) =>
          group(
            `${names[l]} layer`,
            nodes.map(([x, y], i) =>
              circle(`${names[l]} node ${i + 1}`, x, y, 9, colours[l]!, { stroke: THIN }),
            ),
          ),
        ),
      ];
    })(),
    120,
    100,
  ),

  // ---- the cloud and the internet of things ----
  item(
    'computer.cloudcomputing',
    'Cloud computing',
    ['cloud', 'cloud computing', 'online', 'internet', 'network', 'sync', 'devices', 'storage'],
    [
      line(
        'Laptop link',
        [
          [58, 44],
          [24, 74],
        ],
        INK,
        2,
      ),
      line(
        'Phone link',
        [
          [70, 46],
          [70, 66],
        ],
        INK,
        2,
      ),
      line(
        'Monitor link',
        [
          [82, 44],
          [116, 70],
        ],
        INK,
        2,
      ),
      group('Cloud', [
        rect('Cloud base', 34, 22, 72, 26, SKY, { radius: 13 }),
        circle('Left puff', 54, 26, 16, SKY),
        circle('Top puff', 72, 20, 18, SKY),
        circle('Right puff', 90, 30, 13, SKY),
      ]),
      group('Laptop', [
        rect('Laptop lid', 8, 74, 34, 22, INK, { radius: 3 }),
        rect('Laptop screen', 11, 77, 28, 16, SCREEN),
        rect('Laptop base', 2, 96, 46, 6, '#c5ccd6', { radius: 2, stroke: THIN }),
      ]),
      group('Phone', [
        rect('Phone case', 60, 66, 20, 36, INK, { radius: 4 }),
        rect('Phone screen', 62, 70, 16, 26, SCREEN),
      ]),
      group('Monitor', [
        rect('Monitor neck', 112, 94, 8, 6, STEEL),
        rect('Monitor foot', 104, 99, 24, 4, STEEL, { radius: 2 }),
        rect('Monitor bezel', 98, 70, 36, 25, INK, { radius: 3 }),
        rect('Monitor screen', 101, 73, 30, 19, SCREEN),
      ]),
    ],
    140,
    106,
  ),
  item(
    'computer.smarthome',
    'Smart home',
    ['smart home', 'iot', 'internet of things', 'home', 'house', 'wifi', 'wireless', 'network'],
    [
      rect('Chimney', 80, 18, 12, 26, '#b85a3c', { stroke: THIN }),
      rect('Walls', 18, 50, 84, 56, LIGHT, { stroke: OUTLINE }),
      shape(
        'Roof',
        [
          [6, 56],
          [60, 8],
          [114, 56],
        ],
        RED,
        { stroke: OUTLINE },
      ),
      line('Outer wave', arc(60, 96, 28, 28, 225, 315, 10), BLUE, 6),
      line('Middle wave', arc(60, 96, 18, 18, 225, 315, 10), BLUE, 6),
      line('Inner wave', arc(60, 96, 8, 8, 225, 315, 8), BLUE, 6),
      circle('Dot', 60, 97, 4.5, BLUE),
    ],
    120,
    110,
  ),
  item(
    'computer.smartspeaker',
    'Smart speaker',
    [
      ...HARDWARE,
      'smart speaker',
      'voice assistant',
      'speech recognition',
      'iot',
      'smart home',
      'input device',
      'output device',
      ...AI,
    ],
    [
      rect('Body', 36, 18, 48, 86, SLATE, { radius: 8, stroke: THIN }),
      ...Array.from({ length: 15 }, (_, n) =>
        circle(
          `Grille hole ${n + 1}`,
          48 + (n % 3) * 12,
          40 + Math.floor(n / 3) * 13,
          2.5,
          '#59616f',
        ),
      ),
      ellipse('Top', 36, 10, 48, 16, STEEL, { stroke: THIN }),
      ellipse('Light ring', 41, 13, 38, 10, null, { stroke: [GLOW, 3] }),
      line('Left near wave', arc(32, 58, 9, 14, 140, 220, 8), GLOW, 4),
      line('Left far wave', arc(32, 58, 19, 26, 140, 220, 10), GLOW, 4),
      line('Right near wave', arc(88, 58, 9, 14, -40, 40, 8), GLOW, 4),
      line('Right far wave', arc(88, 58, 19, 26, -40, 40, 10), GLOW, 4),
    ],
    120,
    108,
  ),

  // ---- programming ----
  item(
    'computer.terminal',
    'Command line',
    [...PROGRAMMING, 'command line', 'terminal', 'console', 'shell', 'prompt', 'cli', 'interface'],
    [
      rect('Frame', 2, 2, 136, 96, '#1e2230', { radius: 6, stroke: OUTLINE }),
      rect('Title bar', 2, 2, 136, 18, SLATE, { radius: 6 }),
      circle('Close', 14, 11, 4, RED),
      circle('Minimise', 26, 11, 4, GOLD),
      circle('Maximise', 38, 11, 4, GREEN),
      line(
        'Prompt 1',
        [
          [14, 32],
          [22, 38],
          [14, 44],
        ],
        GREEN,
        3.5,
      ),
      rect('Command', 30, 35, 58, 6, '#9ef0a0', { radius: 3 }),
      rect('Output 1', 14, 52, 104, 6, STEEL, { radius: 3 }),
      rect('Output 2', 14, 64, 76, 6, STEEL, { radius: 3 }),
      line(
        'Prompt 2',
        [
          [14, 76],
          [22, 82],
          [14, 88],
        ],
        GREEN,
        3.5,
      ),
      rect('Cursor', 30, 76, 9, 13, GREEN),
    ],
    140,
    100,
  ),
  item(
    'computer.flowchart',
    'Algorithm flowchart',
    [...PROGRAMMING, 'flowchart', 'flow chart', 'decision', 'process', 'selection', 'iteration'],
    [
      rect('Start', 30, 4, 60, 18, GREEN, { radius: 9, stroke: THIN }),
      arrow(
        'Arrow 1',
        [
          [60, 22],
          [60, 36],
        ],
        INK,
        2.5,
        4,
      ),
      rect('Process', 26, 36, 68, 22, SKY, { stroke: THIN }),
      arrow(
        'Arrow 2',
        [
          [60, 58],
          [60, 70],
        ],
        INK,
        2.5,
        4,
      ),
      shape(
        'Decision',
        [
          [60, 70],
          [92, 88],
          [60, 106],
          [28, 88],
        ],
        GOLD,
        { stroke: THIN },
      ),
      arrow(
        'Yes arrow',
        [
          [60, 106],
          [60, 120],
        ],
        INK,
        2.5,
        4,
      ),
      arrow(
        'No arrow',
        [
          [92, 88],
          [112, 88],
          [112, 47],
          [94, 47],
        ],
        INK,
        2.5,
        4,
      ),
      rect('Stop', 30, 120, 60, 18, RED, { radius: 9, stroke: THIN }),
    ],
    120,
    140,
  ),
  item(
    'computer.tree',
    'Binary tree',
    [...PROGRAMMING, 'binary tree', 'tree', 'data structure', 'hierarchy', 'nodes', 'search'],
    (() => {
      const root: Pt = [60, 16];
      const mid: Pt[] = [
        [32, 50],
        [88, 50],
      ];
      const leaves: Pt[] = [
        [14, 84],
        [46, 84],
        [74, 84],
        [106, 84],
      ];
      return [
        group('Branches', [
          ...mid.map((p, i) => line(`Branch ${i + 1}`, [root, p], INK, 3)),
          ...leaves.map((p, i) => line(`Branch ${i + 3}`, [mid[i >> 1]!, p], INK, 3)),
        ]),
        circle('Root', root[0], root[1], 12, GOLD, { stroke: THIN }),
        ...mid.map(([x, y], i) => circle(`Node ${i + 1}`, x, y, 12, BLUE, { stroke: THIN })),
        ...leaves.map(([x, y], i) => circle(`Leaf ${i + 1}`, x, y, 12, GREEN, { stroke: THIN })),
      ];
    })(),
    120,
    100,
  ),

  // ---- the web ----
  item(
    'computer.webpage',
    'Web page',
    [...WEB, 'web page', 'website', 'browser', 'html', 'layout', 'wireframe', 'design'],
    [
      rect('Frame', 2, 2, 136, 106, '#ffffff', { radius: 6, stroke: OUTLINE }),
      rect('Toolbar', 2, 2, 136, 20, LIGHT, { radius: 6 }),
      circle('Close', 12, 12, 3.5, RED),
      circle('Minimise', 22, 12, 3.5, GOLD),
      circle('Maximise', 32, 12, 3.5, GREEN),
      rect('Address bar', 42, 6, 88, 12, '#ffffff', { radius: 6, stroke: [STEEL, 1.5] }),
      rect('Header', 10, 28, 120, 12, BLUE, { radius: 2 }),
      rect('Menu 1', 80, 32, 12, 4, '#ffffff', { radius: 2 }),
      rect('Menu 2', 96, 32, 12, 4, '#ffffff', { radius: 2 }),
      rect('Menu 3', 112, 32, 12, 4, '#ffffff', { radius: 2 }),
      rect('Banner', 10, 46, 72, 34, SKY, { radius: 2 }),
      circle('Sun', 70, 54, 4, GOLD),
      shape(
        'Hills',
        [
          [10, 80],
          [32, 58],
          [48, 72],
          [58, 64],
          [82, 80],
        ],
        GREEN,
      ),
      rect('Text 1', 90, 48, 40, 5, STEEL, { radius: 2.5 }),
      rect('Text 2', 90, 58, 40, 5, STEEL, { radius: 2.5 }),
      rect('Text 3', 90, 68, 28, 5, STEEL, { radius: 2.5 }),
      rect('Button', 90, 76, 28, 8, GOLD, { radius: 4 }),
      rect('Card 1', 10, 88, 36, 14, LIGHT, { radius: 2 }),
      rect('Card 2', 52, 88, 36, 14, LIGHT, { radius: 2 }),
      rect('Card 3', 94, 88, 36, 14, LIGHT, { radius: 2 }),
    ],
    140,
    110,
  ),
  item(
    'computer.like',
    'Social media like',
    [...WEB, 'social media', 'social network', 'like', 'heart', 'notification', 'communication'],
    [
      shape(
        'Bubble tail',
        [
          [22, 70],
          [46, 70],
          [16, 96],
        ],
        RED,
      ),
      rect('Bubble', 4, 4, 102, 74, RED, { radius: 18 }),
      shape('Heart', heart(55, 30, 13), '#ffffff'),
    ],
    110,
    100,
  ),
  item(
    'computer.cart',
    'Online shopping',
    [...WEB, 'e-commerce', 'online shopping', 'shopping cart', 'cart', 'trolley', 'shop', 'buy'],
    [
      rect('Parcel 1', 46, 12, 24, 20, GOLD, { stroke: THIN }),
      rect('Parcel 2', 72, 18, 20, 14, GREEN, { stroke: THIN }),
      line(
        'Handle',
        [
          [4, 12],
          [18, 12],
          [34, 66],
          [36, 76],
          [102, 76],
        ],
        INK,
        5,
      ),
      shape(
        'Basket',
        [
          [22, 28],
          [112, 28],
          [100, 64],
          [32, 64],
        ],
        SKY,
        { stroke: OUTLINE },
      ),
      line(
        'Wire 1',
        [
          [48, 28],
          [52, 64],
        ],
        BLUE,
        2.5,
      ),
      line(
        'Wire 2',
        [
          [70, 28],
          [70, 64],
        ],
        BLUE,
        2.5,
      ),
      line(
        'Wire 3',
        [
          [92, 28],
          [86, 64],
        ],
        BLUE,
        2.5,
      ),
      line(
        'Wire 4',
        [
          [27, 46],
          [106, 46],
        ],
        BLUE,
        2.5,
      ),
      circle('Left wheel', 44, 88, 8, SLATE, { stroke: THIN }),
      circle('Right wheel', 94, 88, 8, SLATE, { stroke: THIN }),
    ],
    120,
    100,
  ),
  item(
    'computer.location',
    'GPS location',
    ['gps', 'location', 'map', 'pin', 'navigation', 'satellite', 'tracking', 'sat nav', 'online'],
    [
      ...[6, 42, 78].map((x, i) =>
        shape(
          `Map panel ${i + 1}`,
          [
            [x, i % 2 ? 50 : 60],
            [x + 36, i % 2 ? 60 : 50],
            [x + 36, i % 2 ? 108 : 98],
            [x, i % 2 ? 98 : 108],
          ],
          i % 2 ? '#a8d59b' : '#c4e6b8',
          { stroke: THIN },
        ),
      ),
      line(
        'Road',
        [
          [8, 92],
          [30, 80],
          [56, 90],
          [84, 74],
          [112, 82],
        ],
        '#ffffff',
        4,
      ),
      ellipse('Shadow', 50, 82, 20, 7, INK, { opacity: 30 }),
      shape('Pin', [[60, 84], ...arc(60, 32, 24, 24, 150, 390, 24)], RED, { stroke: OUTLINE }),
      circle('Pin hole', 60, 32, 9, '#ffffff'),
    ],
    120,
    110,
  ),
  item(
    'computer.videocall',
    'Video call',
    [
      ...WEB,
      'video call',
      'video conferencing',
      'video conference',
      'webcam',
      'meeting',
      'communication',
    ],
    [
      rect('Neck', 60, 94, 20, 8, STEEL),
      rect('Foot', 42, 100, 56, 8, STEEL, { radius: 3 }),
      rect('Bezel', 2, 2, 136, 92, INK, { radius: 6 }),
      rect('Screen', 8, 8, 124, 80, '#dbe9ff'),
      group('Caller', person('Caller ', 38, 8, 0.8, GOLD)),
      rect('Self view', 100, 50, 28, 32, SKY, { stroke: [GLOW, 2] }),
      group('Me', person('Me ', 102, 51, 0.3, GREEN)),
      circle('Microphone button', 46, 80, 5, SLATE),
      rect('Hang up button', 56, 75, 26, 10, RED, { radius: 5 }),
      circle('Camera button', 92, 80, 5, SLATE),
      circle('Webcam', 70, 5, 2, STEEL),
    ],
    140,
    110,
  ),

  // ---- security ----
  item(
    'computer.phishing',
    'Phishing',
    [...SECURITY, 'phishing', 'scam', 'fraud', 'email', 'hook', 'social engineering', 'threat'],
    [
      ...envelope(8, 52, 104, 56),
      line(
        'Fishing line',
        [
          [66, 2],
          [66, 26],
        ],
        INK,
        2,
      ),
      circle('Hook eye', 66, 30, 4, null, { stroke: [SLATE, 3] }),
      line('Hook', [[66, 34], [66, 62], ...arc(56, 62, 10, 10, 0, 180, 10), [46, 54]], SLATE, 5),
      shape(
        'Barb',
        [
          [46, 46],
          [52, 58],
          [43, 57],
        ],
        SLATE,
      ),
    ],
    120,
    110,
  ),
  item(
    'computer.password',
    'Password',
    [...SECURITY, 'password', 'login', 'log in', 'authentication', 'pin', 'hidden', 'input'],
    [
      rect('Box', 2, 12, 136, 46, '#ffffff', { radius: 8, stroke: OUTLINE }),
      ...padlock('Lock ', 12, 28, 20),
      ...Array.from({ length: 6 }, (_, i) => circle(`Dot ${i + 1}`, 48 + i * 14, 35, 5, INK)),
      rect('Cursor', 128, 24, 3, 22, BLUE),
    ],
    140,
    70,
  ),
  item(
    'computer.twofactor',
    'Two-factor authentication',
    [
      ...SECURITY,
      'two-factor',
      '2fa',
      'authentication',
      'verification',
      'login',
      'code',
      'phone',
      'password',
    ],
    [
      rect('Case', 8, 4, 58, 102, INK, { radius: 10 }),
      rect('Screen', 13, 14, 48, 80, SCREEN),
      rect('Speaker', 29, 7, 16, 3, STEEL, { radius: 1.5 }),
      circle('Tick circle', 37, 38, 14, GREEN, { stroke: [`#ffffff`, 2] }),
      line('Tick', tick(37, 39, 14), '#ffffff', 4),
      ...Array.from({ length: 4 }, (_, i) =>
        rect(`Code box ${i + 1}`, 17 + i * 10.5, 64, 8, 12, '#ffffff', { radius: 2 }),
      ),
      ...padlock('Lock ', 72, 66, 32),
    ],
    110,
    110,
  ),
  item(
    'computer.encryption',
    'Encryption',
    [
      ...SECURITY,
      'encryption',
      'encrypt',
      'cipher',
      'ciphertext',
      'plaintext',
      'decryption',
      'key',
    ],
    [
      rect('Plain document', 4, 8, 38, 54, '#ffffff', { radius: 3, stroke: THIN }),
      ...[0, 1, 2, 3, 4].map((i) =>
        rect(`Plain line ${i + 1}`, 10, 17 + i * 9, i === 4 ? 16 : 26, 4, STEEL, { radius: 2 }),
      ),
      arrow(
        'Arrow in',
        [
          [46, 35],
          [62, 35],
        ],
        INK,
        3,
        5,
      ),
      ...padlock('Lock ', 66, 28, 28),
      arrow(
        'Arrow out',
        [
          [98, 35],
          [114, 35],
        ],
        INK,
        3,
        5,
      ),
      rect('Scrambled document', 118, 8, 38, 54, SLATE, { radius: 3, stroke: THIN }),
      ...(
        [
          [123, 16, 8, GREEN],
          [134, 16, 14, GOLD],
          [123, 25, 16, RED],
          [142, 25, 8, GLOW],
          [128, 34, 6, GOLD],
          [137, 34, 13, GREEN],
          [123, 43, 10, GLOW],
          [136, 43, 6, RED],
          [145, 43, 5, GOLD],
          [126, 52, 18, GREEN],
        ] as const
      ).map(([x, y, w, c], i) => rect(`Scrambled bit ${i + 1}`, x, y, w, 5, c, { radius: 1 })),
    ],
    160,
    70,
  ),

  // ---- communication links ----
  item(
    'computer.mast',
    'Mobile phone mast',
    [...COMMS, 'mast', 'cell tower', 'mobile network', '4g', '5g', 'antenna', 'transmitter'],
    [
      line(
        'Left leg',
        [
          [48, 30],
          [24, 116],
        ],
        SLATE,
        4,
      ),
      line(
        'Right leg',
        [
          [52, 30],
          [76, 116],
        ],
        SLATE,
        4,
      ),
      group('Braces', [
        line(
          'Brace 1',
          [
            [41, 58],
            [59, 58],
          ],
          SLATE,
          2.5,
        ),
        line(
          'Brace 2',
          [
            [41, 58],
            [67.5, 88],
            [32.5, 88],
            [59, 58],
          ],
          SLATE,
          2.5,
        ),
        line(
          'Brace 3',
          [
            [32.5, 88],
            [76, 116],
          ],
          SLATE,
          2.5,
        ),
        line(
          'Brace 4',
          [
            [67.5, 88],
            [24, 116],
          ],
          SLATE,
          2.5,
        ),
      ]),
      rect('Pole', 47, 10, 6, 24, SLATE),
      rect('Left antenna', 36, 14, 9, 22, LIGHT, { radius: 2, stroke: THIN }),
      rect('Right antenna', 55, 14, 9, 22, LIGHT, { radius: 2, stroke: THIN }),
      circle('Top light', 50, 7, 4, RED),
      line('Left near wave', arc(50, 24, 27, 27, 145, 215, 8), BLUE, 4),
      line('Left far wave', arc(50, 24, 39, 39, 145, 215, 10), BLUE, 4),
      line('Right near wave', arc(50, 24, 27, 27, -35, 35, 8), BLUE, 4),
      line('Right far wave', arc(50, 24, 39, 39, -35, 35, 10), BLUE, 4),
    ],
    100,
    120,
  ),
  item(
    'computer.dish',
    'Satellite dish',
    [...COMMS, 'satellite dish', 'dish', 'satellite', 'aerial', 'antenna', 'receiver', 'tv'],
    (() => {
      const at = (x: number, y: number): Pt => turn([[x, y]], 44, 50, 40)[0]!;
      const feed = at(0, -30);
      return [
        rect('Base', 22, 88, 40, 9, SLATE, { radius: 3 }),
        line('Post', [at(0, 13), [42, 88]], SLATE, 6),
        shape('Dish', turn(arc(0, 0, 34, 14, 0, 180, 18), 44, 50, 40), LIGHT, {
          stroke: OUTLINE,
        }),
        line('Feed arm', [at(0, 0), feed], INK, 3),
        circle('Receiver', feed[0], feed[1], 5, GOLD, { stroke: THIN }),
        line('Near wave', arc(feed[0], feed[1], 12, 12, -80, 10, 8), BLUE, 3.5),
        line('Far wave', arc(feed[0], feed[1], 21, 21, -80, 10, 10), BLUE, 3.5),
      ];
    })(),
    100,
    100,
  ),
  item(
    'computer.fibre',
    'Fibre-optic cable',
    [
      ...COMMS,
      'fibre optic',
      'fiber optic',
      'fibre',
      'cable',
      'broadband',
      'light',
      'wired',
      'transmission media',
    ],
    [
      rect('Cable', 2, 32, 62, 16, SLATE, { radius: 8 }),
      ...[10, 20, 30, 40, 50, 60, 70].map((y, i) =>
        line(`Strand ${i + 1}`, curve([66, 40], [100, 40], [128, y]), GLOW, 2),
      ),
      rect('Connector', 56, 30, 14, 20, STEEL, { radius: 2, stroke: THIN }),
      ...[10, 20, 30, 40, 50, 60, 70].map((y, i) =>
        circle(`Light ${i + 1}`, 131, y, 4, '#ffffff', { stroke: [GLOW, 2] }),
      ),
    ],
    140,
    80,
  ),

  // ---- automation ----
  item(
    'computer.robotarm',
    'Robot arm',
    [
      'robot arm',
      'robotics',
      'automation',
      'manufacturing',
      'factory',
      'control',
      'machine',
      ...AI,
    ],
    [
      rect('Base', 18, 94, 60, 12, SLATE, { radius: 3 }),
      rect('Turntable', 30, 80, 36, 16, GOLD, { radius: 4, stroke: THIN }),
      bar('Lower arm', [48, 80], [32, 38], 14, GOLD, { stroke: THIN }),
      bar('Upper arm', [32, 38], [86, 30], 12, GOLD, { stroke: THIN }),
      circle('Shoulder', 48, 80, 9, SLATE, { stroke: THIN }),
      circle('Elbow', 32, 38, 8, SLATE, { stroke: THIN }),
      circle('Wrist', 88, 30, 6, SLATE, { stroke: THIN }),
      rect('Gripper plate', 76, 35, 24, 6, SLATE, { radius: 2 }),
      rect('Box', 81, 50, 14, 14, '#c98a4a', { stroke: THIN }),
      rect('Left finger', 76, 41, 5, 19, STEEL, { stroke: THIN }),
      rect('Right finger', 95, 41, 5, 19, STEEL, { stroke: THIN }),
    ],
    110,
    108,
  ),
];
