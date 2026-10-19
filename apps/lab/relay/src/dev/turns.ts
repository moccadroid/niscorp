import type { SignalClient } from '@niscorp/cortex';

export type TurnSink = (turn: Record<string, unknown>) => void;

// Where the dev engine's own model turns (vex's query writer and shape mapper) are recorded; a script sets it.
export const engineTurns: { sink: TurnSink } = { sink: () => {} };

// Every model turn as the provider answered it: how long it took, how it ended, and its tokens (reported: false
// when the provider sent no count and signal estimated it).
export const turnsOf = (inner: SignalClient, put: TurnSink): SignalClient => ({
  ...inner,
  step: async (request) => {
    const t0 = Date.now();
    try {
      const result = await inner.step(request);
      put({ ev: 'turn', ms: Date.now() - t0, finish: result.finishReason, usage: result.usage });
      return result;
    } catch (error) {
      put({ ev: 'turn', ms: Date.now() - t0, error: String(error).slice(0, 300) });
      throw error;
    }
  },
  stepStream: (request, options) => ({
    async *[Symbol.asyncIterator]() {
      const t0 = Date.now();
      let first: number | undefined;
      try {
        for await (const event of inner.stepStream(request, options)) {
          first ??= Date.now() - t0;
          if (event.type === 'done') put({ ev: 'turn', ms: Date.now() - t0, firstMs: first, finish: event.result.finishReason, usage: event.result.usage });
          yield event;
        }
      } catch (error) {
        put({ ev: 'turn', ms: Date.now() - t0, error: String(error).slice(0, 300) });
        throw error;
      }
    },
  }),
});
