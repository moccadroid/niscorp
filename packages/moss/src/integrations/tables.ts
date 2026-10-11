import type { Sequence } from '@niscorp/strata';

// ═══════════════════════════════════════════════════════════════
// THE TABLES THE FEATURE KEEPS: three, and the sequence of its own that makes
// the third.
//
// `integrations` and `integration_actions` are older than the feature. The
// core's sequence made them (`nisc.moss`, ../data), every deployment's ledger
// has them there, and a migration that has run is never moved or edited: their
// DDL stays where it is. In code they are this feature's, like the third: it
// names all three as its own (./entries.ts, `REGISTRY_TABLES`), and nothing
// in the core reads or writes a row of them.
//
// The sequence below is named on the feature (`Feature.tables.sequences`), so
// the server runs it in the one ledgered run every owner's tables go through,
// after `nisc.moss`: its table points at `integrations`.
//
// HISTORY: a migration that has run is never edited. Append one
// (test/baselines.test.ts pins the checksum of each).
// ═══════════════════════════════════════════════════════════════

export const INTEGRATIONS_SEQUENCE: Sequence = {
  id: 'nisc.moss.integrations',
  migrations: [
    {
      description: 'Frame grants: what a framed page was opened by, kept by its hash until it expires',
      steps: [
        {
          kind: 'sql',
          sql: `CREATE TABLE integration_frame_grants (
  -- THE HASH, NEVER THE GRANT. The grant travels in a URL and is redeemed by
  -- presenting it; this is all that is kept of it, so a copy of this table
  -- opens no frame.
  grant_hash      text PRIMARY KEY,
  -- A grant is one integration's, and goes when the integration does.
  integration_id  text NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  -- Who it was minted for: the page is forwarded with an assertion that says so.
  principal       text NOT NULL,
  -- The one page it opens, as the bundle declared it.
  path            text NOT NULL,
  expires_at      timestamptz NOT NULL
)
`,
        },
      ],
    },
  ],
};
