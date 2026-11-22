import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { defineAgent, defineTool, asTool, stepCount, type ToolDefinition } from '../src';
import { stubSignal } from './helpers/stub-signal';

const respond = (id: string) => ({ toolCalls: [{ id, name: 'respond', args: { response: 'done' } }] });
const call = (id: string, name: string, args: unknown = {}) => ({ toolCalls: [{ id, name, args }] });

const waitOn = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('a tool call past its time limit', () => {
  it('has its ctx.signal aborted, so an email the model sent again goes out once', async () => {
    const sent: string[] = [];
    const reasons: unknown[] = [];
    const sendEmail = defineTool({
      id: 'send_email',
      name: 'send_email',
      description: 'Sends an email.',
      timeoutMs: 50,
      input: z.object({ attempt: z.string() }),
      execute: async ({ attempt }, ctx) => {
        ctx.signal.addEventListener('abort', () => reasons.push(ctx.signal.reason), { once: true });
        await waitOn(attempt === 'first' ? 120 : 10, ctx.signal);
        sent.push(attempt);
        return 'sent';
      },
    });
    const llm = stubSignal([
      call('c1', 'send_email', { attempt: 'first' }),
      call('c2', 'send_email', { attempt: 'retry' }),
      respond('r'),
    ]);
    const result = await defineAgent({ id: 'mailer', instructions: 'Send it.', tools: [sendEmail] }).run('go', { llm }).result;
    await settle(150);

    expect(result.ok).toBe(true);
    expect(llm.requests[1]?.messages.find((m) => m.role === 'tool')?.content).toBe('error: tool send_email timed out after 50ms');
    expect(sent).toEqual(['retry']);
    expect(reasons.map((reason) => (reason instanceof Error ? reason.name : reason))).toEqual(['AbortError']);
  });

  it('stops a delegated agent at the limit', async () => {
    let written = 0;
    const slowWrite = defineTool({
      id: 'write',
      name: 'write',
      description: 'Writes a file.',
      input: z.object({}),
      execute: async (_input, ctx) => {
        await waitOn(120, ctx.signal);
        written += 1;
        return 'written';
      },
    });
    const child = defineAgent({ id: 'writer', description: 'Writes files.', instructions: 'Write.', tools: [slowWrite] });
    const childLlm = stubSignal([call('w1', 'write'), respond('cr')]);
    const llm = stubSignal([call('d1', 'writer', { input: 'write it' }), respond('r')]);
    const parent = defineAgent({ id: 'boss', instructions: 'Delegate.', tools: [asTool(child, { llm: childLlm, timeoutMs: 50 })] });

    const result = await parent.run('go', { llm }).result;
    await settle(150);

    expect(result.ok).toBe(true);
    expect(llm.requests[1]?.messages.find((m) => m.role === 'tool')?.content).toBe('error: tool writer timed out after 50ms');
    expect(written).toBe(0);
    expect(childLlm.requests).toHaveLength(1);
  });

  it('leaves no listener on the run signal and no timer behind, after many calls and time limits', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const abortCalls = (calls: unknown[][], contexts: unknown[], target: AbortSignal): number =>
      calls.filter((args, index) => contexts[index] === target && args[0] === 'abort').length;
    const listenerCounts: number[] = [];
    const work = defineTool({
      id: 'work',
      name: 'work',
      description: 'Works for a while.',
      timeoutMs: 20,
      input: z.object({ ms: z.number() }),
      execute: async ({ ms }, ctx) => {
        await waitOn(ms, ctx.signal);
        return 'worked';
      },
    });
    const turns = Array.from({ length: 30 }, (_, index) => call(`c${index}`, 'work', { ms: index % 2 === 0 ? 1 : 60_000 }));
    const llm = stubSignal([...turns, respond('r')]);
    const agent = defineAgent({
      id: 'worker',
      instructions: 'Work.',
      tools: [work],
      stopWhen: [stepCount(40)],
      onToolResult: [
        (_observation, ctx) => {
          listenerCounts.push(abortCalls(added.mock.calls, added.mock.contexts, ctx.signal) - abortCalls(removed.mock.calls, removed.mock.contexts, ctx.signal));
        },
      ],
    });

    const run = agent.run('go', { llm });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await run.result;

    expect(result.ok).toBe(true);
    expect(listenerCounts).toEqual(Array.from({ length: 30 }, () => 0));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('a tool call within its time limit', () => {
  it('is unchanged: the model gets the result and the signal never aborts', async () => {
    let signal: AbortSignal | undefined;
    const quick = defineTool({
      id: 'quick',
      name: 'quick',
      description: 'Answers quickly.',
      timeoutMs: 100,
      input: z.object({}),
      execute: async (_input, ctx) => {
        signal = ctx.signal;
        await waitOn(5, ctx.signal);
        return { answer: 42 };
      },
    });
    const llm = stubSignal([call('q1', 'quick'), respond('r')]);
    const result = await defineAgent({ id: 'asker', instructions: 'Ask.', tools: [quick] }).run('go', { llm }).result;
    await settle(150);

    expect(result.ok).toBe(true);
    expect(llm.requests[1]?.messages.find((m) => m.role === 'tool')?.content).toBe('{"answer":42}');
    expect(signal?.aborted).toBe(false);
  });

  it('is on time when it finishes in the same moment as its limit', async () => {
    const onTheDot = defineTool({
      id: 'dot',
      name: 'dot',
      description: 'Answers at 50 ms.',
      timeoutMs: 50,
      input: z.object({}),
      execute: () => new Promise((resolve) => setTimeout(() => resolve('on time'), 50)),
    });
    const llm = stubSignal([call('d1', 'dot'), respond('r')]);
    await defineAgent({ id: 'timer', instructions: 'Ask.', tools: [onTheDot] }).run('go', { llm }).result;

    expect(llm.requests[1]?.messages.find((m) => m.role === 'tool')?.content).toBe('on time');
  });

  it('has no limit when a hand-built definition sets timeoutMs to 0', async () => {
    const built = defineTool({ id: 'slow', name: 'slow', description: 'Answers.', input: z.object({}), execute: async () => { await settle(5); return 'done'; } });
    const unlimited: ToolDefinition = { toolId: built.toolId, config: { ...built.config, timeoutMs: 0 } };
    const llm = stubSignal([call('s1', 'slow'), respond('r')]);
    await defineAgent({ id: 'patient', instructions: 'Ask.', tools: [unlimited] }).run('go', { llm }).result;

    expect(llm.requests[1]?.messages.find((m) => m.role === 'tool')?.content).toBe('done');
  });
});
