// Run: pnpm --filter lyra exec tsx src/dev/families-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, mintToken, ok, report, runtime } from './world';

// ═══════════════════════════════════════════════════════════════
// A PARENT ACTING FOR A CHILD.
//
// The three sentences docs/plans/lyra-families.md §8.7 said to write before
// the code, in the order it said to write them:
//
//   1. a parent books for their child; the booking's person_id is the
//      CHILD'S, not the parent's
//   2. a parent reads NOTHING of an unrelated member
//   3. a member with no children sees precisely what they saw before
//
// The third is the regression guard for the entire existing member surface,
// and it is the one that should be hardest to break — the family surface is
// new entries at a new reach, so nothing a childless member touches changed.
// ═══════════════════════════════════════════════════════════════

// Params, never interpolation — `sql-check` enforces it here as well as in the
// application, and a check that splices values is a check teaching the habit
// it exists to catch.
const count = async (sql: string, params: unknown[] = []): Promise<number> =>
  Number((await runtime.db.query<{ n: string }>(sql, params)).rows[0]?.n ?? -1);
const rows = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// ── the seed says what it should ─────────────────────────────

ok(
  'the seed has a parent with two children at one studio',
  (await count("SELECT count(*) n FROM guardianships WHERE guardian_person_id = 'p_ava'")) === 2,
  'one guardian, two children — the shape a scalar household id could not express',
);

ok(
  '...and neither child can be signed in as',
  (await mintToken('emma.klein@example.com')) === null && (await count('SELECT count(*) n FROM people WHERE id IN (\'p_emma\',\'p_tomk\') AND email IS NULL')) === 2,
  'no address, so no link — the refusal is SQL’s, not a guard somebody remembered',
);

ok(
  '...and they are on the roll like anybody else',
  (await count("SELECT count(*) n FROM studio_people WHERE person_id IN ('p_emma','p_tomk')")) === 2,
  'a child is a record the studio knows, not a category',
);

// ── 1. the write subject ─────────────────────────────────────
//
// THE ONE THAT MATTERS. `me/book-for` sends only a session and a subject; the
// child's person_id is resolved by the engine inside a $lookup on
// guardianships. If that ever re-pins to the caller, this is where it shows.

const freeSession = String(
  (await runtime.db.query<{ id: string }>(
    "SELECT cs.id FROM class_sessions cs WHERE cs.studio_id = 'st_lumen' AND cs.held_on >= studio_today('st_lumen') AND cs.status <> 'cancelled' AND cs.booked_count < cs.capacity AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = cs.id AND b.person_id = 'p_emma') ORDER BY cs.held_on LIMIT 1",
  )).rows[0]?.id ?? '',
);

ok('the seed has a class with room in it', freeSession !== '', freeSession);

// AVA'S OWN COUNT, BEFORE. Measured as a delta rather than asserted at zero:
// she is a member of nine years and may already hold a seat in this very class
// from the seed. What must not change is that number — a booking made FOR
// Emma must not land on Ava, and "Ava has none" would be testing the seed
// rather than the write.
const avaBefore = await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_ava'");

await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/book-for', context: { sessionId: freeSession, subjectId: 'p_emma' } });

const emmasBooking = await count('SELECT count(*) n FROM bookings WHERE session_id = $1 AND person_id = $2', [freeSession, 'p_emma']);
const avaAfter = await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_ava'");

ok(
  'a parent books for their child; the booking belongs to the CHILD',
  emmasBooking === 1,
  `${emmasBooking} booking(s) for Emma — the $lookup on guardianships is what put her id there`,
);

ok(
  '...and the parent gained nothing, which is the bug this whole design is shaped around',
  avaAfter === avaBefore,
  `Ava ${avaBefore} → ${avaAfter} — a person stamp on the household write would have made this ${avaBefore + 1}`,
);

// ── the subject is not a suggestion ──────────────────────────
//
// A member naming somebody they do not guard. The engine ANDs the
// guardianships read rules into the lookup's own subquery, so the subject
// resolves NULL and the insert dies on NOT NULL — a refusal, not a booking.

const before = await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_jonas'");
await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/book-for', context: { sessionId: freeSession, subjectId: 'p_jonas' } });
const after = await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_jonas'");

ok(
  'a member cannot book for somebody they do not guard',
  before === after,
  `${before} → ${after} — the subject resolves NULL and the write dies, rather than being believed`,
);

// ── 2. the reach reaches exactly the household ───────────────

const family = rows<{ person_id: string }>(await asPrincipal(CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/family-bookings', context: {} }));
const people = new Set(family.map((r) => r.person_id));

ok(
  "the family's week is ONE read, covering parent and children",
  people.has('p_ava') && people.has('p_emma'),
  `${people.size} distinct people across ${family.length} rows — this is what the reach bought over a switcher`,
);

const strangers = [...people].filter((id) => !['p_ava', 'p_emma', 'p_tomk'].includes(id));
ok(
  'a parent reads NOTHING of an unrelated member',
  strangers.length === 0,
  strangers.length === 0 ? 'not one row outside the household' : `leaked: ${strangers.join(', ')}`,
);

// ── 3. the regression guard for everybody else ───────────────
//
// A member who guards nobody. `householdIds` resolves to [them], so even the
// household-reached entries answer personally — which is the property that
// made this feature additive instead of a migration.

const jonasPersonal = rows<{ booking_id: string }>(await asPrincipal('jonas.weber@example.com', '/api/me/vex', { fingerprint: 'me/bookings', context: {} }));
const jonasFamily = rows<{ person_id: string }>(await asPrincipal('jonas.weber@example.com', '/api/me/vex', { fingerprint: 'me/family-bookings', context: {} }));
const jonasOthers = jonasFamily.filter((r) => r.person_id !== 'p_jonas');

ok(
  'a member with no children reads the same rows at either reach',
  jonasFamily.length === jonasPersonal.length,
  `${jonasPersonal.length} personal, ${jonasFamily.length} household — householdIds is [them] and the set collapses to the scalar`,
);

ok(
  '...and the household reach shows them nobody else',
  jonasOthers.length === 0,
  'the widened reach is exactly as narrow as the old one for anybody who guards nobody',
);

// ── the tenant boundary is untouched ─────────────────────────

const northRock = rows<{ person_id: string }>(await asPrincipal(CAST.northrock.member, '/api/me/vex', { fingerprint: 'me/family-bookings', context: {} }));
const crossed = northRock.filter((r) => ['p_ava', 'p_emma', 'p_tomk'].includes(r.person_id));

ok(
  'a guardianship at one studio grants nothing at another',
  crossed.length === 0,
  'the studio pin ANDs onto the household rule, it does not replace it',
);

// ── where a child's mail goes ────────────────────────────────
//
// R6's routing half. A child has no address of their own, and everything a
// studio would write to them has to reach an adult — so the anchor carries the
// RESOLVED one, recomputed by trigger, and every automation selection reads
// that rather than `people.email`.

const mailTo = async (person: string): Promise<string> =>
  String(
    (await runtime.db.query<{ mail_to: string | null }>('SELECT mail_to FROM studio_people WHERE person_id = $1 AND studio_id = $2', [person, 'st_lumen'])).rows[0]?.mail_to ?? '',
  );

ok(
  "a child's mail goes to their guardian",
  (await mailTo('p_emma')) === 'ava.klein@example.com' && (await mailTo('p_tomk')) === 'ava.klein@example.com',
  `Emma → ${await mailTo('p_emma')}`,
);

ok(
  '...and an adult still goes to their own address',
  (await mailTo('p_ava')) === 'ava.klein@example.com' && (await mailTo('p_jonas')) === 'jonas.weber@example.com',
  'the fallback only applies where there is nothing to fall back from',
);

// THE MIRROR IS A MIRROR, not a value somebody wrote once. A guardian changing
// their address moves every child of theirs, and that is a trigger on `people`
// rather than something the desk has to remember.
await runtime.db.query('UPDATE people SET email = $1 WHERE id = $2', ['ava.new@example.com', 'p_ava']);
ok(
  "a guardian changing their address moves their children's mail with it",
  (await mailTo('p_emma')) === 'ava.new@example.com',
  `Emma → ${await mailTo('p_emma')} — recomputed, never assembled at read`,
);
await runtime.db.query('UPDATE people SET email = $1 WHERE id = $2', ['ava.klein@example.com', 'p_ava']);

// AND UNREACHABLE IS A REAL STATE. A child whose guardian has no address is
// exactly as unreachable as an adult with none: the selections test for this,
// so both select zero rows rather than throwing at `outbox.to_address`.
await runtime.db.query('UPDATE people SET email = NULL WHERE id = $1', ['p_ava']);
ok(
  'a child whose guardian has no address is unreachable, not a crash',
  (await mailTo('p_emma')) === '',
  'NULL means nobody can be written to — the selections refuse them by name',
);
await runtime.db.query('UPDATE people SET email = $1 WHERE id = $2', ['ava.klein@example.com', 'p_ava']);

report('a parent sees and acts for their children, the booking belongs to the child, and nobody else moved');
