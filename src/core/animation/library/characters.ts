// AN19: people and characters (a teacher, students, a programmer, a scientist, jobs, fantasy
// characters), each a named group of parts (head, arms, legs…) so a student can animate them.
// Every person is drawn on the same body (the same head, shoulders, hips and limb lengths), so the
// set looks like one cast; an arm or a leg is one group (sleeve, arm, hand / trousers, shoe) that
// turns about its shoulder or hip.
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
  type LibraryItem,
  type Part,
} from './build.ts';

type Pt = readonly [number, number];

const INK = '#2d2a32';
const OUTLINE = [INK, 3] as const;
const THIN = [INK, 2] as const;
const MOUTH = '#8a2e2e';
const CHEEK = '#ff7a7a';
const WHITE = '#ffffff';

/** Every person's box, the middle of the body, the head's centre and radius. */
const W = 260;
const H = 400;
const CX = 130;
const CY = 100;
const R = 44;

// ---- limbs: a polyline drawn thick, as one closed outline ----

const rad = (deg: number) => (deg * Math.PI) / 180;
const step = ([x, y]: Pt, deg: number, len: number): Pt => [
  x + len * Math.cos(rad(deg)),
  y + len * Math.sin(rad(deg)),
];
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** The polyline `w` px wide, as one outline (mitred at its joints). */
function thick(pts: readonly Pt[], w: number): Pt[] {
  const h = w / 2;
  const normals = pts.slice(1).map((p, i): Pt => {
    const q = pts[i]!;
    const l = dist(q, p) || 1;
    return [-(p[1] - q[1]) / l, (p[0] - q[0]) / l];
  });
  const offsets = pts.map((_, i): Pt => {
    const a = normals[Math.max(0, i - 1)]!;
    const b = normals[Math.min(normals.length - 1, i)]!;
    const mx = a[0] + b[0];
    const my = a[1] + b[1];
    const ml = Math.hypot(mx, my) || 1;
    const k = h / Math.max(0.4, (mx * a[0] + my * a[1]) / ml);
    return [(mx / ml) * k, (my / ml) * k];
  });
  return [
    ...pts.map((p, i): Pt => [p[0] + offsets[i]![0], p[1] + offsets[i]![1]]),
    ...pts.map((p, i): Pt => [p[0] - offsets[i]![0], p[1] - offsets[i]![1]]).reverse(),
  ];
}

/** The point `d` px along the polyline. */
function at(pts: readonly Pt[], d: number): Pt {
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const s = dist(a, b);
    if (left <= s) return [a[0] + ((b[0] - a[0]) * left) / s, a[1] + ((b[1] - a[1]) * left) / s];
    left -= s;
  }
  return pts[pts.length - 1]!;
}

/** The polyline from `from` px along it to `to` px. */
function piece(pts: readonly Pt[], from: number, to: number): Pt[] {
  const out: Pt[] = [at(pts, from)];
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += dist(pts[i - 1]!, pts[i]!);
    if (acc > from + 1 && acc < to - 1) out.push(pts[i]!);
  }
  out.push(at(pts, to));
  return out;
}

const SHOULDER = { L: [CX - 24, 158], R: [CX + 24, 158] } as const;
const HIP = { L: [CX - 14, 244], R: [CX + 14, 244] } as const;
const UPPER = 52;
const LOWER = 50;
const ARM = UPPER + LOWER;
const THIGH = 56;
const SHIN = 56;

type Side = 'L' | 'R';
const sideName = (side: Side, what: string) => `${side === 'L' ? 'Left' : 'Right'} ${what}`;

/** Shoulder, elbow and hand of an arm whose upper arm points `upper`° (0° right, 90° down). */
function armAt(side: Side, upper: number, lower = upper): Pt[] {
  const elbow = step(SHOULDER[side], upper, UPPER);
  return [SHOULDER[side], elbow, step(elbow, lower, LOWER)];
}
const handOf = (pts: readonly Pt[]) => pts[pts.length - 1]!;

interface ArmLook {
  skin: string;
  sleeve: string;
  /** How far down the arm the sleeve reaches (px); a long sleeve by default. */
  sleeveLen?: number;
  /** A glove's colour (the skin's by default). */
  hand?: string;
  /** A cuff of another colour at the end of a long sleeve. */
  cuff?: string;
  width?: number;
}

function arm(side: Side, pts: readonly Pt[], look: ArmLook): Part {
  const w = look.width ?? 24;
  const sl = look.sleeveLen ?? ARM - 6;
  const parts: Part[] = [];
  if (sl < ARM - 8) parts.push(shape('Arm', thick(pts, 19), look.skin, { stroke: THIN }));
  if (sl > 0)
    parts.push(shape('Sleeve', thick(piece(pts, 0, sl), w), look.sleeve, { stroke: THIN }));
  if (look.cuff)
    parts.push(shape('Cuff', thick(piece(pts, sl - 10, sl), w + 2), look.cuff, { stroke: THIN }));
  const [hx, hy] = handOf(pts);
  parts.push(circle('Hand', hx, hy, 12, look.hand ?? look.skin, { stroke: THIN }));
  return group(sideName(side, 'arm'), parts);
}

/** Hip, knee and foot of a leg whose thigh points `upper`° (90° is straight down). */
function legAt(side: Side, upper = 90, lower = upper): Pt[] {
  const knee = step(HIP[side], upper, THIGH);
  return [HIP[side], knee, step(knee, lower, SHIN)];
}

interface LegLook {
  /** The leg's colour: the trousers', or the skin's under a skirt or shorts. */
  base: string;
  /** Shorts, socks, boots… drawn over the leg, from `from` px down it to `to` px. */
  over?: readonly { name: string; colour: string; from: number; to: number }[];
  shoe: string;
  width?: number;
}

function leg(side: Side, pts: readonly Pt[], look: LegLook): Part {
  const w = look.width ?? 26;
  const parts: Part[] = [shape('Leg', thick(pts, w), look.base, { stroke: THIN })];
  for (const o of look.over ?? [])
    parts.push(shape(o.name, thick(piece(pts, o.from, o.to), w + 3), o.colour, { stroke: THIN }));
  const [fx, fy] = handOf(pts);
  const out = side === 'L' ? -7 : 7;
  parts.push(ellipse('Shoe', fx - 22 + out, fy - 7, 44, 22, look.shoe, { stroke: THIN }));
  return group(sideName(side, 'leg'), parts);
}

/** Both legs, straight down, alike. */
const legs = (look: LegLook): Part[] => [leg('L', legAt('L'), look), leg('R', legAt('R'), look)];

// ---- body ----

const torso = (colour: string): Part =>
  rect('Torso', CX - 42, 134, 84, 126, colour, { radius: 24, stroke: OUTLINE });

/** The bottom of the torso in the trousers' colour (a shirt tucked in). */
const hips = (colour: string, top = 228): Part =>
  shape(
    'Trousers top',
    [
      [CX - 42, top],
      [CX + 42, top],
      ...arc(CX + 18, 236, 24, 24, 0, 90, 6),
      ...arc(CX - 18, 236, 24, 24, 90, 180, 6),
    ],
    colour,
    { stroke: OUTLINE },
  );

const belt = (colour: string, buckle = '#e2b33c', y = 226): Part[] => [
  rect('Belt', CX - 42, y, 84, 10, colour, { stroke: THIN }),
  rect('Buckle', CX - 8, y - 1, 16, 12, buckle, { radius: 2, stroke: THIN }),
];

/** A V of another colour at the neck (a shirt under a jumper, or skin). */
const vNeck = (colour: string, depth = 34, half = 16): Part =>
  shape(
    'Neckline',
    [
      [CX - half, 134],
      [CX + half, 134],
      [CX, 134 + depth],
    ],
    colour,
    { stroke: THIN },
  );

const buttons = (x: number, ys: readonly number[], colour = INK): Part[] =>
  ys.map((y, i) => circle(`Button ${i + 1}`, x, y, 3.5, colour));

/** A collar: two small triangles at the neck. */
const collar = (colour: string): Part[] => [
  shape(
    'Left collar',
    [
      [CX - 20, 132],
      [CX - 1, 140],
      [CX - 14, 154],
    ],
    colour,
    { stroke: THIN },
  ),
  shape(
    'Right collar',
    [
      [CX + 20, 132],
      [CX + 1, 140],
      [CX + 14, 154],
    ],
    colour,
    { stroke: THIN },
  ),
];

/** An open coat (lab coat, doctor's coat) over a shirt, down to `bottom`. */
const coat = (colour: string, shirt: string, bottom = 304): Part[] => [
  rect('Coat', CX - 46, 132, 92, bottom - 132, colour, { radius: 22, stroke: OUTLINE }),
  shape(
    'Shirt',
    [
      [CX - 18, 133],
      [CX + 18, 133],
      [CX + 4, 214],
      [CX - 4, 214],
    ],
    shirt,
    { stroke: THIN },
  ),
  line(
    'Left lapel',
    [
      [CX - 24, 134],
      [CX - 10, 176],
      [CX - 4, 214],
    ],
    INK,
    2,
  ),
  line(
    'Right lapel',
    [
      [CX + 24, 134],
      [CX + 10, 176],
      [CX + 4, 214],
    ],
    INK,
    2,
  ),
  line(
    'Coat opening',
    [
      [CX, 214],
      [CX, bottom - 1],
    ],
    INK,
    2,
  ),
  rect('Pocket', CX + 14, 250, 22, 20, colour, { radius: 3, stroke: THIN }),
];

// ---- head ----

const ears = (skin: string): Part[] => [
  circle('Left ear', CX - R + 1, CY + 6, 9, skin, { stroke: THIN }),
  circle('Right ear', CX + R - 1, CY + 6, 9, skin, { stroke: THIN }),
];
const faceDisc = (skin: string): Part => circle('Face', CX, CY, R, skin, { stroke: OUTLINE });
const cheeks = (opacity = 40): Part[] => [
  ellipse('Left cheek', CX - 35, CY + 14, 17, 10, CHEEK, { opacity }),
  ellipse('Right cheek', CX + 18, CY + 14, 17, 10, CHEEK, { opacity }),
];
const eyes = (dy = 4, gap = 16, r = 5.5, colour = INK): Part[] => [
  circle('Left eye', CX - gap, CY + dy, r, colour),
  circle('Right eye', CX + gap, CY + dy, r, colour),
  circle('Left eye shine', CX - gap + r * 0.35, CY + dy - r * 0.35, r * 0.38, WHITE),
  circle('Right eye shine', CX + gap + r * 0.35, CY + dy - r * 0.35, r * 0.38, WHITE),
];
const brows = (colour: string, dy = -9, w = 3): Part[] => [
  line(
    'Left eyebrow',
    [
      [CX - 23, CY + dy + 1],
      [CX - 10, CY + dy - 1],
    ],
    colour,
    w,
  ),
  line(
    'Right eyebrow',
    [
      [CX + 10, CY + dy - 1],
      [CX + 23, CY + dy + 1],
    ],
    colour,
    w,
  ),
];
const smile = (dy = 17, w = 11, colour = MOUTH): Part =>
  line('Mouth', arc(CX, CY + dy, w, 8, 15, 165, 10), colour, 3);
/** An open, laughing mouth. */
const grin = (dy = 18, w = 12, colour = MOUTH): Part =>
  shape('Mouth', arc(CX, CY + dy, w, w * 0.85, 0, 180, 12), colour, { stroke: [colour, 1] });
const glasses = (colour = INK): Part[] => [
  circle('Left lens', CX - 16, CY + 4, 11, null, { stroke: [colour, 2.5] }),
  circle('Right lens', CX + 16, CY + 4, 11, null, { stroke: [colour, 2.5] }),
  line(
    'Bridge',
    [
      [CX - 5, CY + 2],
      [CX + 5, CY + 2],
    ],
    colour,
    2.5,
  ),
];

/** The usual face: ears, face, rosy cheeks, eyes, eyebrows and a smile. */
const face = (skin: string, browColour: string, mouth: Part = smile()): Part[] => [
  ...ears(skin),
  faceDisc(skin),
  ...cheeks(),
  ...eyes(),
  ...brows(browColour),
  mouth,
];

/**
 * Hair over the top of the head, from ear to ear, leaving the forehead as an arch `brow` px
 * high (its left side `part` times as high: a side parting). `bump` px spikes or curls run
 * round its edge.
 */
function hairCap(
  colour: string,
  o: { bump?: number; teeth?: number; brow?: number; part?: number; low?: number } = {},
): Part {
  const bump = o.bump ?? 0;
  const steps = (o.teeth ?? 10) * 2;
  const brow = o.brow ?? 30;
  const low = o.low ?? 12;
  const from = 180 - (Math.asin(low / (R + 4)) * 180) / Math.PI;
  const outer = Array.from({ length: steps + 1 }, (_, i): Pt => {
    const a = from + ((360 + 2 * (180 - from) - 180) * i) / steps;
    return step([CX, CY], a, R + 4 + (i % 2 ? bump : 0));
  });
  const inner = [
    ...arc(CX, CY - 2, R - 1, brow, 360, 270, 8),
    ...arc(CX, CY - 2, R - 1, brow * (o.part ?? 1), 270, 180, 8),
  ];
  return shape('Hair', [...outer, ...inner], colour, { stroke: THIN });
}

/** Long hair behind the head, down to `bottom`. */
const hairBack = (colour: string, bottom = 170, spread = 10): Part =>
  rect('Back hair', CX - R - spread, CY - R - 6, 2 * (R + spread), bottom - (CY - R - 6), colour, {
    radius: 44,
    stroke: THIN,
  });

// ---- an item ----

const person = (
  id: string,
  name: string,
  keywords: readonly string[],
  parts: readonly Part[],
): LibraryItem => ({
  id: `character.${id}`,
  name,
  category: 'characters',
  keywords: ['person', 'people', 'character', ...keywords],
  width: W,
  height: H,
  parts,
});

/** The parts in drawing order: things behind, props, legs, arms behind, body, head, things in front. */
function figure(f: {
  behind?: readonly Part[];
  props?: readonly Part[];
  legs: readonly Part[];
  arms?: readonly Part[];
  body: readonly Part[];
  head: readonly Part[];
  front?: readonly Part[];
}): Part[] {
  const body = f.body.length === 1 ? { ...f.body[0]!, name: 'Body' } : group('Body', f.body);
  return [
    ...(f.behind ?? []),
    ...(f.props ?? []),
    ...f.legs,
    ...(f.arms ?? []),
    body,
    group('Head', f.head),
    ...(f.front ?? []),
  ];
}

// ---- the cast ----

const teacher = (() => {
  const skin = '#c68a5a';
  const hair = '#2b1d14';
  const top = '#2f8f7f';
  const right = armAt('R', -50, -62);
  const left = armAt('L', 112, 100);
  const [hx, hy] = handOf(right);
  const [bx, by] = handOf(left);
  return person(
    'teacher',
    'Teacher',
    ['teacher', 'school', 'job', 'woman', 'lesson', 'class'],
    [
      ...figure({
        props: [
          group('Pointer', [
            line('Stick', [step([hx, hy], 118, 14), step([hx, hy], -62, 76)], '#8b5a2b', 5),
            line('Tip', [step([hx, hy], -62, 66), step([hx, hy], -62, 78)], '#d33c3c', 6),
          ]),
          group('Book', [
            rect('Cover', bx - 30, by - 30, 40, 52, '#c0392b', { radius: 3, stroke: THIN }),
            rect('Pages', bx + 6, by - 27, 5, 46, '#fdf6e3', { stroke: [INK, 1] }),
            rect('Label', bx - 22, by - 16, 22, 8, '#f6d365'),
          ]),
        ],
        legs: legs({ base: '#3d3d6b', shoe: '#7a2e3a' }),
        arms: [arm('R', right, { skin, sleeve: top }), arm('L', left, { skin, sleeve: top })],
        body: [
          torso(top),
          vNeck('#f4f0e6'),
          ...buttons(CX, [184, 204, 224]),
          rect('Name badge', CX + 14, 178, 18, 10, WHITE, { radius: 2, stroke: [INK, 1] }),
        ],
        head: [
          circle('Bun', CX, CY - R - 4, 17, hair, { stroke: THIN }),
          ...face(skin, hair),
          hairCap(hair, { brow: 28, part: 0.55 }),
          ...glasses(),
        ],
      }),
    ],
  );
})();

const schoolboy = (() => {
  const skin = '#8d5524';
  const hair = '#1b1b1b';
  const shirt = WHITE;
  const right = armAt('R', -28, -82);
  return person(
    'schoolboy',
    'Schoolboy',
    ['student', 'pupil', 'boy', 'school', 'child', 'kid'],
    [
      ...figure({
        behind: [
          group('Backpack', [
            rect('Bag', CX - 56, 146, 112, 104, '#f39c12', { radius: 18, stroke: OUTLINE }),
            rect('Side pocket', CX - 60, 196, 18, 40, '#e67e22', { radius: 6, stroke: THIN }),
          ]),
        ],
        legs: legs({
          base: skin,
          over: [
            { name: 'Shorts', colour: '#2c3e70', from: 0, to: 40 },
            { name: 'Sock', colour: '#d9d9d9', from: 82, to: 108 },
          ],
          shoe: '#1f1f1f',
        }),
        arms: [
          arm('R', right, { skin, sleeve: shirt, sleeveLen: 34 }),
          arm('L', armAt('L', 100, 94), { skin, sleeve: shirt, sleeveLen: 34 }),
        ],
        body: [
          torso(shirt),
          hips('#2c3e70'),
          ...collar(shirt),
          shape(
            'Tie',
            [
              [CX - 6, 140],
              [CX + 6, 140],
              [CX + 9, 200],
              [CX, 210],
              [CX - 9, 200],
            ],
            '#c0392b',
            { stroke: THIN },
          ),
          line(
            'Left strap',
            [
              [CX - 30, 136],
              [CX - 32, 222],
            ],
            '#d35400',
            7,
          ),
          line(
            'Right strap',
            [
              [CX + 30, 136],
              [CX + 32, 222],
            ],
            '#d35400',
            7,
          ),
        ],
        head: [
          ...face(skin, hair, grin(17, 12, '#5e1717')),
          hairCap(hair, { bump: 4, teeth: 16, brow: 26 }),
        ],
      }),
    ],
  );
})();

const schoolgirl = (() => {
  const skin = '#f9d5b5';
  const hair = '#b5562b';
  const shirt = WHITE;
  const dress = '#2e6fd8';
  const left = armAt('L', 208, 262);
  return person(
    'schoolgirl',
    'Schoolgirl',
    ['student', 'pupil', 'girl', 'school', 'child', 'kid', 'bag'],
    [
      ...figure({
        legs: legs({
          base: skin,
          over: [{ name: 'Sock', colour: WHITE, from: 60, to: 108 }],
          shoe: '#1f1f1f',
          width: 22,
        }),
        arms: [
          arm('L', left, { skin, sleeve: shirt, sleeveLen: 32 }),
          arm('R', armAt('R', 80, 92), { skin, sleeve: shirt, sleeveLen: 32 }),
        ],
        body: [
          torso(shirt),
          ...collar(shirt),
          rect('Pinafore', CX - 28, 170, 56, 70, dress, { radius: 6, stroke: THIN }),
          shape(
            'Skirt',
            [
              [CX - 42, 226],
              [CX + 42, 226],
              [CX + 60, 298],
              [CX - 60, 298],
            ],
            dress,
            { stroke: OUTLINE },
          ),
          line(
            'Left pinafore strap',
            [
              [CX - 22, 172],
              [CX - 28, 136],
            ],
            dress,
            6,
          ),
          line(
            'Right pinafore strap',
            [
              [CX + 22, 172],
              [CX + 28, 136],
            ],
            dress,
            6,
          ),
        ],
        head: [
          ellipse('Left pigtail', CX - R - 30, CY - 4, 34, 54, hair, { stroke: THIN }),
          ellipse('Right pigtail', CX + R - 4, CY - 4, 34, 54, hair, { stroke: THIN }),
          circle('Left hair tie', CX - R + 2, CY - 2, 6, '#e84393', { stroke: THIN }),
          circle('Right hair tie', CX + R - 2, CY - 2, 6, '#e84393', { stroke: THIN }),
          ...face(skin, hair),
          hairCap(hair, { brow: 24, part: 0.7 }),
        ],
        front: [
          group('School bag', [
            line(
              'Strap',
              [
                [CX - 34, 140],
                [CX + 38, 246],
              ],
              '#6d3b1f',
              6,
            ),
            rect('Bag', CX + 26, 236, 56, 46, '#8e4b26', { radius: 6, stroke: THIN }),
            rect('Flap', CX + 26, 236, 56, 22, '#a55a2e', { radius: 6, stroke: THIN }),
            rect('Clasp', CX + 49, 252, 10, 10, '#e2b33c', { radius: 2, stroke: [INK, 1] }),
          ]),
        ],
      }),
    ],
  );
})();

const programmer = (() => {
  const skin = '#e8b48a';
  const hair = '#3b2a20';
  const hoodie = '#5b4bd1';
  const left = armAt('L', 122, 66);
  const right = armAt('R', 58, 114);
  const code = '#7fd1ff';
  return person(
    'programmer',
    'Programmer',
    ['programmer', 'coder', 'developer', 'computer', 'laptop', 'it', 'job', 'student'],
    figure({
      legs: legs({ base: '#33415c', shoe: '#e74c3c' }),
      body: [
        torso(hoodie),
        shape('Hood', arc(CX, 134, 30, 14, 0, 180, 10), '#4a3cb8', { stroke: THIN }),
        line(
          'Left string',
          [
            [CX - 8, 142],
            [CX - 9, 176],
          ],
          WHITE,
          3,
        ),
        line(
          'Right string',
          [
            [CX + 8, 142],
            [CX + 9, 176],
          ],
          WHITE,
          3,
        ),
      ],
      head: [
        ...face(skin, hair),
        hairCap(hair, { brow: 26, part: 0.5, bump: 2, teeth: 12 }),
        line('Headband', arc(CX, CY, R + 7, R + 9, 180, 360, 16), '#333740', 7),
        rect('Left earphone', CX - R - 12, CY - 12, 18, 30, '#333740', { radius: 7, stroke: THIN }),
        rect('Right earphone', CX + R - 6, CY - 12, 18, 30, '#333740', { radius: 7, stroke: THIN }),
      ],
      front: [
        group('Desk', [
          rect('Desk top', 6, 262, 248, 16, '#c8935a', { radius: 3, stroke: OUTLINE }),
          rect('Left desk leg', 18, 278, 12, 112, '#a87442', { stroke: THIN }),
          rect('Right desk leg', 230, 278, 12, 112, '#a87442', { stroke: THIN }),
        ]),
        group('Laptop', [
          rect('Lid', CX - 52, 192, 104, 70, '#c9ced6', { radius: 6, stroke: OUTLINE }),
          rect('Base', CX - 62, 257, 124, 7, '#aab1bb', { radius: 3, stroke: THIN }),
          line(
            'Less than',
            [
              [CX - 16, 218],
              [CX - 26, 227],
              [CX - 16, 236],
            ],
            code,
            4,
          ),
          line(
            'Slash',
            [
              [CX - 5, 239],
              [CX + 5, 215],
            ],
            code,
            4,
          ),
          line(
            'Greater than',
            [
              [CX + 16, 218],
              [CX + 26, 227],
              [CX + 16, 236],
            ],
            code,
            4,
          ),
        ]),
        group('Mug', [
          rect('Cup', 204, 230, 26, 32, '#e74c3c', { radius: 4, stroke: THIN }),
          shape('Handle', arc(230, 246, 9, 9, -80, 80, 8), null, { stroke: [INK, 3] }),
          line(
            'Steam',
            Array.from({ length: 9 }, (_, i): Pt => [217 + 4 * Math.sin(i * 0.9), 224 - 3 * i]),
            '#9aa5b1',
            2,
          ),
        ]),
        arm('L', left, { skin, sleeve: hoodie }),
        arm('R', right, { skin, sleeve: hoodie }),
      ],
    }),
  );
})();

const scientist = (() => {
  const skin = '#f5cfa8';
  const hair = '#d6d6d6';
  const right = armAt('R', -18, -84);
  const [hx, hy] = handOf(right);
  return person(
    'scientist',
    'Scientist',
    ['scientist', 'science', 'chemistry', 'lab', 'experiment', 'job', 'goggles'],
    figure({
      props: [
        group('Flask', [
          shape(
            'Glass',
            [
              [hx - 6, hy - 62],
              [hx + 6, hy - 62],
              [hx + 6, hy - 40],
              [hx + 26, hy - 2],
              [hx - 26, hy - 2],
              [hx - 6, hy - 40],
            ],
            '#e8f6ff',
            { stroke: THIN },
          ),
          shape(
            'Liquid',
            [
              [hx - 15, hy - 22],
              [hx + 15, hy - 22],
              [hx + 24, hy - 4],
              [hx - 24, hy - 4],
            ],
            '#4cd964',
          ),
          circle('Bubble 1', hx - 4, hy - 32, 4, '#4cd964', { opacity: 70 }),
          circle('Bubble 2', hx + 4, hy - 50, 3, '#4cd964', { opacity: 60 }),
          circle('Bubble 3', hx - 2, hy - 70, 5, '#4cd964', { opacity: 50 }),
        ]),
      ],
      legs: legs({ base: '#4a4a55', shoe: '#2b2b2b' }),
      arms: [
        arm('R', right, { skin, sleeve: WHITE }),
        arm('L', armAt('L', 112, 102), { skin, sleeve: WHITE }),
      ],
      body: [
        ...coat(WHITE, '#7d5fd3'),
        line(
          'Pen',
          [
            [CX + 20, 244],
            [CX + 20, 256],
          ],
          '#2e6fd8',
          3,
        ),
      ],
      head: [
        ...face(skin, '#9a9a9a', grin(19, 11)),
        hairCap(hair, { bump: 10, teeth: 9, brow: 34 }),
        rect('Goggle strap', CX - R + 1, CY - 2, 2 * R - 2, 10, '#1f6f8b'),
        rect('Left goggle', CX - 31, CY - 9, 28, 24, '#bfe9ff', {
          radius: 10,
          opacity: 85,
          stroke: ['#1f6f8b', 4],
        }),
        rect('Right goggle', CX + 3, CY - 9, 28, 24, '#bfe9ff', {
          radius: 10,
          opacity: 85,
          stroke: ['#1f6f8b', 4],
        }),
        ...eyes(),
      ],
    }),
  );
})();

const doctor = (() => {
  const skin = '#6b4226';
  const hair = '#151515';
  const left = armAt('L', 112, 100);
  const [hx, hy] = handOf(left);
  /** The clipboard's top-left corner, held at its right edge. */
  const x = hx - 50;
  const y = hy - 30;
  const rule = (n: number, w: number): Part =>
    line(
      `Line ${n}`,
      [
        [x + 10, y + 14 + 10 * n],
        [x + 10 + w, y + 14 + 10 * n],
      ],
      '#9aa5b1',
      2,
    );
  return person(
    'doctor',
    'Doctor',
    ['doctor', 'health', 'hospital', 'medical', 'job', 'stethoscope'],
    figure({
      props: [
        group('Clipboard', [
          rect('Board', x, y, 54, 70, '#a0703c', { radius: 4, stroke: THIN }),
          rect('Paper', x + 5, y + 8, 44, 58, WHITE),
          rect('Clip', x + 17, y - 4, 20, 10, '#9aa5b1', { radius: 2, stroke: THIN }),
          rule(1, 34),
          rule(2, 34),
          rule(3, 26),
          rule(4, 30),
        ]),
      ],
      legs: legs({ base: '#2f3640', shoe: '#1b1b1b' }),
      arms: [
        arm('L', left, { skin, sleeve: WHITE }),
        arm('R', armAt('R', -30, -84), { skin, sleeve: WHITE }),
      ],
      body: coat(WHITE, '#9fd3f5'),
      head: [
        ...face(skin, hair, grin(18, 11, '#3d1010')),
        hairCap(hair, { bump: 3, teeth: 18, brow: 30 }),
      ],
      front: [
        group('Stethoscope', [
          line('Tube', arc(CX, 138, 22, 44, 180, 0, 14), '#4a4f5a', 4),
          line(
            'Hose',
            [
              [CX, 182],
              [CX + 6, 204],
              [CX + 18, 214],
            ],
            '#4a4f5a',
            4,
          ),
          circle('Chest piece', CX + 22, 218, 7, '#c0c7d0', { stroke: THIN }),
        ]),
      ],
    }),
  );
})();

const nurse = (() => {
  const skin = '#d9a066';
  const hair = '#1d1a1a';
  const scrubs = '#3bb3a6';
  const right = armAt('R', 72, 88);
  const [hx, hy] = handOf(right);
  return person(
    'nurse',
    'Nurse',
    ['nurse', 'health', 'hospital', 'medical', 'job', 'first aid'],
    figure({
      props: [
        group('First aid kit', [
          shape('Handle', arc(hx, hy + 8, 12, 12, 180, 360, 10), null, { stroke: [INK, 4] }),
          rect('Box', hx - 30, hy + 6, 60, 44, WHITE, { radius: 6, stroke: THIN }),
          rect('Cross upright', hx - 5, hy + 14, 10, 28, '#e53935'),
          rect('Cross bar', hx - 14, hy + 23, 28, 10, '#e53935'),
        ]),
      ],
      legs: legs({ base: scrubs, shoe: '#f2f2f2' }),
      arms: [
        arm('R', right, { skin, sleeve: scrubs, sleeveLen: 34 }),
        arm('L', armAt('L', 100, 92), { skin, sleeve: scrubs, sleeveLen: 34 }),
      ],
      body: [
        torso(scrubs),
        vNeck(skin, 26, 14),
        rect('Pocket', CX + 10, 176, 22, 20, '#34a094', { radius: 3, stroke: THIN }),
        line(
          'Pen',
          [
            [CX + 15, 170],
            [CX + 15, 182],
          ],
          '#2e6fd8',
          3,
        ),
        rect('Name badge', CX - 32, 180, 22, 12, WHITE, { radius: 2, stroke: [INK, 1] }),
      ],
      head: [
        hairBack(hair, CY + 30, 8),
        ...face(skin, hair),
        hairCap(hair, { brow: 26, part: 0.6 }),
        shape(
          'Cap',
          [
            [CX - 30, CY - R + 8],
            [CX + 30, CY - R + 8],
            [CX + 22, CY - R - 20],
            [CX - 22, CY - R - 20],
          ],
          WHITE,
          { stroke: THIN },
        ),
        rect('Cap cross upright', CX - 4, CY - R - 14, 8, 20, '#e53935'),
        rect('Cap cross bar', CX - 10, CY - R - 8, 20, 8, '#e53935'),
      ],
    }),
  );
})();

const police = (() => {
  const skin = '#b07850';
  const hair = '#1b1b1b';
  const uniform = '#1f3a68';
  const navy = '#172b4d';
  return person(
    'police',
    'Police officer',
    ['police', 'officer', 'job', 'law', 'safety', 'policeman', 'policewoman'],
    figure({
      legs: legs({ base: navy, shoe: '#111111' }),
      arms: [
        arm('R', armAt('R', -38, -90), { skin, sleeve: uniform }),
        arm('L', armAt('L', 100, 92), { skin, sleeve: uniform }),
      ],
      body: [
        torso(uniform),
        hips(navy),
        ...collar('#2c4f8a'),
        shape(
          'Tie',
          [
            [CX - 5, 142],
            [CX + 5, 142],
            [CX + 7, 194],
            [CX, 202],
            [CX - 7, 194],
          ],
          '#0e1a30',
        ),
        star('Badge', CX - 34, 166, 22, 22, '#f1c40f', 6, 0.55, { stroke: [INK, 1] }),
        rect('Pocket', CX + 12, 168, 22, 18, '#2c4f8a', { radius: 3, stroke: THIN }),
        rect('Radio', CX + 26, 140, 12, 20, '#111111', { radius: 3 }),
        ...belt('#111111', '#c0c7d0'),
      ],
      head: [
        ...face(skin, hair),
        hairCap(hair, { brow: 34 }),
        shape(
          'Cap top',
          [
            [CX - 40, CY - 30],
            [CX + 40, CY - 30],
            [CX + 54, CY - 58],
            [CX - 54, CY - 58],
          ],
          uniform,
          { stroke: OUTLINE },
        ),
        rect('Cap band', CX - 40, CY - 34, 80, 12, '#0e1a30', { stroke: THIN }),
        shape('Peak', arc(CX, CY - 22, 40, 10, 0, 180, 12), '#0e1a30', { stroke: THIN }),
        star('Cap badge', CX - 9, CY - 54, 18, 18, '#f1c40f', 5, 0.5, { stroke: [INK, 1] }),
      ],
    }),
  );
})();

const firefighter = (() => {
  const skin = '#f2c29b';
  const gear = '#c8a24a';
  const stripe = '#f4e04d';
  const left = armAt('L', 104, 96);
  const [hx, hy] = handOf(left);
  const stripes = (y: number, name: string): Part[] => [
    rect(name, CX - 42, y, 84, 10, stripe),
    rect(`${name} shine`, CX - 42, y + 3, 84, 4, '#d9d9d9'),
  ];
  return person(
    'firefighter',
    'Firefighter',
    ['firefighter', 'fireman', 'fire', 'job', 'safety', 'extinguisher', 'emergency'],
    figure({
      props: [
        group('Fire extinguisher', [
          rect('Cylinder', hx - 15, hy + 8, 30, 72, '#e53935', { radius: 10, stroke: THIN }),
          rect('Valve', hx - 6, hy - 2, 12, 12, '#333333'),
          line(
            'Hose',
            [
              [hx + 5, hy + 2],
              [hx + 22, hy + 6],
              [hx + 22, hy + 52],
            ],
            '#222222',
            4,
          ),
          rect('Label', hx - 10, hy + 30, 20, 20, WHITE, { radius: 2 }),
        ]),
      ],
      legs: legs({
        base: gear,
        over: [{ name: 'Stripe', colour: stripe, from: 80, to: 88 }],
        shoe: '#1b1b1b',
      }),
      arms: [
        arm('L', left, { skin, sleeve: gear, cuff: stripe, hand: '#3b3b3b' }),
        arm('R', armAt('R', -30, -82), { skin, sleeve: gear, cuff: stripe, hand: '#3b3b3b' }),
      ],
      body: [
        torso(gear),
        ...stripes(196, 'Chest stripe'),
        ...stripes(232, 'Waist stripe'),
        line(
          'Zip',
          [
            [CX, 136],
            [CX, 258],
          ],
          '#7a6020',
          3,
        ),
      ],
      head: [
        ...face(skin, '#6b3e1f', grin(19, 11)),
        shape('Helmet', arc(CX, CY - 12, R + 4, R + 2, 180, 360, 18), '#d32f2f', {
          stroke: OUTLINE,
        }),
        ellipse('Brim', CX - R - 18, CY - 20, 2 * R + 36, 16, '#b71c1c', { stroke: THIN }),
        line(
          'Ridge',
          [
            [CX, CY - 56],
            [CX, CY - 18],
          ],
          '#b71c1c',
          5,
        ),
        shape(
          'Shield',
          [
            [CX - 13, CY - 46],
            [CX + 13, CY - 46],
            [CX + 13, CY - 30],
            [CX, CY - 22],
            [CX - 13, CY - 30],
          ],
          '#f1c40f',
          { stroke: THIN },
        ),
      ],
    }),
  );
})();

const chef = (() => {
  const skin = '#d4a373';
  const left = armAt('L', 122, 104);
  const right = armAt('R', -12, -82);
  const [sx, sy] = handOf(left);
  const [px, py] = handOf(right);
  return person(
    'chef',
    'Chef',
    ['chef', 'cook', 'kitchen', 'food', 'restaurant', 'job'],
    figure({
      props: [
        group('Spoon', [
          line(
            'Spoon handle',
            [
              [sx + 1, sy + 18],
              [sx - 1, sy - 50],
            ],
            '#a0703c',
            6,
          ),
          ellipse('Spoon bowl', sx - 11, sy - 82, 20, 30, '#a0703c', { stroke: THIN }),
        ]),
        group('Dish', [
          shape('Cover', arc(px, py - 14, 32, 30, 180, 360, 16), '#d9dee4', { stroke: THIN }),
          circle('Knob', px, py - 46, 5, '#aab1bb', { stroke: THIN }),
          ellipse('Plate', px - 38, py - 18, 76, 12, WHITE, { stroke: THIN }),
          line('Shine', arc(px, py - 14, 22, 20, 210, 250, 6), WHITE, 4),
        ]),
      ],
      legs: legs({ base: '#4d4d4d', shoe: '#1b1b1b' }),
      arms: [arm('L', left, { skin, sleeve: WHITE }), arm('R', right, { skin, sleeve: WHITE })],
      body: [
        torso(WHITE),
        rect('Apron', CX - 38, 226, 76, 84, WHITE, { radius: 6, stroke: THIN }),
        shape(
          'Neckerchief',
          [
            [CX - 22, 134],
            [CX + 22, 134],
            [CX, 160],
          ],
          '#e53935',
          { stroke: THIN },
        ),
        ...buttons(CX - 14, [178, 198], '#9aa5b1'),
        ...buttons(CX + 14, [178, 198], '#9aa5b1').map((b, i) => ({
          ...b,
          name: `Button ${i + 3}`,
        })),
      ],
      head: [
        circle('Left puff', CX - 22, 36, 20, WHITE, { stroke: OUTLINE }),
        circle('Right puff', CX + 22, 36, 20, WHITE, { stroke: OUTLINE }),
        circle('Top puff', CX, 26, 24, WHITE, { stroke: OUTLINE }),
        ...ears(skin),
        faceDisc(skin),
        ...cheeks(),
        ...eyes(),
        ...brows('#2b1d14'),
        grin(26, 9),
        shape(
          'Moustache',
          [
            ...arc(CX - 12, CY + 16, 13, 8, 180, 360, 8),
            ...arc(CX + 12, CY + 16, 13, 8, 180, 360, 8),
            ...arc(CX, CY + 16, 25, 7, 0, 180, 10),
          ],
          '#2b1d14',
        ),
        rect('Hat band', CX - 34, 42, 68, 22, WHITE, { radius: 4, stroke: OUTLINE }),
      ],
    }),
  );
})();

const astronaut = (() => {
  const skin = '#e0ac69';
  const suit = '#f4f6f8';
  const grey = '#9aa5b1';
  return person(
    'astronaut',
    'Astronaut',
    ['astronaut', 'space', 'spaceman', 'rocket', 'moon', 'science', 'job'],
    figure({
      behind: [
        group('Backpack', [
          rect('Pack', CX - 58, 140, 116, 124, '#cfd6dd', { radius: 14, stroke: OUTLINE }),
          rect('Tank', CX - 64, 160, 14, 80, '#aab1bb', { radius: 6, stroke: THIN }),
        ]),
      ],
      legs: legs({
        base: suit,
        over: [{ name: 'Knee pad', colour: grey, from: 50, to: 62 }],
        shoe: '#7f8c99',
        width: 30,
      }),
      arms: [
        arm('L', armAt('L', 206, 258), { skin, sleeve: suit, cuff: grey, hand: grey, width: 28 }),
        arm('R', armAt('R', 78, 92), { skin, sleeve: suit, cuff: grey, hand: grey, width: 28 }),
      ],
      body: [
        torso(suit),
        rect('Control panel', CX - 24, 172, 48, 30, '#5d6d7e', { radius: 4, stroke: THIN }),
        circle('Red button', CX - 12, 187, 5, '#e74c3c'),
        circle('Green button', CX + 2, 187, 5, '#2ecc71'),
        circle('Yellow button', CX + 15, 187, 4, '#f1c40f'),
        rect('Belt', CX - 42, 226, 84, 12, grey, { stroke: THIN }),
        rect('Patch', CX + 18, 146, 16, 12, '#2e6fd8', { radius: 2, stroke: [INK, 1] }),
      ],
      head: [
        circle('Helmet', CX, CY, 58, suit, { stroke: OUTLINE }),
        circle('Glass', CX, CY, 49, '#dff1ff', { stroke: THIN }),
        faceDisc(skin),
        hairCap('#5a3a22', { brow: 26, part: 0.6 }),
        ...cheeks(),
        ...eyes(),
        ...brows('#5a3a22'),
        grin(),
        circle('Visor', CX, CY, 49, '#8fd0ff', { opacity: 25 }),
        line('Shine', arc(CX, CY, 40, 40, 200, 250, 8), WHITE, 6),
        rect('Neck ring', CX - 34, 150, 68, 12, grey, { radius: 6, stroke: THIN }),
      ],
    }),
  );
})();

const farmer = (() => {
  const skin = '#a86b3c';
  const shirt = '#d64541';
  const denim = '#3d6fb6';
  const left = armAt('L', 120, 100);
  const [hx] = handOf(left);
  return person(
    'farmer',
    'Farmer',
    ['farmer', 'farm', 'job', 'countryside', 'agriculture', 'pitchfork'],
    figure({
      props: [
        group('Pitchfork', [
          line(
            'Handle',
            [
              [hx, 372],
              [hx, 62],
            ],
            '#a0703c',
            6,
          ),
          line(
            'Crossbar',
            [
              [hx - 18, 62],
              [hx + 18, 62],
            ],
            '#7f8c99',
            5,
          ),
          line(
            'Left prong',
            [
              [hx - 18, 62],
              [hx - 18, 18],
            ],
            '#7f8c99',
            4,
          ),
          line(
            'Middle prong',
            [
              [hx, 62],
              [hx, 14],
            ],
            '#7f8c99',
            4,
          ),
          line(
            'Right prong',
            [
              [hx + 18, 62],
              [hx + 18, 18],
            ],
            '#7f8c99',
            4,
          ),
        ]),
      ],
      legs: legs({ base: denim, shoe: '#6b4423' }),
      arms: [
        arm('L', left, { skin, sleeve: shirt, sleeveLen: 40 }),
        arm('R', armAt('R', 78, 90), { skin, sleeve: shirt, sleeveLen: 40 }),
      ],
      body: [
        torso(shirt),
        line(
          'Check 1',
          [
            [CX - 41, 160],
            [CX + 41, 160],
          ],
          '#a83232',
          3,
        ),
        line(
          'Check 2',
          [
            [CX - 42, 180],
            [CX + 42, 180],
          ],
          '#a83232',
          3,
        ),
        rect('Bib', CX - 28, 180, 56, 50, denim, { radius: 4, stroke: THIN }),
        hips(denim, 222),
        line(
          'Left strap',
          [
            [CX - 24, 182],
            [CX - 30, 135],
          ],
          denim,
          7,
        ),
        line(
          'Right strap',
          [
            [CX + 24, 182],
            [CX + 30, 135],
          ],
          denim,
          7,
        ),
        circle('Left button', CX - 22, 188, 4, '#e2b33c'),
        circle('Right button', CX + 22, 188, 4, '#e2b33c'),
        rect('Bib pocket', CX - 12, 198, 24, 18, '#35619f', { radius: 3, stroke: THIN }),
      ],
      head: [
        ...face(skin, '#3b2a20'),
        line(
          'Straw',
          [
            [CX + 8, CY + 22],
            [CX + 34, CY + 32],
          ],
          '#e8c15a',
          3,
        ),
        ellipse('Brim', CX - 74, CY - 54, 148, 26, '#e8c15a', { stroke: OUTLINE }),
        shape('Crown', arc(CX, CY - 40, 38, 36, 180, 360, 16), '#f1d07a', { stroke: OUTLINE }),
        rect('Hat band', CX - 38, CY - 50, 76, 9, '#c0392b'),
      ],
    }),
  );
})();

const builder = (() => {
  const skin = '#5c3a21';
  const shirt = '#7f8c9d';
  const vest = '#ff8c1a';
  const right = armAt('R', -22, -82);
  const [hx, hy] = handOf(right);
  const band = (y: number, n: string): Part => rect(n, CX - 42, y, 84, 9, '#e6e6e6');
  return person(
    'builder',
    'Builder',
    ['builder', 'construction', 'worker', 'job', 'hard hat', 'hammer', 'engineer'],
    figure({
      props: [
        group('Hammer', [
          line(
            'Handle',
            [
              [hx, hy + 16],
              [hx, hy - 50],
            ],
            '#a0703c',
            8,
          ),
          shape('Head', turnedRect(hx + 2, hy - 58, 46, 18, -4), '#7f8c99', { stroke: THIN }),
        ]),
      ],
      legs: legs({ base: '#34558b', shoe: '#7a4a1e' }),
      arms: [
        arm('R', right, { skin, sleeve: shirt }),
        arm('L', armAt('L', 100, 92), { skin, sleeve: shirt }),
      ],
      body: [
        torso(shirt),
        shape(
          'Vest',
          [
            [CX - 30, 134],
            [CX - 10, 134],
            [CX - 6, 236],
            [CX + 6, 236],
            [CX + 10, 134],
            [CX + 30, 134],
            [CX + 42, 160],
            [CX + 42, 236],
            [CX - 42, 236],
            [CX - 42, 160],
          ],
          vest,
          { stroke: THIN },
        ),
        band(184, 'Upper stripe'),
        band(208, 'Lower stripe'),
        hips('#34558b', 230),
        rect('Tool belt', CX - 44, 232, 88, 12, '#7a4a1e', { stroke: THIN }),
        rect('Pouch', CX + 14, 238, 24, 24, '#8e5a2a', { radius: 3, stroke: THIN }),
      ],
      head: [
        ...face(skin, '#111111', grin(18, 12, '#4a1010')),
        shape('Hard hat', arc(CX, CY - 14, R + 2, R - 2, 180, 360, 18), '#f5c518', {
          stroke: OUTLINE,
        }),
        rect('Hat brim', CX - R - 12, CY - 18, 2 * R + 24, 10, '#e0b000', {
          radius: 5,
          stroke: THIN,
        }),
        rect('Hat ridge', CX - 7, CY - 56, 14, 38, '#e0b000', { radius: 6 }),
      ],
    }),
  );
})();

const grandpa = (() => {
  const skin = '#f0c8a0';
  const white = '#eeeeee';
  const cardigan = '#8b5e3c';
  const right = armAt('R', 74, 88);
  const [hx, hy] = handOf(right);
  return person(
    'grandpa',
    'Grandpa',
    ['grandpa', 'grandparent', 'grandfather', 'old', 'elderly', 'family', 'walking stick'],
    figure({
      props: [
        group('Walking stick', [
          line(
            'Stick',
            [[hx + 2, 372], [hx + 2, hy], ...arc(hx - 10, hy, 12, 12, 0, -180, 10)],
            '#6b4226',
            7,
          ),
          rect('Rubber tip', hx - 3, 362, 10, 10, '#222222', { radius: 2 }),
        ]),
      ],
      legs: legs({ base: '#6d6d6d', shoe: '#5a3a22' }),
      arms: [
        arm('R', right, { skin, sleeve: cardigan }),
        arm('L', armAt('L', 102, 94), { skin, sleeve: cardigan }),
      ],
      body: [
        torso(cardigan),
        vNeck('#f4f0e6', 40, 18),
        ...collar('#f4f0e6'),
        ...buttons(CX, [186, 206, 226], '#e2c290'),
        rect('Left pocket', CX - 36, 222, 20, 18, '#7a5032', { radius: 3, stroke: THIN }),
        rect('Right pocket', CX + 16, 222, 20, 18, '#7a5032', { radius: 3, stroke: THIN }),
      ],
      head: [
        star('Left tuft', CX - R - 14, CY - 30, 34, 40, white, 9, 0.72, { stroke: THIN }),
        star('Right tuft', CX + R - 20, CY - 30, 34, 40, white, 9, 0.72, { stroke: THIN }),
        ...ears(skin),
        faceDisc(skin),
        ...cheeks(),
        ...eyes(),
        ...brows(white, -12, 5),
        ...glasses('#6b4226'),
        smile(26, 9),
        shape(
          'Moustache',
          [
            ...arc(CX - 11, CY + 21, 13, 7, 180, 360, 8),
            ...arc(CX + 11, CY + 21, 13, 7, 180, 360, 8),
            ...arc(CX, CY + 21, 24, 5, 0, 180, 10),
          ],
          white,
          { stroke: [INK, 1] },
        ),
        line('Wrinkle', arc(CX, CY - 22, 12, 3, 200, 340, 6), '#c99a72', 2),
      ],
    }),
  );
})();

const superhero = (() => {
  const skin = '#7a4a2a';
  const suit = '#2557d6';
  const red = '#d62828';
  return person(
    'superhero',
    'Superhero',
    ['superhero', 'hero', 'cape', 'fantasy', 'super', 'power', 'story'],
    figure({
      behind: [
        shape(
          'Cape',
          [
            [CX - 36, 140],
            [CX + 36, 140],
            [CX + 76, 340],
            [CX + 38, 330],
            [CX, 344],
            [CX - 38, 330],
            [CX - 76, 340],
          ],
          red,
          { stroke: OUTLINE },
        ),
      ],
      legs: legs({
        base: suit,
        over: [{ name: 'Boot', colour: red, from: 74, to: 112 }],
        shoe: red,
      }),
      arms: [
        arm('R', armAt('R', -62, -92), { skin, sleeve: suit, hand: red, cuff: red }),
        arm('L', armAt('L', 140, 42), { skin, sleeve: suit, hand: red, cuff: red }),
      ],
      body: [
        torso(suit),
        circle('Emblem', CX, 182, 22, '#f1c40f', { stroke: THIN }),
        star('Emblem star', CX - 15, 167, 30, 30, red, 5, 0.45),
        hips(red, 232),
        rect('Belt', CX - 42, 226, 84, 9, '#f1c40f', { stroke: THIN }),
        shape('Left cape tie', arc(CX - 32, 140, 12, 8, 0, 360, 10), red, { stroke: THIN }),
        shape('Right cape tie', arc(CX + 32, 140, 12, 8, 0, 360, 10), red, { stroke: THIN }),
      ],
      head: [
        ...ears(skin),
        faceDisc(skin),
        hairCap('#111111', { bump: 9, teeth: 7, brow: 30, part: 0.7 }),
        ...cheeks(30),
        rect('Mask', CX - 34, CY - 8, 68, 22, '#16307a', { radius: 11 }),
        ellipse('Left eye white', CX - 24, CY - 3, 16, 13, WHITE),
        ellipse('Right eye white', CX + 8, CY - 3, 16, 13, WHITE),
        ...eyes(3, 16, 4),
        grin(20, 12, '#4a1010'),
      ],
    }),
  );
})();

const wizard = (() => {
  const skin = '#e9c09a';
  const robe = '#5b3fa0';
  const beard = '#f2f2f2';
  const right = armAt('R', 32, -68);
  const [hx] = handOf(right);
  return person(
    'wizard',
    'Wizard',
    ['wizard', 'magic', 'fantasy', 'story', 'magician', 'wand', 'staff'],
    figure({
      props: [
        group('Staff', [
          line(
            'Pole',
            [
              [hx, 372],
              [hx, 58],
            ],
            '#8b5a2b',
            7,
          ),
          star('Glow', hx - 26, 14, 52, 52, '#fff3b0', 8, 0.4, { opacity: 70 }),
          star('Staff star', hx - 16, 24, 32, 32, '#f1c40f', 5, 0.45, { stroke: THIN }),
        ]),
      ],
      legs: legs({ base: '#3b2a6b', shoe: '#3b2a6b' }),
      arms: [
        arm('R', right, { skin, sleeve: robe, width: 30 }),
        arm('L', armAt('L', 100, 92), { skin, sleeve: robe, width: 30 }),
      ],
      body: [
        shape(
          'Robe',
          [
            [CX - 30, 132],
            [CX + 30, 132],
            ...arc(CX + 30, 156, 18, 24, -90, 0, 4),
            [CX + 62, 350],
            [CX - 62, 350],
            ...arc(CX - 30, 156, 18, 24, 180, 270, 4),
          ],
          robe,
          { stroke: OUTLINE },
        ),
        star('Robe star 1', CX - 40, 270, 18, 18, '#f1c40f', 5, 0.45),
        star('Robe star 2', CX + 22, 300, 14, 14, '#f1c40f', 5, 0.45),
        rect('Sash', CX - 46, 236, 92, 10, '#f1c40f', { stroke: THIN }),
      ],
      head: [
        hairBack(beard, 156, 6),
        ...face(skin, beard, smile(15, 8)),
        shape(
          'Beard',
          [
            ...arc(CX, CY + 2, R + 2, R + 2, 0, 60, 6),
            [CX + 22, CY + 84],
            [CX, CY + 104],
            [CX - 22, CY + 84],
            ...arc(CX, CY + 2, R + 2, R + 2, 120, 180, 6),
            ...arc(CX, CY + 10, R - 2, 20, 180, 0, 12),
          ],
          beard,
          { stroke: THIN },
        ),
        shape(
          'Moustache',
          [
            ...arc(CX - 11, CY + 22, 13, 7, 180, 360, 8),
            ...arc(CX + 11, CY + 22, 13, 7, 180, 360, 8),
            ...arc(CX, CY + 22, 24, 5, 0, 180, 10),
          ],
          beard,
          { stroke: [INK, 1] },
        ),
        shape(
          'Hat',
          [
            [CX - 48, CY - 30],
            [CX + 48, CY - 30],
            [CX + 22, CY - 70],
            [CX + 48, CY - 92],
            [CX + 4, CY - 80],
          ],
          robe,
          { stroke: OUTLINE },
        ),
        ellipse('Hat brim', CX - 66, CY - 40, 132, 22, robe, { stroke: OUTLINE }),
        star('Hat star', CX - 8, CY - 66, 18, 18, '#f1c40f', 5, 0.45),
        star('Hat moon', CX - 30, CY - 48, 12, 12, '#f1c40f', 4, 0.4),
      ],
    }),
  );
})();

const pirate = (() => {
  const skin = '#c68642';
  const right = armAt('R', -18, -66);
  const [hx, hy] = handOf(right);
  const stripe = (y: number, i: number): Part => rect(`Stripe ${i}`, CX - 42, y, 84, 9, '#d63031');
  return person(
    'pirate',
    'Pirate',
    ['pirate', 'sailor', 'ship', 'treasure', 'fantasy', 'story', 'sword'],
    figure({
      props: [
        group('Sword', [
          shape(
            'Blade',
            [
              [hx - 5, hy - 12],
              [hx + 5, hy - 12],
              [hx + 9, hy - 70],
              [hx - 3, hy - 92],
              [hx - 7, hy - 60],
            ],
            '#d9dee4',
            { stroke: THIN },
          ),
          rect('Guard', hx - 14, hy - 16, 28, 8, '#e2b33c', { radius: 3, stroke: THIN }),
          rect('Grip', hx - 4, hy - 10, 8, 22, '#5a3a22'),
        ]),
      ],
      legs: [
        leg('L', legAt('L'), {
          base: '#4a3b2a',
          over: [{ name: 'Boot', colour: '#1b1b1b', from: 64, to: 112 }],
          shoe: '#1b1b1b',
        }),
        group('Right leg', [
          shape('Leg', thick(piece(legAt('R'), 0, 62), 26), '#4a3b2a', { stroke: THIN }),
          rect('Peg', CX + 9, 300, 11, 62, '#a0703c', { radius: 4, stroke: THIN }),
          rect('Peg tip', CX + 7, 358, 15, 10, '#6b4226', { radius: 3, stroke: THIN }),
        ]),
      ],
      arms: [
        arm('R', right, { skin, sleeve: WHITE }),
        arm('L', armAt('L', 100, 92), { skin, sleeve: WHITE }),
      ],
      body: [
        torso(WHITE),
        stripe(158, 1),
        stripe(178, 2),
        stripe(198, 3),
        shape(
          'Waistcoat',
          [
            [CX - 30, 134],
            [CX - 14, 134],
            [CX - 16, 228],
            [CX - 42, 228],
            [CX - 42, 160],
          ],
          '#2d3436',
          { stroke: THIN },
        ),
        shape(
          'Waistcoat right',
          [
            [CX + 30, 134],
            [CX + 14, 134],
            [CX + 16, 228],
            [CX + 42, 228],
            [CX + 42, 160],
          ],
          '#2d3436',
          { stroke: THIN },
        ),
        hips('#4a3b2a', 228),
        rect('Sash', CX - 42, 220, 84, 14, '#e17055', { stroke: THIN }),
      ],
      head: [
        ...ears(skin),
        faceDisc(skin),
        ...cheeks(),
        shape(
          'Beard',
          [
            ...arc(CX, CY + 2, R + 2, R + 4, 0, 180, 16),
            ...arc(CX, CY + 14, R - 4, 16, 180, 360, 12),
          ],
          '#2b1d14',
          { stroke: THIN },
        ),
        grin(22, 11, '#5e1717'),
        circle('Eye', CX - 16, CY + 4, 5.5, INK),
        circle('Eye shine', CX - 14, CY + 2, 2, WHITE),
        line(
          'Patch strap',
          [
            [CX - R + 4, CY - 22],
            [CX + R - 2, CY + 10],
          ],
          INK,
          3,
        ),
        circle('Eye patch', CX + 16, CY + 4, 11, INK),
        ...brows('#2b1d14', -12),
        rect('Bandana', CX - R - 2, CY - 38, 2 * R + 4, 16, '#d63031', { radius: 6, stroke: THIN }),
        shape(
          'Hat',
          [
            [CX - 66, CY - 26],
            [CX - 40, CY - 40],
            ...arc(CX, CY - 40, 40, 42, 180, 360, 14),
            [CX + 40, CY - 40],
            [CX + 66, CY - 26],
            [CX, CY - 32],
          ],
          '#1e1e1e',
          { stroke: OUTLINE },
        ),
        line('Hat trim', arc(CX, CY - 34, 56, 10, 200, 340, 12), '#e2b33c', 3),
        circle('Skull', CX, CY - 60, 9, WHITE),
        rect('Skull jaw', CX - 5, CY - 54, 10, 8, WHITE),
        circle('Skull left eye', CX - 3.5, CY - 61, 2.4, INK),
        circle('Skull right eye', CX + 3.5, CY - 61, 2.4, INK),
        line(
          'Crossbones',
          [
            [CX - 12, CY - 44],
            [CX + 12, CY - 50],
          ],
          WHITE,
          3,
        ),
      ],
    }),
  );
})();

const alien = (() => {
  const green = '#7ed957';
  const dark = '#5cb83a';
  const suit = '#8e5bd8';
  const hy = 92;
  return person(
    'alien',
    'Alien',
    ['alien', 'space', 'martian', 'fantasy', 'story', 'ufo', 'friendly'],
    figure({
      legs: legs({ base: suit, shoe: '#3d2a73' }),
      arms: [
        arm('L', armAt('L', 210, 262), { skin: green, sleeve: suit, sleeveLen: 40 }),
        arm('R', armAt('R', 78, 92), { skin: green, sleeve: suit, sleeveLen: 40 }),
      ],
      body: [
        torso(suit),
        circle('Badge', CX, 184, 14, '#f1c40f', { stroke: THIN }),
        circle('Badge planet', CX, 184, 7, '#e17055'),
        line('Badge ring', arc(CX, 184, 13, 4, 160, 380, 12), INK, 2),
        rect('Belt', CX - 42, 228, 84, 10, '#3d2a73', { stroke: THIN }),
      ],
      head: [
        line(
          'Left antenna',
          [
            [CX - 20, hy - 40],
            [CX - 34, 14],
          ],
          dark,
          4,
        ),
        line(
          'Right antenna',
          [
            [CX + 20, hy - 40],
            [CX + 34, 14],
          ],
          dark,
          4,
        ),
        circle('Left antenna ball', CX - 34, 14, 8, '#f1c40f', { stroke: THIN }),
        circle('Right antenna ball', CX + 34, 14, 8, '#f1c40f', { stroke: THIN }),
        ellipse('Head shape', CX - 56, hy - 54, 112, 100, green, { stroke: OUTLINE }),
        ellipse('Left eye', CX - 38, hy - 16, 30, 36, INK),
        ellipse('Right eye', CX + 8, hy - 16, 30, 36, INK),
        circle('Left eye shine', CX - 26, hy - 6, 6, WHITE),
        circle('Right eye shine', CX + 20, hy - 6, 6, WHITE),
        circle('Left eye sparkle', CX - 18, hy + 6, 3, WHITE),
        circle('Right eye sparkle', CX + 28, hy + 6, 3, WHITE),
        ellipse('Left cheek', CX - 46, hy + 22, 16, 9, CHEEK, { opacity: 45 }),
        ellipse('Right cheek', CX + 30, hy + 22, 16, 9, CHEEK, { opacity: 45 }),
        line('Mouth', arc(CX, hy + 26, 10, 7, 15, 165, 10), '#2d5a1a', 3),
        circle('Spot 1', CX - 30, hy - 36, 5, dark),
        circle('Spot 2', CX + 32, hy - 34, 4, dark),
      ],
    }),
  );
})();

const monster = (() => {
  const fur = '#3cbfae';
  const belly = '#a6ece2';
  const fy = 170;
  return person(
    'monster',
    'Friendly monster',
    ['monster', 'fantasy', 'story', 'creature', 'friendly', 'cute'],
    [
      group('Left leg', [
        rect('Leg', CX - 44, 270, 30, 70, fur, { radius: 12, stroke: THIN }),
        ellipse('Foot', CX - 58, 334, 50, 26, '#2a9d8f', { stroke: THIN }),
      ]),
      group('Right leg', [
        rect('Leg', CX + 14, 270, 30, 70, fur, { radius: 12, stroke: THIN }),
        ellipse('Foot', CX + 8, 334, 50, 26, '#2a9d8f', { stroke: THIN }),
      ]),
      group('Left arm', [
        shape(
          'Arm',
          thick(
            [
              [CX - 70, 200],
              [CX - 100, 160],
              [CX - 104, 120],
            ],
            22,
          ),
          fur,
          {
            stroke: THIN,
          },
        ),
        star('Hand', CX - 118, 100, 28, 28, fur, 5, 0.6, { stroke: THIN }),
      ]),
      group('Right arm', [
        shape(
          'Arm',
          thick(
            [
              [CX + 70, 210],
              [CX + 98, 240],
              [CX + 104, 270],
            ],
            22,
          ),
          fur,
          {
            stroke: THIN,
          },
        ),
        star('Hand', CX + 90, 262, 28, 28, fur, 5, 0.6, { stroke: THIN }),
      ]),
      group('Body', [
        star('Fur', CX - 86, 74, 172, 214, fur, 26, 0.92, { stroke: OUTLINE }),
        ellipse('Belly', CX - 46, 196, 92, 76, belly),
      ]),
      group('Horns', [
        shape(
          'Left horn',
          [
            [CX - 50, 98],
            [CX - 26, 88],
            [CX - 58, 46],
          ],
          '#f6e58d',
          { stroke: THIN },
        ),
        shape(
          'Right horn',
          [
            [CX + 50, 98],
            [CX + 26, 88],
            [CX + 58, 46],
          ],
          '#f6e58d',
          { stroke: THIN },
        ),
      ]),
      group('Face', [
        circle('Eye white', CX, fy - 40, 30, WHITE, { stroke: OUTLINE }),
        circle('Eye', CX + 4, fy - 36, 15, '#6c3483'),
        circle('Pupil', CX + 5, fy - 35, 8, INK),
        circle('Eye shine', CX + 10, fy - 41, 4, WHITE),
        line('Eyebrow', arc(CX, fy - 44, 30, 30, 215, 325, 10), INK, 4),
        shape('Mouth', arc(CX, fy + 6, 34, 30, 0, 180, 16), '#5e1717', { stroke: THIN }),
        shape(
          'Left tooth',
          [
            [CX - 22, fy + 6],
            [CX - 8, fy + 6],
            [CX - 15, fy + 20],
          ],
          WHITE,
        ),
        shape(
          'Right tooth',
          [
            [CX + 8, fy + 6],
            [CX + 22, fy + 6],
            [CX + 15, fy + 20],
          ],
          WHITE,
        ),
        ellipse('Tongue', CX - 14, fy + 20, 28, 14, '#ff7aa2'),
        ellipse('Left cheek', CX - 62, fy - 4, 20, 11, CHEEK, { opacity: 45 }),
        ellipse('Right cheek', CX + 42, fy - 4, 20, 11, CHEEK, { opacity: 45 }),
      ]),
    ],
  );
})();

const ghost = (() => {
  const sheet = '#fbfbff';
  const top = 70;
  const bottom = 320;
  const waves = Array.from({ length: 9 }, (_, i): Pt => [
    CX + 76 - (152 * i) / 8,
    bottom + (i % 2 ? -16 : 0),
  ]);
  return person(
    'ghost',
    'Ghost',
    ['ghost', 'spooky', 'halloween', 'fantasy', 'story', 'boo'],
    [
      ellipse('Shadow', CX - 60, 360, 120, 18, '#2d2a32', { opacity: 18 }),
      group('Left arm', [
        shape(
          'Arm',
          thick(
            [
              [CX - 60, 190],
              [CX - 90, 170],
              [CX - 104, 140],
            ],
            30,
          ),
          sheet,
          {
            stroke: OUTLINE,
          },
        ),
        circle('Hand', CX - 104, 136, 15, sheet, { stroke: OUTLINE }),
      ]),
      group('Right arm', [
        shape(
          'Arm',
          thick(
            [
              [CX + 60, 190],
              [CX + 90, 170],
              [CX + 104, 140],
            ],
            30,
          ),
          sheet,
          {
            stroke: OUTLINE,
          },
        ),
        circle('Hand', CX + 104, 136, 15, sheet, { stroke: OUTLINE }),
      ]),
      shape('Body', [...arc(CX, top + 76, 76, 76, 180, 360, 20), ...waves], sheet, {
        stroke: OUTLINE,
      }),
      group('Face', [
        ellipse('Left eye', CX - 32, 126, 20, 30, INK),
        ellipse('Right eye', CX + 12, 126, 20, 30, INK),
        circle('Left eye shine', CX - 18, 134, 4, WHITE),
        circle('Right eye shine', CX + 26, 134, 4, WHITE),
        ellipse('Mouth', CX - 11, 172, 22, 28, '#4a2b3a'),
        ellipse('Left cheek', CX - 54, 162, 22, 11, '#ff9fb5', { opacity: 55 }),
        ellipse('Right cheek', CX + 32, 162, 22, 11, '#ff9fb5', { opacity: 55 }),
      ]),
    ],
  );
})();

export const CHARACTERS: readonly LibraryItem[] = [
  teacher,
  schoolboy,
  schoolgirl,
  programmer,
  scientist,
  doctor,
  nurse,
  police,
  firefighter,
  chef,
  astronaut,
  farmer,
  builder,
  grandpa,
  superhero,
  wizard,
  pirate,
  alien,
  monster,
  ghost,
];
