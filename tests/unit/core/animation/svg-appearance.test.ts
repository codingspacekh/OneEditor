// M19 / G12, G14 in the SVG: pattern fills as <pattern>, the fill's and outline's own opacity as
// fill-opacity and stroke-opacity, effects as <filter> — drawn by the same drawStage as the stage.
import { describe, expect, it } from 'vitest';
import { newFilter } from '../../../../src/core/animation/appearance.ts';
import {
  createAnimation,
  createGroup,
  createLayer,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import type { AnimationDoc, AnimObject, Paint } from '../../../../src/core/animation/types.ts';

function stageWith(objects: AnimObject[], pictures: AnimationDoc['pictures'] = []): AnimationDoc {
  const doc = createAnimation({ name: 'Balloon' });
  return {
    ...doc,
    stage: { ...doc.stage, width: 600, height: 400, background: '#808080' },
    pictures,
    layers: [createLayer('Layer 1', { objects })],
  };
}
const pattern = (extra: Partial<Extract<Paint, { kind: 'pattern' }>> = {}): Paint => ({
  kind: 'pattern',
  pattern: 'checks',
  colour: '#B40000',
  background: '#FFFFFF',
  size: 20,
  ...extra,
});
const box = (extra: Partial<AnimObject> = {}): AnimObject =>
  ({
    ...createRect({ x: 100, y: 50, width: 200, height: 100 }),
    stroke: undefined,
    ...extra,
  }) as AnimObject;

describe('G12 pattern fills in the SVG', () => {
  it('G12 (J/22 balloon): a pattern is a <pattern> of its tile, from the box’s corner', () => {
    const svg = stageSvg(stageWith([box({ fill: pattern() })]));
    expect(svg).toContain(
      '<pattern id="p1" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="matrix(1 0 0 1 100 50)">',
    );
    // The background, then the checks in the colour, inside the pattern.
    expect(svg).toMatch(
      /<pattern [^>]*><rect x="0" y="0" width="20" height="20" fill="#FFFFFF"\/><path d="M0 0L10 0L10 10L0 10ZM10 10L20 10L20 20L10 20Z" fill="#B40000"\/><\/pattern>/,
    );
    expect(svg).toContain('fill="url(#p1)"');
  });

  it('G12: turned, see-through between, and a picture tiled as an <image>', () => {
    const picture = { id: 'p1', path: 'leaf.png', width: 100, height: 50 };
    const svg = stageSvg(
      stageWith(
        [
          box({ fill: pattern({ angle: 90, background: 'none' }) }),
          box({ fill: pattern({ pattern: 'picture', pictureId: 'p1', size: 30 }) }),
        ],
        [picture],
      ),
      0,
      { p1: 'data:image/png;base64,AAAA' },
    );
    expect(svg).toContain('patternTransform="matrix(0 1 -1 0 250 0)"');
    expect(svg).not.toMatch(/<pattern id="p1"[^>]*><rect/);
    expect(svg).toContain(
      '<pattern id="p2" patternUnits="userSpaceOnUse" width="30" height="15" patternTransform="matrix(1 0 0 1 100 50)"><image href="data:image/png;base64,AAAA" x="0" y="0" width="30" height="15" preserveAspectRatio="none" transform="matrix(1 0 0 1 0 0)"/></pattern>',
    );
  });

  it('G12: text with a pattern reads it in the text’s own space (each placement its own)', () => {
    const text = { ...createText('A\nB', { x: 10, y: 10, size: 40 }), fill: pattern() };
    const svg = stageSvg(stageWith([text]));
    const fills = [...svg.matchAll(/<text [^>]*fill="url\(#(p\d)\)"/g)].map((m) => m[1]);
    expect(fills).toEqual(['p1', 'p1']);
    // The text's transform (to its box's centre) is taken off again: the tiles start at its
    // box's corner.
    const corner = `${-text.width / 2} ${-text.height / 2}`;
    expect(svg).toContain(`patternTransform="matrix(1 0 0 1 ${corner})"`);
    const curved = stageSvg(stageWith([{ ...text, text: 'AB', curve: 50 }]));
    expect(new Set([...curved.matchAll(/fill="url\(#(p\d)\)"/g)].map((m) => m[1])).size).toBe(2);
  });
});

describe('G12 the fill’s and the outline’s own opacity in the SVG', () => {
  const outline = { colour: '#000000', width: 2, dash: 'solid' as const };

  it('G12 (workbook: fill opacity 50 %): fill-opacity and stroke-opacity on the one path', () => {
    const svg = stageSvg(
      stageWith([
        box({ fill: { kind: 'solid', colour: '#B40000' }, fillOpacity: 50, stroke: outline }),
      ]),
    );
    expect(svg).toMatch(/<path d="[^"]+" fill="#B40000" fill-opacity="0.5" stroke="#000000"/);
    const both = stageSvg(
      stageWith([
        box({
          opacity: 50,
          fill: { kind: 'solid', colour: '#B40000' },
          fillOpacity: 50,
          stroke: { ...outline, opacity: 100 },
        }),
      ]),
    );
    expect(both).toMatch(/fill-opacity="0.25" stroke-opacity="0.5" stroke=/);
    const outlineOnly = stageSvg(
      stageWith([
        box({ fill: { kind: 'solid', colour: '#B40000' }, stroke: { ...outline, opacity: 40 } }),
      ]),
    );
    expect(outlineOnly).toMatch(/fill="#B40000" stroke-opacity="0.4" stroke=/);
  });

  it('G12: the same opacity for both stays one opacity (as before)', () => {
    const svg = stageSvg(
      stageWith([
        box({ opacity: 50, fill: { kind: 'solid', colour: '#B40000' }, stroke: outline }),
      ]),
    );
    expect(svg).toMatch(/fill="#B40000" opacity="0.5" stroke="#000000"/);
    expect(svg).not.toContain('fill-opacity');
  });
});

describe('G14 effects as SVG filters', () => {
  it('G14 (J/21 shield): a drop shadow: the object in a <g> with the filter, the shadow under it', () => {
    const svg = stageSvg(
      stageWith([
        box({
          filters: [{ kind: 'dropShadow', colour: '#000000', dx: 5, dy: 6, blur: 8, opacity: 50 }],
        }),
      ]),
    );
    expect(svg).toContain(
      '<filter id="f1" filterUnits="userSpaceOnUse" x="0" y="0" width="600" height="400" color-interpolation-filters="sRGB">' +
        '<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="r1b"/>' +
        '<feOffset in="r1b" dx="5" dy="6" result="r1o"/>' +
        '<feFlood flood-color="#000000" flood-opacity="0.5" result="r1c"/>' +
        '<feComposite in="r1c" in2="r1o" operator="in" result="r1s"/>' +
        '<feMerge result="r1"><feMergeNode in="r1s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    );
    expect(svg).toMatch(/<g filter="url\(#f1\)">\n<path [^>]+\/>\n<\/g>/);
  });

  it('G14 (O/N/24 halo, J/24 cake): glow, inner shadow, bevel and blur chain, each on the last', () => {
    const svg = stageSvg(
      stageWith([
        box({
          filters: [
            { kind: 'blur', radius: 3 },
            { kind: 'glow', colour: '#FFEE88', blur: 20, opacity: 90 },
            { kind: 'innerShadow', colour: '#000000', dx: 2, dy: 2, blur: 4, opacity: 60 },
            newFilter('bevel'),
          ],
        }),
      ]),
    );
    expect(svg).toContain('<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="r1"/>');
    // The glow: a shadow that is not moved, from the blurred shape.
    expect(svg).toContain('<feGaussianBlur in="r1" stdDeviation="10" result="r2b"/>');
    expect(svg).toContain('<feOffset in="r2b" dx="0" dy="0" result="r2o"/>');
    // The inner shadow: the outside, blurred and moved, kept inside the shape.
    expect(svg).toContain('<feComposite in="r3c" in2="r2" operator="out" result="r3i"/>');
    expect(svg).toContain('<feComposite in="r3o" in2="r2" operator="in" result="r3s"/>');
    // The bevel: its light, then its shade, each an inner shadow.
    expect(svg).toContain('<feFlood flood-color="#ffffff" flood-opacity="0.7" result="r4lc"/>');
    expect(svg).toContain('<feComposite in="r4lc" in2="r3" operator="out" result="r4li"/>');
    expect(svg).toContain('<feFlood flood-color="#000000" flood-opacity="0.7" result="r4c"/>');
    expect(svg).toContain('<feComposite in="r4c" in2="r4l" operator="out" result="r4i"/>');
    expect(svg).toContain('<feMerge result="r4"><feMergeNode in="r4l"/>');
  });

  it('G14: a group’s effects wrap the whole group; each object its own filter', () => {
    const group = {
      ...createGroup([box(), box({ x: 400 })]),
      filters: [newFilter('glow')],
    };
    const svg = stageSvg(stageWith([group, box({ filters: [newFilter('blur')] })]));
    expect(svg).toMatch(/<g filter="url\(#f1\)">\n<path [^>]+\/>\n<path [^>]+\/>\n<\/g>/);
    expect(svg).toContain('<g filter="url(#f2)">');
    expect(svg.match(/<filter /g)).toHaveLength(2);
  });
});

describe('G10 (M23): the stroke effect in the SVG', () => {
  it('G10 outside: the shape’s alpha grown by the width, filled with the colour, under the shape', () => {
    const svg = stageSvg(
      stageWith([
        box({
          filters: [
            { kind: 'stroke', colour: '#000000', width: 4, opacity: 80, position: 'outside' },
          ],
        }),
      ]),
    );
    expect(svg).toContain(
      '<feMorphology in="SourceGraphic" operator="dilate" radius="4" result="r1d"/>',
    );
    expect(svg).toContain('<feFlood flood-color="#000000" flood-opacity="0.8" result="r1c"/>');
    expect(svg).toContain('<feComposite in="r1c" in2="r1d" operator="in" result="r1s"/>');
    expect(svg).toContain(
      '<feMerge result="r1"><feMergeNode in="r1s"/><feMergeNode in="SourceGraphic"/></feMerge>',
    );
  });

  it('G10 inside: a ring inside the edge, over the shape; centred: half each way', () => {
    const inside = stageSvg(
      stageWith([
        box({
          filters: [
            { kind: 'stroke', colour: '#ff0000', width: 6, opacity: 100, position: 'inside' },
          ],
        }),
      ]),
    );
    expect(inside).toContain(
      '<feMorphology in="SourceGraphic" operator="erode" radius="6" result="r1e"/>',
    );
    expect(inside).toContain(
      '<feComposite in="r1c" in2="SourceGraphic" operator="in" result="r1f"/>',
    );
    expect(inside).toContain('<feComposite in="r1f" in2="r1e" operator="out" result="r1s"/>');
    expect(inside).toContain(
      '<feMerge result="r1"><feMergeNode in="SourceGraphic"/><feMergeNode in="r1s"/></feMerge>',
    );
    const centred = stageSvg(
      stageWith([
        box({
          filters: [
            { kind: 'stroke', colour: '#ff0000', width: 6, opacity: 100, position: 'centred' },
          ],
        }),
      ]),
    );
    expect(centred).toContain('operator="dilate" radius="3" result="r1d"');
    expect(centred).toContain('operator="erode" radius="3" result="r1e"');
    expect(centred).toContain('<feComposite in="r1f" in2="r1e" operator="out" result="r1s"/>');
  });
});
