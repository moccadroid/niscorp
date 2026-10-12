import type { RenderNode } from '../layout';
import { passFor, swap, walkValue } from './swap';
import type { Pass } from './swap';
import type { PhraseKeys, Phrasebook } from './phrases';

export type TranslateOptions = {
  phrases: Phrasebook;
  keys?: PhraseKeys;
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

  // An error node's message is a diagnostic, not product copy: it stays in the
  // language it was thrown in.
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
  // An empty phrasebook is the source language: the tree comes back as it is,
  // `{ phrase, slots }` patterns unfilled, where the renderer would fill them.
  if (Object.keys(options.phrases).length === 0) return tree;
  const pass = passFor({
    phrases: options.phrases,
    ...(options.keys === undefined ? {} : { keys: options.keys }),
    ...(options.onMiss === undefined ? {} : { onMiss: options.onMiss }),
  });
  if (pass === undefined) return tree;
  return walkNodes(tree, '', pass);
};
