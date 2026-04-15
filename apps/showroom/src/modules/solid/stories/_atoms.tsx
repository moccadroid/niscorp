import { type FC, type ReactNode } from 'react';
import type { StreamError } from '@niscorp/solid';

// ═══════════════════════════════════════════════════════════
// Shared presentational atoms for solid story recipes. Pure
// display code — zero solid-library calls. Each recipe imports
// what it needs; the solid wiring (createStream, .on, .write,
// etc.) stays visible in the recipe file itself.
// ═══════════════════════════════════════════════════════════

// ─── Path status badge ─────────────────────────────────────
// Reflects a `stream.select(path).on/.onFinal` subscription —
// amber while streaming, green once finalized.

export type PathStatus = {
  path: string;
  value: unknown;
  isFinal: boolean;
  finalizedAt?: number;
};

export const PathBadge: FC<{ status: PathStatus }> = ({ status }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      background: status.isFinal ? '#dcfce7' : '#fef3c7',
      color: status.isFinal ? '#166534' : '#92400e',
      border: `1px solid ${status.isFinal ? '#86efac' : '#fde68a'}`,
    }}
  >
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: status.isFinal ? '#22c55e' : '#f59e0b',
      }}
    />
    {status.path}
    {status.isFinal && status.finalizedAt !== undefined && (
      <span style={{ fontWeight: 400, opacity: 0.7 }}>{status.finalizedAt.toFixed(0)}ms</span>
    )}
  </div>
);

export const PathBadges: FC<{ statuses: PathStatus[] }> = ({ statuses }) =>
  statuses.length === 0 ? null : (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {statuses.map((s) => (
        <PathBadge key={s.path} status={s} />
      ))}
    </div>
  );

// ─── Error panel ───────────────────────────────────────────
// Renders a `stream.onError(...)` log. Shape comes from solid's
// `StreamError` type: `{ phase, path, expected, received, message }`.

export const ErrorPanel: FC<{ errors: StreamError[] }> = ({ errors }) =>
  errors.length === 0 ? null : (
    <div
      style={{
        marginBottom: 16,
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderLeft: '4px solid #f59e0b',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 12,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
        color: '#78350f',
        maxHeight: 200,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {errors.length} validation error{errors.length === 1 ? '' : 's'}
      </div>
      {errors.map((err, i) => (
        <div key={i} style={{ padding: '3px 0', borderTop: i === 0 ? 'none' : '1px dashed #fde68a' }}>
          <span style={{ color: '#b45309', fontWeight: 600 }}>[{err.phase}]</span>{' '}
          <span style={{ color: '#1f2937' }}>{err.path || '<root>'}</span>{' '}
          <span style={{ color: '#78350f' }}>
            expected {err.expected}, got {err.received}
          </span>
        </div>
      ))}
    </div>
  );

// ─── Start / stop controls ─────────────────────────────────

export type DemoState = 'idle' | 'streaming' | 'done' | 'error';

export const StartStop: FC<{
  state: DemoState;
  onStart: () => void;
  onStop: () => void;
}> = ({ state, onStart, onStop }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '0 0 16px 0' }}>
    <button
      onClick={onStart}
      disabled={state === 'streaming'}
      style={{
        padding: '8px 20px',
        borderRadius: 6,
        border: 'none',
        background: state === 'streaming' ? '#d1d5db' : '#2563eb',
        color: 'white',
        fontWeight: 600,
        fontSize: 13,
        cursor: state === 'streaming' ? 'default' : 'pointer',
      }}
    >
      {state === 'idle' ? 'Start' : state === 'streaming' ? 'Streaming…' : 'Restart'}
    </button>
    {state === 'streaming' && (
      <button
        onClick={onStop}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid #fecaca',
          background: '#fef2f2',
          color: '#dc2626',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Stop
      </button>
    )}
  </div>
);

// ─── Raw JSON panel ────────────────────────────────────────
// Fallback view for demos without a dedicated preview component.

export const RawJsonPanel: FC<{ value: unknown }> = ({ value }) => (
  <div
    style={{
      background: '#1e1e1e',
      color: '#d4d4d4',
      borderRadius: 8,
      padding: 16,
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      lineHeight: 1.6,
      overflow: 'auto',
      maxHeight: 400,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}
  >
    {JSON.stringify(value, null, 2)}
  </div>
);

// ─── Small text atoms used by preview cards ────────────────

export const Placeholder: FC<{ width?: number }> = ({ width = 120 }) => (
  <span
    style={{
      display: 'inline-block',
      width,
      height: 14,
      borderRadius: 4,
      background: '#e2e8f0',
      verticalAlign: 'middle',
    }}
  />
);

export const Cursor: FC = () => (
  <span
    style={{
      display: 'inline-block',
      width: 2,
      height: 14,
      background: '#2563eb',
      marginLeft: 1,
      verticalAlign: 'middle',
      animation: 'solid-cursor-blink 1s step-end infinite',
    }}
  >
    <style>{`@keyframes solid-cursor-blink { 50% { opacity: 0; } }`}</style>
  </span>
);

export const FinalBadge: FC<{ done: boolean }> = ({ done }) => (
  <span
    style={{
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: 3,
      background: done ? '#dcfce7' : '#f1f5f9',
      color: done ? '#166534' : '#cbd5e1',
      transition: 'all 300ms',
    }}
  >
    {done ? 'FINAL' : '…'}
  </span>
);

// ─── Chunk splitter ────────────────────────────────────────
// Simulates how a real LLM stream arrives — mostly on JSON
// structural boundaries. In production, replace this with your
// actual event source (signal.stream, server-sent events, etc).

export const splitByTokens = (json: string): string[] => {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < json.length; i += 1) {
    const ch = json[i] as string;
    buf += ch;
    const structural = ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ',' || ch === ':';
    const stringEnd = ch === '"' && i > 0 && json[i - 1] !== '\\';
    if (structural || stringEnd) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
};

// ─── Layout wrapper ────────────────────────────────────────

export const DemoShell: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>{children}</div>
);
