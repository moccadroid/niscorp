import type { FunctionHandler } from '@niscorp/nova';
import { getKey as getOpenRouterKey, setKey as setOpenRouterKey } from './openrouter';
import { getKey as getGroqKey, setKey as setGroqKey } from './groq';

// ═══════════════════════════════════════════════════════════
// The keys-modal functions. Load the current provider keys into the modal, and
// persist both from its fields. Each adapter owns its own browser slot (see
// llm/groq.ts, llm/openrouter.ts), so this just routes to the right one.
// ═══════════════════════════════════════════════════════════

export const keysLoad: FunctionHandler = async () => ({
  openrouter: getOpenRouterKey() ?? '',
  groq: getGroqKey() ?? '',
});

export const keysSave: FunctionHandler = async (data) => {
  const d = data as { openrouter?: unknown; groq?: unknown };
  setOpenRouterKey(String(d.openrouter ?? '').trim());
  setGroqKey(String(d.groq ?? '').trim());
  return 'Keys saved.';
};
