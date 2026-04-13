// ═══════════════════════════════════════════════════════════
// WorkflowContext — per-workflow runtime state
// ═══════════════════════════════════════════════════════════
//
// One WorkflowContext per active workflow. Every point in the
// execution path that makes a decision reads from this object:
//   - gate reads policy (live — rules may have modified it)
//   - tool loop reads abort signal
//   - plan executor reads abort signal
//   - inject producer reads injections
//
// Rule effects write to it. The manifold creates and destroys it.
// No threading — the execution path holds a reference and reads
// live state on every iteration.

import type { Unsubscribe } from '../types';
import type { PolicyConfig } from '../schemas/policy.schema';

export type WorkflowContext = {
  readonly workflowId: string;
  readonly abort: AbortController;

  // ─── Policy (mutable by rules) ──────────────────────────
  //
  // Initialized from agent.config.policy. Rules modify it via
  // updatePolicy. The gate reads it on every check — always fresh.
  readonly policy: PolicyConfig;
  updatePolicy: (fn: (current: PolicyConfig) => PolicyConfig) => void;

  // ─── Rule injections ────────────────────────────────────
  //
  // Messages injected by rule inject effects. The inject producer
  // reads these on every pipeline build.
  readonly injections: ReadonlyArray<string>;
  addInjection: (message: string) => void;

  // ─── Producer subscriptions ─────────────────────────────
  //
  // Bus subscriptions for stateful producers, cleaned up on
  // workflow end. Internal to the manifold.
  readonly producerUnsubs: Unsubscribe[];
};

export const createWorkflowContext = (
  workflowId: string,
  initialPolicy: PolicyConfig,
  externalAbort?: AbortSignal,
): WorkflowContext => {
  const abort = new AbortController();
  if (externalAbort) {
    externalAbort.addEventListener(
      'abort',
      () => abort.abort(externalAbort.reason),
      { once: true },
    );
  }

  let policy: PolicyConfig = { ...initialPolicy };
  const injections: string[] = [];
  const producerUnsubs: Unsubscribe[] = [];

  return {
    workflowId,
    abort,
    get policy() { return policy; },
    updatePolicy: (fn) => { policy = fn(policy); },
    get injections() { return injections; },
    addInjection: (message) => { injections.push(message); },
    producerUnsubs,
  };
};

export const destroyWorkflowContext = (ctx: WorkflowContext): void => {
  for (const unsub of ctx.producerUnsubs) unsub();
};
