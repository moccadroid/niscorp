import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// What Applause, an integration from outside, may call: a clap, and how many there were.
export const clapSend: SeedMutation = {
  fingerprint: 'claps/clap',
  intent: 'Record that this person clapped',
  mutation: { op: 'insert', table: 'claps', values: { kind: 'clap' } },
};

export const clapsCount: SeedEntry = {
  fingerprint: 'claps/count',
  refresh: 'reactive',
  intent: 'How many times the room clapped',
  shape: { count: 0 },
  dsl: { from: ['claps'], aggregate: { count: { count: '*' } } },
  mapping: { count: { $get: { from: { $ref: '$.result' }, path: ['count'], fallback: { $const: 0 } } } },
};

export const CLAP_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [clapSend, clapsCount];
