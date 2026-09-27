import { useState, type FC } from 'react';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createPostgresCache, type PgPool } from '@niscorp/vex';
import { StrataError, type LedgerRow, type Sequence } from '@niscorp/strata';
import { migrate, readLedger } from '@niscorp/strata/postgres';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// The tables documents live in.
//
// A table cannot carry a stamp — it stays in one database — so the DATABASE
// remembers how far along it is: the ledger, one row per migration applied, with
// a checksum of what it did. Same rules as documents: append, never edit;
// refuse what newer code wrote.
//
// Each card runs the same deploys twice, on two real Postgres databases in this
// page: once with a plain migration counter — the way most apps do it — and once
// with strata.
// ═══════════════════════════════════════════════════════════

const sql = (s: string) => ({ kind: 'sql' as const, sql: s });
const PEOPLE = { description: 'People', steps: [sql('CREATE TABLE people (id text PRIMARY KEY, name text NOT NULL)')] };
const ARCHIVED = { description: 'People can be archived', steps: [sql('ALTER TABLE people ADD COLUMN archived_at timestamptz')] };
const V1: Sequence = { id: 'acme.app', migrations: [PEOPLE] };
const V2: Sequence = { id: 'acme.app', migrations: [PEOPLE, ARCHIVED] };

// ── the counter every app starts with ───────────────────────────
// One integer: how many migrations ran. Each statement on its own, no
// transaction, no memory of what a migration said.
const counterBoot = async (pool: PgPool, code: Sequence): Promise<string[]> => {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_version (n integer NOT NULL)');
  const current = await pool.query('SELECT n FROM schema_version');
  const at = Number(current.rows[0]?.['n'] ?? 0);
  if (current.rows.length === 0) await pool.query('INSERT INTO schema_version (n) VALUES (0)');
  const log: string[] = [];
  if (at >= code.migrations.length) log.push(`✓ schema_version is ${at}, the code has ${code.migrations.length} — nothing to do`);
  for (let i = at; i < code.migrations.length; i += 1) {
    const m = code.migrations[i];
    if (m === undefined) continue;
    for (const step of m.steps) if (step.kind === 'sql') await pool.query(step.sql);
    await pool.query('UPDATE schema_version SET n = $1', [i + 1]);
    log.push(`✓ ran #${i + 1} ${m.description}`);
  }
  return log;
};

const strataBoot = async (pool: PgPool, code: Sequence): Promise<string[]> => {
  const report = await migrate(pool, [code]);
  return report.applied.length === 0 ? ['✓ ledger matches the code — nothing to do'] : report.applied.map((m) => `✓ ran ${m.ref} ${m.description}`);
};

type Line = { ok: boolean | undefined; text: string };
type Side = { lines: readonly Line[]; columns: readonly string[] };

const columnsOf = async (pool: PgPool, table: string): Promise<string[]> => {
  const r = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [table]);
  return r.rows.map((row) => String(row['column_name']));
};

const errorText = (error: unknown): string =>
  error instanceof StrataError
    ? // A plan's refusal names each problem, already prefixed with its code, in `details`.
      error.details.length > 0 && error.details[0]?.startsWith(error.code) === true
      ? error.details.join(' — ')
      : `${error.code}: ${[error.message.split('\n')[0] ?? '', ...error.details].join(' — ')}`
    : error instanceof Error
      ? error.message
      : String(error);

// ── a card: the same deploys on two databases ───────────────────

type Deploy = { label: string; code: Sequence; request?: string };
type Story = { id: string; title: string; story: string; deploys: readonly Deploy[]; without: string; withStrata: string };

const STORIES: readonly Story[] = [
  {
    id: 'edited',
    title: 'Someone edits a migration that already ran',
    story: 'v2 is in production. A developer needs a phone number and, instead of appending, adds it to migration 1 — the one that creates the table. Tests pass: a fresh test database runs the edited migration 1.',
    deploys: [
      { label: 'Earlier: v2 is deployed', code: V2 },
      {
        label: 'Now: deploy the edited code',
        code: { id: 'acme.app', migrations: [{ description: 'People', steps: [sql('CREATE TABLE people (id text PRIMARY KEY, name text NOT NULL, phone text)')] }, ARCHIVED] },
        request: 'SELECT id, name, phone FROM people',
      },
    ],
    without: 'Boots happily — the counter says 2 of 2. The first request that reads phone fails, in production, for every user.',
    withStrata: 'Refused at boot, before a single request: migration 1’s checksum no longer matches what the database ran.',
  },
  {
    id: 'rollback',
    title: 'A deploy is rolled back',
    story: 'v3 renames name to full_name and ships. Something else in v3 is wrong, so the team redeploys v2 — onto a database v3 already migrated.',
    deploys: [
      { label: 'Earlier: v3 is deployed', code: { id: 'acme.app', migrations: [PEOPLE, ARCHIVED, { description: 'name → full_name', steps: [sql('ALTER TABLE people RENAME COLUMN name TO full_name')] }] } },
      { label: 'Now: roll back to v2', code: V2, request: "INSERT INTO people (id, name) VALUES ('p1', 'Ada')" },
    ],
    without: 'Boots — 3 is more than 2, so there is “nothing to do”. v2’s first write fails: the column it writes is gone.',
    withStrata: 'Refused at boot: the database is at 3 and this code knows 2 — it was migrated by newer code. Roll the database forward, or the code.',
  },
  {
    id: 'halfway',
    title: 'A migration fails halfway',
    story: 'v3’s migration has two steps: add an email column, then index a column that does not exist. The deploy fails; the developer fixes step two and deploys again.',
    deploys: [
      { label: 'Earlier: v2 is deployed', code: V2 },
      {
        label: 'Deploy v3 (step two is broken)',
        code: { id: 'acme.app', migrations: [PEOPLE, ARCHIVED, { description: 'People have an email', steps: [sql('ALTER TABLE people ADD COLUMN email text'), sql('CREATE INDEX people_email ON people (studio_email)')] }] },
      },
      {
        label: 'Fix step two and deploy again',
        code: { id: 'acme.app', migrations: [PEOPLE, ARCHIVED, { description: 'People have an email', steps: [sql('ALTER TABLE people ADD COLUMN email text'), sql('CREATE INDEX people_email ON people (email)')] }] },
        request: 'SELECT id, email FROM people',
      },
    ],
    without: 'Step one landed and step two did not, so the counter never moved. The fixed deploy runs step one again — “column already exists” — and is stuck until someone edits production by hand.',
    withStrata: 'The failed run was one transaction: nothing landed, nothing was recorded. The fixed deploy runs cleanly.',
  },
];

const Result: FC<{ side: Side | undefined }> = ({ side }) =>
  side === undefined ? (
    <div style={{ fontSize: 12.5, color: INK.faint }}>Not run yet.</div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.6, background: INK.wash, border: `1px solid ${INK.line}`, borderRadius: 10, padding: '8px 10px' }}>
        {side.lines.map((l, i) => (
          <div key={i} style={{ color: l.ok === undefined ? INK.soft : l.ok ? INK.text : INK.bad, fontWeight: l.ok === undefined ? 650 : 400, marginTop: l.ok === undefined && i > 0 ? 6 : 0 }}>
            {l.text}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: INK.soft, fontFamily: MONO }}>people: {side.columns.length === 0 ? '(no table)' : side.columns.join(' · ')}</div>
    </div>
  );

const StoryCard: FC<{ story: Story }> = ({ story }) => {
  const [step, setStep] = useState(0);
  const [pools, setPools] = useState<{ counter: PgPool; strata: PgPool }>();
  const [counter, setCounter] = useState<Side>();
  const [strata, setStrata] = useState<Side>();
  const [busy, setBusy] = useState(false);

  const runOne = async (pool: PgPool, boot: (p: PgPool, c: Sequence) => Promise<string[]>, deploy: Deploy, prior: Side | undefined): Promise<Side> => {
    const lines: Line[] = [...(prior?.lines ?? []), { ok: undefined, text: deploy.label }];
    let serving = true;
    try {
      for (const t of await boot(pool, deploy.code)) lines.push({ ok: true, text: t });
    } catch (error) {
      serving = false;
      lines.push({ ok: false, text: `✕ ${errorText(error)}` });
      lines.push({ ok: false, text: '  the server does not start' });
    }
    if (serving && deploy.request !== undefined) {
      try {
        await pool.query(deploy.request);
        lines.push({ ok: true, text: `✓ first request: ${deploy.request}` });
      } catch (error) {
        lines.push({ ok: false, text: `✕ first request: ${deploy.request}` });
        lines.push({ ok: false, text: `  ERROR ${errorText(error)}` });
      }
    }
    return { lines, columns: await columnsOf(pool, 'people') };
  };

  const next = async () => {
    const deploy = story.deploys[step];
    if (deploy === undefined) return;
    setBusy(true);
    const ready = pools ?? { counter: createPglitePool(new PGlite()), strata: createPglitePool(new PGlite()) };
    setPools(ready);
    const [c, s] = await Promise.all([runOne(ready.counter, counterBoot, deploy, counter), runOne(ready.strata, strataBoot, deploy, strata)]);
    setCounter(c);
    setStrata(s);
    setStep((n) => n + 1);
    setBusy(false);
  };

  const reset = () => {
    setStep(0);
    setPools(undefined);
    setCounter(undefined);
    setStrata(undefined);
  };

  const finished = step >= story.deploys.length;
  const upcoming = story.deploys[step];

  return (
    <Panel title={story.title}>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: INK.soft }}>{story.story}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {story.deploys.map((d, i) => (
          <Chip key={d.label} tone={i < step ? 'ok' : i === step ? 'accent' : 'idle'}>
            {i < step ? '✓ ' : `${i + 1}. `}
            {d.label}
          </Chip>
        ))}
        <span style={{ flex: 1 }} />
        {finished ? (
          <Btn kind="quiet" onClick={reset}>
            Run it again
          </Btn>
        ) : (
          <Btn kind="primary" disabled={busy} onClick={() => void next()}>
            {upcoming?.label.replace(/^(Earlier|Now): /, '') ?? ''}
          </Btn>
        )}
      </div>
      <Grid min={300} gap={12}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 650 }}>A migration counter</span>
            <span style={{ fontSize: 12, color: INK.faint }}>schema_version = n</span>
          </div>
          <Result side={counter} />
          {finished && <Callout tone="bad">{story.without}</Callout>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 650 }}>strata</span>
            <span style={{ fontSize: 12, color: INK.faint }}>a ledger of what ran, checksummed</span>
          </div>
          <Result side={strata} />
          {finished && <Callout tone="ok">{story.withStrata}</Callout>}
        </div>
      </Grid>
    </Panel>
  );
};

// ── the basics: a ledger ────────────────────────────────────────

const LedgerBasics: FC = () => {
  const [pool, setPool] = useState<PgPool>();
  const [ledger, setLedger] = useState<readonly LedgerRow[]>([]);
  const [columns, setColumns] = useState<readonly string[]>([]);
  const [log, setLog] = useState<readonly string[]>([]);
  const [stage, setStage] = useState(0);

  const STAGES: readonly { label: string; code: Sequence }[] = [
    { label: 'Deploy v1', code: V1 },
    { label: 'Deploy v2', code: V2 },
    { label: 'Restart v2', code: V2 },
  ];

  const go = async () => {
    const s = STAGES[stage];
    if (s === undefined) return;
    const p = pool ?? createPglitePool(new PGlite());
    setPool(p);
    const report = await migrate(p, [s.code]);
    setLog((l) => [...l, `${s.label}: ${report.applied.length === 0 ? 'nothing to do' : `ran ${report.applied.map((m) => m.ref).join(', ')}`}`]);
    setLedger(await readLedger(p));
    setColumns(await columnsOf(p, 'people'));
    setStage((n) => n + 1);
  };

  return (
    <Panel title="The ledger, in three deploys" aside="one database, the runner a server uses">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {stage < STAGES.length ? (
          <Btn kind="primary" onClick={() => void go()}>
            {STAGES[stage]?.label}
          </Btn>
        ) : (
          <Btn
            kind="quiet"
            onClick={() => {
              setPool(undefined);
              setLedger([]);
              setColumns([]);
              setLog([]);
              setStage(0);
            }}
          >
            Start over
          </Btn>
        )}
        {log.map((l) => (
          <Chip key={l} tone="ok">
            {l}
          </Chip>
        ))}
      </div>
      <Grid min={300} gap={12}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: INK.soft }}>strata_ledger</div>
          <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'hidden', fontFamily: MONO, fontSize: 11.5 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.6fr', background: INK.wash, padding: '6px 10px', color: INK.faint }}>
              <span>migration</span>
              <span>checksum</span>
              <span>description</span>
            </div>
            {ledger.length === 0 ? (
              <div style={{ padding: '8px 10px', color: INK.faint }}>empty — never migrated</div>
            ) : (
              ledger.map((r) => (
                <div key={`${r.sequence}/${r.n}`} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.6fr', padding: '6px 10px', borderTop: `1px solid ${INK.line}` }}>
                  <span>
                    {r.sequence}/{r.n}
                  </span>
                  <span style={{ color: INK.faint }}>{r.checksum.slice(0, 10)}…</span>
                  <span>{r.description}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: INK.soft }}>people</div>
          <div style={{ fontFamily: MONO, fontSize: 12, padding: '8px 10px', border: `1px solid ${INK.line}`, borderRadius: 10 }}>
            {columns.length === 0 ? <span style={{ color: INK.faint }}>no table yet</span> : columns.join(' · ')}
          </div>
          <div style={{ fontSize: 12.5, color: INK.soft, lineHeight: 1.55 }}>
            A migration’s number is its position; the version is the count. The checksum covers what a migration <i>does</i> — rewording its
            description or a comment is not editing it.
          </div>
        </div>
      </Grid>
    </Panel>
  );
};

// ── adopting a database from before strata ──────────────────────

const Adopt: FC = () => {
  const [before, setBefore] = useState<{ columns: readonly string[]; keys: readonly string[] }>();
  const [after, setAfter] = useState<{ columns: readonly string[]; keys: readonly string[]; applied: readonly string[] }>();

  const run = async () => {
    const pool = createPglitePool(new PGlite());
    await pool.query(`CREATE TABLE vex_cache (
      key text PRIMARY KEY, kind text NOT NULL DEFAULT 'ok', intent text, shape jsonb, dsl jsonb, prism_ir jsonb,
      reason text, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, schema_fingerprint text)`);
    await pool.query("INSERT INTO vex_cache (key, intent) VALUES ('bookings/today', 'Bookings for today'), ('members/active', 'Active members')");
    const keys = async () => (await pool.query('SELECT key FROM vex_cache ORDER BY key')).rows.map((r) => String(r['key']));
    setBefore({ columns: await columnsOf(pool, 'vex_cache'), keys: await keys() });
    // The sequence vex ships — its migration 1 is the IF NOT EXISTS DDL every boot used to run.
    const sequence = createPostgresCache({ pool: { query: async () => ({ rows: [] }) } }).sequence;
    const report = await migrate(pool, [sequence]);
    setAfter({ columns: await columnsOf(pool, 'vex_cache'), keys: await keys(), applied: report.applied.map((m) => `${m.ref} ${m.description}`) });
  };

  const added = after === undefined || before === undefined ? [] : after.columns.filter((c) => !before.columns.includes(c));

  return (
    <Panel title="Adopting a database from before strata" aside="vex’s real cache table">
      <div style={{ fontSize: 13.5, color: INK.soft, lineHeight: 1.55 }}>
        A deployment that has not booted in months: its <Mono>vex_cache</Mono> predates five columns, and holds two cached reads nobody wants to lose.
        Every package’s migration 1 is the <Mono>IF NOT EXISTS</Mono> DDL its boot used to run, so adopting is just booting: it converges whatever shape
        it finds, keeps the rows, and is recorded — no “mark as applied”.
      </div>
      <div>
        <Btn kind="primary" onClick={() => void run()}>
          {after === undefined ? 'Boot it with strata' : 'Again, from the old shape'}
        </Btn>
      </div>
      {before !== undefined && (
        <Grid min={300} gap={12}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <b>Columns</b>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {before.columns.map((c) => (
                <Chip key={c} mono>
                  {c}
                </Chip>
              ))}
              {added.map((c) => (
                <Chip key={c} tone="ok" mono>
                  + {c}
                </Chip>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <b>Rows</b>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(after?.keys ?? before.keys).map((k) => (
                <Chip key={k} tone={after === undefined ? 'idle' : 'ok'} mono>
                  {after === undefined ? '' : '✓ '}
                  {k}
                </Chip>
              ))}
            </div>
            {after !== undefined && <Code maxHeight={80}>{after.applied.map((a) => `ran ${a}`).join('\n')}</Code>}
          </div>
        </Grid>
      )}
    </Panel>
  );
};

export const Tables: FC = () => (
  <Page>
    <Lead eyebrow="The tables they live in" title="The containers follow the same rules as what they hold.">
      Documents carry their version. A table cannot — it stays in one database — so the database remembers instead: the <b>ledger</b>, one row per
      migration applied, with a checksum of what it did. Append, never edit; refuse what newer code wrote. Each card below runs the same deploys on two
      real Postgres databases in this page: one with the migration counter most apps use, one with strata.
    </Lead>
    <LedgerBasics />
    {STORIES.map((s) => (
      <StoryCard key={s.id} story={s} />
    ))}
    <Adopt />
  </Page>
);
