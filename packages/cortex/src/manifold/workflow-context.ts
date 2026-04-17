// ═══════════════════════════════════════════════════════════
// WorkflowContext — per-workflow runtime state
// ═══════════════════════════════════════════════════════════
//
// One per active workflow. Carries everything that needs to flow
// through the execution path: workflowId, abort signal, stream flag,
// live policy (mutable by rules), rule injections, and a workflow-
// scoped emit() that binds {correlationId: workflowId, workflowId}
// into every event so callers don't repeat that meta.
//
// Created and destroyed by the manifold; held by reference everywhere
// in the execution path, so all reads see live state.

import type { Bus, Unsubscribe } from '../types';
import type { PolicyConfig } from '../schemas/policy.schema';
import type { TypedTopic } from '../utils/typed-topic';

export type WorkflowEmit = {
  <P>(topic: TypedTopic<P>, payload: P): void;
  (topic: string, payload: unknown): void;
};

export type WorkflowContext = {
  readonly workflowId: string;
  readonly abort: AbortController;
  readonly stream: boolean;
  readonly emit: WorkflowEmit;

  // Mutable by rules. The gate reads policy live every check.
  readonly policy: PolicyConfig;
  updatePolicy: (fn: (current: PolicyConfig) => PolicyConfig) => void;
  readonly injections: ReadonlyArray<string>;
  addInjection: (message: string) => void;

  // Bus subscriptions for stateful producers, cleaned up on workflow
  // end. Internal to the manifold.
  readonly producerUnsubs: Unsubscribe[];
};

export type CreateWorkflowContextInput = {
  workflowId: string;
  bus: Bus;
  policy: PolicyConfig;
  externalAbort?: AbortSignal;
  stream?: boolean;
};

export const createWorkflowContext = (
  args: CreateWorkflowContextInput,
): WorkflowContext => {
  const { workflowId, bus, policy: initialPolicy, externalAbort, stream = false } = args;
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

  // The cast is unavoidable: TypeScript can't infer that a single-
  // signature arrow function satisfies an overloaded function type,
  // and the style guide forbids `function` declarations. The
  // implementation's (string, unknown) signature is structurally
  // broader than both overloads, so the cast is sound.
  const emit: WorkflowEmit = ((topic: string, payload: unknown): void => {
    bus.emit(topic, payload, { correlationId: workflowId, workflowId });
  }) as WorkflowEmit;

  return {
    workflowId,
    abort,
    stream,
    emit,
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
