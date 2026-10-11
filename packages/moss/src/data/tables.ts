import type { Sequence } from '@niscorp/strata';

// ═══════════════════════════════════════════════════════════════
// THE TABLES MOSS OWNS, and the documents stored in them.
//
// Defined here, on the app's pool, for the same reason vex defines `vex_cache`:
// an app that had to author them would author them differently each time, and
// the shape is not application knowledge.
// ═══════════════════════════════════════════════════════════════

// THE TABLES THAT ARE THE CORE'S OWN, each with what it holds. No feature may
// name one as its own (./feature-tables.ts): a feature's entries run outside
// the app's policy, and what is in these is every session, the pointer every
// process follows, the surface vex replays and the record of what was
// migrated. By the names they have on a deployment that changed none of them:
// `sessions` is the identity module's (migrated here when the deployment keeps
// moss's credential), `vex_cache` is vex's default cache, and `strata_ledger`
// is strata's.
//
// `integrations` and `integration_actions` are NOT here, though migration 1
// below makes them. They are older than features and stayed where every
// deployment's ledger has them; in code they are the integrations feature's
// (../integrations, which names them as its own), and nothing in this module
// reads or writes a row of either.
// What vex's cache holds, said once: for its default table below, and for
// the table a deployment's own cache keeps instead (./feature-tables.ts).
export const CACHE_HOLDS = 'the entries vex replays';

export const CORE_TABLES: ReadonlyMap<string, string> = new Map([
  ['moss_generation', 'the generation pointer every process polls'],
  ['sessions', 'the stored session credentials'],
  ['vex_cache', CACHE_HOLDS],
  ['strata_ledger', 'the record of every migration that ran'],
]);

// THE GENERATION POINTER'S TABLE, AND ITS ONE ROW. History: these two
// statements are the last two steps of migration 1 below, and every database
// has run them. They were declared beside the code that polls the pointer
// (../manifest, generation.ts) and are here now, byte for byte, with the rest
// of what moss migrates: that file holds no SQL any more. The row is written
// by the migration, in the same transaction as its table (rule 17), and is
// read and moved through vex from then on (./pointer.ts).
//
// TWO STATEMENTS, SENT SEPARATELY. A driver that prepares its statements refuses
// a string carrying more than one command, and the failure arrives as a
// DatabaseError at boot rather than as anything about generations.
const GENERATION_DDL: readonly string[] = [
  /* sql */ `CREATE TABLE IF NOT EXISTS moss_generation (id INT PRIMARY KEY, n BIGINT NOT NULL DEFAULT 0)`,
  /* sql */ `INSERT INTO moss_generation (id, n) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
];

// THE TABLES MOSS OWNS, as one strata sequence. Migration 1 is the DDL every
// boot used to run, verbatim and in order — CREATE … IF NOT EXISTS, then the
// ADD COLUMN IF NOT EXISTS that caught older tables up — so it converges any
// earlier deployment to the current shape, once, and the ledger remembers.
// The generation pointer rides the same migration: it too existed on every
// boot. HISTORY: never edit an applied migration; append one (see
// test/baselines.test.ts, which pins the checksum).
export const MOSS_SEQUENCE: Sequence = {
  id: 'nisc.moss',
  migrations: [
    {
      description: 'Integrations, their actions and the generation pointer, converged from any earlier shape',
      steps: [
        { kind: 'sql', sql: `CREATE TABLE IF NOT EXISTS integrations (
  id                 text PRIMARY KEY,
  url                text NOT NULL,
  -- THE HASH, NEVER THE KEY. The integration key is minted at registration
  -- (see assert.ts for the credential rule), returned once in that response,
  -- and this is all that remains of it here. Presenting the key is the only
  -- way to produce this value again, so a stolen database does not hold a
  -- credential — and a lost key is re-registered, not recovered.
  key_hash           text,
  status             text NOT NULL DEFAULT 'pending',
  -- The store card's words, straight from the bundle's meta. Columns
  -- rather than jsonb so an app's vex read can select them like anything
  -- else on this table.
  title              text NOT NULL DEFAULT '',
  tagline            text NOT NULL DEFAULT '',
  description        text NOT NULL DEFAULT '',
  -- The listing page's long form, re-imported whole like everything else
  -- about a bundle. press holds the URLS THE HOST ANSWERED WITH at
  -- intake (copyPress), never the paths the bundle declared — the listing
  -- composes from host ground alone.
  story              jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlights         jsonb NOT NULL DEFAULT '[]'::jsonb,
  press              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- WHAT APPEARS WHERE, as one derived sentence (describePlacements) —
  -- printed by the approval card and the store tile from this one place.
  adds               text NOT NULL DEFAULT '',
  -- The one integration action the store may open: its settings screen.
  settings_action    text NOT NULL DEFAULT '',
  requested_actions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_data     jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_data      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- What it tells and hears (bundle offers/needs), beside the grants
  -- because they are the same kind of thing: the integration's declared
  -- statement, written at import, replaced on re-registration. moss
  -- never reads them; the host's bus does.
  offers             jsonb NOT NULL DEFAULT '[]'::jsonb,
  needs              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The verbs the integration gates on ({id, title}), for the host's role
  -- editor to grant. Beside offers/needs because it is the same kind of
  -- thing: a declaration written at import, replaced on re-registration,
  -- that moss never reads — the host does.
  capabilities       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- WHAT A BUILDER MAY SET per product — the closed-set field declaration,
  -- beside capabilities because it is the same kind of thing: a declaration
  -- written at import, replaced on re-registration, that moss never reads.
  -- The host renders a settings form from it and stores the values itself.
  configuration      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- WHAT AN ADD-ON LETS A PERSON EDIT — section types, fields, fragments,
  -- and a section model the host's editor renders. Beside configuration
  -- because it is the same kind of thing: a declaration written at import,
  -- replaced on re-registration, that moss never reads — the host does.
  documents          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- WHAT AN ADD-ON'S ASSISTANT KNOWS AND MAY DO — instructions, grounding,
  -- blocks, tools, what it applies to. Same kind of thing, same lifecycle;
  -- the host's assistant is the consumer.
  assistants         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- EVERY PATH THE PROXY MAY FORWARD, derived from the bundle at intake
  -- (reachOf). Beside the grants because it is one: a grant of reach, held
  -- by the same row, revoked by the same delete.
  reach              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Pages this integration serves and the host frames. Kept apart from reach
  -- because they are spent differently: reach is a screen's call carrying a
  -- session, a frame is a document GET carrying a grant.
  frames             jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_import_at     timestamptz,
  last_error         text
)
` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS reach jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS frames jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS phrasebook jsonb NOT NULL DEFAULT '{}'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS story jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS highlights jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS press jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS offers jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS needs jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS configuration jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `ALTER TABLE integrations ADD COLUMN IF NOT EXISTS assistants jsonb NOT NULL DEFAULT '[]'::jsonb` },
        { kind: 'sql', sql: `CREATE TABLE IF NOT EXISTS integration_actions (
  integration_id  text NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  action_id       text NOT NULL,
  definition      jsonb NOT NULL,
  -- The bindings, beside the artifact and never inside it: which host
  -- action this one rides (a panel), or which menu hub lists it. Empty
  -- means neither — reachable only through whatever else names it.
  -- preview is the rider's display endpoint (own-prefix, validated at
  -- intake): the host calls it with the offered ids to paint the strip.
  attach_to       text NOT NULL DEFAULT '',
  preview         text NOT NULL DEFAULT '',
  place_in        text NOT NULL DEFAULT '',
  PRIMARY KEY (integration_id, action_id)
)
` },
        ...GENERATION_DDL.map((sql) => ({ kind: 'sql' as const, sql })),
      ],
    },
    {
      description: 'Stored integration actions carry the grammar stamp their definition is written in',
      steps: [{ kind: 'sql', sql: `ALTER TABLE integration_actions ADD COLUMN grammar jsonb NOT NULL DEFAULT '{}'::jsonb` }],
    },
    // A KEY IS ONE INTEGRATION'S. A presented key is resolved to "the" row that
    // holds its hash, and nothing said there was only one. Rows that hold no
    // key (never issued one) are as many as there are, so the index leaves
    // them out.
    {
      description: 'No two integrations hold the hash of one key',
      steps: [{ kind: 'sql', sql: `CREATE UNIQUE INDEX integrations_key_hash_unique ON integrations (key_hash) WHERE key_hash IS NOT NULL` }],
    },
  ],
};
