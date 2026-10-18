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

// temperature 0: at the provider default (~1.0) the same prompt draws a
// 3-tool run or a 20-step wander by luck.
const GREEDY: Sampling = () => ({ temperature: 0 });

// Qwen's own settings: greedy decoding makes it repeat itself. Without reasoning
// (Groq's `default`, and `none`) temperature 0.7 and top_p 0.8; reasoning, 0.6 and 0.95.
export const QWEN_SAMPLING: Sampling = (effort) =>
  effort === undefined || effort === 'default' || effort === 'none' ? { temperature: 0.7, topP: 0.8 } : { temperature: 0.6, topP: 0.95 };

export const createGroqClient =
  (model: string, sampling: Sampling = GREEDY) =>
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
      options: { ...sampling(reasoningEffort), ...(reasoningEffort !== undefined && { reasoningEffort }) },
    });
  };

export const getKey = (): string | undefined => {
  const k = process.env[GROQ_ENV_KEY];
  return k === undefined || k === '' ? undefined : k;
};
