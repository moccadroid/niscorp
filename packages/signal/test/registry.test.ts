import { describe, it, expect } from 'vitest';
import { providerRegistry, resolveApiKey } from '../src/registry';

describe('providerRegistry', () => {
  it('has groq entry', () => {
    expect(providerRegistry['groq']).toBeDefined();
    expect(providerRegistry['groq']!.baseUrl).toContain('groq.com');
    expect(providerRegistry['groq']!.adapter).toBe('openai-compatible');
  });

  it('has openai entry', () => {
    expect(providerRegistry['openai']).toBeDefined();
    expect(providerRegistry['openai']!.capabilities.nativeTools).toBe(true);
  });

  it('has anthropic entry with anthropic adapter', () => {
    expect(providerRegistry['anthropic']).toBeDefined();
    expect(providerRegistry['anthropic']!.adapter).toBe('anthropic');
  });

  it('has google entry with google adapter', () => {
    expect(providerRegistry['google']).toBeDefined();
    expect(providerRegistry['google']!.adapter).toBe('google');
  });

  it('groq defaults to no native tools', () => {
    expect(providerRegistry['groq']!.capabilities.nativeTools).toBe(false);
  });
});

describe('resolveApiKey', () => {
  it('returns explicit key over env', () => {
    process.env['TEST_KEY'] = 'from-env';
    expect(resolveApiKey('TEST_KEY', 'explicit')).toBe('explicit');
    delete process.env['TEST_KEY'];
  });

  it('falls back to env variable', () => {
    process.env['TEST_KEY'] = 'from-env';
    expect(resolveApiKey('TEST_KEY')).toBe('from-env');
    delete process.env['TEST_KEY'];
  });

  it('returns undefined when neither exists', () => {
    delete process.env['NONEXISTENT_KEY'];
    expect(resolveApiKey('NONEXISTENT_KEY')).toBeUndefined();
  });
});
