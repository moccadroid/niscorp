// Run: pnpm --filter lyra exec tsx src/dev/language-check.ts
//
// ONE DEPLOYMENT, TWO LANGUAGES, and nothing between them.
//
// Lumen reads de-AT and North Rock reads en-GB (seed.ts). Both run the same
// actions over the same rows, so every assertion here is really the same
// question: does a language reach the glass without any action, layout or
// component knowing it exists?
import { CAST } from '@lyra/db/seed';
import { bookOverWire, forgetBooks } from '@lyra/app/app';
import { asPrincipal, login, ok, report, runtime, servedTo, settle, wireFor } from './world';

const maren = await login(CAST.lumen.owner); // de-AT
const dario = await login(CAST.northrock.owner); // en-GB
await settle();

// What each terminal is actually SENT — not what the shell holds. The language
// pass runs between flatten and serialize inside moss, so a tree read straight
// from nova is always the source language, whoever is reading it.
const german = await servedTo(CAST.lumen.owner);
const english = await servedTo(CAST.northrock.owner);

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
// Read exactly as a shell reads it: the entries, over a session's own wire.
const bookOf = async (locale: string): Promise<number> => Object.keys(await bookOverWire(wireFor(CAST.northrock.owner), locale)).length;
ok('de-AT falls back to the de book', (await bookOf('de-AT')) > 400, `${String(await bookOf('de-AT'))} phrases`);
ok('an unknown language gets the source, not a mixture', (await bookOf('fr-FR')) === 0);
ok('the source language holds no rows', (await bookOf('en-GB')) === 0, 'nothing about it needs translating');

// ── one book per language, not one per shell ─────────────────
//
// Every de-AT shell used to fold and KEEP its own copy of ~560 rows: 66 KB of
// strings identical in every shell in the deployment, which is most of what
// took per-shell birth cost from 80.6 to 138.8 KB when this application learned
// a second language. The fold is derived from the language alone, so the answer
// is shared — and the assertion is object IDENTITY, because "same contents" is
// what the code did before and it is exactly what cost the memory.
const oneWire = wireFor(CAST.northrock.owner);
const otherWire = wireFor(CAST.lumen.owner);
const first = await bookOverWire(oneWire, 'de-AT');
const second = await bookOverWire(otherWire, 'de-AT');
ok('two shells reading German get the SAME book, not a copy each', first === second, `${String(Object.keys(first).length)} rows, one object`);
ok('...and a different language is a different book', (await bookOverWire(oneWire, 'fr-FR')) !== first);

// Shared means every reader holds this exact object, so a mutation would edit a
// language for everybody at once. Frozen, so that is a throw and not a mystery.
ok('...and it is frozen, because it is shared', Object.isFrozen(first));

// Held, but never stale: dropping it must rebuild from the rows rather than
// hand back the same object forever.
forgetBooks();
const refolded = await bookOverWire(oneWire, 'de-AT');
ok('...and dropping it refolds from the rows', refolded !== first && Object.keys(refolded).length === Object.keys(first).length, `${String(Object.keys(refolded).length)} rows again, a new object`);

// ── switching ────────────────────────────────────────────────
const before = String((await runtime.db.query<{ l: string }>("SELECT locale l FROM studios WHERE id='st_northrock'")).rows[0]?.l ?? '');
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

// ── the words a READ manufactures reach the glass ────────────
//
// The three holes the product review filed together: `_label` keys never
// declared prose, Field values losing their key at binding, and counted
// phrases welded in English. One German member, three screens.
const ava = await login(CAST.lumen.member);
await settle(10);
ok('a German member is Gebucht, never Booked', (await servedTo(CAST.lumen.member)).includes('Gebucht'), 'state_label — the _label suffix, declared at last');

ava.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.membership' });
await settle(12);
const membershipFrame = await servedTo(CAST.lumen.member);
ok('how she pays renders German', membershipFrame.includes('Vom Studio abgerechnet'), 'paid_via_display through the Field phrase prop — the value was in the book all along');

ava.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.classes' });
await settle(12);
const classesFrame = await servedTo(CAST.lumen.member);
ok('a German count reads 1 von 12 — one book row, filled', /\d+ von \d+/.test(classesFrame), classesFrame.match(/\d+ von \d+/)?.[0] ?? '(no filled pattern in the frame)');

// ── words that live in an action's DATA ──────────────────────
//
// A tab strip is authored as `data.views` and bound into the layout, so its
// labels are on a screen without being in one. The pass always translated
// them — `label` is a prose key at any depth — but the HARVEST could not see
// them, so the book was missing rows while the gate read 548/548 green.
// A count that cannot see a screen is worse than a low count, and these three
// screens are the ones it could not see.
//
// Asserted through the served frame rather than through the harvest on
// purpose: the harvest proves the words are COUNTED, and only a rendered
// German screen proves they are SWAPPED.
const screenFor = async (action: string): Promise<string> => {
  maren.dispatch({ type: 'ui:click', ref: 'nav', payload: action });
  await settle(12);
  return servedTo(CAST.lumen.owner);
};

// Probed at the LABEL position rather than anywhere in the frame: `Calendar`
// is also a component's name, and a check that greps the whole payload for a
// word fails on the kit rather than on the copy.
const englishLabel = (frame: string, ...words: string[]): boolean => words.some((word) => frame.includes(`"label":"${word}"`));

const people = await screenFor('people.list');
ok(
  'the People lenses are German — all nine of them',
  ['Aktuell', 'Interessenten', 'Kontakte', 'Ehemalige', 'Alle'].every((word) => people.includes(word)),
  'Current · Prospects · Contacts · Past · Everyone — the five that rendered English while the harvest read green',
);
ok('...with no English left in the strip', !englishLabel(people, 'Current', 'Prospects', 'Contacts', 'Past', 'Everyone'));
// THE OTHER HALF OF THE SAME RULE: the option's `value` is machine vocabulary
// and must survive untouched, or picking a lens stops working in German.
ok('...and the lens VALUES are untouched', people.includes('"current"') && people.includes('"prospects"'), 'proseness is the key, not the neighbourhood');

const automations = await screenFor('automations.list');
ok('the Automations tabs are German', automations.includes('Rezepte') && automations.includes('Läuft'), 'Recipes → Rezepte, beside a Running that was in the book all along');
ok('...with no English left in the strip', !englishLabel(automations, 'Recipes', 'Running'));

const schedule = await screenFor('schedule.timetable');
ok('the Schedule views are German', schedule.includes('Kalender') && schedule.includes('Liste'), 'the third screen — found by the widened harvest, not by the review');
ok('...with no English left in the strip', !englishLabel(schedule, 'Calendar', 'List'));

report('one deployment, two languages, nothing shared but the rows');
