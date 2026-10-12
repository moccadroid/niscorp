import type { SeedEntry } from '@niscorp/vex';

// Each slot is an optional pair: `p<n>` is the ilike pattern (`%token%`), `t<n>` the raw
// token for the trigram match. A slot the caller leaves out is pruned before the query compiles.
const TOKEN_SLOTS = [1, 2, 3, 4, 5] as const;

export const CANDIDATE_TOKEN_SLOTS: number = TOKEN_SLOTS.length;

export const candidateActs: SeedEntry = {
  fingerprint: 'candidates/acts',
  intent: 'Acts whose name, billing or genre matches any of the supplied tokens, as id and label',
  shape: [{ id: '', label: '' }],
  dsl: {
    from: ['acts'],
    fields: [{ field: 'acts.id', as: 'id' }, 'acts.label'],
    filter: {
      or: TOKEN_SLOTS.flatMap((slot) => [
        { optional: { key: `p${slot}`, then: { ilike: ['acts.search', { $context: `p${slot}` }] } } },
        { optional: { key: `t${slot}`, then: { fuzzy: { field: 'acts.name', query: { $context: `t${slot}` } } } } },
      ]),
    },
    sort: [{ field: 'acts.draw', dir: 'desc' }],
    limit: 8,
  },
};

export const candidateStages: SeedEntry = {
  fingerprint: 'candidates/stages',
  intent: 'Every stage, as id and label',
  shape: [{ id: '', label: '' }],
  dsl: {
    from: ['stages'],
    fields: [{ field: 'stages.id', as: 'id' }, 'stages.label'],
    sort: [{ field: 'stages.capacity', dir: 'desc' }],
    limit: 8,
  },
};

export const candidateZones: SeedEntry = {
  fingerprint: 'candidates/zones',
  intent: 'Every zone on the site plan, as id and label',
  shape: [{ id: '', label: '' }],
  dsl: {
    from: ['zones'],
    fields: [{ field: 'zones.id', as: 'id' }, 'zones.label'],
    sort: [{ field: 'zones.capacity', dir: 'desc' }],
    limit: 8,
  },
};
