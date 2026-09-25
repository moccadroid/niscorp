import { describe, it, expect } from 'vitest';
import { providerRegistry, chatProviderEntry, modelRegistry, modelEntry, modelKey, resolveApiKey, UNMEASURED_MODEL } from '../src/registry';
import { REASONING_EFFORTS } from '../src/types';
import { createSignal } from '../src';

// ═══════════════════════════════════════════════════════════
// THE REGISTRY'S INVARIANTS. These are what keep two records from turning
// into a pile: rows that point at nothing, rows nobody measured, and defaults
// that name a model no row describes.
// ═══════════════════════════════════════════════════════════

// Providers whose default model has NO measured row, and why. An entry here is
// debt with a reason, not a way out: measure the model with
// scripts/probe-model.ts, paste the row, delete the entry.
const UNMEASURED_DEFAULTS: Record<string, string> = {
  anthropic: 'no ANTHROPIC_API_KEY on 2026-09-24, and the probe speaks openai-compatible only',
  google: 'no GOOGLE_API_KEY on 2026-09-24, and the probe speaks openai-compatible only',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('modelRegistry — invariants', () => {
  it('every row is keyed by a chat provider that exists', () => {
    for (const key of Object.keys(modelRegistry)) {
      const provider = Object.keys(providerRegistry).find((id) => key.startsWith(`${id}/`));
      expect(provider, key).toBeDefined();
      expect(chatProviderEntry(provider ?? ''), key).toBeDefined();
    }
  });

  it('every row carries the day it was measured', () => {
    for (const [key, row] of Object.entries(modelRegistry)) expect(row.verified, key).toMatch(ISO_DATE);
  });

  it('every effort a row lists is one signal can send', () => {
    for (const [key, row] of Object.entries(modelRegistry)) {
      for (const effort of row.reasoningEfforts) expect(REASONING_EFFORTS, key).toContain(effort);
    }
  });

  it("every chat provider's default model has a row — or is declared debt, with a reason", () => {
    for (const [id, entry] of Object.entries(providerRegistry)) {
      if (entry.adapter === 'systemone') continue;
      if (id in UNMEASURED_DEFAULTS) {
        expect(modelEntry(id, entry.defaultModel), `${id} is listed as unmeasured but has a row — delete the debt entry`).toBeUndefined();
        continue;
      }
      expect(modelEntry(id, entry.defaultModel), `${id}'s default ${entry.defaultModel}`).toBeDefined();
    }
  });

  it('the unmeasured floor keeps output off the tool channel', () => {
    expect(UNMEASURED_MODEL.manglesNestedToolArgs).toBe(true);
    expect(UNMEASURED_MODEL.nativeJsonSchema).toBe(false);
    expect(UNMEASURED_MODEL.toolsWithStructuredOutput).toBe(false);
  });
});

describe('providerRegistry', () => {
  it('groq is openai-compatible, validates tool args, and defaults to qwen3.8-27b', () => {
    const groq = chatProviderEntry('groq');
    expect(groq?.baseUrl).toContain('groq.com');
    expect(groq?.adapter).toBe('openai-compatible');
    expect(groq?.endpoint.validatesToolArgs).toBe(true);
    expect(groq?.defaultModel).toBe('qwen/qwen3.8-27b');
  });

  it('anthropic and google keep their own adapters', () => {
    expect(providerRegistry['anthropic']?.adapter).toBe('anthropic');
    expect(providerRegistry['google']?.adapter).toBe('google');
  });
});

describe('resolution — endpoint row JOINED with model row', () => {
  it('a measured model resolves to its own row, and says it is known', () => {
    const description = createSignal('groq', { apiKey: 'test', model: 'qwen/qwen3.8-27b' }).describe();
    const row = modelRegistry[modelKey('groq', 'qwen/qwen3.8-27b')];
    expect(description.modelKnown).toBe(true);
    expect(description.capabilities).toEqual({ ...chatProviderEntry('groq')?.endpoint, ...row?.capabilities });
  });

  it('a model with no row gets the unmeasured floor, and says so', () => {
    const description = createSignal('groq', { apiKey: 'test', model: 'somebody/new-model' }).describe();
    expect(description.modelKnown).toBe(false);
    expect(description.capabilities).toEqual({ ...chatProviderEntry('groq')?.endpoint, ...UNMEASURED_MODEL });
  });

  it('.model() re-resolves: the same client on two models has two answers', () => {
    const qwen = createSignal('groq', { apiKey: 'test' });
    const oss = qwen.model('openai/gpt-oss-120b');
    expect(qwen.describe().model).toBe('qwen/qwen3.8-27b');
    expect(oss.describe().capabilities.multimodal).toBe(modelRegistry[modelKey('groq', 'openai/gpt-oss-120b')]?.capabilities.multimodal);
    expect(qwen.describe().capabilities.multimodal).toBe(modelRegistry[modelKey('groq', 'qwen/qwen3.8-27b')]?.capabilities.multimodal);
  });
});

describe('reasoning effort — checked against the model row when the client is built', () => {
  it('an effort the row lists is accepted', () => {
    expect(() => createSignal('groq', { apiKey: 'test', options: { reasoningEffort: 'default' } })).not.toThrow();
  });

  it('an effort the row does not list is refused at construction, naming what IS accepted', () => {
    expect(() => createSignal('groq', { apiKey: 'test', model: 'openai/gpt-oss-120b', options: { reasoningEffort: 'default' } })).toThrow(/not accepted.*accepts: low, medium, high/);
  });

  it('switching model re-checks the effort already set', () => {
    const qwen = createSignal('groq', { apiKey: 'test', options: { reasoningEffort: 'default' } });
    expect(() => qwen.model('openai/gpt-oss-120b')).toThrow(/reasoningEffort "default"/);
  });

  it('an unmeasured model is not checked — the provider will say', () => {
    expect(() => createSignal('groq', { apiKey: 'test', model: 'somebody/new-model', options: { reasoningEffort: 'max' } })).not.toThrow();
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
