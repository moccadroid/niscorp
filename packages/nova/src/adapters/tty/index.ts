import type { ComponentRegistry, RenderNode } from '@layout/types';
import type { RenderApi } from '@shell';

// ═══════════════════════════════════════════════════════════
// @niscorp/nova/adapters/tty — a text adapter, the terminal sibling of
// nova/dom. It turns a served RenderNode tree into lines of plain text plus a
// numbered table of INTERACTIVES: every `ref`'d node prints with a `[n]`
// marker and lands in the table, so a REPL host can map "click 3" / "set 5 x"
// onto the same event vocabulary the DOM adapter wires by convention —
// `ui:click` (payload = the node's `value` prop), `ui:model`, `ui:key`.
// Origin is never stamped here — moss stamps the active instance server-side.
//
// No framework, no I/O, no node builtins: render() is a pure snapshot →
// { text, interactives }. The host (moss's terminal/tty target) owns stdio,
// prompts, and dispatch; this adapter only says what the screen IS and what
// on it can be acted on. `CanvasSlot` is resolved here (the frame's markers →
// per-canvas trees), the one piece of terminal structure the renderer owns.
// See packages/nova/ADAPTER.md for the shared adapter contract.
// ═══════════════════════════════════════════════════════════

// A rendered block: lines of text, composed upward (a Stack stacks child
// blocks, a Row joins single-line children inline, …).
export type TtyBlock = { lines: string[] };

// What an interactive marker can be driven with — the REPL host maps these
// to events: click/row → ui:click, model → ui:model (a typed value),
// toggle → ui:model (a negated boolean).
export type TtyInteractiveKind = 'click' | 'row' | 'model' | 'toggle';

export type TtyInteractive = {
  // the printed `[n]` — 1-based, in registration order
  index: number;
  kind: TtyInteractiveKind;
  ref: string;
  // the canvas whose dispatch this belongs to; '' = frame chrome (dispatches
  // nothing, same as the DOM adapter's frame)
  canvas: string;
  // what was printed — for the host's `refs` listing
  label: string;
  // click/row: the dispatch payload; model/toggle: the current value
  value?: unknown;
  // the model path, when model-bound — display only, the server owns meaning
  path?: string;
};

export type TtyComponentContext = {
  props: Record<string, unknown>;
  // the node's children, already rendered — the component stacks or joins
  // them where it wants (leaves ignore them).
  children: TtyBlock[];
  // register an interactive and get its printed index — for data-driven
  // components with INTERNAL interactivity (a table's rows, a panel's ✕);
  // simple components let the renderer mark their `ref`/`model` by convention.
  register: (entry: { kind: TtyInteractiveKind; ref: string; label: string; value?: unknown; path?: string }) => number;
};

// A TTY component: props + rendered children in, one block of lines out.
export type TtyComponent = (ctx: TtyComponentContext) => TtyBlock;

// What the terminal hands the view: core's `RenderApi` — the same single
// definition the dom/react adapters and moss's terminal share.
export type TtyRenderApi = RenderApi;

// One rendered frame: the full screen text and everything actionable on it.
export type TtyFrame = { text: string; interactives: TtyInteractive[] };

export type TtyView = {
  // render the current snapshot; call on every wire change
  render: () => TtyFrame;
};

const CANVAS_SLOT = 'CanvasSlot';
const RULE_WIDTH = 60;

// The recursion context: the registry, the canvas in force (frame chrome is
// ''; a CanvasSlot switches it), the interactive accumulator, the resolver.
type Ctx = {
  registry: ComponentRegistry<TtyComponent>;
  canvas: string;
  api: TtyRenderApi;
  out: TtyInteractive[];
  // used when a component name is unregistered — a permissive renderer (the
  // default kit) supplies one so unknown primitives render their children
  // instead of an error; strict consumers omit it.
  fallback?: TtyComponent;
};

const errorBlock = (code: string, message: string): TtyBlock => ({ lines: [`!! ${code}: ${message}`] });

const labelOf = (block: TtyBlock, ref: string): string => {
  const first = block.lines[0]?.trim() ?? '';
  return first === '' ? ref : first.slice(0, 48);
};

// A canvas heading: `── main ─────…` — the one piece of chrome the renderer
// prints itself, so a REPL reader can tell canvases apart.
const canvasRule = (id: string): string => {
  const head = `── ${id} `;
  return head + '─'.repeat(Math.max(0, RULE_WIDTH - head.length));
};

const renderNode = (node: RenderNode, ctx: Ctx): TtyBlock => {
  if (node.type === 'text') return { lines: node.value.split('\n') };
  if (node.type === 'fragment') return { lines: node.children.flatMap((child) => renderNode(child, ctx).lines) };
  if (node.type === 'error') return errorBlock(node.code, node.message);

  // component
  if (node.name === CANVAS_SLOT) {
    const canvasId = typeof node.props['canvasId'] === 'string' ? (node.props['canvasId'] as string) : '';
    if (canvasId === '') return { lines: [] };
    const tree = ctx.api.canvasTree(canvasId);
    // an empty canvas collapses entirely — no heading for nothing
    if (tree.length === 0) return { lines: [] };
    const canvasCtx: Ctx = { ...ctx, canvas: canvasId };
    return { lines: [canvasRule(canvasId), ...tree.flatMap((child) => renderNode(child, canvasCtx).lines), ''] };
  }

  const entry = ctx.registry.get(node.name);
  const build = entry !== undefined ? entry.component : ctx.fallback;
  if (build === undefined) return errorBlock('COMPONENT_NOT_FOUND', node.name);

  const children = node.children.map((child) => renderNode(child, ctx));
  const register: TtyComponentContext['register'] = (item) => {
    const interactive: TtyInteractive = { index: ctx.out.length + 1, canvas: ctx.canvas, ...item };
    ctx.out.push(interactive);
    return interactive.index;
  };
  const block = build({ props: node.props, children, register });

  // Convention wiring, the TTY twin of the DOM adapter's listeners: a model'd
  // node is an input (`toggle` when its current value is a boolean), a bare
  // ref'd node is clickable (payload = its `value` prop). The marker lands on
  // the block's first line.
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

// Collapse runs of blank lines so stacked empty canvases don't leave gaps.
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
    // The frame is chrome — its interactives belong to no canvas and the host
    // dispatches nothing for them, same as the DOM adapter's frame dispatch.
    const ctx: Ctx = { registry, canvas: '', api, out, ...(options.fallback !== undefined ? { fallback: options.fallback } : {}) };
    const lines = api.frame().flatMap((node) => renderNode(node, ctx).lines);
    return { text: tidy(lines).join('\n'), interactives: out };
  };
  return { render };
};
