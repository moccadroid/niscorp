import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSignal, defineTool, type StepResult } from '../src';
import { sdkOverFetch, textChunk, finishChunk, type Turn } from './sdk-over-fetch';

const custom = { baseUrl: 'http://fake.local/v1', apiKey: 'k', model: 'm', capabilities: { nativeTools: true } };
const Items = z.object({ items: z.array(z.string()) });
const Order = z.object({ name: z.string(), total: z.number() });

const cutThenWhole = (): Turn[] => [
  { chunks: [textChunk('{"items":["alpha","beta","gam'), finishChunk('length')] },
  { chunks: [textChunk('{"items":["alpha","beta","gamma"]}'), finishChunk('stop')] },
];

const completion = (content: string, finishReason: string): Turn => ({
  json: {
    id: 'x',
    object: 'chat.completion',
    created: 0,
    model: 'm',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  },
});

describe('a reply the provider cut off', () => {
  it('is rescued by default, and the result says how the reply ended', async () => {
    const fake = sdkOverFetch(cutThenWhole());
    const result = await createSignal(custom, { client: fake.client }).schema(Items).complete('list');
    expect(result.response).toEqual({ items: ['alpha', 'beta'] });
    expect(result.meta.finishReason).toBe('length');
    expect(fake.requests()).toBe(1);
  });

  it('is retried with the evidence when the caller sets refuseCutOff', async () => {
    const fake = sdkOverFetch(cutThenWhole());
    const result = await createSignal(custom, { client: fake.client, refuseCutOff: true }).schema(Items).complete('list');
    expect(result.response).toEqual({ items: ['alpha', 'beta', 'gamma'] });
    expect(result.meta.retries).toBe(1);
    expect(result.meta.finishReason).toBe('stop');
    expect(JSON.stringify(result.history)).toContain('the reply was cut off (finish reason \\"length\\") before its JSON closed');
  });

  it('carries wire.truncated on a rescued step, streamed or not', async () => {
    const request = { messages: [{ role: 'user' as const, content: 'x' }], output: { accept: Order } };
    let streamed: StepResult | undefined;
    const llm = createSignal(custom, { client: sdkOverFetch([{ chunks: [textChunk('{"name":"order","total":12'), finishChunk('length')] }]).client });
    for await (const event of llm.stepStream(request)) if (event.type === 'done') streamed = event.result;
    expect(streamed?.wire).toEqual({ rung: 'close-truncated', truncated: true });

    const stepped = await createSignal(custom, { client: sdkOverFetch([completion('{"name":"order","total":12', 'length')]).client }).step(request);
    expect(stepped.wire).toEqual({ rung: 'close-truncated', truncated: true });
  });

  it('is a failed, truncated step under output.refuseCutOff', async () => {
    const llm = createSignal(custom, { client: sdkOverFetch([completion('{"name":"order","total":12', 'length')]).client });
    const result = await llm.step({ messages: [{ role: 'user', content: 'x' }], output: { accept: Order, refuseCutOff: true } });
    expect(result.outcome).toEqual({
      kind: 'failed',
      truncated: true,
      evidence: 'the reply was cut off (finish reason "length") before its JSON closed. It began: {"name":"order","total":12',
    });
  });

  it('is not refused when the model left off its brace and stopped', async () => {
    const fake = sdkOverFetch([{ chunks: [textChunk('{"name":"order","total":1234'), finishChunk('stop')] }]);
    const result = await createSignal(custom, { client: fake.client, refuseCutOff: true }).schema(Order).complete('x');
    expect(result.response).toEqual({ name: 'order', total: 1234 });
  });

  it('is not refused when its JSON closed before the cut prose', async () => {
    const fake = sdkOverFetch([{ chunks: [textChunk('{"name":"order","total":1234}\n\nThe total is the sum of al'), finishChunk('length')] }]);
    const result = await createSignal(custom, { client: fake.client, refuseCutOff: true }).schema(Order).complete('x');
    expect(result.response).toEqual({ name: 'order', total: 1234 });
  });

  it('gives a reply with no schema its finish reason', async () => {
    const fake = sdkOverFetch([{ chunks: [textChunk('The answer is'), finishChunk('length')] }]);
    const result = await createSignal(custom, { client: fake.client }).complete('x');
    expect(result.response).toBe('The answer is');
    expect(result.meta.finishReason).toBe('length');
  });
});

describe('a Groq tool call rejected with its attempt', () => {
  const rejected = (failedGeneration: string): Turn[] => [
    { status: 400, error: { code: 'tool_use_failed', failed_generation: failedGeneration } },
    { chunks: [textChunk('done'), finishChunk('stop')] },
  ];
  const transfer = (seen: unknown[]) =>
    defineTool({
      name: 'transfer',
      description: 'Moves money to an account.',
      input: z.object({ to: z.string(), amount: z.number() }),
      execute: (input) => {
        seen.push(input);
        return 'ok';
      },
    });

  it('is not run when its arguments were cut, and the model is told they are invalid', async () => {
    const seen: unknown[] = [];
    const fake = sdkOverFetch(rejected('{"name":"transfer","arguments":{"to":"acct-1","amount":10'));
    const result = await createSignal('groq', { apiKey: 'k', client: fake.client }).tools([transfer(seen)]).complete('pay 1000');
    expect(seen).toEqual([]);
    expect(String(result.meta.toolCalls[0]?.result)).toMatch(/^error: input_invalid/);
    expect(fake.requests()).toBe(2);
  });

  it.each([
    ['only the outer brace is missing', '{"name":"transfer","arguments":{"to":"acct-1","amount":1000}'],
    ['the cut is in a key after the arguments', '{"name":"transfer","arguments":{"to":"acct-1","amount":1000},"'],
    ['the cut is in a value after the arguments', '{"name":"transfer","arguments":{"to":"acct-1","amount":1000},"id":"call_1'],
  ])('runs when %s', async (_case, attempt) => {
    const seen: unknown[] = [];
    const fake = sdkOverFetch(rejected(attempt));
    await createSignal('groq', { apiKey: 'k', client: fake.client }).tools([transfer(seen)]).complete('pay 1000');
    expect(seen).toEqual([{ to: 'acct-1', amount: 1000 }]);
    expect(fake.requests()).toBe(2);
  });
});

describe('a Groq rejection that carried the attempt cut short', () => {
  const cutAttempt = (): Turn[] => [
    { status: 400, error: { code: 'json_validate_failed', failed_generation: '{"items":["alpha","beta","gam' } },
    { chunks: [textChunk('{"items":["alpha","beta","gamma"]}'), finishChunk('stop')] },
  ];

  it('is rescued by default and marked truncated', async () => {
    const fake = sdkOverFetch(cutAttempt());
    const result = await createSignal('groq', { apiKey: 'k', client: fake.client }).step({
      messages: [{ role: 'user', content: 'list' }],
      output: { accept: Items },
    });
    expect(result.outcome).toEqual({ kind: 'output', value: { items: ['alpha', 'beta'] } });
    expect(result.wire).toMatchObject({ rung: 'close-truncated', truncated: true });
  });

  it('is retried under refuseCutOff', async () => {
    const fake = sdkOverFetch(cutAttempt());
    const result = await createSignal('groq', { apiKey: 'k', client: fake.client, refuseCutOff: true }).schema(Items).complete('list');
    expect(result.response).toEqual({ items: ['alpha', 'beta', 'gamma'] });
    expect(result.meta.retries).toBe(1);
    expect(JSON.stringify(result.history)).toContain("the reply was cut off (the provider's rejection carried it cut short) before its JSON closed");
  });
});
