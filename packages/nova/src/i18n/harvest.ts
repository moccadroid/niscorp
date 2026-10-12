import { isArray, isObject } from '../shared/common';
import type { ActionDefinition } from '../action';
import type { LayoutNode } from '../layout';
import { isPhrase, matcherFor } from './phrases';
import type { PhraseKeys } from './phrases';

export type HarvestedPhrase = {
  phrase: string;
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

// Under a prose key every reachable literal is a phrase: a `label` holding
// `{ $if: …, $then: 'Save', $else: 'Create' }` has two.
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

// `unknown` rather than `LayoutNode`: narrowing that union by `in` checks fights
// the compiler, and every branch guards what it reads.
const harvestNode = (node: unknown, where: string, sink: Sink): void => {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
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

  if (typeof definition.title === 'string') sink.add(definition.title, `${id}.title`);

  // A top-level string is taken whatever its key: where it lands decides whether
  // it is prose, and only the layout knows that. Nested values go by the matcher,
  // so `views: [{ value: 'running', label: 'Running' }]` yields `Running` alone.
  for (const [key, value] of Object.entries(definition.data ?? {})) {
    if (typeof value === 'string') sink.add(value, `${id}.data.${key}`);
    else if (isObject(value) || isArray(value)) harvestNested(value, `${id}.data.${key}`, sink);
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

export const missingFrom = (
  harvested: readonly HarvestedPhrase[],
  phrases: Readonly<Record<string, string>>,
): HarvestedPhrase[] => harvested.filter((entry) => phrases[entry.phrase] === undefined);
