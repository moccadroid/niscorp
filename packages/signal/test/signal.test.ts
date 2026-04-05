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
