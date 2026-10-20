import type { SeedEntry, SeedMutation } from '@niscorp/vex';

const COLUMNS = ['greetings.greeting_id', 'greetings.text', 'greetings.language'];

export const greetingsList: SeedEntry = {
  fingerprint: 'greetings/list',
  refresh: 'reactive',
  intent: 'Every greeting, newest first',
  shape: [{ greeting_id: '', text: '', language: '' }],
  dsl: { from: ['greetings'], fields: COLUMNS, sort: [{ field: 'greetings.created_at', dir: 'desc' }], limit: 200 },
};

export const greetingsInLanguage: SeedEntry = {
  fingerprint: 'greetings/in-language',
  refresh: 'reactive',
  intent: 'The greetings in one language, newest first',
  shape: [{ greeting_id: '', text: '', language: '' }],
  dsl: {
    from: ['greetings'],
    fields: COLUMNS,
    filter: { eq: ['greetings.language', { $context: 'language' }] },
    sort: [{ field: 'greetings.created_at', dir: 'desc' }],
    limit: 200,
  },
};

export const greetingsCount: SeedEntry = {
  fingerprint: 'greetings/count',
  refresh: 'reactive',
  intent: 'How many greetings there are',
  shape: { value: 0 },
  dsl: { from: ['greetings'], aggregate: { value: { count: '*' } } },
};

export const greetingsPerLanguage: SeedEntry = {
  fingerprint: 'greetings/per-language',
  refresh: 'reactive',
  intent: 'How many greetings each language has',
  shape: [{ label: '', value: 0 }],
  dsl: {
    from: ['greetings'],
    fields: [{ field: 'greetings.language', as: 'label' }],
    aggregate: { value: { count: '*' } },
    groupBy: ['greetings.language'],
    sort: [{ field: 'greetings.language', dir: 'asc' }],
  },
};

export const greetingLanguages: SeedEntry = {
  fingerprint: 'greetings/languages',
  refresh: 'reactive',
  intent: 'The languages there are greetings in',
  shape: [{ language: '' }],
  dsl: { from: ['greetings'], fields: ['greetings.language'], distinct: true, sort: [{ field: 'greetings.language', dir: 'asc' }] },
};

export const greetingAdd: SeedMutation = {
  fingerprint: 'greetings/add',
  intent: 'Add a greeting, in the language it is in',
  mutation: { op: 'insert', table: 'greetings', values: { text: { $context: 'text' }, language: { $context: 'language' } } },
};
