import type { ContextContract, ParamSlot } from '../adapters/adapter.types.js';

// ───────────────────────────────────────────────────────────────
// Validation context builder
// ───────────────────────────────────────────────────────────────

const defaultForType = (type: ParamSlot['type']): unknown => {
  if (type === 'string') return '';
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'string[]') return [''];
  if (type === 'number[]') return [0];
  if (type === 'json') return [];
  return '';
};

export const buildValidationContext = (contract: ContextContract): Record<string, unknown> => {
  const ctx: Record<string, unknown> = {};
  for (const key of Object.keys(contract)) {
    const slot = contract[key];
    if (slot === undefined) continue;
    // Skip semantic slots — handled separately by the test path
    if (slot.kind === 'semantic') continue;
    ctx[key] = defaultForType(slot.type);
  }
  return ctx;
};

// ───────────────────────────────────────────────────────────────
// Parameter resolution
// ───────────────────────────────────────────────────────────────

export const resolveParams = async (
  slots: ParamSlot[],
  context: Record<string, unknown>,
  scope: Record<string, unknown>,
  embed?: (text: string, dimensions?: number) => Promise<number[]>,
): Promise<unknown[]> => {
  const results: unknown[] = [];

  for (const slot of slots) {
    if (slot.kind === 'context') {
      results.push(context[slot.key]);
      continue;
    }

    if (slot.kind === 'scope') {
      results.push(scope[slot.key]);
      continue;
    }

    // kind === 'semantic'
    if (embed === undefined) {
      throw new Error(`Semantic parameter "${slot.key}" requires an embed function`);
    }
    const text = context[slot.key];
    if (typeof text !== 'string') {
      throw new Error(`Semantic parameter "${slot.key}" requires a string value in context`);
    }
    const vector = await embed(text, slot.dimensions);
    results.push(`[${vector.join(',')}]`);
  }

  return results;
};
