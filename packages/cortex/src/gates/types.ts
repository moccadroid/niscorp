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

export type ToolResultHook<TDeps = unknown> = (
  observation: ToolObservation,
  ctx: RunCtx<TDeps>,
) => { result?: unknown } | void | Promise<{ result?: unknown } | void>;

export type PrepareStepInfo<TDeps> = {
  step: number;
  messages: ReadonlyArray<Message>;
  usage: Usage;
  tools: ReadonlyArray<string>;
  deps: TDeps;
};

export type PrepareStepResult = {
  // Tool names, not ids. The respond tool is never masked.
  activeTools?: ReadonlyArray<string>;
  toolChoice?: StepRequest['toolChoice'];
  inject?: Message[];
  llm?: SignalClient;
};

export type PrepareStep<TDeps = unknown> = (
  info: PrepareStepInfo<TDeps>,
) => PrepareStepResult | void | Promise<PrepareStepResult | void>;

export type RunProgress = {
  steps: number;
  usage: Usage;
  elapsedMs: number;
  outputRetries: number;
  // Consecutive tool calls that got the same answer to the same tool and
  // arguments as the call before them; 0 after one that differs.
  repeatedCalls: number;
};

export type StopVerdict = { stop: StopReason; message: string } | null;

export type StopCondition = (progress: RunProgress) => StopVerdict;
