import { HEAD_LINK_NAME, HEAD_META_NAME, HEAD_NAME, HEAD_SCRIPT_NAME, HEAD_TITLE_NAME, headKeyOf } from '../layout/head';
import type { HeadElement } from '../layout/head';
import type { RenderNode } from '../layout';
import type { RenderApi } from './types';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from './slot-names';

// ═══════════════════════════════════════════════════════════
// The head a screen has, read off its render tree.
//
// The frame is walked in the order it is drawn, into each canvas where its
// slot stands and into each instance on it, and every `nova:head` it meets
// gives its elements in turn. A screen can hold more than one head — the
// shell's chrome says what holds on every screen, an action says its own, a
// dialog opens over a page. An element that says the same thing as an earlier
// one (the title, a <meta> of that name) takes its place; anything else stands
// beside what came before.
//
// What a head may not hold is refused here, once, for every writer: the
// element is left out and the reason is given. See ../layout/head.
// ═══════════════════════════════════════════════════════════

export type ScreenHead = {
  // what the document's head is to hold, in the order the screen said it
  elements: HeadElement[];
  // the actions whose instances said any of it (none: only the shell's chrome did)
  actions: string[];
  // what a head held that it may not — left out, each with why
  refused: string[];
};

type ComponentNode = Extract<RenderNode, { type: 'component' }>;
type Read = { element: HeadElement } | { refused: string } | undefined;

const ATTRIBUTE_NAME = /^[A-Za-z][A-Za-z0-9:._-]*$/;
// a data block: a type no browser runs
const DATA_TYPE = /^application\/([a-z0-9.-]+\+)?json$/i;

// A prop, as the attribute it is written as — or nothing, when it says nothing.
const written = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (typeof value === 'number') return String(value);
  return value === true ? '' : undefined;
};

// An element's attributes, from its props — or why it may not be written.
const attributesOf = (what: string, props: Record<string, unknown>, skip: readonly string[] = []): { attributes: Record<string, string> } | { refused: string } => {
  const attributes: Record<string, string> = {};
  for (const [name, value] of Object.entries(props)) {
    if (skip.includes(name)) continue;
    if (!ATTRIBUTE_NAME.test(name)) return { refused: `${what}: "${name}" is not an attribute’s name` };
    if (/^on/i.test(name)) return { refused: `${what}: \`${name}\` is a handler, and a layout does not run` };
    const text = written(value);
    if (text !== undefined) attributes[name] = text;
  }
  return { attributes };
};

const has = (attributes: Record<string, string>, name: string): boolean => Object.keys(attributes).some((key) => key.toLowerCase() === name);
const valueOf = (attributes: Record<string, string>, name: string): string => Object.entries(attributes).find(([key]) => key.toLowerCase() === name)?.[1] ?? '';

const textOf = (nodes: readonly RenderNode[]): string =>
  nodes.map((node) => (node.type === 'text' ? node.value : node.type === 'fragment' ? textOf(node.children) : '')).join('');

const titleOf = (node: ComponentNode): Read => {
  const text = textOf(node.children).trim();
  return text === '' ? undefined : { element: { tag: 'title', attributes: {}, text } };
};

const metaOf = (node: ComponentNode): Read => {
  const read = attributesOf(HEAD_META_NAME, node.props);
  if ('refused' in read) return read;
  if (has(read.attributes, 'http-equiv')) return { refused: `${HEAD_META_NAME}: \`http-equiv\` instructs the browser, and a layout does not` };
  // nothing to say yet: its value is not answered
  return has(read.attributes, 'content') ? { element: { tag: 'meta', attributes: read.attributes } } : undefined;
};

const linkOf = (node: ComponentNode): Read => {
  const read = attributesOf(HEAD_LINK_NAME, node.props);
  if ('refused' in read) return read;
  if (valueOf(read.attributes, 'rel').toLowerCase().split(/\s+/).includes('stylesheet')) return { refused: `${HEAD_LINK_NAME}: a stylesheet styles the page, and a layout does not` };
  return has(read.attributes, 'href') ? { element: { tag: 'link', attributes: read.attributes } } : undefined;
};

const scriptOf = (node: ComponentNode): Read => {
  const read = attributesOf(HEAD_SCRIPT_NAME, node.props, ['data']);
  if ('refused' in read) return read;
  if (has(read.attributes, 'src')) return { refused: `${HEAD_SCRIPT_NAME}: a script with a \`src\` runs, and a layout does not` };
  const type = valueOf(read.attributes, 'type');
  if (!DATA_TYPE.test(type)) return { refused: `${HEAD_SCRIPT_NAME}: only a data block may be written (a JSON \`type\`), and "${type}" is not one` };
  const data = node.props['data'];
  if (data === undefined || data === null || data === '') return undefined;
  return { element: { tag: 'script', attributes: read.attributes, text: JSON.stringify(data) } };
};

const READERS: Record<string, (node: ComponentNode) => Read> = {
  [HEAD_TITLE_NAME]: titleOf,
  [HEAD_META_NAME]: metaOf,
  [HEAD_LINK_NAME]: linkOf,
  [HEAD_SCRIPT_NAME]: scriptOf,
};

export const isHeadNode = (node: RenderNode): boolean => node.type === 'component' && node.name === HEAD_NAME;

export const headOf = (api: Pick<RenderApi, 'frame' | 'canvasTree'>): ScreenHead | undefined => {
  let heads = 0;
  const said: { element: HeadElement; action: string | undefined }[] = [];
  const refused: string[] = [];
  // a canvas whose own tree names it again would never end
  const open = new Set<string>();

  const hold = (nodes: readonly RenderNode[], action: string | undefined): void => {
    for (const node of nodes) {
      if (node.type === 'fragment') {
        hold(node.children, action);
        continue;
      }
      if (node.type === 'error') {
        refused.push(`${HEAD_NAME}: ${node.message}`);
        continue;
      }
      // text between a head's elements is nothing
      if (node.type !== 'component') continue;
      const read = READERS[node.name];
      if (read === undefined) {
        refused.push(`${HEAD_NAME}: "${node.name}" is not something a head holds`);
        continue;
      }
      const found = read(node);
      if (found === undefined) continue;
      if ('refused' in found) {
        refused.push(found.refused);
        continue;
      }
      const key = headKeyOf(found.element);
      const earlier = key === undefined ? -1 : said.findIndex((other) => headKeyOf(other.element) === key);
      if (earlier >= 0) said.splice(earlier, 1);
      said.push({ element: found.element, action });
    }
  };

  const walk = (nodes: readonly RenderNode[], action: string | undefined): void => {
    for (const node of nodes) {
      if (node.type === 'fragment') {
        walk(node.children, action);
        continue;
      }
      if (node.type !== 'component') continue;
      if (node.name === HEAD_NAME) {
        heads += 1;
        hold(node.children, action);
        continue;
      }
      if (node.name === CANVAS_SLOT_NAME) {
        const canvasId = node.props['canvasId'];
        if (typeof canvasId !== 'string' || canvasId === '' || open.has(canvasId)) continue;
        open.add(canvasId);
        walk(api.canvasTree(canvasId), undefined);
        open.delete(canvasId);
        continue;
      }
      const definitionId = node.name === ACTION_SLOT_NAME ? node.props['definitionId'] : undefined;
      walk(node.children, typeof definitionId === 'string' ? definitionId : action);
    }
  };

  walk(api.frame(), undefined);
  if (heads === 0) return undefined;
  const actions = [...new Set(said.flatMap((one) => (one.action === undefined ? [] : [one.action])))];
  return { elements: said.map((one) => one.element), actions, refused };
};
