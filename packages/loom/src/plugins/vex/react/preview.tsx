import { useEffect, useRef, useState, type CSSProperties, type FC } from 'react';
import type { NovaComponent } from '@niscorp/nova/react';
import type { Query, VexRunResult } from '../index.js';

// The preview component: re-runs the query whenever it changes, debounced, with a
// sequence guard so a slow run can't overwrite a newer one. Registered under
// PREVIEW; the plugin's mount binds the live query to it. Closes over the host's
// `run`.

type State =
  | { status: 'empty' }
  | { status: 'running' }
  | { status: 'ok'; result: VexRunResult }
  | { status: 'error'; message: string };

export const makePreview = (run: (query: Query) => Promise<VexRunResult>): NovaComponent<{ query?: Query }> => {
  const Preview: FC<{ query?: Query }> = ({ query }) => {
    const [state, setState] = useState<State>({ status: 'empty' });
    const seq = useRef(0);
    const key = query == null ? '' : JSON.stringify(query);

    useEffect(() => {
      if (query == null) {
        setState({ status: 'empty' });
        return;
      }
      const mine = ++seq.current;
      setState({ status: 'running' });
      const handle = setTimeout(() => {
        run(query)
          .then((result) => {
            if (mine === seq.current) setState({ status: 'ok', result });
          })
          .catch((err: unknown) => {
            if (mine === seq.current) {
              setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
            }
          });
      }, 250);
      return () => clearTimeout(handle);
      // `key` is the query's content; re-run only when it actually changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return <PreviewView state={state} />;
  };
  return Preview;
};

const PreviewView: FC<{ state: State }> = ({ state }) => {
  if (state.status === 'empty') return <Note>Edit the query to preview its results.</Note>;
  if (state.status === 'running') return <Note>Running…</Note>;
  if (state.status === 'error') return <Banner tone="error" lines={[state.message]} />;
  const { rows, warnings, errors } = state.result;
  if (errors !== undefined && errors.length > 0) return <Banner tone="error" lines={errors} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {warnings !== undefined && warnings.length > 0 ? <Banner tone="warn" lines={warnings} /> : null}
      <RowsTable rows={rows} />
    </div>
  );
};

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const Note: FC<{ children: string }> = ({ children }) => (
  <div style={{ fontSize: 13, color: '#6b7280', padding: 12 }}>{children}</div>
);

const TONES: Record<'error' | 'warn', { fg: string; bg: string; border: string }> = {
  error: { fg: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  warn: { fg: '#92400e', bg: '#fffbeb', border: '#fde68a' },
};

const Banner: FC<{ tone: 'error' | 'warn'; lines: string[] }> = ({ tone, lines }) => {
  const c = TONES[tone];
  return (
    <pre style={{ margin: 0, padding: 12, background: c.bg, color: c.fg, border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12, fontFamily: mono, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {lines.join('\n')}
    </pre>
  );
};

const th: CSSProperties = { textAlign: 'left', padding: '6px 10px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontFamily: mono, whiteSpace: 'nowrap' };

const cell = (value: unknown): string =>
  value === null ? '∅' : typeof value === 'object' ? JSON.stringify(value) : String(value);

const RowsTable: FC<{ rows: unknown[] }> = ({ rows }) => {
  if (rows.length === 0) return <Note>No rows.</Note>;
  const first = rows[0];
  if (first === null || typeof first !== 'object') {
    return <Banner tone="warn" lines={[JSON.stringify(rows, null, 2)]} />;
  }
  const cols = Object.keys(first as Record<string, unknown>);
  return (
    <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>{cols.map((c) => <th key={c} style={th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {(rows as Record<string, unknown>[]).map((row, i) => (
            <tr key={i}>{cols.map((c) => <td key={c} style={td}>{cell(row[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
