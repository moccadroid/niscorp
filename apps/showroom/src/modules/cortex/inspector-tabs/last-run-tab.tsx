import type { FC, ReactNode } from 'react';
import { useCortexRuntime, type LastRun } from '../runtime-context';

// ═══════════════════════════════════════════════════════════
// Last run tab — shows the most recent execution for this story
// ═══════════════════════════════════════════════════════════
//
// Generic: works for every story kind. Each runner publishes a
// LastRun to the runtime context; this tab renders it. The
// Prism-mapping runner publishes extra fields (config, evaluated,
// reasoning) that get a dedicated section.

type Props = { storyId: string };

const Label: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: '#6b7280',
      marginBottom: 6,
    }}
  >
    {children}
  </div>
);

const Pre: FC<{ children: string }> = ({ children }) => (
  <pre
    style={{
      margin: 0,
      padding: 12,
      background: '#f9fafb',
      color: '#1f2937',
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      fontSize: 12,
      fontFamily: 'ui-monospace, Menlo, monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflow: 'auto',
      maxHeight: 360,
    }}
  >
    {children}
  </pre>
);

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

// ─── Prism-mapping-specific section ─────────────────────────

const PrismSection: FC<{ prism: NonNullable<LastRun['prism']> }> = ({ prism }) => (
  <>
    <div>
      <Label>Match</Label>
      <div
        style={{
          padding: '8px 12px',
          background: prism.matchesExpected ? '#ecfdf5' : '#fef2f2',
          color: prism.matchesExpected ? '#065f46' : '#991b1b',
          border: `1px solid ${prism.matchesExpected ? '#a7f3d0' : '#fecaca'}`,
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {prism.matchesExpected ? '✓ Matches expected' : '✗ Does not match expected'}
      </div>
    </div>
    <div>
      <Label>Generated config</Label>
      <Pre>{stringify(prism.config)}</Pre>
    </div>
    <div>
      <Label>Evaluated output</Label>
      <Pre>{stringify(prism.evaluated)}</Pre>
    </div>
    {prism.reasoning !== undefined && (
      <div>
        <Label>Reasoning</Label>
        <Pre>{prism.reasoning}</Pre>
      </div>
    )}
  </>
);

// ─── Generic section ────────────────────────────────────────

const GenericSection: FC<{ run: LastRun }> = ({ run }) => (
  <>
    {run.error !== undefined && (
      <div>
        <Label>Error ({run.error.code})</Label>
        <Pre>{run.error.message}</Pre>
      </div>
    )}
    {run.result !== undefined && (
      <div>
        <Label>Result</Label>
        <Pre>{stringify(run.result)}</Pre>
      </div>
    )}
    {run.observations !== undefined && run.observations.length > 0 && (
      <div>
        <Label>Observations ({run.observations.length})</Label>
        <Pre>{stringify(run.observations)}</Pre>
      </div>
    )}
  </>
);

// ─── Main ───────────────────────────────────────────────────

export const LastRunTab: FC<Props> = ({ storyId }) => {
  const { lastRun } = useCortexRuntime();
  if (lastRun === undefined || lastRun.storyId !== storyId) {
    return (
      <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>
        No run yet for this story. Click <strong>Run</strong> in the canvas.
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: '8px 12px',
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'ui-monospace, Menlo, monospace',
          color: '#1f2937',
        }}
      >
        <strong>{lastRun.kind}</strong> · {lastRun.durationMs}ms
        {lastRun.error !== undefined && <span style={{ color: '#991b1b' }}> · error</span>}
        {lastRun.error === undefined && <span style={{ color: '#065f46' }}> · ok</span>}
      </div>

      {lastRun.prism !== undefined ? <PrismSection prism={lastRun.prism} /> : <GenericSection run={lastRun} />}
    </div>
  );
};
