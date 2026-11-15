import { describe, it, expect } from 'vitest';
import { defineAgent, type CortexEvent } from '../src';
import { stubSignal } from './helpers/stub-signal';

describe('run.events', () => {
  it('delivers every event to two readers iterating at once, and ends both', async () => {
    const stub = stubSignal([{ text: ['{"response":"hi"}'] }]);
    const llm = {
      ...stub,
      stepStream: (...args: Parameters<typeof stub.stepStream>) => ({
        [Symbol.asyncIterator]: async function* () {
          await new Promise((resolve) => setTimeout(resolve, 10));
          yield* stub.stepStream(...args);
        },
      }),
    };
    const agent = defineAgent({ id: 'chat', description: 'Chats.', instructions: 'Answer.' });
    const run = agent.run('hi', { llm });

    const read = async (): Promise<string[]> => {
      const types: string[] = [];
      for await (const event of run.events) types.push((event satisfies CortexEvent).type);
      return types;
    };
    const timeout = new Promise<'timed out'>((resolve) => setTimeout(() => resolve('timed out'), 1000));
    const outcome = await Promise.race([Promise.all([read(), read()]), timeout]);

    expect(outcome).not.toBe('timed out');
    if (outcome !== 'timed out') {
      expect(outcome[0].at(-1)).toBe('run-end');
      expect(outcome[1]).toEqual(outcome[0]);
    }
  });
});
