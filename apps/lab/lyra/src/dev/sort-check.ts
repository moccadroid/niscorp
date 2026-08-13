// Run: pnpm --filter lyra exec tsx src/dev/sort-check.ts
//
// SORTING COSTS NO FINGERPRINT. `sortBy`/`sortDir` are reserved context keys:
// vex reads them straight into the ORDER BY rather than binding them as
// parameters, and resolves `sortBy` through the same path that resolves any
// field — so the allowlist is "a real column of a table this entry already
// joins", enforced by the resolver rather than by a list somebody maintains.
//
// That is the whole reason a sortable column is not a second entry. This check
// exists because the property it rests on is a REFUSAL, and a refusal nobody
// tests is a refusal nobody knows they lost.
import { CAST } from '@lyra/db/seed';
import { asPrincipal, ok, report } from './world';

const read = (fp: string, context: Record<string, unknown>, path = '/api/staff/vex'): Promise<unknown> =>
  asPrincipal(CAST.lumen.owner, path, { fingerprint: fp, context });

const STUDIO = '/api/studio/vex';

const col = (rows: unknown, key: string): unknown[] =>
  Array.isArray(rows) ? rows.map((r) => (r as Record<string, unknown>)[key]) : [];

const refused = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && 'status' in value;

// ── the entry's own order is the default ──
const authored = col(await read('staff/list', { q: '%', sortBy: '', sortDir: 'asc' }), 'person_name');
ok('an empty sortBy leaves the authored order alone', authored.length > 1 && String(authored[0]) < String(authored[authored.length - 1]), authored.join(', '));

// ── and a caller can turn it over ──
const reversed = col(await read('staff/list', { q: '%', sortBy: 'people.name', sortDir: 'desc' }), 'person_name');
ok('...and sortDir turns it over', JSON.stringify(reversed) === JSON.stringify([...authored].reverse()), reversed.join(', '));

// A column the list SHOWS but was not authored to sort by — the point of the
// feature: every column of every joined table is reachable without a new entry.
const byRole = col(await read('staff/list', { q: '%', sortBy: 'staff.role', sortDir: 'asc' }), 'person_name');
ok('...and a different column re-orders it', JSON.stringify(byRole) !== JSON.stringify(authored), byRole.join(', '));

// ── across a second entry, on a second endpoint ──
const priced = col(await read('offerings/list', { sortBy: 'offerings.price_cents', sortDir: 'desc' }, STUDIO), 'price_cents');
const descending = priced.every((v, i) => i === 0 || Number(priced[i - 1]) >= Number(v));
ok('the price list sorts by a number, high to low', priced.length > 1 && descending, priced.join(', '));

// ── THE ALLOWLIST IS THE SCHEMA ──
//
// Not a list of permitted sort keys — the resolver simply cannot resolve a
// path that is not a column of a table in this entry's `from`. A caller may
// re-order what they are already allowed to read, and may not name anything
// else: no reaching into another table, no inventing a column, and nothing
// that is not a field path at all.
const foreign = await read('offerings/list', { sortBy: 'subscriptions.monthly_cents', sortDir: 'asc' }, STUDIO);
ok('sorting by a table the entry does not join is refused', refused(foreign), JSON.stringify(foreign).slice(0, 80));

const invented = await read('offerings/list', { sortBy: 'offerings.definitely_not_a_column', sortDir: 'asc' }, STUDIO);
ok('...as is a column that does not exist', refused(invented), JSON.stringify(invented).slice(0, 80));

// `sortBy` is never bound as a parameter — it is read into the ORDER BY — so
// this is the one place the reserved keys could have been an injection seam.
// It is not: the value has to RESOLVE to a column before it is ever written.
const injected = await read('offerings/list', { sortBy: 'offerings.name; DROP TABLE offerings', sortDir: 'asc' }, STUDIO);
ok('...and so is a statement wearing a column’s name', refused(injected), JSON.stringify(injected).slice(0, 80));

const survived = await read('offerings/list', { sortBy: '', sortDir: 'asc' }, STUDIO);
ok('...with the table still standing', Array.isArray(survived) && survived.length > 0, 'refused, not executed');

report('sorting is a context value, not a fingerprint — and the columns a caller may name are the ones the entry already reads.');
