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
import { harvestDefinitions, missingFrom } from '@niscorp/nova/i18n';
import type { HarvestedPhrase } from '@niscorp/nova/i18n';
import { DEFAULT_PHRASE_KEYS } from '@niscorp/nova/i18n';
import { CATALOG_DEFINITIONS } from '@lyra/app/action-catalog';
import { AREAS } from '@lyra/app/nav/sections';
import { EFFECTS, MOMENTS } from '@lyra/app/reflexes/compose';
import { RECIPES } from '@lyra/app/reflexes/recipes';
import { GERMAN } from '@lyra/db/phrases.de';

const KEYS = { props: [...DEFAULT_PHRASE_KEYS.props, 'role'], suffixes: ['_display'] };

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

// Words a READ manufactures. These live in vex mappings (`standing.ts`,
// `format.prism.ts`) and land on `*_display` fields, where the render pass
// picks them up — but no walk over layouts can find them, because they are
// authored inside a query rather than inside a screen.
//
// Closed sets only. A formatted date or amount is NOT here and never will be:
// those are handled at their source by `$localeDate` / `$localeMoney`.
const FROM_READS: string[] = [
  // standing.ts — the one vocabulary for what a person IS to a studio
  'Staff', 'On trial', 'Active', 'Paused', 'Pass holder', 'On a course', 'Trial over', 'Contact', 'Left', 'Prospect',
  // format.prism.ts
  'Cancelled',
  // subscription.entries.ts — how somebody pays and on what terms
  'Monthly', 'Rolling', 'Notice given', 'Card', 'Cash', 'Transfer', 'Direct debit',
];

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

const all = merge([fromActions, fromNav, fromVocabulary, listed(FROM_READS, 'reads'), listed(APP_COMPOSED, 'app.ts')]).filter(
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
