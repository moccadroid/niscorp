// WHICH DOOR OPENS FOR WHOM — the half of the integration perimeter that was missing.
//
// The declaration has been the perimeter for a while: an integration is
// reachable at the paths its bundle names and nowhere else, and `perimeter-check`
// proves that a stranger gets nothing. This is the question that check never
// asked — not "is this path declared?" but "declared by a screen THIS CALLER
// HOLDS?".
//
// It was not asked, and the answer was no. Reach was the flat union of every
// endpoint in a bundle, so the charter's `ext.desk.*` / `ext.member.*` fence
// decided which SCREENS rendered and nothing about which endpoints answered.
// A member of a gym could call the payments integration's merchant onboarding
// endpoint, and mint a frame grant for the page that changes where the studio's
// money is paid out. Both were 200s.
//
// So this check runs the whole thing from both sides. Refusals alone would pass
// against an integration that was simply broken, so every refusal here is paired
// with the same call succeeding for somebody who should have it — the fence is
// only a fence if something is on the other side of it.
//
// Run: pnpm --filter lyra exec tsx src/dev/role-perimeter-check.ts
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { login, mintToken, ok, report, runtime, server, settle } from './world';

const KEY = 'lab-operator-key';
runtime.operatorKey = KEY;
const PORT = 8798;

// No key and no database, for the reason stripe-check gives: the live path
// creates real objects at a vendor. Every assertion below is about who gets
// through the host's door, which is decided before the integration is reached
// at all — so an integration with nothing configured answers them perfectly well.
delete process.env['STRIPE_SECRET'];
delete process.env['STRIPE_PUBLISHABLE'];
delete process.env['DATABASE_URL'];

const verifyKey = (await (await server.request('/api/integrations/verify-key')).json()) as { key: string };
process.env['LYRA_VERIFY_KEY'] = verifyKey.key;
const service = startIntegrations(PORT);

const operator = async (path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const response = await server.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-operator-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

const install = async (id: string, who: string): Promise<void> => {
  const shell = await login(who);
  await settle(10);
  shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  shell.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: id } });
  await settle(18);
};

const call = async (email: string, path: string): Promise<{ status: number; body: string }> => {
  const response = await server.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(await mintToken(email))}`, 'content-type': 'application/json' },
    body: '{}',
  });
  return { status: response.status, body: (await response.text()).slice(0, 90) };
};

const grantFor = async (email: string, path: string): Promise<number> => {
  const response = await server.request('/api/integrations/frame', {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(await mintToken(email))}`, 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return response.status;
};

// REFUSED AT THE HOST, and the status is the whole assertion. 404 rather than
// 403, like every other branch on that door: what somebody may not reach, they
// do not learn the existence of. Anything else — a 401 from the integration, a
// 409, a 503 — means the call was FORWARDED and the fence is not there.
const refused = (answer: { status: number; body: string }): boolean => answer.status === 404;
// Through the host and answered by the integration. Which answer does not
// matter: with no key configured the payments integration says 503 or 409, and
// that it got to say anything is the point.
const reached = (answer: { status: number; body: string }): boolean => answer.status !== 404;

const { owner, manager, member } = CAST.northrock;

try {
  await operator('/operator/integrations', { id: 'stripe', url: `http://127.0.0.1:${PORT}/stripe` });
  await operator('/operator/integrations/stripe/approve', {});
  await operator('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` });
  await operator('/operator/integrations/belts/approve', {});
  await install('stripe', owner);
  await install('belts', owner);

  // ── THE DESK'S ENDPOINTS ARE THE DESK'S ──────────────────────
  //
  // Four calls, and the last two are why this check exists at all: `connect`
  // creates the studio's merchant account — one per studio, its type immutable,
  // so a premature one strands the studio — and `onboarding-link` mints a form
  // that sets the bank account the studio's money is paid into.
  const desk = [
    ['/integrations/stripe/account', 'what Stripe says about this studio'],
    ['/integrations/stripe/ledger', 'every invoice this studio has raised'],
    ['/integrations/stripe/connect', 'creating the studio’s merchant account'],
    ['/integrations/stripe/onboarding-link', 'the form that sets where the money lands'],
  ] as const;

  for (const [path, what] of desk) {
    const asMember = await call(member, path);
    ok(`a member cannot reach ${what}`, refused(asMember), `${asMember.status} ${asMember.body}`);
  }
  for (const [path, what] of desk) {
    const asOwner = await call(owner, path);
    ok(`...and an owner still can — ${what}`, reached(asOwner), `${asOwner.status} ${asOwner.body}`);
  }

  // ── AND THE MEMBER'S IS THE MEMBER'S ─────────────────────────
  //
  // The fence points both ways or it is not a fence, it is a hierarchy. Dario
  // owns Northrock and trains nowhere: staff, and no membership of his own, so
  // there is no checkout for him to open.
  const ownerPaying = await call(owner, '/integrations/stripe/checkout');
  ok('somebody who is only staff cannot reach a member’s checkout', refused(ownerPaying), `${ownerPaying.status} ${ownerPaying.body}`);
  const memberPaying = await call(member, '/integrations/stripe/checkout');
  ok('...and the member whose checkout it is, can', reached(memberPaying), `${memberPaying.status} ${memberPaying.body}`);

  // A PERSON IS NOT ONE ROLE, and this is the assertion a naive fix breaks.
  //
  // Kaya manages Northrock and trains there — a staff row AND a subscription of
  // her own. "Staff may not touch member endpoints" would have locked her out of
  // paying for her own membership, and it would have looked like security. The
  // rungs ADD, exactly as they do everywhere else in this app, and the checkout
  // she reaches is scoped to her own person by the assertion, so it could only
  // ever have been hers.
  const bothPaying = await call(manager, '/integrations/stripe/checkout');
  ok('somebody who is staff AND a member reaches their own checkout', reached(bothPaying), `${bothPaying.status} ${bothPaying.body}`);
  const bothDesk = await call(manager, '/integrations/stripe/ledger');
  ok('...and the desk screens too, from the same session', reached(bothDesk), `${bothDesk.status} ${bothDesk.body}`);

  // ── THE FRAME DOOR ASKS THE SAME QUESTION ────────────────────
  //
  // It used to ask a weaker one. `frames` was a bare list of paths with no
  // owning screen, so a grant was mintable by anybody signed in at a studio with
  // the integration installed — and spending it served the page that mounts the
  // provider's own onboarding form.
  const SETUP_PAGE = '/integrations/stripe/embed/onboarding';
  ok('a member cannot be granted the setup page', (await grantFor(member, SETUP_PAGE)) === 404, 'a page belongs to the screen that opens it');
  ok('...and an owner can', (await grantFor(owner, SETUP_PAGE)) === 200, 'the same grant, for somebody who holds the screen');

  // ── ONE INTEGRATION IS NOT A SPECIAL CASE ────────────────────
  //
  // This is a property of the host's door, not of the payments integration, so
  // it is asserted somewhere payments are not involved. Belts is the reference
  // integration and its roster is a desk screen.
  const memberRoster = await call(member, '/integrations/belts/roster');
  ok('a member cannot read the belts roster either', refused(memberRoster), `${memberRoster.status} ${memberRoster.body}`);
  const ownerRoster = await call(owner, '/integrations/belts/roster');
  ok('...while the desk reads it', reached(ownerRoster), `${ownerRoster.status} ${ownerRoster.body}`);
  // The member's OWN belts screen, which is the half a blunt "members get
  // nothing" rule would have broken silently.
  const ownBelt = await call(member, '/integrations/belts/mine');
  ok('...and a member still holds their own rank screen', reached(ownBelt), `${ownBelt.status} ${ownBelt.body}`);
  ok('a member cannot be granted the belts summary page', (await grantFor(member, '/integrations/belts/embed/summary')) === 404, 'the roster is a desk screen, so its page is a desk page');

  // ── THE OPERATOR IS NOT A PRINCIPAL ──────────────────────────
  //
  // Their probe asks whether the integration declared a path at all — a question
  // about the bundle, not about anybody's screens. Filtering it by a catalog the
  // operator does not have would make "the screen is empty" harder to answer
  // rather than safer, so it deliberately keeps the weaker check.
  const probe = await operator('/operator/integrations/stripe/probe', { path: 'ledger' });
  ok('an operator may still probe a declared path', probe.status === 200, `${probe.status} — a diagnostic, not a session`);
  const probeUndeclared = await operator('/operator/integrations/stripe/probe', { path: 'internals' });
  ok('...and not an undeclared one', probeUndeclared.status === 404, String(probeUndeclared.status));
} finally {
  await service.close();
}

report('a declared path is not a door: an integration answers the screens a caller actually holds, and nothing beside them.');
