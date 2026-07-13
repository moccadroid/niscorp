import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineAgent, defineTool, stepCount, type CortexEvent } from '../../src';
import { stubSignal } from '../helpers/stub-signal';

const CalcSchema = z.object({ answer: z.number() });

const calc = defineTool({
  id: 'calc',
  name: 'calc',
  description: 'Adds two numbers.',
  input: z.object({ a: z.number(), b: z.number() }),
  execute: ({ a, b }) => a + b,
});

const calcAgent = defineAgent({
  id: 'calc-agent',
  description: 'Adds numbers with a tool.',
  instructions: 'Use calc, then respond.',
  tools: [calc],
  output: { schema: CalcSchema },
});

const collectEvents = async (events: AsyncIterable<CortexEvent>): Promise<CortexEvent[]> => {
  const collected: CortexEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

describe('the loop — respond strategy', () => {
  it('runs tool → respond and returns a typed envelope', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'calc', args: { a: 2, b: 3 } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 5 }, reasoning: 'added' } }] },
    ]);

    const run = calcAgent.run('what is 2+3?', { llm });
    const result = await run.result;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.data.answer).toBe(5);
      expect(result.output.reasoning).toBe('added');
    }
    expect(result.meta.steps).toBe(2);
    expect(result.meta.strategy).toBe('respond');
    expect(result.meta.usage.totalTokens).toBe(30);

    // The second request's transcript carries the tool result.
    const second = llm.requests[1];
    expect(second).toBeDefined();
    const toolMessage = second?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('5');
    // The respond tool descriptor is on every request.
    expect(second?.tools?.some((tool) => tool.name === 'respond')).toBe(true);
  });

  it('an invalid respond attempt is a counted revision failure with a specific correction', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 'wrong' } } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 7 } } }] },
    ]);

    const run = calcAgent.run('7', { llm });
    const result = await run.result;
    expect(result.ok).toBe(true);
    // The model DELIVERED the wrong thing — revision, counted.
    expect(result.meta.outputRetries).toBe(1);

    const messages = llm.requests[1]?.messages ?? [];
    const correction = messages[messages.length - 1];
    expect(correction?.role).toBe('system');
    expect(typeof correction?.content === 'string' ? correction.content : '').toContain('invalid');
  });

  it('corrects a termination violation (prose stop without respond)', async () => {
    const llm = stubSignal([
      { text: ['The answer is 5.'] },
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 5 } } }] },
    ]);

    const run = calcAgent.run('go', { llm });
    const result = await run.result;
    expect(result.ok).toBe(true);
    // Prose is a TRANSPORT failure (could not deliver) — uncounted;
    // the revision budget is reserved for wrong deliveries.
    expect(result.meta.outputRetries).toBe(0);

    const messages = llm.requests[1]?.messages ?? [];
    const roles = messages.map((message) => message.role);
    // assistant prose kept, correction appended.
    expect(roles).toContain('assistant');
    const correction = messages[messages.length - 1];
    expect(correction?.role).toBe('system');
    expect(typeof correction?.content === 'string' ? correction.content : '').toContain('respond');
  });

  it('accepts an emitted envelope as a legal exit (respond-or-finish)', async () => {
    const llm = stubSignal([
      // No respond call — the final text IS the envelope.
      { text: ['{"data":{"answer":9},"reasoning":"emitted"}'] },
    ]);

    const events: CortexEvent[] = [];
    const result = await calcAgent.run('9', { llm, onEvent: (event) => events.push(event) }).result;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.data.answer).toBe(9);
      expect(result.output.reasoning).toBe('emitted');
    }
    expect(result.meta.outputRetries).toBe(0);
    expect(events.some((event) => event.type === 'retry')).toBe(false);
  });

  it('accepts a fenced emitted envelope', async () => {
    const llm = stubSignal([{ text: ['```json\n{"data":{"answer":3}}\n```'] }]);

    const result = await calcAgent.run('3', { llm }).result;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(3);
  });

  it('an invalid emitted envelope costs an output retry with a specific correction', async () => {
    const llm = stubSignal([
      { text: ['{"data":{"answer":"wrong"}}'] },
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 4 } } }] },
    ]);

    const events: CortexEvent[] = [];
    const result = await calcAgent.run('4', { llm, onEvent: (event) => events.push(event) }).result;
    expect(result.ok).toBe(true);
    expect(result.meta.outputRetries).toBe(1);

    const retry = events.find((event) => event.type === 'retry');
    expect(retry?.type === 'retry' && retry.kind).toBe('output');

    const messages = llm.requests[1]?.messages ?? [];
    const correction = messages[messages.length - 1];
    expect(correction?.role).toBe('system');
    expect(typeof correction?.content === 'string' ? correction.content : '').toContain('invalid');
  });

  it('accepts an UNWRAPPED payload as respond args (the arrived-without-its-coat rung)', async () => {
    const llm = stubSignal([
      // The payload itself, no envelope around it — the classic collision
      // when the payload has its own field names (a Nova action's `data`).
      { toolCalls: [{ id: 'c1', name: 'respond', args: { answer: 12 } }] },
    ]);

    const result = await calcAgent.run('12', { llm }).result;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(12);
    expect(result.meta.outputRetries).toBe(0);
  });

  it('accepts an UNWRAPPED payload emitted as text', async () => {
    const llm = stubSignal([{ text: ['{"answer":8}'] }]);

    const result = await calcAgent.run('8', { llm }).result;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(8);
  });

  it('never unwraps a plausible envelope — a bad wrapped payload still fails', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 'wrong' } } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 3 } } }] },
    ]);

    const result = await calcAgent.run('3', { llm }).result;
    expect(result.ok).toBe(true);
    expect(result.meta.outputRetries).toBe(1);
  });

  it('a rejected pseudo-tool call carrying prose gets a correction naming it', async () => {
    const llm = stubSignal([
      // gpt-oss speaking through a pseudo-tool named `response` — signal
      // recovered the rejection; nothing in the prose args salvages.
      { rejection: { name: 'response', argsText: 'Created the pipeline screen.', truncated: false } },
      { toolCalls: [{ id: 'c1', name: 'respond', args: { response: 'Created the pipeline screen.', data: { answer: 1 } } }] },
    ]);

    const result = await calcAgent.run('go', { llm }).result;
    expect(result.ok).toBe(true);
    expect(result.meta.outputRetries).toBe(0);

    const messages = llm.requests[1]?.messages ?? [];
    const correction = messages[messages.length - 1];
    expect(correction?.role).toBe('system');
    const content = typeof correction?.content === 'string' ? correction.content : '';
    expect(content).toContain('"response"');
    expect(content).toContain('JSON envelope');
  });

  it('a termination retry carries the stray text as evidence', async () => {
    const llm = stubSignal([
      { text: ['The answer is 5.'] },
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 5 } } }] },
    ]);

    const events: CortexEvent[] = [];
    const result = await calcAgent.run('go', { llm, onEvent: (event) => events.push(event) }).result;
    expect(result.ok).toBe(true);

    const retry = events.find((event) => event.type === 'retry');
    expect(retry?.type === 'retry' && retry.kind).toBe('termination');
    expect(retry?.type === 'retry' && retry.issues).toContain('The answer is 5.');
  });

  it('drops a finish attempt in a mixed turn; the sibling tool call executes', async () => {
    const llm = stubSignal([
      {
        toolCalls: [
          { id: 'c1', name: 'calc', args: { a: 1, b: 1 } },
          { id: 'c2', name: 'respond', args: { data: { answer: 2 } } },
        ],
      },
      { toolCalls: [{ id: 'c3', name: 'respond', args: { data: { answer: 2 } } }] },
    ]);

    const run = calcAgent.run('1+1', { llm });
    const result = await run.result;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(2);

    // The domain call executed; the mixed-turn respond was dropped by
    // the router (finish attempts must come alone) — no tool message.
    const second = llm.requests[1];
    const toolMessages = second?.messages.filter((message) => message.role === 'tool') ?? [];
    expect(toolMessages.find((message) => message.toolCallId === 'c1')?.content).toBe('2');
    expect(toolMessages.find((message) => message.toolCallId === 'c2')).toBeUndefined();
  });

  it('stops with a structured error when stopWhen fires', async () => {
    const agent = defineAgent({
      id: 'bounded',
      instructions: 'loop forever',
      tools: [calc],
      output: { schema: CalcSchema },
      stopWhen: [stepCount(1)],
    });
    const llm = stubSignal([{ toolCalls: [{ id: 'c1', name: 'calc', args: { a: 1, b: 1 } }] }]);

    const result = await agent.run('go', { llm }).result;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('stopped');
      expect(result.error.stop).toBe('steps');
    }
  });

  it('decodes double-encoded (stringified) tool and respond args', async () => {
    const llm = stubSignal([
      // Reasoning models sometimes serialize the args object INTO a string.
      { toolCalls: [{ id: 'c1', name: 'calc', args: '{"a":2,"b":3}' }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: '{"data":{"answer":5}}' }] },
    ]);

    const result = await calcAgent.run('2+3', { llm }).result;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(5);
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('5');
  });

  it('tells the model when its args arrived as one string', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'calc', args: 'add two and three' }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 5 } } }] },
    ]);

    const result = await calcAgent.run('2+3', { llm }).result;
    expect(result.ok).toBe(true);
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('arrived as ONE STRING');
  });

  it('a provider-rejected REAL tool call comes back as a normal tool call — the 400 never existed', async () => {
    const llm = stubSignal([
      // Groq-style rejection of a calc call with incomplete args: signal
      // recovers and routes it back to the tool; the tool's own schema
      // judges the args (missing b → input_invalid), the model retries.
      { rejection: { name: 'calc', args: { a: 2 }, argsText: '{"a":2}', truncated: false } },
      { toolCalls: [{ id: 'c1', name: 'calc', args: { a: 2, b: 3 } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 5 } } }] },
    ]);

    const events: CortexEvent[] = [];
    const result = await calcAgent.run('2+3', { llm, onEvent: (event) => events.push(event) }).result;
    expect(result.ok).toBe(true);
    // Provider hiccups are not the run's fault — the output budget is intact.
    expect(result.meta.outputRetries).toBe(0);

    // A rejection that ROUTED is not a retry — no event, no noise; the
    // trace shows the tool call itself.
    expect(events.some((event) => event.type === 'retry')).toBe(false);

    // The recovered call got a TOOL-shaped answer (input_invalid), not a sermon.
    const second = llm.requests[1];
    const toolMessage = second?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('input_invalid');
  });

  it('salvages a provider-rejected pseudo-tool call that carries a valid envelope', async () => {
    const llm = stubSignal([
      // gpt-oss pseudo-tool fixation with a COMPLETE, correct payload:
      // the run finishes on the recovered attempt instead of re-running
      // finished work.
      { text: ['[attempted tool: response] {"data":{"answer":5},"reasoning":"added"}'], finishReason: 'error_recovered' },
    ]);

    const result = await calcAgent.run('2+3', { llm }).result;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.data.answer).toBe(5);
      expect(result.output.reasoning).toBe('added');
    }
    expect(result.meta.steps).toBe(1);
  });

  it('never treats a rejected REAL tool call as output', async () => {
    const llm = stubSignal([
      // A real tool's rejected call whose args HAPPEN to look like a
      // valid envelope — it is a failed tool call, not a finish attempt.
      { rejection: { name: 'calc', args: { data: { answer: 5 } }, argsText: '{"data":{"answer":5}}', truncated: false } },
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 7 } } }] },
    ]);

    const result = await calcAgent.run('2+3', { llm }).result;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(7);
  });

  it('an envelope-shaped rejected attempt gets corrected with SPECIFIC issues', async () => {
    const llm = stubSignal([
      { rejection: { name: 'json', args: { data: { answer: 'five' } }, argsText: '{"data":{"answer":"five"}}', truncated: false } },
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 5 } } }] },
    ]);

    const result = await calcAgent.run('2+3', { llm }).result;
    expect(result.ok).toBe(true);

    const messages = llm.requests[1]?.messages ?? [];
    const correction = messages[messages.length - 1];
    expect(correction?.role).toBe('system');
    // Semantic evidence comes from validateEnvelope — the one judge.
    const content = typeof correction?.content === 'string' ? correction.content : '';
    expect(content).toContain('data.answer');
  });

  it('a call to an unknown tool becomes an output attempt judged by the envelope', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'nope', args: {} }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 0 } } }] },
    ]);

    const run = calcAgent.run('go', { llm });
    const result = await run.result;
    expect(result.ok).toBe(true);

    // The gate is a container check; the SEMANTIC judge (validateEnvelope)
    // writes the correction — here the missing data payload.
    const messages = llm.requests[1]?.messages ?? [];
    const correction = messages[messages.length - 1];
    expect(correction?.role).toBe('system');
    expect(typeof correction?.content === 'string' ? correction.content : '').toContain('data');
  });

  it('the model sees tool NAMES and may call name or id; observations keep the id', async () => {
    const search = defineTool({
      id: 'catalog.search',
      name: 'search',
      description: 'Searches the catalog.',
      input: z.object({ q: z.string() }),
      execute: ({ q }) => `hits for ${q}`,
    });
    const agent = defineAgent({
      id: 'named',
      instructions: 'search then respond',
      tools: [search],
      output: { schema: CalcSchema },
    });
    const llm = stubSignal([
      // The model calls the NAME (as prompts teach), not the id.
      { toolCalls: [{ id: 'c1', name: 'search', args: { q: 'x' } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 1 } } }] },
    ]);

    const events: CortexEvent[] = [];
    const result = await agent.run('go', { llm, onEvent: (event) => events.push(event) }).result;
    expect(result.ok).toBe(true);

    // Descriptor carried the name…
    expect(llm.requests[0]?.tools?.some((tool) => tool.name === 'search')).toBe(true);
    // …the call executed…
    const toolMessage = llm.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toBe('hits for x');
    // …and the observation carries the canonical id for policy/tracing.
    const toolEnd = events.find((event) => event.type === 'tool-end');
    expect(toolEnd?.type === 'tool-end' && toolEnd.observation.toolId).toBe('catalog.search');
  });

  it('runs the async output validator and retries on its verdict', async () => {
    let attempts = 0;
    const agent = defineAgent({
      id: 'validated',
      instructions: 'respond',
      output: {
        schema: CalcSchema,
        validate: async (output) => {
          attempts += 1;
          return output.data.answer >= 10 ? { ok: true } : { retry: 'answer must be at least 10' };
        },
      },
    });
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'respond', args: { data: { answer: 5 } } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 12 } } }] },
    ]);

    const result = await agent.run('go', { llm }).result;
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(result.meta.outputRetries).toBe(1);
    const messages = llm.requests[1]?.messages ?? [];
    const correction = messages[messages.length - 1];
    expect(correction?.role).toBe('system');
    expect(typeof correction?.content === 'string' ? correction.content : '').toContain('at least 10');
  });

  it('chat agents return response-only envelopes with data undefined', async () => {
    const chat = defineAgent({
      id: 'chatty',
      instructions: 'be nice',
    });
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'respond', args: { response: 'hello!' } }] },
    ]);

    const result = await chat.run('hi', { llm }).result;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.response).toBe('hello!');
      expect(result.output.data).toBeUndefined();
    }
  });

  it('emits the event stream in order', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'calc', args: { a: 2, b: 2 } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 4 } } }] },
    ]);

    const run = calcAgent.run('2+2', { llm });
    const events = await collectEvents(run.events);
    await run.result;

    const types = events.map((event) => event.type);
    expect(types[0]).toBe('run-start');
    expect(types[types.length - 1]).toBe('run-end');
    expect(types.indexOf('tool-start')).toBeGreaterThan(types.indexOf('step-start'));
    expect(types.indexOf('tool-end')).toBeGreaterThan(types.indexOf('tool-start'));
    for (const event of events) {
      expect(event.runId).toBe(run.runId);
      expect(event.agentPath).toEqual(['calc-agent']);
    }
    const seqs = events.map((event) => event.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });
});
