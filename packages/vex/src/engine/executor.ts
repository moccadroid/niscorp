import type { CompiledQuery, Row, DatabaseAdapter } from '../adapters/adapter.types.js';
import type { ContextMeta } from '../schemas/request.schema.js';
import { resolveParams } from '../utils/context.js';
import { VexError } from '../errors.js';

// ═══════════════════════════════════════════════════════════════
// Execution
// ═══════════════════════════════════════════════════════════════

export const executeQuery = async (
  compiled: CompiledQuery,
  context: Record<string, unknown>,
  scope: Record<string, unknown>,
  adapter: DatabaseAdapter,
  embed?: (text: string, dimensions?: number) => Promise<number[]>,
): Promise<Row[]> => {
  const boundParams = await resolveParams(
    compiled.paramSlots,
    context,
    scope,
    embed,
  );
  return adapter.execute(compiled, boundParams);
};

// ═══════════════════════════════════════════════════════════════
// Context contract builder
// ═══════════════════════════════════════════════════════════════

export const buildContextContract = (
  compiled: CompiledQuery,
  // Every key that controls an `optional` condition anywhere in the STORED
  // dsl — including the ones this run pruned away, which have no slot and so
  // would otherwise be invisible to the caller who most needs to know they
  // exist: the one who did not send them.
  optionalKeys: readonly string[] = [],
): Record<string, ContextMeta> => {
  const contract: Record<string, ContextMeta> = {};

  for (const slot of compiled.paramSlots) {
    contract[slot.key] = {
      type: slot.type,
      kind: slot.kind,
      ...(optionalKeys.includes(slot.key) ? { optional: true as const } : {}),
    };
  }

  for (const key of optionalKeys) {
    if (contract[key] !== undefined) continue;
    contract[key] = { kind: 'context', optional: true, absent: true };
  }

  return contract;
};

// ═══════════════════════════════════════════════════════════════
// Missing context detection
// ═══════════════════════════════════════════════════════════════

// The CALLER's half: context keys the request did not supply. A read with
// holes answers empty and hands back the contract it missed — the caller can
// fix that. Scope is not in here; see requireScope.
export const findMissingContext = (
  compiled: CompiledQuery,
  context: Record<string, unknown>,
): string[] => {
  const missing: string[] = [];

  for (const slot of compiled.paramSlots) {
    if ((slot.kind === 'context' || slot.kind === 'semantic') && context[slot.key] === undefined) {
      missing.push(slot.key);
    }
  }

  return missing;
};

// ═══════════════════════════════════════════════════════════════
// Missing scope — the HOST's half
// ═══════════════════════════════════════════════════════════════

// A `$scope` slot the host did not fill is not a hole a caller can mend: the
// caller cannot supply scope, and binding it would bind NULL — which matches
// no row on a read and STAMPS NULL on a write. So it refuses, loudly, before
// anything runs. The keys ride in `details` for the host's logs; the HTTP
// layer does not hand them to the client.
export const requireScope = (compiled: { paramSlots: readonly { kind: string; key: string }[] }, scope: Record<string, unknown>): void => {
  const missing = [...new Set(compiled.paramSlots.filter((slot) => slot.kind === 'scope' && scope[slot.key] === undefined).map((slot) => slot.key))];
  if (missing.length > 0) {
    throw new VexError('missing_scope', `This statement is scoped by ${missing.join(', ')}, which the host did not supply.`, { keys: missing });
  }
};
