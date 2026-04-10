// ═══════════════════════════════════════════════════════════
// observationsProducer — recent observations from the workflow
// ═══════════════════════════════════════════════════════════
//
// In plan mode, this is the primary feedback loop: after each tick,
// the next context build includes the observations from steps that
// ran. The model uses these to decide what to do next.
//
// Per the Manus lesson (DESIGN.md §5.7): preserve failed actions in
// context. We do not filter out errors — the model needs to see them.

import type { ContextProducer } from '../types';
import type { Observation } from '../../schemas';

export type ObservationsProducerOptions = {
  window?: number;
  format?: 'compact' | 'full';
};

const safeJson = (value: unknown, max: number): string => {
  try {
    const s = JSON.stringify(value);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  } catch {
    return String(value);
  }
};

const formatObservation = (obs: Observation, format: 'compact' | 'full'): string => {
  const target = obs.toolId ?? obs.agentId ?? obs.topic ?? '?';
  const status = obs.error ? 'error' : 'ok';
  if (format === 'compact') {
    if (obs.error) return `[${obs.stepKind} ${target}] ${status}: ${obs.error}`;
    return `[${obs.stepKind} ${target}] ${status} (${obs.durationMs}ms): ${safeJson(obs.result, 200)}`;
  }
  const head = `### ${obs.stepKind} ${target} — ${status} (${obs.durationMs}ms)`;
  if (obs.error) return `${head}\nerror: ${obs.error}`;
  return `${head}\nresult: ${safeJson(obs.result, 800)}`;
};

export const observationsProducer = (options: ObservationsProducerOptions = {}): ContextProducer => {
  const window = options.window ?? 20;
  const format = options.format ?? 'compact';
  return {
    id: 'cortex.observations',
    priority: 40,
    build: ({ observations }) => {
      if (observations.length === 0) return [];
      const recent = observations.slice(-window);
      const lines = recent.map((o) => formatObservation(o, format));
      return [
        {
          role: 'system',
          content: `## Observations\n${lines.join('\n')}`,
          source: 'cortex.observations',
          tags: ['observations'],
        },
      ];
    },
  };
};
