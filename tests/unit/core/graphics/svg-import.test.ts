// GV6 (M19): a given SVG opened as editable objects — 9626/04 M/26's ChipLeg.svg (userSpaceOnUse
// gradients, a group with a matrix transform, even-odd paths), every basic shape, transforms,
// styles, gradients, text, units, what is left out, and our own exports opened back.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createEllipse,
  createPath,
  createRect,
  createStar,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import type {
  AnimObject,
  EllipseObject,
  GroupObject,
  PathObject,
  RectObject,
  TextObject,
} from '../../../../src/core/animation/types.ts';
import { validateObject } from '../../../../src/core/animation/rules.ts';
import { parseColour, mixColours } from '../../../../src/core/graphics/svg-colours.ts';
import { readSvg, takeBackground } from '../../../../src/core/graphics/svg-import.ts';
import { EditError } from '../../../../src/core/model/errors.ts';

const svg = (body: string, attrs = 'width="200" height="100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const one = <T extends AnimObject>(body: string, attrs?: string): T => {
  const { objects } = readSvg(svg(body, attrs));
  expect(objects).toHaveLength(1);
  objects.forEach(validateObject);
  return objects[0] as T;
};
const notesOf = (body: string) => readSvg(svg(body)).notes;

describe('GV6: ChipLeg.svg (9626/04 M/26)', () => {
  const file = readFileSync('tests/fixtures/graphics/ChipLeg.svg', 'utf8');
  const image = readSvg(file);

  it('is 77.44 × 240 px, with nothing left out', () => {
    expect(image.width).toBe(77.44);
    expect(image.height).toBe(240);
    expect(image.notes).toEqual([]);
  });

  it('is one group of four shapes, the group’s matrix taken into their points', () => {
    const [group] = image.objects as [GroupObject];
    expect(group.kind).toBe('group');
    expect(group.name).toBe('dp_dp001');
    expect(group.children.map((c) => c.name)).toEqual([
      'dp_path002',
      'dp_path003',
      'dp_path004',
      'dp_path005',
    ]);
    validateObject(group);
    // The top's first corner: (391.623, 377.636) moved by (−390.064, −363.651).
    const top = group.children[0] as PathObject;
    expect(group.x + top.x + top.points[0]!.x).toBeCloseTo(1.559, 3);
    expect(group.y + top.y + top.points[0]!.y).toBeCloseTo(13.985, 3);
    expect(top.closed).toBe(true);
    expect(top.points).toHaveLength(4);
    // Everything lies on the 77.44 × 240 canvas.
    expect(group.x).toBeGreaterThanOrEqual(0);
    expect(group.y + group.height).toBeLessThanOrEqual(240);
  });

  it('keeps the black 1.33 px outline and the white-to-orange gradient, along the file’s line', () => {
    const top = (image.objects[0] as GroupObject).children[0] as PathObject;
    expect(top.stroke).toEqual({ colour: '#000000', width: 1.33333, dash: 'solid' });
    expect(top.fill.kind).toBe('linear');
    if (top.fill.kind !== 'linear') return;
    // From (400.328, 392.922) to (448.802, 573.553): about 75° down to the right.
    expect(top.fill.angle).toBeCloseTo(74.98, 1);
    expect(top.fill.from).toBe('#ffffff');
    // The top covers only the start of the long gradient (still light); the leg reaches its end.
    expect(top.fill.to).toMatch(/^#ff[c-f]/);
    const leg = (image.objects[0] as GroupObject).children[1] as PathObject;
    expect(leg.fill.kind === 'linear' && leg.fill.to).toBe('#ff7f00');
  });
});

describe('GV6: shapes', () => {
  it('a rect stays a rectangle, with its corner radius (rx alone, ry alone, clamped)', () => {
    const r = one<RectObject>('<rect x="10" y="20" width="50" height="30" rx="5" fill="red"/>');
    expect(r).toMatchObject({ kind: 'rect', x: 10, y: 20, width: 50, height: 30, radius: 5 });
    expect(r.fill).toEqual({ kind: 'solid', colour: '#ff0000' });
    expect(r.stroke).toBeUndefined();
    expect(one<RectObject>('<rect width="50" height="30" ry="40"/>').radius).toBe(15);
    expect(readSvg(svg('<rect width="0" height="30"/>')).objects).toEqual([]);
  });

  it('a circle and an ellipse stay ellipses; a zero radius draws nothing', () => {
    expect(one<EllipseObject>('<circle cx="50" cy="50" r="10"/>')).toMatchObject({
      kind: 'ellipse',
      x: 40,
      y: 40,
      width: 20,
      height: 20,
    });
    expect(one<EllipseObject>('<ellipse cx="50" cy="50" rx="20" ry="10"/>')).toMatchObject({
      width: 40,
      height: 20,
    });
    // One radius given: both are it (SVG 2's auto).
    expect(one<EllipseObject>('<ellipse cx="50" cy="50" rx="20"/>').height).toBe(40);
    expect(readSvg(svg('<circle r="0"/>')).objects).toEqual([]);
  });

  it('a line, a polyline and a polygon are paths; an open one is not filled', () => {
    const line = one<PathObject>('<line x1="10" y1="10" x2="60" y2="30" stroke="blue"/>');
    expect(line).toMatchObject({
      kind: 'path',
      closed: false,
      x: 10,
      y: 10,
      width: 50,
      height: 20,
    });
    expect(line.fill).toEqual({ kind: 'none' });
    expect(line.name).toBe('Line');
    const poly = one<PathObject>(
      '<polyline points="0,0 10,10 20,0" fill="red" fill-opacity="0.5"/>',
    );
    expect(poly.fill).toEqual({ kind: 'none' });
    expect(poly.fillOpacity).toBeUndefined();
    const gon = one<PathObject>('<polygon points="0,0 10,10 20,0"/>');
    expect(gon.closed).toBe(true);
    expect(gon.points).toHaveLength(3);
    expect(readSvg(svg('<polygon points="0,0"/>')).objects).toEqual([]);
  });

  it('a polygon of four right angles becomes a rectangle', () => {
    expect(one('<polygon points="0,0 40,0 40,20 0,20"/>')).toMatchObject({
      kind: 'rect',
      width: 40,
      height: 20,
    });
  });

  it('a path keeps its curves as handles, arcs and quadratics as cubic curves', () => {
    const p = one<PathObject>('<path d="M0 0C0 20 40 20 40 0Q60 -20 80 0A10 10 0 0 1 100 0"/>');
    // Two curves, a quadratic, and a half circle as two quarters.
    expect(p.points).toHaveLength(5);
    expect(p.points[0]!.out).toBeDefined();
    expect(p.points[1]!.in).toBeDefined();
    // The curves’ bulges are inside the box.
    expect(p.height).toBeGreaterThan(14);
  });

  it('extra outlines of a closed path are holes (even-odd); a closed path ending on its start drops the repeat', () => {
    const p = one<PathObject>(
      '<path fill-rule="evenodd" d="M0 0H100V100H0Z M25 25H75V75H25Z M1 1"/>',
    );
    expect(p.holes).toHaveLength(1);
    expect(p.holes![0]).toHaveLength(4);
    const back = one<PathObject>('<path d="M0 0C10 -10 20 -10 30 0L15 20C10 20 5 10 0 0Z"/>');
    expect(back.points).toHaveLength(3);
    expect(back.points[0]!.in).toBeDefined();
  });

  it('open pieces of one path become a group of paths', () => {
    const g = one<GroupObject>('<path id="wires" d="M0 0L10 10M20 0L30 10" stroke="black"/>');
    expect(g.kind).toBe('group');
    expect(g.children.map((c) => c.name)).toEqual(['wires 1', 'wires 2']);
  });

  it('an empty or unreadable path draws nothing', () => {
    expect(readSvg(svg('<path d=""/><path/><path d="M5 5"/>')).objects).toEqual([]);
  });
});

describe('GV6: transforms', () => {
  it('a turned rectangle stays a rectangle, turned about its centre', () => {
    const r = one<RectObject>(
      '<rect x="0" y="0" width="40" height="20" transform="rotate(30 20 10)"/>',
    );
    expect(r).toMatchObject({ kind: 'rect', x: 0, y: 0, width: 40, height: 20, rotation: 30 });
  });

  it('scaled, mirrored and skewed boxes become the app’s size, flip and skew', () => {
    const s = one<RectObject>(
      '<rect width="10" height="10" transform="translate(5 5) scale(3 2)"/>',
    );
    expect(s).toMatchObject({ x: 5, y: 5, width: 30, height: 20, rotation: 0 });
    const fy = one<RectObject>('<rect width="10" height="10" transform="scale(1 -1)"/>');
    expect(fy).toMatchObject({ y: -10, flipY: true, rotation: 0 });
    const fx = one<RectObject>('<rect width="10" height="10" transform="scale(-1 1)"/>');
    expect(fx).toMatchObject({ x: -10, flipX: true, rotation: 0 });
    const k = one<EllipseObject>('<ellipse rx="10" ry="10" transform="skewX(30)"/>');
    expect(k.skewX).toBeCloseTo(-30, 6);
    expect(k.kind).toBe('ellipse');
  });

  it('a skew past 80° is baked into a path; the outline grows with a scale', () => {
    const p = one<PathObject>(
      '<rect width="10" height="10" stroke="black" stroke-width="2" transform="skewX(85) scale(2)"/>',
    );
    expect(p.kind).toBe('path');
    expect(p.stroke!.width).toBe(4);
    const e = one<PathObject>('<ellipse rx="10" ry="5" transform="skewY(89)"/>');
    expect(e.kind).toBe('path');
    const rr = one<PathObject>('<rect width="10" height="10" rx="2" transform="skewX(85)"/>');
    expect(rr.kind).toBe('path');
    expect(rr.points.length).toBeGreaterThan(4);
  });

  it('a shape squashed flat draws nothing', () => {
    expect(readSvg(svg('<rect width="10" height="10" transform="scale(0 1)"/>')).objects).toEqual(
      [],
    );
  });

  it('nested groups stay groups; one child alone takes the group’s opacity', () => {
    const g = one<GroupObject>(
      '<g id="outer" transform="translate(10 10)"><rect width="5" height="5"/><g opacity="0.5"><circle r="5" cx="20" cy="20" opacity="0.5"/></g></g>',
    );
    expect(g.name).toBe('outer');
    expect(g.children[1]).toMatchObject({ kind: 'ellipse', opacity: 25 });
    expect(g.x).toBe(10);
    const h = one<GroupObject>(
      '<g opacity="0.4"><rect width="5" height="5"/><rect x="9" width="5" height="5"/></g>',
    );
    expect(h).toMatchObject({ kind: 'group', name: 'Group', opacity: 40 });
    expect(readSvg(svg('<g></g>')).objects).toEqual([]);
  });

  it('<use> draws its element where it says, a <symbol> as its parts; a missing or looping one draws nothing', () => {
    const { objects } = readSvg(
      svg(
        '<defs><rect id="r" width="5" height="5"/><symbol id="s"><circle r="2"/><circle cx="9" r="2"/></symbol></defs>' +
          '<use href="#r" x="10" y="20"/><use xlink:href="#s"/><use href="#nope"/><use id="me" href="#me"/>',
      ),
    );
    expect(objects[0]).toMatchObject({ kind: 'rect', x: 10, y: 20 });
    expect(objects[1]!.kind).toBe('group');
    expect(objects).toHaveLength(2);
  });

  it('a nested <svg> places its viewBox at its x, y and size', () => {
    const r = one<RectObject>(
      '<svg x="10" y="10" width="20" height="20" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    );
    expect(r).toMatchObject({ x: 10, y: 10, width: 20, height: 20 });
  });
});

describe('GV6: fills and outlines', () => {
  it('reads presentation attributes, style="" over them, and a <style> sheet’s simple rules', () => {
    const { objects } = readSvg(
      svg(
        '<style>/* Illustrator */ .st0{fill:#FF0000;stroke:#00f} rect.big{stroke-width:4} #me{fill:lime} g > rect{fill:pink} @font-face{font-family:x} *{stroke-opacity:1}</style>' +
          '<rect class="st0" width="5" height="5"/><rect class="st0 big" fill="blue" style="fill: yellow !important" width="5" height="5"/>' +
          '<rect id="me" class="st0" width="5" height="5"/>',
      ),
    );
    expect(objects.map((o) => o.fill)).toEqual([
      { kind: 'solid', colour: '#ff0000' },
      { kind: 'solid', colour: '#ffff00' },
      { kind: 'solid', colour: '#00ff00' },
    ]);
    expect(objects[1]!.stroke).toEqual({ colour: '#0000ff', width: 4, dash: 'solid' });
  });

  it('children take their parent’s fill and outline; inherit and currentColor follow it', () => {
    const g = one<GroupObject>(
      '<g fill="green" stroke="red" color="#123456"><rect width="5" height="5" fill="inherit"/><rect width="5" height="5" fill="currentColor" stroke="none"/></g>',
    );
    expect(g.children[0]!.fill).toEqual({ kind: 'solid', colour: '#008000' });
    expect(g.children[0]!.stroke?.colour).toBe('#ff0000');
    expect(g.children[1]!.fill).toEqual({ kind: 'solid', colour: '#123456' });
    expect(g.children[1]!.stroke).toBeUndefined();
  });

  it('a fill it cannot read is black; fill none is none; stroke width 0 is no outline', () => {
    expect(one('<rect width="5" height="5" fill="sparkly"/>').fill).toEqual({
      kind: 'solid',
      colour: '#000000',
    });
    expect(one('<rect width="5" height="5" fill="none"/>').fill).toEqual({ kind: 'none' });
    expect(
      one('<rect width="5" height="5" stroke="red" stroke-width="0"/>').stroke,
    ).toBeUndefined();
  });

  it('opacity, fill-opacity, stroke-opacity and colours with alpha', () => {
    const r = one<RectObject>(
      '<rect width="5" height="5" opacity="0.5" fill="rgba(255,0,0,0.5)" fill-opacity="50%" stroke="#0f08" stroke-opacity="0.5"/>',
    );
    expect(r.opacity).toBe(50);
    expect(r.fillOpacity).toBe(25);
    expect(r.stroke!.colour).toBe('#00ff00');
    expect(r.stroke!.opacity).toBeCloseTo(26.67, 1);
    expect(one('<rect width="5" height="5" opacity="oops"/>').opacity).toBe(100);
  });

  it('dashes: long ones dashed, short ones dotted, none solid', () => {
    const dash = (d: string) =>
      one(`<rect width="5" height="5" stroke="black" stroke-width="2" stroke-dasharray="${d}"/>`)
        .stroke!.dash;
    expect(dash('6 4')).toBe('dashed');
    expect(dash('0.01, 4')).toBe('dotted');
    expect(dash('none')).toBe('solid');
    expect(dash('0 0')).toBe('solid');
  });

  it('display none and visibility hidden draw nothing; other programs’ own elements are skipped', () => {
    expect(
      readSvg(
        svg(
          '<rect width="5" height="5" display="none"/><rect width="5" height="5" visibility="hidden"/>' +
            '<text visibility="hidden">x</text><sodipodi:namedview/><title>t</title><metadata/>',
        ),
      ).objects,
    ).toEqual([]);
  });
});

describe('GV6: gradients', () => {
  const grad = (
    def: string,
    shape = '<rect x="0" y="0" width="100" height="50" fill="url(#g)"/>',
  ) => one<RectObject>(`<defs>${def}</defs>${shape}`).fill;

  it('a left-to-right gradient over the box is the app’s angle 0 with the same colours', () => {
    expect(
      grad(
        '<linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>',
      ),
    ).toEqual({ kind: 'linear', angle: 0, from: '#ff0000', to: '#0000ff' });
  });

  it('a top-to-bottom gradient in user space over part of the box gets its colours between', () => {
    const fill = grad(
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="40"><stop offset="0%" style="stop-color:#000000"/><stop offset="50%" stop-color="#ffffff"/><stop offset="100%" stop-color="#000000"/></linearGradient>',
    );
    expect(fill).toMatchObject({ kind: 'linear', angle: 90, from: '#000000', to: '#000000' });
    if (fill.kind !== 'linear') return;
    expect(fill.stops).toEqual([
      { at: 20, colour: '#000000' },
      { at: 50, colour: '#ffffff' },
      { at: 80, colour: '#000000' },
    ]);
  });

  it('follows href to the gradient holding the stops, and a gradientTransform', () => {
    const fill = grad(
      '<linearGradient id="base"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>' +
        '<linearGradient id="g" xlink:href="#base" gradientTransform="rotate(90 0.5 0.5)"/>',
    );
    expect(fill).toMatchObject({ kind: 'linear', from: '#ff0000', to: '#0000ff' });
    expect(fill.kind === 'linear' && Math.round(fill.angle)).toBe(90);
  });

  it('a radial gradient keeps its centre in % of the box and spreads its colours to the box', () => {
    const fill = grad(
      '<radialGradient id="g" cx="25%" cy="50%" r="50%"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient>',
      '<rect width="100" height="100" fill="url(#g)"/>',
    );
    expect(fill).toEqual({ kind: 'radial', from: '#ffffff', to: '#000000', cx: 25 });
    const user = grad(
      '<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="100"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient>',
      '<rect width="100" height="100" fill="url(#g)"/>',
    );
    // The app's reaches half the box (50 px): half the file's 100 px, so it ends mid-grey.
    expect(user).toMatchObject({ kind: 'radial', from: '#ffffff', to: '#808080' });
  });

  it('one stop is a colour, none is no fill; a missing gradient uses its fallback', () => {
    expect(grad('<linearGradient id="g"><stop stop-color="red"/></linearGradient>')).toEqual({
      kind: 'solid',
      colour: '#ff0000',
    });
    expect(grad('<linearGradient id="g"/>')).toEqual({ kind: 'none' });
    expect(grad('', '<rect width="5" height="5" fill="url(#gone) teal"/>')).toEqual({
      kind: 'solid',
      colour: '#008080',
    });
    expect(grad('', '<rect width="5" height="5" fill="url(#gone)"/>')).toEqual({ kind: 'none' });
  });

  it('a gradient of no length is its last colour; on a flat box its colour there', () => {
    expect(
      grad(
        '<linearGradient id="g" x2="0"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>',
      ),
    ).toEqual({ kind: 'solid', colour: '#0000ff' });
    expect(
      grad(
        '<radialGradient id="g" r="0"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></radialGradient>',
      ),
    ).toEqual({ kind: 'solid', colour: '#0000ff' });
    const flat = one<PathObject>(
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path d="M0 0H50" fill="url(#g)" stroke="url(#g)"/>',
    );
    expect(flat.fill).toEqual({ kind: 'none' });
    expect(flat.stroke?.colour).toBe('#ff0000');
  });

  it('G8 (M23): see-through stops keep their opacity (#rrggbbaa); an outline gradient becomes one colour, noted', () => {
    const { objects, notes } = readSvg(
      svg(
        '<linearGradient id="g"><stop stop-color="red" stop-opacity="0.5"/><stop offset="1" stop-color="#00f8"/></linearGradient>' +
          '<rect width="5" height="5" fill="url(#g)" stroke="url(#g)"/>',
      ),
    );
    expect(objects[0]!.fill).toMatchObject({ kind: 'linear', from: '#ff000080', to: '#0000ff88' });
    // The outline is one colour, without the see-through (it has its own opacity).
    expect(objects[0]!.stroke?.colour).toBe('#ff0000');
    expect(notes).toEqual(['A gradient outline became one colour.']);
  });

  it('a pattern fill becomes the colour of its part on top, noted', () => {
    const { objects, notes } = readSvg(
      svg(
        '<pattern id="p"><rect width="2" height="2" fill="white"/><g><rect width="2" height="2" fill="none"/><circle r="1" style="fill:#abcdef"/></g></pattern><pattern id="q"/>' +
          '<rect width="5" height="5" fill="url(#p)"/><rect width="5" height="5" fill="url(#q) red"/>',
      ),
    );
    expect(objects[0]!.fill).toEqual({ kind: 'solid', colour: '#abcdef' });
    expect(objects[1]!.fill).toEqual({ kind: 'solid', colour: '#ff0000' });
    expect(notes).toEqual(['A pattern fill became one colour.']);
  });
});

describe('GV6: text', () => {
  it('becomes text in the nearest bundled font, bold, italic, aligned, its top above the baseline', () => {
    const t = one<TextObject>(
      '<text x="10" y="50" font-family="\'Montserrat Bold\', sans-serif" font-size="20" font-weight="bold" font-style="italic">  Chip   leg </text>',
    );
    expect(t).toMatchObject({
      kind: 'text',
      text: 'Chip leg',
      font: 'Montserrat',
      size: 20,
      bold: true,
      italic: true,
      align: 'left',
    });
    expect(t.x).toBe(10);
    expect(t.y).toBe(32); // 50 − 0.9 × 20
    expect(t.fill).toEqual({ kind: 'solid', colour: '#000000' });
    expect(t.name).toBe('Chip leg');
  });

  it('uses the measured top of the font, a middle or right anchor, and before-edge text', () => {
    const { objects } = readSvg(
      svg(
        '<text x="100" y="50" font-size="10" text-anchor="middle">ab</text>' +
          '<text x="100" y="50" font-size="10" text-anchor="end" dominant-baseline="text-before-edge">ab</text>' +
          '<text y="50" font-size="10" dominant-baseline="central">ab</text>',
      ),
      { textTops: { '400 "Inter"': 0.5 } },
    );
    const [mid, end, central] = objects as TextObject[];
    expect(mid!.align).toBe('centre');
    expect(mid!.y).toBe(45);
    expect(mid!.x).toBeCloseTo(100 - mid!.width / 2);
    expect(end!).toMatchObject({ align: 'right', y: 50 });
    expect(central!.y).toBe(45);
  });

  it('tspans with their own y are lines; fonts are matched by kind', () => {
    const t = one<TextObject>(
      '<text font-family="Georgia, serif"><tspan x="0" y="10">One</tspan><tspan x="0" y="30">Two</tspan></text>',
    );
    expect(t.text).toBe('One\nTwo');
    expect(t.font).toBe('Noto Serif');
    const font = (f: string) => one<TextObject>(`<text font-family="${f}">x</text>`).font;
    expect(font('Courier New, monospace')).toBe('Courier Prime');
    expect(font('Comic Sans MS')).toBe('Dancing Script');
    expect(font('Impact')).toBe('Anton');
    expect(font('Arial')).toBe('Inter');
    expect(font('Open Sans')).toBe('Inter');
  });

  it('keeps spaces when asked; empty text is nothing; text on a path is noted', () => {
    expect(one<TextObject>('<text xml:space="preserve">a  b</text>').text).toBe('a  b');
    expect(readSvg(svg('<text> </text>')).objects).toEqual([]);
    const { notes } = readSvg(svg('<text><textPath href="#p">round</textPath></text>'));
    expect(notes).toEqual(['1 part the app cannot edit (such as text on a path) was left out.']);
  });

  it('turned text is turned; text squashed flat is left out', () => {
    expect(one<TextObject>('<text transform="rotate(90)">x</text>').rotation).toBe(90);
    expect(readSvg(svg('<text transform="scale(1 0)">x</text>')).objects).toEqual([]);
  });
});

describe('GV6: size and units', () => {
  it('a size in cm becomes px at the dpi, and the drawing is scaled with it', () => {
    const image = readSvg(svg('<rect width="100" height="10"/>', 'width="10cm" height="5cm"'), {
      dpi: 300,
    });
    expect(image.width).toBeCloseTo(1181.1, 1);
    expect(image.height).toBeCloseTo(590.55, 1);
    // 100 user units (CSS px) = 100/96 in = 312.5 px at 300 dpi.
    expect(image.objects[0]!.width).toBeCloseTo(312.5, 3);
  });

  it('a viewBox maps onto the size (meet, centred; or stretched with none)', () => {
    const fit = readSvg(
      svg('<rect width="10" height="10"/>', 'width="200" height="100" viewBox="0 0 10 10"'),
    );
    expect(fit.objects[0]).toMatchObject({ x: 50, y: 0, width: 100, height: 100 });
    const none = readSvg(
      svg(
        '<rect width="10" height="10"/>',
        'width="200" height="100" viewBox="0 0 10 10" preserveAspectRatio="none"',
      ),
    );
    expect(none.objects[0]).toMatchObject({ x: 0, width: 200, height: 100 });
    const slice = readSvg(
      svg(
        '<rect width="10" height="10"/>',
        'width="200" height="100" viewBox="0 0 10 10" preserveAspectRatio="xMinYMax slice"',
      ),
    );
    expect(slice.objects[0]).toMatchObject({ x: 0, y: -100, width: 200 });
  });

  it('missing sizes come from the viewBox, in proportion, or are 300 × 150', () => {
    expect(readSvg(svg('', 'viewBox="0 0 40 20"'))).toMatchObject({ width: 40, height: 20 });
    expect(readSvg(svg('', 'width="80" viewBox="0 0 40 20"'))).toMatchObject({
      width: 80,
      height: 40,
    });
    expect(readSvg(svg('', 'height="10" viewBox="0 0 40 20"'))).toMatchObject({
      width: 20,
      height: 10,
    });
    expect(readSvg(svg('', 'width="100%"'))).toMatchObject({ width: 300, height: 150 });
    expect(readSvg(svg('', 'width="3pc" height="1in"'))).toMatchObject({ width: 48, height: 96 });
  });

  it('lengths inside in units and % of the viewport', () => {
    const r = one<RectObject>('<rect x="10%" width="1in" height="2.54cm" ry="1em"/>');
    expect(r).toMatchObject({ x: 20, width: 96, height: 96, radius: 16 });
    expect(one<RectObject>('<rect width="10mm" height="12pt" rx="1ex"/>')).toMatchObject({
      height: 16,
      radius: 8,
    });
  });
});

describe('GV6: what is left out', () => {
  it('names pictures, clip paths, masks, effects and other parts', () => {
    expect(
      notesOf(
        '<image href="a.png" width="5" height="5"/><image/>' +
          '<rect width="5" height="5" clip-path="url(#c)"/><g mask="url(#m)"><rect width="5" height="5"/></g>' +
          '<rect width="5" height="5" style="filter:url(#f)"/><foreignObject/>',
      ),
    ).toEqual([
      '2 pictures inside the SVG were left out.',
      'A clip path was left out: the shapes it cut are shown whole.',
      'A mask was left out: the shapes under it are shown whole.',
      'Effects (shadows, glows, blurs) were left out: add them again in Properties.',
      '1 part the app cannot edit (such as text on a path) was left out.',
    ]);
    expect(notesOf('<image/>')).toEqual(['1 picture inside the SVG was left out.']);
  });

  it('a whole picture faded is each object faded', () => {
    const { objects } = readSvg(svg('<rect width="5" height="5"/>', 'opacity="0.5"'));
    expect(objects[0]!.opacity).toBe(50);
  });

  it('refuses what is not an SVG', () => {
    expect(() => readSvg('<html><body/></html>')).toThrow(EditError);
    expect(() => readSvg('not xml')).toThrow('This file is not an SVG picture.');
  });
});

describe('GV6: our own SVG exports open back as the same objects', () => {
  const doc = (objects: AnimObject[], background = '#f4c8ee') => {
    const base = createAnimation({ name: 'T' });
    return {
      ...base,
      stage: { ...base.stage, width: 400, height: 300, background },
      layers: [{ ...base.layers[0]!, objects }],
    };
  };
  const back = (objects: AnimObject[], background?: string) => {
    const image = readSvg(stageSvg(doc(objects, background)));
    image.objects.forEach(validateObject);
    return takeBackground(image);
  };

  it('the background becomes the canvas colour again', () => {
    expect(back([])).toEqual({ background: '#f4c8ee', objects: [] });
    expect(back([], 'none')).toEqual({ objects: [] });
  });

  it('rectangles, turned or rounded, and ellipses, turned, come back as themselves', () => {
    const rect = {
      ...createRect({ x: 20, y: 30, width: 80, height: 40 }),
      fill: { kind: 'solid' as const, colour: '#ff0000' },
    };
    const turned = { ...createRect({ x: 150, y: 30, width: 60, height: 20 }), rotation: 30 };
    const rounded = { ...createRect({ x: 20, y: 120, width: 80, height: 40 }), radius: 10 };
    const ellipse = createEllipse({ x: 150, y: 120, width: 60, height: 30 });
    const tilted = { ...createEllipse({ x: 250, y: 120, width: 60, height: 30 }), rotation: 45 };
    const { objects } = back([rect, turned, rounded, ellipse, tilted]);
    const want = [rect, turned, rounded, ellipse, tilted];
    expect(objects.map((o) => o.kind)).toEqual(want.map((o) => o.kind));
    objects.forEach((o, i) => {
      const w = want[i]!;
      for (const k of ['x', 'y', 'width', 'height'] as const) expect(o[k]).toBeCloseTo(w[k], 1);
      expect(norm(o.rotation)).toBeCloseTo(norm(w.rotation), 1);
      expect(o.fill).toEqual(w.fill);
      expect(o.stroke).toEqual(w.stroke);
    });
    expect((objects[2] as RectObject).radius).toBeCloseTo(10, 2);
  });

  it('a pattern fill comes back as its colour, effects are named as left out', () => {
    const striped = {
      ...createRect({ x: 10, y: 10, width: 50, height: 40 }),
      fill: {
        kind: 'pattern' as const,
        pattern: 'stripes' as const,
        colour: '#ff0000',
        background: '#ffffff',
        size: 10,
      },
      filters: [
        { kind: 'dropShadow' as const, colour: '#000000', dx: 3, dy: 3, blur: 4, opacity: 50 },
      ],
    };
    const image = readSvg(stageSvg(doc([striped])));
    const { objects } = takeBackground(image);
    expect(objects[0]).toMatchObject({ kind: 'rect', x: 10, width: 50 });
    expect(objects[0]!.fill).toEqual({ kind: 'solid', colour: '#ff0000' });
    expect(image.notes).toEqual([
      'Effects (shadows, glows, blurs) were left out: add them again in Properties.',
      'A pattern fill became one colour.',
    ]);
  });

  it('paths, stars and text come back where they were', () => {
    const path = createPath(
      [
        { x: 10, y: 10 },
        { x: 60, y: 40 },
        { x: 10, y: 60 },
      ],
      true,
    );
    const curved: PathObject = {
      ...path,
      points: path.points.map((p, i) => (i === 1 ? { ...p, in: { x: 40, y: 0 } } : p)),
    };
    const star = createStar({ x: 100, y: 100, width: 50, height: 50 });
    const text = createText('Leg', { x: 200, y: 200, size: 30 });
    const { objects } = back([curved, star, text]);
    expect(objects.map((o) => o.kind)).toEqual(['path', 'path', 'text']);
    expect((objects[0] as PathObject).points[1]!.in).toBeDefined();
    // A star's box is its points' bounds: a little inside the drawn star's box.
    expect(Math.abs(objects[1]!.x - star.x)).toBeLessThan(2);
    expect(Math.abs(objects[1]!.width - star.width)).toBeLessThan(3);
    const t = objects[2] as TextObject;
    expect(t).toMatchObject({ text: 'Leg', font: text.font, size: 30, align: 'left' });
    expect(t.x).toBeCloseTo(200, 3);
    // The export's baseline is 0.9 em (no measured fonts) below the top: the same comes back.
    expect(t.y).toBeCloseTo(200, 3);
  });
});

const norm = (d: number) => ((d % 180) + 180) % 180;

describe('GV6: colours', () => {
  it('reads hex, rgb, hsl and names', () => {
    expect(parseColour('#ABC')).toEqual({ hex: '#aabbcc', alpha: 1 });
    expect(parseColour('#abcd')).toEqual({ hex: '#aabbcc', alpha: 0xdd / 255 });
    expect(parseColour('#FF7F00')).toEqual({ hex: '#ff7f00', alpha: 1 });
    expect(parseColour('#ff7f0080')).toEqual({ hex: '#ff7f00', alpha: 0x80 / 255 });
    expect(parseColour('#12345')).toBeNull();
    expect(parseColour('rgb(255, 127, 0)')).toEqual({ hex: '#ff7f00', alpha: 1 });
    expect(parseColour('rgb(100% 50% 0% / 50%)')).toEqual({ hex: '#ff8000', alpha: 0.5 });
    expect(parseColour('rgba(0,0,0,2)')).toEqual({ hex: '#000000', alpha: 1 });
    expect(parseColour('rgb(1,2)')).toBeNull();
    expect(parseColour('rgb(a,b,c)')).toBeNull();
    expect(parseColour('hsl(120, 100%, 50%)')).toEqual({ hex: '#00ff00', alpha: 1 });
    expect(parseColour('hsla(-120, 100%, 50%, 0.5)')).toEqual({ hex: '#0000ff', alpha: 0.5 });
    expect(parseColour(' White ')).toEqual({ hex: '#ffffff', alpha: 1 });
    expect(parseColour('transparent')).toBe('none');
    expect(parseColour('none')).toBe('none');
    expect(parseColour('blurple')).toBeNull();
  });

  it('mixes two colours', () => {
    expect(mixColours('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
