import { describe, it, expect } from 'vitest';
import type { ProviderAdapter, ProviderStreamDelta, StepStreamEvent } from '../src/types';
import { executeStepStream } from '../src/stream/execute-step-stream';

// ═══════════════════════════════════════════════════════════
// Mock adapter — returns canned stream deltas
// ═══════════════════════════════════════════════════════════

const createMockAdapter = (deltas: ProviderStreamDelta[]): ProviderAdapter => ({
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

// ═══════════════════════════════════════════════════════════
// Simple text streaming
// ═══════════════════════════════════════════════════════════

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

    const done = events[events.length - 1];
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
    expect(events[events.length - 1].type).toBe('done');
  });
});

// ═══════════════════════════════════════════════════════════
// Tool calls — assembled and delivered in `done.result.toolCalls`
// ═══════════════════════════════════════════════════════════

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

    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    if (done.type === 'done') {
      expect(done.result.toolCalls).toEqual([
        { id: 'call_1', name: 'search', args: { q: 'cats' } },
      ]);
      expect(done.result.finishReason).toBe('tool_calls');
    }
  });

  it('does not auto-execute tools — caller owns the loop', async () => {
    // Same scenario as above; verify the stream terminates after one
    // adapter pass with finish:tool_calls — no follow-up chatStream call.
    let chatStreamCalls = 0;
    const adapter: ProviderAdapter = {
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
    const done = events[events.length - 1];
    if (done.type === 'done') {
      expect(done.result.toolCalls[0]!.args).toBe('not-json');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Abort — stream terminates without a done event
// ═══════════════════════════════════════════════════════════

describe('stepStream — abort', () => {
  it('terminates iteration when the abort signal fires', async () => {
    const controller = new AbortController();
    const adapter: ProviderAdapter = {
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
    // No done event after abort.
    expect(events.find((e) => e.type === 'done')).toBeUndefined();
  });
});
