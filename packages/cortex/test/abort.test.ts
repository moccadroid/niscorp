import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { StepRequest, StepResult, StreamOptions } from '@niscorp/signal';
import { defineAgent } from '../src';
import { stubSignal } from './helpers/stub-signal';

describe("transport: 'step' — an abort during the model call", () => {
  it('ends the run as aborted and hands the signal to the call', async () => {
    const stub = stubSignal([{ toolCalls: [{ id: 'r1', name: 'respond', args: { data: { answer: 1 } } }] }]);
    const seen: Array<{ request: StepRequest; options: StreamOptions | undefined }> = [];
    const llm = {
      ...stub,
      step: async (request: StepRequest, options?: StreamOptions): Promise<StepResult> => {
        seen.push({ request, options });
        await new Promise((resolve) => setTimeout(resolve, 20));
        return stub.step(request);
      },
    };
    const agent = defineAgent({
      id: 'stepper',
      description: 'Answers in one step.',
      instructions: 'Answer.',
      transport: 'step',
      output: { schema: z.object({ answer: z.number() }) },
    });

    const run = agent.run('go', { llm });
    setTimeout(() => run.abort(), 5);
    const result = await run.result;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('aborted');
    expect(seen[0]?.options?.signal?.aborted).toBe(true);
  });
});
