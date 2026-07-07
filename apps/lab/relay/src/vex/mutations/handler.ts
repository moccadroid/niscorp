import { z } from 'zod';
import type { PGlite } from '@electric-sql/pglite';
import { VexError } from '@niscorp/vex';
import type { DatabaseSchema, ScopePolicy, ScopeValues } from '@niscorp/vex';
import { executeMutation, type MutationDefinition } from './engine';

// ═══════════════════════════════════════════════════════════
// handleMutation — the write counterpart of Vex's `handleQuery`.
//
// A write request is self-describing, symmetric with a query: where a query body
// is `{ shape, intent, context }`, a mutation body is `{ mutation: <def>, context }`
// — the write DSL inlined, plus the dynamic `$context` values. The signed-in user
// arrives as server-injected `scope` (never client-supplied), so an inlined def
// still can't forge `owner_id`. The affected row(s) come back under `{ result }`,
// the same envelope a query reply uses, so an endpoint's `response` reads
// `$.result` either way.
//
// The engine stays relay-local (Vex mutations are experimental, not in the
// package); this is just its HTTP front.
// ═══════════════════════════════════════════════════════════

export type VexMutationConfig = { db: PGlite; schema: DatabaseSchema; policy: ScopePolicy };
export type MutationResult = { status: number; body: unknown };

const BodySchema = z.object({
  mutation: z.unknown(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const handleMutation = async (
  config: VexMutationConfig,
  body: unknown,
  scope: ScopeValues,
): Promise<MutationResult> => {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { error: 'invalid_request', message: parsed.error.message } };
  }

  try {
    // `executeMutation` validates the def (closed grammar), applies scope (RLS +
    // identity stamp), checks columns, then compiles + runs — all before a single
    // statement executes.
    const rows = await executeMutation(config.db, parsed.data.mutation as MutationDefinition, {
      context: parsed.data.context ?? {},
      scope,
      policy: config.policy,
      schema: config.schema,
    });
    // A single statement returns its one affected row; a batch returns the array.
    const result = rows.length === 1 ? rows[0] : rows;
    return { status: 200, body: { result } };
  } catch (err) {
    if (err instanceof VexError) {
      return { status: 400, body: { error: err.code, message: err.message, details: err.details } };
    }
    return { status: 500, body: { error: 'mutation_failed', message: err instanceof Error ? err.message : 'mutation failed' } };
  }
};
