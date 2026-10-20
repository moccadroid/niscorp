import { greetingAdd, greetingLanguages, greetingsCount, greetingsInLanguage, greetingsList, greetingsPerLanguage } from './vex/greetings.entries';

// What a screen is composed from: an action opened with an input, and what it shows, in words — the words Jev and the
// model match a message to. `choose` is an input picked from the rows a read answers (a path into `input`, and the
// question asked to pick it). `set` is an input the model fills in from the message (a path, and what goes there).
// `example` is offered to the person as something to ask.
export type PreparedAnswer = {
  id: string;
  shows: string;
  example: string;
  action: string;
  input: Record<string, unknown>;
  choose?: Record<string, { question: string; read: string; field: string }>;
  set?: Record<string, string>;
};

const GREETING_COLUMNS = [
  { key: 'text', label: 'Greeting' },
  { key: 'language', label: 'Language' },
];

export const ANSWERS: readonly PreparedAnswer[] = [
  {
    id: 'greetings.table',
    shows: 'a table of every greeting',
    example: 'Show me every greeting',
    action: 'rows.table',
    input: { title: 'Greetings', read: greetingsList.fingerprint, params: {}, columns: GREETING_COLUMNS },
  },
  {
    id: 'greetings.in-language',
    shows: 'the greetings in one particular language',
    example: 'Which greetings are in German?',
    action: 'rows.table',
    input: { title: 'Greetings in one language', read: greetingsInLanguage.fingerprint, params: { language: '' }, columns: GREETING_COLUMNS },
    choose: { 'params.language': { question: 'Which language does the message ask about?', read: greetingLanguages.fingerprint, field: 'language' } },
    set: { title: 'the title, naming the language: "Greetings in Spanish"' },
  },
  {
    id: 'greetings.count',
    shows: 'how many greetings there are, as one number',
    example: 'How many greetings are there?',
    action: 'rows.stat',
    input: { title: 'Greetings', read: greetingsCount.fingerprint, params: {}, label: 'greetings' },
  },
  {
    id: 'greetings.per-language',
    shows: 'how many greetings each language has',
    example: 'Greetings per language',
    action: 'rows.bars',
    input: { title: 'Greetings per language', read: greetingsPerLanguage.fingerprint, params: {} },
  },
  {
    id: 'greetings.add',
    shows: 'a form to add a new greeting',
    example: 'Add a greeting that says Servus',
    action: 'rows.form',
    input: {
      title: 'Add a greeting',
      write: greetingAdd.fingerprint,
      fields: [
        { key: 'text', label: 'Greeting', value: '' },
        { key: 'language', label: 'Language', value: '' },
      ],
    },
    set: { 'fields.0.value': 'the greeting itself, as the message writes it', 'fields.1.value': 'the language the greeting is in, named in English' },
  },
];
