export type ApprovalDecision =
  | { approved: true; args?: unknown }
  | { approved: false; reason: string };

export type ApprovalAnswers = {
  approve: (approvalId: string, options?: { args?: unknown }) => void;
  deny: (approvalId: string, reason?: string) => void;
};

export type ApprovalBridge = ApprovalAnswers & {
  ask: (approvalId: string, timeoutMs?: number) => Promise<ApprovalDecision>;
  forwardTo: (child: ApprovalAnswers) => () => void;
};

export const createApprovalBridge = (): ApprovalBridge => {
  const pending = new Map<string, { resolve: (decision: ApprovalDecision) => void; timer?: ReturnType<typeof setTimeout> }>();
  const children = new Set<ApprovalAnswers>();

  const settle = (approvalId: string, decision: ApprovalDecision): boolean => {
    const ask = pending.get(approvalId);
    if (!ask) return false; // already settled: a UI double-click decides the same id twice
    pending.delete(approvalId);
    clearTimeout(ask.timer);
    ask.resolve(decision);
    return true;
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
    approve: (approvalId, options) => {
      const decision = { approved: true as const, ...(options?.args !== undefined && { args: options.args }) };
      if (!settle(approvalId, decision)) for (const child of children) child.approve(approvalId, options);
    },
    deny: (approvalId, reason) => {
      if (!settle(approvalId, { approved: false, reason: reason ?? 'denied' })) {
        for (const child of children) child.deny(approvalId, reason);
      }
    },
    forwardTo: (child) => {
      children.add(child);
      return () => {
        children.delete(child);
      };
    },
  };
};
