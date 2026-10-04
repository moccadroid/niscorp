import { headKeyOf } from '../layout/head';
import type { HeadElement } from '../layout/head';
import { HEAD_MARK, OWN_MARK } from './place-head';

// ═══════════════════════════════════════════════════════════
// A page's <head>, kept on the screen.
//
// A drawn page arrives with its head written (`placeHead`). From then on the
// shell is live and the screen moves without the page being fetched again, so
// the head is kept on whatever the screen says now: its elements are put in
// `document.head`, and taken out again when the screen stops saying them.
//
// THE DOCUMENT'S OWN TAGS GIVE WAY AND COME BACK. A tag the page was written
// with — the title in index.html, its description — is taken out while the
// screen says the same thing itself, and put back where it stood when the
// screen no longer does. A drawn page has already given some up: they arrive
// inert, in the <template data-nova-own> the writer left, and come back the
// same way.
//
// A KEEPER THAT WAS NEVER HANDED AN ELEMENT NEVER WRITES. Two shells can share
// a page (an inspector beside the app), and the one with nothing to say must
// not touch what the other wrote — nor what the page arrived with.
// ═══════════════════════════════════════════════════════════

export type HeadKeeper = (elements: readonly HeadElement[] | undefined) => void;

type Away = { key: string; node: Element; before: Node | null };

const TAGS = ['title', 'meta', 'link'];

// What a tag standing in the page says, in the same terms as an element.
const keyOfNode = (node: Element): string | undefined => {
  const tag = TAGS.find((name) => name === node.tagName.toLowerCase());
  if (tag !== 'title' && tag !== 'meta' && tag !== 'link') return undefined;
  return headKeyOf({ tag, attributes: Object.fromEntries([...node.attributes].map((attribute) => [attribute.name, attribute.value])) });
};

export const createHeadKeeper = (doc: Document): HeadKeeper => {
  // the screen's elements standing in the head
  let mine: Element[] = [];
  // the document's own tags that have given up their place
  let away: Away[] = [];
  let said: string | undefined;

  const built = (element: HeadElement): Element => {
    const node = doc.createElement(element.tag);
    for (const [name, value] of Object.entries(element.attributes)) node.setAttribute(name, value);
    node.setAttribute(HEAD_MARK, '');
    if (element.text !== undefined) node.textContent = element.text;
    return node;
  };

  // What the page arrived with: the elements a writer put there for the first
  // screen, and the tags that gave way to them.
  const adopt = (): void => {
    mine = [...doc.head.querySelectorAll(`[${HEAD_MARK}]`)];
    // the document's own window, not a global: a page's document is not always
    // the one the code was loaded in
    const view = doc.defaultView;
    for (const stash of doc.head.querySelectorAll(`template[${OWN_MARK}]`)) {
      if (view === null || !(stash instanceof view.HTMLTemplateElement)) continue;
      for (const child of [...stash.content.children]) {
        const key = keyOfNode(child);
        if (key !== undefined) away.push({ key, node: doc.importNode(child, true), before: null });
      }
      stash.remove();
    }
  };

  return (elements) => {
    const now = elements ?? [];
    const next = JSON.stringify(now);
    if (said === undefined) {
      if (now.length === 0) return;
      adopt();
    }
    if (next === said) return;
    said = next;

    for (const node of mine) node.remove();
    mine = now.map(built);
    const keys = new Set(now.flatMap((element) => headKeyOf(element) ?? []));

    // the document's own that now say what the screen says: out, each remembering where it stood
    for (const node of [...doc.head.children]) {
      const key = keyOfNode(node);
      if (key === undefined || !keys.has(key)) continue;
      away.push({ key, node, before: node.nextSibling });
      node.remove();
    }
    // Those the screen no longer says: back where each stood. The last to leave
    // goes back first — what stood after an earlier one may have left after it,
    // and has to be standing again for the earlier one to go in front of it.
    const [back, still] = [away.filter((gone) => !keys.has(gone.key)), away.filter((gone) => keys.has(gone.key))];
    for (const gone of [...back].reverse()) doc.head.insertBefore(gone.node, gone.before !== null && gone.before.parentNode === doc.head ? gone.before : null);
    away = still;

    doc.head.append(...mine);
  };
};
