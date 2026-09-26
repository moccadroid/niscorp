import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { PgPool } from '@niscorp/vex';
import { StrataError, type LedgerRow, type Plan, type Sequence } from '@niscorp/strata';
import { migrate, readLedger, status } from '@niscorp/strata/postgres';

// ═══════════════════════════════════════════════════════════
// The Strata Lab — the surface every strata story drives.
//
// Everything here is real: a real Postgres (PGlite, in this page), the real
// runner, the real ledger. The only thing a story authors is THE CODE — the
// sequences a deployment ships — and the edits a developer might make to it:
// append a migration, touch one that already ran, reword a comment, break a
// step. Then boot, the way a server would, and see what strata does.
// ═══════════════════════════════════════════════════════════

export type CodeEdit = {
  label: string;
  // What this edit is, in a sentence — shown when it is applied.
  hint: string;
  apply: (code: readonly Sequence[]) => readonly Sequence[];
};

export type StrataLabProps = {
  code: readonly Sequence[];
  // Statements run on every fresh database before anything else: a deployment
  // as it was before this code — or before strata — ever touched it.
  setup?: { label: string; sql: readonly string[] };
  edits?: readonly CodeEdit[];
  // The tables to show (columns and row count), besides the ledger.
  tables: readonly string[];
  note?: string;
};

type TableView = { name: string; columns: readonly string[]; rows: number } | { name: string; absent: true };
type LogLine = { id: number; tone: 'ok' | 'bad' | 'idle'; title: string; detail: readonly string[] };

const C = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 12, padding: 20, fontSize: 13 },
  panel: { border: '1px solid var(--sr-border, #2a2a33)', borderRadius: 10, overflow: 'hidden' as const, minWidth: 0 },
  head: {
    padding: '8px 12px',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    opacity: 0.6,
    borderBottom: '1px solid var(--sr-border, #2a2a33)',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
  },
  body: { padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 8 },
  cols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 },
  mono: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap' as const,
    padding: 12,
    borderRadius: 10,
    border: '1px solid rgba(129,140,248,0.35)',
    background: 'rgba(129,140,248,0.08)',
  },
  btn: (accent: boolean, active = false) => ({
    padding: '5px 11px',
    borderRadius: 7,
    border: '1px solid',
    borderColor: accent || active ? 'rgba(129,140,248,0.6)' : 'var(--sr-border, #2a2a33)',
    background: accent ? 'rgba(129,140,248,0.16)' : active ? 'rgba(129,140,248,0.08)' : 'transparent',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  }),
  tag: (tone: 'ok' | 'warn' | 'bad' | 'idle') => ({
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11,
    padding: '1px 7px',
    borderRadius: 999,
    border: '1px solid',
    whiteSpace: 'nowrap' as const,
    borderColor:
      tone === 'ok' ? 'rgba(52,211,153,0.45)' : tone === 'bad' ? 'rgba(248,113,113,0.5)' : tone === 'warn' ? 'rgba(251,191,36,0.5)' : 'var(--sr-border, #2a2a33)',
    background: tone === 'ok' ? 'rgba(52,211,153,0.12)' : tone === 'bad' ? 'rgba(248,113,113,0.1)' : tone === 'warn' ? 'rgba(251,191,36,0.1)' : 'transparent',
    opacity: tone === 'idle' ? 0.6 : 1,
  }),
  line: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' as const },
  empty: { opacity: 0.45, fontSize: 12, fontStyle: 'italic' as const },
  sql: {
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11,
    whiteSpace: 'pre-wrap' as const,
    opacity: 0.75,
    margin: '4px 0 0',
    padding: 8,
    borderRadius: 6,
    background: 'rgba(127,127,127,0.08)',
    overflowX: 'auto' as const,
  },
  note: { fontSize: 12, opacity: 0.75, lineHeight: 1.5 },
};

type MigrationState = 'applied' | 'pending' | 'edited';

const stateOf = (ref: string, plan: Plan | undefined, ledger: readonly LedgerRow[]): MigrationState => {
  if (plan?.problems.some((p) => p.code === 'EDITED' && p.detail.startsWith(ref))) return 'edited';
  if (ledger.some((row) => `${row.sequence}/${row.n}` === ref)) return 'applied';
  return 'pending';
};

const toneOf: Record<MigrationState, 'ok' | 'bad' | 'idle'> = { applied: 'ok', pending: 'idle', edited: 'bad' };

const tablesOf = async (pool: PgPool, names: readonly string[]): Promise<TableView[]> =>
  Promise.all(
    names.map(async (name): Promise<TableView> => {
      const present = await pool.query('SELECT to_regclass($1) IS NOT NULL AS present', [name]);
      if (present.rows[0]?.['present'] !== true) return { name, absent: true };
      const cols = await pool.query(
        'SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
        [name],
      );
      const count = await pool.query(`SELECT count(*)::int AS n FROM "${name}"`);
      return { name, columns: cols.rows.map((r) => String(r['column_name'])), rows: Number(count.rows[0]?.['n'] ?? 0) };
    }),
  );

export const StrataLab: FC<StrataLabProps> = ({ code: initialCode, setup, edits = [], tables, note }) => {
  const db = useRef<{ pool: PgPool } | null>(null);
  const logId = useRef(0);
  const [code, setCode] = useState<readonly Sequence[]>(initialCode);
  const [applied, setApplied] = useState<readonly string[]>([]);
  const [plan, setPlan] = useState<Plan>();
  const [ledger, setLedger] = useState<readonly LedgerRow[]>([]);
  const [views, setViews] = useState<readonly TableView[]>([]);
  const [log, setLog] = useState<readonly LogLine[]>([]);
  const [busy, setBusy] = useState(true);

  const say = useCallback((line: Omit<LogLine, 'id'>) => {
    logId.current += 1;
    const id = logId.current;
    setLog((prev) => [{ ...line, id }, ...prev].slice(0, 12));
  }, []);

  const refresh = useCallback(
    async (current: readonly Sequence[]) => {
      const pool = db.current?.pool;
      if (pool === undefined) return;
      setPlan(await status(pool, current));
      setLedger(await readLedger(pool));
      setViews(await tablesOf(pool, tables));
    },
    [tables],
  );

  const freshDatabase = useCallback(async () => {
    setBusy(true);
    const pool = createPglitePool(new PGlite());
    for (const sql of setup?.sql ?? []) await pool.query(sql);
    db.current = { pool };
    setLog([]);
    if (setup !== undefined) say({ tone: 'idle', title: setup.label, detail: [] });
    await refresh(code);
    setBusy(false);
  }, [code, refresh, say, setup]);

  // One database per mount — deliberately not re-run when the code changes:
  // editing the code and booting again against the SAME database is the point.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void freshDatabase();
  }, [freshDatabase]);

  const boot = async (mode: 'apply' | 'verify') => {
    const pool = db.current?.pool;
    if (pool === undefined) return;
    setBusy(true);
    try {
      const report = await migrate(pool, code, { mode });
      say(
        report.applied.length === 0
          ? { tone: 'idle', title: `boot · ${mode} — nothing pending`, detail: [] }
          : { tone: 'ok', title: `boot · ${mode} — applied ${report.applied.length}`, detail: report.applied.map((m) => `${m.ref}  ${m.description}`) },
      );
    } catch (error) {
      say(
        error instanceof StrataError
          ? { tone: 'bad', title: `boot · ${mode} — refused: ${error.code}`, detail: [error.message.split('\n')[0] ?? '', ...error.details] }
          : { tone: 'bad', title: `boot · ${mode} — ${String(error)}`, detail: [] },
      );
    }
    await refresh(code);
    setBusy(false);
  };

  const edit = async (target: CodeEdit) => {
    const next = target.apply(code);
    setCode(next);
    setApplied((prev) => [...prev, target.label]);
    say({ tone: 'idle', title: `code · ${target.label}`, detail: [target.hint] });
    setBusy(true);
    await refresh(next);
    setBusy(false);
  };

  const resetCode = async () => {
    setCode(initialCode);
    setApplied([]);
    say({ tone: 'idle', title: 'code · back to what shipped', detail: [] });
    await refresh(initialCode);
  };

  return (
    <div style={C.wrap}>
      <div style={C.bar}>
        <button type="button" style={C.btn(true)} disabled={busy} onClick={() => void boot('apply')}>
          Boot · apply
        </button>
        <button type="button" style={C.btn(false)} disabled={busy} onClick={() => void boot('verify')}>
          Boot · verify
        </button>
        <span style={{ opacity: 0.35 }}>│</span>
        {edits.map((e) => (
          <button
            key={e.label}
            type="button"
            title={e.hint}
            style={C.btn(false, applied.includes(e.label))}
            disabled={busy || applied.includes(e.label)}
            onClick={() => void edit(e)}
          >
            {e.label}
          </button>
        ))}
        {edits.length > 0 && (
          <button type="button" style={C.btn(false)} disabled={busy || applied.length === 0} onClick={() => void resetCode()}>
            Undo code edits
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" style={C.btn(false)} disabled={busy} onClick={() => void freshDatabase()}>
          New database
        </button>
      </div>

      {note !== undefined && <div style={C.note}>{note}</div>}

      <div style={C.cols}>
        <div style={C.panel}>
          <div style={C.head}>
            <span>The code — what this deployment ships</span>
          </div>
          <div style={C.body}>
            {code.map((sequence) => (
              <div key={sequence.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ ...C.mono, fontWeight: 600 }}>
                  {sequence.id} <span style={{ opacity: 0.5, fontWeight: 400 }}>· version {sequence.migrations.length}</span>
                </div>
                {sequence.migrations.map((migration, index) => {
                  const ref = `${sequence.id}/${index + 1}`;
                  const state = stateOf(ref, plan, ledger);
                  return (
                    <details key={ref}>
                      <summary style={{ ...C.line, cursor: 'pointer' }}>
                        <span style={C.tag(toneOf[state])}>{state}</span>
                        <span style={C.mono}>/{index + 1}</span>
                        <span>{migration.description}</span>
                      </summary>
                      {migration.steps.length === 0 ? (
                        <div style={C.empty}>A marker — moves the version, runs nothing.</div>
                      ) : (
                        migration.steps.map((step, i) => (
                          <pre key={i} style={C.sql}>
                            {step.kind === 'sql' ? step.sql : `document step on ${step.at}\n${JSON.stringify(step.transform, null, 2)}`}
                          </pre>
                        ))
                      )}
                    </details>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div style={C.panel}>
          <div style={C.head}>
            <span>The ledger — strata_ledger</span>
            <span>{ledger.length} rows</span>
          </div>
          <div style={C.body}>
            {ledger.length === 0 ? (
              <div style={C.empty}>Empty — this database has never been migrated.</div>
            ) : (
              ledger.map((row) => (
                <div key={`${row.sequence}/${row.n}`} style={C.line}>
                  <span style={C.mono}>
                    {row.sequence}/{row.n}
                  </span>
                  <span style={{ ...C.mono, opacity: 0.5 }} title={row.checksum}>
                    {row.checksum.slice(0, 10)}…
                  </span>
                  <span style={{ opacity: 0.8 }}>{row.description}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={C.cols}>
        <div style={C.panel}>
          <div style={C.head}>
            <span>The database</span>
          </div>
          <div style={C.body}>
            {views.map((view) =>
              'absent' in view ? (
                <div key={view.name} style={C.line}>
                  <span style={{ ...C.mono, fontWeight: 600 }}>{view.name}</span>
                  <span style={C.tag('idle')}>absent</span>
                </div>
              ) : (
                <div key={view.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={C.line}>
                    <span style={{ ...C.mono, fontWeight: 600 }}>{view.name}</span>
                    <span style={C.tag('idle')}>
                      {view.rows} row{view.rows === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div style={{ ...C.mono, opacity: 0.7, lineHeight: 1.6 }}>{view.columns.join(' · ')}</div>
                </div>
              ),
            )}
          </div>
        </div>

        <div style={C.panel}>
          <div style={C.head}>
            <span>What happened</span>
            {plan !== undefined && (
              <span>
                {plan.pending.length} pending{plan.problems.length > 0 ? ` · ${plan.problems.length} problem${plan.problems.length === 1 ? '' : 's'}` : ''}
              </span>
            )}
          </div>
          <div style={C.body}>
            {log.length === 0 ? (
              <div style={C.empty}>Nothing yet. Boot.</div>
            ) : (
              log.map((line) => (
                <div key={line.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={C.line}>
                    <span style={C.tag(line.tone)}>{line.tone === 'ok' ? 'ok' : line.tone === 'bad' ? 'refused' : '·'}</span>
                    <span>{line.title}</span>
                  </div>
                  {line.detail.map((d, i) => (
                    <div key={i} style={{ ...C.mono, opacity: 0.7, paddingLeft: 12 }}>
                      {d}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
