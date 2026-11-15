// GV6 (M19): the small XML reader under SVG import — elements, attributes, text, entities, CDATA,
// comments, instructions and doctypes, and forgiving of files a browser would still show.
import { describe, expect, it } from 'vitest';
import { isElement, parseXml, textOf, type XmlElement } from '../../../../src/core/graphics/xml.ts';
import { EditError } from '../../../../src/core/model/errors.ts';

const kids = (e: XmlElement) => e.children.filter(isElement);

describe('GV6: parseXml', () => {
  it('reads elements, attributes in either quotes and self-closing tags', () => {
    const root = parseXml(
      `<?xml version="1.0"?>\n<svg width="10" height='20'><g id="a"><rect x="1"/></g><circle/></svg>`,
    );
    expect(root.name).toBe('svg');
    expect(root.attrs).toEqual({ width: '10', height: '20' });
    expect(kids(root).map((e) => e.name)).toEqual(['g', 'circle']);
    expect(kids(kids(root)[0]!)[0]).toEqual({ name: 'rect', attrs: { x: '1' }, children: [] });
  });

  it('keeps prefixes and reads unquoted values and bare attributes', () => {
    const root = parseXml(
      '<svg:svg xmlns:svg="x"><svg:rect inkscape:label=Leg hidden /></svg:svg>',
    );
    expect(root.name).toBe('svg:svg');
    expect(kids(root)[0]!.attrs).toEqual({ 'inkscape:label': 'Leg', hidden: '' });
  });

  it('decodes the named entities, numbered characters and a doctype’s own entities', () => {
    const root = parseXml(
      `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd" [
         <!ENTITY ns_svg "http://www.w3.org/2000/svg">
       ]>
       <svg xmlns="&ns_svg;"><text a="&lt;&amp;&gt;">Fish &amp; chips &#65;&#x42; &quot;&apos; &nope;</text></svg>`,
    );
    expect(root.attrs.xmlns).toBe('http://www.w3.org/2000/svg');
    const text = kids(root)[0]!;
    expect(text.attrs.a).toBe('<&>');
    expect(textOf(text)).toBe(`Fish & chips AB "' &nope;`);
  });

  it('leaves impossible character numbers as written', () => {
    expect(textOf(parseXml('<t>&#0;&#x110000;</t>'))).toBe('&#0;&#x110000;');
  });

  it('skips comments and instructions, keeps CDATA as it is, and joins the text around them', () => {
    const root = parseXml(
      '<svg><!-- a <rect/> in a comment --><style><![CDATA[.a{fill:red} a&amp;b]]></style>x<?pi?>y</svg>',
    );
    expect(kids(root).map((e) => e.name)).toEqual(['style']);
    expect(textOf(kids(root)[0]!)).toBe('.a{fill:red} a&amp;b');
    expect(root.children.at(-1)).toEqual({ text: 'xy' });
  });

  it('reads a doctype without a subset', () => {
    expect(parseXml('<!DOCTYPE svg><svg/>').name).toBe('svg');
  });

  it('forgives: a lone < is text, an end tag closes what is open inside it, stray end tags and an unfinished file', () => {
    const root = parseXml('<svg><g><rect></g>a < b</nothing><circle');
    const g = kids(root)[0]!;
    expect(kids(g).map((e) => e.name)).toEqual(['rect']);
    expect(textOf(root)).toBe('a < b');
    expect(kids(root).map((e) => e.name)).toEqual(['g', 'circle']);
    expect(parseXml('<svg><!-- never closed').name).toBe('svg');
    expect(parseXml('<svg><![CDATA[never closed').children).toEqual([{ text: 'never closed' }]);
    expect(parseXml('<svg><?pi never closed').name).toBe('svg');
    expect(parseXml('<svg><!DOCTYPE never closed').name).toBe('svg');
    expect(parseXml('<!DOCTYPE x [ <!ENTITY a "b"> ]> <svg/>').name).toBe('svg');
    // A doctype whose subset never ends swallows the rest.
    expect(() => parseXml('<!DOCTYPE x [ <!ENTITY a "b"> <svg/>')).toThrow(EditError);
    expect(() => parseXml('<!DOCTYPE x [ <!ENTITY a "b"> ] <svg/>')).toThrow(EditError);
  });

  it('refuses a file with no element at all', () => {
    expect(() => parseXml('just words')).toThrow(EditError);
    expect(() => parseXml('')).toThrow('This file is not an SVG picture.');
  });
});
