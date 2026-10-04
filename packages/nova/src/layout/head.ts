// ═══════════════════════════════════════════════════════════
// THE HEAD — `nova:head` is the document's <head>, as a node in a layout.
//
// A document has a part nobody sees on the screen: its title, the sentence
// that describes it, the card shown where a link to it is pasted. That part
// is written the way the rest of the screen is — a layout node, its children
// bound to the action's data — and travels the way the rest does, in the
// render tree.
//
// Its children are the elements a head holds, named as HTML names them:
// `nova:title`, `nova:meta`, `nova:link`, `nova:script`. A child's props are
// that element's ATTRIBUTES, written as given. Nova keeps no list of them, so
// any `name`, `property` or `rel` there is — or will be — can be said without
// nova learning it.
//
// Nothing here is drawn on the screen. No adapter builds an element for a head
// or for anything in it, and no registry has to hold the names. Whoever writes
// the document reads the elements off the tree (`headOf`) and writes them into
// its <head>.
//
// WHAT A HEAD DOES NOT HOLD is what runs or styles: a script that executes, a
// stylesheet, a <base>, an instruction to the browser (`http-equiv`), a handler
// attribute. A layout is data, and data that reaches every page must not be
// able to run. Those stay in the app's own index.html, which holds anything.
//
// This file holds no schema on purpose: a terminal that only reads a head off
// the wire needs the names and the shape, and nothing to validate with.
// ═══════════════════════════════════════════════════════════

// Namespaced as a package's own in-layout components are (`loom:field`), so
// none can be a name an app's kit already uses for something else.
export const HEAD_NAME = 'nova:head';
export const HEAD_TITLE_NAME = 'nova:title';
export const HEAD_META_NAME = 'nova:meta';
export const HEAD_LINK_NAME = 'nova:link';
export const HEAD_SCRIPT_NAME = 'nova:script';

// The head and what it holds: the names a layout may use with no registry
// entry behind them.
export const HEAD_NAMES: readonly string[] = [HEAD_NAME, HEAD_TITLE_NAME, HEAD_META_NAME, HEAD_LINK_NAME, HEAD_SCRIPT_NAME];

// One element of a head, as data: what to write, wherever a head is written.
export type HeadElement = {
  tag: 'title' | 'meta' | 'link' | 'script';
  // as the layout gave them, in the order it gave them
  attributes: Record<string, string>;
  // a title's words; a script's data, as JSON
  text?: string;
};

// What two elements both say, when they say the same thing — the later one
// then takes the earlier one's place. A document has one title, one <meta> of
// a given name or property, one canonical address. Anything else stands beside
// its like: two alternates, two data blocks.
export const headKeyOf = (element: Pick<HeadElement, 'tag' | 'attributes'>): string | undefined => {
  const said = (name: string): string | undefined => {
    const found = Object.entries(element.attributes).find(([key]) => key.toLowerCase() === name)?.[1].trim().toLowerCase();
    return found === undefined || found === '' ? undefined : found;
  };
  if (element.tag === 'title') return 'title';
  if (element.tag === 'meta') {
    const [name, property] = [said('name'), said('property')];
    if (name !== undefined) return `meta name ${name}`;
    return property === undefined ? undefined : `meta property ${property}`;
  }
  if (element.tag === 'link') return (said('rel') ?? '').split(/\s+/).includes('canonical') ? 'link canonical' : undefined;
  return undefined;
};
