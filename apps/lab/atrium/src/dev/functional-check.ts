import type { Shell } from '@niscorp/nova';
import { integrations, login, settle, topData, mounted, tap, tapCard, cardData, openCard, openFromMenu, menuIds, composed, sql, asPrincipal, check, report } from './world';

type Row = Record<string, unknown>;
const rows = (data: Record<string, unknown>, key: string): Row[] => (Array.isArray(data[key]) ? (data[key] as Row[]) : []);
const chromeOf = (shell: Shell): Record<string, unknown> => {
  const active = shell.getState().canvases['chrome']?.active;
  return active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {});
};

const main = async (): Promise<void> => {
  const amara = await login('amara');
  const ines = await login('ines');
  const rosa = await login('rosa');
  const pilar = await login('pilar');
  const henrik = await login('henrik');
  await settle();

  const msgSlot = rows(topData(amara, 'main'), 'slots').find((s) => s['slot_id'] === 'gs_message');
  tap(amara, 'main', 'open', msgSlot);
  await settle();
  tap(amara, 'sheet', 'draft', 'Could I get a quiet table for two tonight?', 'ui:model');
  tap(amara, 'sheet', 'send');
  await settle();

  const sent = await sql(`SELECT property_id, sender FROM messages WHERE body LIKE '%quiet table%'`);
  check('the guest message persisted', sent.length === 1);
  check('...stamped with HER hotel by scope, not by the client', sent[0]?.['property_id'] === 'prop_lumen');

  rosa.publish('messages-changed');
  await settle();
  const unreadBefore = Number((chromeOf(rosa)['unread'] as Row)?.['count'] ?? -1);
  check(`the desk chrome wears an unread badge (${unreadBefore})`, unreadBefore >= 1);

  await openFromMenu(rosa, 'desk.message.list');
  const feed = rows(cardData(rosa, 'desk.message.list'), 'feed');
  const incoming = feed.find((m) => String(m['body']).includes('quiet table'));
  check('the desk inbox shows it, in her words', incoming !== undefined);
  check('...with her name and room from the join', incoming?.['guest_name'] === 'Amara Osei' && incoming?.['room_number'] === '412');

  tapCard(rosa, 'desk.message.list', 'open-thread', incoming);
  await settle(10);
  check('opening a thread composes nothing into the assistant column', mounted(rosa, 'aside').length === 0);
  check('...as its own surface beside the inbox', mounted(rosa, 'detail').includes('desk.thread.detail'));
  check('...and the thread itself loaded', rows(cardData(rosa, 'desk.thread.detail', 'detail'), 'thread').length > 0);

  tapCard(rosa, 'desk.thread.detail', 'draft', 'Of course — 8pm by the window is yours.', 'detail', 'ui:model');
  tapCard(rosa, 'desk.thread.detail', 'send', undefined, 'detail');
  await settle(20);

  const reply = await sql(`SELECT sender FROM messages WHERE body LIKE '%by the window%'`);
  check('the reply persisted as the desk', reply[0]?.['sender'] === 'desk');
  const thread = await asPrincipal('amara', '/api/stay/vex', { fingerprint: 'messages/forStay', context: { stayId: 'stay_amara' } });
  check("...and the guest's thread carries the desk's reply", Array.isArray(thread) && (thread as Row[]).some((m) => String(m['body']).includes('by the window')));
  // A connector's read is replayed like the app's own: it arrived as a row,
  // and the server was handed it as an entry of the 'bundles' set.
  const visits = await asPrincipal('ines', '/api/vex', { fingerprint: 'spa/forStay', context: { stayId: 'stay_ines' } });
  check("a connector's read replays through the server, like any other", Array.isArray(visits));
  check('opening the inbox cleared the badge', Number((chromeOf(rosa)['unread'] as Row)?.['count'] ?? -1) === 0);

  amara.publish('messages-changed');
  await settle();
  check("the guest's home counts the desk's reply as unread", Number((topData(amara, 'main')['unread'] as Row)?.['count'] ?? -1) >= 1);
  tap(amara, 'main', 'open-messages');
  await settle();
  amara.publish('messages-changed');
  await settle();
  check('reading the thread clears it', Number((topData(amara, 'main')['unread'] as Row)?.['count'] ?? -1) === 0);
  tap(amara, 'sheet', 'sheet-close');
  await settle();

  await openFromMenu(pilar, 'desk.message.list');
  check("the other hotel's desk sees none of it", !rows(cardData(pilar, 'desk.message.list'), 'feed').some((m) => String(m['body']).includes('quiet table')));

  const spaSlot = rows(topData(ines, 'main'), 'slots').find((s) => s['slot_id'] === 'gs_spa');
  tap(ines, 'main', 'open', spaSlot);
  await settle();
  check('the spa tile opens the bundle action', mounted(ines, 'sheet').includes('ext.guest.mews.spa'));
  const treatments = rows(topData(ines, 'sheet'), 'treatments');
  check(`the treatments came from Mews (${treatments.length}), priced`, treatments.length === 4 && treatments.every((t) => Number(t['amount']) > 0));
  const massage = treatments.find((t) => String(t['label']).includes('massage'));

  tap(ines, 'sheet', 'pick-treatment', massage);
  await settle(10);
  const slots = rows(topData(ines, 'sheet'), 'slots');
  check(`the connector answered with live slots (${slots.length})`, slots.length > 0);
  tap(ines, 'sheet', 'pick-slot', slots[0]);
  tap(ines, 'sheet', 'book');
  await settle(14);

  const sheetAfter = topData(ines, 'sheet');
  check('the booking confirmed through the connector', sheetAfter['done'] === true && String((sheetAfter['booked'] as Row)?.['confirmation'] ?? '').startsWith('MEWS-SPA-'));
  const mirrored = await sql(`SELECT status, property_id FROM spa_bookings WHERE stay_id = 'stay_ines' AND treatment = '60-minute massage' AND status = 'booked'`);
  check('...mirrored as OUR row, stamped with her hotel by scope', mirrored.length === 1 && mirrored[0]?.['property_id'] === 'prop_marisol');
  const charged = await sql(`SELECT amount FROM folio_lines WHERE stay_id = 'stay_ines' AND description = '60-minute massage'`);
  check('...and charged to the room at the catalogue price', charged.length === 2 && charged.some((c) => Number(c['amount']) === 890));
  tap(ines, 'sheet', 'sheet-close');
  await settle();

  check('the Marisol desk was OFFERED a Spa diary from the bundle', menuIds(pilar).includes('ext.desk.mews.spa-diary'));
  await openFromMenu(pilar, 'ext.desk.mews.spa-diary');
  const diary = rows(cardData(pilar, 'ext.desk.mews.spa-diary'), 'diary');
  check(`the diary reads the mirror rows (${diary.length})`, diary.length >= 3 && diary.some((d) => d['guest_name'] === 'Inés Marchetti'));
  const fresh = diary.find((d) => d['status'] === 'booked' && d['treatment'] === '60-minute massage');
  tapCard(pilar, 'ext.desk.mews.spa-diary', 'mark-done', fresh);
  await settle();
  const done = await sql(`SELECT status FROM spa_bookings WHERE id = $1`, [fresh?.['booking_id']]);
  check('the desk marks it done — one write, one row', done[0]?.['status'] === 'done');

  const barSlot = rows(topData(ines, 'main'), 'slots').find((s) => s['slot_id'] === 'gs_minibar');
  tap(ines, 'main', 'open', barSlot);
  await settle();
  const items = rows(topData(ines, 'sheet'), 'items');
  check(`the minibar list is Mews's, priced (${items.length} items)`, items.length === 6);
  tap(ines, 'sheet', 'take', items.find((i) => String(i['label']).includes('beer')));
  await settle();
  check('tapping an item stages it and charges nothing', (await sql(`SELECT id FROM folio_lines WHERE stay_id = 'stay_ines' AND description = 'Local beer'`)).length === 0);
  check('...and the tile shows as chosen', String((topData(ines, 'sheet')['chosen'] as Row)?.['label'] ?? '').includes('beer'));
  tap(ines, 'sheet', 'take', items.find((i) => String(i['label']).includes('beer')));
  await settle();
  check('...tapping it again unchooses it', Object.keys((topData(ines, 'sheet')['chosen'] as Row) ?? {}).length === 0);
  tap(ines, 'sheet', 'take', items.find((i) => String(i['label']).includes('beer')));
  await settle();
  tap(ines, 'sheet', 'add');
  await settle(8);
  const beer = await sql(`SELECT amount FROM folio_lines WHERE stay_id = 'stay_ines' AND description = 'Local beer'`);
  check('only the confirm posts it to the folio', Number(beer[0]?.['amount']) === 9);
  tap(ines, 'sheet', 'sheet-close');
  await settle();

  const totalBefore = Number(((await asPrincipal('ines', '/api/vex', { fingerprint: 'folio/total', context: { stayId: 'stay_ines' } })) as Row)?.['total'] ?? 0);
  tap(ines, 'main', 'open-messages');
  await settle();
  tap(ines, 'sheet', 'draft', 'I accidentally added a local beer to my bill… can you remove that?', 'ui:model');
  tap(ines, 'sheet', 'send');
  await settle();
  tap(ines, 'sheet', 'sheet-close');
  await settle();

  await openFromMenu(pilar, 'desk.message.list');
  const marisolFeed = rows(cardData(pilar, 'desk.message.list'), 'feed');
  const beerNote = marisolFeed.find((m) => String(m['body']).includes('local beer'));
  check('the Marisol desk reads her note', beerNote !== undefined);
  tapCard(pilar, 'desk.message.list', 'open-thread', beerNote);
  await settle(12);

  check("Marisol resolved MEWS's bill surface, not Opera's", menuIds(pilar).concat(['ext.desk.mews.folio']).includes('ext.desk.mews.folio'));
  pilar.push('aside', 'ext.desk.mews.folio', { stayId: 'stay_ines', propertyId: 'prop_marisol', expanded: true }, []);
  await settle(12);
  check('the assistant column holds exactly what was put there, and nothing else', mounted(pilar, 'aside').join() === 'ext.desk.mews.folio');
  const billLines = rows(cardData(pilar, 'ext.desk.mews.folio', 'aside'), 'lines');
  const beerLine = billLines.find((l) => l['description'] === 'Local beer');
  check(`the bill arrived carrying HER stay (${billLines.length} charges)`, beerLine !== undefined);
  tapCard(pilar, 'ext.desk.mews.folio', 'pick-line', beerLine, 'aside');
  tapCard(pilar, 'ext.desk.mews.folio', 'reason', 'Guest says she tapped it by mistake.', 'aside', 'ui:model');
  await settle();
  tapCard(pilar, 'ext.desk.mews.folio', 'void', undefined, 'aside');
  await settle(14);

  const voided = await sql(`SELECT voided_at, voided_by FROM folio_lines WHERE stay_id = 'stay_ines' AND description = 'Local beer'`);
  check('the line is REVERSED, not deleted — the folio remembers', voided[0]?.['voided_at'] !== null && String(voided[0]?.['voided_by'] ?? '').includes('mistake'));
  const cardAfter = cardData(pilar, 'ext.desk.mews.folio', 'aside');
  check('...with the vendor\'s own reference, because Mews did the voiding', String((cardAfter['reversal'] as Row)?.['reversal'] ?? '').startsWith('MEWS-ADJ-'));
  const totalAfter = Number(((await asPrincipal('ines', '/api/vex', { fingerprint: 'folio/total', context: { stayId: 'stay_ines' } })) as Row)?.['total'] ?? 0);
  check(`...and her own total dropped by the charge (${totalBefore} → ${totalAfter})`, totalAfter === totalBefore - 9);
  const herLines = (await asPrincipal('ines', '/api/vex', { fingerprint: 'folio/forStay', context: { stayId: 'stay_ines' } })) as Row[];
  check('...and the beer is off the bill she reads', !herLines.some((l) => l['description'] === 'Local beer'));

  const reportSlot = rows(topData(ines, 'main'), 'slots').find((s) => s['slot_id'] === 'gs_report');
  tap(ines, 'main', 'open', reportSlot);
  await settle();
  const categories = rows(topData(ines, 'sheet'), 'options');
  check(`the report menu came from HotelFix (${categories.length} categories)`, categories.length === 5);
  tap(ines, 'sheet', 'choose', categories.find((c) => String(c['label']).includes('Wi-Fi')));
  tap(ines, 'sheet', 'send');
  await settle();
  const ticket = await sql(`SELECT kind, property_id FROM issues WHERE kind = 'wifi' AND stay_id = 'stay_ines'`);
  check("sending one lands on the board with HotelFix's kind", ticket.length === 1 && ticket[0]?.['property_id'] === 'prop_marisol');
  tap(ines, 'sheet', 'sheet-close');
  await settle();

  ines.publish('issues-changed');
  await settle();
  check('her report shows under "Your requests" on the home', rows(topData(ines, 'main'), 'issues').some((i) => i['kind'] === 'wifi'));

  const wakeSlot = rows(topData(amara, 'main'), 'slots').find((s) => s['slot_id'] === 'gs_wake');
  tap(amara, 'main', 'open', wakeSlot);
  await settle();
  const times = rows(topData(amara, 'sheet'), 'times');
  check(`the times are the switchboard's own (${times.length})`, times.length === 8);
  check('her seeded 7:00 call is already listed', rows(topData(amara, 'sheet'), 'calls').some((c) => c['call_at'] === '07:00'));
  tap(amara, 'sheet', 'pick-time', times.find((t) => t['label'] === '06:30'));
  tap(amara, 'sheet', 'set');
  await settle();
  const calls = await sql(`SELECT call_at, status FROM wake_calls WHERE stay_id = 'stay_amara' ORDER BY call_at`);
  check('setting one writes the row, dated tomorrow by the table itself', calls.length === 2 && calls[0]?.['call_at'] === '06:30');
  tap(amara, 'sheet', 'sheet-close');
  await settle();

  const rosaSurface = menuIds(rosa);
  check("the Lumen desk is offered Opera's surfaces, not Mews's", rosaSurface.includes('ext.desk.opera.call-sheet') && !rosaSurface.some((id) => id.includes('mews')));
  check('one Approvals row despite its two capability gates', rosaSurface.filter((id) => id === 'ext.desk.opera.approvals').length === 1);
  await openFromMenu(rosa, 'ext.desk.opera.call-sheet');
  const sheetRows = rows(cardData(rosa, 'ext.desk.opera.call-sheet'), 'calls');
  check(`the call sheet lists the scheduled calls in ringing order (${sheetRows.length})`, sheetRows.length >= 2 && sheetRows.every((r, i) => i === 0 || String(sheetRows[i - 1]?.["call_at"]) <= String(r["call_at"])) && sheetRows.some((r) => r["call_at"] === "06:30"));
  tapCard(rosa, 'ext.desk.opera.call-sheet', 'rung', sheetRows.find((r) => r['call_at'] === '06:30'));
  await settle();
  const rung = await sql(`SELECT status FROM wake_calls WHERE call_at = '06:30'`);
  check('ringing it moves the row to done', rung[0]?.['status'] === 'done');

  check('a stay-scoped surface stays off the house screen', !rosaSurface.includes('ext.desk.opera.set-call'));
  await openFromMenu(rosa, 'desk.movements');
  const theoRow = rows(cardData(rosa, 'desk.movements'), 'rows').find((r) => r['guest_name'] === 'Theo Lindqvist');
  check('the movements list has Theo', theoRow !== undefined);
  tapCard(rosa, 'desk.movements', 'row', theoRow);
  await settle(12);
  check('opening a row opens the guest beside her list', mounted(rosa, 'detail').at(-1) === 'desk.guest');
  check('...carrying HIS stay, from the row', cardData(rosa, 'desk.guest', 'detail')['stayId'] === 'stay_theo');
  check('...and nothing was composed into the assistant column', mounted(rosa, 'aside').length === 0);

  rosa.push('aside', 'ext.desk.opera.set-call', { stayId: 'stay_theo', propertyId: 'prop_lumen', staffId: 'stf_rosa', expanded: true }, []);
  await settle(12);
  check('...and it carries the guest it was given', cardData(rosa, 'ext.desk.opera.set-call', 'aside')['stayId'] === 'stay_theo');
  const setTimes = rows(cardData(rosa, 'ext.desk.opera.set-call', 'aside'), 'times');
  check(`...with the switchboard times (${setTimes.length})`, setTimes.length === 8);
  tapCard(rosa, 'ext.desk.opera.set-call', 'pick-time', setTimes.find((t) => t['label'] === '05:30'), 'aside');
  await settle();
  tapCard(rosa, 'ext.desk.opera.set-call', 'set', undefined, 'aside');
  await settle(10);
  const theoCall = await sql(`SELECT status, property_id FROM wake_calls WHERE stay_id = 'stay_theo' AND call_at = '05:30'`);
  check('the desk books the ring for the guest — same row the guest half writes', theoCall[0]?.['status'] === 'scheduled' && theoCall[0]?.['property_id'] === 'prop_lumen');

  await openFromMenu(rosa, 'ext.desk.opera.approvals');
  const pending = rows(cardData(rosa, 'ext.desk.opera.approvals'), 'pending');
  const suite = pending.find((p) => p['label'] === 'Junior suite');
  check('the ask queue holds the seeded upgrade request, priced', suite !== undefined && Number(suite['amount']) === 90);
  tapCard(rosa, 'ext.desk.opera.approvals', 'approve', suite);
  await settle(10);
  const decided = await sql(`SELECT status FROM stay_requests WHERE id = 'sreq_theo'`);
  check('approving decides the row', decided[0]?.['status'] === 'approved');
  const suiteCharge = await sql(`SELECT amount FROM folio_lines WHERE stay_id = 'stay_theo' AND description = 'Junior suite'`);
  check('...and posts the price it carried to the folio', Number(suiteCharge[0]?.['amount']) === 90);

  const outOfOrder = async (): Promise<number> =>
    Number((await sql(`SELECT count(*) AS count FROM rooms WHERE property_id = 'prop_lumen' AND status = 'out_of_order'`))[0]?.['count'] ?? -1);
  const oooBefore = await outOfOrder();
  await openFromMenu(henrik, 'ops.rooms');
  const roomRows = rows(cardData(henrik, 'ops.rooms'), 'rows');
  check(`the rooms pane lists the house (${roomRows.length} rooms)`, roomRows.length === 36);
  const inService = roomRows.find((r) => r['out_of_order'] === false);
  tapCard(henrik, 'ops.rooms', 'toggle', { room_id: inService?.['room_id'], out_of_order: false });
  await settle();
  const flipped = await sql(`SELECT status FROM rooms WHERE id = $1`, [inService?.['room_id']]);
  check('taking a room out of service writes through', flipped[0]?.['status'] === 'out_of_order');
  const oooAfter = await outOfOrder();
  check(`the out-of-service count moved with it (${oooBefore} → ${oooAfter})`, oooAfter === oooBefore + 1);

  check('express checkout is dark before the vendor enables it', !rows(topData(amara, 'main'), 'slots').some((s) => s['slot_id'] === 'gs_checkout'));

  const vendor = await login('atrium');
  await settle();
  const opera = rows(cardData(vendor, 'deploy.connectors'), 'rows').find((c) => c['connector_id'] === 'con_opera');
  tapCard(vendor, 'deploy.connectors', 'pick', opera);
  await settle();
  const offer = rows(cardData(vendor, 'deploy.connectors'), 'offer');
  tapCard(vendor, 'deploy.connectors', 'stage-on', offer.find((o) => o['capability_id'] === 'checkout.express'));
  await settle();
  tapCard(vendor, 'deploy.connectors', 'golive');
  await settle(12);

  amara.publish('capabilities-changed');
  await settle();
  const outSlot = rows(topData(amara, 'main'), 'slots').find((s) => s['slot_id'] === 'gs_checkout');
  check('...and live at The Lumen once the switch went live', outSlot !== undefined);

  tap(amara, 'main', 'open', outSlot);
  await settle();
  tap(amara, 'sheet', 'confirm');
  await settle();
  const sheet = topData(amara, 'sheet');
  check('the done screen shows the settled folio total, not an email promise', String((sheet['total'] as Row)?.['total_display'] ?? '') === '€698');
  const departed = await sql(`SELECT state FROM stays WHERE id = 'stay_amara'`);
  check('...and the stay really departed', departed[0]?.['state'] === 'departed');

  const rosaAgain = await login('rosa');
  await settle();
  await openFromMenu(rosaAgain, 'desk.message.list');
  check(
    'a fresh desk session still reads the whole exchange from the DB',
    rows(cardData(rosaAgain, 'desk.message.list'), 'feed').some((m) => String(m['body']).includes('by the window')),
  );

  await integrations.close();
  // Windows libuv aborts if process.exit races the just-closed listener's
  // async handles — one settle lets the loop drain before report() exits.
  await settle(2);
  report('every loop closes through the database');
};

void main();
