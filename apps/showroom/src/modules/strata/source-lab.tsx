import { useEffect, useState, type FC } from 'react';
import { prismTransform } from '@niscorp/prism/migrations';
import { createUpgrader, type Sequence, type Stamp, type Upgrader } from '@niscorp/strata';
import { planSourceUpgrade, renderReport, verifySourceUpgrade, type SourcePlan, type VerifyResult } from '@niscorp/strata/upgrade';

// ═══════════════════════════════════════════════════════════
// The Source Lab — `strata upgrade` on an artifact in an app's source.
//
// The same pure functions the CLI runs (plan, verify, the report), in the
// page. The artifact is editable: type the edit yourself, or let "an agent"
// do it, and see verify hold either to the exact JSON the migrations fix.
// ═══════════════════════════════════════════════════════════

export type SourceLabProps = {
  grammars: readonly Sequence[];
  lock: Stamp;
  artifact: { kind: string; id: string; document: unknown; file: string };
  note?: string;
};

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
  cols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 },
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
  btn: (accent: boolean) => ({
    padding: '5px 11px',
    borderRadius: 7,
    border: '1px solid',
    borderColor: accent ? 'rgba(129,140,248,0.6)' : 'var(--sr-border, #2a2a33)',
    background: accent ? 'rgba(129,140,248,0.16)' : 'transparent',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  }),
  area: {
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11,
    minHeight: 360,
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: 10,
    borderRadius: 6,
    border: '1px solid var(--sr-border, #2a2a33)',
    background: 'rgba(127,127,127,0.06)',
    color: 'inherit',
    resize: 'vertical' as const,
  },
  pre: {
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11,
    whiteSpace: 'pre-wrap' as const,
    margin: 0,
    padding: 10,
    borderRadius: 6,
    background: 'rgba(127,127,127,0.08)',
    maxHeight: 420,
    overflow: 'auto' as const,
  },
  line: (ok: boolean) => ({ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: ok ? 'rgb(52,211,153)' : 'rgb(248,113,113)' }),
  note: { fontSize: 12, opacity: 0.75, lineHeight: 1.5 },
};

const stampText = (s: Stamp): string => Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', ');

export const SourceLab: FC<SourceLabProps> = ({ grammars, lock: initialLock, artifact, note }) => {
  const [upgrader, setUpgrader] = useState<Upgrader>();
  const [lock, setLock] = useState<Stamp>(initialLock);
  const [text, setText] = useState(JSON.stringify(artifact.document, null, 2));
  const [plan, setPlan] = useState<SourcePlan>();
  const [verified, setVerified] = useState<VerifyResult>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void createUpgrader(grammars, { transform: prismTransform }).then(setUpgrader);
  }, [grammars]);

  const parsed = (): unknown => {
    try {
      setError(undefined);
      return JSON.parse(text);
    } catch (e) {
      setError(`The source does not parse: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  };

  const upgrade = async () => {
    if (upgrader === undefined) return;
    const document = parsed();
    if (document === undefined) return;
    setVerified(undefined);
    if (!upgrader.behind(lock)) {
      setPlan(undefined);
      setError(`Nothing to upgrade — the source is written at the installed grammars (${stampText(lock)}).`);
      return;
    }
    const descriptions = new Map(grammars.flatMap((g) => g.migrations.map((m, i): [string, string] => [`${g.id}/${i + 1}`, m.description])));
    setPlan(
      await planSourceUpgrade({
        upgrader,
        stamp: lock,
        documents: [{ ...artifact, document }],
        describe: (ref) => descriptions.get(ref) ?? '',
      }),
    );
  };

  const verify = () => {
    if (upgrader === undefined || plan === undefined) return;
    const document = parsed();
    if (document === undefined) return;
    const result = verifySourceUpgrade({ plan, upgrader, documents: [{ ...artifact, document }] });
    setVerified(result);
    if (result.ok) {
      setLock(plan.to);
      setPlan(undefined);
    }
  };

  const expected = plan?.documents[0]?.expected;

  return (
    <div style={C.wrap}>
      <div style={C.bar}>
        <span style={{ ...C.mono, opacity: 0.8 }}>strata.lock.json: {stampText(lock)}</span>
        <span style={{ opacity: 0.35 }}>│</span>
        <button type="button" style={C.btn(true)} onClick={() => void upgrade()}>
          strata upgrade
        </button>
        <button
          type="button"
          style={C.btn(false)}
          disabled={expected === undefined}
          title="Rewrite the artifact to its expected JSON — keys in a different order, as a person might write them"
          onClick={() => {
            // An agent following the report: the expected JSON, written its own way.
            const reordered = (v: unknown): unknown =>
              Array.isArray(v) ? v.map(reordered) : typeof v === 'object' && v !== null ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reordered(x)])) : v;
            setText(JSON.stringify(reordered(expected), null, 2));
          }}
        >
          Let an agent edit
        </button>
        <button type="button" style={C.btn(false)} disabled={plan === undefined} onClick={verify}>
          strata verify
        </button>
      </div>
      {note !== undefined && <div style={C.note}>{note}</div>}
      {error !== undefined && <div style={C.line(false)}>{error}</div>}

      <div style={C.cols}>
        <div style={C.panel}>
          <div style={C.head}>
            <span>The source — {artifact.file}</span>
            <span>editable</span>
          </div>
          <div style={C.body}>
            <textarea style={C.area} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
          </div>
        </div>

        <div style={C.panel}>
          <div style={C.head}>
            <span>{plan === undefined ? 'verify' : '.strata/upgrade/REPORT.md'}</span>
          </div>
          <div style={C.body}>
            {plan !== undefined ? (
              <pre style={C.pre}>{renderReport(plan, (d) => `.strata/upgrade/expected/${d.kind.replace('/', '_')}/${d.id}.json`)}</pre>
            ) : verified !== undefined ? (
              verified.lines.map((l, i) => (
                <div key={i}>
                  <div style={C.line(l.ok)}>
                    [{l.ok ? 'pass' : 'fail'}] {l.text}
                  </div>
                  {(l.detail ?? []).map((d) => (
                    <div key={d} style={{ ...C.mono, opacity: 0.7, paddingLeft: 16 }}>
                      {d}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 12 }}>Run strata upgrade.</div>
            )}
            {verified !== undefined && verified.ok && <div style={C.line(true)}>[pass] the lock moved: {stampText(lock)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
