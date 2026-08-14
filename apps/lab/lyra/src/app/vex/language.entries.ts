import type { CacheEntry } from './index';

// ═══════════════════════════════════════════════════════════════
// THE DEPLOYMENT'S WORDS, as entries. The `phrases` table is release
// vocabulary — translations of the application's own sentences, identical for
// every reader of a language and owned by no tenant — so these reads are
// context-driven and unscoped, granted on `base` because every shell needs its
// book to greet somebody. What they replace is `BY_LOCALE`: every phrase for
// every language, resident, so a synchronous seam could answer.
// ═══════════════════════════════════════════════════════════════

export const phrasesBook: CacheEntry = {
  fingerprint: 'phrases/book',
  intent: "One language's words: source sentence in, translated sentence out — the book a shell wears, read when the shell is built",
  shape: [{ source: '', text: '' }],
  dsl: {
    from: ['phrases'],
    fields: ['phrases.source', 'phrases.text'],
    filter: { eq: ['phrases.locale', { $context: 'locale' }] },
    // The whole book, explicitly: a language is ~500 sentences today and the
    // engine's default page would serve a translated shell a partial
    // vocabulary — which reads as UNTRANSLATED, the one failure this entry
    // exists to prevent.
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

// An approved integration ships a phrasebook with its bundle, `(language, source,
// text)` like the app's own. Approved is the bar, not installed: words are
// harmless where the screens are absent, and a book that changed per studio
// would put the tenant back into a language fact. The FOLD ORDER lives in the
// one consumer (`bookOverWire`): integration words first, the app's own over them, so
// an integration can never rename a word the host already owns.
export const phrasesPacks: CacheEntry = {
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
