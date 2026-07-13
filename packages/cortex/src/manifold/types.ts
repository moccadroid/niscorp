// ═══════════════════════════════════════════════════════════
// Erased agent shapes — how the manifold stores heterogeneity
// ═══════════════════════════════════════════════════════════
//
// The manifold holds agents of many <TData, TDeps> in one Map, so
// it stores them through an erased structural view. Conversion in
// and out goes through utils/trust.ts (the documented boundary);
// callers of manifold.run() re-name the type they expect.

import type { SignalClient, Unsubscribe } from '../types';
import type { CortexEvent } from '../events/types';
import type { RunInput } from '../context/assemble';
import type { ToolGate } from '../gates/types';
import type { ToolDefinition } from '../tool/define-tool';
import type { RunHandle } from '../agent/run';
import type { ResolvedPreview } from '../agent/preview';

export type ErasedRunOptions = {
  deps?: unknown;
  llm?: SignalClient;
  tools?: ReadonlyArray<ToolDefinition>;
  gates?: ReadonlyArray<ToolGate<unknown>>;
  signal?: AbortSignal;
  onEvent?: (event: CortexEvent) => void;
  agentPath?: ReadonlyArray<string>;
};

export type ErasedAgent<TData = unknown> = {
  agentId: string;
  config: {
    description?: string;
    llm?: SignalClient;
  };
  run: (input: RunInput, options?: ErasedRunOptions) => RunHandle<TData>;
  preview: (input: RunInput, options?: ErasedRunOptions) => Promise<ResolvedPreview>;
};

export type RunTap = (run: RunHandle<unknown>) => void;

export type ManifoldEventSource = {
  onEvent: (listener: (event: CortexEvent) => void) => Unsubscribe;
};
