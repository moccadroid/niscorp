import type { ToolRiskLevel } from '../schemas/tool-config.schema';
import type { GateDecision, ToolCallInfo, ToolGate } from './types';

export type ToolPolicy = {
  tools?: {
    allow?: ReadonlyArray<string>;
    deny?: ReadonlyArray<string>;
    requireApproval?: ReadonlyArray<string>;
    maxRiskLevel?: ToolRiskLevel;
  };
  approvalTimeoutMs?: number;
};

const RISK_RANK: Record<ToolRiskLevel, number> = { low: 0, medium: 1, high: 2 };

const riskOf = (call: ToolCallInfo): number => RISK_RANK[call.riskLevel ?? 'low'];

export const policyGate = (policy: ToolPolicy): ToolGate<unknown> => {
  const tools = policy.tools ?? {};
  const deny = new Set(tools.deny ?? []);
  const allow = tools.allow ? new Set(tools.allow) : undefined;
  const requireApproval = new Set(tools.requireApproval ?? []);
  const maxRisk = tools.maxRiskLevel !== undefined ? RISK_RANK[tools.maxRiskLevel] : undefined;

  return (call: ToolCallInfo): GateDecision => {
    if (deny.has(call.toolId)) return { deny: `tool "${call.toolId}" is denied by policy` };
    if (allow && !allow.has(call.toolId)) return { deny: `tool "${call.toolId}" is not on the policy allow list` };
    if (maxRisk !== undefined && riskOf(call) > maxRisk) {
      return { deny: `tool "${call.toolId}" exceeds the policy risk ceiling (${tools.maxRiskLevel})` };
    }
    if (requireApproval.has(call.toolId)) return { ask: { reason: `policy requires approval for "${call.toolId}"` } };
    return { allow: true };
  };
};
