import { describe, it, expect } from 'vitest';
import { toLlmMessages } from '../../src/context/messages';
import type { ResolvedContext } from '../../src/context/types';

describe('toLlmMessages', () => {
  it('converts system chunks to system messages', () => {
    const resolved: ResolvedContext = {
      chunks: [
        { role: 'system', content: 'You are helpful.', source: 'test', tokens: 5, evicted: false },
      ],
      totalTokens: 5,
      budget: 1000,
    };
    const messages = toLlmMessages(resolved);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
  });

  it('converts user chunks to user messages', () => {
    const resolved: ResolvedContext = {
      chunks: [
        { role: 'user', content: 'Hello', source: 'test', tokens: 2, evicted: false },
      ],
      totalTokens: 2,
      budget: 1000,
    };
    const messages = toLlmMessages(resolved);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('preserves order across roles', () => {
    const resolved: ResolvedContext = {
      chunks: [
        { role: 'system', content: 'Sys', source: 'test', tokens: 1, evicted: false },
        { role: 'user', content: 'Usr', source: 'test', tokens: 1, evicted: false },
        { role: 'assistant', content: 'Asst', source: 'test', tokens: 1, evicted: false },
      ],
      totalTokens: 3,
      budget: 1000,
    };
    const messages = toLlmMessages(resolved);
    expect(messages).toHaveLength(3);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    expect(messages[2]?.role).toBe('assistant');
  });

  it('skips evicted chunks', () => {
    const resolved: ResolvedContext = {
      chunks: [
        { role: 'system', content: 'Keep', source: 'test', tokens: 1, evicted: false },
        { role: 'system', content: 'Drop', source: 'test', tokens: 1, evicted: true, reason: 'budget' },
      ],
      totalTokens: 1,
      budget: 1000,
    };
    const messages = toLlmMessages(resolved);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Keep');
  });
});
