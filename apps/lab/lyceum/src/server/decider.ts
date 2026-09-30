import { createSignal } from '@niscorp/signal';

// THE ONE DECIDER — Jev (TypeSafe's decision model, `decide()`) with
// TYPESAFE_API_KEY, gpt-oss-120b answering the same questions without it.
// Everything in lyceum that is a narrow question with a fixed set of answers
// asks it: which earlier query a request matches and in which shape
// (./querying.ts), and whether something a person wrote may be shown
// (./moderation.ts). One model, one kind of contract: a state and typed
// questions in, an answer with its probability out.
export const createDecider = (env: Record<string, string | undefined>): ReturnType<typeof createSignal> =>
  (env['TYPESAFE_API_KEY'] ?? '') !== ''
    ? createSignal('typesafe')
    : createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
