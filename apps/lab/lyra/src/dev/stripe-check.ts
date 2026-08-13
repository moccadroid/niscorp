// THE PAYMENTS PACK, up to the point where money would move.
//
// Everything here runs WITHOUT a Stripe key, on purpose. The live path — create
// a connected account, mint an account session, mount Stripe's own onboarding
// form — was verified against the sandbox by hand and cannot live in a suite:
// it is a network call that creates a real object at a vendor. What a check can
// hold is everything around it, which is where the mistakes actually are: what
// the bundle is allowed to declare, which page may be framed, how far a framed
// page may reach back, and what the pack says when it has no key.
//
// A pack that refuses cleanly with no key is not a detail. It is the state every
// deployment is in before an operator pastes one, and "it crashed" and "it says
// payments are not configured" look identical from a screen until somebody looks.
//
// Run: pnpm --filter lyra exec tsx src/dev/stripe-check.ts
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { mintToken } from '@lyra/server/users';
import { login, ok, report, runtime, server, settle, treeOf } from './world';

const KEY = 'lab-operator-key';
runtime.operatorKey = KEY;
const PORT = 8795;

// No key, deliberately — see above. `.env` on a developer's machine has one.
delete process.env['STRIPE_SECRET'];
delete process.env['STRIPE_PUBLISHABLE'];
// AND NO DATABASE. The checks each boot an isolated world in-process; pointing
// them at the shared Postgres would make them order-dependent and flaky, and
// that isolation is what has caught most of the bugs here. The .env file carries a
// DATABASE_URL for the dev server, so this has to be deliberate rather than
// left to whether somebody happened to export one.
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

const asOwner = async (path: string, body: unknown = {}): Promise<{ status: number; text: string; type: string }> => {
  const response = await server.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(mintToken(CAST.northrock.owner))}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text(), type: response.headers.get('content-type') ?? '' };
};

try {
  // ── intake accepts what the bundle declares ──────────────────
  const registered = await operator('/operator/integrations', { id: 'stripe', url: `http://127.0.0.1:${PORT}/stripe` });
  ok('the payments bundle is accepted', registered.status === 200, JSON.stringify({ ...registered.json, key: '…' }).slice(0, 110));
  // Setup and the money hub for the studio, payment for the member. The count
  // is asserted rather than the names because intake is what decides whether
  // an action lands at all — a screen refused for a bad layout would otherwise
  // just be a screen nobody noticed was missing.
  ok('...with its three screens', registered.json['actions'] === 3, `${String(registered.json['actions'])} actions`);

  // `hub.money` had to be OFFERED by lyra before this bundle could name it —
  // intake refuses a placement into a hub the host does not advertise. This is
  // the assertion that the two halves agree.
  const row = await runtime.db.query("SELECT place_in, preview FROM integration_actions WHERE action_id = 'ext.desk.stripe.ledger'");
  ok('...and the money screen is placed in the money hub', (row.rows[0] as { place_in?: string } | undefined)?.place_in === 'hub.money', 'a hub the host offers, or the bundle is refused whole');

  await operator('/operator/integrations/stripe/approve', {});
  const owner = login(CAST.northrock.owner);
  await settle(10);
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'stripe' } });
  await settle(18);
  ok('a studio can install it', treeOf(owner).includes('Card and SEPA payments for memberships'), 'the store tile, from the bundle’s own words');

  // ── with no key, it says so ──────────────────────────────────
  const before = await asOwner('/integrations/stripe/account');
  ok('an unconnected studio reads as unconnected', before.text.includes('"account_id":""'), before.text.slice(0, 70));

  const connect = await asOwner('/integrations/stripe/connect');
  ok('...and connecting without a key refuses, in a sentence', connect.status === 503 && connect.text.includes('no Stripe key'), `${connect.status} ${connect.text.slice(0, 60)}`);

  // ── the frame: declared, granted, and nothing else ───────────
  const grant = await asOwner('/api/integrations/frame', { path: '/integrations/stripe/embed/onboarding' });
  const src = String((JSON.parse(grant.text) as { src?: string }).src ?? '');
  ok('the onboarding page can be granted', grant.status === 200 && src.startsWith('/integrations/stripe/frame/'), src || grant.text.slice(0, 80));

  const undeclared = await asOwner('/api/integrations/frame', { path: '/integrations/stripe/embed/secret' });
  ok('...and a page it did not declare cannot', undeclared.status === 404, String(undeclared.status));

  const page = await server.request(src);
  const html = await page.text();
  ok('spending the grant serves the pack’s own document', page.status === 200 && (page.headers.get('content-type') ?? '').includes('text/html'), page.headers.get('content-type') ?? '');
  // Not the key message: with no account there is nothing to onboard yet, and
  // the page says THAT. Either way it is a sentence rather than a blank frame.
  ok('...which says where the studio stands', html.includes('not been connected'), 'a page that explains beats a page that is blank');

  // ── A FRAMED PAGE MAY CALL BACK, AND ONLY BESIDE ITSELF ──────
  //
  // The page is sandboxed without `allow-same-origin`, so it has no session and
  // nothing to authenticate with but the grant it was opened by. That callback
  // is real reach, so it is bounded to one plain segment in the declared page's
  // own directory: `embed/onboarding` may call `embed/session` and nothing else.
  const token = src.split('/').pop() ?? '';
  const beside = await server.request(`/integrations/stripe/frame/${token}/session`, { method: 'POST', body: '{}' });
  const besideBody = await beside.text();
  // The PACK's own words, not the host's. Both answer 404 here — the pack
  // because this studio has no account, the host when it refuses to forward —
  // so the status alone would not tell them apart, and asserting on it would
  // have passed just as well if the callback had never been wired.
  ok('a framed page may call back beside itself', besideBody.includes('Not connected'), `${beside.status} ${besideBody.slice(0, 40)} — the pack answered, so the callback reached it`);

  const climbing = await server.request(`/integrations/stripe/frame/${token}/..`, { method: 'POST', body: '{}' });
  // Refused before it is even a callback: the URL collapses and lands on the
  // proxy, which wants a principal an iframe does not have. Two fences, and
  // this one happens to be the outer.
  ok('...but cannot climb', climbing.status >= 400, `${climbing.status} — normalised away before the segment rule even runs`);

  const dotted = await server.request(`/integrations/stripe/frame/${token}/embed.session`, { method: 'POST', body: '{}' });
  ok('...nor reach a path of its own choosing', dotted.status === 404, 'one plain segment, in one directory');

  const forgedToken = await server.request('/integrations/stripe/frame/deadbeefdeadbeefdeadbeef/session', { method: 'POST', body: '{}' });
  ok('...and an invented grant calls back nothing', forgedToken.status === 404, String(forgedToken.status));

  // ── the SDK stays on this side of the wire ───────────────────
  const manifest = await import('node:fs').then((fs) => fs.readFileSync('package.json', 'utf8'));
  ok('lyra depends on no payment SDK', !/stripe/i.test(manifest), 'the pack carries it; frame-check asserts the same for imports');
} finally {
  await service.close();
}

report('payments arrive as a pack: declared, placed, framed — and honest about having no key.');
