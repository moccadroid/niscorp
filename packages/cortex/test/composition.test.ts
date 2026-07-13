import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createManifold, defineAgent, asTool, type CortexEvent, type RunHandle } from '../src';
import { stubSignal } from './helpers/stub-signal';

const AnswerSchema = z.object({ answer: z.number() });

const specialist = defineAgent({
  id: 'specialist',
  description: 'Computes answers.',
  instructions: 'respond with the answer',
  output: { schema: AnswerSchema },
});

describe('manifold', () => {
  it('registers agents, rejects duplicates, and merges the default llm', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 1 } } }] },
    ]);
    const manifold = createManifold({ llm });
    manifold.register(specialist);
    expect(() => manifold.register(specialist)).toThrow(/duplicate/);

    const result = await manifold.run<{ answer: number }>('specialist', 'one').result;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(1);
  });

  it('throws for unregistered agents', () => {
    const manifold = createManifold({});
    expect(() => manifold.run('ghost', 'boo')).toThrow(/not registered/);
  });

  it('taps every run created through it', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 2 } } }] },
    ]);
    const tapped: Array<RunHandle<unknown>> = [];
    const manifold = createManifold({ llm, onRun: (run) => tapped.push(run) });
    manifold.register(specialist);

    const handle = manifold.run('specialist', 'two');
    await handle.result;
    expect(tapped).toHaveLength(1);
    expect(tapped[0]?.runId).toBe(handle.runId);
  });
});

describe('asTool — delegation is a tool call', () => {
  it('runs the child agent, forwards its events with the extended agentPath', async () => {
    // Child: one respond turn. Parent: delegate → respond.
    const childLlm = stubSignal([
      { toolCalls: [{ id: 'k1', name: 'respond', args: { data: { answer: 21 } } }] },
    ]);
    const parentLlm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'specialist', args: { input: 'half of 42?' } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { response: 'done' } }] },
    ]);

    const parent = defineAgent({
      id: 'orchestrator',
      instructions: 'delegate, then respond',
      tools: [asTool(specialist, { llm: childLlm })],
    });

    const events: CortexEvent[] = [];
    const run = parent.run('go', { llm: parentLlm, onEvent: (event) => events.push(event) });
    const result = await run.result;
    expect(result.ok).toBe(true);

    // The child's run-start forwarded into the parent stream, tagged
    // with the nested agentPath.
    const childStart = events.find(
      (event) => event.type === 'run-start' && event.agentPath.length === 2,
    );
    expect(childStart?.agentPath).toEqual(['orchestrator', 'specialist']);

    // The child's envelope data became the tool result the parent saw.
    const toolMessage = parentLlm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe(JSON.stringify({ answer: 21 }));
  });

  it('select overrides the envelope→result mapping', async () => {
    const childLlm = stubSignal([
      {
        toolCalls: [
          { id: 'k1', name: 'respond', args: { response: 'prose', data: { answer: 5 } } },
        ],
      },
    ]);
    const parentLlm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'specialist', args: { input: 'x' } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { response: 'done' } }] },
    ]);

    const parent = defineAgent({
      id: 'selector',
      instructions: 'delegate',
      tools: [asTool(specialist, { llm: childLlm, select: (output) => output.response ?? '' })],
    });

    await parent.run('go', { llm: parentLlm }).result;
    const toolMessage = parentLlm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('prose');
  });

  it('a failed child run surfaces as a tool error string, not a parent failure', async () => {
    const childLlm = stubSignal([{ text: ['no respond call'] }, { text: ['still none'] }, { text: ['nope'] }]);
    const parentLlm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'specialist', args: { input: 'x' } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { response: 'recovered' } }] },
    ]);

    const parent = defineAgent({
      id: 'resilient',
      instructions: 'delegate',
      tools: [asTool(specialist, { llm: childLlm })],
    });

    const result = await parent.run('go', { llm: parentLlm }).result;
    expect(result.ok).toBe(true);
    const toolMessage = parentLlm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('error:');
  });

  it('manifold.asTool wires defaults the same way', async () => {
    const llm = stubSignal([
      // parent turn 1: delegate
      { toolCalls: [{ id: 'c1', name: 'specialist', args: { input: 'q' } }] },
      // child turn (same default llm): respond
      { toolCalls: [{ id: 'k1', name: 'respond', args: { data: { answer: 8 } } }] },
      // parent turn 2: respond
      { toolCalls: [{ id: 'c2', name: 'respond', args: { response: 'ok' } }] },
    ]);
    const manifold = createManifold({ llm });
    manifold.register(specialist);

    const parent = defineAgent({
      id: 'boss',
      instructions: 'delegate',
      tools: [manifold.asTool('specialist')],
    });
    manifold.register(parent);

    const result = await manifold.run('boss', 'go').result;
    expect(result.ok).toBe(true);
  });
});
