import type { Component } from 'vue';
import type { ComponentMeta } from '@layout';
import type { NovaEvent } from '@shared/event-bus';

// ═══════════════════════════════════════════════════════════
// Dispatch / publish contracts exposed to rendered components
// via provide/inject. Components never touch the shell directly.
// ═══════════════════════════════════════════════════════════

export type NovaDispatch = (event: NovaEvent) => void;
export type NovaPublish = (channel: string, payload?: unknown) => void;

// ═══════════════════════════════════════════════════════════
// Framework-injected props. Layout `props` are spread on top; a node's
// children arrive as the DEFAULT SLOT — an array of per-child vnodes keyed by
// core's renderNodeKey, so a component can address them individually.
// ═══════════════════════════════════════════════════════════

export type NovaModelBinding = {
  ref: string;
  path: string;
};

export type NovaComponentProps = {
  novaModel?: NovaModelBinding;
  novaRef?: string;
};

// Any Vue component — a `defineComponent` result or a plain functional
// component. A functional component with no declared `props` receives the
// node's props, novaRef and novaModel all as props. A static `.meta` is picked
// up by the registry (`register` / `registerAll`).
export type NovaComponent = Component & {
  meta?: ComponentMeta;
};

// The registry holds arbitrary values; the walker renders only what can be a
// Vue component — a function (functional / constructor) or an options object.
export const isNovaComponent = (value: unknown): value is NovaComponent =>
  typeof value === 'function' || (typeof value === 'object' && value !== null);
