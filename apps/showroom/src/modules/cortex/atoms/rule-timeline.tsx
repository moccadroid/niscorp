import type { FC } from 'react';
import type { Observation } from '@niscorp/cortex';

// Rules timeline — interleaves observations with rule evaluations
// (matched + non-matched) so users can see exactly when each rule
// fired and what the accumulator state looked like at that moment.

export type RuleEvaluation = {
  afterObservation: number;
  matched: boolean;
  ruleId?: string;
  effectKind?: string;
  effectMessage?: string;
  accumulators: Record<string, Record<string, unknown>>;
};

const AccumulatorBadge: FC<{ accumulators: Record<string, Record<string, unknown>> }> = ({ accumulators }) => {
  const ruleIds = Object.keys(accumulators);
  if (ruleIds.length === 0) return null;
  const parts: string[] = [];
  for (const ruleId of ruleIds) {
    const vals = accumulators[ruleId];
    if (!vals) continue;
    for (const [key, value] of Object.entries(vals)) {
      parts.push(`${key}=${typeof value === 'number' ? value : JSON.stringify(value)}`);
    }
  }
  return <span style={{ opacity: 0.7, fontSize: 11 }}> [{parts.join(', ')}]</span>;
};

export const RuleTimeline: FC<{
  observations: ReadonlyArray<Observation>;
  evals: ReadonlyArray<RuleEvaluation>;
}> = ({ observations, evals }) => {
  if (observations.length === 0) return null;

  type TimelineEntry =
    | { type: 'observation'; obs: Observation; index: number }
    | { type: 'eval'; eval: RuleEvaluation };

  const entries: TimelineEntry[] = [];
  let evalIdx = 0;
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    if (obs) entries.push({ type: 'observation', obs, index: i });
    while (evalIdx < evals.length) {
      const ev = evals[evalIdx];
      if (!ev || ev.afterObservation !== i) break;
      entries.push({ type: 'eval', eval: ev });
      evalIdx++;
    }
  }
  while (evalIdx < evals.length) {
    const ev = evals[evalIdx];
    if (ev) entries.push({ type: 'eval', eval: ev });
    evalIdx++;
  }

  const matchedCount = evals.filter((e) => e.matched).length;

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
        Live timeline · {observations.length} observation{observations.length === 1 ? '' : 's'} ·{' '}
        {evals.length} rule check{evals.length === 1 ? '' : 's'} · {matchedCount} fired
      </div>
      <div
        style={{
          padding: '8px 12px',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'ui-monospace, Menlo, monospace',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {entries.map((entry, i) => {
          if (entry.type === 'observation') {
            const obs = entry.obs;
            const target = obs.toolId ?? obs.agentId ?? obs.topic ?? '?';
            const isErr = obs.error !== undefined;
            return (
              <div key={`obs-${i}`} style={{ color: isErr ? '#991b1b' : '#1e3a8a' }}>
                <span style={{ opacity: 0.6 }}>{entry.index + 1}.</span> [{obs.stepKind}{' '}
                <strong>{target}</strong>] {isErr ? '✗' : '✓'} ({obs.durationMs}ms)
                {isErr && <span> — {obs.error}</span>}
                {!isErr && obs.result !== undefined && (
                  <span style={{ opacity: 0.85 }}> → {JSON.stringify(obs.result).slice(0, 120)}</span>
                )}
              </div>
            );
          }
          const ev = entry.eval;
          if (!ev.matched) {
            return (
              <div
                key={`eval-${i}`}
                style={{ color: '#6b7280', fontSize: 11, paddingLeft: 16, opacity: 0.8 }}
              >
                ○ rule checked — no match
                <AccumulatorBadge accumulators={ev.accumulators} />
              </div>
            );
          }
          const isAbort = ev.effectKind === 'abort';
          return (
            <div
              key={`eval-${i}`}
              style={{
                color: isAbort ? '#991b1b' : '#b45309',
                fontWeight: 700,
                padding: '4px 0',
                borderLeft: `3px solid ${isAbort ? '#dc2626' : '#f59e0b'}`,
                paddingLeft: 8,
                marginTop: 2,
                marginBottom: 2,
              }}
            >
              ⚡ RULE FIRED: {ev.ruleId} → {ev.effectKind}
              {ev.effectMessage && <span style={{ fontWeight: 400 }}> — {ev.effectMessage}</span>}
              <AccumulatorBadge accumulators={ev.accumulators} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
