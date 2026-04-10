// ═══════════════════════════════════════════════════════════
// Policy gate — checked before every plan node execution
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §11. The gate translates the agent's PolicyConfig
// (tools allow/deny, agents allow/deny, budget caps, risk levels)
// into a per-step decision: allow, deny, or require confirmation.
//
// Confirmation flow is reserved but unimplemented in Phase B —
// requireConfirmation tools deny in this phase. Confirmation lands
// in Phase C as part of the interceptor system.
//
// The gate is a pure function over policy + ledger snapshot + node.
// No I/O, no state. Tests can call it directly.

import type { PolicyConfig } from '../schemas/policy.schema';
import type { ToolDefinition } from '../tool/define-tool';
import type { Registry } from '../manifold/registry';
import type { Ledger } from '../manifold/ledger';

export type GateInput = {
  policy: PolicyConfig | undefined;
  registry: Registry;
  ledger: Ledger;
  workflowId: string;
};

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: GateDenialReason; detail?: string };

export type GateDenialReason =
  | 'tool_not_registered'
  | 'tool_denied_by_policy'
  | 'agent_not_registered'
  | 'agent_denied_by_policy'
  | 'budget_tokens_exceeded'
  | 'budget_ticks_exceeded'
  | 'budget_tool_calls_exceeded'
  | 'budget_duration_exceeded'
  | 'risk_level_exceeded'
  | 'confirmation_required';

const RISK_RANK: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 1, high: 2 };

const matchesAny = (id: string, patterns: ReadonlyArray<string> | undefined): boolean => {
  if (!patterns || patterns.length === 0) return false;
  for (const pat of patterns) {
    if (pat === '*' || pat === id) return true;
    if (pat.endsWith('.*')) {
      const prefix = pat.slice(0, -2);
      if (id === prefix || id.startsWith(`${prefix}.`)) return true;
    }
  }
  return false;
};

// ───────────────────────────────────────────────────────────
// Budget check (run before EVERY node, not only the named ones)
// ───────────────────────────────────────────────────────────

export const checkBudget = (input: GateInput): GateDecision => {
  if (!input.ledger.isOpen(input.workflowId)) return { allowed: true };
  const snap = input.ledger.snapshot(input.workflowId);
  if (snap.tokensRemaining <= 0) return { allowed: false, reason: 'budget_tokens_exceeded' };
  if (snap.ticksRemaining <= 0) return { allowed: false, reason: 'budget_ticks_exceeded' };
  if (snap.toolCallsRemaining <= 0) return { allowed: false, reason: 'budget_tool_calls_exceeded' };
  if (snap.durationRemainingMs <= 0) return { allowed: false, reason: 'budget_duration_exceeded' };
  return { allowed: true };
};

// ───────────────────────────────────────────────────────────
// Tool gate
// ───────────────────────────────────────────────────────────

export type CheckToolInput = GateInput & { toolId: string };

export const checkTool = (input: CheckToolInput): GateDecision => {
  const budget = checkBudget(input);
  if (!budget.allowed) return budget;

  const tool: ToolDefinition | undefined = input.registry.getTool(input.toolId);
  if (!tool) return { allowed: false, reason: 'tool_not_registered', detail: input.toolId };

  const toolPolicy = input.policy?.tools;
  if (toolPolicy?.deny && matchesAny(input.toolId, toolPolicy.deny)) {
    return { allowed: false, reason: 'tool_denied_by_policy', detail: input.toolId };
  }
  if (toolPolicy?.allow && !matchesAny(input.toolId, toolPolicy.allow)) {
    return { allowed: false, reason: 'tool_denied_by_policy', detail: input.toolId };
  }
  if (toolPolicy?.maxRiskLevel && tool.config.riskLevel) {
    if (RISK_RANK[tool.config.riskLevel] > RISK_RANK[toolPolicy.maxRiskLevel]) {
      return { allowed: false, reason: 'risk_level_exceeded', detail: input.toolId };
    }
  }
  if (toolPolicy?.requireConfirmation && matchesAny(input.toolId, toolPolicy.requireConfirmation)) {
    // Confirmation flow lands in Phase C; for now we deny.
    return { allowed: false, reason: 'confirmation_required', detail: input.toolId };
  }
  return { allowed: true };
};

// ───────────────────────────────────────────────────────────
// Agent gate (for ask_agent delegation)
// ───────────────────────────────────────────────────────────

export type CheckAgentInput = GateInput & { agentId: string };

export const checkAgent = (input: CheckAgentInput): GateDecision => {
  const budget = checkBudget(input);
  if (!budget.allowed) return budget;

  if (!input.registry.getAgent(input.agentId)) {
    return { allowed: false, reason: 'agent_not_registered', detail: input.agentId };
  }
  const agentPolicy = input.policy?.agents;
  if (agentPolicy?.deny && matchesAny(input.agentId, agentPolicy.deny)) {
    return { allowed: false, reason: 'agent_denied_by_policy', detail: input.agentId };
  }
  if (agentPolicy?.allow && !matchesAny(input.agentId, agentPolicy.allow)) {
    return { allowed: false, reason: 'agent_denied_by_policy', detail: input.agentId };
  }
  return { allowed: true };
};
