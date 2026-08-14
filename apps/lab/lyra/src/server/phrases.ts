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

// ONE LANGUAGE'S WORDS, read when they are wanted.
//
// This was `BY_LOCALE`, every phrase for every language held at boot so that a
// synchronous seam could answer. Both seams that wanted it are asynchronous
// now, so this reads the rows for the one language being asked about.
//
// PACK WORDS FIRST, the app's own book OVER them. An approved pack ships a
// phrasebook with its bundle (the same `(language, source, text)` shape) and
// its screens translate with everything else — but merge order means a pack
// can never rename a word the host already owns. Approved is the bar, not
// installed: words are harmless where the screens are absent, and a book that
// changed per studio would put the tenant back into a language fact.
export const phrasesFor = async (pool: PgPool, locale: string): Promise<Phrasebook> => {
  const language = locale.split('-')[0] ?? locale;
  if (language === '' || language === 'en') return EMPTY;
  const book: Record<string, string> = {};
  const packs = await pool.query(/* sql */ `SELECT phrasebook FROM integrations WHERE status = 'approved'`);
  for (const row of packs.rows) {
    const held = (row['phrasebook'] ?? {}) as Record<string, Record<string, string>>;
    for (const [source, text] of Object.entries(held[language] ?? {})) book[source] = String(text);
  }
  const result = await pool.query(/* sql */ `SELECT source, text FROM phrases WHERE locale = $1`, [language]);
  for (const row of result.rows) book[String(row['source'])] = String(row['text']);
  return book;
};

/** Which languages this deployment holds words for — the switcher's options. */
export const loadedLocales = async (pool: PgPool): Promise<readonly string[]> => {
  const result = await pool.query(/* sql */ `SELECT DISTINCT locale FROM phrases ORDER BY locale`);
  return result.rows.map((row) => String(row['locale']));
};

// Composed from a book the caller already has, rather than fetching one. The
// two places that greet somebody (the opening paint and `nav.identity`) both
// hold the phrasebook by the time they need this, and a second fetch here is
// how the same sentence gets to disagree with itself.
export const greetingFrom = (book: Phrasebook, name: string, at: Date): string => {
  const hour = at.getHours();
  const stem = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name.split(' ')[0] ?? name;
  return `${book[stem] ?? stem}, ${first}`;
};
