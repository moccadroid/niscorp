// A PERSON IS NOT ONE ROLE.
//
// Tobias teaches at Lumen and trains there. The directory used to flatten
// him to the staff word, so the charter never saw the member half — and three
// workarounds grew on top of that: a scoping profile that let a teacher book,
// a projection table, and a deny that was never needed.
//
// What this check pins down is that holding two roles is ADDITIVE and that the
// two halves do not contaminate each other: the studio-wide reach his teaching
// needs must not turn his own card into somebody else's.

import { asPrincipal, app, ok, report } from './world';

const TOBIAS = 'tobias@lumen.studio';
const AVA = 'ava.klein@example.com';

const cardOf = async (email: string): Promise<Record<string, unknown>> => {
  const answer = await asPrincipal(email, '/api/me/vex', { fingerprint: 'me/card', context: {} });
  return (answer ?? {}) as Record<string, unknown>;
};

// ─── the assignment ────────────────────────────────────────────
const tobias = app.assignments['p_tobias'] ?? [];
const ava = app.assignments['p_ava'] ?? [];
const ines = app.assignments['p_ines'] ?? [];

ok('somebody who teaches and trains holds BOTH roles', tobias.includes('instructor') && tobias.includes('member'), tobias.join(' + '));
ok('...a member who is only a member holds one', ava.length === 1 && ava.includes('member'), ava.join(' + '));
ok('...and staff who do not train are not handed a membership', !ines.includes('member'), ines.join(' + '));

// ─── the two halves, at the same time ──────────────────────────
//
// The merged policy takes the WIDEST reach any role grants, so his teaching
// half wins on `memberships` — which is the point of holding two roles, and
// also the thing that could quietly hand him the wrong card.
const his = await cardOf(TOBIAS);
const hers = await cardOf(AVA);

ok('his card comes back at all', typeof his['studio_name'] === 'string' && his['studio_name'] !== '', String(his['studio_name']));
ok('...and it is HIS, not the first membership the planner reached', his['joined_display'] !== hers['joined_display'] || his['plan_name'] !== hers['plan_name'], `${String(his['plan_name'])} vs ${String(hers['plan_name'])}`);
ok('...on a plan with a real price, so the money joined through', String(his['price_display'] ?? '').match(/\d/) !== null, String(his['price_display']));

// ─── the ladder no longer carries member grants upward ─────────
//
// `member` is a sibling of the staff roles now, not their base. The desk holds
// `plans.read` and deliberately not `subscriptions.read`, because together they
// are the studio's takings — and Ines is not a member, so nothing gives it back.
const revenue = (await asPrincipal('ines@lumen.studio', '/api/me/vex', { fingerprint: 'studio/revenue/expected', context: {} })) as { status?: number };
ok('the desk still cannot reach the takings', revenue.status === 400, JSON.stringify(revenue));

// WHERE THE REVENUE BOUNDARY MOVED, and this is the interesting one.
//
// The member rung names `subscriptions.read` now, because a card is that join.
// The desk's comment says plans x subscriptions IS the takings — and it still is,
// AT STUDIO REACH. What the member rung holds is the same verb at personal
// reach, so replaying the revenue fingerprint returns their own bill rather than
// the studio's: the boundary is a row filter here instead of a missing verb.
//
// That is a real weakening and worth pinning down rather than glossing: the
// figure a member or a teaching member gets back must be THEIRS, never the sum.
const takings = (await asPrincipal('maren@lumen.studio', '/api/me/vex', { fingerprint: 'studio/revenue/expected', context: {} })) as { monthly_display?: string };
const his2 = (await asPrincipal(TOBIAS, '/api/me/vex', { fingerprint: 'studio/revenue/expected', context: {} })) as { monthly_display?: string };
const hers2 = (await asPrincipal(AVA, '/api/me/vex', { fingerprint: 'studio/revenue/expected', context: {} })) as { monthly_display?: string };

ok("the owner sees the studio's takings", (takings.monthly_display ?? '') !== '', String(takings.monthly_display));
ok('...an instructor who also trains sees only their own bill', his2.monthly_display !== takings.monthly_display, `${his2.monthly_display} against the studio's ${takings.monthly_display}`);
// Two members no longer see the SAME figure, and that is the fix rather than a
// regression: Ava is on a grandfathered rate and Tobias is not, so asserting
// they match was asserting a coincidence of the price list. What has to hold is
// that each sees their own and neither sees the sum.
ok('...and a plain member sees hers, not the sum', hers2.monthly_display !== takings.monthly_display, String(hers2.monthly_display) + " against the studio's " + String(takings.monthly_display));
ok('...and the two of them differ, because their rates do', hers2.monthly_display !== his2.monthly_display, String(hers2.monthly_display) + ' vs ' + String(his2.monthly_display) + ' — a grandfathered price is a real thing');

report('two roles, added together: the wider reach does the staff job, and the card is still theirs.');
