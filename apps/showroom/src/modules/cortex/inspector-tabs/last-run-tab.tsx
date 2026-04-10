import type { FC } from 'react';
import { useCortexRuntime } from '../runtime-context';

type Props = { storyId: string };

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

const Label: FC<{ children: string }> = ({ children }) => (
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

export const LastRunTab: FC<Props> = ({ storyId }) => {
  const { lastRun } = useCortexRuntime();
  if (lastRun === undefined || lastRun.storyId !== storyId) {
    return (
      <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>
        No run yet for this story. Click <strong>Run mapping agent</strong> in the canvas.
      </div>
    );
  }
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Label>Match</Label>
        <div
          style={{
            padding: '8px 12px',
            background: lastRun.matchesExpected ? '#ecfdf5' : '#fef2f2',
            color: lastRun.matchesExpected ? '#065f46' : '#991b1b',
            border: `1px solid ${lastRun.matchesExpected ? '#a7f3d0' : '#fecaca'}`,
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {lastRun.matchesExpected ? '✓ Matches expected' : '✗ Does not match expected'} ·{' '}
          {lastRun.durationMs}ms
        </div>
      </div>
      <div>
        <Label>Generated config</Label>
        <Pre>{JSON.stringify(lastRun.config, null, 2)}</Pre>
      </div>
      <div>
        <Label>Evaluated output</Label>
        <Pre>{JSON.stringify(lastRun.evaluated, null, 2)}</Pre>
      </div>
      {lastRun.reasoning !== undefined && (
        <div>
          <Label>Reasoning</Label>
          <Pre>{lastRun.reasoning}</Pre>
        </div>
      )}
    </div>
  );
};
