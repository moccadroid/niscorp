import type { EndpointConfig } from '@niscorp/nova';

// ───────────────────────────────────────────────────────────
// The one reader (D3): every read endpoint POSTs `{ fingerprint,
// context }` to /api/query. The fingerprint comes from the entry in
// src/api/reads.ts — the same name the prewarm keyed the cache
// with, so the two can never drift. The body is plain static JSON
// (no prism — nothing derives from screen state); `today` is
// stamped by the server, not sent.
// ───────────────────────────────────────────────────────────

export const readEndpoint = (fingerprint: string, target: string): EndpointConfig => ({
  url: '/api/query',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  request: { fingerprint, context: {} },
  target,
});

// Endpoint-fed slots start from these defaults; every key present, calm mood.
export const DEFAULT_STATS = {
  open_count: 0,
  overdue_count: 0,
  done_today: 0,
  mood: 'mint',
  mood_label: 'calm',
};
