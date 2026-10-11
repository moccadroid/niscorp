// THE PAYMENTS INTEGRATION, up to the point where money would move.
//
// Everything here runs WITHOUT a Stripe key, on purpose. The live path — create
// a connected account, send its owner to Stripe's own hosted onboarding — is a
// network call that creates a real object at a vendor, and cannot live in a
// suite. What a check can hold is everything around it: what the bundle is
// allowed to declare, and what the integration says when it has no key.
//
// An integration that refuses cleanly with no key is not a detail. It is the state every
// deployment is in before an operator pastes one, and "it crashed" and "it says
// payments are not configured" look identical from a screen until somebody looks.
//
// Run: pnpm --filter lyra exec tsx src/dev/stripe-check.ts
import { OPERATOR_KEY } from './operator-key'; // FIRST — before the world boots; see that file
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { login, mintToken, ok, report, runtime, server, settle, treeOf } from './world';

// Set in `./operator-key` BEFORE the world is imported: moss reads it once, at boot.
const KEY = OPERATOR_KEY;
const PORT = 8795;

// No key, deliberately — see above. `.env` on a developer's machine has one.
delete process.env['STRIPE_SECRET'];
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
    headers: { Authorization: `Bearer ${String(await mintToken(CAST.northrock.owner))}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text(), type: response.headers.get('content-type') ?? '' };
};

try {
  // ── intake accepts what the bundle declares ──────────────────
  const registered = await operator('/operator/integrations', { id: 'stripe', url: `http://127.0.0.1:${PORT}/stripe` });
  ok('the payments bundle is accepted', registered.status === 200, JSON.stringify({ ...registered.json, key: '…' }).slice(0, 110));
  // Setup, the money hub and a panel on a member for the studio; paying for a
  // membership and buying
  // a pass for the member. The count
  // is asserted rather than the names because intake is what decides whether
  // an action lands at all — a screen refused for a bad layout would otherwise
  // just be a screen nobody noticed was missing.
  ok('...with its five screens', registered.json['actions'] === 5, `${String(registered.json['actions'])} actions`);

  // `hub.money` had to be OFFERED by lyra before this bundle could name it —
  // lyra's own check of a bundle's `extension` refuses a placement into a hub
  // it does not offer. This is the assertion that the two halves agree.
  const row = await runtime.db.query("SELECT extension->'placements'->>'ext.desk.stripe.ledger' AS placed FROM integrations WHERE id = 'stripe'");
  ok('...and the money screen is placed in the money hub', (row.rows[0] as { placed?: string } | undefined)?.placed === 'hub.money', 'a hub the host offers, or the bundle is refused whole');

  await operator('/operator/integrations/stripe/approve', {});
  const owner = await login(CAST.northrock.owner);
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

  // ── the SDK stays on this side of the wire ───────────────────
  //
  // A host that imported a payment provider's SDK would carry that dependency
  // into every app that installs the integration, so the absence is asserted:
  // in what this app imports, and in what it depends on.
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const sourcesUnder = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'dev' ? [] : sourcesUnder(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  const vendorRefs = sourcesUnder(join(process.cwd(), 'src')).filter((file) => /@stripe\/|from ['"]stripe['"]|require\(['"]stripe['"]\)/.test(readFileSync(file, 'utf8')));
  ok('this app imports no payment SDK', vendorRefs.length === 0, vendorRefs.join(', ') || 'the integration carries it');
  ok('...and depends on none', !/stripe/i.test(readFileSync('package.json', 'utf8')), 'a dependency here is a dependency for every app that installs the integration');
} finally {
  await service.close();
}

report('payments arrive as an integration: declared, placed — and honest about having no key.');
