import type { CompiledQuery, Row, DatabaseAdapter } from '../adapters/adapter.types.js';
import type { ContextMeta } from '../schemas/request.schema.js';
import { resolveParams } from '../utils/context.js';
import { VexError } from '../errors.js';

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

export const buildContextContract = (
  compiled: CompiledQuery,
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

// An unfilled `$scope` slot would bind NULL, which matches no row on a read
// and stamps NULL on a write. A caller cannot supply scope, so this throws
// where a missing context key answers empty.
export const requireScope = (compiled: { paramSlots: readonly { kind: string; key: string }[] }, scope: Record<string, unknown>): void => {
  const missing = [...new Set(compiled.paramSlots.filter((slot) => slot.kind === 'scope' && scope[slot.key] === undefined).map((slot) => slot.key))];
  if (missing.length > 0) {
    throw new VexError('missing_scope', `This statement is scoped by ${missing.join(', ')}, which the host did not supply.`, { keys: missing });
  }
};
