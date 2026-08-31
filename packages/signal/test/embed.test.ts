import { describe, it, expect } from 'vitest';
import { createSignal, SignalError } from '../src';

describe('embed()', () => {
  it('throws when provider does not support embedding', async () => {
    const signal = createSignal({
      baseUrl: 'https://fake.api.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      adapter: 'openai-compatible',
    });

    await expect(signal.embed('hello')).rejects.toThrow();
  });

  it('is exposed on the signal object', () => {
    const signal = createSignal('openai', { apiKey: 'test-key' });
    expect(typeof signal.embed).toBe('function');
  });

  it('builder forks preserve embed', () => {
    const a = createSignal('openai', { apiKey: 'test-key' });
    const b = a.model('text-embedding-3-small');
    expect(typeof b.embed).toBe('function');
    expect(b).not.toBe(a);
  });
});

describe('embed() onUsage', () => {
  // A signal whose openai-compatible adapter is fed a canned provider response
  // through the injected client — so the real adapter parses the usage and the
  // real embed() wiring hands it to onUsage. `create` optionally throws.
  const signalWith = (body: { data?: unknown; usage?: unknown } | (() => never)) =>
    createSignal(
      { baseUrl: 'https://fake.api.com/v1', apiKey: 'test-key', model: 'text-embedding-3-small', adapter: 'openai-compatible' },
      {
        client: {
          // The adapter validates the whole injected client at construction, chat
          // included, so a chat stub rides along though these tests only embed.
          chat: { completions: { create: async () => ({}) } },
          embeddings: { create: async () => (typeof body === 'function' ? body() : body) },
        },
      },
    );

  it('hands the adapter’s usage and the resolved model back on the string path', async () => {
    const seen: Array<{ usage: unknown; model: string }> = [];
    const signal = signalWith({ data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 7, total_tokens: 7 } });
    const vector = await signal.embed('hello', { onUsage: (usage, model) => seen.push({ usage, model }) });
    expect(vector).toEqual([0.1, 0.2]);
    expect(seen).toEqual([{ usage: { inputTokens: 7, totalTokens: 7 }, model: 'text-embedding-3-small' }]);
  });

  it('hands usage back once on the array path too', async () => {
    const seen: Array<{ usage: unknown; model: string }> = [];
    const signal = signalWith({
      data: [{ index: 0, embedding: [0.1] }, { index: 1, embedding: [0.2] }],
      usage: { prompt_tokens: 12, total_tokens: 12 },
    });
    const vectors = await signal.embed(['a', 'b'], { onUsage: (usage, model) => seen.push({ usage, model }) });
    expect(vectors).toEqual([[0.1], [0.2]]);
    expect(seen).toEqual([{ usage: { inputTokens: 12, totalTokens: 12 }, model: 'text-embedding-3-small' }]);
  });

  it('reports zeros when the provider omits the usage block, rather than skipping the call', async () => {
    const seen: Array<{ inputTokens: number; totalTokens: number }> = [];
    const signal = signalWith({ data: [{ index: 0, embedding: [0.1] }] });
    await signal.embed('hello', { onUsage: (usage) => seen.push(usage) });
    expect(seen).toEqual([{ inputTokens: 0, totalTokens: 0 }]);
  });

  it('is not invoked when the adapter throws', async () => {
    let called = false;
    const signal = signalWith(() => { throw new Error('provider down'); });
    await expect(signal.embed('hello', { onUsage: () => { called = true; } })).rejects.toThrow();
    expect(called).toBe(false);
  });
});

describe('supportsEmbedding capability', () => {
  it('openai has supportsEmbedding: true', async () => {
    const { providerRegistry } = await import('../src/registry');
    expect(providerRegistry['openai']!.capabilities.supportsEmbedding).toBe(true);
  });

  it('groq has supportsEmbedding: false', async () => {
    const { providerRegistry } = await import('../src/registry');
    expect(providerRegistry['groq']!.capabilities.supportsEmbedding).toBe(false);
  });

  it('openrouter has supportsEmbedding: false', async () => {
    const { providerRegistry } = await import('../src/registry');
    expect(providerRegistry['openrouter']!.capabilities.supportsEmbedding).toBe(false);
  });

  it('anthropic has supportsEmbedding: false', async () => {
    const { providerRegistry } = await import('../src/registry');
    expect(providerRegistry['anthropic']!.capabilities.supportsEmbedding).toBe(false);
  });
});
