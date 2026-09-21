import type { SeedEntry } from '@niscorp/vex';

// CANDIDATE RETRIEVAL — the reads that stand between the model and the rows.
//
// The decision model never produces a string, so it can never name an act: it
// is handed a short list of labelled rows and picks one, or `none`. These
// entries ARE that list, and they run as ordinary vex replays over the
// session's own wire — so a principal who cannot read `acts` has no act
// candidates, by the same policy that would refuse them the table anywhere
// else. A hand-written SQL helper here would be the second, unfenced read path
// PLAN.md D3 exists to rule out.
//
// Two shapes:
//
//   OPEN    — `acts`. Too many rows to send, so the operator's own words narrow
//             them: each surviving token is matched two ways, `ilike` against
//             the row's search document (a prefix still being typed — "headl" —
//             has to find "headliner") and pg_trgm `fuzzy` against the name (a
//             typo — "kestrl" — has to find "Kestrel").
//   CLOSED  — `stages`, `zones`. A handful of rows that never grows; all of
//             them go out every pass, and the model does the matching.

// Five token slots, each an OPTIONAL pair: `p<n>` is the ilike pattern
// (`%token%`), `t<n>` the raw token for the trigram match. A slot the caller
// leaves out is pruned before the query compiles, so one entry serves a
// one-word line and a five-word one without a sentinel that matches nothing.
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
    // Biggest draw first: when eight rows is not enough, the ones an operator
    // is likelier to mean are the ones that survive the cut.
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
