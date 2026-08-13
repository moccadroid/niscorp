import { isArray, isObject } from '../shared/common';
import type { ActionDefinition } from '../action';
import type { LayoutNode } from '../layout';
import { isPhrase, matcherFor } from './phrases';
import type { PhraseKeys } from './phrases';

// ═══════════════════════════════════════════════════════════
// harvest — read every phrase an action could put on a screen, without
// running it.
//
// The other half of the late pass. Keying a dictionary on source strings only
// works if there is a mechanical way to enumerate them; otherwise "translate
// the app" means a human reading every layout, and the second language is
// permanently 90% done.
//
// This walks the AUTHORED artifacts — definitions and layouts — not a rendered
// tree, and that is the point: what comes back is exactly the set of strings a
// person wrote, never a value that arrived from the database. A member called
// "Pass" can therefore never enter the dictionary by being on screen the day
// somebody ran the harvest.
// ═══════════════════════════════════════════════════════════

export type HarvestedPhrase = {
  phrase: string;
  /** Every author site it came from — sorted, deduped. */
  where: readonly string[];
};

type Sink = {
  add: (phrase: string, where: string) => void;
  isProse: (key: string) => boolean;
  text: boolean;
};

const sinkInto = (found: Map<string, Set<string>>, keys: PhraseKeys | undefined): Sink => {
  const matcher = matcherFor(keys);
  return {
    add: (phrase, where) => {
      const trimmed = phrase.trim();
      if (!isPhrase(trimmed)) return;
      const sites = found.get(trimmed);
      if (sites === undefined) found.set(trimmed, new Set([where]));
      else sites.add(where);
    },
    isProse: matcher.isProse,
    text: matcher.text,
  };
};

// Inside an allowlisted prop, EVERY reachable literal is a phrase. A `label`
// holding `{ $if: …, $then: 'Save', $else: 'Create' }` has two of them, and a
// harvester that only accepted a direct string would silently drop the branch
// nobody was looking at.
const harvestWithin = (value: unknown, where: string, sink: Sink): void => {
  if (typeof value === 'string') {
    sink.add(value, where);
    return;
  }
  if (isArray(value)) {
    value.forEach((entry, index) => harvestWithin(entry, `${where}[${String(index)}]`, sink));
    return;
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) harvestWithin(entry, `${where}.${key}`, sink);
  }
};

const harvestProps = (props: Record<string, unknown>, where: string, sink: Sink): void => {
  for (const [key, value] of Object.entries(props)) {
    if (sink.isProse(key)) {
      harvestWithin(value, `${where}.${key}`, sink);
      continue;
    }
    // Not a prose key itself — but a nested object under it may hold one
    // (`cell: { label }` inside a column spec). Keep descending; only the KEY
    // decides, never the depth.
    if (isObject(value) || isArray(value)) harvestNested(value, `${where}.${key}`, sink);
  }
};

const harvestNested = (value: unknown, where: string, sink: Sink): void => {
  if (isArray(value)) {
    value.forEach((entry, index) => harvestNested(entry, `${where}[${String(index)}]`, sink));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (sink.isProse(key)) harvestWithin(entry, `${where}.${key}`, sink);
    else harvestNested(entry, `${where}.${key}`, sink);
  }
};

// Takes `unknown` rather than `LayoutNode`: the walk discriminates the node
// kinds structurally, and narrowing a union by `in` checks fights the compiler
// for no benefit here — every branch reads what it needs and guards it.
const harvestNode = (node: unknown, where: string, sink: Sink): void => {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    // A text position: the layout's literal children.
    if (sink.text) sink.add(node, where);
    return;
  }
  if (typeof node === 'number' || typeof node === 'boolean') return;
  if (isArray(node)) {
    node.forEach((child, index) => harvestNode(child, `${where}[${String(index)}]`, sink));
    return;
  }
  if (!isObject(node)) return;

  const component = node['component'];
  if (component === undefined) {
    // A stored-layout reference and a fragment slot are ids, never words.
    if ('ref' in node || 'slot' in node) return;
    if ('if' in node) {
      harvestNode(node['then'], `${where}.then`, sink);
      harvestNode(node['else'], `${where}.else`, sink);
      return;
    }
    if ('for' in node && 'do' in node) {
      harvestNode(node['do'], `${where}.do`, sink);
      return;
    }
    return;
  }

  const at = `${where}/${String(component)}`;
  const props = node['props'];
  if (isObject(props)) harvestProps(props, at, sink);
  harvestNode(node['children'], `${at}.children`, sink);
};

const toList = (found: Map<string, Set<string>>): HarvestedPhrase[] =>
  [...found.entries()]
    .map(([phrase, sites]) => ({ phrase, where: [...sites].sort() }))
    .sort((a, b) => a.phrase.localeCompare(b.phrase));

export const harvestLayout = (layout: LayoutNode, keys?: PhraseKeys): HarvestedPhrase[] => {
  const found = new Map<string, Set<string>>();
  harvestNode(layout, '', sinkInto(found, keys));
  return toList(found);
};

// A `{ set: '<key>', value: '<literal>' }` step writes words into data, and
// data lands in props. An error message a trigger sets is as much product copy
// as a heading, and is otherwise invisible to a harvester that only reads
// layouts.
const harvestSteps = (value: unknown, where: string, sink: Sink): void => {
  if (isArray(value)) {
    value.forEach((entry, index) => harvestSteps(entry, `${where}[${String(index)}]`, sink));
    return;
  }
  if (!isObject(value)) return;
  const target = value['set'];
  const written = value['value'];
  if (typeof target === 'string' && typeof written === 'string') sink.add(written, `${where}.set:${target}`);
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'set' || key === 'value') continue;
    harvestSteps(entry, `${where}.${key}`, sink);
  }
};

export const harvestDefinition = (definition: ActionDefinition, keys?: PhraseKeys): HarvestedPhrase[] => {
  const found = new Map<string, Set<string>>();
  const sink = sinkInto(found, keys);
  const id = definition.id;

  // The title is chrome's words — a Sheet header, a catalog entry — and reaches
  // the tree as a prop rather than from the layout.
  if (typeof definition.title === 'string') sink.add(definition.title, `${id}.title`);

  // Defaulted data is a screen's opening text: the 'Stock' in a theme name, the
  // placeholder a list shows before its first read lands.
  for (const [key, value] of Object.entries(definition.data ?? {})) {
    if (typeof value === 'string') sink.add(value, `${id}.data.${key}`);
  }

  if (definition.layout !== undefined) harvestNode(definition.layout, id, sink);
  if (definition.triggers !== undefined) harvestSteps(definition.triggers, `${id}.triggers`, sink);
  if (definition.lifecycle !== undefined) harvestSteps(definition.lifecycle, `${id}.lifecycle`, sink);

  return toList(found);
};

export const harvestDefinitions = (
  definitions: Record<string, ActionDefinition>,
  keys?: PhraseKeys,
): HarvestedPhrase[] => {
  const found = new Map<string, Set<string>>();
  for (const definition of Object.values(definitions)) {
    for (const entry of harvestDefinition(definition, keys)) {
      const sites = found.get(entry.phrase);
      if (sites === undefined) found.set(entry.phrase, new Set(entry.where));
      else for (const site of entry.where) sites.add(site);
    }
  }
  return toList(found);
};

/** Phrases with no entry in the book — what a language is still missing. */
export const missingFrom = (
  harvested: readonly HarvestedPhrase[],
  phrases: Readonly<Record<string, string>>,
): HarvestedPhrase[] => harvested.filter((entry) => phrases[entry.phrase] === undefined);
