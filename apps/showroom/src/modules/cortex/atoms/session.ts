// ═══════════════════════════════════════════════════════════
// Session — what an orchestrator passes to a demo's runner
//
// Each kind orchestrator owns the React state machine + handles
// API-key lookup + builds the OpenAI SDK client (the bundler
// workaround). It hands the demo `apiKey + client` and the bus
// callbacks Cortex emits during execution.
//
// The demo's runner builds its own SignalClient via `createSignal`
// and feeds it to `runAgentStandalone(...)`. Both signal and
// cortex API calls stay visible in the demo file.
// ═══════════════════════════════════════════════════════════

import type OpenAI from 'openai';
import type { Bus, Observation, Result, RetryEventPayload } from '@niscorp/cortex';

export type Session = {
  apiKey: string;
  client: OpenAI;
  onObservation: (obs: Observation) => void;
  onRetry: (payload: RetryEventPayload) => void;
};

export type SessionWithBus = Session & {
  onBus: (bus: Bus) => void;
};

// A runner is the demo file's exported function — it builds a
// SignalClient + makes the `runAgentStandalone(...)` call. Closes
// over module-level agent/tools/prompt/etc. defined in the demo.
export type Runner<T = unknown> = (session: Session) => Promise<Result<T>>;
export type RunnerWithBus<T = unknown> = (session: SessionWithBus) => Promise<Result<T>>;
