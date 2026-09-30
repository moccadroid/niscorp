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
  intent: 'Every question sent to the speaker that the moderator found fit to show, newest first, with its sender',
  shape: [{ question_id: '', text: '', sender: '' }],
  dsl: {
    from: ['questions', 'members', 'question_verdicts'],
    fields: ['questions.question_id', 'questions.text', { field: 'members.name', as: 'sender' }],
    filter: { eq: ['question_verdicts.appropriate', true] },
    sort: [{ field: 'questions.sent_at', dir: 'desc' }, { field: 'questions.question_id', dir: 'desc' }],
    limit: 200,
  },
};

// ── the moderator's (server/moderation.ts): what there is to judge ──
//
// Every question and every verdict; the moderator judges the questions no
// verdict names. Reactive — a question sent is news to it too.
export const questionsToJudge: SeedEntry = {
  fingerprint: 'questions/to-judge',
  intent: 'Every question sent to the speaker, with its words, for the moderator',
  shape: [{ question_id: '', text: '' }],
  dsl: {
    from: ['questions'],
    fields: ['questions.question_id', 'questions.text'],
    sort: [{ field: 'questions.sent_at', dir: 'asc' }, { field: 'questions.question_id', dir: 'asc' }],
    limit: 1000,
  },
};

export const verdictsAll: SeedEntry = {
  fingerprint: 'questions/verdicts',
  intent: 'Which questions the moderator has already judged',
  shape: [{ question_id: '' }],
  dsl: {
    from: ['question_verdicts'],
    fields: ['question_verdicts.question_id'],
    limit: 1000,
  },
};

export const questionJudge: SeedMutation = {
  fingerprint: 'questions/judge',
  intent: 'Record whether a question is fit to show, and the words that were judged',
  mutation: {
    op: 'insert',
    table: 'question_verdicts',
    values: { question_id: { $context: 'questionId' }, text: { $context: 'text' }, appropriate: { $context: 'appropriate' }, score: { $context: 'score' } },
  },
};

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
export const QUESTION_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [questionSend, questionsAll, questionsMine, questionsToJudge, verdictsAll, questionJudge];
