import type { CompiledQuery, Row, DatabaseAdapter } from '../adapters/adapter.types.js';
import type { ContextMeta } from '../schemas/request.schema.js';
import { resolveParams } from '../utils/context.js';

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

export const findMissingContext = (
  compiled: CompiledQuery,
  context: Record<string, unknown>,
  scope: Record<string, unknown>,
): string[] => {
  const missing: string[] = [];

  for (const slot of compiled.paramSlots) {
    if (slot.kind === 'context' || slot.kind === 'semantic') {
      if (context[slot.key] === undefined) {
        missing.push(slot.key);
      }
    } else if (slot.kind === 'scope') {
      if (scope[slot.key] === undefined) {
        missing.push(slot.key);
      }
    }
  }

  return missing;
};
