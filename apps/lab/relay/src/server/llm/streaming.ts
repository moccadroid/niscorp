import type { SignalClient } from '@niscorp/cortex';
import type { StepRequest, StepStreamEvent, StreamOptions } from '@niscorp/signal';

// A reasoning model sends nothing while it thinks, OpenRouter closes a stream
// that stays quiet too long, and cortex treats that throw as terminal. Cortex
// picks stream or step per agent, which does not know its model, so the client
// answers a streamed call with one `step`: its `done` carries the whole StepResult.
export const streamViaStep = (llm: SignalClient): SignalClient => ({
  ...llm,
  stepStream: (request: StepRequest, options?: StreamOptions): AsyncIterable<StepStreamEvent> => ({
    async *[Symbol.asyncIterator](): AsyncIterator<StepStreamEvent> {
      // `step` takes the abort signal in the request's own options.
      const signal = options?.signal;
      const stepped =
        signal === undefined ? request : { ...request, options: { ...request.options, signal } };
      yield { type: 'done', result: await llm.step(stepped) };
    },
  }),
});
