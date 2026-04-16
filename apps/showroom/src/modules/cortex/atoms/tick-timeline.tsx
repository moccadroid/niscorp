import type { FC } from 'react';
import type { Observation } from '@niscorp/cortex';

// Plan-mode timeline — observations grouped by tick. Each tick is
// one outer iteration of the agent; nested entries are the plan
// nodes Cortex executed during that tick.

export const TickTimeline: FC<{ observations: ReadonlyArray<Observation> }> = ({ observations }) => {
  if (observations.length === 0) return null;
  const byTick = new Map<number, Observation[]>();
  for (const o of observations) {
    const list = byTick.get(o.tick) ?? [];
    list.push(o);
    byTick.set(o.tick, list);
  }
  const ticks = Array.from(byTick.keys()).sort((a, b) => a - b);

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
        Plan-mode timeline · {ticks.length} tick{ticks.length === 1 ? '' : 's'} ·{' '}
        {observations.length} observation{observations.length === 1 ? '' : 's'}
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
          gap: 8,
        }}
      >
        {ticks.map((tick) => {
          const list = byTick.get(tick) ?? [];
          return (
            <div key={tick}>
              <div style={{ fontWeight: 700, opacity: 0.7, marginBottom: 2 }}>tick {tick}</div>
              {list.map((obs, i) => {
                const target = obs.toolId ?? obs.agentId ?? obs.topic ?? obs.stepKind;
                const isErr = obs.error !== undefined;
                return (
                  <div key={i} style={{ paddingLeft: 12, color: isErr ? '#991b1b' : '#1e3a8a' }}>
                    [{obs.stepKind} <strong>{target}</strong>] {isErr ? '✗' : '✓'} ({obs.durationMs}ms)
                    {isErr && <span> — {obs.error}</span>}
                    {!isErr && obs.result !== undefined && (
                      <span style={{ opacity: 0.85 }}> → {JSON.stringify(obs.result).slice(0, 200)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
