import { HEAD_NAME } from '../layout/head';
import type { Head } from '../layout/head';
import type { RenderNode } from '../layout';
import type { RenderApi } from './types';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from './slot-names';

// ═══════════════════════════════════════════════════════════
// The head a screen has, read off its render tree.
//
// The frame is walked in the order it is drawn, into each canvas where its
// slot stands and into each instance on it. A screen can hold more than one
// head node — a dialog opened over a page — and then THE LAST ONE SPEAKS, whole:
// two heads are two things, and a title from one beside a description from the
// other describes neither.
//
// A node that says nothing (its bindings are not answered yet) is still the
// one that speaks: the document keeps what it had rather than borrow from a
// screen underneath.
// ═══════════════════════════════════════════════════════════

export type ScreenHead = {
  head: Head;
  // the action whose instance the node stands in; absent for a node in the
  // frame or in a canvas's own layout
  action?: string;
};

type Found = { props: Record<string, unknown>; action: string | undefined };

const said = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const structuredOf = (value: unknown): Head['structured'] => {
  if (isObject(value)) return value;
  if (Array.isArray(value) && value.length > 0 && value.every(isObject)) return value;
  return undefined;
};

// A prop that is not one of the names, or holds something other than what its
// name takes, is left out — the document keeps what it had there.
const headFrom = (props: Record<string, unknown>): Head => {
  const [title, description, image] = [said(props['title']), said(props['description']), said(props['image'])];
  const kind = props['kind'] === 'website' || props['kind'] === 'article' ? props['kind'] : undefined;
  const structured = structuredOf(props['structured']);
  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(image !== undefined ? { image } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(structured !== undefined ? { structured } : {}),
  };
};

export const isHeadNode = (node: RenderNode): boolean => node.type === 'component' && node.name === HEAD_NAME;

export const headOf = (api: Pick<RenderApi, 'frame' | 'canvasTree'>): ScreenHead | undefined => {
  const found: Found[] = [];
  // a canvas whose own tree names it again would never end
  const open = new Set<string>();

  const walk = (nodes: readonly RenderNode[], action: string | undefined): void => {
    for (const node of nodes) {
      if (node.type === 'fragment') {
        walk(node.children, action);
        continue;
      }
      if (node.type !== 'component') continue;
      if (node.name === HEAD_NAME) {
        found.push({ props: node.props, action });
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
  const last = found[found.length - 1];
  if (last === undefined) return undefined;
  return { head: headFrom(last.props), ...(last.action !== undefined ? { action: last.action } : {}) };
};
