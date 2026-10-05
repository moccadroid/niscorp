import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  defineAgent,
  defineTool,
  resumeRun,
  type ApprovalRequest,
  type CortexEvent,
  type RunHandle,
  type RunSnapshot,
} from '../src';
import { stubSignal } from './helpers/stub-signal';

const echo = defineTool({
  id: 'echo',
  name: 'echo',
  description: 'Returns its input text.',
  riskLevel: 'high',
  input: z.object({ text: z.string() }),
  execute: ({ text }) => text,
});

const OutSchema = z.object({ done: z.boolean() });

const makeAgent = (approvalTimeoutMs?: number) =>
  defineAgent({
    id: 'careful',
    instructions: 'echo then respond',
    tools: [echo],
    output: { schema: OutSchema },
    policy: {
      tools: { requireApproval: ['echo'] },
      ...(approvalTimeoutMs !== undefined && { approvalTimeoutMs }),
    },
  });

const SCRIPT = () => [
  { toolCalls: [{ id: 'c1', name: 'echo', args: { text: 'secret' } }] },
  { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { done: true } } }] },
];

describe('approvals', () => {
  it('suspends on approval-required and executes after approve()', async () => {
    const llm = stubSignal(SCRIPT());
    const agent = makeAgent();
    const approvals: ApprovalRequest[] = [];

    const run = agent.run('go', {
      llm,
      onEvent: (event) => {
        if (event.type === 'approval-required') {
          approvals.push(event.approval);
          run.approve(event.approval.id);
        }
      },
    });

    const result = await run.result;
    expect(result.ok).toBe(true);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.toolId).toBe('echo');

    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('secret');
  });

  it('approve() can rewrite the call args (approve-with-edits)', async () => {
    const llm = stubSignal(SCRIPT());
    const agent = makeAgent();

    const run = agent.run('go', {
      llm,
      onEvent: (event) => {
        if (event.type === 'approval-required') {
          run.approve(event.approval.id, { args: { text: 'edited' } });
        }
      },
    });

    await run.result;
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('edited');
  });

  it('deny() turns the call into a denial observation', async () => {
    const llm = stubSignal(SCRIPT());
    const agent = makeAgent();
    const events: CortexEvent[] = [];

    const run = agent.run('go', {
      llm,
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'approval-required') run.deny(event.approval.id, 'human said no');
      },
    });

    const result = await run.result;
    expect(result.ok).toBe(true);
    const toolEnd = events.find((event) => event.type === 'tool-end');
    expect(toolEnd?.type === 'tool-end' && toolEnd.observation.kind).toBe('denied');
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('error: denied: human said no');
  });

  it('times out into a denial when policy.approvalTimeoutMs is set', async () => {
    const llm = stubSignal(SCRIPT());
    const agent = makeAgent(15);

    const result = await agent.run('go', { llm }).result;
    expect(result.ok).toBe(true);
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('approval timeout');
  });

  it('snapshot while suspended → abort → resume re-asks and completes', async () => {
    const llm = stubSignal(SCRIPT());
    const agent = makeAgent();

    let snapshot: RunSnapshot | undefined;
    let run: RunHandle<{ done: boolean }> | undefined;
    const suspended = new Promise<void>((resolve) => {
      run = agent.run('go', {
        llm,
        onEvent: (event) => {
          if (event.type === 'approval-required' && run) {
            snapshot = run.snapshot();
            run.abort();
            resolve();
          }
        },
      });
    });
    await suspended;

    const abortedResult = await run?.result;
    expect(abortedResult?.ok).toBe(false);
    expect(snapshot?.pending).toBeDefined();
    if (!snapshot) return;

    // Round-trip through JSON — the snapshot must be serializable.
    const revived: RunSnapshot = JSON.parse(JSON.stringify(snapshot));

    // Resume: the pending echo re-asks; approve it; then the model
    // (fresh stub) emits the final respond.
    const llm2 = stubSignal([
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { done: true } } }] },
    ]);
    let resumed: RunHandle<{ done: boolean }> | undefined;
    resumed = resumeRun(agent, revived, {
      llm: llm2,
      onEvent: (event) => {
        if (event.type === 'approval-required') resumed?.approve(event.approval.id);
      },
    });

    const result = await resumed.result;
    expect(result.ok).toBe(true);
    expect(resumed.runId).toBe(snapshot.runId);

    // The resumed model call saw the echo result in its transcript.
    const toolMessage = llm2.requests[0]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('secret');
  });

  // Resume re-asks: the gates run again and the ask is a new one. What the
  // resumed run answers to is the id of its own event — the snapshot's
  // `pending.approvalId` is the first run's ask (README, DESIGN §6).
  it('a resumed run asks again under a new id, which is the one it answers to', async () => {
    let snapshot: RunSnapshot | undefined;
    let first: RunHandle<{ done: boolean }> | undefined;
    const suspended = new Promise<void>((resolve) => {
      first = makeAgent().run('go', {
        llm: stubSignal(SCRIPT()),
        onEvent: (event) => {
          if (event.type === 'approval-required' && first) {
            snapshot = first.snapshot();
            first.abort();
            resolve();
          }
        },
      });
    });
    await suspended;
    await first?.result;
    if (!snapshot?.pending) throw new Error('expected a snapshot with a pending approval');

    const asked: string[] = [];
    let resumed: RunHandle<{ done: boolean }> | undefined;
    resumed = resumeRun(makeAgent(), snapshot, {
      llm: stubSignal([{ toolCalls: [{ id: 'c2', name: 'respond', args: { data: { done: true } } }] }]),
      onEvent: (event) => {
        if (event.type !== 'approval-required') return;
        asked.push(event.approval.id);
        resumed?.approve(event.approval.id);
      },
    });
    const result = await resumed.result;

    expect(result.ok).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toBe(snapshot.pending.approvalId);
  });
});

// ═══════════════════════════════════════════════════════════
// run.abort(reason) — the reason reaches the result
// ═══════════════════════════════════════════════════════════

describe('run.abort(reason)', () => {
  // A run waiting for a person is a run that can be stopped at a known moment.
  const stopWhileWaiting = async (stop: (run: RunHandle<{ done: boolean }>, controller: AbortController) => void) => {
    const controller = new AbortController();
    const events: CortexEvent[] = [];
    let markWaiting: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      markWaiting = resolve;
    });
    const run = makeAgent().run('go', {
      llm: stubSignal(SCRIPT()),
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'approval-required') markWaiting();
      },
    });
    await waiting;
    stop(run, controller);
    const result = await run.result;
    if (result.ok) throw new Error('expected the run to be aborted');
    return { error: result.error, result, events };
  };

  it('is the cause of the aborted result, and of the result run-end carries', async () => {
    const { error, result, events } = await stopWhileWaiting((run) => run.abort('the member closed the tab'));
    expect(error.code).toBe('aborted');
    expect(error.message).toBe('run aborted');
    expect(error.cause).toBe('the member closed the tab');
    const ended = events.find((event) => event.type === 'run-end');
    expect(ended?.type === 'run-end' && ended.result).toBe(result);
  });

  it('leaves the result as it was when no reason is given', async () => {
    const { error } = await stopWhileWaiting((run) => run.abort());
    expect(error).toEqual({ code: 'aborted', message: 'run aborted', runId: error.runId, agentPath: ['careful'] });
    expect('cause' in error).toBe(false);
  });

  it('keeps the reason of the abort that stopped the run', async () => {
    const { error } = await stopWhileWaiting((run) => {
      run.abort('first');
      run.abort('second');
    });
    expect(error.cause).toBe('first');
  });

  // The caller's own signal is the caller's: what it was aborted with is not
  // read, so a run stopped that way gains nothing it did not have.
  it('carries nothing when the run was stopped through options.signal', async () => {
    const { error } = await stopWhileWaiting((_run, controller) => controller.abort(new Error('closed')));
    expect(error.code).toBe('aborted');
    expect('cause' in error).toBe(false);
  });

  it('gives no reason to a run that was already stopped through options.signal', async () => {
    const { error } = await stopWhileWaiting((run, controller) => {
      controller.abort();
      run.abort('too late');
    });
    expect('cause' in error).toBe(false);
  });

  // The reason is kept beside the run's signal, never put ON it: a tool, or the
  // fetch it started, tells an abort by its AbortError.
  it("a tool's signal still aborts with an AbortError", async () => {
    const seen: { reason?: unknown } = {};
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const wait = defineTool({
      id: 'wait',
      name: 'wait',
      description: 'Waits until it is told to stop.',
      input: z.object({}),
      execute: (_args, ctx) =>
        new Promise<string>((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            seen.reason = ctx.signal.reason;
            reject(new Error('stopped'));
          });
          markStarted();
        }),
    });
    const waiter = defineAgent({ id: 'waiter', instructions: 'wait', tools: [wait], output: { schema: OutSchema } });
    const run = waiter.run('go', { llm: stubSignal([{ toolCalls: [{ id: 'c1', name: 'wait', args: {} }] }]) });
    await started;
    run.abort('the member closed the tab');
    const result = await run.result;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('aborted');
    expect(result.error.cause).toBe('the member closed the tab');
    const reason = seen.reason;
    expect(typeof reason === 'object' && reason !== null && 'name' in reason ? reason.name : undefined).toBe('AbortError');
  });
});
