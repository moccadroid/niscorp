// The integrations service is a separate process, and the app degrades
// structurally when it is not there.
//
// This is the half of "functions as cloud" that only shows up when something
// breaks: an integration deploys on its own clock, so it can be mid-deploy,
// rate-limited or simply down while the main app is perfectly healthy. What must
// never happen is our database claiming a door credential exists because a
// process did not answer.
//
// The world's boot pulls the bundles from a live service (world starts it),
// so the failure phase is made, not found: the check STOPS the world's
// service, proves the app degrades in sentences and writes nothing, then
// starts a fresh one and runs the success path against it.
//
// Run: pnpm --filter atrium exec tsx src/dev/integrations-check.ts
import { startIntegrationsService, integrationsBase } from '@atrium/integrations/service';
import { integrations, login, settle, topData, mounted, tap, tapCard, cardData, composed, menuIds, sql, check, report } from './world';

type Row = Record<string, unknown>;
const rows = (data: Record<string, unknown>, key: string): Row[] => (Array.isArray(data[key]) ? (data[key] as Row[]) : []);

// Enable the key on Opera's offer and go live — the capability has to exist
// before its failure mode can be tested.
const enableOperaKeys = async (): Promise<void> => {
  const vendor = await login('atrium');
  await settle();
  const opera = rows(cardData(vendor, 'deploy.connectors'), 'rows').find((c) => c['connector_id'] === 'con_opera');
  tapCard(vendor, 'deploy.connectors', 'pick', opera);
  await settle();
  const offer = rows(cardData(vendor, 'deploy.connectors'), 'offer');
  tapCard(vendor, 'deploy.connectors', 'stage-on', offer.find((o) => o['capability_id'] === 'key.issue'));
  await settle();
  tapCard(vendor, 'deploy.connectors', 'golive');
  await settle(12);
};

const openKeyAction = async (): Promise<ReturnType<typeof login>> => {
  const amara = await login('amara');
  await settle();
  const slot = rows(topData(amara, 'main'), 'slots').find((s) => s['action_id'] === 'stay.key');
  check('the key action is live after enabling it', slot !== undefined);
  tap(amara, 'main', 'open', slot);
  await settle();
  check('it opened', mounted(amara, 'sheet').includes('stay.key'));
  return amara;
};

const main = async (): Promise<void> => {
  await enableOperaKeys();

  // ── the service goes DOWN ──
  // The go-live above already pulled while it was up; closing it now leaves
  // the last-synced rows serving, which is exactly the degradation claim.
  await integrations.close();
  const amara = await openKeyAction();
  tap(amara, 'sheet', 'cut');
  await settle(12);

  const sheetData = topData(amara, 'sheet');
  const message = String(sheetData['error'] ?? '');
  check('cutting a key fails when the connector is unreachable', message !== '');
  check('...and says which service, in a sentence a guest can read', message.includes('Opera Cloud'));
  check('...and says explicitly that nothing was issued', message.includes('no key was issued'));

  const stay = await sql(`SELECT key_issued FROM stays WHERE id = 'stay_amara'`);
  check('the database does NOT claim a key exists', stay[0]?.['key_issued'] === false);

  // The rest of the application is untouched by a dead connector.
  const rosa = await login('rosa');
  await settle();
  // Her whole surface still composes with the service down — those cards are
  // ROWS, synced earlier; only live calls into the connector fail.
  check('the front desk is unaffected', composed(rosa).length > 0);
  // Bundle surfaces arrive in the MENU now — the working column is a stack she
  // opens onto rather than a pile composed for her. Same resolved rows either way.
  check('...including the surfaces that integration shipped', menuIds(rosa).some((id) => id.startsWith('ext.desk.')));
  check("the guest's own surface is unaffected", rows(topData(amara, 'main'), 'slots').length > 0);

  // ── now start the real service and try again ──
  // The hermetic port no-llm set — the seeded service_url rows already point
  // at it, and its being free until THIS line is what made the failure phase
  // honest, dev connector or no dev connector.
  const connector = await startIntegrationsService();

  tap(amara, 'sheet', 'cut');
  await settle(14);

  const after = topData(amara, 'sheet');
  check('with the service up, a credential comes back', String(after['credential'] ?? '') !== '');
  check('...and the error is cleared', String(after['error'] ?? '') === '');

  const issued = await sql(`SELECT key_issued FROM stays WHERE id = 'stay_amara'`);
  check('...and only NOW does the database record a key', issued[0]?.['key_issued'] === true);

  // The connector refuses what its own version does not implement — belt and
  // braces against the app ever offering something it should not have.
  const refused = await fetch(`${integrationsBase()}/mews/key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stay: 'MEWS-RES-7781', version: 3 }),
  });
  check('the Mews connector refuses to cut a key at any version', refused.status === 409);

  await connector.close();
  // Windows libuv aborts if process.exit races the just-closed listener's
  // async handles — one settle lets the loop drain before report() exits.
  await settle(2);
  report('the integrations service is a separate process');
};

void main();
