import type { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Mutation op framework types.
// Each op file defines a schema, an inferred type, and a
// `MutationOp<T>` value that the registry dispatches through.
// ═══════════════════════════════════════════════════════════

export type MutationData = Record<string, unknown>;

export type MutationContext = {
  /** Snapshot of initial data used by `reset`. Deep-cloned at runtime init. */
  initial: MutationData;
  /** When true, ops throw MutationError on invalid paths / type mismatches. */
  strict: boolean;
};

export type MutationOp<TMutation> = {
  key: string;
  schema: z.ZodType<TMutation>;
  match?: (mutation: Record<string, unknown>) => boolean;
  apply: (data: MutationData, mutation: TMutation, ctx: MutationContext) => MutationData;
};
