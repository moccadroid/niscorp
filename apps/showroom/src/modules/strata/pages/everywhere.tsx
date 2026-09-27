import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { PgPool } from '@niscorp/vex';
import { StrataError, type Sequence, type Stamp, type UpgradeResult } from '@niscorp/strata';
import { migrate } from '@niscorp/strata/postgres';
import { planSourceUpgrade, renderReport, verifySourceUpgrade, type SourcePlan, type VerifyResult } from '@niscorp/strata/upgrade';
import { classesAt, KIND, LATEST, RELEASES, stampAt, upgraderAt, type Doc } from '../world/acme';
import { Phone, PhoneStyles } from '../world/kit';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel, stampText } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// One change, everywhere it lives.
//
// The same Classes screen in the three places a nisc document sits: a row in the
// database (its stamp in a column beside it), a file in the repo (the repo's
// stamp is strata.lock.json), and a submission arriving over the wire (the stamp
// in the envelope). Deploy the next release and watch each catch up by the same
// rule — or refuse.
// ═══════════════════════════════════════════════════════════

// The table the row lives in is itself a strata sequence — the containers follow
// the same rules as what they hold.
const ACME_APP: Sequence = {
  id: 'acme.app',
  migrations: [
    {
      description: 'Screens add-ons save',
      steps: [{ kind: 'sql', sql: 'CREATE TABLE screens (\n  id         text PRIMARY KEY,\n  definition jsonb NOT NULL,\n  grammar    jsonb NOT NULL\n)' }],
    },
  ],
};

const FIRST_HOST = 1;
const PARTNER_RELEASE = LATEST;
const SOURCE_FILE = 'src/app/actions/classes/classes.action.ts';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const stampOf = (v: unknown): Stamp =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).flatMap(([k, n]) => (typeof n === 'number' ? [[k, n]] : []))) : {};
const nameOf = (n: number): string => RELEASES[n]?.name ?? `r${n}`;

type Read = { ok: true; result: UpgradeResult } | { ok: false; code: string; details: readonly string[] };
const readWith = async (release: number, document: Doc, stamp: Stamp): Promise<Read> => {
  try {
    return { ok: true, result: (await upgraderAt(release)).upgrade(document, { kind: KIND, stamp }) };
  } catch (error) {
    return error instanceof StrataError ? { ok: false, code: error.code, details: error.details } : { ok: false, code: 'ERROR', details: [String(error)] };
  }
};

const Ran: FC<{ read: Read | undefined }> = ({ read }) =>
  read === undefined ? null : read.ok ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {read.result.applied.length === 0 ? (
        <Chip>current — nothing ran</Chip>
      ) : (
        read.result.applied.map((ref) => (
          <Chip key={ref} tone="ok" mono>
            ✓ {ref}
          </Chip>
        ))
      )}
    </div>
  ) : (
    <Chip tone="bad" mono>
      ✕ {read.code}
    </Chip>
  );

const Step: FC<{ n: number; title: string; children: ReactNode; done?: boolean }> = ({ n, title, children, done = false }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 10 }}>
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        fontSize: 11,
        fontWeight: 700,
        background: done ? INK.ok : INK.accentWash,
        color: done ? '#fff' : INK.accent,
      }}
    >
      {done ? '✓' : n}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 650 }}>{title}</div>
      {children}
    </div>
  </div>
);

// ── the row ─────────────────────────────────────────────────────

const RowLane: FC<{ host: number; epoch: number }> = ({ host, epoch }) => {
  const db = useRef<PgPool | null>(null);
  const [row, setRow] = useState<{ document: Doc; stamp: Stamp }>();
  const [read, setRead] = useState<Read>();
  const [sql, setSql] = useState<readonly string[]>([]);

  const load = useCallback(async () => {
    const pool = db.current;
    if (pool === null) return;
    const result = await pool.query("SELECT definition, grammar FROM screens WHERE id = 'acme.classes'");
    const first = result.rows[0];
    if (first === undefined || !isRecord(first['definition'])) return;
    setRow({ document: first['definition'], stamp: stampOf(first['grammar']) });
  }, []);

  useEffect(() => {
    let live = true;
    db.current = null;
    setRow(undefined);
    setRead(undefined);
    setSql([]);
    void (async () => {
      const pool = createPglitePool(new PGlite());
      await migrate(pool, [ACME_APP]);
      await pool.query('INSERT INTO screens (id, definition, grammar) VALUES ($1, $2::jsonb, $3::jsonb)', [
        'acme.classes',
        JSON.stringify(await classesAt(0)),
        JSON.stringify(stampAt(0)),
      ]);
      if (!live) return;
      db.current = pool;
      setSql(["INSERT INTO screens … -- March: an add-on saves its screen, grammar = kit 0"]);
      await load();
    })();
    return () => {
      live = false;
    };
  }, [epoch, load]);

  useEffect(() => {
    if (row === undefined) return;
    let live = true;
    void readWith(host, row.document, row.stamp).then((r) => live && setRead(r));
    return () => {
      live = false;
    };
  }, [row, host]);

  const saveBack = async () => {
    const pool = db.current;
    if (pool === null || read?.ok !== true) return;
    await pool.query("UPDATE screens SET definition = $1::jsonb, grammar = $2::jsonb WHERE id = 'acme.classes'", [
      JSON.stringify(read.result.document),
      JSON.stringify(read.result.stamp),
    ]);
    setSql((s) => [...s, `UPDATE screens SET definition = …, grammar = '${JSON.stringify(read.result.stamp)}'`]);
    await load();
  };

  return (
    <Panel title="① A row in the database" aside="the stamp is a column">
      <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.55 }}>
        An add-on saved this screen in March. Its stamp sits beside it in the row, and the row is read by whatever release is running.
      </div>
      <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'hidden', fontFamily: MONO, fontSize: 11.5 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr', background: INK.wash, padding: '6px 10px', color: INK.faint }}>
          <span>id</span>
          <span>grammar</span>
          <span>definition</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr', padding: '8px 10px', alignItems: 'center' }}>
          <span>acme.classes</span>
          <span style={{ color: INK.accent, fontWeight: 600 }}>{row === undefined ? '…' : stampText(row.stamp)}</span>
          <span style={{ color: INK.faint }}>{'{ … }'}</span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: INK.soft }}>
        Read by <b>{nameOf(host)}</b>:
      </div>
      <Ran read={read} />
      <div style={{ display: 'flex', justifyContent: 'center' }}>{read?.ok === true && <Phone document={read.result.document} release={host} tone="ok" width={260} />}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn onClick={() => void saveBack()} disabled={read?.ok !== true || read.result.applied.length === 0}>
          Save it back
        </Btn>
        <span style={{ fontSize: 12, color: INK.faint }}>Optional. Unsaved, it is upgraded on every read — and still correct.</span>
      </div>
      <Code maxHeight={110}>{sql.join('\n')}</Code>
    </Panel>
  );
};

// ── the repo ────────────────────────────────────────────────────

const SourceLane: FC<{ host: number; epoch: number }> = ({ host, epoch }) => {
  const [lock, setLock] = useState(FIRST_HOST);
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<SourcePlan>();
  const [verified, setVerified] = useState<VerifyResult>();
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    let live = true;
    void classesAt(FIRST_HOST).then((doc) => {
      if (!live) return;
      setLock(FIRST_HOST);
      setText(JSON.stringify(doc, null, 2));
      setPlan(undefined);
      setVerified(undefined);
      setProblem(undefined);
    });
    return () => {
      live = false;
    };
  }, [epoch]);

  // A new release makes any earlier report stale.
  useEffect(() => {
    setPlan(undefined);
    setVerified(undefined);
  }, [host]);

  const behind = lock < host;
  const parsed = (): Doc | undefined => {
    try {
      const value: unknown = JSON.parse(text);
      if (!isRecord(value)) throw new Error('an action is a JSON object');
      setProblem(undefined);
      return value;
    } catch (error) {
      setProblem(`The file does not parse: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };
  const artifact = (document: Doc) => ({ kind: KIND, id: 'acme.classes', document, file: SOURCE_FILE });

  const upgrade = async () => {
    const document = parsed();
    if (document === undefined) return;
    setVerified(undefined);
    const describe = (ref: string): string => RELEASES.find((r) => `acme.kit/${r.n}` === ref)?.change ?? '';
    setPlan(await planSourceUpgrade({ upgrader: await upgraderAt(host), stamp: stampAt(lock), documents: [artifact(document)], describe }));
  };

  const letAgentEdit = () => {
    const expected = plan?.documents[0]?.expected;
    if (expected !== undefined) setText(JSON.stringify(expected, null, 2));
  };

  const verify = async () => {
    const document = parsed();
    if (document === undefined || plan === undefined) return;
    const result = verifySourceUpgrade({ plan, upgrader: await upgraderAt(host), documents: [artifact(document)] });
    setVerified(result);
    if (result.ok) setLock(host);
  };

  const expected = plan?.documents[0]?.expected;
  const current = (() => {
    try {
      const v: unknown = JSON.parse(text);
      return isRecord(v) ? v : undefined;
    } catch {
      return undefined;
    }
  })();

  return (
    <Panel title="② A file in your repo" aside="the stamp is strata.lock.json">
      <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.55 }}>
        The app’s own copy of the screen, in source. strata will not rewrite your TypeScript — it says exactly what the file must become, and holds
        the edit to it.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontFamily: MONO, fontSize: 12 }}>
        <span>strata.lock.json:</span>
        <Chip tone={behind ? 'warn' : 'ok'} mono>
          {nameOf(lock)} · {stampText(stampAt(lock))}
        </Chip>
      </div>
      {!behind ? (
        <>
          <Callout tone="ok" title="✓ pnpm check:sources">
            The source is written at {nameOf(lock)}, the release it builds. Nothing to do.
          </Callout>
          <div style={{ display: 'flex', justifyContent: 'center' }}>{current !== undefined && <Phone document={current} release={host} tone="ok" width={260} />}</div>
        </>
      ) : (
        <>
          <Callout tone="bad" title="✕ pnpm check:sources — the build stops here">
            The source is written at {nameOf(lock)}; the app now builds {nameOf(host)}. Shipping it as is would draw it wrong.
          </Callout>
          <Step n={1} title="strata upgrade — work out the exact JSON" done={plan !== undefined}>
            <div>
              <Btn kind={plan === undefined ? 'primary' : 'plain'} onClick={() => void upgrade()}>
                Run strata upgrade
              </Btn>
            </div>
            {plan !== undefined && (
              <Code maxHeight={200}>{renderReport(plan, (d) => `.strata/upgrade/expected/${d.kind.replace('/', '_')}/${d.id}.json`)}</Code>
            )}
          </Step>
          <Step n={2} title="Edit the file — by hand, or hand the report to an agent" done={expected !== undefined && JSON.stringify(current) === JSON.stringify(expected)}>
            <textarea
              value={text}
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value);
                setVerified(undefined);
              }}
              style={{ fontFamily: MONO, fontSize: 11, minHeight: 170, width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${INK.line}`, padding: 10, resize: 'vertical', background: INK.wash, color: INK.text }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn onClick={letAgentEdit} disabled={expected === undefined}>
                Let an agent apply the report
              </Btn>
            </div>
          </Step>
          <Step n={3} title="strata verify — the lock moves only if the edit is exact" done={verified?.ok === true}>
            <div>
              <Btn kind={expected !== undefined ? 'primary' : 'plain'} onClick={() => void verify()} disabled={plan === undefined}>
                Run strata verify
              </Btn>
            </div>
            {verified !== undefined && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: MONO, fontSize: 11.5 }}>
                {verified.lines.map((l, i) => (
                  <div key={i}>
                    <div style={{ color: l.ok ? INK.ok : INK.bad }}>
                      [{l.ok ? 'pass' : 'fail'}] {l.text}
                    </div>
                    {(l.detail ?? []).map((d) => (
                      <div key={d} style={{ color: INK.soft, paddingLeft: 16 }}>
                        {d}
                      </div>
                    ))}
                  </div>
                ))}
                {!verified.ok && <div style={{ color: INK.bad, marginTop: 4 }}>The lock stays at {nameOf(lock)}. Edit, then verify again.</div>}
              </div>
            )}
          </Step>
        </>
      )}
      {problem !== undefined && <div style={{ color: INK.bad, fontFamily: MONO, fontSize: 12 }}>{problem}</div>}
    </Panel>
  );
};

// ── the wire ────────────────────────────────────────────────────

const WireLane: FC<{ host: number }> = ({ host }) => {
  const [doc, setDoc] = useState<Doc>();
  const [read, setRead] = useState<Read>();
  const [guess, setGuess] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const d = await classesAt(PARTNER_RELEASE);
      const r = await readWith(host, d, stampAt(PARTNER_RELEASE));
      if (!live) return;
      setDoc(d);
      setRead(r);
    })();
    return () => {
      live = false;
    };
  }, [host]);

  return (
    <Panel title="③ Arriving over the wire" aside="the stamp is in the envelope">
      <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.55 }}>
        Partner Co. built their add-on against Acme <b>{nameOf(PARTNER_RELEASE)}</b> and submits the screen, stamped. The host reads it at intake.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontFamily: MONO, fontSize: 12 }}>
        <span>stamp:</span>
        <Chip tone="accent" mono>
          {stampText(stampAt(PARTNER_RELEASE))}
        </Chip>
      </div>
      <Ran read={read} />
      {read?.ok === false ? (
        <>
          <Callout tone="bad" title="Refused at intake — update the host first">
            This host runs {nameOf(host)} and has never seen what {nameOf(PARTNER_RELEASE)} changed. It says so, by name, before anything renders:
            <div style={{ fontFamily: MONO, fontSize: 11.5, marginTop: 6, color: INK.bad }}>{read.details.join('; ')}</div>
          </Callout>
          <div>
            <Btn kind="quiet" onClick={() => setGuess((g) => !g)}>
              {guess ? 'Hide' : 'Show'} what a host that guessed would render
            </Btn>
          </div>
          {guess && doc !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Phone document={doc} release={host} tone="bad" width={260} />
            </div>
          )}
        </>
      ) : read?.ok === true ? (
        <>
          <Callout tone="ok" title="Accepted">
            The host caught up to {nameOf(host)}; the same submission is now read as written.
          </Callout>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Phone document={read.result.document} release={host} tone="ok" width={260} />
          </div>
        </>
      ) : null}
    </Panel>
  );
};

// ── the page ────────────────────────────────────────────────────

export const Everywhere: FC = () => {
  const [host, setHost] = useState(FIRST_HOST);
  const [epoch, setEpoch] = useState(0);
  const next = RELEASES[host + 1];

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="One change, everywhere it lives" title="A document is stored, committed and sent. One rule catches up all three.">
        The Classes screen lives in three places at once: a database row, a file in the repo, a submission from a partner’s add-on. Each carries a
        stamp — how far along its writer was. Deploy the next release and watch: the row is upgraded on read, the repo is walked through an exact edit,
        and the submission from the future waits until the host catches up.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 650 }}>Acme’s host is running</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {RELEASES.map((r) => (
              <Chip key={r.n} tone={r.n === host ? 'accent' : r.n < host ? 'idle' : 'idle'} mono>
                {r.n === host ? '● ' : ''}
                {r.name}
                {r.n > 0 ? ` · ${r.change}` : ''}
              </Chip>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <Btn kind="primary" disabled={next === undefined} onClick={() => setHost((h) => Math.min(h + 1, LATEST))}>
            {next === undefined ? 'Latest release deployed' : `Deploy ${next.name} — ${next.change}`}
          </Btn>
          <Btn
            kind="quiet"
            onClick={() => {
              setHost(FIRST_HOST);
              setEpoch((e) => e + 1);
            }}
          >
            Start over
          </Btn>
        </div>
      </Panel>

      <Grid min={330}>
        <RowLane host={host} epoch={epoch} />
        <SourceLane host={host} epoch={epoch} />
        <WireLane host={host} />
      </Grid>

      <Callout tone="accent" title="The same rule, three times">
        The stamp says how far along the writer was. A reader that is further along runs the migrations in between — in memory for the row, as an exact
        edit for the repo. A reader that is behind refuses by name: <Mono>TOO_NEW</Mono>. Nobody guesses, and nobody writes code to find where the
        documents are: the grammar knows where Buttons can nest.
      </Callout>
    </Page>
  );
};
