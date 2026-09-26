import { createPostgresCache } from '@niscorp/vex';
import type { Sequence } from '@niscorp/strata';
import { StrataLab, type CodeEdit } from '@showroom/modules/strata/strata-lab';

// A deployment from before strata. Its vex_cache was created months ago and
// caught up on every boot with `ADD COLUMN IF NOT EXISTS` — except this one
// has not booted since, so it is missing the five columns added later. It
// holds two cached reads nobody wants to lose.
//
// The code is the REAL sequence vex ships (not a copy): migration 1 is the
// DDL every boot used to run, verbatim. That is the whole adoption story —
// run once over whatever earlier shape the table is in, it lands the current
// one, keeps the rows, and is recorded so it never runs again. After that,
// changes are ordinary appended migrations.

// The sequence depends only on the table's name, never on the pool; the pool
// here is never queried.
const vexCache: Sequence = createPostgresCache({ pool: { query: async () => ({ rows: [] }) } }).sequence;

const beforeStrata = {
  label: 'setup · a deployment from before the ledger: vex_cache as it was, holding two cached reads',
  sql: [
    `CREATE TABLE vex_cache (
      key                text PRIMARY KEY,
      kind               text NOT NULL DEFAULT 'ok',
      intent             text,
      shape              jsonb,
      dsl                jsonb,
      prism_ir           jsonb,
      reason             text,
      created_at         timestamptz NOT NULL DEFAULT now(),
      expires_at         timestamptz,
      schema_fingerprint text
    )`,
    `INSERT INTO vex_cache (key, intent) VALUES ('bookings/today', 'Bookings for today'), ('members/active', 'Active members')`,
  ],
};

const edits: readonly CodeEdit[] = [
  {
    label: 'Ship a later migration',
    hint: 'After adoption, the next change to the table is an ordinary appended migration.',
    apply: (code) =>
      code.map((s) => ({
        ...s,
        migrations: [
          ...s.migrations,
          { description: 'Cache rows remember how often they were replayed', steps: [{ kind: 'sql' as const, sql: 'ALTER TABLE vex_cache ADD COLUMN replay_count integer NOT NULL DEFAULT 0' }] },
        ],
      })),
  },
];

export const Demo = () => (
  <StrataLab
    code={[vexCache]}
    setup={beforeStrata}
    edits={edits}
    tables={['vex_cache']}
    note="The table is missing protected, last_used_at, request_hash, reach and refresh. Boot once: migration 1 converges it and the two rows survive. Boot again: nothing. Then ship a later migration and boot — only it runs. Or press New database: the same migration builds the table from nothing."
  />
);
