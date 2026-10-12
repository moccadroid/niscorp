import type { FunctionSession, RunRecord, RunTurn } from '@niscorp/moss';
import type { Message } from '@niscorp/signal';
import type { RunHandle, RunResult } from '@niscorp/cortex';
import type { Persona } from './session';

export type Label = 'chat' | 'watch';

const turnsOf = (messages: readonly Message[]): RunTurn[] =>
  messages.map((message): RunTurn => {
    if (message.role === 'tool') return { role: 'tool', name: message.name, content: message.content };
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    const calls = message.role === 'assistant' ? (message.toolCalls ?? []) : [];
    return {
      role: message.role,
      content,
      ...(calls.length > 0 ? { calls: calls.map((call) => ({ name: call.name, args: call.args })) } : {}),
    };
  });

const shout = (record: RunRecord): void => {
  if (process.env['ASSISTANT_LOG'] !== '1') return;
  console.error(`\n══ ${record.label} · ${record.agentId} · ${record.model} · ${record.totalTokens} tokens${record.reported ? '' : ' (counted, not reported)'} · ${record.elapsedMs}ms`);
  for (const turn of record.turns ?? []) {
    console.error(`[${turn.role}${turn.name === undefined ? '' : `: ${turn.name}`}]\n${turn.content}`);
    for (const call of turn.calls ?? []) console.error(`  → ${call.name}(${call.args})`);
  }
  console.error(`── answered ──\n${record.response ?? '(nothing)'}\n`);
};

export const meter =
  (session: FunctionSession, agentId: string, label: Label) =>
  (handle: RunHandle<unknown>, result: RunResult<unknown>, persona: Persona): void => {
    const record = {
      agentId,
      agentPath: [agentId],
      label,
      provider: persona.provider,
      model: persona.model,
      inputTokens: result.meta.usage.inputTokens,
      outputTokens: result.meta.usage.outputTokens,
      totalTokens: result.meta.usage.totalTokens,
      reported: result.meta.usage.reported,
      steps: result.meta.steps,
      elapsedMs: Math.round(result.meta.elapsedMs),
      outcome: (result.ok ? 'ok' : 'failed') as 'ok' | 'failed',
      turns: turnsOf(handle.snapshot().messages),
      response: result.ok ? JSON.stringify(result.output, null, 2) : `error: ${result.error.message}`,
    };
    session.recordRun(record);
    shout({ ...record, at: Date.now(), principal: session.principal, shellId: '' });
  };

export const recordRun = (record: RunRecord, session: FunctionSession): void => {
  void session
    .wire('/api/vex', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fingerprint: 'assistant/meter',
        context: {
          agentId: record.agentId,
          agentPath: record.agentPath.join(' › '),
          label: record.label,
          provider: record.provider,
          model: record.model,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          totalTokens: record.totalTokens,
          reported: record.reported,
          steps: record.steps,
          elapsedMs: record.elapsedMs,
          outcome: record.outcome,
          turns: JSON.stringify(record.turns ?? []),
          response: record.response ?? '',
        },
      }),
    })
    .catch(() => undefined);
};
