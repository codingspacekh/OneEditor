// AN19: more cartoons — animals, vehicles and everyday things, drawn like cartoons.ts. Each part
// that moves on its own (a head, a wing, a wheel, a propeller, a flame) is named, and grouped when
// it is made of more than one shape, so a student can animate it from the Layers.
import {
  arc,
  circle,
  ellipse,
  group,
  line,
  polygon,
  rect,
  shape,
  star,
  type LibraryItem,
  type Part,
} from './build.ts';

const INK = '#2d2a32';
const OUTLINE = [INK, 3] as const;
const THIN = [INK, 2] as const;
const RED = '#e84545';
const YELLOW = '#f5c518';
const ORANGE = '#f5a623';
const GLASS = '#bfe6ff';
const HUB = '#c9ced6';
const eyes = (lx: number, rx: number, y: number, r = 5) => [
  circle('Left eye', lx, y, r, INK),
  circle('Right eye', rx, y, r, INK),
];
const smile = (cx: number, cy: number, rx: number, ry: number, width = 3) =>
  line('Mouth', arc(cx, cy, rx, ry, 20, 160, 8), INK, width);

/** A regular pentagon's corners, one of them at `deg` (0° is to the right, 90° down). */
const pentagon = (cx: number, cy: number, r: number, deg: number): [number, number][] =>
  Array.from({ length: 5 }, (_, i) => {
    const a = ((deg + i * 72) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

/** A wheel that turns: a tyre, spokes and a hub, centred on (cx, cy). */
const spokedWheel = (name: string, cx: number, cy: number, r: number): Part =>
  group(name, [
    circle('Tyre', cx, cy, r, null, { stroke: [INK, 6] }),
    group(
      'Spokes',
      [0, 45, 90, 135].map((deg, i) => {
        const a = (deg * Math.PI) / 180;
        const dx = (r - 3) * Math.cos(a);
        const dy = (r - 3) * Math.sin(a);
        return line(
          `Spoke ${i + 1}`,
          [
            [cx - dx, cy - dy],
            [cx + dx, cy + dy],
          ],
          '#7d8794',
          2,
        );
      }),
    ),
    circle('Hub', cx, cy, 5, INK),
  ]);

// The football's patches: one in the middle, five round it (each pointing in), and the seams.
const BALL = { cx: 70, cy: 70 };
const MIDDLE = pentagon(BALL.cx, BALL.cy, 20, -90);
const OUTER = [0, 1, 2, 3, 4].map((k) => {
  const deg = -90 + 72 * k;
  const a = (deg * Math.PI) / 180;
  const c: [number, number] = [BALL.cx + 50 * Math.cos(a), BALL.cy + 50 * Math.sin(a)];
  return { c, points: pentagon(c[0], c[1], 15, deg + 180) };
});
const nearest = (points: [number, number][], to: [number, number]) =>
  points.reduce((best, p) =>
    Math.hypot(p[0] - to[0], p[1] - to[1]) < Math.hypot(best[0] - to[0], best[1] - to[1])
      ? p
      : best,
  );

// The snail's shell: a spiral of two turns.
const SPIRAL = Array.from({ length: 49 }, (_, i): [number, number] => {
  const t = i / 48;
  const a = t * 4 * Math.PI;
  const r = 4 + 36 * t;
  return [84 + r * Math.cos(a), 66 + r * Math.sin(a)];
});

export const MORE_CARTOONS: readonly LibraryItem[] = [
  {
    id: 'cartoon.rabbit',
    name: 'Rabbit',
    category: 'cartoons',
    keywords: ['animal', 'bunny', 'pet', 'hop', 'easter'],
    width: 160,
    height: 220,
    parts: [
      circle('Tail', 124, 176, 14, '#ffffff', { stroke: THIN }),
      ellipse('Body', 34, 110, 92, 96, '#e9e4ef', { stroke: OUTLINE }),
      ellipse('Tummy', 54, 130, 52, 64, '#ffffff'),
      ellipse('Left foot', 34, 192, 42, 22, '#e9e4ef', { stroke: THIN }),
      ellipse('Right foot', 84, 192, 42, 22, '#e9e4ef', { stroke: THIN }),
      group('Head', [
        group('Left ear', [
          ellipse('Ear', 44, 6, 26, 80, '#e9e4ef', { stroke: THIN }),
          ellipse('Inside', 51, 18, 12, 56, '#f6a8c0'),
        ]),
        group('Right ear', [
          ellipse('Ear', 90, 6, 26, 80, '#e9e4ef', { stroke: THIN }),
          ellipse('Inside', 97, 18, 12, 56, '#f6a8c0'),
        ]),
        circle('Face', 80, 82, 40, '#e9e4ef', { stroke: OUTLINE }),
        ...eyes(66, 94, 76),
        circle('Left cheek', 56, 92, 6, '#f6a8c0'),
        circle('Right cheek', 104, 92, 6, '#f6a8c0'),
        shape(
          'Nose',
          [
            [74, 88],
            [86, 88],
            [80, 95],
          ],
          '#e46a8a',
        ),
        rect('Teeth', 75, 100, 10, 8, '#ffffff', { stroke: THIN }),
        smile(80, 96, 9, 5),
      ]),
    ],
  },
  {
    id: 'cartoon.bear',
    name: 'Bear',
    category: 'cartoons',
    keywords: ['animal', 'teddy', 'forest', 'wild'],
    width: 180,
    height: 212,
    parts: [
      rect('Left arm', 18, 112, 26, 60, '#a86b3c', { radius: 13, stroke: THIN }),
      rect('Right arm', 136, 112, 26, 60, '#a86b3c', { radius: 13, stroke: THIN }),
      ellipse('Body', 36, 98, 108, 100, '#a86b3c', { stroke: OUTLINE }),
      ellipse('Tummy', 60, 120, 60, 62, '#e0b88a'),
      ellipse('Left foot', 38, 182, 44, 26, '#a86b3c', { stroke: THIN }),
      ellipse('Right foot', 98, 182, 44, 26, '#a86b3c', { stroke: THIN }),
      group('Head', [
        group('Left ear', [
          circle('Ear', 50, 30, 18, '#a86b3c', { stroke: THIN }),
          circle('Inside', 50, 30, 9, '#e0b88a'),
        ]),
        group('Right ear', [
          circle('Ear', 130, 30, 18, '#a86b3c', { stroke: THIN }),
          circle('Inside', 130, 30, 9, '#e0b88a'),
        ]),
        circle('Face', 90, 62, 48, '#a86b3c', { stroke: OUTLINE }),
        ellipse('Muzzle', 68, 66, 44, 32, '#e0b88a'),
        ...eyes(72, 108, 52),
        ellipse('Nose', 82, 68, 16, 11, INK),
        smile(90, 82, 9, 6),
      ]),
    ],
  },
  {
    id: 'cartoon.penguin',
    name: 'Penguin',
    category: 'cartoons',
    keywords: ['animal', 'bird', 'ice', 'cold', 'antarctica', 'winter'],
    width: 140,
    height: 196,
    parts: [
      shape(
        'Left flipper',
        [
          [28, 82],
          [6, 140],
          [34, 126],
        ],
        '#2b3a4a',
        { stroke: THIN },
      ),
      shape(
        'Right flipper',
        [
          [112, 82],
          [134, 140],
          [106, 126],
        ],
        '#2b3a4a',
        { stroke: THIN },
      ),
      ellipse('Left foot', 34, 176, 34, 16, ORANGE, { stroke: THIN }),
      ellipse('Right foot', 72, 176, 34, 16, ORANGE, { stroke: THIN }),
      ellipse('Body', 22, 18, 96, 166, '#2b3a4a', { stroke: OUTLINE }),
      ellipse('Belly', 38, 64, 64, 112, '#ffffff'),
      group('Head', [
        ellipse('Face', 38, 32, 64, 52, '#ffffff'),
        ...eyes(58, 82, 54),
        circle('Left cheek', 48, 68, 5, '#f6a8c0'),
        circle('Right cheek', 92, 68, 5, '#f6a8c0'),
        shape(
          'Beak',
          [
            [62, 64],
            [78, 64],
            [70, 76],
          ],
          ORANGE,
          { stroke: THIN },
        ),
      ]),
    ],
  },
  {
    id: 'cartoon.owl',
    name: 'Owl',
    category: 'cartoons',
    keywords: ['animal', 'bird', 'night', 'wise', 'forest'],
    width: 160,
    height: 200,
    parts: [
      ellipse('Body', 28, 86, 104, 100, '#8b5e3c', { stroke: OUTLINE }),
      ellipse('Belly', 48, 110, 64, 70, '#d9b38c'),
      ellipse('Left wing', 14, 104, 30, 66, '#6e4529', { stroke: THIN }),
      ellipse('Right wing', 116, 104, 30, 66, '#6e4529', { stroke: THIN }),
      rect('Branch', 6, 184, 148, 12, '#7a4f2b', { radius: 6, stroke: THIN }),
      ellipse('Left foot', 54, 178, 22, 14, ORANGE),
      ellipse('Right foot', 84, 178, 22, 14, ORANGE),
      group('Head', [
        shape(
          'Left ear',
          [
            [40, 44],
            [34, 6],
            [66, 24],
          ],
          '#8b5e3c',
          { stroke: THIN },
        ),
        shape(
          'Right ear',
          [
            [120, 44],
            [126, 6],
            [94, 24],
          ],
          '#8b5e3c',
          { stroke: THIN },
        ),
        circle('Face', 80, 62, 46, '#8b5e3c', { stroke: OUTLINE }),
        group('Left eye', [
          circle('White', 62, 60, 18, '#ffffff', { stroke: THIN }),
          circle('Pupil', 64, 62, 8, INK),
        ]),
        group('Right eye', [
          circle('White', 98, 60, 18, '#ffffff', { stroke: THIN }),
          circle('Pupil', 96, 62, 8, INK),
        ]),
        shape(
          'Beak',
          [
            [73, 78],
            [87, 78],
            [80, 92],
          ],
          ORANGE,
          { stroke: THIN },
        ),
      ]),
    ],
  },
  {
    id: 'cartoon.elephant',
    name: 'Elephant',
    category: 'cartoons',
    keywords: ['animal', 'zoo', 'africa', 'wild', 'trunk'],
    width: 230,
    height: 180,
    parts: [
      line(
        'Tail',
        [
          [198, 96],
          [216, 120],
        ],
        INK,
        3,
      ),
      rect('Front leg', 74, 124, 30, 52, '#9aa5b4', { radius: 8, stroke: THIN }),
      rect('Back leg', 158, 124, 30, 52, '#9aa5b4', { radius: 8, stroke: THIN }),
      ellipse('Body', 60, 54, 146, 98, '#9aa5b4', { stroke: OUTLINE }),
      group('Head', [
        ellipse('Ear', 72, 36, 60, 78, '#b7c0cc', { stroke: THIN }),
        shape(
          'Trunk',
          [
            [18, 92],
            [10, 124],
            [12, 148],
            [22, 164],
            [40, 166],
            [52, 154],
            [44, 146],
            [34, 150],
            [32, 136],
            [36, 118],
            [46, 104],
          ],
          '#9aa5b4',
          { stroke: THIN },
        ),
        circle('Face', 56, 74, 42, '#9aa5b4', { stroke: OUTLINE }),
        circle('Eye', 44, 66, 5, INK),
        circle('Cheek', 60, 88, 6, '#f6a8c0'),
      ]),
    ],
  },
  {
    id: 'cartoon.lion',
    name: 'Lion',
    category: 'cartoons',
    keywords: ['animal', 'zoo', 'africa', 'wild', 'cat'],
    width: 200,
    height: 190,
    parts: [
      line(
        'Tail',
        [
          [168, 120],
          [186, 96],
        ],
        '#e0a030',
        5,
      ),
      circle('Tail tuft', 186, 92, 8, '#c8742a'),
      rect('Front leg', 86, 144, 20, 42, '#f2b544', { radius: 6, stroke: THIN }),
      rect('Back leg', 150, 144, 20, 42, '#f2b544', { radius: 6, stroke: THIN }),
      ellipse('Body', 70, 92, 112, 70, '#f2b544', { stroke: OUTLINE }),
      group('Head', [
        star('Mane', 4, 10, 124, 124, '#c8742a', 14, 0.8, { stroke: THIN }),
        circle('Left ear', 40, 42, 10, '#f2b544', { stroke: THIN }),
        circle('Right ear', 92, 42, 10, '#f2b544', { stroke: THIN }),
        circle('Face', 66, 72, 40, '#f6c55a', { stroke: OUTLINE }),
        ellipse('Muzzle', 48, 78, 36, 24, '#fde3a7'),
        ...eyes(52, 80, 64),
        shape(
          'Nose',
          [
            [59, 80],
            [73, 80],
            [66, 88],
          ],
          '#7a3e1c',
        ),
        smile(66, 92, 8, 5),
      ]),
    ],
  },
  {
    id: 'cartoon.monkey',
    name: 'Monkey',
    category: 'cartoons',
    keywords: ['animal', 'zoo', 'jungle', 'wild', 'climb'],
    width: 180,
    height: 210,
    parts: [
      line(
        'Tail',
        [
          [120, 180],
          [150, 190],
          [170, 180],
          [176, 158],
          [170, 142],
          [160, 142],
        ],
        '#8b5a2b',
        6,
      ),
      rect('Left leg', 58, 176, 22, 30, '#8b5a2b', { radius: 8, stroke: THIN }),
      rect('Right leg', 100, 176, 22, 30, '#8b5a2b', { radius: 8, stroke: THIN }),
      rect('Left arm', 26, 112, 18, 66, '#8b5a2b', { radius: 9, stroke: THIN }),
      rect('Right arm', 136, 112, 18, 66, '#8b5a2b', { radius: 9, stroke: THIN }),
      ellipse('Body', 50, 106, 80, 86, '#8b5a2b', { stroke: OUTLINE }),
      ellipse('Belly', 68, 126, 44, 56, '#f0c995'),
      group('Head', [
        group('Left ear', [
          circle('Ear', 40, 62, 18, '#8b5a2b', { stroke: THIN }),
          circle('Inside', 40, 62, 9, '#f0c995'),
        ]),
        group('Right ear', [
          circle('Ear', 140, 62, 18, '#8b5a2b', { stroke: THIN }),
          circle('Inside', 140, 62, 9, '#f0c995'),
        ]),
        circle('Head', 90, 60, 46, '#8b5a2b', { stroke: OUTLINE }),
        group('Face', [
          circle('Left patch', 76, 54, 17, '#f0c995'),
          circle('Right patch', 104, 54, 17, '#f0c995'),
          ellipse('Muzzle', 60, 62, 60, 38, '#f0c995'),
        ]),
        ...eyes(78, 102, 54),
        circle('Left nostril', 86, 72, 2, INK),
        circle('Right nostril', 94, 72, 2, INK),
        smile(90, 80, 13, 8),
      ]),
    ],
  },
  {
    id: 'cartoon.turtle',
    name: 'Turtle',
    category: 'cartoons',
    keywords: ['animal', 'tortoise', 'slow', 'sea', 'reptile'],
    width: 220,
    height: 130,
    parts: [
      shape(
        'Tail',
        [
          [32, 88],
          [6, 98],
          [32, 102],
        ],
        '#6cbf5a',
        { stroke: THIN },
      ),
      ellipse('Back leg', 44, 88, 30, 38, '#6cbf5a', { stroke: THIN }),
      ellipse('Front leg', 138, 88, 30, 38, '#6cbf5a', { stroke: THIN }),
      group('Head', [
        circle('Face', 184, 72, 26, '#6cbf5a', { stroke: OUTLINE }),
        circle('Eye', 192, 66, 5, INK),
        smile(190, 80, 10, 6),
      ]),
      group('Shell', [
        shape('Dome', arc(100, 96, 80, 80, 180, 360, 24), '#3f8f4a', { stroke: OUTLINE }),
        polygon('Middle plate', 78, 34, 44, 40, 6, '#5aae5f', { stroke: THIN }),
        polygon('Left plate', 38, 58, 36, 30, 6, '#5aae5f', { stroke: THIN }),
        polygon('Right plate', 126, 58, 36, 30, 6, '#5aae5f', { stroke: THIN }),
        rect('Rim', 16, 90, 168, 14, '#2f6f39', { radius: 7, stroke: THIN }),
      ]),
    ],
  },
  {
    id: 'cartoon.dinosaur',
    name: 'Dinosaur',
    category: 'cartoons',
    keywords: ['animal', 'dino', 'reptile', 'prehistoric', 'fossil'],
    width: 240,
    height: 186,
    parts: [
      shape(
        'Tail',
        [
          [64, 108],
          [4, 150],
          [12, 158],
          [74, 142],
        ],
        '#5cb85c',
        { stroke: OUTLINE },
      ),
      group(
        'Spikes',
        [
          [72, 92],
          [100, 82],
          [132, 80],
          [162, 88],
        ].map(([x, y], i) =>
          shape(
            `Spike ${i + 1}`,
            [
              [x! - 10, y! + 6],
              [x!, y! - 14],
              [x! + 10, y! + 6],
            ],
            ORANGE,
            { stroke: THIN },
          ),
        ),
      ),
      group('Head', [
        shape(
          'Neck',
          [
            [160, 104],
            [184, 40],
            [208, 40],
            [194, 112],
          ],
          '#5cb85c',
          { stroke: OUTLINE },
        ),
        ellipse('Face', 174, 12, 62, 38, '#5cb85c', { stroke: OUTLINE }),
        circle('Eye', 210, 26, 5, INK),
        circle('Nostril', 228, 26, 2, INK),
        line('Mouth', arc(216, 36, 10, 5, 20, 160, 8), INK, 3),
      ]),
      rect('Back leg', 76, 132, 26, 50, '#4ca64c', { radius: 8, stroke: THIN }),
      rect('Front leg', 148, 132, 26, 50, '#4ca64c', { radius: 8, stroke: THIN }),
      ellipse('Body', 50, 82, 144, 80, '#5cb85c', { stroke: OUTLINE }),
      group('Spots', [
        circle('Spot 1', 92, 112, 9, '#8fd18f'),
        circle('Spot 2', 120, 130, 7, '#8fd18f'),
        circle('Spot 3', 148, 106, 8, '#8fd18f'),
      ]),
    ],
  },
  {
    id: 'cartoon.snail',
    name: 'Snail',
    category: 'cartoons',
    keywords: ['animal', 'garden', 'slow', 'shell', 'minibeast'],
    width: 200,
    height: 132,
    parts: [
      rect('Foot', 8, 100, 162, 28, '#b5d66e', { radius: 14, stroke: OUTLINE }),
      group('Head', [
        line(
          'Left feeler',
          [
            [156, 58],
            [146, 22],
          ],
          INK,
          3,
        ),
        line(
          'Right feeler',
          [
            [172, 58],
            [182, 22],
          ],
          INK,
          3,
        ),
        circle('Left eye', 146, 18, 6, INK),
        circle('Right eye', 182, 18, 6, INK),
        rect('Neck', 144, 50, 40, 78, '#b5d66e', { radius: 20, stroke: OUTLINE }),
        circle('Cheek', 174, 82, 5, '#f6a8c0'),
        smile(164, 80, 9, 6),
      ]),
      group('Shell', [
        circle('Shell', 84, 66, 50, '#e8873a', { stroke: OUTLINE }),
        line('Spiral', SPIRAL, '#a8521c', 4),
      ]),
    ],
  },
  {
    id: 'cartoon.bicycle',
    name: 'Bicycle',
    category: 'cartoons',
    keywords: ['vehicle', 'transport', 'bike', 'cycle', 'ride', 'road'],
    width: 240,
    height: 150,
    parts: [
      spokedWheel('Back wheel', 56, 102, 44),
      spokedWheel('Front wheel', 184, 102, 44),
      line(
        'Frame',
        [
          [184, 102],
          [166, 52],
          [96, 52],
          [56, 102],
          [110, 102],
          [166, 52],
        ],
        RED,
        6,
      ),
      line(
        'Seat post',
        [
          [91, 36],
          [110, 102],
        ],
        RED,
        6,
      ),
      rect('Seat', 74, 26, 36, 10, INK, { radius: 5 }),
      line(
        'Handlebar',
        [
          [166, 52],
          [160, 28],
          [182, 24],
        ],
        INK,
        5,
      ),
      group('Pedals', [
        circle('Chainring', 110, 102, 11, HUB, { stroke: THIN }),
        line(
          'Crank',
          [
            [98, 116],
            [122, 88],
          ],
          INK,
          4,
        ),
        rect('Front pedal', 114, 82, 16, 6, INK, { radius: 2 }),
        rect('Back pedal', 90, 116, 16, 6, INK, { radius: 2 }),
      ]),
    ],
  },
  {
    id: 'cartoon.plane',
    name: 'Aeroplane',
    category: 'cartoons',
    keywords: ['vehicle', 'transport', 'airplane', 'plane', 'fly', 'sky', 'travel'],
    width: 260,
    height: 140,
    parts: [
      shape(
        'Tail fin',
        [
          [22, 70],
          [8, 12],
          [38, 12],
          [72, 62],
        ],
        RED,
        { stroke: OUTLINE },
      ),
      rect('Body', 14, 52, 222, 46, '#eef1f5', { radius: 23, stroke: OUTLINE }),
      rect('Stripe', 24, 82, 200, 6, RED),
      shape(
        'Cockpit window',
        [
          [196, 62],
          [220, 62],
          [230, 74],
          [196, 74],
        ],
        '#6ec6ff',
        { stroke: THIN },
      ),
      group(
        'Windows',
        [70, 96, 122, 148, 174].map((x, i) =>
          circle(`Window ${i + 1}`, x, 70, 7, '#6ec6ff', { stroke: THIN }),
        ),
      ),
      ellipse('Tailplane', 12, 62, 52, 14, '#c53333', { stroke: THIN }),
      shape(
        'Wing',
        [
          [96, 80],
          [150, 80],
          [124, 132],
          [98, 132],
        ],
        '#c53333',
        { stroke: OUTLINE },
      ),
      group('Propeller', [
        ellipse('Blades', 236, 42, 10, 66, '#7d93ab', { stroke: THIN }),
        circle('Spinner', 241, 75, 8, INK),
      ]),
    ],
  },
  {
    id: 'cartoon.train',
    name: 'Train engine',
    category: 'cartoons',
    keywords: ['vehicle', 'transport', 'railway', 'steam', 'locomotive', 'travel'],
    width: 260,
    height: 170,
    parts: [
      group('Smoke', [
        circle('Puff 1', 224, 12, 10, '#dfe4ea', { stroke: THIN }),
        circle('Puff 2', 248, 7, 6, '#dfe4ea', { stroke: THIN }),
      ]),
      rect('Chimney', 186, 26, 24, 42, INK),
      rect('Chimney top', 180, 18, 36, 12, INK, { radius: 3 }),
      rect('Dome', 132, 50, 28, 22, YELLOW, { radius: 10, stroke: THIN }),
      rect('Boiler', 88, 64, 142, 66, '#3a8fd9', { radius: 10, stroke: OUTLINE }),
      rect('Band', 160, 64, 8, 66, YELLOW),
      circle('Lamp', 230, 82, 7, '#ffe066', { stroke: THIN }),
      rect('Cab', 14, 32, 82, 100, RED, { radius: 6, stroke: OUTLINE }),
      rect('Cab roof', 6, 22, 98, 14, INK, { radius: 4 }),
      rect('Cab window', 32, 48, 46, 34, GLASS, { stroke: THIN }),
      shape(
        'Cowcatcher',
        [
          [228, 112],
          [254, 144],
          [228, 144],
        ],
        YELLOW,
        { stroke: OUTLINE },
      ),
      rect('Base', 10, 126, 222, 12, INK, { radius: 4 }),
      group('Wheels', [
        group('Back wheel', [circle('Tyre', 54, 138, 28, INK), circle('Hub', 54, 138, 11, RED)]),
        group('Middle wheel', [circle('Tyre', 130, 146, 20, INK), circle('Hub', 130, 146, 8, RED)]),
        group('Front wheel', [circle('Tyre', 186, 146, 20, INK), circle('Hub', 186, 146, 8, RED)]),
      ]),
      line(
        'Rod',
        [
          [54, 138],
          [186, 146],
        ],
        HUB,
        4,
      ),
    ],
  },
  {
    id: 'cartoon.helicopter',
    name: 'Helicopter',
    category: 'cartoons',
    keywords: ['vehicle', 'transport', 'fly', 'sky', 'rotor', 'rescue'],
    width: 260,
    height: 150,
    parts: [
      shape(
        'Tail fin',
        [
          [14, 40],
          [34, 40],
          [44, 72],
          [24, 72],
        ],
        YELLOW,
        { stroke: THIN },
      ),
      rect('Tail boom', 24, 62, 100, 16, YELLOW, { radius: 8, stroke: THIN }),
      group('Tail rotor', [
        rect('Blade 1', 24, 38, 6, 38, INK, { radius: 3 }),
        rect('Blade 2', 8, 54, 38, 6, INK, { radius: 3 }),
        circle('Hub', 27, 57, 4, HUB),
      ]),
      group('Skids', [
        line(
          'Back strut',
          [
            [132, 118],
            [126, 138],
          ],
          INK,
          4,
        ),
        line(
          'Front strut',
          [
            [196, 118],
            [202, 138],
          ],
          INK,
          4,
        ),
        line(
          'Skid',
          [
            [102, 138],
            [226, 138],
            [238, 128],
          ],
          INK,
          5,
        ),
      ]),
      ellipse('Body', 96, 34, 132, 90, YELLOW, { stroke: OUTLINE }),
      shape('Window', [...arc(180, 78, 40, 36, 270, 360, 10), [180, 78]], GLASS, {
        stroke: THIN,
      }),
      rect('Mast', 156, 16, 8, 22, INK),
      group('Rotor', [
        rect('Blades', 30, 10, 220, 8, '#4a5568', { radius: 4 }),
        ellipse('Hub', 150, 6, 20, 16, INK),
      ]),
    ],
  },
  {
    id: 'cartoon.hot-air-balloon',
    name: 'Hot-air balloon',
    category: 'cartoons',
    keywords: ['vehicle', 'transport', 'fly', 'sky', 'float', 'travel'],
    width: 180,
    height: 250,
    parts: [
      group('Balloon', [
        shape('Envelope', [...arc(90, 86, 80, 80, 150, 390, 28), [112, 176], [68, 176]], RED, {
          stroke: OUTLINE,
        }),
        ellipse('Yellow stripe', 54, 7, 72, 166, YELLOW),
        ellipse('Red stripe', 76, 7, 28, 166, RED),
      ]),
      group('Basket', [
        line(
          'Left rope',
          [
            [70, 176],
            [66, 204],
          ],
          INK,
          2,
        ),
        line(
          'Right rope',
          [
            [110, 176],
            [114, 204],
          ],
          INK,
          2,
        ),
        rect('Basket', 60, 204, 60, 40, '#a0522d', { radius: 6, stroke: OUTLINE }),
        rect('Rim', 54, 198, 72, 10, '#7a4f2b', { radius: 4, stroke: THIN }),
      ]),
    ],
  },
  {
    id: 'cartoon.ice-cream',
    name: 'Ice cream',
    category: 'cartoons',
    keywords: ['food', 'dessert', 'summer', 'sweet', 'treat'],
    width: 130,
    height: 216,
    parts: [
      shape(
        'Cone',
        [
          [22, 100],
          [108, 100],
          [65, 214],
        ],
        '#e0a458',
        { stroke: OUTLINE },
      ),
      group(
        'Waffle',
        (
          [
            [40, 100, 85, 160],
            [70, 100, 96, 134],
            [90, 100, 45, 160],
            [60, 100, 35, 134],
            [50, 186, 76, 186],
          ] as const
        ).map(([x1, y1, x2, y2], i) =>
          line(
            `Line ${i + 1}`,
            [
              [x1, y1],
              [x2, y2],
            ],
            '#b97a45',
            2,
          ),
        ),
      ),
      group('Strawberry scoop', [
        ellipse('Scoop', 14, 64, 102, 50, '#f6a8c0', { stroke: OUTLINE }),
        ...eyes(50, 80, 88, 4),
        line('Mouth', arc(65, 96, 8, 5, 20, 160, 8), INK, 2),
      ]),
      ellipse('Chocolate scoop', 26, 24, 78, 52, '#8b5a2b', { stroke: OUTLINE }),
      group('Sprinkles', [
        rect('Sprinkle 1', 42, 40, 8, 3, YELLOW, { radius: 1 }),
        rect('Sprinkle 2', 60, 32, 8, 3, '#4aa3df', { radius: 1 }),
        rect('Sprinkle 3', 80, 42, 8, 3, '#ffffff', { radius: 1 }),
        rect('Sprinkle 4', 56, 54, 8, 3, '#4cbb5a', { radius: 1 }),
        rect('Sprinkle 5', 84, 58, 8, 3, '#f06ca0', { radius: 1 }),
      ]),
      group('Cherry', [
        line(
          'Stem',
          [
            [65, 16],
            [74, 2],
          ],
          '#3fa34d',
          3,
        ),
        circle('Cherry', 65, 22, 10, '#d92b2b', { stroke: THIN }),
      ]),
    ],
  },
  {
    id: 'cartoon.cake',
    name: 'Birthday cake',
    category: 'cartoons',
    keywords: ['food', 'party', 'birthday', 'celebrate', 'candles', 'sweet'],
    width: 200,
    height: 200,
    parts: [
      ellipse('Plate', 6, 174, 188, 22, '#dfe4ea', { stroke: THIN }),
      rect('Bottom layer', 20, 118, 160, 66, '#f6a8c0', { radius: 8, stroke: OUTLINE }),
      group('Bottom icing', [
        rect('Icing', 20, 118, 160, 16, '#ffffff', { radius: 8, stroke: THIN }),
        circle('Drip 1', 44, 134, 6, '#ffffff'),
        circle('Drip 2', 84, 136, 7, '#ffffff'),
        circle('Drip 3', 124, 134, 6, '#ffffff'),
        circle('Drip 4', 160, 136, 7, '#ffffff'),
      ]),
      group(
        'Decorations',
        [40, 70, 100, 130, 160].map((x, i) =>
          circle(`Dot ${i + 1}`, x, 160, 6, i % 2 ? '#4aa3df' : '#ffd84a'),
        ),
      ),
      rect('Top layer', 46, 72, 108, 50, '#8b5a2b', { radius: 8, stroke: OUTLINE }),
      rect('Top icing', 46, 72, 108, 14, '#ffffff', { radius: 7, stroke: THIN }),
      group(
        'Candles',
        [66, 100, 134].map((x, i) =>
          rect(`Candle ${i + 1}`, x - 5, 40, 10, 34, ['#4aa3df', '#4cbb5a', '#f5c518'][i]!, {
            stroke: THIN,
          }),
        ),
      ),
      group(
        'Flames',
        [66, 100, 134].map((x, i) =>
          ellipse(`Flame ${i + 1}`, x - 6, 18, 12, 20, { from: '#ffd23f', to: '#ff5a1f' }),
        ),
      ),
    ],
  },
  {
    id: 'cartoon.balloons',
    name: 'Balloons',
    category: 'cartoons',
    keywords: ['party', 'birthday', 'celebrate', 'float'],
    width: 180,
    height: 250,
    parts: [
      ...(
        [
          ['Blue balloon', 90, 46, '#4aa3df'],
          ['Red balloon', 44, 96, RED],
          ['Yellow balloon', 136, 96, YELLOW],
          ['Green balloon', 90, 138, '#4cbb5a'],
        ] as const
      ).map(([name, cx, cy, colour]) =>
        group(name, [
          line(
            'String',
            [
              [cx, cy + 50],
              [90, 238],
            ],
            INK,
            2,
          ),
          shape(
            'Knot',
            [
              [cx - 6, cy + 50],
              [cx, cy + 40],
              [cx + 6, cy + 50],
            ],
            colour,
            { stroke: THIN },
          ),
          ellipse('Balloon', cx - 34, cy - 42, 68, 84, colour, { stroke: OUTLINE }),
          ellipse('Shine', cx - 22, cy - 28, 12, 22, '#ffffff', { opacity: 60 }),
        ]),
      ),
      group('Ribbon', [
        shape(
          'Left loop',
          [
            [90, 238],
            [74, 230],
            [74, 246],
          ],
          RED,
          { stroke: THIN },
        ),
        shape(
          'Right loop',
          [
            [90, 238],
            [106, 230],
            [106, 246],
          ],
          RED,
          { stroke: THIN },
        ),
      ]),
    ],
  },
  {
    id: 'cartoon.snowman',
    name: 'Snowman',
    category: 'cartoons',
    keywords: ['winter', 'snow', 'cold', 'christmas', 'weather'],
    width: 160,
    height: 230,
    parts: [
      line(
        'Left arm',
        [
          [50, 104],
          [16, 80],
          [6, 84],
          [16, 80],
          [10, 64],
        ],
        '#7a4f2b',
        4,
      ),
      line(
        'Right arm',
        [
          [110, 104],
          [144, 80],
          [154, 84],
          [144, 80],
          [150, 64],
        ],
        '#7a4f2b',
        4,
      ),
      circle('Bottom', 80, 170, 56, '#ffffff', { stroke: OUTLINE }),
      circle('Middle', 80, 106, 40, '#ffffff', { stroke: OUTLINE }),
      group('Buttons', [
        circle('Button 1', 80, 98, 5, INK),
        circle('Button 2', 80, 116, 5, INK),
        circle('Button 3', 80, 134, 5, INK),
      ]),
      group('Head', [
        circle('Face', 80, 50, 30, '#ffffff', { stroke: OUTLINE }),
        ...eyes(70, 90, 44, 4),
        shape(
          'Nose',
          [
            [80, 50],
            [106, 56],
            [80, 58],
          ],
          '#ff7a1a',
        ),
        line('Mouth', arc(80, 60, 12, 7, 30, 150, 8), INK, 3),
        group('Hat', [
          rect('Top', 58, 2, 44, 26, INK, { radius: 3 }),
          rect('Band', 58, 18, 44, 6, RED),
          rect('Brim', 46, 24, 68, 8, INK, { radius: 3 }),
        ]),
      ]),
      group('Scarf', [
        rect('Wrap', 48, 74, 64, 12, RED, { radius: 6, stroke: THIN }),
        rect('End', 90, 80, 14, 32, RED, { radius: 4, stroke: THIN }),
      ]),
    ],
  },
  {
    id: 'cartoon.rainbow',
    name: 'Rainbow',
    category: 'cartoons',
    keywords: ['weather', 'sky', 'rain', 'colours', 'spectrum'],
    width: 240,
    height: 140,
    parts: [
      group(
        'Bands',
        (
          [
            ['Red', '#e84545'],
            ['Orange', '#ff9b3d'],
            ['Yellow', '#ffd84a'],
            ['Green', '#4cbb5a'],
            ['Blue', '#4aa3df'],
            ['Purple', '#8e5cc4'],
          ] as const
        ).map(([name, colour], i) =>
          line(name, arc(120, 128, 104 - 12 * i, 104 - 12 * i, 180, 360, 32), colour, 12),
        ),
      ),
      group('Left cloud', [
        rect('Base', 6, 116, 76, 20, '#e3ebf5', { radius: 10 }),
        circle('Left puff', 28, 116, 16, '#e3ebf5'),
        circle('Right puff', 54, 110, 22, '#e3ebf5'),
      ]),
      group('Right cloud', [
        rect('Base', 158, 116, 76, 20, '#e3ebf5', { radius: 10 }),
        circle('Left puff', 186, 110, 22, '#e3ebf5'),
        circle('Right puff', 212, 116, 16, '#e3ebf5'),
      ]),
    ],
  },
  {
    id: 'cartoon.football',
    name: 'Football',
    category: 'cartoons',
    keywords: ['ball', 'sport', 'soccer', 'game', 'kick', 'pe'],
    width: 140,
    height: 140,
    parts: [
      circle('Ball', BALL.cx, BALL.cy, 64, '#ffffff', { stroke: OUTLINE }),
      group('Seams', [
        ...MIDDLE.map((p, k) => line(`Seam ${k + 1}`, [p, nearest(OUTER[k]!.points, p)], INK, 2)),
        ...OUTER.map((o, k) => {
          const next = OUTER[(k + 1) % 5]!;
          return line(
            `Seam ${k + 6}`,
            [nearest(o.points, next.c), nearest(next.points, o.c)],
            INK,
            2,
          );
        }),
      ]),
      group('Patches', [
        shape('Middle patch', MIDDLE, INK),
        ...OUTER.map((o, k) => shape(`Patch ${k + 1}`, o.points, INK)),
      ]),
    ],
  },
];
