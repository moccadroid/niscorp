import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSignal, SignalError } from '../src';

describe('createSignal', () => {
  it('creates a signal from a known provider string', () => {
    const signal = createSignal('groq');
    expect(signal).toBeDefined();
    expect(typeof signal.complete).toBe('function');
    expect(typeof signal.stream).toBe('function');
    expect(typeof signal.model).toBe('function');
  });

  it('creates a signal with custom provider config', () => {
    const signal = createSignal({
      baseUrl: 'https://custom.api.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
    });
    expect(signal).toBeDefined();
    expect(typeof signal.complete).toBe('function');
  });

  it('creates a signal with options', () => {
    const signal = createSignal('groq', {
      apiKey: 'test-key',
      model: 'openai/gpt-oss-120b',
      systemPrompt: 'You are helpful.',
      retries: 3,
    });
    expect(signal).toBeDefined();
  });
});

describe('builder immutability', () => {
  it('model() returns a new instance', () => {
    const base = createSignal('groq', { apiKey: 'test' });
    const withModel = base.model('m1');
    expect(withModel).not.toBe(base);
    expect(typeof withModel.complete).toBe('function');
  });

  it('systemPrompt() returns a new instance', () => {
    const base = createSignal('groq', { apiKey: 'test' });
    const withPrompt = base.systemPrompt('Be helpful');
    expect(withPrompt).not.toBe(base);
  });

  it('schema() returns a new instance', () => {
    const base = createSignal('groq', { apiKey: 'test' });
    const withSchema = base.schema(z.object({ name: z.string() }));
    expect(withSchema).not.toBe(base);
    expect(typeof withSchema.complete).toBe('function');
  });

  it('tools() returns a new instance', () => {
    const base = createSignal('groq', { apiKey: 'test' });
    const withTools = base.tools([]);
    expect(withTools).not.toBe(base);
  });

  it('chaining creates new instances at each step', () => {
    const a = createSignal('groq', { apiKey: 'test' });
    const b = a.model('m1');
    const c = b.systemPrompt('hello');
    const d = c.retries(5);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(c).not.toBe(d);
  });

  it('all builder methods return objects with complete/stream', () => {
    const base = createSignal('groq', { apiKey: 'test' });
    const forks = [
      base.model('m'),
      base.systemPrompt('p'),
      base.history([]),
      base.schema(z.object({ x: z.string() })),
      base.tools([]),
      base.retries(1),
      base.options({ temperature: 0 }),
      base.capabilities({ nativeTools: true }),
      base.onRetry(() => {}),
      base.onToolCall(() => {}),
    ];
    for (const fork of forks) {
      expect(typeof fork.complete).toBe('function');
      expect(typeof fork.stream).toBe('function');
    }
  });
});

describe('complete() error cases', () => {
  it('throws on unknown provider', async () => {
    const signal = createSignal('nonexistent');
    await expect(signal.complete('hello')).rejects.toThrow(SignalError);
  });

  it('throws on missing API key', async () => {
    const original = process.env['GROQ_API_KEY'];
    delete process.env['GROQ_API_KEY'];
    try {
      const signal = createSignal('groq');
      await expect(signal.complete('hello')).rejects.toThrow(/Missing API key/);
    } finally {
      if (original) process.env['GROQ_API_KEY'] = original;
    }
  });

  it('throws on missing model for custom provider', async () => {
    const signal = createSignal({ baseUrl: 'https://x.com/v1', apiKey: 'k' });
    await expect(signal.complete('hello')).rejects.toThrow(/Missing model/);
  });
});

describe('stepStream carries the client options to the wire', () => {
  // A client whose streaming create captures the params it was handed, so we can
  // assert what actually reached the wire on the streaming path.
  const capture = () => {
    const captured: { params?: Record<string, unknown> } = {};
    const client = {
      chat: {
        completions: {
          create: async (params: Record<string, unknown>) => {
            captured.params = params;
            return (async function* () {
              yield { choices: [{ finish_reason: 'stop' }] };
            })();
          },
        },
      },
    };
    return { captured, client };
  };
  const drain = async (stream: AsyncIterable<unknown>): Promise<void> => {
    for await (const event of stream) void event;
  };

  it('a reasoningEffort set via .options() reaches the streamed body', async () => {
    const { captured, client } = capture();
    const signal = createSignal(
      { baseUrl: 'https://fake.api.com/v1', apiKey: 'k', model: 'm', adapter: 'openai-compatible' },
      { client },
    ).options({ reasoningEffort: 'high' });
    await drain(signal.stepStream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(captured.params?.['reasoning_effort']).toBe('high');
  });

  it('a general option (temperature) set via .options() reaches the streamed body too', async () => {
    const { captured, client } = capture();
    const signal = createSignal(
      { baseUrl: 'https://fake.api.com/v1', apiKey: 'k', model: 'm', adapter: 'openai-compatible' },
      { client },
    ).options({ temperature: 0.5 });
    await drain(signal.stepStream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(captured.params?.['temperature']).toBe(0.5);
  });

  it('end-to-end: a streamed Groq call with reasoningEffort now asks for the effort AND opts into the trace', async () => {
    // The bd583fd opt-in keys reasoning_format on request.options.reasoningEffort;
    // before the stepStream merge, config.options never reached the adapter on a
    // stream, so this fired on no assistant turn. Now both land.
    const { captured, client } = capture();
    const signal = createSignal('groq', { apiKey: 'k', client }).options({ reasoningEffort: 'high' });
    await drain(signal.stepStream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(captured.params?.['reasoning_effort']).toBe('high');
    expect(captured.params?.['reasoning_format']).toBe('parsed');
  });
});
