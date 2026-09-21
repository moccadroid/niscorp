import { createSignal, providerRegistry } from '@niscorp/signal';
import type { Signal } from '@niscorp/signal';
import { openConnectionsTo } from '@encore/server/keep-warm';
import { FAKE_MODEL, startFakeProvider } from './fake-provider';

// WHICH DECISION PROVIDER, chosen once at boot — and invisible from there on.
//
// Both arms hand back the same thing: a signal with `decide()` on it. The loop
// cannot tell Jev from the lexical fake, which is the property that makes a
// check on the fake a check on the app.
//
//   ENCORE_DECIDER=fake      (default) the local listener, deterministic, offline
//   ENCORE_DECIDER=typesafe  TypeSafe's Jev; needs TYPESAFE_API_KEY
//
// Asking for `typesafe` without a key is refused, loudly, rather than quietly
// served by the fake: somebody measuring Jev's latency must never be shown the
// fake's.

export type DeciderKind = 'fake' | 'typesafe';

export type Decider = {
  id: string;
  signal: Signal;
  // PRE-WARM: make sure a connection to the provider is open, by asking it one
  // trivial question. Fire-and-forget by design — it never throws, and what
  // happened is returned for the trace. A connection used in the last few
  // seconds is already warm, and is left alone.
  warm: () => Promise<WarmOutcome>;
  // A PASS DOES NOT RACE A WARM-UP. With one in flight, a pass that starts
  // anyway finds the only socket busy and opens a second, cold one beside it —
  // paying the handshake the warm-up exists to pay for it. So it waits: for the
  // warm-up to finish, or for WARM_WAIT_MS, whichever is first — never longer
  // than the handshake it would be saving. Resolves with how long it waited.
  ready: () => Promise<number>;
  // The loop calls this after every real pass, so `warm` knows how fresh the
  // connection is without guessing.
  used: () => void;
  // The fake's latency knob, where there is a fake.
  fakeLatency?: { ms: number };
  // The fake's middling-opinion knob, where there is a fake.
  fakeMiddling?: { floor: number };
  // The fake's record of the request bodies it was sent, where there is a fake.
  fakeSeen?: () => readonly string[];
  close: () => Promise<void>;
};

export type WarmOutcome = { outcome: 'warmed' | 'fresh' | 'failed'; ms: number };

// The most a pass will wait for a warm-up in flight: about one fresh handshake.
// Past that, opening a second socket is the faster road and the pass takes it.
export const WARM_WAIT_MS = 1_000;

// One question, no state worth reading: the cheapest request the wire allows.
const WARM_QUESTIONS = { warm: { type: 'noul', instructions: 'Reply yes.' } } as const;

const warming = (signal: Signal, baseUrl: string): Pick<Decider, 'warm' | 'used' | 'ready'> => {
  let inFlight: Promise<WarmOutcome> | undefined;
  return {
    used: () => {},
    ready: async () => {
      const pending = inFlight;
      if (pending === undefined) return 0;
      const started = performance.now();
      await Promise.race([pending, new Promise<void>((resolve) => setTimeout(resolve, WARM_WAIT_MS))]);
      // ...AND ONE TURN OF THE EVENT LOOP MORE. Measured here: a request sent in
      // the very tick the last one finished finds undici's client still marked
      // busy — it clears on a later tick — and the pool, being allowed two
      // sockets, opens the second. That is the `connection new` the first pass
      // after a page load was paying (~900 ms of handshake on the real
      // provider), with a perfectly warm socket sitting beside it.
      await new Promise<void>((resolve) => setImmediate(resolve));
      return performance.now() - started;
    },
    warm: () => {
      // A socket is open to the provider: it is warm, by the only test that
      // cannot be wrong. Asking again would only spend a request.
      if (openConnectionsTo(baseUrl) > 0) return Promise.resolve({ outcome: 'fresh', ms: 0 });
      if (inFlight !== undefined) return inFlight;
      const started = performance.now();
      inFlight = signal
        .decide({ state: 'warm', questions: WARM_QUESTIONS })
        .then((): WarmOutcome => ({ outcome: 'warmed', ms: performance.now() - started }))
        // Swallowed: a pre-warm that fails has cost nothing but itself, and the
        // pass that follows will report the real problem if there is one.
        .catch((): WarmOutcome => ({ outcome: 'failed', ms: performance.now() - started }))
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
  };
};

export type DeciderConfig = {
  kind: DeciderKind;
  port: number;
  latencyMs: number;
  // The fake only: lift every yes/no answer onto [floor, 1].
  noulFloor: number;
};

const numberFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value === undefined || value === '' || Number.isNaN(parsed) ? fallback : parsed;
};

export const deciderConfigFromEnv = (env: Record<string, string | undefined>): DeciderConfig => ({
  kind: env['ENCORE_DECIDER'] === 'typesafe' ? 'typesafe' : 'fake',
  port: numberFrom(env['ENCORE_DECIDER_PORT'], 8795),
  latencyMs: numberFrom(env['ENCORE_DECIDER_LATENCY_MS'], 0),
  noulFloor: numberFrom(env['ENCORE_DECIDER_MIDDLING'], 0),
});

export const createDecider = async (config: DeciderConfig, env: Record<string, string | undefined>): Promise<Decider> => {
  if (config.kind === 'typesafe') {
    if ((env['TYPESAFE_API_KEY'] ?? '') === '') throw new Error('encore: ENCORE_DECIDER=typesafe needs TYPESAFE_API_KEY in apps/lab/encore/.env.');
    const signal = createSignal('typesafe');
    return { id: 'typesafe', signal, ...warming(signal, providerRegistry['typesafe']?.baseUrl ?? 'https://api.typesafe.ai/v1'), close: async () => {} };
  }

  const provider = await startFakeProvider({ port: config.port, latencyMs: config.latencyMs, noulFloor: config.noulFloor });
  const signal = createSignal({ baseUrl: provider.baseUrl, apiKey: 'encore-dev', model: FAKE_MODEL, adapter: 'systemone' });
  return { id: `fake@${provider.port}`, signal, ...warming(signal, provider.baseUrl), fakeLatency: provider.latency, fakeMiddling: provider.middling, fakeSeen: provider.seen, close: provider.close };
};
