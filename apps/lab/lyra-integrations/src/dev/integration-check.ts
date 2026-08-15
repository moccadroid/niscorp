// THE INTEGRATION CONTRACT — what one process hosting several integrations must hold.
//
// This service used to be one Hono app with every route written out longhand:
// `app.post('/belts/roster')` nine times, `identity(c, 'belts')` nine times.
// Both are the same bug waiting — a call site that says the wrong name, or
// forgets — and neither is visible in a diff. The mounting derives them now, so
// this is the check that the derivation is real and not just tidier prose.
//
// It runs WITHOUT LYRA. That is the point: a separate service in its own
// repository can state its own rules, and it does not get to borrow the host's
// harness (see dev/world.ts) or the host's signer to do it.
//
// Run: pnpm --filter lyra-integrations check
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
// key. A check owns its environment or it is testing that machine.
delete process.env['LYRA_VERIFY_KEY'];

// AND NO DATABASE. The checks each boot an isolated world in-process; pointing
// them at the shared Postgres would make them order-dependent and flaky, and
// that isolation is what has caught most of the bugs here. The .env file carries a
// DATABASE_URL for the dev server, so this has to be deliberate rather than
// left to whether somebody happened to export one.
delete process.env['DATABASE_URL'];

const post = async (path: string, init: RequestInit = {}): Promise<{ status: number; text: string }> => {
  const response = await integrationsApp.request(path, { method: 'POST', ...init });
  return { status: response.status, text: (await response.text()).slice(0, 300) };
};

const NORTHROCK = { principal: 'p_omar', scope: { studioId: 'st_northrock', personId: 'p_omar' } };

// ── every integration answers at its own prefix, and nowhere else ───
const bundle = await integrationsApp.request('/belts/bundle');
const bundleJson = (await bundle.json()) as { integration?: string; frames?: Record<string, string> };
ok('an integration is served at its own prefix', bundle.status === 200 && bundleJson.integration === 'belts', `${bundle.status} · ${bundleJson.integration}`);
ok('...and the prefix is applied by the mounting, not written into the route', (await integrationsApp.request('/bundle')).status === 404, 'an integration mounts /bundle; only one place turns that into /belts/bundle');
ok('...so a second integration does not collide with the first', (await integrationsApp.request('/hookclaim/bundle')).status === 200, 'two integrations, two prefixes, one process');

const roster = await post('/belts/roster');
ok('an integration route exists under its prefix', roster.status === 401, `${roster.status} — reached the handler, which asked who was calling`);
ok('...and does not exist outside it', (await post('/roster')).status === 404, 'relative routes cannot be served at somebody else’s address');

// ── with no verify key, identity is not merely absent ────────
ok('with no deployment key, nothing is identity', roster.status === 401, 'the correct default for a service that cannot verify anything');

// ── with one, the envelope decides ───────────────────────────
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

// THE ASSERTION THIS REFACTOR EXISTS FOR.
//
// The audience is no longer a literal at each call site — it is the integration's id,
// bound once when it was mounted. So a token minted for a DIFFERENT integration on
// this same deployment is refused by a handler that never mentions audiences at
// all, which is what makes forgetting impossible rather than unlikely.
const sideways = await post('/belts/roster', {
  headers: { authorization: `Bearer ${lyra.mint({ integration: 'hookclaim', ...NORTHROCK })}` },
});
ok('a token minted for another integration is refused', sideways.status === 401, 'the audience is derived from the mounting — no handler can forget it');

// ── the env fence ────────────────────────────────────────────
//
// Two integrations in one process means one integration's secret is one import
// away from the other. It is not a convention that stops that; it is the accessor.
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

// ── hooks are a different router ─────────────────────────────
//
// No assertion is minted on that path by the host, so the context a hook gets
// carries no identity function at all — it cannot believe it has a caller. What
// it must do instead is check the vendor's signature itself.
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

// An assertion is not a hook credential and never was: the host mints none here.
const assertedAtHook = await post('/belts/hook/ping', {
  body: PAYLOAD,
  headers: { 'content-type': 'application/json', authorization: `Bearer ${lyra.mint({ integration: 'belts', ...NORTHROCK })}` },
});
ok('a valid assertion does not open the hook door', assertedAtHook.status === 401, 'different door, different key — the signature is the only thing that opens it');

// ── WHOSE COURT IS THE BALL IN ─────────────────────────────
//
// The setup screen offered "Enter business details" whenever an account was not
// active — including when Stripe was reviewing and the studio had nothing to do.
// The owner clicked, Stripe had no step for them, and bounced them back: the
// "opens and closes" churn. The fix reads `awaiting_action_from` on each Stripe
// requirement — `user` means the studio must act, `stripe` means wait — and only
// a `user` requirement puts a button on the screen.
//
// A stub Stripe stands in for the network: the mapping is the logic worth
// pinning, and it is pure over the shape Stripe returns.
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
    // Not active, but everything left is Stripe's to review — the studio has
    // nothing to do, so the screen must NOT offer it a button.
    requirements: { entries: [{ awaiting_action_from: 'stripe' }] },
  }),
  'acct_x',
);
ok('when only Stripe is left to act, it is in_review', review.state === 'in_review' && review.actionable === 0, review.detail);
ok('...and in_review is not offered a form, so nobody circles', review.actionable === 0, 'no user-actionable requirement means no button');

// ── A PRICE IS ITS OWN ADDRESS (S7) ──────────────────────────
//
// There is no sync loop between lyra's price list and Stripe's, because a loop
// has to decide what happens when the two disagree and every answer to that is
// wrong for somebody already paying. Instead a Price is addressed by what it IS,
// and the addressing function is pure — so the property is checkable here,
// without a network and without a vendor.
//
// The live half (ask twice, get one Price; raise the price, get a second and
// keep the first) was verified against the sandbox by hand. What must not drift
// is the key itself: every field that changes the money has to change the
// address, and nothing else may.
const shape = { accountId: 'acct_one', amount: 8900, currency: 'EUR', interval: 'month' as const, intervalCount: 1 };

ok('the same shape is the same price', priceKey(shape) === priceKey({ ...shape }), priceKey(shape));
ok('...however the currency is spelled', priceKey(shape) === priceKey({ ...shape, currency: 'eur' }), 'EUR and eur are one currency, not two Prices');

ok('a different amount is a different price', priceKey(shape) !== priceKey({ ...shape, amount: 9900 }), 'a plan edit produces a new Price at the next checkout, and nobody already on the old one moves');
ok('...a different interval too', priceKey(shape) !== priceKey({ ...shape, interval: 'year' }), 'yearly at the same number is not the same price');
// THE COUNT, which is the one that would have been silent and expensive.
// €89 monthly and €89 quarterly differ in no other field, so a key without the
// count addresses ONE Price — and every quarterly subscriber is billed monthly,
// with the mirror agreeing and nothing to notice.
ok('...and a different COUNT most of all', priceKey(shape) !== priceKey({ ...shape, intervalCount: 3 }), 'quarterly at the same number is not the same price as monthly');

// THE ACCOUNT IS IN THE KEY, and this is the one that would be silent. Prices
// live on the CONNECTED account — two studios charging €89 a month are two
// Prices on two merchants, and a key that omitted the account would hand the
// second studio the first studio's Price and settle the money to the wrong bank.
ok('...and so is the studio it belongs to', priceKey(shape) !== priceKey({ ...shape, accountId: 'acct_two' }), 'two studios at one number are two Prices, on two merchants');

// The plan id is deliberately absent: two plans at the same price on the same
// interval ARE the same price, and giving them separate Stripe objects would
// invent a distinction Stripe has no use for.
// The period is TWO segments because it is two facts — a unit and a count. Spelled
// out here rather than asserted by length, so a field added to the key without a
// reason has to come and edit this line and say what it is.
ok('the key is made of the money and nothing else', priceKey(shape) === 'acct_one:8900:eur:month:1', priceKey(shape));

// ── ONE DATABASE, ONE PREFIX PER INTEGRATION ─────────────────
//
// Every integration in this service shares one Postgres, so the table prefix IS the
// boundary between two integrations' data. `ctx.db.table('accounts')` applies it — a
// integration names `accounts` and gets `stripe_accounts` and cannot spell it
// otherwise from there.
//
// Which leaves exactly one way to cross: writing another integration's table name out
// by hand in a query. TypeScript has nothing to say about a string, so this
// does. Same argument as the cross-integration import rule in separation-check: the
// two integrations that will matter are a rank tracker and something holding payment
// identifiers, and they are in the same process.
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
      // `${db.table('accounts')}` interpolates, so the literal in the source is
      // the interpolation itself and never a bare table name. A bare one that
      // carries somebody else's prefix is the thing being looked for.
      if (!name.includes('_')) continue;
      const owner = name.split('_')[0] ?? '';
      if (integrationDirs.includes(owner) && owner !== integration) strayTables.push(`${integration}/${file.name}: ${name}`);
    }
  }
}
ok('no integration names another integration’s table', strayTables.length === 0, strayTables.join(', ') || `${integrationDirs.length} integrations, each inside its own prefix`);

// The rule has to be able to see one, or it is a comment.
const CAUGHT = [...'SELECT * FROM belts_records'.matchAll(TABLE_IN_SQL)].map((m) => (m[1] ?? '').split('_')[0]);
ok('...and the rule would catch one', CAUGHT.includes('belts'), 'a bare table name carrying somebody else’s prefix');

// ── what the bundle promises about itself ────────────────────
const frames = Object.entries(bundleJson.frames ?? {});
ok('a framed page is declared, not conjured', frames.every(([path]) => path.startsWith('/integrations/belts/')), JSON.stringify(bundleJson.frames ?? {}));
// A page with no owning screen is one the host can only gate on "signed in and
// installed" — which is what let a member reach a desk page. The owner is the
// declaration that makes the grant answerable to the charter.
ok('...and belongs to a screen, so a grant can be refused', frames.every(([, actionId]) => actionId.startsWith('ext.')), frames.map(([, a]) => a).join(', ') || 'none declared');

report('one process, several integrations: each at its own prefix, with its own audience, its own env, and its own door.');
