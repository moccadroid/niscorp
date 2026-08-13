import type { PgPool } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE WORDS, LOADED LIKE THE LOOK.
//
// Structurally identical to `themes.ts`, deliberately: read the rows once at
// boot into a per-key map, hand the right one to each shell as it is built,
// re-read when the rows change. A studio's language and a studio's palette are
// the same kind of fact — something its owner decides, that no deploy should
// be involved in.
//
// Keyed by LOCALE rather than by studio, because a phrasebook is a property of
// the language, not of the tenant. Two Austrian studios share one book and one
// copy of it in memory. A studio that wants its own vocabulary ("athletes", not
// "members") is a per-studio overlay on top — the natural next row, and the
// reason this returns a plain object the caller can spread into.
// ═══════════════════════════════════════════════════════════════

export type Phrasebook = Readonly<Record<string, string>>;

const EMPTY: Phrasebook = {};

let BY_LOCALE: Record<string, Phrasebook> = {};

export const loadPhrases = async (pool: PgPool): Promise<number> => {
  const result = await pool.query(/* sql */ `
    SELECT locale, source, text
    FROM phrases
    WHERE context IS NULL
  `);
  const byLocale: Record<string, Record<string, string>> = {};
  for (const row of result.rows) {
    const locale = String(row['locale'] ?? '');
    const source = String(row['source'] ?? '');
    const text = String(row['text'] ?? '');
    if (locale === '' || source === '' || text === '') continue;
    (byLocale[locale] ??= {})[source] = text;
  }
  BY_LOCALE = byLocale;
  return result.rows.length;
};

// A tag resolves to its own book, then to its language's. `de-AT` falls back to
// `de` so a regional studio inherits the shared German wording and overrides
// only what differs — which is almost nothing in words, and everything in
// number formatting (that half is `Intl`'s and never comes from this table).
//
// No fallback to a DIFFERENT language: an unknown locale gets the source
// language, and a half-translated screen is the honest signal that a book is
// missing rather than a screen quietly mixing two languages.
export const phrasesFor = (locale: string): Phrasebook => {
  if (locale === '') return EMPTY;
  const exact = BY_LOCALE[locale];
  const language = locale.split('-')[0] ?? '';
  const base = language === locale ? undefined : BY_LOCALE[language];
  if (exact === undefined) return base ?? EMPTY;
  if (base === undefined) return exact;
  return { ...base, ...exact };
};

/** Which languages the deployment actually holds words for. The switcher reads
 *  this rather than a hardcoded list, so adding a language is adding rows. */
export const loadedLocales = (): readonly string[] => Object.keys(BY_LOCALE).sort();

// ONE GREETING, COMPOSED ONCE.
//
// "Guten Morgen, Maren" is the third channel a language reaches, after the
// render pass and the formatting ops: a string the application builds itself.
// The fixed half is looked up here, from the same table every screen uses; the
// name is concatenated after, because a name makes the whole string's
// cardinality unbounded and no dictionary will ever hold it.
//
// It lives here rather than at its two call sites because it HAD two call
// sites — `inputs` for the opening paint and `nav.identity` for the confirming
// read — and they drifted the moment one of them learned about languages. Two
// spellings of one sentence is how a screen ends up greeting somebody in
// German on load and in English a tick later.
export const greetingFor = (name: string, locale: string, at: Date): string => {
  const hour = at.getHours();
  const stem = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const book = phrasesFor(locale);
  const first = name.split(' ')[0] ?? name;
  return `${book[stem] ?? stem}, ${first}`;
};
