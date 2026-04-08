import type { ComponentType, ReactNode } from 'react';
import type { ComponentMeta } from '@layout';
import type { NovaEvent } from '@shared/event-bus';

// ═══════════════════════════════════════════════════════════
// Dispatch / publish contracts exposed to rendered components
// via React context. Components never touch the shell directly.
// ═══════════════════════════════════════════════════════════

export type NovaDispatch = (event: NovaEvent) => void;
export type NovaPublish = (channel: string, payload?: unknown) => void;

// ═══════════════════════════════════════════════════════════
// Framework-injected props. Layout `props` are spread on top.
// ═══════════════════════════════════════════════════════════

export type NovaModelBinding = {
  ref: string;
  path: string;
};

export type NovaComponentProps = {
  children?: ReactNode;
  novaModel?: NovaModelBinding;
  novaRef?: string;
};

// Framework-agnostic nova component. The optional `P` generic lets
// consumers type their own props; the intersection with
// `NovaComponentProps` is automatic. Components can attach a
// static `.meta` — the registry picks it up via `registerAll`.
export type NovaComponent<P = Record<string, unknown>> = ComponentType<NovaComponentProps & P> & {
  meta?: ComponentMeta;
};
