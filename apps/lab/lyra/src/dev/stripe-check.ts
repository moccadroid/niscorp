import { OPERATOR_KEY } from './operator-key'; // first, before the world boots
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { login, mintToken, ok, report, runtime, server, settle, treeOf } from './world';

const KEY = OPERATOR_KEY;
const PORT = 8795;

// `.env` on a developer's machine has a key, and the live path creates a real
// object at a vendor.
delete process.env['STRIPE_SECRET'];
// `.env` carries the dev server's DATABASE_URL; checks on the shared Postgres
// would be order-dependent.
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
  const registered = await operator('/operator/integrations', { id: 'stripe', url: `http://127.0.0.1:${PORT}/stripe` });
  ok('the payments bundle is accepted', registered.status === 200, JSON.stringify({ ...registered.json, key: '…' }).slice(0, 110));
  ok('...with its five screens', registered.json['actions'] === 5, `${String(registered.json['actions'])} actions`);

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

  const before = await asOwner('/integrations/stripe/account');
  ok('an unconnected studio reads as unconnected', before.text.includes('"account_id":""'), before.text.slice(0, 70));

  const connect = await asOwner('/integrations/stripe/connect');
  ok('...and connecting without a key refuses, in a sentence', connect.status === 503 && connect.text.includes('no Stripe key'), `${connect.status} ${connect.text.slice(0, 60)}`);

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
