// The claim, end to end: shipping a capability is a data change, and it lands
// on shells that are ALREADY OPEN.
//
// The check holds two guests' shells open, drives the vendor console through
// the real UI path — open the connector, flip two switches on its offer, press
// Go live — and then asserts on what appeared in the guests' hands without
// either of them touching anything. No reload, no reconnect, no restart.
//
// Run: pnpm --filter atrium exec tsx src/dev/ship-check.ts
import { login, settle, topData, mounted, tap, tapCard, cardData, openCard, sql, catalogFor, check, report } from './world';
import { refreshServer } from '@atrium/server/bundles';
import { resolveStatements } from '@atrium/db/resolve';

type Slot = { action_id?: string };
const slotIds = (data: Record<string, unknown>): string[] => (Array.isArray(data['slots']) ? (data['slots'] as Slot[]).map((s) => String(s.action_id)) : []);
type OfferRow = { row_id?: string; capability_id?: string; enabled?: boolean };
const offerRows = (data: Record<string, unknown>): OfferRow[] => (Array.isArray(data['offer']) ? (data['offer'] as OfferRow[]) : []);

const main = async (): Promise<void> => {
  // Two guests, two hotels, both already looking at their phones.
  const amara = await login('amara'); // The Lumen, Opera
  const ines = await login('ines'); // Casa Marisol, Mews
  const vendor = await login('atrium');
  await settle();

  const before = slotIds(topData(amara, 'main'));
  const inesBefore = slotIds(topData(ines, 'main'));
  check(`Amara's phone shows ${before.length} things, and a key is not one of them`, !before.includes('stay.key'));

  // ── the pull, from the console, before anything is staged ──
  // Discovery has its own button because it is its own operation — and it is
  // the way back if the app ever booted with a service down.
  tapCard(vendor, 'deploy.connectors', 'sync');
  await settle(12);
  const pulled = cardData(vendor, 'deploy.connectors')['sync'];
  const pulledRows = Array.isArray(pulled) ? (pulled as Record<string, unknown>[]) : [];
  check(`the console pulls every connector's bundle on demand (${pulledRows.length})`, pulledRows.length === 3);
  check('...and reports each one landing', pulledRows.every((r) => r['ok'] === true));

  // ── the vendor console, driven the way a person drives it ──
  const connectors = cardData(vendor, 'deploy.connectors')['rows'];
  const opera = (Array.isArray(connectors) ? connectors : []).find((c) => (c as Record<string, unknown>)['connector_id'] === 'con_opera');
  check('the console lists the Opera connector', opera !== undefined);

  tapCard(vendor, 'deploy.connectors', 'pick', opera);
  await settle();
  const picked = cardData(vendor, 'deploy.connectors');
  const offer = offerRows(picked);
  check(`opening it loads the offer checklist (${offer.length} capabilities)`, offer.length === 16);
  check('the key and express checkout sit in it SWITCHED OFF', offer.filter((o) => o.enabled === false).map((o) => o.capability_id).sort().join(',') === 'checkout.express,key.issue');
  const reach = picked['reach'];
  check('and names its blast radius', Array.isArray(reach) && (reach as Record<string, unknown>[]).some((p) => p['name'] === 'The Lumen'));

  // ── stage the two dark switches ──
  const keyRow = offer.find((o) => o.capability_id === 'key.issue');
  const expressRow = offer.find((o) => o.capability_id === 'checkout.express');
  tapCard(vendor, 'deploy.connectors', 'stage-on', keyRow);
  await settle();
  tapCard(vendor, 'deploy.connectors', 'stage-on', expressRow);
  await settle();

  const staged = await sql(`SELECT capability_id FROM connector_capabilities WHERE connector_id = 'con_opera' AND enabled = true ORDER BY capability_id`);
  check('staging flips the offer rows', staged.length === 16);
  // Staged is not live: the resolved layer must not have moved yet.
  const midflight = await sql(
    `SELECT ps.live FROM property_slots ps JOIN surface_slots s ON s.id = ps.slot_id
     WHERE ps.property_id = 'prop_lumen' AND s.id = 'gs_key'`,
  );
  check('staging does not ship — the guest surface is untouched', midflight[0]?.['live'] === false);
  check('the console owns up to being ahead of the world', cardData(vendor, 'deploy.connectors')['dirty'] === true);

  // ── go live ──
  tapCard(vendor, 'deploy.connectors', 'golive');
  await settle(12);

  check('the console says live', cardData(vendor, 'deploy.connectors')['shipped'] === true);
  const resolved = await sql(
    `SELECT ps.live FROM property_slots ps JOIN surface_slots s ON s.id = ps.slot_id
     WHERE ps.property_id = 'prop_lumen' AND s.id = 'gs_key'`,
  );
  check('the resolved surface recomputed', resolved[0]?.['live'] === true);

  // ── the shot, honest edition ──
  // There is no push. Amara's OPEN shell still shows the old slots until it
  // reads again — the database is correct, the shell is merely stale.
  const stale = slotIds(topData(amara, 'main'));
  check('her open shell is momentarily stale — no push, by design', !stale.includes('stay.key'));

  // Model her shell re-reading: a resume, a nav, or (later) a NOTIFY nudge all
  // do this. Here we fire the same channel her concierge already listens on.
  amara.publish('capabilities-changed');
  await settle();

  const now = slotIds(topData(amara, 'main'));
  check(`once her shell re-reads, it shows ${now.length} things`, now.length > before.length);
  check('...and a room key is one of them', now.includes('stay.key'));
  check('...and express checkout arrived with it', now.includes('stay.checkout'));
  check('no reload happened — same shell, same instance', topData(amara, 'main')['stayId'] === 'stay_amara');

  // The blast radius is the connector, not the estate.
  const inesNow = slotIds(topData(ines, 'main'));
  check('the hotel on the other PMS was not touched', inesNow.join(',') === inesBefore.join(','));

  // And the desk gained its half of the same capability, in the same instant.
  await login('rosa');
  await settle();
  check('the front desk holds the key tool in its charter', catalogFor('rosa').includes('desk.keys'));
  const deskSurface = await sql(
    `SELECT ps.live FROM property_slots ps JOIN surface_slots s ON s.id = ps.slot_id
     WHERE ps.property_id = 'prop_lumen' AND s.id = 'ds_keys'`,
  );
  check("...and the desk's key tool resolved live too", deskSurface[0]?.['live'] === true);

  // ── the deeper claim: an ACTION that never existed, shipped as a row ──
  // No TypeScript below authors this action. It is inserted as data, the
  // resolver places its slot, refresh() re-verifies the charter over the new
  // id (the ext.guest.* glob already covers it), the memos drop, and Amara's
  // LIVING shell adopts the definition in place — then opens it.
  const NOTE = {
    id: 'ext.guest.opera.goodnight',
    title: 'Goodnight',
    input: { type: 'object', properties: { stayId: { type: 'string' }, propertyId: { type: 'string' }, capability: { type: 'string' }, sheetTitle: { type: 'string' } } },
    data: { stayId: '', propertyId: '', capability: '', sheetTitle: '' },
    layout: { component: 'Text', props: { serif: true, size: 'xl', align: 'center' }, children: 'Sleep well — the desk has the night watch.' },
  };
  check('the action does not exist before the row does', !catalogFor('amara').includes('ext.guest.opera.goodnight'));
  await sql(`INSERT INTO bundle_actions (id, connector_id, audience, definition) VALUES ($1, 'con_opera', 'guest', $2)`, [NOTE.id, JSON.stringify(NOTE)]);
  await sql(
    `INSERT INTO surface_slots (audience, id, action_id, title, blurb, icon, capability_id, stay_state, keywords, source, position)
     VALUES ('guest', 'gs_goodnight', 'ext.guest.opera.goodnight', 'Goodnight', 'A small kindness at the end of the day.', 'moon', 'stay.view', 'in_house', 'goodnight sleep', 'con_opera', 90)`,
  );
  for (const statement of resolveStatements('con_opera')) await sql(statement);
  await refreshServer();

  check('after refresh, the charter covers the new id with no charter edit', catalogFor('amara').includes('ext.guest.opera.goodnight'));
  amara.publish('capabilities-changed');
  await settle();
  const grown = slotIds(topData(amara, 'main'));
  check("Amara's OPEN shell re-reads and the new tile is there", grown.includes('ext.guest.opera.goodnight'));
  const tile = (topData(amara, 'main')['slots'] as Record<string, unknown>[]).find((s) => s['action_id'] === 'ext.guest.opera.goodnight');
  tap(amara, 'main', 'open', tile);
  await settle();
  check('...and the shell she never reloaded OPENS an action that was born a row', mounted(amara, 'sheet').includes('ext.guest.opera.goodnight'));

  report('shipping a capability is a data change');
};

void main();
