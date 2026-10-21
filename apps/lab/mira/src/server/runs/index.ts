import type { FunctionSession, RunSink } from '@niscorp/moss';

// `reported: false` means the numbers are signal's estimate, at least in part. `calls` counts signal's own retries.
export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; reported: boolean; calls: number };

// A run with no usage is one whose calls did not answer.
export type ModelRun = { agentId: string; label: string; provider: string; model: string; usage: readonly Usage[]; elapsedMs: number; outcome: 'ok' | 'failed' };

const total = (usage: readonly Usage[], key: 'inputTokens' | 'outputTokens' | 'totalTokens'): number => usage.reduce((sum, one) => sum + one[key], 0);

export const recordModelRun = (session: FunctionSession, run: ModelRun): void =>
  session.recordRun({
    agentId: run.agentId,
    agentPath: [run.agentId],
    label: run.label,
    provider: run.provider,
    model: run.model,
    inputTokens: total(run.usage, 'inputTokens'),
    outputTokens: total(run.usage, 'outputTokens'),
    totalTokens: total(run.usage, 'totalTokens'),
    reported: run.usage.length > 0 && run.usage.every((one) => one.reported),
    steps: run.usage.reduce((sum, one) => sum + one.calls, 0),
    elapsedMs: Math.round(run.elapsedMs),
    outcome: run.outcome,
  });

export const logRun: RunSink = (run) =>
  console.log(`[run] ${run.agentId} "${run.label}" — ${run.outcome} · ${run.elapsedMs} ms · ${run.steps} ${run.steps === 1 ? 'call' : 'calls'} · ${run.inputTokens} tokens in, ${run.outputTokens} out${run.reported ? '' : ' (estimated)'}`);
