import { isArray, isObject } from '../shared/common';
import type { RenderNode } from '../layout';
import { isPhrase, matcherFor } from './phrases';
import type { PhraseKeys, Phrasebook } from './phrases';

// ═══════════════════════════════════════════════════════════
// translateRenderTree — the late pass.
//
// Structure in, same structure out, with prose swapped. It runs AFTER
// `flattenRenderTree` and before serialization, which is the one point where
// every word the reader will see is present at once: layout literals, action
// titles that arrived as props, component fallbacks, and the closed-set display
// fields a query manufactured.
//
// A phrase with no entry passes through unchanged. That is the only sane
// failure: a missing translation should show the source language, never an
// empty box and never a key. `onMiss` is how a check turns those into a list.
// ═══════════════════════════════════════════════════════════

export type TranslateOptions = {
  phrases: Phrasebook;
  keys?: PhraseKeys;
  // Called once per untranslated phrase, with where it was found. For a dev
  // check that has to answer "what did we forget" without a human reading every
  // screen. Never call it from a hot path — it is a reporting seam.
  onMiss?: (phrase: string, where: string) => void;
};

type Pass = {
  phrases: Phrasebook;
  isProse: (key: string) => boolean;
  text: boolean;
  onMiss: ((phrase: string, where: string) => void) | undefined;
};

const swap = (value: string, where: string, pass: Pass): string => {
  if (!isPhrase(value)) return value;
  const hit = pass.phrases[value];
  if (hit !== undefined) return hit;
  // Trailing/leading whitespace is a layout accident, not part of the phrase.
  // Trying the trimmed form keeps `'Save '` from being a second dictionary
  // entry nobody remembers to fill in.
  const trimmed = value.trim();
  if (trimmed !== value) {
    const onTrimmed = pass.phrases[trimmed];
    if (onTrimmed !== undefined) return value.replace(trimmed, onTrimmed);
  }
  pass.onMiss?.(trimmed, where);
  return value;
};

// A PATTERN: a counted phrase, translated WHOLE and filled here — the one
// point that has the book. `{ phrase: '{n} of {total}', slots: { n: 1,
// total: 12 } }` becomes `'1 von 12'`: the pattern is a dictionary row like
// any other, so cardinality stays out of the book. A string slot is offered
// to the book too — a composed sentence's fragments ("somebody enquires")
// are vocabulary in their own right — and everything else interpolates as
// itself. Sessions in the source language never reach this code (the empty
// book skips the walk), so the host's kit fills the same shape at the glass.
const isPattern = (value: Record<string, unknown>): value is { phrase: string; slots: Record<string, unknown> } =>
  typeof value['phrase'] === 'string' && isObject(value['slots']);

const fillPattern = (pattern: { phrase: string; slots: Record<string, unknown> }, where: string, pass: Pass): string =>
  swap(pattern.phrase, where, pass).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (hole, name: string) => {
    const slot = pattern.slots[name];
    if (slot === undefined || slot === null) return hole;
    return typeof slot === 'string' && isPhrase(slot) ? swap(slot, `${where}.${name}`, pass) : String(slot);
  });

// Walk a prop VALUE. Depth matters: a spec prop is where the repeated structure
// of a screen lives (`columns: [{ label }]`, `options: [{ label }]`), so the
// rule cannot be "top-level props only" without missing most of a table.
const walkValue = (value: unknown, prose: boolean, where: string, pass: Pass): unknown => {
  if (typeof value === 'string') return prose ? swap(value, where, pass) : value;
  if (isArray(value)) {
    let changed = false;
    const out = value.map((entry, index) => {
      // An array inherits its key's proseness — `options: ['Yes', 'No']` is as
      // much prose as `options: [{ label: 'Yes' }]`.
      const next = walkValue(entry, prose, `${where}[${String(index)}]`, pass);
      if (next !== entry) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (isObject(value)) {
    if (prose && isPattern(value)) return fillPattern(value, where, pass);
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const next = walkValue(entry, pass.isProse(key), `${where}.${key}`, pass);
      if (next !== entry) changed = true;
      out[key] = next;
    }
    return changed ? out : value;
  }
  return value;
};

const walkNode = (node: RenderNode, where: string, pass: Pass): RenderNode => {
  if (node.type === 'text') {
    if (!pass.text) return node;
    const value = swap(node.value, where, pass);
    return value === node.value ? node : { ...node, value };
  }

  if (node.type === 'fragment') {
    const children = walkNodes(node.children, where, pass);
    return children === node.children ? node : { ...node, children };
  }

  // An error node's message is a diagnostic for whoever is on call, not product
  // copy — left in the language the stack throws in, deliberately.
  if (node.type === 'error') return node;

  const at = node.ref === undefined ? `${where}/${node.name}` : `${where}/${node.name}#${node.ref}`;
  let props = node.props;
  let propsChanged = false;
  const nextProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.props)) {
    const next = walkValue(value, pass.isProse(key), `${at}.${key}`, pass);
    if (next !== value) propsChanged = true;
    nextProps[key] = next;
  }
  if (propsChanged) props = nextProps;

  const children = walkNodes(node.children, at, pass);
  if (!propsChanged && children === node.children) return node;
  return { ...node, props, children };
};

// Identity is returned when nothing under a node changed. Not an optimisation
// for its own sake: an untranslated locale (the source language) must produce
// the byte-identical frame it produced before this pass existed, or every
// English session pays a delta rebuild for a walk that did nothing.
const walkNodes = (nodes: RenderNode[], where: string, pass: Pass): RenderNode[] => {
  let changed = false;
  const out = nodes.map((node) => {
    const next = walkNode(node, where, pass);
    if (next !== node) changed = true;
    return next;
  });
  return changed ? out : nodes;
};

export const translateRenderTree = (tree: RenderNode[], options: TranslateOptions): RenderNode[] => {
  // An empty phrasebook is the source language. Skip the walk entirely rather
  // than doing it and finding nothing.
  if (Object.keys(options.phrases).length === 0) return tree;
  const matcher = matcherFor(options.keys);
  return walkNodes(tree, '', {
    phrases: options.phrases,
    isProse: matcher.isProse,
    text: matcher.text,
    onMiss: options.onMiss,
  });
};
