import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export const answerKeep: SeedMutation = {
  fingerprint: 'answers/keep',
  intent:
    'Keep a message the person sent and its answer: what they asked, its title, what the model said, and the screen it put up with the grammars it is written at — or, for an answer that put up no screen of its own, the answer or the screen it was asked on',
  mutation: {
    op: 'insert',
    table: 'answers',
    values: {
      id: { $context: 'id' },
      question: { $context: 'question' },
      title: { $context: 'title' },
      response: { $context: 'response' },
      plan: { $context: 'plan' },
      grammar: { $context: 'grammar' },
      asked_on: { $context: 'askedOn' },
      screen: { $context: 'screen' },
    },
  },
};

export const answersRecent: SeedEntry = {
  fingerprint: 'answers/recent',
  intent: 'The answers that put up a screen the person was given last, the newest first',
  shape: [{ id: '', question: '', title: '', response: '', plan: {}, grammar: {} }],
  dsl: {
    from: ['answers'],
    fields: ['answers.id', 'answers.question', 'answers.title', 'answers.response', 'answers.plan', 'answers.grammar'],
    filter: { isNotNull: 'answers.plan' },
    sort: [{ field: 'answers.created_at', dir: 'desc' }, { field: 'answers.id', dir: 'desc' }],
    limit: 50,
  },
};

export const answersSaid: SeedEntry = {
  fingerprint: 'answers/said',
  intent: 'What the person asked last and what was said back, the newest first, with the answer or the screen each was asked on',
  shape: [{ id: '', question: '', title: '', response: '', asked_on: '', screen: '' }],
  dsl: {
    from: ['answers'],
    fields: ['answers.id', 'answers.question', 'answers.title', 'answers.response', 'answers.asked_on', 'answers.screen'],
    sort: [{ field: 'answers.created_at', dir: 'desc' }, { field: 'answers.id', dir: 'desc' }],
    limit: 100,
  },
};

export const ANSWER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [answerKeep, answersRecent, answersSaid];
