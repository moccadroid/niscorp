// Run: pnpm --filter lyra exec tsx src/dev/language-check.ts
//
// ONE DEPLOYMENT, TWO LANGUAGES, and nothing between them.
//
// Lumen reads de-AT and North Rock reads en-GB (seed.ts). Both run the same
// actions over the same rows, so every assertion here is really the same
// question: does a language reach the glass without any action, layout or
// component knowing it exists?
import { CAST } from '@lyra/db/seed';
import { phrasesFor } from '@lyra/server/phrases';
import { studioLocale } from '@lyra/server/users';
import { asPrincipal, login, ok, report, runtime, servedTo, settle } from './world';

const maren = login(CAST.lumen.owner); // de-AT
const dario = login(CAST.northrock.owner); // en-GB
await settle();

// What each terminal is actually SENT — not what the shell holds. The language
// pass runs between flatten and serialize inside moss, so a tree read straight
// from nova is always the source language, whoever is reading it.
const german = servedTo(CAST.lumen.owner);
const english = servedTo(CAST.northrock.owner);

// ── the words ────────────────────────────────────────────────
ok('the German shell is served German chrome', german.includes('Personen'), 'People → Personen');
ok('...and the English one is not', !english.includes('Personen') && english.includes('People'));
ok('the German shell has no English left in its nav', !german.includes('"People"') && !german.includes('Check in'));
ok('a composed greeting is German too', german.includes('Guten '), 'app.ts builds it from the same book');

// The identity card renders a role LABEL, which only translates because app.ts
// declared `role` a prose key.
ok('a role label is translated', german.includes('Inhaber'), 'Owner → Inhaber');

// ── what must NOT be translated ──────────────────────────────
//
// The guard rail for keying a dictionary on source strings: proseness is
// decided by the KEY, never by a value matching something in the book.
ok('a studio name is left alone', german.includes('Lumen Yoga'));
ok('a person name is left alone', german.includes('Maren'), 'no key marks person_name as prose');

// ── the money and the dates ──────────────────────────────────
//
// Not translation at all — `Intl` given the studio's own tag. Austrian German
// leads with the symbol and separates decimals with a comma; en-GB does
// neither. Both read the same rows through the same entries.
// Intl separates a number from its unit with a non-breaking space (U+00A0) or a
// narrow one (U+202F), never a plain one. Comparing against " " is how a test
// like this passes on one Node build and fails on the next.
const flat = (text: string): string => text.replace(/[  ]/g, " ");
const lumenPrices = flat(JSON.stringify(await asPrincipal(CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'offerings/on-sale', context: {} })));
const northPrices = flat(JSON.stringify(await asPrincipal(CAST.northrock.owner, '/api/studio/vex', { fingerprint: 'offerings/on-sale', context: {} })));

ok('Austrian money reads € 89,00', /€ \d+,\d\d/.test(lumenPrices), lumenPrices.match(/€ [\d.,]+/)?.[0] ?? lumenPrices.slice(0, 120));
ok('...and British money reads €89.00', /€\d+\.\d\d/.test(northPrices), northPrices.match(/€[\d.,]+/)?.[0] ?? northPrices.slice(0, 120));
ok('neither wears the other’s format', !/€ \d+,\d\d/.test(northPrices) && !/€\d+\.\d\d/.test(lumenPrices));

// A date crosses the same seam, from the same entry, via `$.scope.locale`.
const lumenWeek = JSON.stringify(await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', { fingerprint: 'schedule/upcoming', context: {} }));
ok('a German weekday is abbreviated in German', /"(Mo|Di|Mi|Do|Fr|Sa|So)\.?[ ,]/.test(lumenWeek) || /Mär|Jän|Dez|Okt/.test(lumenWeek), lumenWeek.slice(0, 160));

// ── the pass is a pass, not a rewrite ────────────────────────
//
// Same actions, same instances. If a language changed WHICH screens exist,
// something branched on it somewhere and rule 11 has been broken.
const idsIn = (tree: string): string[] => [...tree.matchAll(/"definitionId":"([^"]+)"/g)].map((m) => m[1] ?? '').sort();
ok('both languages run the identical action set', JSON.stringify(idsIn(german)) === JSON.stringify(idsIn(english)), idsIn(german).join(', ') || 'same set');

// ── the book resolves by language, the format by region ──────
ok('de-AT falls back to the de book', Object.keys(phrasesFor('de-AT')).length > 400, `${String(Object.keys(phrasesFor('de-AT')).length)} phrases`);
ok('an unknown language gets the source, not a mixture', Object.keys(phrasesFor('fr-FR')).length === 0);
ok('the source language holds no rows', Object.keys(phrasesFor('en-GB')).length === 0, 'nothing about it needs translating');

// ── switching ────────────────────────────────────────────────
const before = studioLocale('st_northrock');
const switched = await asPrincipal(CAST.northrock.owner, '/api/studio/vex', {
  fingerprint: 'studio/set-language',
  context: { studioId: 'st_northrock', locale: 'de-AT' },
});
void switched;
const row = await runtime.db.query<{ l: string }>("SELECT locale l FROM studios WHERE id='st_northrock'");
ok('the owner can change the language', before === 'en-GB' && row.rows[0]?.l === 'de-AT', `${before} → ${row.rows[0]?.l ?? '?'}`);

// ...and nobody else can. The engine ANDs its own studio match onto the
// authored one, so naming a foreign row selects nothing.
const forged = await asPrincipal(CAST.northrock.owner, '/api/studio/vex', {
  fingerprint: 'studio/set-language',
  context: { studioId: 'st_lumen', locale: 'en-GB' },
});
void forged;
const lumenStill = await runtime.db.query<{ l: string }>("SELECT locale l FROM studios WHERE id='st_lumen'");
ok('...but not somebody else’s', lumenStill.rows[0]?.l === 'de-AT', lumenStill.rows[0]?.l ?? '?');

const asDesk = await asPrincipal(CAST.lumen.desk, '/api/studio/vex', {
  fingerprint: 'studio/set-language',
  context: { studioId: 'st_lumen', locale: 'en-GB' },
});
ok('the desk cannot change the studio’s language', JSON.stringify(asDesk).includes('status'), JSON.stringify(asDesk));

report('one deployment, two languages, nothing shared but the rows');
