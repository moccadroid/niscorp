import type { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Mutation op framework types.
// Each op file defines a schema, an inferred type, and a
// `MutationOp<T>` value that the registry dispatches through.
// ═══════════════════════════════════════════════════════════

export type MutationData = Record<string, unknown>;

export type MutationContext = { initial: MutationData };

export type MutationOp<TMutation> = {
  key: string;
  schema: z.ZodType<TMutation>;
  match?: (mutation: Record<string, unknown>) => boolean;
  apply: (data: MutationData, mutation: TMutation, ctx: MutationContext) => MutationData;
};
