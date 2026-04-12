import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { ProviderAdapter, ProviderStreamDelta, StreamEvent } from '../src/types';
import { executeStream } from '../src/stream/execute-stream';

// ═══════════════════════════════════════════════════════════
// Mock adapter — returns canned stream deltas
// ═══════════════════════════════════════════════════════════

const createMockAdapter = (
  deltas: ProviderStreamDelta[][],
): ProviderAdapter => {
  let callIndex = 0;
  return {
    id: 'mock',
    chat: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, finishReason: 'stop', raw: null }),
    chatStream: async function* () {
      const batch = deltas[callIndex] ?? [];
      callIndex++;
      for (const d of batch) yield d;
    },
  };
};

const collect = async <T>(iter: AsyncIterable<StreamEvent<T>>): Promise<StreamEvent<T>[]> => {
  const events: StreamEvent<T>[] = [];
  for await (const ev of iter) events.push(ev);
  return events;
};

const CAPS = { nativeTools: false, nativeJsonSchema: false, nativeJsonMode: false, multimodal: false };

// ═══════════════════════════════════════════════════════════
// Simple text streaming (no schema, no tools)
// ═══════════════════════════════════════════════════════════

describe('stream — simple text', () => {
  it('yields text deltas and a done event', async () => {
    const adapter = createMockAdapter([[
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
      { type: 'usage', inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      { type: 'finish', finishReason: 'stop' },
    ]]);

    const events = await collect(executeStream({
      adapter, model: 'test', messages: [{ role: 'user', content: 'hi' }],
      capabilities: CAPS, retries: 0,
    }));

    expect(events[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(events[1]).toEqual({ type: 'text', text: ' world' });

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect(done!.type === 'done' && done!.response).toBe('Hello world');
    expect(done!.type === 'done' && done!.meta.usage.totalTokens).toBe(15);
  });

  it('includes history in done event', async () => {
    const adapter = createMockAdapter([[
      { type: 'text', text: 'reply' },
      { type: 'finish', finishReason: 'stop' },
    ]]);

    const events = await collect(executeStream({
      adapter, model: 'test',
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
      capabilities: CAPS, retries: 0,
    }));

    const done = events.find((e) => e.type === 'done');
    expect(done!.type === 'done' && done!.history).toHaveLength(3);
    expect(done!.type === 'done' && done!.history[2]).toEqual({ role: 'assistant', content: 'reply' });
  });
});

// ═══════════════════════════════════════════════════════════
// Schema validation + auto-retry
// ═══════════════════════════════════════════════════════════

describe('stream — schema validation', () => {
  const TestSchema = z.object({ name: z.string(), count: z.number() });

  it('yields done with parsed response when valid', async () => {
    const json = '{"name":"ok","count":42}';
    const adapter = createMockAdapter([[
      { type: 'text', text: json },
      { type: 'finish', finishReason: 'stop' },
    ]]);

    const events = await collect(executeStream<z.infer<typeof TestSchema>>({
      adapter, model: 'test',
      messages: [{ role: 'user', content: 'go' }],
      schema: TestSchema, capabilities: CAPS, retries: 0,
    }));

    const done = events.find((e) => e.type === 'done');
    expect(done!.type === 'done' && done!.response).toEqual({ name: 'ok', count: 42 });
  });

  it('emits retry event and re-streams on validation failure', async () => {
    const badJson = '{"name":"ok","count":"bad"}';
    const goodJson = '{"name":"ok","count":42}';
    const adapter = createMockAdapter([
      [{ type: 'text', text: badJson }, { type: 'finish', finishReason: 'stop' }],
      [{ type: 'text', text: goodJson }, { type: 'finish', finishReason: 'stop' }],
    ]);

    const events = await collect(executeStream<z.infer<typeof TestSchema>>({
      adapter, model: 'test',
      messages: [{ role: 'user', content: 'go' }],
      schema: TestSchema, capabilities: CAPS, retries: 2,
    }));

    expect(events.some((e) => e.type === 'retry')).toBe(true);
    const retry = events.find((e) => e.type === 'retry');
    expect(retry!.type === 'retry' && retry!.attempt).toBe(1);

    const done = events.find((e) => e.type === 'done');
    expect(done!.type === 'done' && done!.response).toEqual({ name: 'ok', count: 42 });
  });

  it('emits error when retries exhausted', async () => {
    const badJson = '{"name":"ok","count":"bad"}';
    const adapter = createMockAdapter([
      [{ type: 'text', text: badJson }, { type: 'finish', finishReason: 'stop' }],
    ]);

    const events = await collect(executeStream<z.infer<typeof TestSchema>>({
      adapter, model: 'test',
      messages: [{ role: 'user', content: 'go' }],
      schema: TestSchema, capabilities: CAPS, retries: 0,
    }));

    const error = events.find((e) => e.type === 'error');
    expect(error).toBeDefined();
    expect(error!.type === 'error' && error!.recovered).toBe(false);
  });

  it('calls onRetry callback', async () => {
    const badJson = '{"name":"ok","count":"bad"}';
    const goodJson = '{"name":"ok","count":42}';
    const onRetry = vi.fn();
    const adapter = createMockAdapter([
      [{ type: 'text', text: badJson }, { type: 'finish', finishReason: 'stop' }],
      [{ type: 'text', text: goodJson }, { type: 'finish', finishReason: 'stop' }],
    ]);

    await collect(executeStream<z.infer<typeof TestSchema>>({
      adapter, model: 'test',
      messages: [{ role: 'user', content: 'go' }],
      schema: TestSchema, capabilities: CAPS, retries: 2,
      onRetry,
    }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });
});

// ═══════════════════════════════════════════════════════════
// Tool streaming
// ═══════════════════════════════════════════════════════════

describe('stream — tool calls', () => {
  const searchTool = {
    name: 'search',
    description: 'search the web',
    inputSchema: z.object({ query: z.string() }),
    execute: async (input: { query: string }) => ({ results: [`result for ${input.query}`] }),
  };

  it('assembles tool call deltas, executes, and re-streams', async () => {
    const adapter = createMockAdapter([
      // First stream: tool call
      [
        { type: 'tool_call', index: 0, id: 'call_1', name: 'search' },
        { type: 'tool_call', index: 0, argsFragment: '{"que' },
        { type: 'tool_call', index: 0, argsFragment: 'ry":"test"}' },
        { type: 'finish', finishReason: 'tool_calls' },
      ],
      // Second stream: final response after tool result
      [
        { type: 'text', text: 'Found it!' },
        { type: 'finish', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(executeStream({
      adapter, model: 'test',
      messages: [{ role: 'user', content: 'search' }],
      tools: [searchTool],
      capabilities: { ...CAPS, nativeTools: true },
      retries: 0,
    }));

    expect(events.some((e) => e.type === 'tool_start' && e.name === 'search')).toBe(true);
    expect(events.some((e) => e.type === 'tool_end' && e.name === 'search')).toBe(true);
    expect(events.some((e) => e.type === 'text' && e.text === 'Found it!')).toBe(true);

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect(done!.type === 'done' && done!.response).toBe('Found it!');
    expect(done!.type === 'done' && done!.meta.toolCalls).toHaveLength(1);
    expect(done!.type === 'done' && done!.meta.toolCalls[0]?.name).toBe('search');
  });

  it('calls onToolCall callback', async () => {
    const onToolCall = vi.fn();
    const adapter = createMockAdapter([
      [
        { type: 'tool_call', index: 0, id: 'call_1', name: 'search' },
        { type: 'tool_call', index: 0, argsFragment: '{"query":"x"}' },
        { type: 'finish', finishReason: 'tool_calls' },
      ],
      [{ type: 'text', text: 'done' }, { type: 'finish', finishReason: 'stop' }],
    ]);

    await collect(executeStream({
      adapter, model: 'test',
      messages: [{ role: 'user', content: 'go' }],
      tools: [searchTool],
      capabilities: { ...CAPS, nativeTools: true },
      retries: 0,
      onToolCall,
    }));

    expect(onToolCall).toHaveBeenCalledWith('search', { query: 'x' });
  });
});

// ═══════════════════════════════════════════════════════════
// Abort signal
// ═══════════════════════════════════════════════════════════

describe('stream — abort', () => {
  it('stops streaming when abort signal fires', async () => {
    const controller = new AbortController();

    const adapter = createMockAdapter([[
      { type: 'text', text: 'start' },
      { type: 'text', text: ' more' },
      { type: 'text', text: ' end' },
      { type: 'finish', finishReason: 'stop' },
    ]]);

    // Abort after first delta
    let count = 0;
    const events: StreamEvent<string>[] = [];
    for await (const ev of executeStream<string>({
      adapter, model: 'test',
      messages: [{ role: 'user', content: 'go' }],
      capabilities: CAPS, retries: 0,
      streamOptions: { signal: controller.signal },
    })) {
      events.push(ev);
      count++;
      if (count === 1) controller.abort();
    }

    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Usage accumulation
// ═══════════════════════════════════════════════════════════

describe('stream — usage', () => {
  it('accumulates usage across tool calls', async () => {
    const tool = {
      name: 'noop',
      description: 'noop',
      inputSchema: z.object({}),
      execute: async () => 'ok',
    };

    const adapter = createMockAdapter([
      [
        { type: 'tool_call', index: 0, id: 'c1', name: 'noop' },
        { type: 'tool_call', index: 0, argsFragment: '{}' },
        { type: 'usage', inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        { type: 'finish', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text', text: 'done' },
        { type: 'usage', inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        { type: 'finish', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(executeStream({
      adapter, model: 'test',
      messages: [{ role: 'user', content: 'go' }],
      tools: [tool],
      capabilities: { ...CAPS, nativeTools: true },
      retries: 0,
    }));

    const done = events.find((e) => e.type === 'done');
    expect(done!.type === 'done' && done!.meta.usage.totalTokens).toBe(45);
  });
});
