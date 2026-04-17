// ═══════════════════════════════════════════════════════════
// SignalClient — the structural interface Cortex requires
// ═══════════════════════════════════════════════════════════
//
// Cortex uses @niscorp/signal's step-level primitives directly.
// Tests stub this shape; production passes a real Signal instance,
// which satisfies it automatically.

import type {
  StepRequest,
  StepResult,
  StepStreamEvent,
  StreamOptions,
  CountInput,
} from '@niscorp/signal';

export type SignalClient = {
  step: (request: StepRequest) => Promise<StepResult>;
  stream: (
    request: StepRequest,
    options?: StreamOptions,
  ) => AsyncIterable<StepStreamEvent>;
  count: (input: CountInput) => Promise<number>;
};
