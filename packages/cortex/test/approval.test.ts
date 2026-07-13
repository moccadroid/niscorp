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
});
