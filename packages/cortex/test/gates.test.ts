import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineAgent, defineTool, type CortexEvent, type ToolGate, type ToolPolicy } from '../src';
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

const script = () => [
  { toolCalls: [{ id: 'c1', name: 'echo', args: { text: 'hi' } }] },
  { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { done: true } } }] },
];

const agentWith = (config: {
  toolGates?: ReadonlyArray<ToolGate<undefined>>;
  policy?: ToolPolicy;
}) =>
  defineAgent({
    id: 'gated',
    instructions: 'echo then respond',
    tools: [echo],
    output: { schema: OutSchema },
    ...config,
  });

describe('tool gates', () => {
  it('deny becomes an observation and a tool error the model sees', async () => {
    const llm = stubSignal(script());
    const events: CortexEvent[] = [];
    const agent = agentWith({ toolGates: [() => ({ deny: 'not today' })] });

    const result = await agent.run('go', { llm, onEvent: (event) => events.push(event) }).result;
    expect(result.ok).toBe(true); // the RUN succeeds; the CALL was denied

    const toolEnd = events.find((event) => event.type === 'tool-end');
    expect(toolEnd?.type === 'tool-end' && toolEnd.observation.kind).toBe('denied');
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('error: denied: not today');
  });

  it('allow may rewrite args before validation and execution', async () => {
    const llm = stubSignal(script());
    const agent = agentWith({
      toolGates: [() => ({ allow: true, args: { text: 'rewritten' } })],
    });

    await agent.run('go', { llm }).result;
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('rewritten');
  });

  it('policy allow-lists deny off-list tools', async () => {
    const llm = stubSignal(script());
    const agent = agentWith({ policy: { tools: { allow: ['other'] } } });

    await agent.run('go', { llm }).result;
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('not on the policy allow list');
  });

  it('policy risk ceilings deny risky tools', async () => {
    const llm = stubSignal(script());
    const agent = agentWith({ policy: { tools: { maxRiskLevel: 'medium' } } });

    await agent.run('go', { llm }).result;
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('risk ceiling');
  });

  it('run-level gates run after agent gates', async () => {
    const order: string[] = [];
    const llm = stubSignal(script());
    const agent = agentWith({
      toolGates: [
        () => {
          order.push('agent');
          return { allow: true };
        },
      ],
    });

    await agent.run('go', {
      llm,
      gates: [
        () => {
          order.push('run');
          return { allow: true };
        },
      ],
    }).result;
    expect(order).toEqual(['agent', 'run']);
  });
});

describe('result hooks', () => {
  it('replace a tool result before it reaches transcript and events', async () => {
    const llm = stubSignal(script());
    const events: CortexEvent[] = [];
    const agent = defineAgent({
      id: 'redacted',
      instructions: 'echo then respond',
      tools: [echo],
      output: { schema: OutSchema },
      onToolResult: [() => ({ result: '[REDACTED]' })],
    });

    await agent.run('go', { llm, onEvent: (event) => events.push(event) }).result;
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('[REDACTED]');
    const toolEnd = events.find((event) => event.type === 'tool-end');
    expect(toolEnd?.type === 'tool-end' && toolEnd.observation.kind === 'result' && toolEnd.observation.result).toBe(
      '[REDACTED]',
    );
  });
});
