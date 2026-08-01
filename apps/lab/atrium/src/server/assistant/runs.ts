import type { FunctionSession, RunRecord, RunTurn } from '@niscorp/moss';
import type { Message } from '@niscorp/signal';
import type { RunHandle, RunResult } from '@niscorp/cortex';
import type { Persona } from './session';

// What a run said, called and cost.
//
// cortex reports the counts on `meta.usage`, and `reported: false` marks a run
// signal had to count itself because the provider's streamed usage frame never
// arrived. The whole exchange rides along — every message out, every tool call
// and its result, the envelope back — because reconstructing it afterwards is
// impossible: the prompt is assembled from screen state that has already moved.
//
// Recorded on BOTH branches of a result — a failed run spent tokens too, and
// recording only successes undercounts exactly when something is going wrong.

export type Label = 'chat' | 'watch';

// cortex's message array is signal's `Message` union; the record is moss's
// library-blind `RunTurn`. One flattening, here, at the seam that knows both.
//
// A tool call and its result stay TWO turns in the order the model saw them: the
// assistant turn that asked, then the tool turn that answered. Collapsing them
// into pairs would lose the case that matters most — a call the model made and
// nothing answered.
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

// The console half. The rows are the durable record; this is for watching a run
// happen. `ASSISTANT_LOG=1` prints the whole exchange, which is long.
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

// The sink. Through the caller's own wire, so the row is pinned to them by the
// same personal scope the conversation uses — a record that could be written on
// somebody else's behalf would be worth nothing.
//
// Best-effort by construction: a row that fails to write must never be the
// reason a person's turn failed. Nobody asked for this record.
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
          // One TEXT column holding the array. The turns are read by one pane
          // and never queried across, so a column per turn shape would be a
          // schema serving nobody.
          turns: JSON.stringify(record.turns ?? []),
          response: record.response ?? '',
        },
      }),
    })
    .catch(() => undefined);
};
