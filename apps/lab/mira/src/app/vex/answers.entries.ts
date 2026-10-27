import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export const answerKeep: SeedMutation = {
  fingerprint: 'answers/keep',
  intent: 'Keep an answer the person was given: what they asked, its title, what the model said, and the screen',
  mutation: {
    op: 'insert',
    table: 'answers',
    values: { question: { $context: 'question' }, title: { $context: 'title' }, response: { $context: 'response' }, plan: { $context: 'plan' } },
  },
};

export const answersRecent: SeedEntry = {
  fingerprint: 'answers/recent',
  intent: 'The answers the person was given last, the newest first',
  shape: [{ question: '', title: '', response: '', plan: {} }],
  dsl: {
    from: ['answers'],
    fields: ['answers.question', 'answers.title', 'answers.response', 'answers.plan'],
    sort: [{ field: 'answers.created_at', dir: 'desc' }, { field: 'answers.id', dir: 'desc' }],
    limit: 50,
  },
};

export const ANSWER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [answerKeep, answersRecent];
