import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import type { ReasoningEffort } from './effort';

// The OpenAI SDK client is built statically and injected: Vite cannot resolve
// signal's dynamic `import('openai')` from the workspace dist.

export const QWEN_MODEL = 'qwen/qwen3.8-27b';
export const GPT_OSS_MODEL = 'openai/gpt-oss-120b';
export const GROQ_ENV_KEY = 'GROQ_API_KEY';

export type Sampling = (reasoningEffort: ReasoningEffort | undefined) => { temperature: number; topP?: number };

// Qwen's own settings: greedy decoding makes it repeat itself. Without reasoning
// (Groq's `default`, and `none`) temperature 0.7 and top_p 0.8; reasoning, 0.6 and 0.95.
export const QWEN_SAMPLING: Sampling = (effort) =>
  effort === undefined || effort === 'default' || effort === 'none' ? { temperature: 0.7, topP: 0.8 } : { temperature: 0.6, topP: 0.95 };

export const createGroqClient =
  (model: string, sampling?: Sampling) =>
  (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient => {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      dangerouslyAllowBrowser: true,
    });
    return waitingOutRateLimits(
      createSignal('groq', {
        client,
        model,
        apiKey,
        options: { ...sampling?.(reasoningEffort), ...(reasoningEffort !== undefined && { reasoningEffort }) },
      }),
    );
  };

const RATE_LIMIT_ATTEMPTS = 5;

// The wait Groq names in a 429 ("Please try again in 2.46s"), or undefined for any other failure.
const rateLimitWait = (error: unknown): number | undefined => {
  const text = error instanceof Error ? error.message : String(error);
  if (!/\b429\b|rate limit/i.test(text)) return undefined;
  const seconds = /try again in ([\d.]+)\s*s/i.exec(text)?.[1];
  return Math.ceil((seconds === undefined ? 5 : Number(seconds)) * 1000) + 250;
};

const pause = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

// Groq counts tokens per minute per model, and a screen build can spend a minute's worth in seconds. A call refused
// for that before it produced anything is made again after the wait Groq names.
const waitingOutRateLimits = (inner: SignalClient): SignalClient => ({
  ...inner,
  step: async (request) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await inner.step(request);
      } catch (error) {
        const wait = rateLimitWait(error);
        if (wait === undefined || attempt >= RATE_LIMIT_ATTEMPTS) throw error;
        await pause(wait);
      }
    }
  },
  stepStream: async function* (request, options) {
    for (let attempt = 1; ; attempt++) {
      let produced = false;
      try {
        for await (const event of inner.stepStream(request, options)) {
          produced = true;
          yield event;
        }
        return;
      } catch (error) {
        const wait = rateLimitWait(error);
        if (produced || wait === undefined || attempt >= RATE_LIMIT_ATTEMPTS || options?.signal?.aborted === true) throw error;
        await pause(wait, options?.signal);
      }
    }
  },
});

export const getKey = (): string | undefined => {
  const k = process.env[GROQ_ENV_KEY];
  return k === undefined || k === '' ? undefined : k;
};
