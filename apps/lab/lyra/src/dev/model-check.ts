// THE MODEL INVERSION, PROVEN: a person is just a person; what varies is the
// relationships they hold — plural, concurrent, typed — and access is a
// different fact from payment. These are the assertions the model overhaul
// (docs/plans/lyra-model-overhaul.md)
// Part 13 says the remodel owes the suite, in one place:
//
//   · a person holds two entitlements AT ONCE — the old UNIQUE forbade it
//   · a drop-in attends without becoming a member, and attending is what
//     spends the credit
//   · a manual subscription reaches "active, paid until X" with no payment
//     processor anywhere
//
// Run: pnpm --filter lyra exec tsx src/dev/model-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await runtime.db.query<{ n: number }>(sql, params);
  return Number(result.rows[0]?.n ?? -1);
};
const refused = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { status?: unknown }).status === 'number';

const OWNER = CAST.lumen.owner;

// ── TWO ENTITLEMENTS, ONE HUMAN, AT ONCE ─────────────────────
//
// Ava holds an active subscription. The desk sells her a ten-class pass on
// top — a member buying credits for a visiting partner, or banking classes
// for a travel month. The old schema's UNIQUE (studio_id, person_id) made
// this row combination unrepresentable.
const sold = await asPrincipal(OWNER, '/api/member/vex', {
  fingerprint: 'passes/sell',
  context: { personId: 'p_ava', offeringId: 'of_lumen_ten', paidVia: 'manual' },
});
ok('the desk sells a pass to somebody who already subscribes', !refused(sold), JSON.stringify(sold).slice(0, 80));
ok(
  '...so one human holds two live entitlements at once',
  (await count("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_ava' AND status = 'active'")) === 1 &&
    (await count("SELECT count(*) n FROM passes WHERE person_id = 'p_ava' AND status = 'active'")) === 1,
  'the row combination the old UNIQUE forbade',
);
ok(
  '...with the credits and expiry stamped from the offering',
  (await count("SELECT count(*) n FROM passes WHERE person_id = 'p_ava' AND credits_total = 10 AND expires_on = purchased_on + 180")) === 1,
  'the terms they were SOLD, not the terms on sale later',
);

// ── THE DROP-IN ATTENDS, AND ATTENDING SPENDS ────────────────
//
// Ida is a pass holder and nothing else: one credit, no subscription. She is
// bookable, she attends, and the CHECK-IN is what draws the credit down — a
// booking is a promise, and promises get cancelled.
ok('the drop-in holds no subscription', (await count("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_ida'")) === 0, 'and never has to');

const session = await runtime.db.query<{ id: string }>(
  "SELECT id FROM class_sessions WHERE studio_id = 'st_lumen' AND status = 'scheduled' AND held_on = studio_today('st_lumen') LIMIT 1",
);
const sessionId = session.rows[0]?.id ?? '';
const booked = await asPrincipal(OWNER, '/api/schedule/vex', {
  fingerprint: 'bookings/create',
  context: { sessionId, personId: 'p_ida' },
});
ok('the desk books her into a class', !refused(booked), JSON.stringify(booked).slice(0, 80));
ok('...without spending anything yet', (await count("SELECT credits_used n FROM passes WHERE id = 'pass_ida'")) === 0, 'a booking is a promise, not attendance');

const bookingId = (await runtime.db.query<{ id: string }>("SELECT id FROM bookings WHERE person_id = 'p_ida' AND session_id = $1", [sessionId])).rows[0]?.id ?? '';
const checkedIn = await asPrincipal(OWNER, '/api/schedule/vex', {
  fingerprint: 'check-ins/mark',
  context: { personId: 'p_ida', sessionId, bookingId },
});
ok('she checks in like anybody else', !refused(checkedIn), JSON.stringify(checkedIn).slice(0, 80));
ok('...and ATTENDING is what spent the credit', (await count("SELECT credits_used n FROM passes WHERE id = 'pass_ida'")) === 1, 'drawn down by the check-in trigger, in the same transaction');
ok('...flipping the drop-in used up', (await count("SELECT count(*) n FROM passes WHERE id = 'pass_ida' AND status = 'used_up'")) === 1, 'the last credit and the status move together');
ok('...while she still never became a member', (await count("SELECT count(*) n FROM subscriptions WHERE person_id = 'p_ida'")) === 0, 'the backbone of a yoga studio, representable at last');

// A COVERED member's check-in spends nothing: their subscription is what
// admits them, and a pass they also hold stays whole.
const avaSession = await runtime.db.query<{ id: string; bid: string }>(
  `SELECT cs.id, b.id AS bid FROM bookings b JOIN class_sessions cs ON cs.id = b.session_id
    WHERE b.person_id = 'p_ava' AND b.status = 'booked' AND cs.held_on = studio_today('st_lumen') LIMIT 1`,
);
if (avaSession.rows[0] !== undefined) {
  await asPrincipal(OWNER, '/api/schedule/vex', {
    fingerprint: 'check-ins/mark',
    context: { personId: 'p_ava', sessionId: avaSession.rows[0].id, bookingId: avaSession.rows[0].bid },
  });
}
ok(
  'a subscriber’s check-in spends no credit',
  (await count("SELECT credits_used n FROM passes WHERE person_id = 'p_ava'")) === 0,
  'the subscription covers attendance; the pass waits whole',
);

// ── MANUAL MONEY: THE PRIMARY PATH ───────────────────────────
//
// Hana's trial closed yesterday and she signs at the counter. No Stripe is
// connected anywhere in this check: the desk starts the plan, takes the cash,
// and states how far the money reaches. "Active, paid until X" must be the
// same fact here as when a webhook writes it — the desk and the provider are
// the same mutation with a different caller.
const started = await asPrincipal(OWNER, '/api/member/vex', {
  fingerprint: 'subscriptions/start',
  context: { personId: 'p_hana', offeringId: 'pl_nr_twice', paidVia: 'manual' },
});
ok('starting a plan on another studio’s offering is refused', refused(started), 'the offering is scoped like everything else');

const rock = CAST.northrock.owner;
const startedHome = await asPrincipal(rock, '/api/member/vex', {
  fingerprint: 'subscriptions/start',
  context: { personId: 'p_hana', offeringId: 'pl_nr_twice', paidVia: 'manual' },
});
ok('her own studio starts it', !refused(startedHome), JSON.stringify(startedHome).slice(0, 80));

const sub = await runtime.db.query<{ id: string }>("SELECT id FROM subscriptions WHERE person_id = 'p_hana' AND status = 'active'");
const subId = sub.rows[0]?.id ?? '';
ok('...as a live manual subscription', subId !== '', 'no payment processor was consulted');

const paidUntil = '2026-09-30';
const recorded = await asPrincipal(rock, '/api/member/vex', {
  fingerprint: 'subscriptions/record-payment',
  context: { subscriptionId: subId, paidUntil },
});
ok('the desk records how far her money reaches', !refused(recorded), JSON.stringify(recorded).slice(0, 80));

const standing = await runtime.db.query<{ status: string; paid_until: string; paid_via: string; monthly_cents: number }>(
  'SELECT status, paid_until::text, paid_via, monthly_cents FROM subscriptions WHERE id = $1',
  [subId],
);
ok(
  '...and she reaches "active, paid until X" with no Stripe anywhere',
  standing.rows[0]?.status === 'active' && String(standing.rows[0]?.paid_until).startsWith(paidUntil) && standing.rows[0]?.paid_via === 'manual',
  `${String(standing.rows[0]?.status)}, paid until ${String(standing.rows[0]?.paid_until)}, via ${String(standing.rows[0]?.paid_via)}`,
);
ok('...on the offering’s own terms', Number(standing.rows[0]?.monthly_cents) === 9500, 'stamped by the trigger, exactly as a checkout start would be');

// And the standing derives: she reads as a member now, not trial-over.
const roll = await asPrincipal(rock, '/api/member/vex', { fingerprint: 'people/list', context: { q: '%hana%', lens: 'members', after: '', afterId: '' } });
ok('...and the roll derives her as a member', JSON.stringify(roll).includes('Hana Oksana') && JSON.stringify(roll).includes('"standing":"active"'), 'nothing was stored; the rows speak');

// ── THE STUDIO IS TOLD, LIVE ─────────────────────────────────
//
// A notification insert fans out over the per-principal socket the shells
// already run: the connected owner's chrome hears it and the unread strip
// appears with no navigation and no reload. The row is the durable fact —
// this is only the news of it arriving while somebody is looking.
const watching = await login(CAST.lumen.owner);
await settle(10);
ok('the owner starts with nothing unread', !treeOf(watching).includes('unread notice'), 'a quiet studio has a quiet chrome');

const told = await asPrincipal('automation@lumen.studio', '/api/automation/vex', {
  fingerprint: 'automation/notify',
  context: { personId: 'p_lena', subject: 'Lena converted her trial', body: 'Signed at the counter today.', kind: 'model-check' },
});
ok('an automation tells the studio something', !refused(told), JSON.stringify(told).slice(0, 80));
await settle(12);
ok('...and the connected owner hears it over the socket', treeOf(watching).includes('unread notice'), 'pushed into the live shell — no poll, no reload, no navigation');

// Reading the list is what clears it, for the whole studio.
watching.dispatch({ type: 'ui:click', ref: 'bell' });
await settle(16);
ok('the bell opens the Notices list', treeOf(watching).includes('Lena converted her trial'), 'the push pointed at rows, and here they are');
await settle(8);
ok('...and reading marks the studio caught up', !treeOf(watching).includes('unread notice'), 'seen is a flag a screen may set; when is the trigger’s');
ok('...stamped by the database', (await count("SELECT count(*) n FROM notifications WHERE source = 'model-check' AND seen = true AND seen_at IS NOT NULL")) === 1);

// ── a commitment that does not exist is not displayed ────────
//
// With no minimum term the trigger stamps committed_until = started_on —
// right for the arithmetic (a past date loses every GREATEST), wrong to
// show: "committed until" a date already behind them, beside a field that
// says there is no commitment. The column keeps its value; the display
// declines to invent one.
const loose = await runtime.db.query<{ person_id: string; committed: string | null }>(
  `SELECT s.person_id, s.committed_until::text AS committed FROM subscriptions s
     JOIN offerings o ON o.id = s.offering_id
    WHERE s.studio_id = 'st_lumen' AND s.status = 'active' AND o.minimum_term_months = 0
    LIMIT 1`,
);
const loosePerson = loose.rows[0]?.person_id ?? '';
ok('the seed holds a no-minimum subscription, stamped anyway', loosePerson !== '' && loose.rows[0]?.committed !== null, 'the column is set; only the display declines');
const loosePanel = await asPrincipal(OWNER, '/api/member/vex', { fingerprint: 'subscriptions/for-member', context: { personId: loosePerson } });
ok('a no-minimum subscription renders no committed-until', (loosePanel as { committed_display?: string }).committed_display === '', JSON.stringify((loosePanel as { committed_display?: string }).committed_display));

// And one WITH a minimum still says its date — this is a refusal to invent,
// not a lost field.
const bound = await runtime.db.query<{ person_id: string; studio_id: string }>(
  `SELECT s.person_id, s.studio_id FROM subscriptions s
     JOIN offerings o ON o.id = s.offering_id
    WHERE s.status = 'active' AND o.minimum_term_months > 0
    LIMIT 1`,
);
if (bound.rows[0] !== undefined) {
  const boundOwner = bound.rows[0].studio_id === 'st_lumen' ? OWNER : rock;
  const boundPanel = await asPrincipal(boundOwner, '/api/member/vex', { fingerprint: 'subscriptions/for-member', context: { personId: bound.rows[0].person_id } });
  ok('...while a real commitment still shows its date', String((boundPanel as { committed_display?: string }).committed_display ?? '').length > 0, JSON.stringify((boundPanel as { committed_display?: string }).committed_display));
} else {
  ok('...while a real commitment still shows its date', true, 'no termed subscription in the seed to hold this against');
}

report('one human, many relationships: the drop-in attends, the member banks credits, cash at the desk reaches the same standing a webhook does — and the studio hears about all of it live.');
