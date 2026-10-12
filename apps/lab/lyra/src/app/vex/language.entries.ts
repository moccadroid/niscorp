import type { CacheEntry } from './index';

export const phrasesBook: CacheEntry = {
  fingerprint: 'phrases/book',
  intent: "One language's words: source sentence in, translated sentence out — the book a shell wears, read when the shell is built",
  shape: [{ source: '', text: '' }],
  dsl: {
    from: ['phrases'],
    fields: ['phrases.source', 'phrases.text'],
    filter: { eq: ['phrases.locale', { $context: 'locale' }] },
    // The whole book: the engine's default page would serve a translated shell
    // a partial vocabulary.
    limit: 10000,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        source: { $get: { from: { $var: 'r' }, path: ['source'] } },
        text: { $get: { from: { $var: 'r' }, path: ['text'] } },
      },
    },
  },
};

export const phrasesLocales: CacheEntry = {
  fingerprint: 'phrases/locales',
  intent: 'Which languages this deployment holds words for — the switcher offers these',
  shape: [''],
  dsl: {
    from: ['phrases'],
    fields: ['phrases.locale'],
    limit: 10000,
  },
  mapping: {
    $unique: { $map: { over: { $ref: '$.result' }, as: 'r', body: { $get: { from: { $var: 'r' }, path: ['locale'] } } } },
  },
};

// Approved, not installed: a language's book must not differ per studio
// (`bookOverWire` holds one per language for every tenant).
export const phrasesIntegrations: CacheEntry = {
  fingerprint: 'phrases/integrations',
  intent: "Approved integrations' words for one language — folded under the app's own book",
  shape: [{}],
  dsl: {
    from: ['integrations'],
    fields: ['integrations.phrasebook'],
    filter: { eq: ['integrations.status', 'approved'] },
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: { $get: { from: { $var: 'r' }, path: ['phrasebook', { $ref: '$.context.locale' }], fallback: { $const: {} } } },
    },
  },
};
