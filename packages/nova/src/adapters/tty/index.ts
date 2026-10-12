import type { ComponentRegistry, RenderNode } from '@layout/types';
import { isHeadNode } from '@shell';
import type { RenderApi } from '@shell';

export type TtyBlock = { lines: string[] };

export type TtyInteractiveKind = 'click' | 'row' | 'model' | 'toggle';

export type TtyInteractive = {
  index: number;
  kind: TtyInteractiveKind;
  ref: string;
  // '' is the frame, which dispatches nothing.
  canvas: string;
  origin?: string;
  label: string;
  // click and row: the dispatch payload. model and toggle: the current value.
  value?: unknown;
  path?: string;
};

export type TtyComponentContext = {
  props: Record<string, unknown>;
  children: TtyBlock[];
  register: (entry: { kind: TtyInteractiveKind; ref: string; label: string; value?: unknown; path?: string }) => number;
};

export type TtyComponent = (ctx: TtyComponentContext) => TtyBlock;

export type TtyRenderApi = RenderApi;

export type TtyFrame = { text: string; interactives: TtyInteractive[] };

export type TtyView = {
  render: () => TtyFrame;
};

const CANVAS_SLOT = 'CanvasSlot';
const ACTION_SLOT = 'ActionSlot';
const RULE_WIDTH = 60;

type Ctx = {
  registry: ComponentRegistry<TtyComponent>;
  canvas: string;
  origin?: string;
  api: TtyRenderApi;
  out: TtyInteractive[];
  fallback?: TtyComponent;
};

const errorBlock = (code: string, message: string): TtyBlock => ({ lines: [`!! ${code}: ${message}`] });

const labelOf = (block: TtyBlock, ref: string): string => {
  const first = block.lines[0]?.trim() ?? '';
  return first === '' ? ref : first.slice(0, 48);
};

const canvasRule = (id: string): string => {
  const head = `── ${id} `;
  return head + '─'.repeat(Math.max(0, RULE_WIDTH - head.length));
};

const renderNode = (node: RenderNode, ctx: Ctx): TtyBlock => {
  if (node.type === 'text') return { lines: node.value.split('\n') };
  if (node.type === 'fragment') return { lines: node.children.flatMap((child) => renderNode(child, ctx).lines) };
  if (node.type === 'error') return errorBlock(node.code, node.message);

  if (isHeadNode(node)) return { lines: [] };
  if (node.name === CANVAS_SLOT) {
    const canvasId = typeof node.props['canvasId'] === 'string' ? (node.props['canvasId'] as string) : '';
    if (canvasId === '') return { lines: [] };
    const tree = ctx.api.canvasTree(canvasId);
    if (tree.length === 0) return { lines: [] };
    // A canvas starts outside any instance, even when an instance's layout placed it.
    const { origin: _outer, ...outside } = ctx;
    const canvasCtx: Ctx = { ...outside, canvas: canvasId };
    return { lines: [canvasRule(canvasId), ...tree.flatMap((child) => renderNode(child, canvasCtx).lines), ''] };
  }

  const entry = ctx.registry.get(node.name);
  const build = entry !== undefined ? entry.component : ctx.fallback;
  if (build === undefined) return errorBlock('COMPONENT_NOT_FOUND', node.name);

  const instanceId = node.name === ACTION_SLOT ? node.props['instanceId'] : undefined;
  const inner: Ctx = typeof instanceId === 'string' && instanceId !== '' ? { ...ctx, origin: instanceId } : ctx;
  const children = node.children.filter((child) => !isHeadNode(child)).map((child) => renderNode(child, inner));
  const register: TtyComponentContext['register'] = (item) => {
    const interactive: TtyInteractive = { index: ctx.out.length + 1, canvas: ctx.canvas, ...(ctx.origin !== undefined ? { origin: ctx.origin } : {}), ...item };
    ctx.out.push(interactive);
    return interactive.index;
  };
  const block = build({ props: node.props, children, register });

  if (node.model !== undefined) {
    const current = node.props['value'] ?? node.props['checked'];
    const kind: TtyInteractiveKind = typeof current === 'boolean' ? 'toggle' : 'model';
    const index = register({ kind, ref: node.model.ref, label: labelOf(block, node.model.ref), value: current, path: node.model.path });
    return { lines: [`[${index}] ${block.lines[0] ?? ''}`, ...block.lines.slice(1)] };
  }
  if (node.ref !== undefined) {
    const value = node.props['value'];
    const index = register({ kind: 'click', ref: node.ref, label: labelOf(block, node.ref), ...(value !== undefined ? { value } : {}) });
    return { lines: [`[${index}] ${block.lines[0] ?? ''}`, ...block.lines.slice(1)] };
  }
  return block;
};

const tidy = (lines: string[]): string[] => {
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim() === '' && out[out.length - 1]?.trim() === '') continue;
    out.push(line);
  }
  while (out[0]?.trim() === '') out.shift();
  while (out[out.length - 1]?.trim() === '') out.pop();
  return out;
};

export const createTtyView = (
  registry: ComponentRegistry<TtyComponent>,
  api: TtyRenderApi,
  options: { fallback?: TtyComponent } = {},
): TtyView => {
  const render = (): TtyFrame => {
    const out: TtyInteractive[] = [];
    const ctx: Ctx = { registry, canvas: '', api, out, ...(options.fallback !== undefined ? { fallback: options.fallback } : {}) };
    const lines = api.frame().flatMap((node) => renderNode(node, ctx).lines);
    return { text: tidy(lines).join('\n'), interactives: out };
  };
  return { render };
};
