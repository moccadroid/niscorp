// ═══════════════════════════════════════════════════════════
// CortexTopics — every system event topic as a named constant
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §3.4. Raw topic strings are a typo-magnet. All
// internal emits/subscribes use these constants so a typo becomes
// a compile error rather than a silent delivery failure.
//
// User-defined topics (from tell_topic, from custom behaviors)
// remain free-form strings. Only system events live here.

export const CortexTopics = {
  // ─── Execution lifecycle ─────────────────────────────────
  // The bus-driven execution substrate. manifold.execute()
  // dispatches a request; the manifold's internal handler runs
  // the agent and emits completed or failed on the same
  // correlationId. waitFor resolves the right one.
  executeRequested: 'cortex.execute.requested',
  executeCompleted: 'cortex.execute.completed',
  executeFailed: 'cortex.execute.failed',

  // ─── Workflow lifecycle ──────────────────────────────────
  workflowStarted: 'cortex.workflow.started',
  workflowEnded: 'cortex.workflow.ended',

  // ─── Tick lifecycle (plan mode only) ─────────────────────
  tickStarted: 'cortex.tick.started',
  tickEnded: 'cortex.tick.ended',

  // ─── Agent lifecycle ─────────────────────────────────────
  agentInvoked: 'cortex.agent.invoked',
  agentCompleted: 'cortex.agent.completed',
  agentRetry: 'cortex.agent.retry',

  // ─── Tool lifecycle ──────────────────────────────────────
  toolCalled: 'cortex.tool.called',
  toolObserved: 'cortex.tool.observed',

  // ─── Observations ────────────────────────────────────────
  observationRecorded: 'cortex.observation.recorded',

  // ─── Plan ────────────────────────────────────────────────
  planProduced: 'cortex.plan.produced',
  planGated: 'cortex.plan.gated',

  // ─── Policy / confirmation ───────────────────────────────
  confirmationRequested: 'cortex.policy.confirmation.requested',
  confirmationApproved: 'cortex.policy.confirmation.approved',
  confirmationDenied: 'cortex.policy.confirmation.denied',

  // ─── Context ─────────────────────────────────────────────
  contextBuilt: 'cortex.context.built',

  // ─── Errors / warnings ──────────────────────────────────
  error: 'cortex.error',
  warning: 'cortex.warning',
} as const;

// The type of a single topic value (useful for function signatures
// that accept a known system topic).
export type CortexTopic = (typeof CortexTopics)[keyof typeof CortexTopics];
