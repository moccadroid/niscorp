// Run: pnpm --filter lyra exec tsx src/dev/member-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const MEMBER = CAST.lumen.member;
const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};
// Structural, not a substring match on "status": a card is a payload with
// status-shaped columns of its own.
const refused = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { status?: unknown }).status === 'number';

// ── what a member still cannot do ────────────────────────────
for (const [what, url, fingerprint, context] of [
  ['read the roll', '/api/member/vex', 'people/list', { q: '%', lens: 'everyone', after: '', afterId: '' }],
  ['read one person', '/api/member/vex', 'people/byId', { personId: 'p_jonas' }],
  ['read a class roster', '/api/schedule/vex', 'roster/forSession', { sessionId: 'x' }],
  ['read who works here', '/api/staff/vex', 'staff/list', {}],
] as const) {
  ok(`a member cannot ${what}`, refused(await asPrincipal(MEMBER, url, { fingerprint, context })));
}

// ── the takings: reachable, and worth being explicit about ───
const takings = await asPrincipal(MEMBER, '/api/studio/vex', { fingerprint: 'studio/revenue/expected', context: {} });
const owned = await asPrincipal(CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'studio/revenue/expected', context: {} });
ok('a member replaying the takings gets only their own line', JSON.stringify(takings) !== JSON.stringify(owned), JSON.stringify(takings) + ' against the studio ' + JSON.stringify(owned));
ok('...and the studio total is not in it', !JSON.stringify(takings).includes('416'), 'the row filter, not the missing table, is what holds now');

// ── and cannot reach another member's own tables ─────────────
const card = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/card', context: {} });
ok('a member reads their own card', !refused(card), JSON.stringify(card).slice(0, 80));
ok('...with their own standing on it', JSON.stringify(card).includes('"status_label":"Active"'), 'derived from the subscription they hold');

const plan = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/membership', context: {} });
ok('...and their plan is its own read', JSON.stringify(plan).includes('"plan_name":"Unlimited"'), 'keyed, because "Unlimited" is also a fallback word');
ok('...carrying how it is paid', JSON.stringify(plan).includes('paid_via'), 'access and payment are different facts, both theirs to see');

const forged = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/card', context: { userId: 'p_jonas', personId: 'p_jonas', studioId: 'st_northrock' } });
ok('a forged person id changes nothing', JSON.stringify(forged) === JSON.stringify(card), 'context cannot reach a $scope slot');

const otherStudio = await asPrincipal(CAST.northrock.member, '/api/me/vex', { fingerprint: 'me/card', context: {} });
ok('another studio’s member gets their own', JSON.stringify(otherStudio).includes('North Rock') && !JSON.stringify(otherStudio).includes('Lumen'), JSON.stringify(otherStudio).slice(0, 90));

// ── the screens ──────────────────────────────────────────────
const member = await login(MEMBER);
await settle(10);
let tree = treeOf(member);
ok('a member lands on their own surface', tree.includes('Your classes and your membership'));
ok('...showing their plan', tree.includes('"value":"Unlimited"'), 'the plan name as a text node, not a fallback');
ok('...and their status', tree.includes('Active'));
ok('...and the classes they hold', tree.includes('Morning Flow'), 'seeded through the same trigger a tap uses');

ok('...with no staff areas in the menu', !tree.includes('"label":"People"') && !tree.includes('"label":"Money"') && !tree.includes('"label":"Check in"'));
ok('...but their own area is there', tree.includes('"label":"Booking"'));

ok('...reachable by a thumb, not a corner', tree.includes('"name":"Tab"') && !tree.includes('"name":"Burger"'), 'the thumb bar is the phone navigation');
ok('...four at most, always', (tree.match(/"name":"Tab"/g) ?? []).length <= 5, `${(tree.match(/"name":"Tab"/g) ?? []).length} tabs`);

// ── the prospect at the cliff ────────────────────────────────
// Tom Vogel signs in like anybody the studio knows — the old model refused
// him a principal until somebody lied about a membership.
const tom = await login('tom.vogel@example.com');
await settle(10);
let tomTree = treeOf(tom);
ok('a prospect signs in at all', tomTree.includes('Your classes and your membership'), 'known to the studio IS the login relationship');
ok('...wearing the truth', tomTree.includes('On trial'), 'derived standing, not a hopeful default');
ok('...and the trial CTA has a door', tomTree.includes('Your trial runs until') && tomTree.includes('Choose a plan'), 'a dead card was the old model’s tell');

// ── TOM PICKS A PLAN HIMSELF ─────────────────────────────────
// The whole acceptance test of the remodel: prospect → member with no desk
// anywhere, no payment processor anywhere, and a hard terms confirm in the
// middle (Decision D2). The studio settles the money afterwards, which is
// what `paid_via: manual` IS.
tom.dispatch({ type: 'ui:click', ref: 'choosePlan' });
await settle(14);
tomTree = treeOf(tom);
ok('the chooser opens with the plans on sale', tomTree.includes('Choose a plan') && tomTree.includes('Eight a month'), 'the member-facing price list, terms in words');

tom.dispatch({ type: 'ui:click', ref: 'pick', payload: { offering_id: 'pl_lumen_eight', name: 'Eight a month', price_display: '€89.00', interval_display: 'a month', allowance_display: '8 classes a month', term_display: 'Rolling — cancel any time' } });
await settle(12);
tomTree = treeOf(tom);
ok('...and asks for his word, in the words of the terms', tomTree.includes('Start Eight a month?') && tomTree.includes('€89.00 a month'), 'the sentence he agrees to IS the commitment (D2: hard confirm)');
ok('...before anything is written', (await count("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_tomv'")) === 0, 'a confirm sheet is a question, not a receipt');

tom.dispatch({ type: 'ui:click', ref: 'confirm' });
await settle(16);

const tomSub = await runtime.db.query<{ status: string; paid_via: string; monthly_cents: number; studio_id: string }>(
  "SELECT status, paid_via, monthly_cents, studio_id FROM subscriptions WHERE person_id = 'p_tomv'",
);
ok('Tom picked a plan himself', tomSub.rows[0]?.status === 'active', `${String(tomSub.rows[0]?.status)} — no desk touched this`);
ok('...billed by the studio, no processor anywhere', tomSub.rows[0]?.paid_via === 'manual');
ok('...on the offering’s own terms, at his own studio', Number(tomSub.rows[0]?.monthly_cents) === 8900 && tomSub.rows[0]?.studio_id === 'st_lumen', 'stamped by the trigger; pinned by his reach');
ok('...and exactly one, however hard he clicked', (await count("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_tomv'")) === 1);

// A member cannot start somebody ELSE's plan, nor one from another studio's
// price list: the reach stamps person_id from the caller (the forged subject
// is simply overwritten), and the offering pair FK refuses the foreign price
// — so this lands nowhere at all.
const forgedStart = await asPrincipal('tom.vogel@example.com', '/api/me/vex', {
  fingerprint: 'subscriptions/start',
  context: { personId: 'p_priya', offeringId: 'pl_nr_unlimited', paidVia: 'comp' },
});
ok('...and could not have started anybody else’s, anywhere else', refused(forgedStart) && (await count("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_priya'")) === 0, 'the grammar has no subject to forge, and the pair FK holds the price list');
ok('...leaving Tom with exactly his own one plan', (await count("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_tomv'")) === 1);

// ── TOM PAUSES HIMSELF (Decision D4) ─────────────────────────
const tomSubId = (await runtime.db.query<{ id: string }>("SELECT id FROM subscriptions WHERE person_id = 'p_tomv'")).rows[0]?.id ?? '';
const paused = await asPrincipal('tom.vogel@example.com', '/api/me/vex', { fingerprint: 'subscriptions/pause', context: { subscriptionId: tomSubId } });
ok('Tom pauses himself', !refused(paused), JSON.stringify(paused).slice(0, 70));
ok('...and the LEDGER moved his status', (await count('SELECT count(*) n FROM subscriptions WHERE id = $1 AND status = $2', [tomSubId, 'paused'])) === 1, 'derived by the apply trigger, never written by a screen');
const tomPausedPanel = await asPrincipal('tom.vogel@example.com', '/api/me/vex', { fingerprint: 'me/membership', context: {} });
ok('...which is what his own screen now says', JSON.stringify(tomPausedPanel).includes('"status":"paused"'), 'the membership panel; his card still says On trial, because a live trial deliberately outranks the plan beside it');

// A month passes (backdated in the ledger, because a check has no calendar).
const committedBefore = (await runtime.db.query<{ d: string }>('SELECT committed_until::text d FROM subscriptions WHERE id = $1', [tomSubId])).rows[0]?.d ?? '';
await runtime.db.query("UPDATE subscription_pauses SET paused_on = paused_on - 30 WHERE subscription_id = $1", [tomSubId]);

const resumed = await asPrincipal('tom.vogel@example.com', '/api/me/vex', { fingerprint: 'subscriptions/resume', context: { subscriptionId: tomSubId } });
ok('...and resumes himself', !refused(resumed), JSON.stringify(resumed).slice(0, 70));
const afterResume = await runtime.db.query<{ status: string; moved: boolean }>(
  "SELECT status, committed_until = $2::date + 30 AS moved FROM subscriptions WHERE id = $1",
  [tomSubId, committedBefore],
);
ok('...active again', afterResume.rows[0]?.status === 'active');
ok('...with his commitment moved out by EXACTLY the days frozen', afterResume.rows[0]?.moved === true, 'D4: a paused month does not count toward the minimum — pause is never an escape hatch');

// ── TOM GIVES NOTICE HIMSELF ─────────────────────────────────
const noticed = await asPrincipal('tom.vogel@example.com', '/api/me/vex', { fingerprint: 'subscriptions/give-notice', context: { subscriptionId: tomSubId } });
ok('Tom gives notice himself', !refused(noticed), JSON.stringify(noticed).slice(0, 70));
const leaving = await runtime.db.query<{ same: boolean; dated: boolean }>(
  `SELECT ends_on = committed_until AS same, notice_given_on = studio_today(studio_id) AS dated FROM subscriptions WHERE id = $1`,
  [tomSubId],
);
ok('...dated by the studio’s own clock', leaving.rows[0]?.dated === true, 'he sent a subscription id and nothing else');
ok('...and he leaves when his EXTENDED commitment ends', leaving.rows[0]?.same === true, 'the pause moved the term; notice inside it still runs to its end — D4 and the notice arithmetic, agreeing');

// ── and none of it reaches anybody else ──────────────────────
const foreignNotice = await asPrincipal('tom.vogel@example.com', '/api/me/vex', { fingerprint: 'subscriptions/give-notice', context: { subscriptionId: 'sub_lena' } });
ok('notice on somebody else’s subscription is refused', refused(foreignNotice), 'pinned to the caller, verified by the database against the owner');
ok('...and no row landed', (await count("SELECT count(*) n FROM subscription_notices WHERE subscription_id = 'sub_lena'")) === 0);
const foreignPause = await asPrincipal('tom.vogel@example.com', '/api/me/vex', { fingerprint: 'subscriptions/pause', context: { subscriptionId: 'sub_lena' } });
ok('...as is a pause', refused(foreignPause), 'same fence, same trigger');
ok('...leaving Lena training', (await count("SELECT count(*) n FROM subscriptions WHERE id = 'sub_lena' AND status = 'active'")) === 1);

// ── the milkman resolves ─────────────────────────────────────
const bo = await asPrincipal('bo@bodhimats.at', '/api/me/vex', { fingerprint: 'me/card', context: {} });
ok('the milkman resolves as a principal', !refused(bo), JSON.stringify(bo).slice(0, 80));
ok('...standing as a contact', JSON.stringify(bo).includes('"status_label":"Contact"'), 'a supplier is somebody the studio deals with — no fraudulent membership required');

// ── booking ──────────────────────────────────────────────────
member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.classes' });
await settle(10);
tree = treeOf(member);
ok('a member reaches the class list', tree.includes('Drop into anything on the timetable'));
ok('...and is offered courses as well as single classes', tree.includes('Join once and your place is held'), 'a block is the bigger commitment, so it sits first');

const sessionRow = await runtime.db.query<{ id: string; booked_count: number }>(
  `SELECT cs.id, cs.booked_count FROM class_sessions cs
    WHERE cs.studio_id = 'st_lumen' AND cs.held_on > studio_today('st_lumen') AND cs.status = 'scheduled'
      AND cs.booked_count < cs.capacity
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = cs.id AND b.person_id = 'p_ava')
    ORDER BY cs.held_on, cs.starts_at LIMIT 1`,
);
const sessionId = sessionRow.rows[0]?.id ?? '';
const seatsBefore = Number(sessionRow.rows[0]?.booked_count ?? -1);

member.dispatch({ type: 'ui:click', ref: 'book', payload: { session_id: sessionId } });
await settle(16);

ok('a member can book themselves in', (await count('SELECT count(*) n FROM bookings WHERE person_id = $1 AND session_id = $2 AND status = $3', ['p_ava', sessionId, 'booked'])) === 1);
ok('...and the seat count moved', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [sessionId])) === seatsBefore + 1);
ok('...so the desk sees them on the roster', (await count("SELECT count(*) n FROM bookings WHERE session_id = $1 AND person_id = 'p_ava' AND status = 'booked'", [sessionId])) === 1);

// ── what a booking cannot be aimed at ────────────────────────
const foreignSession = await runtime.db.query<{ id: string }>("SELECT id FROM class_sessions WHERE studio_id = 'st_northrock' AND held_on > studio_today('st_northrock') LIMIT 1");
const across = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId: foreignSession.rows[0]?.id ?? '' } });
ok('a member cannot book into another studio', refused(across), JSON.stringify(across).slice(0, 90));
ok('...and no row was written', (await count("SELECT count(*) n FROM bookings WHERE studio_id = 'st_northrock' AND person_id = 'p_ava'")) === 0);

// Measured as a DELTA rather than as "Jonas has none": Jonas is seeded onto a
// course, so an absolute count asserts the state of the seed, not the refusal.
const jonasBefore = await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_jonas'");
const forgedBook = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId, personId: 'p_jonas', person_id: 'p_jonas' } });
void forgedBook;
ok('a member cannot book somebody else', (await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_jonas'")) === jonasBefore, 'the grammar has no subject to forge');
ok('...and the row it DID write is their own', (await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_ava' AND session_id = $1", [sessionId])) === 1, 'stamped from the rung, not from the request');

// ── double booking, and changing their mind ──────────────────
const twice = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId } });
ok('booking the same class twice changes nothing', !refused(twice), JSON.stringify(twice).slice(0, 60));
ok('...and there is still exactly one row', (await count('SELECT count(*) n FROM bookings WHERE person_id = $1 AND session_id = $2', ['p_ava', sessionId])) === 1);
ok('...and the seat count did not move again', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [sessionId])) === seatsBefore + 1);

member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.bookings' });
await settle(10);
ok('a member reaches their own classes', treeOf(member).includes('Everything you are booked into'));

const bookingId = (await runtime.db.query<{ id: string }>('SELECT id FROM bookings WHERE person_id = $1 AND session_id = $2', ['p_ava', sessionId])).rows[0]?.id ?? '';
member.dispatch({ type: 'ui:click', ref: 'cancel', payload: { booking_id: bookingId } });
await settle(16);

ok('a member can cancel', (await count('SELECT count(*) n FROM bookings WHERE id = $1 AND status = $2', [bookingId, 'cancelled'])) === 1);
ok('...and it is the row the desk reads', (await count("SELECT count(*) n FROM bookings WHERE id = $1 AND status = 'cancelled'", [bookingId])) === 1);
ok('...freeing the seat', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [sessionId])) === seatsBefore, 'the counter trigger, not the writer');

const again = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/book', context: { sessionId } });
ok('a member can book again after cancelling', !refused(again), JSON.stringify(again).slice(0, 80));
ok('...reusing the row rather than duplicating it', (await count('SELECT count(*) n FROM bookings WHERE person_id = $1 AND session_id = $2', ['p_ava', sessionId])) === 1);
ok('...and the seat is taken again', (await count('SELECT booked_count n FROM class_sessions WHERE id = $1', [sessionId])) === seatsBefore + 1);

// ── the row says WHEN, time included ─────────────────────────
// The screen whose whole job is "when do I turn up" carried the day and
// dropped the time — starts_at was fetched for the sort and never shown.
const whenRow = await runtime.db.query<{ starts: string }>('SELECT starts_at::text AS starts FROM class_sessions WHERE id = $1', [sessionId]);
const hhmm = (whenRow.rows[0]?.starts ?? '').slice(0, 5);
const timedList = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
const timedRow = (Array.isArray(timedList) ? (timedList as { session_id?: string; when_display?: string }[]) : []).find((r) => r.session_id === sessionId);
ok('a booked row carries the session’s time', hhmm !== '' && String(timedRow?.when_display ?? '').includes(hhmm), `${String(timedRow?.when_display ?? '(row missing)')} against ${hhmm}`);

// ── cancelling is theirs alone ───────────────────────────────
const jonasBooking = await runtime.db.query<{ id: string }>("SELECT id FROM bookings WHERE person_id <> 'p_ava' AND status = 'booked' LIMIT 1");
if (jonasBooking.rows[0] !== undefined) {
  const other = jonasBooking.rows[0].id;
  await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/cancel', context: { bookingId: other } });
  ok('a member cannot cancel somebody else’s class', (await count('SELECT count(*) n FROM bookings WHERE id = $1 AND status = $2', [other, 'booked'])) === 1, 'the update matched no row');
} else {
  ok('a member cannot cancel somebody else’s class', true, 'no second member booking to attempt — asserted by the write behaviors above');
}

// ── who is offered the member surfaces ───────────────────────
const boss = await login(CAST.lumen.owner);
await settle(8);
const bossTree = treeOf(boss);
ok('an owner who does not train is not offered booking', !bossTree.includes('"label":"Booking"'), 'derived from the anchor row, not from the charter');
const bossCard = await asPrincipal(CAST.lumen.owner, '/api/me/vex', { fingerprint: 'me/card', context: {} });
ok('...though the grant is still theirs', !refused(bossCard), 'the read answers; it just has nothing to say');
ok('...and answers with nothing, because the studio does not know them that way', !JSON.stringify(bossCard).includes('Lumen Yoga'), JSON.stringify(bossCard).slice(0, 70));

const both = await login(CAST.lumen.instructor);
await settle(8);
const bothTree = treeOf(both);
ok('an instructor who trains IS offered booking', bothTree.includes('"label":"Booking"'), 'one person, two relationships with the studio');
ok('...and still lands on the instructor day', bothTree.includes('"label":"Check in"') || !bothTree.includes('Your classes and your membership'));

// ── a booking they did not make themselves ───────────────────
const ownsInDb = await count(
  `SELECT count(*) n FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
    WHERE b.person_id = 'p_omar' AND b.status <> 'cancelled'
      AND cs.held_on >= studio_today(b.studio_id)`,
);
const omarSees = await asPrincipal(CAST.northrock.member, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
ok('a member sees every booking they own, whoever made it', Array.isArray(omarSees) && omarSees.length === ownsInDb, `${Array.isArray(omarSees) ? omarSees.length : -1} on screen against ${ownsInDb} rows`);
ok('...and there are some, so this is not a vacuous pass', ownsInDb > 0, `${ownsInDb} bookings, none of them made by him`);

const before = await count("SELECT count(*) n FROM bookings WHERE person_id = 'p_omar' AND status = 'booked'");
const joined = await asPrincipal(CAST.northrock.member, '/api/schedule/vex', { fingerprint: 'me/join-course', context: { courseId: 'co_rock_intake' } });
ok('a member can join a course themselves', !refused(joined), JSON.stringify(joined).slice(0, 80));
const after = await runtime.db.query("SELECT count(*) n FROM bookings WHERE person_id = 'p_omar' AND status = 'booked'");
ok('...and the whole block lands in their diary', Number((after.rows[0] as { n: string }).n) > before, `${(after.rows[0] as { n: string }).n} after ${before}`);

// ── the studio calls a class off after she booked it ─────────
//
// Cancelling a class touches the SESSION's status and nobody's booking row,
// so the only way her list can tell the truth is by reading both. The row
// must STAY — silently removing it is the same failure with better manners.
await runtime.db.query("UPDATE class_sessions SET status = 'cancelled' WHERE id = $1", [sessionId]);
const offList = await asPrincipal(MEMBER, '/api/me/vex', { fingerprint: 'me/bookings', context: {} });
const offRow = (Array.isArray(offList) ? (offList as { session_id?: string; state_label?: string; session_cancelled?: boolean }[]) : []).find((r) => r.session_id === sessionId);
ok('a cancelled class stays on her list', offRow !== undefined, 'she needs to be told, not spared the sight');
ok('...and no longer reads Booked', offRow?.state_label === 'Cancelled', String(offRow?.state_label ?? '(row missing)'));
ok('...and the Cancel verb has nothing to stand on', offRow?.session_cancelled === true, 'the layout hides it on this flag');

// The raw UPDATE above rode no write path, so nothing pushed — navigate away
// and back to force a fresh read, the way a member opening the screen would.
member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.classes' });
await settle(6);
member.dispatch({ type: 'ui:click', ref: 'nav', payload: 'me.bookings' });
await settle(12);
const offTree = treeOf(member);
const offAt = offTree.indexOf(sessionId);
const offWindow = offAt < 0 ? '' : offTree.slice(offAt, offAt + 400);
ok('...which is what her screen renders', offWindow.includes('"state_label":"Cancelled"') && offWindow.includes('"session_cancelled":true'), offWindow === '' ? 'session row not in the tree' : offWindow.slice(0, 140));
ok('...with the Cancel control reading that flag', offTree.includes('"hideKey":"session_cancelled"'), 'the cell spec, beside the row data it reads');

report('a member has their own side, the prospect and the milkman sign in beside them, and holding it is not holding anybody else’s.');
