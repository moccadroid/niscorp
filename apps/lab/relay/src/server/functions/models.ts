import type { FunctionHandler } from '@niscorp/nova';
import { MODELS, assign, assignments, effortOptionsFor, isEffort, isModelId, isRole } from '@relay/server/llm';

// ═══════════════════════════════════════════════════════════
// Settings → Models, over the `fn:` seam. One read and one write against the
// LLM seam's assignment (server/llm/index.ts).
//
// Both return the SAME payload, so the screen has one shape to bind and the
// write's reply is simply the new truth. That matters here: effort rungs are
// per MODEL, so changing a row's model changes which efforts that row may
// offer and may clamp the one it had. The server does both and hands back the
// result — the screen never computes what is legal.
//
// Unknown roles, models and rungs are dropped rather than argued with; the
// reply shows what actually took.
// ═══════════════════════════════════════════════════════════

const payload = (): Record<string, unknown> => {
  const current = assignments();
  return {
    options: Object.entries(MODELS).map(([value, entry]) => ({ value, label: entry.label })),
    assignments: current,
    // role → the rungs the model THAT ROLE is on accepts.
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
