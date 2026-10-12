import { CAST } from '@lyra/db/seed';
import { asPrincipal, ok, report } from './world';

const read = (fp: string, context: Record<string, unknown>, path = '/api/staff/vex'): Promise<unknown> =>
  asPrincipal(CAST.lumen.owner, path, { fingerprint: fp, context });

const STUDIO = '/api/studio/vex';

const col = (rows: unknown, key: string): unknown[] =>
  Array.isArray(rows) ? rows.map((r) => (r as Record<string, unknown>)[key]) : [];

const refused = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && 'status' in value;

const authored = col(await read('staff/list', { q: '%', sortBy: '', sortDir: 'asc' }), 'person_name');
ok('an empty sortBy leaves the authored order alone', authored.length > 1 && String(authored[0]) < String(authored[authored.length - 1]), authored.join(', '));

const reversed = col(await read('staff/list', { q: '%', sortBy: 'people.name', sortDir: 'desc' }), 'person_name');
ok('...and sortDir turns it over', JSON.stringify(reversed) === JSON.stringify([...authored].reverse()), reversed.join(', '));

const byRole = col(await read('staff/list', { q: '%', sortBy: 'staff.role', sortDir: 'asc' }), 'person_name');
ok('...and a different column re-orders it', JSON.stringify(byRole) !== JSON.stringify(authored), byRole.join(', '));

const priced = col(await read('offerings/list', { sortBy: 'offerings.price_cents', sortDir: 'desc' }, STUDIO), 'price_cents');
const descending = priced.every((v, i) => i === 0 || Number(priced[i - 1]) >= Number(v));
ok('the price list sorts by a number, high to low', priced.length > 1 && descending, priced.join(', '));

const foreign = await read('offerings/list', { sortBy: 'subscriptions.monthly_cents', sortDir: 'asc' }, STUDIO);
ok('sorting by a table the entry does not join is refused', refused(foreign), JSON.stringify(foreign).slice(0, 80));

const invented = await read('offerings/list', { sortBy: 'offerings.definitely_not_a_column', sortDir: 'asc' }, STUDIO);
ok('...as is a column that does not exist', refused(invented), JSON.stringify(invented).slice(0, 80));

// `sortBy` is written into the ORDER BY, never bound as a parameter.
const injected = await read('offerings/list', { sortBy: 'offerings.name; DROP TABLE offerings', sortDir: 'asc' }, STUDIO);
ok('...and so is a statement wearing a column’s name', refused(injected), JSON.stringify(injected).slice(0, 80));

const survived = await read('offerings/list', { sortBy: '', sortDir: 'asc' }, STUDIO);
ok('...with the table still standing', Array.isArray(survived) && survived.length > 0, 'refused, not executed');

report('sorting is a context value, not a fingerprint — and the columns a caller may name are the ones the entry already reads.');
