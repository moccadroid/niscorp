import type { EndpointConfig } from '@niscorp/nova';

export const readEndpoint = (fingerprint: string, target: string): EndpointConfig => ({
  url: '/api/query',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  request: { fingerprint, context: {} },
  target,
});

export const DEFAULT_STATS = {
  open_count: 0,
  overdue_count: 0,
  done_today: 0,
  mood: 'mint',
  mood_label: 'calm',
};
