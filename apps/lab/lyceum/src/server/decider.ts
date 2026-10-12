import { createSignal } from '@niscorp/signal';

export const createDecider = (env: Record<string, string | undefined>): ReturnType<typeof createSignal> =>
  (env['TYPESAFE_API_KEY'] ?? '') !== ''
    ? createSignal('typesafe')
    : createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
