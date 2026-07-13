// ═══════════════════════════════════════════════════════════
// Cortex events — every run is one ordered, typed stream
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §7. No global bus: events are scoped to a run.
// When an agent runs inside another (asTool), the child's events
// forward into the parent stream carrying their own runId and
// extended agentPath — one subscription sees the whole tree.

import type { RunMeta, RunResult, ToolObservation } from '../types';

export type ApprovalRequest = {
  id: string;
  toolId: string;
  callId: string;
  args: unknown;
  reason: string;
};

export type CortexEventBase = {
  runId: string;
  agentPath: ReadonlyArray<string>;
  seq: number;
  ts: number;
};

export type CortexEventBody =
  | { type: 'run-start'; input: unknown }
  | { type: 'step-start'; step: number }
  // Model text as it streams. `reasoning` is reserved for providers
  // that expose reasoning tokens as a separate channel.
  | { type: 'model-delta'; text: string; channel: 'text' | 'reasoning' }
  // Fires BEFORE gating + execution — drives live "running…" UIs.
  | { type: 'tool-start'; call: { id: string; toolId: string; args: unknown } }
  | { type: 'tool-end'; observation: ToolObservation }
  // The run is suspended until run.approve(id) / run.deny(id).
  | { type: 'approval-required'; approval: ApprovalRequest }
  // Raw envelope JSON fragments (respond args, or text under native/text).
  | { type: 'output-delta'; text: string }
  // Progressively parsed envelope via solid. Best-effort: absent when
  // solid cannot track the schema; the final Zod validation is
  // authoritative either way.
  | { type: 'output-partial'; output: unknown }
  // Consumers reset partial-output state on this (same contract as v1).
  // 'output': the envelope failed validation. 'termination': the model
  // stopped without finishing. 'provider': the PROVIDER rejected the
  // model's emission server-side (e.g. Groq tool-arg validation, the
  // gpt-oss "commentary" quirk) — recovered, not the run's fault, and
  // NOT counted against outputRetries.
  | { type: 'retry'; kind: 'output' | 'termination' | 'provider'; attempt: number; issues: string }
  | { type: 'run-end'; result: RunResult<unknown>; meta: RunMeta };

export type CortexEvent = CortexEventBase & CortexEventBody;
