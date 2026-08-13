// The app ships knowing NOTHING about Opera, Mews or HotelFix.
//
// Everything it can do with an integration — the capability matrix, the
// actions, the queries, the slots, the menus — arrives over the wire from
// that integration's own service and is validated at intake before a row
// moves. This check watches that happen, in order:
//
//   1. a freshly seeded database holds ZERO integration rows
//   2. one sync pulls all three connectors and every row appears
//   3. the vendor console's switches survive the next sync
//   4. a refusal does not go live — the previous rows keep serving
//   5. a service that is down does not go live either
//
// It runs BELOW the server on purpose: `devRuntime` + `syncIntegrations`, no
// moss, so the pull is observable from both sides. (Every other check boots
// the server, which syncs before the first assertion can look.)
//
// Run: pnpm --filter atrium exec tsx src/dev/discovery-check.ts
import './no-llm'; // the hermetic port — the same one the service starts on
import { startIntegrationsService, integrationsBase } from '@atrium/integrations/service';
import { devRuntime } from '@atrium/server/runtime';
import { syncIntegrations } from '@atrium/server/bundles';

const results: [string, boolean][] = [];
const check = (label: string, pass: boolean): void => {
  results.push([label, pass]);
  console.log(`${pass ? '✓' : '✗'} ${label}`);
};

const main = async (): Promise<void> => {
  const service = await startIntegrationsService();
  const runtime = await devRuntime();
  const count = async (sql: string): Promise<number> => Number((await runtime.pool.query(sql, [])).rows[0]?.['n'] ?? -1);

  // ── 1. the app as shipped ──
  check('a fresh database holds no bundle actions', (await count('SELECT count(*) AS n FROM bundle_actions')) === 0);
  check('...no bundle queries', (await count('SELECT count(*) AS n FROM bundle_entries')) === 0);
  check('...no capability matrix — nobody has said what Opera can do', (await count('SELECT count(*) AS n FROM connector_capabilities')) === 0);
  check('...no request menus', (await count('SELECT count(*) AS n FROM request_options')) === 0);
  check('...and every slot it has is its OWN', (await count(`SELECT count(*) AS n FROM surface_slots WHERE source <> 'core'`)) === 0);
  check('what it DOES have is the connector registry — where to ask', (await count('SELECT count(*) AS n FROM connectors')) === 3);

  // ── 2. one pull, and it knows ──
  const first = await syncIntegrations(runtime);
  check(`the sync reports on all three connectors (${first.map((r) => r.connector).join(', ')})`, first.length === 3);
  check('...all landed', first.every((r) => r.ok));

  check(`actions arrived as rows (${await count('SELECT count(*) AS n FROM bundle_actions')})`, (await count('SELECT count(*) AS n FROM bundle_actions')) === 24);
  check(`queries and writes arrived (${await count('SELECT count(*) AS n FROM bundle_entries')})`, (await count('SELECT count(*) AS n FROM bundle_entries')) === 17);
  check(`the capability matrix arrived (${await count('SELECT count(*) AS n FROM connector_capabilities')})`, (await count('SELECT count(*) AS n FROM connector_capabilities')) === 31);
  check(`the menus arrived (${await count('SELECT count(*) AS n FROM request_options')})`, (await count('SELECT count(*) AS n FROM request_options')) > 15);
  check(`slots arrived stamped with their owner (${await count(`SELECT count(*) AS n FROM surface_slots WHERE source <> 'core'`)})`, (await count(`SELECT count(*) AS n FROM surface_slots WHERE source <> 'core'`)) === 25);

  // TWO connectors implementing ONE capability — the case that proves each
  // vendor ships its own surface for the same job, calling its own service.
  const adjusters = await count(`SELECT count(*) AS n FROM connector_capabilities WHERE capability_id = 'folio.adjust'`);
  check(`both PMSes report folio.adjust (${adjusters})`, adjusters === 2);
  const billSurfaces = await count(`SELECT count(*) AS n FROM surface_slots WHERE capability_id = 'folio.adjust'`);
  check(`...and each shipped its OWN bill surface (${billSurfaces})`, billSurfaces === 2);
  // ...which resolve only where that vendor actually runs.
  const lumenBills = (await runtime.pool.query(`SELECT s.source FROM property_slots ps JOIN surface_slots s ON s.id = ps.slot_id WHERE ps.property_id = 'prop_lumen' AND s.capability_id = 'folio.adjust' AND ps.live = true`, [])).rows;
  check("The Lumen resolves Opera's bill surface and only Opera's", lumenBills.length === 1 && lumenBills[0]?.['source'] === 'con_opera');

  // The vendor's own default switch state came with the matrix — this is the
  // demo's whole deployment: Opera ships the key BUILT and OFF.
  const dark = (await runtime.pool.query(`SELECT capability_id FROM connector_capabilities WHERE connector_id = 'con_opera' AND enabled = false ORDER BY capability_id`, [])).rows;
  check('Opera shipped the key and express checkout switched OFF', dark.map((r) => String(r['capability_id'])).join(',') === 'checkout.express,key.issue');

  // HotelFix ships no actions at all — a capability plus its categories. A
  // different class of integration on the same seam, and intake takes it.
  check('HotelFix contributed categories without shipping one action', (await count(`SELECT count(*) AS n FROM request_options WHERE connector_id = 'con_ticketing'`)) === 5);
  check('...and no actions', (await count(`SELECT count(*) AS n FROM bundle_actions WHERE connector_id = 'con_ticketing'`)) === 0);

  // The pulled queries are REPLAYABLE — they seeded the cache, protected, the
  // same as the app's own. A bundle's data surface is not a special case.
  //
  // The cache is optional on the runtime, and the two assertions below are ONLY
  // about what is in it — read through an absent one and they both compare
  // undefined against a kind and fail as "not protected", which is a true-looking
  // answer to a question that was never asked.
  const cache = runtime.cache;
  if (cache === undefined) throw new Error('discovery-check: the runtime came up without a cache — there is nothing to have seeded');
  const spa = await cache.get('spa/diary');
  check('a pulled query is a protected cache row, replayable like any other', spa?.kind === 'ok' && spa.protected === true);
  const record = await cache.get('spa/record');
  check('...and a pulled write landed as a mutation entry', record?.kind === 'mutation');

  // ── 3. the console owns the switches ──
  await runtime.pool.query(`UPDATE connector_capabilities SET enabled = true WHERE connector_id = 'con_opera' AND capability_id = 'key.issue'`, []);
  const second = await syncIntegrations(runtime);
  check('a second sync lands too', second.every((r) => r.ok));
  const stillOn = (await runtime.pool.query(`SELECT enabled FROM connector_capabilities WHERE connector_id = 'con_opera' AND capability_id = 'key.issue'`, [])).rows;
  check('re-syncing does NOT flip a switch the vendor console set', stillOn[0]?.['enabled'] === true);

  // ── 4. a refusal leaves the old rows serving ──
  // A second service on another port, serving Mews's payload under Opera's
  // id: every fingerprint in it is already owned by con_mews, so intake
  // refuses the WHOLE thing rather than landing half of it.
  const impostor = await startIntegrationsService(8791);
  await runtime.pool.query(`UPDATE connectors SET service_url = 'http://127.0.0.1:8791/mews' WHERE id = 'con_opera'`, []);
  const refused = await syncIntegrations(runtime, 'con_opera');
  check('a payload that fails intake is refused', refused[0]?.ok === false);
  check(`...naming the reasons (${refused[0]?.reasons.length ?? 0})`, (refused[0]?.reasons ?? []).some((r) => r.includes('owned by another connector')));
  check("...and Opera's last-synced actions are still serving", (await count(`SELECT count(*) AS n FROM bundle_actions WHERE connector_id = 'con_opera'`)) === 12);
  check('...its slots too — nothing was half-replaced', (await count(`SELECT count(*) AS n FROM surface_slots WHERE source = 'con_opera'`)) === 13);
  await impostor.close();

  // ── 5. and neither does a service that is down ──
  await runtime.pool.query(`UPDATE connectors SET service_url = 'http://127.0.0.1:8799/opera' WHERE id = 'con_opera'`, []);
  const down = await syncIntegrations(runtime, 'con_opera');
  check('an unreachable service is reported, not thrown', down[0]?.ok === false);
  check('...in a sentence that says the old rows keep serving', (down[0]?.reasons[0] ?? '').includes('keep serving'));
  check('...and they do', (await count(`SELECT count(*) AS n FROM bundle_actions WHERE connector_id = 'con_opera'`)) === 12);

  // ── 6. a refusal is not chased, an outage is ──
  // The distinction boot's retry keys on: a bundle intake rejected will still
  // be rejected in thirty seconds, so it waits for a human. A service that
  // did not answer is worth asking again.
  check('a refusal is marked as such', refused[0]?.kind === 'refused');
  check('...and an outage differently', down[0]?.kind === 'unreachable');

  // And the recovery itself: point Opera back at the live service and the
  // very next sync lands, with no restart in between.
  await runtime.pool.query(`UPDATE connectors SET service_url = $1 WHERE id = 'con_opera'`, [`${integrationsBase()}/opera`]);
  const recovered = await syncIntegrations(runtime, 'con_opera');
  check('a connector that comes back lands on the next sync', recovered[0]?.ok === true);

  await service.close();
  await new Promise((r) => setTimeout(r, 60));

  const failed = results.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? `\nOK — the app discovers its integrations (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length} assertions failed`);
  process.exit(failed === 0 ? 0 : 1);
};

void main();
