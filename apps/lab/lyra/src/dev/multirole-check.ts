import { asPrincipal, ok, report, runtime, server } from './world';

const TOBIAS = 'tobias@lumen.studio';
const AVA = 'ava.klein@example.com';

const cardOf = async (email: string): Promise<Record<string, unknown>> => {
  const answer = await asPrincipal(email, '/api/me/vex', { fingerprint: 'me/card', context: {} });
  return (answer ?? {}) as Record<string, unknown>;
};

const planOf = async (email: string): Promise<Record<string, unknown>> => {
  const answer = await asPrincipal(email, '/api/me/vex', { fingerprint: 'me/membership', context: {} });
  return (answer ?? {}) as Record<string, unknown>;
};

// ─── the assignment ────────────────────────────────────────────
// ASKED, not read off a map. There is no assignment map any more — roles come
// from the identity seam, one principal at a time, which is the whole point.
const rolesOfPrincipal = async (id: string): Promise<readonly string[]> => (await server.identity(id)).roles;
const tobias = await rolesOfPrincipal('p_tobias');
const ava = await rolesOfPrincipal('p_ava');
const ines = await rolesOfPrincipal('p_ines');

ok('somebody who teaches and trains holds BOTH roles', tobias.includes('instructor') && tobias.includes('member'), tobias.join(' + '));
ok('...a member who is only a member holds one', ava.length === 1 && ava.includes('member'), ava.join(' + '));
ok('...and staff who do not train are not handed a membership', !ines.includes('member'), ines.join(' + '));

// ─── the two halves, at the same time ──────────────────────────
const his = await cardOf(TOBIAS);
const hers = await cardOf(AVA);
const hisPlan = await planOf(TOBIAS);
const hersPlan = await planOf(AVA);

ok('his card comes back at all', typeof his['studio_name'] === 'string' && his['studio_name'] !== '', String(his['studio_name']));
ok('...and it is HIS, not the first person the planner reached', his['joined_display'] !== hers['joined_display'] || hisPlan['value_display'] !== hersPlan['value_display'], `${String(hisPlan['plan_name'])} at ${String(hisPlan['value_display'])} vs ${String(hersPlan['value_display'])}`);
ok('...on a plan with a real price, so the money joined through', String(hisPlan['value_display'] ?? '').match(/\d/) !== null, String(hisPlan['value_display']));

// ─── the ladder does not carry member grants upward ────────────
const revenue = (await asPrincipal('ines@lumen.studio', '/api/me/vex', { fingerprint: 'studio/revenue/expected', context: {} })) as { status?: number };
ok('the desk still cannot reach the takings', revenue.status === 400, JSON.stringify(revenue));

const takings = (await asPrincipal('maren@lumen.studio', '/api/me/vex', { fingerprint: 'studio/revenue/expected', context: {} })) as { monthly_display?: string };
const his2 = (await asPrincipal(TOBIAS, '/api/me/vex', { fingerprint: 'studio/revenue/expected', context: {} })) as { monthly_display?: string };
const hers2 = (await asPrincipal(AVA, '/api/me/vex', { fingerprint: 'studio/revenue/expected', context: {} })) as { monthly_display?: string };

ok("the owner sees the studio's takings", (takings.monthly_display ?? '') !== '', String(takings.monthly_display));
ok('...an instructor who also trains sees only their own bill', his2.monthly_display !== takings.monthly_display, `${his2.monthly_display} against the studio's ${takings.monthly_display}`);
ok('...and a plain member sees hers, not the sum', hers2.monthly_display !== takings.monthly_display, String(hers2.monthly_display) + " against the studio's " + String(takings.monthly_display));
ok('...and the two of them differ, because their rates do', hers2.monthly_display !== his2.monthly_display, String(hers2.monthly_display) + ' vs ' + String(his2.monthly_display) + ' — a grandfathered price is a real thing');

report('two roles, added together: the wider reach does the staff job, and the card is still theirs.');
