// GV6 (M19): a small XML reader for SVG files, so core can open a given vector file (ChipLeg.svg)
// without a DOM. It reads elements, attributes, text, the five named entities, numbered
// characters and the entities a doctype declares (Illustrator's `&ns_svg;`), CDATA (a <style>),
// and skips comments, `<?xml?>` and other instructions. It is forgiving, as a browser showing an
// SVG is not: a stray `<` is text, an end tag closes the elements still open inside it, and the
// file may stop before the last elements are closed. Pure: no DOM.
import { EditError } from '../model/errors.ts';

export interface XmlElement {
  /** As written, with any prefix: "svg", "svg:rect", "inkscape:label". */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | { text: string };

export const isElement = (node: XmlNode): node is XmlElement => 'name' in node;

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** `&amp;`, `&#65;`, `&#x41;` and the doctype's own entities; an unknown one is left as written. */
function decode(text: string, entities: Readonly<Record<string, string>>): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z_][\w.-]*);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED[name] ?? entities[name] ?? whole;
  });
}

/** The entities a doctype's internal subset declares: <!ENTITY ns_svg "http://…">. */
function doctypeEntities(subset: string, into: Record<string, string>): void {
  const entity = /<!ENTITY\s+([\w.-]+)\s+(["'])([\s\S]*?)\2\s*>/g;
  for (let m = entity.exec(subset); m; m = entity.exec(subset)) into[m[1]!] = m[3]!;
}

const NAME = /[A-Za-z_:][\w:.-]*/y;
const ATTR = /\s*([A-Za-z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`/]+)))?/y;

/**
 * The document's root element. Throws an EditError when there is no element at all (not an
 * XML file).
 */
export function parseXml(source: string): XmlElement {
  const entities: Record<string, string> = {};
  const top: XmlElement = { name: '#document', attrs: {}, children: [] };
  const open: XmlElement[] = [top];
  const current = () => open[open.length - 1]!;
  const addText = (raw: string, decodeIt = true) => {
    if (raw === '') return;
    const text = decodeIt ? decode(raw, entities) : raw;
    const kids = current().children;
    const last = kids[kids.length - 1];
    if (last && !isElement(last)) last.text += text;
    else kids.push({ text });
  };
  let i = 0;
  const n = source.length;
  while (i < n) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      addText(source.slice(i));
      break;
    }
    addText(source.slice(i, lt));
    i = lt;
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i + 9);
      addText(source.slice(i + 9, end < 0 ? n : end), false);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (source.startsWith('<!', i)) {
      // A doctype, perhaps with an internal subset in [ … ] declaring entities.
      const bracket = source.indexOf('[', i);
      const close = source.indexOf('>', i);
      if (bracket >= 0 && (close < 0 || bracket < close)) {
        const subsetEnd = source.indexOf(']', bracket);
        doctypeEntities(source.slice(bracket, subsetEnd < 0 ? n : subsetEnd), entities);
        const end = subsetEnd < 0 ? -1 : source.indexOf('>', subsetEnd);
        i = end < 0 ? n : end + 1;
      } else i = close < 0 ? n : close + 1;
      continue;
    }
    if (source[i + 1] === '/') {
      NAME.lastIndex = i + 2;
      const name = NAME.exec(source)?.[0];
      const end = source.indexOf('>', i);
      i = end < 0 ? n : end + 1;
      // An end tag closes the elements still open inside it; one that matches nothing is ignored.
      const at = name ? open.map((e) => e.name).lastIndexOf(name) : -1;
      if (at > 0) open.length = at;
      continue;
    }
    NAME.lastIndex = i + 1;
    const name = NAME.exec(source)?.[0];
    if (!name) {
      // A lone "<" is text.
      addText('<');
      i += 1;
      continue;
    }
    const element: XmlElement = { name, attrs: {}, children: [] };
    let at = i + 1 + name.length;
    for (;;) {
      ATTR.lastIndex = at;
      const m = ATTR.exec(source);
      if (!m || m[0] === '') break;
      element.attrs[m[1]!] = decode(m[2] ?? m[3] ?? m[4] ?? '', entities);
      at = ATTR.lastIndex;
    }
    const end = source.indexOf('>', at);
    const selfClosing = end > 0 && source[end - 1] === '/';
    current().children.push(element);
    i = end < 0 ? n : end + 1;
    if (!selfClosing && end >= 0) open.push(element);
  }
  const root = top.children.find(isElement);
  if (!root) throw new EditError('This file is not an SVG picture.');
  return root;
}

/** All the text inside an element and its children, in order. */
export function textOf(element: XmlElement): string {
  return element.children.map((c) => (isElement(c) ? textOf(c) : c.text)).join('');
}
