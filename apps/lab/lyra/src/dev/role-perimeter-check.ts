import { OPERATOR_KEY } from './operator-key'; // first, before the world boots
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { login, mintToken, ok, report, server, settle } from './world';

const KEY = OPERATOR_KEY;
const PORT = 8798;

// No key and no database: the live path creates real objects at a vendor.
delete process.env['STRIPE_SECRET'];
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

// The host refuses with 404, not 403. Any other status means the call was
// forwarded: with no key configured the payments integration says 503 or 409.
const refused = (answer: { status: number; body: string }): boolean => answer.status === 404;
const reached = (answer: { status: number; body: string }): boolean => answer.status !== 404;

const { owner, manager, member } = CAST.northrock;

try {
  await operator('/operator/integrations', { id: 'stripe', url: `http://127.0.0.1:${PORT}/stripe` });
  await operator('/operator/integrations/stripe/approve', {});
  await operator('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` });
  await operator('/operator/integrations/belts/approve', {});
  await install('stripe', owner);
  await install('belts', owner);

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

  const ownerPaying = await call(owner, '/integrations/stripe/checkout');
  ok('somebody who is only staff cannot reach a member’s checkout', refused(ownerPaying), `${ownerPaying.status} ${ownerPaying.body}`);
  const memberPaying = await call(member, '/integrations/stripe/checkout');
  ok('...and the member whose checkout it is, can', reached(memberPaying), `${memberPaying.status} ${memberPaying.body}`);

  const bothPaying = await call(manager, '/integrations/stripe/checkout');
  ok('somebody who is staff AND a member reaches their own checkout', reached(bothPaying), `${bothPaying.status} ${bothPaying.body}`);
  const bothDesk = await call(manager, '/integrations/stripe/ledger');
  ok('...and the desk screens too, from the same session', reached(bothDesk), `${bothDesk.status} ${bothDesk.body}`);

  const staffBuying = await call(owner, '/integrations/stripe/purchase');
  ok('somebody who is only staff cannot buy as a member', refused(staffBuying), `${staffBuying.status} ${staffBuying.body}`);
  const staffPortal = await call(owner, '/integrations/stripe/portal');
  ok('...nor open a member’s payment settings', refused(staffPortal), `${staffPortal.status} ${staffPortal.body}`);
  const ownPortal = await call(member, '/integrations/stripe/portal');
  ok('...and a member reaches their own', reached(ownPortal), `${ownPortal.status} ${ownPortal.body}`);

  const memberRoster = await call(member, '/integrations/belts/roster');
  ok('a member cannot read the belts roster either', refused(memberRoster), `${memberRoster.status} ${memberRoster.body}`);
  const ownerRoster = await call(owner, '/integrations/belts/roster');
  ok('...while the desk reads it', reached(ownerRoster), `${ownerRoster.status} ${ownerRoster.body}`);
  const ownBelt = await call(member, '/integrations/belts/mine');
  ok('...and a member still holds their own rank screen', reached(ownBelt), `${ownBelt.status} ${ownBelt.body}`);

  const probe = await operator('/operator/integrations/stripe/probe', { path: 'ledger' });
  ok('an operator may still probe a declared path', probe.status === 200, `${probe.status} — a diagnostic, not a session`);
  const probeUndeclared = await operator('/operator/integrations/stripe/probe', { path: 'internals' });
  ok('...and not an undeclared one', probeUndeclared.status === 404, String(probeUndeclared.status));
} finally {
  await service.close();
}

report('a declared path is not a door: an integration answers the screens a caller actually holds, and nothing beside them.');
