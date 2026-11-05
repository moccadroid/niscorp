import type OpenAI from 'openai';
import { chatProviderEntry, createSignal, ErrorCode, SignalError } from '@niscorp/signal';
import { z } from 'zod';
import { MAX_NATIVE_TIMEOUT_MS } from '../engine/control.js';

export const ModelTransportSchema = z
  .object({
    openaiCompatible: z.object({ maxRetries: z.number().int().nonnegative() }).strict(),
    rateLimit: z
      .object({
        statuses: z.array(z.number().int().min(400).max(599)),
        fallbackWaitMs: z.number().int().nonnegative(),
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type ModelTransport = z.output<typeof ModelTransportSchema>;

export const ProviderBlockSchema = z
  .object({
    kind: z.literal('provider'),
    code: z.string().min(1),
    message: z.string().min(1),
    status: z.number().int(),
    retryAfterMs: z.number().nonnegative().nullable(),
  })
  .strict();
export type ProviderBlock = z.output<typeof ProviderBlockSchema>;

const retryDelay = (headers: Headers): number | null => {
  const milliseconds = headers.get('retry-after-ms');
  if (milliseconds !== null && milliseconds.trim() !== '') {
    const value = Number(milliseconds);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const value = headers.get('retry-after');
  if (value === null || value.trim() === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
};

const wait = (ms: number, signal: AbortSignal | null | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const cancel = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      },
      Math.min(ms, MAX_NATIVE_TIMEOUT_MS),
    );
    signal?.addEventListener('abort', cancel, { once: true });
  });

/** Use Signal's public SDK injection; the SDK remains the sole HTTP retry owner. */
export const createModelClient = (input: {
  provider: Parameters<typeof createSignal>[0];
  apiKey: string;
  transport: ModelTransport;
}): {
  client: ReturnType<typeof createSignal>;
  blockFor(signal: AbortSignal): ProviderBlock | null;
} => {
  const providerInput =
    typeof input.provider === 'string' ? input.provider : structuredClone(input.provider);
  const apiKey = input.apiKey;
  const provider =
    typeof providerInput === 'string' ? chatProviderEntry(providerInput) : providerInput;
  if (!provider || (provider.adapter ?? 'openai-compatible') !== 'openai-compatible')
    return { client: createSignal(providerInput, { apiKey }), blockFor: () => null };
  const baseURL = provider.baseUrl;
  const policy = ModelTransportSchema.parse(input.transport);
  type Cooldown = { until: number; status: number; retryAfterMs: number };
  const cooldowns = new Map<string, Cooldown>();
  const limitedCalls = new WeakMap<AbortSignal, Cooldown>();
  const client = {
    chat: {
      completions: {
        async create(...args: Parameters<OpenAI['chat']['completions']['create']>) {
          const model = args[0].model;
          const callSignal = args[1]?.signal;
          let latestLimit: Cooldown | undefined;
          const fetch: typeof globalThis.fetch = async (request, init) => {
            const signal =
              init?.signal ?? (request instanceof Request ? request.signal : undefined);
            let cooldown = cooldowns.get(model);
            while (cooldown && Date.now() < cooldown.until) {
              latestLimit = cooldown;
              if (callSignal) limitedCalls.set(callSignal, cooldown);
              await wait(cooldown.until - Date.now(), signal);
              cooldown = cooldowns.get(model);
            }
            signal?.throwIfAborted();
            latestLimit = undefined;
            if (callSignal) limitedCalls.delete(callSignal);
            const response = await globalThis.fetch(request, init);
            if (policy.rateLimit.statuses.includes(response.status)) {
              const delay = retryDelay(response.headers) ?? policy.rateLimit.fallbackWaitMs;
              const limited = {
                status: response.status,
                retryAfterMs: delay,
                until: Math.max(cooldowns.get(model)?.until ?? 0, Date.now() + delay),
              };
              cooldowns.set(model, limited);
              latestLimit = limited;
              if (callSignal) limitedCalls.set(callSignal, limited);
              // The SDK's retry sleep is not abortable. It still owns retries;
              // our next-dispatch gate owns the real, cancellable provider wait.
              const headers = new Headers(response.headers);
              headers.delete('retry-after');
              headers.set('retry-after-ms', '0');
              return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
              });
            }
            return response;
          };
          const { default: SDK } = await import('openai');
          const sdk = new SDK({
            apiKey,
            baseURL,
            maxRetries: policy.openaiCompatible.maxRetries,
            fetch,
          });
          try {
            return await sdk.chat.completions.create(...args);
          } catch (error) {
            if (latestLimit)
              throw new ProviderTransportError(
                policy.rateLimit.message,
                latestLimit.status,
                Math.max(0, latestLimit.until - Date.now()),
              );
            throw error;
          }
        },
      },
    },
  };
  return {
    client: createSignal(providerInput, { apiKey, client }),
    blockFor(signal) {
      const limited = limitedCalls.get(signal);
      return limited
        ? {
            kind: 'provider',
            code: policy.rateLimit.code,
            message: policy.rateLimit.message,
            status: limited.status,
            retryAfterMs: Math.max(0, limited.until - Date.now()),
          }
        : null;
    },
  };
};

class ProviderTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'ProviderTransportError';
  }
}

/** Read structured provider facts only; never classify from a human error message. */
export const readProviderBlock = (cause: unknown, policy: ModelTransport): ProviderBlock | null => {
  if (!(cause instanceof SignalError) || cause.code !== ErrorCode.PROVIDER_ERROR) return null;
  const raw = z
    .object({
      status: z.number().int(),
      headers: z.instanceof(Headers).optional(),
      retryAfterMs: z.number().nonnegative().optional(),
    })
    .loose()
    .safeParse(cause.context?.raw);
  if (!raw.success || !policy.rateLimit.statuses.includes(raw.data.status)) return null;
  return {
    kind: 'provider',
    code: policy.rateLimit.code,
    message: policy.rateLimit.message,
    status: raw.data.status,
    retryAfterMs: raw.data.retryAfterMs ?? (raw.data.headers ? retryDelay(raw.data.headers) : null),
  };
};
