import type { z } from 'zod';

export type MutationData = Record<string, unknown>;

export type MutationContext = {
  initial: MutationData;
  strict: boolean;
};

export type MutationOp<TMutation> = {
  key: string;
  schema: z.ZodType<TMutation>;
  match?: (mutation: Record<string, unknown>) => boolean;
  apply: (data: MutationData, mutation: TMutation, ctx: MutationContext) => MutationData;
};
