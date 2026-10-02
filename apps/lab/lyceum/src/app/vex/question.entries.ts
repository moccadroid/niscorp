import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── questions for the speaker (Q&A) ──
//
// Sent from a phone, as the sender — `member_id` is stamped. A member reads
// their OWN questions only; the speaker reads them all (the `room` reach,
// behaviors.ts). Nobody edits or deletes one. Nothing a person wrote goes up on
// the projector unread: the stage reads no question, only the verdicts that say
// fit to show (the `projector` reach). The screens that show these are the QA Company's —
// an integration — which calls them by fingerprint like any action does.

export const questionSend: SeedMutation = {
  fingerprint: 'questions/send',
  intent: 'Send the speaker a question',
  mutation: {
    op: 'insert',
    table: 'questions',
    values: { text: { $context: 'text' } },
  },
};

// What the projector may show: every question the moderator found fit, newest
// judged first — its words as the verdict judged them, and nobody's name. The
// filter says what it is for; the stage's reach enforces it either way.
// Reactive: a question judged fit reaches the stage on its own.
export const questionsShown: SeedEntry = {
  fingerprint: 'questions/shown',
  refresh: 'reactive',
  intent: 'Every question the moderator found fit to show on stage, newest first',
  shape: [{ question_id: '', text: '' }],
  dsl: {
    from: ['question_verdicts'],
    fields: ['question_verdicts.question_id', 'question_verdicts.text'],
    filter: { eq: ['question_verdicts.appropriate', true] },
    sort: [{ field: 'question_verdicts.judged_at', dir: 'desc' }, { field: 'question_verdicts.question_id', dir: 'desc' }],
    limit: 200,
  },
};

// Every question, fit to show or not, judged or not yet, newest first, with who
// sent it — the speaker's. Beside the verdicts (below), it is everything the
// room wrote and what the moderator made of it. Reactive: a question sent
// reaches the controller on its own.
export const questionsEvery: SeedEntry = {
  fingerprint: 'questions/every',
  refresh: 'reactive',
  intent: 'Every question sent to the speaker, fit to show or not, newest first, with its sender',
  shape: [{ question_id: '', text: '', sender: '' }],
  dsl: {
    from: ['questions', 'members'],
    fields: ['questions.question_id', 'questions.text', { field: 'members.name', as: 'sender' }],
    sort: [{ field: 'questions.sent_at', dir: 'desc' }, { field: 'questions.question_id', dir: 'desc' }],
    limit: 500,
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

// Every verdict: which questions are judged, and how. The moderator reads it to
// skip what it judged; the speaker reads it beside `questions/every`. Reactive:
// a verdict written reaches the controller on its own.
export const verdictsAll: SeedEntry = {
  fingerprint: 'questions/verdicts',
  refresh: 'reactive',
  intent: 'Every verdict the moderator wrote: which question, whether it is fit to show, and its score',
  shape: [{ question_id: '', appropriate: false, score: 0 }],
  dsl: {
    from: ['question_verdicts'],
    fields: ['question_verdicts.question_id', 'question_verdicts.appropriate', 'question_verdicts.score'],
    sort: [{ field: 'question_verdicts.judged_at', dir: 'asc' }, { field: 'question_verdicts.question_id', dir: 'asc' }],
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

export const QUESTION_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [questionSend, questionsShown, questionsEvery, questionsMine, questionsToJudge, verdictsAll, questionJudge];
