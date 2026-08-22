import type { SignalClient } from '@niscorp/cortex';
import type { StepRequest, StepStreamEvent, StreamOptions } from '@niscorp/signal';

// ═══════════════════════════════════════════════════════════
// One streamed call, served by one unstreamed one.
//
// A reasoning model that thinks before it emits sends NOTHING on the wire while
// it does — and OpenRouter closes a stream that has been quiet too long
// ("Upstream idle timeout exceeded"). Cortex treats that throw as terminal, so a
// seven-minute build with every query already proved is discarded whole.
//
// The fix is to stop streaming THAT model, and only that model. Cortex picks
// stream-vs-step per AGENT (`defineAgent({ transport })`), which is the wrong
// axis — the agent has no idea which model it was handed, and half our agents
// belong to libraries we do not want to edit for this. So the choice is made
// where the model is known instead: the client itself answers a streamed call
// with a single `step`, and every agent that holds it — ours, nova's, prism's,
// vex's — stops streaming together.
//
// What it costs is the token-by-token trace for that model. Nothing else: the
// `done` event carries the whole StepResult, which is what cortex's loop reads.
// ═══════════════════════════════════════════════════════════
export const streamViaStep = (llm: SignalClient): SignalClient => ({
  ...llm,
  stepStream: (request: StepRequest, options?: StreamOptions): AsyncIterable<StepStreamEvent> => ({
    async *[Symbol.asyncIterator](): AsyncIterator<StepStreamEvent> {
      // The abort signal rides the request's own options — a run cancelled
      // mid-call must still cancel, streamed or not.
      const signal = options?.signal;
      const stepped =
        signal === undefined ? request : { ...request, options: { ...request.options, signal } };
      yield { type: 'done', result: await llm.step(stepped) };
    },
  }),
});
