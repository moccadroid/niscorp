// ═══════════════════════════════════════════════════════════
// Gates and hooks — all steering is plain typed functions
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §6. Gates run BEFORE tool execution; a deny reaches
// the model as a tool error and the run continues; an ask suspends
// the run for human approval. Declarative policy is sugar that
// compiles into one of these functions — never a parallel engine.

import type { Message, StepRequest } from '@niscorp/signal';
import type { SignalClient, StopReason, ToolObservation, Usage } from '../types';
import type { ToolRiskLevel } from '../schemas/tool-config.schema';

export type ToolCallInfo = {
  id: string;
  toolId: string;
  args: unknown;
  riskLevel?: ToolRiskLevel;
};

export type RunCtx<TDeps> = {
  runId: string;
  agentId: string;
  agentPath: ReadonlyArray<string>;
  deps: TDeps;
  step: number;
  usage: Usage;
  signal: AbortSignal;
};

export type GateDecision =
  | { allow: true; args?: unknown }
  | { deny: string }
  | { ask: { reason: string } };

export type ToolGate<TDeps = unknown> = (
  call: ToolCallInfo,
  ctx: RunCtx<TDeps>,
) => GateDecision | Promise<GateDecision>;

// Post-execution hook: replace / redact / truncate a tool result
// before it reaches the transcript and the observation stream.
export type ToolResultHook<TDeps = unknown> = (
  observation: ToolObservation,
  ctx: RunCtx<TDeps>,
) => { result?: unknown } | void | Promise<{ result?: unknown } | void>;

// The one dynamic-steering hook: runs before each step. Everything it
// returns is optional; omissions keep the defaults. `inject` messages
// are APPENDED to the transcript — the prefix is never re-templated.
export type PrepareStepInfo<TDeps> = {
  step: number;
  messages: ReadonlyArray<Message>;
  usage: Usage;
  tools: ReadonlyArray<string>;
  deps: TDeps;
};

export type PrepareStepResult = {
  // Mask by tool NAME (the model-visible identifier — what descriptors
  // carry and what `tools` in PrepareStepInfo lists). The respond tool
  // is the exit and is never maskable.
  activeTools?: ReadonlyArray<string>;
  toolChoice?: StepRequest['toolChoice'];
  inject?: Message[];
  llm?: SignalClient;
};

export type PrepareStep<TDeps = unknown> = (
  info: PrepareStepInfo<TDeps>,
) => PrepareStepResult | void | Promise<PrepareStepResult | void>;

// ───────────────────────────────────────────────────────────
// Stop conditions
// ───────────────────────────────────────────────────────────
//
// Checked before every step. First non-null verdict ends the run
// with a 'stopped' error carrying the verdict's reason.

export type RunProgress = {
  steps: number;
  usage: Usage;
  elapsedMs: number;
  outputRetries: number;
};

export type StopVerdict = { stop: StopReason; message: string } | null;

export type StopCondition = (progress: RunProgress) => StopVerdict;
