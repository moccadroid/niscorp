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

export const buildContextContract = (compiled: CompiledQuery): Record<string, ContextMeta> => {
  const contract: Record<string, ContextMeta> = {};

  for (const slot of compiled.paramSlots) {
    contract[slot.key] = {
      type: slot.type,
      kind: slot.kind,
    };
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
