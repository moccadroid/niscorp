import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import type { ReasoningEffort } from './effort';

// The OpenAI SDK client is built statically and injected: Vite cannot resolve
// signal's dynamic `import('openai')` from the workspace dist.

export const QWEN_MODEL = 'qwen/qwen3.8-27b';
export const GPT_OSS_MODEL = 'openai/gpt-oss-120b';
export const GROQ_ENV_KEY = 'GROQ_API_KEY';

export const createGroqClient =
  (model: string) =>
  (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient => {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      dangerouslyAllowBrowser: true,
    });
    return createSignal('groq', {
      client,
      model,
      apiKey,
      // temperature 0: at the provider default (~1.0) the same prompt draws a
      // 3-tool run or a 20-step wander by luck.
      options: { temperature: 0, ...(reasoningEffort !== undefined && { reasoningEffort }) },
    });
  };

export const getKey = (): string | undefined => {
  const k = process.env[GROQ_ENV_KEY];
  return k === undefined || k === '' ? undefined : k;
};
