import { headKeyOf } from '../layout/head';
import type { HeadElement } from '../layout/head';
import { HEAD_MARK, OWN_MARK } from './place-head';

// A keeper that was never handed an element never writes: two shells can share
// a page, and the one with nothing to say must not touch what the other wrote,
// nor what the page arrived with.
export type HeadKeeper = (elements: readonly HeadElement[] | undefined) => void;

type Away = { key: string; node: Element; before: Node | null };

const TAGS = ['title', 'meta', 'link'];

const keyOfNode = (node: Element): string | undefined => {
  const tag = TAGS.find((name) => name === node.tagName.toLowerCase());
  if (tag !== 'title' && tag !== 'meta' && tag !== 'link') return undefined;
  return headKeyOf({ tag, attributes: Object.fromEntries([...node.attributes].map((attribute) => [attribute.name, attribute.value])) });
};

export const createHeadKeeper = (doc: Document): HeadKeeper => {
  let mine: Element[] = [];
  let away: Away[] = [];
  let said: string | undefined;

  const built = (element: HeadElement): Element => {
    const node = doc.createElement(element.tag);
    for (const [name, value] of Object.entries(element.attributes)) node.setAttribute(name, value);
    node.setAttribute(HEAD_MARK, '');
    if (element.text !== undefined) node.textContent = element.text;
    return node;
  };

  const adopt = (): void => {
    mine = [...doc.head.querySelectorAll(`[${HEAD_MARK}]`)];
    // The document's own window, not the global: a page's document is not always
    // the one this code was loaded in.
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

    for (const node of [...doc.head.children]) {
      const key = keyOfNode(node);
      if (key === undefined || !keys.has(key)) continue;
      away.push({ key, node, before: node.nextSibling });
      node.remove();
    }
    // The last to leave goes back first: what stood after an earlier one may have
    // left after it, and has to be standing again for the earlier one to go in front of it.
    const [back, still] = [away.filter((gone) => !keys.has(gone.key)), away.filter((gone) => keys.has(gone.key))];
    for (const gone of [...back].reverse()) doc.head.insertBefore(gone.node, gone.before !== null && gone.before.parentNode === doc.head ? gone.before : null);
    away = still;

    doc.head.append(...mine);
  };
};
