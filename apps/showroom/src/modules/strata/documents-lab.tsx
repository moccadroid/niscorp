import { useEffect, useMemo, useState, type FC } from 'react';
import { prismTransform } from '@niscorp/prism/migrations';
import { createUpgrader, StrataError, type Location, type Sequence, type Stamp, type UpgradeResult, type Upgrader } from '@niscorp/strata';

// ═══════════════════════════════════════════════════════════
// The Documents Lab — what strata does to a JSON document.
//
// Real throughout: nova's and Prism's grammar sequences as they ship
// (`@niscorp/nova/migrations`, `@niscorp/prism/migrations`), the real
// upgrader, and Prism's real evaluator as the injected transform — the
// socket moss runs endpoints through. A story authors the document, the
// stamp it was written at, and the app's own grammar.
// ═══════════════════════════════════════════════════════════

export type GrammarEdit = {
  label: string;
  hint: string;
  apply: (grammars: readonly Sequence[]) => readonly Sequence[];
};

export type DocumentsLabProps = {
  kind: string;
  document: Record<string, unknown>;
  grammars: readonly Sequence[];
  // Stamps the reader can pick: "written before the rename", "written by newer code".
  stamps: readonly { label: string; stamp: Stamp }[];
  edits?: readonly GrammarEdit[];
  // Show the walker's view — every document inside, by kind.
  showLocations?: boolean;
  note?: string;
};

// Prism's own migration transform — exactly what moss injects.

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
  btn: (active: boolean) => ({
    padding: '5px 11px',
    borderRadius: 7,
    border: '1px solid',
    borderColor: active ? 'rgba(129,140,248,0.6)' : 'var(--sr-border, #2a2a33)',
    background: active ? 'rgba(129,140,248,0.16)' : 'transparent',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  }),
  tag: (tone: 'ok' | 'bad' | 'idle' | 'kind') => ({
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11,
    padding: '1px 7px',
    borderRadius: 999,
    border: '1px solid',
    whiteSpace: 'nowrap' as const,
    borderColor: tone === 'ok' ? 'rgba(52,211,153,0.45)' : tone === 'bad' ? 'rgba(248,113,113,0.5)' : tone === 'kind' ? 'rgba(129,140,248,0.5)' : 'var(--sr-border, #2a2a33)',
    background: tone === 'ok' ? 'rgba(52,211,153,0.12)' : tone === 'bad' ? 'rgba(248,113,113,0.1)' : tone === 'kind' ? 'rgba(129,140,248,0.1)' : 'transparent',
  }),
  line: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' as const },
  json: {
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11,
    whiteSpace: 'pre' as const,
    margin: 0,
    padding: 10,
    borderRadius: 6,
    background: 'rgba(127,127,127,0.08)',
    overflowX: 'auto' as const,
    maxHeight: 420,
  },
  note: { fontSize: 12, opacity: 0.75, lineHeight: 1.5 },
  empty: { opacity: 0.45, fontSize: 12, fontStyle: 'italic' as const },
};

const pathText = (path: readonly (string | number)[]): string =>
  path.reduce<string>((t, k) => (typeof k === 'number' ? `${t}[${k}]` : t === '' ? k : `${t}.${k}`), '') || '(root)';

type Outcome = { ok: true; result: UpgradeResult } | { ok: false; code: string; message: string; details: readonly string[] };

export const DocumentsLab: FC<DocumentsLabProps> = ({ kind, document, grammars: initial, stamps, edits = [], showLocations = false, note }) => {
  const [grammars, setGrammars] = useState<readonly Sequence[]>(initial);
  const [applied, setApplied] = useState<readonly string[]>([]);
  const [stampIndex, setStampIndex] = useState(0);
  const [upgrader, setUpgrader] = useState<Upgrader>();
  const [problem, setProblem] = useState<string>();
  const [focus, setFocus] = useState<string>();

  useEffect(() => {
    let live = true;
    createUpgrader(grammars, { transform: prismTransform })
      .then((u) => live && (setUpgrader(u), setProblem(undefined)))
      .catch((e: unknown) => live && setProblem(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [grammars]);

  const stamp = stamps[stampIndex]?.stamp ?? {};

  const outcome = useMemo((): Outcome | undefined => {
    if (upgrader === undefined) return undefined;
    try {
      return { ok: true, result: upgrader.upgrade(document, { kind, stamp }) };
    } catch (error) {
      if (error instanceof StrataError) return { ok: false, code: error.code, message: error.message.split('\n')[0] ?? '', details: error.details };
      return { ok: false, code: 'ERROR', message: String(error), details: [] };
    }
  }, [upgrader, document, kind, stamp]);

  const locations = useMemo((): readonly Location[] => {
    if (upgrader === undefined || !showLocations) return [];
    return upgrader.locate(outcome?.ok === true ? outcome.result.document : document, kind);
  }, [upgrader, showLocations, outcome, document, kind]);

  const focused = locations.find((l) => pathText(l.path) === focus);

  return (
    <div style={C.wrap}>
      <div style={C.bar}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>written at</span>
        {stamps.map((s, i) => (
          <button key={s.label} type="button" style={C.btn(i === stampIndex)} onClick={() => setStampIndex(i)}>
            {s.label}
          </button>
        ))}
        {edits.length > 0 && <span style={{ opacity: 0.35 }}>│</span>}
        {edits.map((e) => (
          <button
            key={e.label}
            type="button"
            title={e.hint}
            style={C.btn(applied.includes(e.label))}
            disabled={applied.includes(e.label)}
            onClick={() => {
              setGrammars((g) => e.apply(g));
              setApplied((a) => [...a, e.label]);
            }}
          >
            {e.label}
          </button>
        ))}
        {applied.length > 0 && (
          <button
            type="button"
            style={C.btn(false)}
            onClick={() => {
              setGrammars(initial);
              setApplied([]);
            }}
          >
            Undo code edits
          </button>
        )}
      </div>

      {note !== undefined && <div style={C.note}>{note}</div>}
      {problem !== undefined && <div style={{ ...C.mono, color: 'rgb(248,113,113)' }}>{problem}</div>}

      <div style={C.cols}>
        <div style={C.panel}>
          <div style={C.head}>
            <span>The document, as stored</span>
            <span style={C.mono}>{JSON.stringify(stamp)}</span>
          </div>
          <div style={C.body}>
            <pre style={C.json}>{JSON.stringify(document, null, 2)}</pre>
          </div>
        </div>

        <div style={C.panel}>
          <div style={C.head}>
            <span>As this code reads it</span>
            {outcome?.ok === true && <span style={C.mono}>{JSON.stringify(outcome.result.stamp)}</span>}
          </div>
          <div style={C.body}>
            {outcome === undefined ? (
              <div style={C.empty}>…</div>
            ) : outcome.ok ? (
              <>
                <div style={C.line}>
                  {outcome.result.applied.length === 0 ? (
                    <span style={C.tag('idle')}>current — nothing to run</span>
                  ) : (
                    outcome.result.applied.map((ref) => (
                      <span key={ref} style={C.tag('ok')}>
                        ran {ref}
                      </span>
                    ))
                  )}
                </div>
                <pre style={C.json}>{JSON.stringify(outcome.result.document, null, 2)}</pre>
              </>
            ) : (
              <>
                <div style={C.line}>
                  <span style={C.tag('bad')}>refused: {outcome.code}</span>
                  <span>{outcome.message}</span>
                </div>
                {outcome.details.map((d) => (
                  <div key={d} style={{ ...C.mono, opacity: 0.75 }}>
                    {d}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {showLocations && (
        <div style={C.cols}>
          <div style={C.panel}>
            <div style={C.head}>
              <span>What the walker finds — every document inside, by kind</span>
              <span>{locations.length}</span>
            </div>
            <div style={C.body}>
              {locations.map((l) => {
                const at = pathText(l.path);
                return (
                  <button
                    key={at}
                    type="button"
                    onClick={() => setFocus(at)}
                    style={{ ...C.line, background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                  >
                    <span style={C.tag(focus === at ? 'ok' : 'kind')}>{l.kind}</span>
                    <span style={C.mono}>{at}</span>
                    {typeof l.value['component'] === 'string' && <span style={{ opacity: 0.6 }}>{l.value['component']}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={C.panel}>
            <div style={C.head}>
              <span>{focused === undefined ? 'Pick one' : `The one a migration sees at ${pathText(focused.path)}`}</span>
            </div>
            <div style={C.body}>
              {focused === undefined ? (
                <div style={C.empty}>A migration for this kind receives exactly this node — its children are separate documents, rewritten on their own.</div>
              ) : (
                <pre style={C.json}>{JSON.stringify(focused.value, null, 2)}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={C.panel}>
        <div style={C.head}>
          <span>The code — grammars this deployment speaks</span>
        </div>
        <div style={C.body}>
          {grammars.map((g) => (
            <details key={g.id}>
              <summary style={{ ...C.line, cursor: 'pointer' }}>
                <span style={{ ...C.mono, fontWeight: 600 }}>{g.id}</span>
                <span style={{ opacity: 0.6 }}>version {g.migrations.length}</span>
                {Object.keys(g.documents ?? {}).map((k) => (
                  <span key={k} style={C.tag('kind')}>
                    {g.id}/{k}
                  </span>
                ))}
              </summary>
              {Object.entries(g.documents ?? {}).map(([k, d]) =>
                Object.keys(d.embeds ?? {}).length === 0 ? null : (
                  <div key={k} style={{ ...C.mono, opacity: 0.75, padding: '4px 0 0 12px' }}>
                    {k} embeds {Object.entries(d.embeds ?? {}).map(([p, t]) => `${p} → ${t}`).join(' · ')}
                  </div>
                ),
              )}
              {g.migrations.map((m, i) => (
                <div key={i} style={{ padding: '6px 0 0 12px' }}>
                  <div style={C.line}>
                    <span style={C.mono}>/{i + 1}</span>
                    <span>{m.description}</span>
                  </div>
                  {m.steps.map((s, j) => (
                    <pre key={j} style={{ ...C.json, maxHeight: 220 }}>
                      {s.kind === 'document' ? `on ${s.at}\n${JSON.stringify(s.transform, null, 2)}` : s.sql}
                    </pre>
                  ))}
                </div>
              ))}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
};
