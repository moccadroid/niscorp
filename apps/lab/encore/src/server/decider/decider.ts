import { createSignal, providerRegistry } from '@niscorp/signal';
import type { Signal } from '@niscorp/signal';
import { openConnectionsTo } from '@encore/server/keep-warm';
import { FAKE_MODEL, startFakeProvider } from './fake-provider';

export type DeciderKind = 'fake' | 'typesafe';

export type Decider = {
  id: string;
  signal: Signal;
  warm: () => Promise<WarmOutcome>;
  // A pass awaits this: started beside a warm-up, it finds the socket busy and opens a cold one.
  ready: () => Promise<number>;
  used: () => void;
  fakeLatency?: { ms: number };
  fakeMiddling?: { floor: number };
  fakeSeen?: () => readonly string[];
  close: () => Promise<void>;
};

export type WarmOutcome = { outcome: 'warmed' | 'fresh' | 'failed'; ms: number };

// About one fresh handshake: past that, opening a second socket is faster than waiting.
export const WARM_WAIT_MS = 1_000;

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
      // One more turn of the event loop: a request sent in the tick the last one finished
      // finds undici's client still marked busy, and the pool opens a second, cold socket.
      await new Promise<void>((resolve) => setImmediate(resolve));
      return performance.now() - started;
    },
    warm: () => {
      if (openConnectionsTo(baseUrl) > 0) return Promise.resolve({ outcome: 'fresh', ms: 0 });
      if (inFlight !== undefined) return inFlight;
      const started = performance.now();
      inFlight = signal
        .decide({ state: 'warm', questions: WARM_QUESTIONS })
        .then((): WarmOutcome => ({ outcome: 'warmed', ms: performance.now() - started }))
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
