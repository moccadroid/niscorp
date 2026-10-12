import { CAST } from '@lyra/db/seed';
import { bookOverWire, forgetBooks } from '@lyra/app/app';
import { asPrincipal, login, ok, report, runtime, servedTo, sessionFor, settle, treeOf, wireFor } from './world';

const maren = await login(CAST.lumen.owner);
const dario = await login(CAST.northrock.owner);
await settle();

// What each terminal is sent, not what the shell holds: the language pass runs
// between flatten and serialize inside moss, so a tree read straight from nova
// is always the source language.
const german = await servedTo(CAST.lumen.owner);
const english = await servedTo(CAST.northrock.owner);

ok('the German shell is served German chrome', german.includes('Personen'), 'People → Personen');
ok('...and the English one is not', !english.includes('Personen') && english.includes('People'));
ok('the German shell has no English left in its nav', !german.includes('"People"') && !german.includes('Check in'));
ok('a composed greeting is German too', german.includes('Guten '), 'app.ts builds it from the same book');

ok('a role label is translated', german.includes('Inhaber'), 'Owner → Inhaber');

ok('a studio name is left alone', german.includes('Lumen Yoga'));
ok('a person name is left alone', german.includes('Maren'), 'no key marks person_name as prose');

// Intl separates a number from its unit with a non-breaking space (U+00A0) or a
// narrow one (U+202F), never a plain one.
const flat = (text: string): string => text.replace(/[  ]/g, " ");
const lumenPrices = flat(JSON.stringify(await asPrincipal(CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'offerings/on-sale', context: {} })));
const northPrices = flat(JSON.stringify(await asPrincipal(CAST.northrock.owner, '/api/studio/vex', { fingerprint: 'offerings/on-sale', context: {} })));

ok('German money reads 89,00 €', /\d+,\d\d €/.test(lumenPrices), lumenPrices.match(/[\d.,]+ €/)?.[0] ?? lumenPrices.slice(0, 120));
ok('...and English money reads €89.00', /€\d+\.\d\d/.test(northPrices), northPrices.match(/€[\d.,]+/)?.[0] ?? northPrices.slice(0, 120));
ok('neither wears the other’s format', !/\d+,\d\d €/.test(northPrices) && !/€\d+\.\d\d/.test(lumenPrices));

const lumenWeek = JSON.stringify(await asPrincipal(CAST.lumen.owner, '/api/schedule/vex', { fingerprint: 'schedule/upcoming', context: {} }));
ok('a German weekday is abbreviated in German', /"(Mo|Di|Mi|Do|Fr|Sa|So)\.?[ ,]/.test(lumenWeek) || /Mär|Jän|Dez|Okt/.test(lumenWeek), lumenWeek.slice(0, 160));

const idsIn = (tree: string): string[] => [...tree.matchAll(/"definitionId":"([^"]+)"/g)].map((m) => m[1] ?? '').sort();
ok('both languages run the identical action set', JSON.stringify(idsIn(german)) === JSON.stringify(idsIn(english)), idsIn(german).join(', ') || 'same set');

const bookOf = async (language: string): Promise<number> => Object.keys(await bookOverWire(wireFor(CAST.northrock.owner), language)).length;
ok('de selects the de book', (await bookOf('de')) > 400, `${String(await bookOf('de'))} phrases`);
ok('an unknown language gets the source, not a mixture', (await bookOf('fr')) === 0);
ok('the source language holds no rows', (await bookOf('en')) === 0, 'nothing about it needs translating');
ok('a regional tag is not a language here', (await bookOf('de-AT')) === 0, 'nothing widens a tag any more');

const oneWire = wireFor(CAST.northrock.owner);
const otherWire = wireFor(CAST.lumen.owner);
const first = await bookOverWire(oneWire, 'de');
const second = await bookOverWire(otherWire, 'de');
ok('two shells reading German get the SAME book, not a copy each', first === second, `${String(Object.keys(first).length)} rows, one object`);
ok('...and a different language is a different book', (await bookOverWire(oneWire, 'fr')) !== first);

ok('...and it is frozen, because it is shared', Object.isFrozen(first));

forgetBooks();
const refolded = await bookOverWire(oneWire, 'de');
ok('...and dropping it refolds from the rows', refolded !== first && Object.keys(refolded).length === Object.keys(first).length, `${String(Object.keys(refolded).length)} rows again, a new object`);

maren.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.settings' });
await settle(14);
const offered = [...treeOf(maren).matchAll(/\{"value":"([a-z-]{2,5})","label":"([^"]+)"\}/g)].map((m) => `${m[1] ?? ''} → ${m[2] ?? ''}`);
ok('the picker offers one entry per language, not one per country', offered.length === 2, offered.join(' · ') || '(no options on the screen)');
ok('...each named in its own language', offered.includes('en → English') && offered.includes('de → Deutsch'), offered.join(' · '));

const before = String((await runtime.db.query<{ l: string }>("SELECT locale l FROM studios WHERE id='st_northrock'")).rows[0]?.l ?? '');
const switched = await asPrincipal(CAST.northrock.owner, '/api/studio/vex', {
  fingerprint: 'studio/set-language',
  context: { studioId: 'st_northrock', locale: 'de' },
});
void switched;
const row = await runtime.db.query<{ l: string }>("SELECT locale l FROM studios WHERE id='st_northrock'");
ok('the owner can change the language', before === 'en' && row.rows[0]?.l === 'de', `${before} → ${row.rows[0]?.l ?? '?'}`);

const forged = await asPrincipal(CAST.northrock.owner, '/api/studio/vex', {
  fingerprint: 'studio/set-language',
  context: { studioId: 'st_lumen', locale: 'en' },
});
void forged;
const lumenStill = await runtime.db.query<{ l: string }>("SELECT locale l FROM studios WHERE id='st_lumen'");
ok('...but not somebody else’s', lumenStill.rows[0]?.l === 'de', lumenStill.rows[0]?.l ?? '?');

const asDesk = await asPrincipal(CAST.lumen.desk, '/api/studio/vex', {
  fingerprint: 'studio/set-language',
  context: { studioId: 'st_lumen', locale: 'en' },
});
ok('the desk cannot change the studio’s language', JSON.stringify(asDesk).includes('status'), JSON.stringify(asDesk));

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

const screenFor = async (action: string): Promise<string> => {
  maren.dispatch({ type: 'ui:click', ref: 'nav', payload: action });
  await settle(12);
  return servedTo(CAST.lumen.owner);
};

// Probed at the label position, not anywhere in the frame: `Calendar` is also a component's name.
const englishLabel = (frame: string, ...words: string[]): boolean => words.some((word) => frame.includes(`"label":"${word}"`));

const people = await screenFor('people.list');
ok(
  'the People lenses are German',
  ['Aktuell', 'Ehemalige', 'Alle'].every((word) => people.includes(word)),
  'Current · Past · Everyone — the strip, once it stopped carrying three axes at once',
);
ok('...with no English left in the strip', !englishLabel(people, 'Current', 'Past', 'Everyone'));
ok(
  'and so is what they hold',
  ['Eine Mitgliedschaft', 'Eine Blockkarte', 'Noch nichts'].every((word) => people.includes(word)),
  'A membership · A pass · Nothing yet — the second question, in the reader’s language',
);
ok('...with no English left there either', !englishLabel(people, 'A membership', 'A pass', 'Nothing yet', 'Anything'));
ok(
  '...and the VALUES are untouched',
  people.includes('"current"') && people.includes('"membership"'),
  'proseness is the key, not the neighbourhood — and it holds on both controls',
);

const automations = await screenFor('automations.list');
ok('the Automations tabs are German', automations.includes('Vorlagen') && automations.includes('Läuft'), 'Recipes → Vorlagen, the same word every sentence about them already used, beside a Running that was in the book all along');
ok('...with no English left in the strip', !englishLabel(automations, 'Recipes', 'Running'));

const schedule = await screenFor('schedule.timetable');
ok('the Schedule views are German', schedule.includes('Kalender') && schedule.includes('Liste'), 'the third screen — found by the widened harvest, not by the review');
ok('...with no English left in the strip', !englishLabel(schedule, 'Calendar', 'List'));

const session = await sessionFor(CAST.lumen.owner);
const sent: string[] = [];
const wire = { send: (text: string) => sent.push(text), close: () => undefined, onMessage: () => undefined, onClose: () => undefined };
session.attach(wire);
await settle(15);
const seen = (): string => sent.join(String.fromCharCode(10));
ok('an attached terminal is served German to begin with', seen().includes('Personen'));

session.shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.settings' });
await settle(20);
sent.length = 0;
session.shell.dispatch({ type: 'ui:model', ref: 'language', payload: 'en' });
await settle(60);

const after = seen();
const locale = await runtime.db.query<{ locale: string }>("SELECT locale FROM studios WHERE id='st_lumen'");
ok('...the write lands', String(locale.rows[0]?.locale ?? '') === 'en');
ok('...and the SAME socket is served the new language', after.includes('"People"'), `${String(sent.length)} frames after the switch`);
ok('...with the old one gone from it', !after.includes('Personen'), 'a rebuild that kept the cached identity would send German again and report success');

report('one deployment, two languages, nothing shared but the rows');
