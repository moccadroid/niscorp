export type ApprovalDecision =
  | { approved: true; args?: unknown }
  | { approved: false; reason: string };

export type ApprovalBridge = {
  ask: (approvalId: string, timeoutMs?: number) => Promise<ApprovalDecision>;
  approve: (approvalId: string, options?: { args?: unknown }) => void;
  deny: (approvalId: string, reason?: string) => void;
};

export const createApprovalBridge = (): ApprovalBridge => {
  const pending = new Map<string, { resolve: (decision: ApprovalDecision) => void; timer?: ReturnType<typeof setTimeout> }>();

  const settle = (approvalId: string, decision: ApprovalDecision): void => {
    const ask = pending.get(approvalId);
    if (!ask) return; // already settled: a UI double-click decides the same id twice
    pending.delete(approvalId);
    clearTimeout(ask.timer);
    ask.resolve(decision);
  };

  return {
    ask: (approvalId, timeoutMs) =>
      new Promise<ApprovalDecision>((resolve) => {
        const timer =
          timeoutMs !== undefined && timeoutMs > 0
            ? setTimeout(() => settle(approvalId, { approved: false, reason: 'approval timeout' }), timeoutMs)
            : undefined;
        pending.set(approvalId, { resolve, ...(timer !== undefined && { timer }) });
      }),
    approve: (approvalId, options) =>
      settle(approvalId, {
        approved: true,
        ...(options?.args !== undefined && { args: options.args }),
      }),
    deny: (approvalId, reason) => settle(approvalId, { approved: false, reason: reason ?? 'denied' }),
  };
};
