import { harvestDefinitions, matcherFor, missingFrom } from '@niscorp/nova/i18n';
import type { HarvestedPhrase } from '@niscorp/nova/i18n';
import { CATALOG_DEFINITIONS } from '@lyra/app/action-catalog';
import { PHRASE_KEYS } from '@lyra/app/phrase-keys';
import { AREAS } from '@lyra/app/nav/sections';
import { EFFECTS, MOMENTS } from '@lyra/app/reflexes/compose';
import { RECIPES } from '@lyra/app/reflexes/recipes';
import { ENTRIES } from '@lyra/app/vex';
import { GERMAN } from '@lyra/db/phrases.de';

const KEYS = PHRASE_KEYS;

const fromActions = harvestDefinitions(CATALOG_DEFINITIONS, KEYS);

const fromNav: HarvestedPhrase[] = AREAS.flatMap((area) => [
  { phrase: area.label, where: [`nav/${area.id}.label`] },
  { phrase: area.blurb, where: [`nav/${area.id}.blurb`] },
  ...area.items.flatMap((item) => [
    { phrase: item.label, where: [`nav/${area.id}/${item.action}.label`] },
    { phrase: item.blurb, where: [`nav/${area.id}/${item.action}.blurb`] },
  ]),
]);

const matcher = matcherFor(KEYS);
const wordy = (part: string): boolean => /\p{L}/u.test(part);

type EntrySink = { word: (phrase: string, where: string) => void; weld: (part: string, where: string) => void };

const collectProse = (node: unknown, where: string, sink: EntrySink): void => {
  if (typeof node === 'string') {
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
  // `$get`, `$eq` and arithmetic are data plumbing: nothing under them is a word.
};

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

// A recipe's email subject and body are left out: the studio edits and saves
// them as `Input` values, so translating them would show German and save English.
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

const APP_COMPOSED: string[] = [
  'Good morning', 'Good afternoon', 'Good evening',
  'Owner', 'Manager', 'Instructor', 'Front desk', 'Member', 'Automation', 'Integration',
];

// `data` defaults also hold enum values, tokens, ids and fingerprints, which
// nothing structural tells from prose. Listed to keep them out of the report.
const NOT_PROSE = new Set([
  'accent', 'any', 'calendar', 'confirmed', 'current', 'email', 'instructor', 'manual',
  'month', 'recipes', 'recurring', 'solid',
  'asc', 'people.name',
  'desk.followups', 'member.joined', 'people.detail', 'people/count', 'people/list',
  'roll/current',
]);

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

const fixed = all.filter((entry) => !/\d/.test(entry.phrase));
const assembled = all.filter((entry) => /\d/.test(entry.phrase));

const locale = process.argv.find((arg) => /^[a-z]{2}$/.test(arg)) ?? 'de';
const book: Record<string, string> = locale === 'de' ? GERMAN : {};
const missing = missingFrom(fixed, book);

if (process.argv.includes('--emit')) {
  for (const entry of missing) console.log(`  ${JSON.stringify(entry.phrase)}: '',`);
  process.exit(0);
}

console.log(`\nphrases this application can show: ${String(all.length)}`);
console.log(`  fixed (translatable):    ${String(fixed.length)}`);
console.log(`  assembled (formatted):   ${String(assembled.length)}  — handled by $locale* ops, not the book`);

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
