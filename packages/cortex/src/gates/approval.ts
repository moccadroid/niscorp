// ═══════════════════════════════════════════════════════════
// Approval bridge — suspend a tool call for a human decision
// ═══════════════════════════════════════════════════════════
//
// An `ask` gate decision emits `approval-required` and awaits a
// decision here. run.approve(id) may rewrite the call's args
// (the Claude Code pattern: approve-with-edits). Tools execute
// sequentially, so at most one approval is pending per run at a
// time. Timeouts deny the call — an observation, not a run
// failure.

export type ApprovalDecision =
  | { approved: true; args?: unknown }
  | { approved: false; reason: string };

export type ApprovalBridge = {
  ask: (approvalId: string, timeoutMs?: number) => Promise<ApprovalDecision>;
  approve: (approvalId: string, options?: { args?: unknown }) => void;
  deny: (approvalId: string, reason?: string) => void;
};

export const createApprovalBridge = (): ApprovalBridge => {
  const pending = new Map<string, (decision: ApprovalDecision) => void>();

  const settle = (approvalId: string, decision: ApprovalDecision): void => {
    const resolve = pending.get(approvalId);
    if (!resolve) return; // unknown or already settled — ignore (UI double-clicks)
    pending.delete(approvalId);
    resolve(decision);
  };

  return {
    ask: (approvalId, timeoutMs) =>
      new Promise<ApprovalDecision>((resolve) => {
        pending.set(approvalId, resolve);
        if (timeoutMs !== undefined && timeoutMs > 0) {
          setTimeout(() => settle(approvalId, { approved: false, reason: 'approval timeout' }), timeoutMs);
        }
      }),
    approve: (approvalId, options) =>
      settle(approvalId, {
        approved: true,
        ...(options?.args !== undefined && { args: options.args }),
      }),
    deny: (approvalId, reason) => settle(approvalId, { approved: false, reason: reason ?? 'denied' }),
  };
};
