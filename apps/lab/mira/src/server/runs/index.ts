import type { Usage } from '@niscorp/cortex';
import type { FunctionSession, RunSink } from '@niscorp/moss';

type ModelRun = { agentId: string; label: string; provider: string; model: string; usage: Usage; steps: number; elapsedMs: number; outcome: 'ok' | 'failed' };

export const recordModelRun = (session: FunctionSession, run: ModelRun): void =>
  session.recordRun({
    agentId: run.agentId,
    agentPath: [run.agentId],
    label: run.label,
    provider: run.provider,
    model: run.model,
    ...run.usage,
    steps: run.steps,
    elapsedMs: Math.round(run.elapsedMs),
    outcome: run.outcome,
  });

export const logRun: RunSink = (run) =>
  console.log(`[run] ${run.agentId} "${run.label}" — ${run.outcome} · ${run.elapsedMs} ms · ${run.steps} ${run.steps === 1 ? 'step' : 'steps'} · ${run.inputTokens} tokens in, ${run.outputTokens} out${run.reported ? '' : ' (estimated)'}`);
