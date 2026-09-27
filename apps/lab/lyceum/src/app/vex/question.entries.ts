import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── questions for the speaker (Q&A) ──
//
// Sent from a phone, as the sender — `member_id` is stamped. A member reads,
// edits and deletes their OWN questions only; the speaker reads them all (the
// `room` reach, behaviors.ts). Nothing a person wrote goes up on the projector
// unread.

export const questionSend: SeedMutation = {
  fingerprint: 'questions/send',
  intent: 'Send the speaker a question',
  mutation: {
    op: 'insert',
    table: 'questions',
    values: { text: { $context: 'text' } },
  },
};

// Every question, newest first, with who sent it — the speaker's. Reactive: a
// question sent reaches the controller on its own.
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

// The questions this person sent, newest first. Reactive: sent, edited or
// deleted, the list follows.
export const questionsMine: SeedEntry = {
  fingerprint: 'questions/mine',
  refresh: 'reactive',
  intent: 'The questions this person sent the speaker, newest first',
  shape: [{ question_id: '', text: '' }],
  dsl: {
    from: ['questions'],
    fields: ['questions.question_id', 'questions.text'],
    sort: [{ field: 'questions.sent_at', dir: 'desc' }, { field: 'questions.question_id', dir: 'desc' }],
    limit: 50,
  },
};

// One of this person's questions, to edit.
export const questionOne: SeedEntry = {
  fingerprint: 'questions/one',
  intent: 'One question this person sent, by its id',
  shape: { question_id: '', text: '' },
  dsl: {
    from: ['questions'],
    fields: ['questions.question_id', 'questions.text'],
    filter: { eq: ['questions.question_id', { $context: 'questionId' }] },
  },
};

export const questionEdit: SeedMutation = {
  fingerprint: 'questions/edit',
  intent: 'Change the words of a question this person sent',
  mutation: {
    op: 'update',
    table: 'questions',
    set: { text: { $context: 'text' } },
    where: { eq: ['questions.question_id', { $context: 'questionId' }] },
  },
};

export const questionDelete: SeedMutation = {
  fingerprint: 'questions/delete',
  intent: 'Take back a question this person sent',
  mutation: {
    op: 'delete',
    table: 'questions',
    where: { eq: ['questions.question_id', { $context: 'questionId' }] },
  },
};

export const QUESTION_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [questionSend, questionsAll, questionsMine, questionOne, questionEdit, questionDelete];
