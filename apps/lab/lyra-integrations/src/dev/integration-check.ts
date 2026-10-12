import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { integrationsApp } from '../serve';
import { mountIntegration } from '../integration';
import { priceKey } from '../integrations/stripe/prices';
import { accountStanding } from '../integrations/stripe/client';
import { deployment, ok, report } from './world';

// serve.ts loads `.env`, which on a developer's machine carries a real verify
// key.
delete process.env['LYRA_VERIFY_KEY'];

// `.env` also carries the dev server's DATABASE_URL; a shared Postgres would
// make the checks order-dependent.
delete process.env['DATABASE_URL'];

const post = async (path: string, init: RequestInit = {}): Promise<{ status: number; text: string }> => {
  const response = await integrationsApp.request(path, { method: 'POST', ...init });
  return { status: response.status, text: (await response.text()).slice(0, 300) };
};

const NORTHROCK = { principal: 'p_omar', scope: { studioId: 'st_northrock', personId: 'p_omar' } };

const bundle = await integrationsApp.request('/belts/bundle');
const bundleJson = (await bundle.json()) as { integration?: string };
ok('an integration is served at its own prefix', bundle.status === 200 && bundleJson.integration === 'belts', `${bundle.status} · ${bundleJson.integration}`);
ok('...and the prefix is applied by the mounting, not written into the route', (await integrationsApp.request('/bundle')).status === 404, 'an integration mounts /bundle; only one place turns that into /belts/bundle');
ok('...so a second integration does not collide with the first', (await integrationsApp.request('/hookclaim/bundle')).status === 200, 'two integrations, two prefixes, one process');

const roster = await post('/belts/roster');
ok('an integration route exists under its prefix', roster.status === 401, `${roster.status} — reached the handler, which asked who was calling`);
ok('...and does not exist outside it', (await post('/roster')).status === 404, 'relative routes cannot be served at somebody else’s address');

ok('with no deployment key, nothing is identity', roster.status === 401, 'the correct default for a service that cannot verify anything');

const lyra = deployment();
process.env['LYRA_VERIFY_KEY'] = lyra.verifyKey;

const admitted = await post('/belts/roster', {
  headers: { authorization: `Bearer ${lyra.mint({ integration: 'belts', ...NORTHROCK })}`, 'content-type': 'application/json' },
  body: '{}',
});
ok('a genuine assertion is admitted', admitted.status === 200, admitted.text.slice(0, 80));
ok('...and answers about the studio the TOKEN named', admitted.text.includes('p_omar') && !admitted.text.includes('st_lumen'), 'scope came from the envelope, never from the body');

const impostor = deployment();
const wrongSigner = await post('/belts/roster', {
  headers: { authorization: `Bearer ${impostor.mint({ integration: 'belts', ...NORTHROCK })}` },
});
ok('a well-formed token from the wrong signer is refused', wrongSigner.status === 401, String(wrongSigner.status));

const expired = await post('/belts/roster', {
  headers: { authorization: `Bearer ${lyra.mint({ integration: 'belts', ...NORTHROCK }, -1)}` },
});
ok('...and an expired one', expired.status === 401, 'a token lives seconds; one found in a log is not a credential');

const sideways = await post('/belts/roster', {
  headers: { authorization: `Bearer ${lyra.mint({ integration: 'hookclaim', ...NORTHROCK })}` },
});
ok('a token minted for another integration is refused', sideways.status === 401, 'the audience is derived from the mounting — no handler can forget it');

process.env['DECLARED_BY_PROBE'] = 'visible';
process.env['NEVER_DECLARED'] = 'should-be-unreachable';
const probeApp = new Hono();
mountIntegration(probeApp, {
  id: 'probe',
  bundle: () => ({ integration: 'probe' }),
  env: ['DECLARED_BY_PROBE'],
  mount: (r, ctx) => {
    r.post('/declared', (c) => c.json({ value: ctx.env('DECLARED_BY_PROBE') }));
    r.post('/undeclared', (c) => {
      try {
        return c.json({ value: ctx.env('NEVER_DECLARED') });
      } catch (err) {
        return c.json({ threw: String(err) });
      }
    });
  },
});
const declared = await (await probeApp.request('/probe/declared', { method: 'POST' })).json() as { value?: string };
ok('an integration reads what it declared', declared.value === 'visible', String(declared.value));
const undeclared = await (await probeApp.request('/probe/undeclared', { method: 'POST' })).json() as { threw?: string };
ok('...and reading what it did not THROWS', (undeclared.threw ?? '').includes('without declaring it'), undeclared.threw ?? '(returned a value)');
ok('...rather than answering empty', !(undeclared.threw ?? '').includes('should-be-unreachable'), 'a silent empty string reads as a configuration problem for as long as anybody will look');

const PAYLOAD = '{"id":"evt_1",  "type":"ping","n":0.10}';
process.env['BELTS_HOOK_SECRET'] = 'lab-hook-secret';
const unsigned = await post('/belts/hook/ping', { body: PAYLOAD, headers: { 'content-type': 'application/json' } });
ok('a hook route lives under the integration’s /hook/', unsigned.status === 401, `${unsigned.status} — reached the handler, which refused it`);
ok('...and refuses an unsigned call itself', unsigned.text.includes('Who are you?'), 'nobody vouched for this caller, so the integration had to ask');

const digest = createHash('sha256').update(Buffer.from(PAYLOAD)).digest('hex');
ok('...having received the bytes exactly', unsigned.text.includes(digest), `sha256 ${digest.slice(0, 16)}… over ${Buffer.byteLength(PAYLOAD)} bytes`);

const signature = createHash('sha256').update('lab-hook-secret').update(Buffer.from(PAYLOAD)).digest('hex');
const signed = await post('/belts/hook/ping', { body: PAYLOAD, headers: { 'content-type': 'application/json', 'x-belts-signature': signature } });
ok('...and accepts one it can verify', signed.status === 200, signed.text.slice(0, 60));

const assertedAtHook = await post('/belts/hook/ping', {
  body: PAYLOAD,
  headers: { 'content-type': 'application/json', authorization: `Bearer ${lyra.mint({ integration: 'belts', ...NORTHROCK })}` },
});
ok('a valid assertion does not open the hook door', assertedAtHook.status === 401, 'different door, different key — the signature is the only thing that opens it');

const stubStripe = (payload: unknown) => ({ rawRequest: async () => payload }) as unknown as Parameters<typeof accountStanding>[0];

const active = await accountStanding(stubStripe({ configuration: { merchant: { capabilities: { card_payments: { status: 'active' } } } }, requirements: { entries: [] } }), 'acct_x');
ok('an active account is ready', active.state === 'ready' && active.ready, active.detail);

const needs = await accountStanding(
  stubStripe({
    configuration: { merchant: { capabilities: { card_payments: { status: 'restricted' } } } },
    requirements: { entries: [{ awaiting_action_from: 'user' }, { awaiting_action_from: 'user' }] },
  }),
  'acct_x',
);
ok('requirements the STUDIO must fill are needs_info', needs.state === 'needs_info' && needs.actionable === 2, needs.detail);

const review = await accountStanding(
  stubStripe({
    configuration: { merchant: { capabilities: { card_payments: { status: 'restricted' } } } },
    requirements: { entries: [{ awaiting_action_from: 'stripe' }] },
  }),
  'acct_x',
);
ok('when only Stripe is left to act, it is in_review', review.state === 'in_review' && review.actionable === 0, review.detail);
ok('...and in_review is not offered a form, so nobody circles', review.actionable === 0, 'no user-actionable requirement means no button');

const shape = { accountId: 'acct_one', amount: 8900, currency: 'EUR', interval: 'month' as const, intervalCount: 1 };

ok('the same shape is the same price', priceKey(shape) === priceKey({ ...shape }), priceKey(shape));
ok('...however the currency is spelled', priceKey(shape) === priceKey({ ...shape, currency: 'eur' }), 'EUR and eur are one currency, not two Prices');

ok('a different amount is a different price', priceKey(shape) !== priceKey({ ...shape, amount: 9900 }), 'a plan edit produces a new Price at the next checkout, and nobody already on the old one moves');
ok('...a different interval too', priceKey(shape) !== priceKey({ ...shape, interval: 'year' }), 'yearly at the same number is not the same price');
ok('...and a different COUNT most of all', priceKey(shape) !== priceKey({ ...shape, intervalCount: 3 }), 'quarterly at the same number is not the same price as monthly');

ok('...and so is the studio it belongs to', priceKey(shape) !== priceKey({ ...shape, accountId: 'acct_two' }), 'two studios at one number are two Prices, on two merchants');

ok('the key is made of the money and nothing else', priceKey(shape) === 'acct_one:8900:eur:month:1', priceKey(shape));

const integrationDirs = readdirSync(join(process.cwd(), 'src', 'integrations'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
ok('the integrations are discoverable by directory', integrationDirs.length > 0, integrationDirs.join(', '));

const TABLE_IN_SQL = /(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+([a-z_][a-z0-9_]*)/gi;
const strayTables: string[] = [];
for (const integration of integrationDirs) {
  const dir = join(process.cwd(), 'src', 'integrations', integration);
  const files = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.ts'));
  for (const file of files) {
    const text = readFileSync(join(dir, file.name), 'utf8');
    for (const match of text.matchAll(TABLE_IN_SQL)) {
      const name = (match[1] ?? '').toLowerCase();
      if (!name.includes('_')) continue;
      const owner = name.split('_')[0] ?? '';
      if (integrationDirs.includes(owner) && owner !== integration) strayTables.push(`${integration}/${file.name}: ${name}`);
    }
  }
}
ok('no integration names another integration’s table', strayTables.length === 0, strayTables.join(', ') || `${integrationDirs.length} integrations, each inside its own prefix`);

const CAUGHT = [...'SELECT * FROM belts_records'.matchAll(TABLE_IN_SQL)].map((m) => (m[1] ?? '').split('_')[0]);
ok('...and the rule would catch one', CAUGHT.includes('belts'), 'a bare table name carrying somebody else’s prefix');

report('one process, several integrations: each at its own prefix, with its own audience, its own env, and its own door.');
