import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── questions for the speaker (Q&A) ──
//
// Sent from a phone, as the sender — `member_id` is stamped (behaviors.ts).
// Kept, and read only on the speaker's controller for now; nothing a person
// wrote goes up on the projector unread.

export const questionSend: SeedMutation = {
  fingerprint: 'questions/send',
  intent: 'Send the speaker a question',
  mutation: {
    op: 'insert',
    table: 'questions',
    values: { text: { $context: 'text' } },
  },
};

// Every question, newest first, with who sent it. Reactive: a question sent
// reaches the controller on its own.
export const questionsAll: SeedEntry = {
  fingerprint: 'questions/all',
  refresh: 'reactive',
  intent: 'Every question sent to the speaker, newest first, with its sender',
  shape: [{ question_id: '', text: '', sender: '' }],
  dsl: {
    from: ['questions', 'members'],
    fields: ['questions.question_id', 'questions.text', { field: 'members.name', as: 'sender' }],
    sort: [{ field: 'questions.sent_at', dir: 'desc' }, { field: 'questions.question_id', dir: 'desc' }],
    limit: 200,
  },
};

export const QUESTION_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [questionSend, questionsAll];
