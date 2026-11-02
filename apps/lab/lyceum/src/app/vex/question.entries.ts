import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export const questionSend: SeedMutation = {
  fingerprint: 'questions/send',
  intent: 'Send the speaker a question',
  mutation: {
    op: 'insert',
    table: 'questions',
    values: { text: { $context: 'text' } },
  },
};

// The filter says what it is for; the stage's reach enforces it either way.
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

export const questionShow: SeedMutation = {
  fingerprint: 'questions/show',
  intent: 'Put a question the moderator judged on the projector',
  mutation: {
    op: 'insert',
    table: 'question_shown',
    values: { question_id: { $context: 'question_id' } },
  },
};

// The filter says what it is for; the stage's reach keeps it to fit questions either way.
export const questionOnScreen: SeedEntry = {
  fingerprint: 'questions/on-screen',
  refresh: 'reactive',
  intent: 'The question the speaker put on the projector last, with its text',
  shape: [{ question_id: '', text: '' }],
  dsl: {
    from: ['question_shown', 'question_verdicts'],
    fields: ['question_verdicts.question_id', 'question_verdicts.text'],
    filter: { eq: ['question_verdicts.appropriate', true] },
    sort: [{ field: 'question_shown.created_at', dir: 'desc' }, { field: 'question_shown.shown_id', dir: 'desc' }],
    limit: 1,
  },
};

// A person reads only their own questions, so this is the newest of theirs the speaker put up.
export const questionMineOnScreen: SeedEntry = {
  fingerprint: 'questions/mine-on-screen',
  refresh: 'reactive',
  intent: 'The newest of this person’s questions the speaker put on the projector',
  shape: [{ question_id: '' }],
  dsl: {
    from: ['question_shown', 'question_verdicts', 'questions'],
    fields: ['questions.question_id'],
    sort: [{ field: 'question_shown.created_at', dir: 'desc' }, { field: 'question_shown.shown_id', dir: 'desc' }],
    limit: 1,
  },
};

export const QUESTION_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [questionSend, questionsShown, questionsEvery, questionsMine, questionsToJudge, verdictsAll, questionJudge, questionShow, questionOnScreen, questionMineOnScreen];
