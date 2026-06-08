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
