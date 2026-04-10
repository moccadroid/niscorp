import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createManifold } from '../../src/manifold/manifold';
import { defineAgent } from '../../src/agent/define-agent';
import { createStubSignal } from '../_helpers/stub-signal';
import type { BusEvent } from '../../src/types';

describe('output retry with validation feedback', () => {
  it('retries on bad JSON, succeeds on the second attempt, surfaces a retry event', async () => {
    const llm = createStubSignal([
      // attempt 1: not valid JSON
      { content: 'sorry, I forgot the JSON. The answer is 42.' },
      // attempt 2: valid JSON
      { content: '{"answer": 42}' },
    ]);
    const m = createManifold({ llm });
    const retries: BusEvent[] = [];
    m.bus.on('cortex.agent.retry', (e) => {
      retries.push(e);
    });
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'a',
        instructions: 'return JSON',
        outputMode: 'structured',
        outputSchema: z.object({ answer: z.number() }),
        maxOutputRetries: 2,
      }),
    );
    const result = await m.execute<{ answer: number }>('a', 'what is the answer?');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ answer: 42 });
    expect(retries).toHaveLength(1);
    expect(llm.calls).toHaveLength(2);
  });

  it('retries on schema mismatch, succeeds on the third attempt', async () => {
    const llm = createStubSignal([
      // attempt 1: wrong field name
      { content: '{"result": 42}' },
      // attempt 2: still wrong
      { content: '{"value": 42}' },
      // attempt 3: correct
      { content: '{"answer": 42}' },
    ]);
    const m = createManifold({ llm });
    let retryCount = 0;
    m.bus.on('cortex.agent.retry', () => {
      retryCount += 1;
    });
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'a',
        instructions: 'return JSON with key "answer"',
        outputMode: 'structured',
        outputSchema: z.object({ answer: z.number() }),
        maxOutputRetries: 2,
      }),
    );
    const result = await m.execute<{ answer: number }>('a', 'what is the answer?');
    expect(result.ok).toBe(true);
    expect(retryCount).toBe(2);
    expect(llm.calls).toHaveLength(3);
  });

  it('gives up with output_validation_failed after exhausting retries', async () => {
    const llm = createStubSignal();
    for (let i = 0; i < 5; i += 1) {
      llm.enqueue({ content: '{"wrong": "shape"}' });
    }
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'a',
        instructions: '',
        outputMode: 'structured',
        outputSchema: z.object({ answer: z.number() }),
        maxOutputRetries: 1, // 1 initial + 1 retry = 2 total
      }),
    );
    const result = await m.execute('a', 'go');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('output_validation_failed');
    expect(llm.calls).toHaveLength(2);
  });

  it('does NOT retry on non-validation errors', async () => {
    // model_call_failed (e.g. network) should propagate immediately.
    const llm = createStubSignal();
    llm.step = async () => {
      throw new Error('boom: provider down');
    };
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'a',
        instructions: '',
        outputMode: 'text',
        maxOutputRetries: 5,
      }),
    );
    const result = await m.execute('a', 'go');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('model_call_failed');
  });

  it('retry feedback producer surfaces prior attempts in the next context build', async () => {
    // Capture the messages sent to step() on the second attempt to
    // confirm the retry-feedback producer injected the prior content.
    const llm = createStubSignal([
      { content: 'not json' },
      { content: '{"ok": true}' },
    ]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'a',
        instructions: 'return JSON',
        outputMode: 'structured',
        outputSchema: z.object({ ok: z.boolean() }),
        maxOutputRetries: 1,
      }),
    );
    await m.execute('a', 'go');
    expect(llm.calls.length).toBe(2);
    const secondAttempt = llm.calls[1];
    expect(secondAttempt).toBeDefined();
    if (!secondAttempt) return;
    const systemMessages = secondAttempt.messages.filter((m) => m.role === 'system');
    const concatenated = systemMessages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    // The retry-feedback producer's chunk should be present, and it
    // should contain the prior content + the validation message.
    expect(concatenated).toContain('Your previous attempts failed validation');
    expect(concatenated).toContain('Attempt 1');
    expect(concatenated).toContain('not json');
  });
});
