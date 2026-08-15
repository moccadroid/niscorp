import type { RenderNode } from '../layout';
import { passFor, swap, walkValue } from './swap';
import type { Pass } from './swap';
import type { PhraseKeys, Phrasebook } from './phrases';

// ═══════════════════════════════════════════════════════════
// translateRenderTree — the late pass, for whoever holds a tree they did not
// render.
//
// NOT the main road any more. Since the swap moved into the renderer
// (`layout/renderer.ts`), a tree that came out of a nova shell is already in
// the reader's language and this pass would find nothing to do. What is left
// for it is every tree that arrived from somewhere else: a frame replayed from
// a cache, an exporter's fixture, a test that builds nodes by hand.
//
// Structure in, same structure out, with prose swapped. A phrase with no entry
// passes through unchanged — the only sane failure, since a missing
// translation should show the source language, never an empty box and never a
// key. `onMiss` is how a check turns those into a list.
//
// One deliberate difference from the renderer: an EMPTY book short-circuits
// here and returns the very same tree, patterns included. The renderer fills
// patterns even with no book, because a source-language session has nobody
// else to do it; a tree-holder with no book has nothing to say about a tree it
// did not make.
// ═══════════════════════════════════════════════════════════

export type TranslateOptions = {
  phrases: Phrasebook;
  keys?: PhraseKeys;
  // Called once per untranslated phrase, with where it was found. For a dev
  // check that has to answer "what did we forget" without a human reading every
  // screen. Never call it from a hot path — it is a reporting seam.
  onMiss?: (phrase: string, where: string) => void;
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
  const pass = passFor({
    phrases: options.phrases,
    ...(options.keys === undefined ? {} : { keys: options.keys }),
    ...(options.onMiss === undefined ? {} : { onMiss: options.onMiss }),
  });
  if (pass === undefined) return tree;
  return walkNodes(tree, '', pass);
};
