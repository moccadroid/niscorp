// ═══════════════════════════════════════════════════════════
// Ledger — token / tick / tool-call accounting per workflow
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5.6 / §10: budgets are in TOKENS, not dollars.
// The ledger tracks usage per workflow against a budget. The plan
// executor and the tool loop check against this on every step.
//
// The default budget is taken from createManifold's defaultPolicy
// (or DEFAULT_BUDGET below if absent).

export type LedgerBudget = {
  maxTokens: number;
  maxTicks: number;
  maxToolCalls: number;
  maxDurationMs: number;
};

export type LedgerEntry = {
  workflowId: string;
  budget: LedgerBudget;
  startedAt: number;
  tokensUsed: number;
  ticksUsed: number;
  toolCallsUsed: number;
};

export type LedgerSnapshot = {
  tokensUsed: number;
  tokensRemaining: number;
  ticksUsed: number;
  ticksRemaining: number;
  toolCallsUsed: number;
  toolCallsRemaining: number;
  durationMs: number;
  durationRemainingMs: number;
};

export type Ledger = {
  open: (workflowId: string, budget?: Partial<LedgerBudget>) => void;
  close: (workflowId: string) => void;
  isOpen: (workflowId: string) => boolean;
  addTokens: (workflowId: string, count: number) => void;
  addTick: (workflowId: string) => void;
  addToolCall: (workflowId: string) => void;
  snapshot: (workflowId: string) => LedgerSnapshot;
  budgetOf: (workflowId: string) => LedgerBudget;
};

export const DEFAULT_BUDGET: LedgerBudget = {
  maxTokens: 200_000,
  maxTicks: 20,
  maxToolCalls: 200,
  maxDurationMs: 60_000,
};

const EMPTY_SNAPSHOT: LedgerSnapshot = {
  tokensUsed: 0,
  tokensRemaining: 0,
  ticksUsed: 0,
  ticksRemaining: 0,
  toolCallsUsed: 0,
  toolCallsRemaining: 0,
  durationMs: 0,
  durationRemainingMs: 0,
};

export type CreateLedgerOptions = {
  defaultBudget?: Partial<LedgerBudget>;
};

export const createLedger = (options: CreateLedgerOptions = {}): Ledger => {
  const entries = new Map<string, LedgerEntry>();
  const baseBudget: LedgerBudget = { ...DEFAULT_BUDGET, ...options.defaultBudget };

  const requireEntry = (workflowId: string): LedgerEntry => {
    const entry = entries.get(workflowId);
    if (!entry) throw new Error(`Ledger has no open entry for workflow ${workflowId}`);
    return entry;
  };

  return {
    open: (workflowId, budget) => {
      entries.set(workflowId, {
        workflowId,
        budget: { ...baseBudget, ...budget },
        startedAt: Date.now(),
        tokensUsed: 0,
        ticksUsed: 0,
        toolCallsUsed: 0,
      });
    },
    close: (workflowId) => {
      entries.delete(workflowId);
    },
    isOpen: (workflowId) => entries.has(workflowId),
    addTokens: (workflowId, count) => {
      const entry = requireEntry(workflowId);
      entry.tokensUsed += count;
    },
    addTick: (workflowId) => {
      const entry = requireEntry(workflowId);
      entry.ticksUsed += 1;
    },
    addToolCall: (workflowId) => {
      const entry = requireEntry(workflowId);
      entry.toolCallsUsed += 1;
    },
    snapshot: (workflowId) => {
      const entry = entries.get(workflowId);
      if (!entry) return EMPTY_SNAPSHOT;
      const elapsed = Date.now() - entry.startedAt;
      return {
        tokensUsed: entry.tokensUsed,
        tokensRemaining: Math.max(0, entry.budget.maxTokens - entry.tokensUsed),
        ticksUsed: entry.ticksUsed,
        ticksRemaining: Math.max(0, entry.budget.maxTicks - entry.ticksUsed),
        toolCallsUsed: entry.toolCallsUsed,
        toolCallsRemaining: Math.max(0, entry.budget.maxToolCalls - entry.toolCallsUsed),
        durationMs: elapsed,
        durationRemainingMs: Math.max(0, entry.budget.maxDurationMs - elapsed),
      };
    },
    budgetOf: (workflowId) => requireEntry(workflowId).budget,
  };
};
