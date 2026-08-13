// Run: pnpm --filter lyra exec tsx src/dev/phrase-harvest.ts [locale]
//
// WHAT THIS APPLICATION SAYS, and what a given language is still missing.
//
// The extraction half of the render-tree pass. Keying a dictionary on source
// strings only works if there is a mechanical way to enumerate them — otherwise
// "translate the app" means a human reading every layout, and the second
// language is permanently 90% done.
//
// Prints a report by default; `--emit` writes the missing set as a seed-shaped
// TS block on stdout, which is how the German book was first filled in.
import { harvestDefinitions, matcherFor, missingFrom } from '@niscorp/nova/i18n';
import type { HarvestedPhrase } from '@niscorp/nova/i18n';
import { CATALOG_DEFINITIONS } from '@lyra/app/action-catalog';
import { PHRASE_KEYS } from '@lyra/app/phrase-keys';
import { AREAS } from '@lyra/app/nav/sections';
import { EFFECTS, MOMENTS } from '@lyra/app/reflexes/compose';
import { RECIPES } from '@lyra/app/reflexes/recipes';
import { ENTRIES } from '@lyra/app/vex';
import { GERMAN } from '@lyra/db/phrases.de';

// The APP'S OWN declaration, not a copy of it. The copy this used to be had
// already drifted — the pass translated three props the harvest never walked.
const KEYS = PHRASE_KEYS;

// ── the four places words come from ──────────────────────────
//
// Three of them the harvester can read on its own. The fourth cannot be read
// from an artifact at all, so it is listed: see APP_COMPOSED below.

const fromActions = harvestDefinitions(CATALOG_DEFINITIONS, KEYS);

// The navigation table is app data, not an action — hub labels, screen names
// and the one-line blurbs under them.
const fromNav: HarvestedPhrase[] = AREAS.flatMap((area) => [
  { phrase: area.label, where: [`nav/${area.id}.label`] },
  { phrase: area.blurb, where: [`nav/${area.id}.blurb`] },
  ...area.items.flatMap((item) => [
    { phrase: item.label, where: [`nav/${area.id}/${item.action}.label`] },
    { phrase: item.blurb, where: [`nav/${area.id}/${item.action}.blurb`] },
  ]),
]);

// WORDS A READ MANUFACTURES, derived from the entries themselves.
//
// The vex mappings invent closed-set vocabulary inside `$case` branches on
// prose-suffixed keys (`state_label`, `paid_via_display`), and no walk over
// layouts can see it — it is authored inside a query rather than inside a
// screen. This used to be a hand-kept list, and it rotted the way hand-kept
// lists do: five words were missing by the time the product review found
// them. So it is enumerated from `ENTRIES`, with the SAME matcher the render
// pass uses — the two can no longer disagree about what counts as prose.
//
// Two rules, mirroring the pass:
//  - a THEN/ELSE literal under a prose key is vocabulary; a string inside a
//    WHEN is data (`'used_up'` beside `then: 'Used up'`).
//  - a `{ phrase, slots }` object is a PATTERN — translated whole, filled in
//    the target language — and its pattern string is harvested like a word.
//  - a `$join` under a prose key with wordy string parts is a WELD:
//    untranslatable by any dictionary. Welds fail this harvest outright.
const matcher = matcherFor(KEYS);
const wordy = (part: string): boolean => /\p{L}/u.test(part);

type EntrySink = { word: (phrase: string, where: string) => void; weld: (part: string, where: string) => void };

// A value that SITS under a prose key: collect the words it can produce.
const collectProse = (node: unknown, where: string, sink: EntrySink): void => {
  if (typeof node === 'string') {
    // A word has a letter. '—', ' – ' and ':00' sit at prose keys as
    // punctuation and formatting, and no book should be asked for them.
    if (wordy(node)) sink.word(node, where);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) collectProse(entry, where, sink);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj['phrase'] === 'string' && typeof obj['slots'] === 'object') {
    sink.word(obj['phrase'], where);
    return;
  }
  if (typeof obj['$case'] === 'object' && obj['$case'] !== null) {
    const kase = obj['$case'] as { branches?: { then?: unknown }[]; else?: unknown };
    for (const branch of kase.branches ?? []) collectProse(branch.then, where, sink);
    collectProse(kase.else, where, sink);
    return;
  }
  if (typeof obj['$with'] === 'object' && obj['$with'] !== null) {
    collectProse((obj['$with'] as { value?: unknown }).value, where, sink);
    return;
  }
  if (typeof obj['$join'] === 'object' && obj['$join'] !== null) {
    const parts = (obj['$join'] as { parts?: unknown[] }).parts ?? [];
    for (const part of parts) {
      if (typeof part === 'string' && wordy(part)) sink.weld(part, where);
      else collectProse(part, where, sink);
    }
    return;
  }
  // $get, $eq, arithmetic — data plumbing; nothing under it is a word the
  // mapping is inventing.
};

// The generic walk: find every prose-keyed property anywhere in a mapping.
const walkMapping = (node: unknown, where: string, sink: EntrySink): void => {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) walkMapping(entry, where, sink);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (matcher.isProse(key)) collectProse(value, where, sink);
    else walkMapping(value, where, sink);
  }
};

const entryWords: HarvestedPhrase[] = [];
const welds: { part: string; where: string }[] = [];
for (const entry of ENTRIES) {
  const mapping = (entry as { mapping?: unknown }).mapping;
  if (mapping === undefined) continue;
  const where = `vex/${(entry as { fingerprint: string }).fingerprint}`;
  walkMapping(mapping, where, {
    word: (phrase, at) => entryWords.push({ phrase, where: [at] }),
    weld: (part, at) => welds.push({ part, where: at }),
  });
}

// THE AUTOMATION VOCABULARY, which lives in ROWS rather than in layouts.
//
// `automation_moments`, `automation_effects` and `automation_recipes` are
// seeded from these constants and rendered as row data — a card's title, a
// sentence fragment in the form. No walk over layouts can see them, so they
// are pulled from the source of the seed itself, which at least cannot drift.
//
// The email SUBJECT and BODY of a recipe are excluded on purpose. They reach
// the screen as `Input` values — words the studio is about to edit and save —
// and translating those would display German while saving English. Seeded
// content is the studio's to write; see the design doc's open questions.
const fromVocabulary: HarvestedPhrase[] = [
  ...MOMENTS.flatMap((moment) => [
    { phrase: moment.label, where: [`moments/${moment.id}.label`] },
    { phrase: moment.blurb, where: [`moments/${moment.id}.blurb`] },
    ...(moment.daysLabel === undefined ? [] : [{ phrase: moment.daysLabel, where: [`moments/${moment.id}.daysLabel`] }]),
  ]),
  ...EFFECTS.flatMap((effect) => [
    { phrase: effect.label, where: [`effects/${effect.id}.label`] },
    { phrase: effect.blurb, where: [`effects/${effect.id}.blurb`] },
    ...Object.entries(effect.words ?? {}).map(([key, word]) => ({ phrase: word, where: [`effects/${effect.id}.words.${key}`] })),
  ]),
  ...RECIPES.flatMap((recipe) => [
    { phrase: recipe.title, where: [`recipes/${recipe.id}.title`] },
    { phrase: recipe.why, where: [`recipes/${recipe.id}.why`] },
  ]),
].filter((entry) => typeof entry.phrase === 'string' && entry.phrase !== '');

// Strings this app composes ITSELF, server-side, from the same book. Not
// harvestable — they are built in `app.ts` rather than authored — so the
// harvest names them explicitly rather than letting them go missing silently.
const APP_COMPOSED: string[] = [
  'Good morning', 'Good afternoon', 'Good evening',
  // ROLE_LABEL in app.ts
  'Owner', 'Manager', 'Instructor', 'Front desk', 'Member', 'Automation', 'Integration',
];

// WHAT THE HARVESTER OVER-COLLECTS, and why the list is here rather than in
// nova.
//
// Harvesting an action's `data` defaults is right — a screen's opening text
// lives there ("Add a class", "Stock") — but `data` also holds enum values,
// design tokens, action ids and cache fingerprints, and nothing structural
// tells the two apart: both are strings under an arbitrary key.
//
// None of these can actually be translated by mistake. At render they land at
// keys nothing marks as prose (`Select.value`, `Badge.tone`, an endpoint's
// fingerprint), so the pass never consults the book for them. They are only
// noise in the REPORT — which matters, because a report with permanent noise
// in it stops being read.
const NOT_PROSE = new Set([
  // enum values and design tokens sitting in `data`
  'accent', 'calendar', 'confirmed', 'current', 'email', 'instructor', 'manual',
  'month', 'recipes', 'recurring', 'solid',
  // sort keys — machine values that leak from `data` defaults
  'asc', 'people.name',
  // ids and fingerprints
  'desk.followups', 'member.joined', 'people.detail', 'people/count', 'people/list',
]);

// Reads the same in every language: product names, proper nouns, and the
// example addresses in placeholders. Counted as present rather than missing —
// an identity row in the book would say the same thing and invite somebody to
// "fix" it later.
const UNIVERSAL = new Set([
  'Lyra',
  'Stock', // a theme's own name, like Sand and Charcoal
  'Ava Klein', 'Tobias Reiner',
  'ava@example.com', 'tobias@lumen.studio', 'you@studio.com',
]);

const merge = (groups: HarvestedPhrase[][]): HarvestedPhrase[] => {
  const found = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const entry of group) {
      if (entry.phrase.trim() === '') continue;
      const sites = found.get(entry.phrase);
      if (sites === undefined) found.set(entry.phrase, new Set(entry.where));
      else for (const site of entry.where) sites.add(site);
    }
  }
  return [...found.entries()]
    .map(([phrase, sites]) => ({ phrase, where: [...sites].sort() }))
    .sort((a, b) => a.phrase.localeCompare(b.phrase));
};

const listed = (phrases: string[], where: string): HarvestedPhrase[] =>
  phrases.map((phrase) => ({ phrase, where: [where] }));

const all = merge([fromActions, fromNav, fromVocabulary, entryWords, listed(APP_COMPOSED, 'app.ts')]).filter(
  (entry) => !NOT_PROSE.has(entry.phrase) && !UNIVERSAL.has(entry.phrase),
);

// A phrase carrying a digit is almost always assembled rather than fixed
// ("12 of 20", "3 left") — unbounded cardinality, so a dictionary can never
// hold it and reporting it as missing is noise. Those are handled at their
// point of assembly instead (`format.prism.ts`).
const fixed = all.filter((entry) => !/\d/.test(entry.phrase));
const assembled = all.filter((entry) => /\d/.test(entry.phrase));

const locale = process.argv.find((arg) => /^[a-z]{2}(-[A-Z]{2})?$/.test(arg)) ?? 'de-AT';
const book: Record<string, string> = locale.startsWith('de') ? GERMAN : {};
const missing = missingFrom(fixed, book);

if (process.argv.includes('--emit')) {
  // A skeleton to fill in — source on the left, empty on the right.
  for (const entry of missing) console.log(`  ${JSON.stringify(entry.phrase)}: '',`);
  process.exit(0);
}

console.log(`\nphrases this application can show: ${String(all.length)}`);
console.log(`  fixed (translatable):    ${String(fixed.length)}`);
console.log(`  assembled (formatted):   ${String(assembled.length)}  — handled by $locale* ops, not the book`);

// A weld is not a missing translation — it is a phrase NO book can ever
// hold, because the words were glued around a value in the source language.
// Counted phrases are patterns; a weld is the bug the pattern op exists for.
if (welds.length > 0) {
  console.log(`\n\x1b[31m${String(welds.length)} welded fragment(s) — untranslatable by construction\x1b[0m`);
  for (const weld of welds) console.log(`  ${JSON.stringify(weld.part)}  \x1b[90m${weld.where}\x1b[0m`);
  process.exit(1);
}

console.log(`\n${locale}: ${String(fixed.length - missing.length)}/${String(fixed.length)} translated`);

if (missing.length > 0) {
  console.log(`\n\x1b[31m${String(missing.length)} missing\x1b[0m`);
  for (const entry of missing.slice(0, 40)) {
    console.log(`  ${JSON.stringify(entry.phrase)}  \x1b[90m${entry.where[0] ?? ''}\x1b[0m`);
  }
  if (missing.length > 40) console.log(`  … and ${String(missing.length - 40)} more`);
  process.exit(1);
}

console.log(`\n\x1b[32mOK — every fixed phrase has a ${locale} translation.\x1b[0m`);
