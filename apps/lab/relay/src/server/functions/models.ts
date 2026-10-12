import type { FunctionHandler } from '@niscorp/nova';
import { MODELS, assign, assignments, effortOptionsFor, isEffort, isModelId, isRole } from '@relay/server/llm';

const payload = (): Record<string, unknown> => {
  const current = assignments();
  return {
    options: Object.entries(MODELS).map(([value, entry]) => ({ value, label: entry.label })),
    assignments: current,
    efforts: Object.fromEntries(Object.entries(current).map(([role, a]) => [role, effortOptionsFor(a.model)])),
  };
};

export const modelFunctions = (): Record<string, FunctionHandler> => ({
  'models.load': async () => payload(),

  'models.assign': async (data) => {
    const next = (data['models'] as Record<string, unknown> | undefined)?.['assignments'];
    if (next !== null && typeof next === 'object' && !Array.isArray(next)) {
      for (const [role, value] of Object.entries(next)) {
        if (!isRole(role) || value === null || typeof value !== 'object') continue;
        const { model, effort } = value as { model?: unknown; effort?: unknown };
        if (!isModelId(model)) continue;
        assign(role, model, isEffort(effort) ? effort : undefined);
      }
    }
    return payload();
  },
});
