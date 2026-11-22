import { describe, it, expect } from 'vitest';
import type { ChatAdapter, ProviderStreamDelta, StepStreamEvent } from '../src/types';
import { executeStepStream } from '../src/stream/execute-step-stream';
import { createOpenAICompatibleAdapter } from '../src/adapters/openai-compatible.adapter';
import { chatProviderEntry } from '../src/registry';
import { createSignal } from '../src/signal';
import { sdkOverFetch, toolCallChunk, finishChunk } from './sdk-over-fetch';

const lastOf = <T>(items: readonly T[]): T => {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error('expected the stream to emit at least one event, and it emitted none');
  return item;
};

const createMockAdapter = (deltas: ProviderStreamDelta[]): ChatAdapter => ({
  kind: 'chat',
  id: 'mock',
  chat: async () => ({
    content: '',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    finishReason: 'stop',
    raw: null,
  }),
  chatStream: async function* () {
    for (const d of deltas) yield d;
  },
});

const collect = async (iter: AsyncIterable<StepStreamEvent>): Promise<StepStreamEvent[]> => {
  const events: StepStreamEvent[] = [];
  for await (const ev of iter) events.push(ev);
  return events;
};

describe('stepStream — simple text', () => {
  it('yields text deltas followed by a done event with aggregated result', async () => {
    const adapter = createMockAdapter([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
      { type: 'usage', inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const events = await collect(executeStepStream({
      adapter,
      model: 'test',
      request: { messages: [{ role: 'user', content: 'hi' }] },
    }));

    expect(events[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(events[1]).toEqual({ type: 'text', text: ' world' });

    const done = lastOf(events);
    expect(done.type).toBe('done');
    if (done.type === 'done') {
      expect(done.result.content).toBe('Hello world');
      expect(done.result.usage.totalTokens).toBe(15);
      expect(done.result.finishReason).toBe('stop');
      expect(done.result.toolCalls).toEqual([]);
    }
  });

  it('yields a done event even when the stream has no text deltas', async () => {
    const adapter = createMockAdapter([
      { type: 'finish', finishReason: 'stop' },
    ]);
    const events = await collect(executeStepStream({
      adapter,
      model: 'test',
      request: { messages: [{ role: 'user', content: 'hi' }] },
    }));
    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(0);
    expect(lastOf(events).type).toBe('done');
  });
});

describe('stepStream — tool calls', () => {
  it('assembles tool call fragments and delivers parsed args on done', async () => {
    const adapter = createMockAdapter([
      { type: 'tool_call', index: 0, id: 'call_1', name: 'search' },
      { type: 'tool_call', index: 0, argsFragment: '{"q":' },
      { type: 'tool_call', index: 0, argsFragment: '"cats"}' },
      { type: 'finish', finishReason: 'tool_calls' },
    ]);

    const events = await collect(executeStepStream({
      adapter,
      model: 'test',
      request: {
        messages: [{ role: 'user', content: 'find cats' }],
        tools: [{ name: 'search', description: 'search', parameters: { type: 'object' } }],
      },
    }));

    const done = lastOf(events);
    expect(done.type).toBe('done');
    if (done.type === 'done') {
      expect(done.result.toolCalls).toEqual([
        { id: 'call_1', name: 'search', args: { q: 'cats' } },
      ]);
      expect(done.result.finishReason).toBe('tool_calls');
    }
  });

  it('does not auto-execute tools — caller owns the loop', async () => {
    let chatStreamCalls = 0;
    const adapter: ChatAdapter = {
      kind: 'chat',
      id: 'mock',
      chat: async () => ({
        content: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
        raw: null,
      }),
      chatStream: async function* () {
        chatStreamCalls += 1;
        yield { type: 'tool_call', index: 0, id: 'c1', name: 't', argsFragment: '{}' };
        yield { type: 'finish', finishReason: 'tool_calls' };
      },
    };
    await collect(executeStepStream({
      adapter,
      model: 'test',
      request: { messages: [{ role: 'user', content: 'go' }] },
    }));
    expect(chatStreamCalls).toBe(1);
  });

  it('preserves raw string when tool call args fail to parse', async () => {
    const adapter = createMockAdapter([
      { type: 'tool_call', index: 0, id: 'c1', name: 't', argsFragment: 'not-json' },
      { type: 'finish', finishReason: 'tool_calls' },
    ]);
    const events = await collect(executeStepStream({
      adapter,
      model: 'test',
      request: { messages: [{ role: 'user', content: 'go' }] },
    }));
    const done = lastOf(events);
    if (done.type === 'done') {
      expect(done.result.toolCalls[0]!.args).toBe('not-json');
    }
  });
});

describe('stepStream — tool_call_delta events', () => {
  it('yields one tool_call_delta per adapter fragment, in order', async () => {
    const adapter = createMockAdapter([
      { type: 'tool_call', index: 0, id: 'call_1', name: 'respond' },
      { type: 'tool_call', index: 0, argsFragment: '{"data":' },
      { type: 'tool_call', index: 0, argsFragment: '{"answer":42}}' },
      { type: 'finish', finishReason: 'tool_calls' },
    ]);

    const events = await collect(executeStepStream({
      adapter,
      model: 'test',
      request: { messages: [{ role: 'user', content: 'go' }] },
    }));

    const deltas = events.filter((e) => e.type === 'tool_call_delta');
    expect(deltas).toEqual([
      { type: 'tool_call_delta', index: 0, id: 'call_1', name: 'respond', argsText: '' },
      { type: 'tool_call_delta', index: 0, argsText: '{"data":' },
      { type: 'tool_call_delta', index: 0, argsText: '{"answer":42}}' },
    ]);

    const joined = deltas
      .map((d) => (d.type === 'tool_call_delta' ? d.argsText : ''))
      .join('');
    const done = lastOf(events);
    expect(done.type).toBe('done');
    if (done.type === 'done') {
      expect(done.result.toolCalls[0]?.args).toEqual(JSON.parse(joined));
    }
  });

  it('passes toolChoice and responseFormat through to the provider request', async () => {
    let seen: { toolChoice?: unknown; responseFormat?: unknown } = {};
    const adapter: ChatAdapter = {
      kind: 'chat',
      id: 'mock',
      chat: async () => ({
        content: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
        raw: null,
      }),
      chatStream: async function* (request) {
        seen = { toolChoice: request.toolChoice, responseFormat: request.responseFormat };
        yield { type: 'finish', finishReason: 'stop' };
      },
    };

    await collect(executeStepStream({
      adapter,
      model: 'test',
      request: {
        messages: [{ role: 'user', content: 'go' }],
        toolChoice: 'required',
        responseFormat: { type: 'json_object' },
      },
    }));

    expect(seen.toolChoice).toBe('required');
    expect(seen.responseFormat).toEqual({ type: 'json_object' });
  });
});

describe('stepStream — abort', () => {
  it('terminates iteration when the abort signal fires', async () => {
    const controller = new AbortController();
    const adapter: ChatAdapter = {
      kind: 'chat',
      id: 'mock',
      chat: async () => ({
        content: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
        raw: null,
      }),
      chatStream: async function* () {
        yield { type: 'text', text: 'first' };
        controller.abort();
        yield { type: 'text', text: 'second' };
      },
    };

    const events = await collect(executeStepStream({
      adapter,
      model: 'test',
      request: { messages: [{ role: 'user', content: 'go' }] },
      streamOptions: { signal: controller.signal },
    }));

    expect(events[0]).toEqual({ type: 'text', text: 'first' });
    expect(events.find((e) => e.type === 'done')).toBeUndefined();
  });
});

const streamingAdapter = (chunks: unknown[]): Promise<ChatAdapter> =>
  createOpenAICompatibleAdapter({
    apiKey: 'k',
    baseUrl: 'https://fake.api.com/v1',
    client: { chat: { completions: { create: async () => (async function* () { for (const c of chunks) yield c; })() } } },
  });

const deltasOf = async (adapter: ChatAdapter): Promise<ProviderStreamDelta[]> => {
  const out: ProviderStreamDelta[] = [];
  for await (const d of adapter.chatStream({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })) out.push(d);
  return out;
};

describe('reasoning', () => {
  it('the adapter yields a reasoning delta from choice.delta.reasoning (OpenRouter, gpt-oss)', async () => {
    const deltas = await deltasOf(await streamingAdapter([
      { choices: [{ delta: { reasoning: 'let me think' } }] },
      { choices: [{ delta: { content: 'the answer' } }] },
      { choices: [{ finish_reason: 'stop' }] },
    ]));
    expect(deltas).toContainEqual({ type: 'reasoning', text: 'let me think' });
    expect(deltas).toContainEqual({ type: 'text', text: 'the answer' });
  });

  it('the adapter yields a reasoning delta from choice.delta.reasoning_content (GLM, DeepSeek)', async () => {
    const deltas = await deltasOf(await streamingAdapter([{ choices: [{ delta: { reasoning_content: 'thinking too' } }] }]));
    expect(deltas).toContainEqual({ type: 'reasoning', text: 'thinking too' });
  });

  const captureParams = async (reasoningRequest?: Record<string, unknown>) => {
    const captured: { params?: Record<string, unknown> } = {};
    const adapter = await createOpenAICompatibleAdapter({
      apiKey: 'k',
      baseUrl: 'https://fake.api.com/v1',
      ...(reasoningRequest ? { reasoningRequest } : {}),
      client: { chat: { completions: { create: async (params: Record<string, unknown>) => { captured.params = params; return (async function* () { yield { choices: [{ finish_reason: 'stop' }] }; })(); } } } },
    });
    return { captured, adapter };
  };
  const drain = async (adapter: ChatAdapter, options?: { reasoningEffort: 'high' }): Promise<void> => {
    for await (const chunk of adapter.chatStream({ model: 'm', messages: [{ role: 'user', content: 'hi' }], ...(options ? { options } : {}) })) void chunk;
  };

  it('applies the provider reasoning-request params on a stream — only when reasoningEffort is set', async () => {
    const asked = await captureParams({ reasoning_format: 'parsed' });
    await drain(asked.adapter, { reasoningEffort: 'high' });
    expect(asked.captured.params?.['reasoning_format']).toBe('parsed');

    const plain = await captureParams({ reasoning_format: 'parsed' });
    await drain(plain.adapter);
    expect(plain.captured.params?.['reasoning_format']).toBeUndefined();
  });

  it('the registry declares the reasoning-request params per provider', () => {
    expect(chatProviderEntry('groq')?.reasoningRequest).toEqual({ reasoning_format: 'parsed' });
    expect(chatProviderEntry('openrouter')?.reasoningRequest).toEqual({ reasoning: { enabled: true } });
  });

  it('executeStepStream passes reasoning through and keeps it OUT of the content', async () => {
    const events = await collect(executeStepStream({
      adapter: createMockAdapter([
        { type: 'reasoning', text: 'let me think' },
        { type: 'text', text: 'the answer' },
        { type: 'finish', finishReason: 'stop' },
      ]),
      model: 'test',
      request: { messages: [{ role: 'user', content: 'hi' }] },
    }));
    expect(events.some((e) => e.type === 'reasoning' && e.text === 'let me think')).toBe(true);
    const done = lastOf(events);
    expect(done.type).toBe('done');
    if (done.type === 'done') expect(done.result.content).toBe('the answer');
  });
});

describe('abort while the provider is silent', () => {
  it('returns promptly, keyed on the signal — not on the error type the adapter re-wraps', async () => {
    const ac = new AbortController();
    const silent: ChatAdapter = {
      kind: 'chat',
      id: 'silent',
      chat: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, finishReason: 'stop', raw: null }),
      chatStream: async function* (_request, options) {
        await new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('provider stream error')));
        });
      },
    };

    const events: StepStreamEvent[] = [];
    const drained = (async () => {
      for await (const e of executeStepStream({
        adapter: silent,
        model: 'test',
        request: { messages: [{ role: 'user', content: 'go' }] },
        streamOptions: { signal: ac.signal },
      })) events.push(e);
    })();
    setTimeout(() => ac.abort(), 10);
    await drained;
    expect(events.find((e) => e.type === 'done')).toBeUndefined();
  });
});

describe('stepStream — the provider stream is closed as `for await` closes it', () => {
  const closingAdapter = (closed: string[]): ChatAdapter => ({
    ...createMockAdapter([]),
    chatStream: async function* () {
      try {
        yield { type: 'text', text: 'a' };
        yield { type: 'text', text: 'b' };
      } finally {
        closed.push('closed');
      }
    },
  });
  const request = { messages: [{ role: 'user' as const, content: 'hi' }] };

  it('when the reader stops early', async () => {
    const closed: string[] = [];
    const steps = executeStepStream({ adapter: closingAdapter(closed), model: 'test', request });
    await steps.next();
    await steps.return(undefined);
    expect(closed).toEqual(['closed']);
  });

  it('when an error is thrown into the stream', async () => {
    const closed: string[] = [];
    const steps = executeStepStream({ adapter: closingAdapter(closed), model: 'test', request });
    await steps.next();
    await expect(steps.throw(new Error('stop reading'))).rejects.toThrow('stop reading');
    expect(closed).toEqual(['closed']);
  });
});

describe('stepStream — two calls the provider sends at one index', () => {
  it('stay two calls, each numbered with an index no other call has', async () => {
    const fake = sdkOverFetch([{
      chunks: [
        toolCallChunk(0, { id: 'a', name: 'add', args: '{"a":1}' }),
        toolCallChunk(0, { id: 'b', name: 'mul', args: '{"b":2}' }),
        toolCallChunk(1, { id: 'c', name: 'sub', args: '{"c":' }),
        toolCallChunk(1, { args: '3}' }),
        finishChunk('tool_calls'),
      ],
    }]);
    const llm = createSignal({ baseUrl: 'http://fake.local/v1', apiKey: 'k', model: 'm', capabilities: { nativeTools: true } }, { client: fake.client });
    const events = await collect(llm.stepStream({
      messages: [{ role: 'user', content: 'go' }],
      tools: ['add', 'mul', 'sub'].map((name) => ({ name, description: name, parameters: { type: 'object' } })),
    }));
    expect(events.flatMap((e) => (e.type === 'tool_call_delta' ? [`${e.id ?? '-'}@${e.index}`] : []))).toEqual(['a@0', 'b@1', 'c@2', '-@2']);
    const done = lastOf(events);
    expect(done.type === 'done' && done.result.toolCalls).toEqual([
      { id: 'a', name: 'add', args: { a: 1 } },
      { id: 'b', name: 'mul', args: { b: 2 } },
      { id: 'c', name: 'sub', args: { c: 3 } },
    ]);
  });
});
