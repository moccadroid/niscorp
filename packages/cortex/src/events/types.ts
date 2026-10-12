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
  | { type: 'model-delta'; text: string; channel: 'text' | 'reasoning' }
  | { type: 'tool-start'; call: { id: string; toolId: string; args: unknown } }
  | { type: 'tool-end'; observation: ToolObservation }
  | { type: 'approval-required'; approval: ApprovalRequest }
  // Fragments of the envelope's JSON as the model writes it.
  | { type: 'output-delta'; text: string }
  | { type: 'output-partial'; output: unknown }
  | { type: 'retry'; kind: 'output' | 'termination' | 'provider'; attempt: number; issues: string }
  | { type: 'run-end'; result: RunResult<unknown>; meta: RunMeta };

export type CortexEvent = CortexEventBase & CortexEventBody;
