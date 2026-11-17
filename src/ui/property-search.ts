// Property search (the teacher's request, 2026-11-15, as Roblox Studio's Properties filter): a box
// at the top of a property panel — Video's Inspector, Audio's side panel, Animation's and
// Graphics' Properties — shows only the settings whose words match what is typed. It reads the
// panel as drawn, so every panel gets it without listing its settings twice: a section (a
// <section> or .sec, its heading an h3 / h4) holds rows (a field, a checkbox, a line of buttons,
// a row of choices, a table row). A section whose heading matches shows whole; otherwise only its
// matching rows show; a section with none is hidden. What is not in a section stays.
import type { Attachment } from 'svelte/attachments';

const SECTION = 'section, .sec';
const ROW = [
  '.field',
  '.check',
  '.toggle',
  'label:has(> input[type="checkbox"])',
  '.line',
  '.row',
  '[role="radiogroup"]',
  '[role="group"]',
  'tr',
].join(', ');
const HEADING = 'h3, h4';
export const FILTERED = 'data-filtered';

/** The words a reader finds a setting by: its text, and the names of its icon buttons. */
function wordsOf(el: Element): string {
  const named = [el, ...el.querySelectorAll('[aria-label], [title]')].flatMap((e) => [
    e.getAttribute('aria-label') ?? '',
    e.getAttribute('title') ?? '',
  ]);
  return `${el.textContent ?? ''} ${named.join(' ')}`.toLowerCase();
}

/** The outermost elements matching `selector` inside `root` (not inside another match). */
function outermost(root: Element, selector: string): Element[] {
  return [...root.querySelectorAll(selector)].filter((el) => {
    const outer = el.parentElement?.closest(selector);
    return !outer || !root.contains(outer);
  });
}

/**
 * Hides (with the data-filtered attribute) what does not match `query` in the panel `root`;
 * returns how many settings show, or −1 when the query is empty (everything shows).
 */
export function filterProperties(root: Element, query: string): number {
  for (const el of root.querySelectorAll(`[${FILTERED}]`)) el.removeAttribute(FILTERED);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return -1;
  const matches = (el: Element) => {
    const text = wordsOf(el);
    return words.every((w) => text.includes(w));
  };
  const hide = (el: Element) => el.setAttribute(FILTERED, '');
  let found = 0;
  for (const section of outermost(root, SECTION)) {
    const heading = section.querySelector(HEADING);
    const rows = outermost(section, ROW);
    if (heading && matches(heading)) {
      found += Math.max(1, rows.length);
      continue;
    }
    const shown = rows.filter(matches);
    if (shown.length === 0) {
      hide(section);
      continue;
    }
    found += shown.length;
    for (const row of rows) if (!shown.includes(row)) hide(row);
    // Whatever else is in the section (hints, notes, "Why use this?") shows only when it holds a
    // matching setting; the heading stays, to say where the setting is.
    const keep = (el: Element): void => {
      for (const child of el.children) {
        if (child === heading || child.contains(heading)) {
          if (child !== heading) keep(child);
          continue;
        }
        if (rows.includes(child)) continue;
        if (shown.some((r) => child.contains(r))) keep(child);
        else hide(child);
      }
    };
    keep(section);
  }
  return found;
}

/**
 * The search on a panel: filters it now, and again whenever its contents change (another object
 * selected, a section opened), telling `report` how many settings show.
 */
export function propertyFilter(query: string, report: (found: number) => void): Attachment {
  return (node) => {
    let queued = false;
    // A run queued before this search ended (a new one started) must not undo the new one.
    let stopped = false;
    const run = () => {
      queued = false;
      if (!stopped) report(filterProperties(node, query));
    };
    run();
    // Only added or removed elements and changed words: our own attribute is not watched.
    const watch = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(run);
    });
    watch.observe(node, { childList: true, subtree: true, characterData: true });
    return () => {
      stopped = true;
      watch.disconnect();
      filterProperties(node, '');
    };
  };
}
