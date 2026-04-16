import type { FC } from 'react';
import type { Observation } from '@niscorp/cortex';

// Live observation feed used by tool-use, plan-mode (single-tick),
// and confirmation demos. Renders one row per observation with the
// step kind, target id, success/error, duration, and a JSON
// preview of the tool's return value.

export const ToolTimeline: FC<{ observations: ReadonlyArray<Observation> }> = ({ observations }) => {
  if (observations.length === 0) return null;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#1e3a8a',
          marginBottom: 6,
        }}
      >
        Live tool timeline · {observations.length} observation{observations.length === 1 ? '' : 's'}
      </div>
      <div
        style={{
          padding: '8px 12px',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 6,
          fontSize: 12,
          color: '#1e3a8a',
          fontFamily: 'ui-monospace, Menlo, monospace',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {observations.map((obs, i) => {
          const target = obs.toolId ?? obs.agentId ?? obs.topic ?? '?';
          const isErr = obs.error !== undefined;
          return (
            <div key={i} style={{ color: isErr ? '#991b1b' : '#1e3a8a' }}>
              <span style={{ opacity: 0.6 }}>{i + 1}.</span> [{obs.stepKind}{' '}
              <strong>{target}</strong>]{isErr ? ' ✗' : ' ✓'} ({obs.durationMs}ms)
              {isErr && <span> — {obs.error}</span>}
              {!isErr && obs.result !== undefined && (
                <span style={{ opacity: 0.85 }}> → {JSON.stringify(obs.result).slice(0, 120)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
