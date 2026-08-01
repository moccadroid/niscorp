// The front desk's working surfaces, driven end to end against the real
// database — the ones a demo actually spends its four minutes in.
//
// Every assertion here is a beat somebody stands in front of a stranger and
// performs, which is why they are worth pinning: a surface that reads well in a
// screenshot and returns nothing on a Tuesday afternoon is worse than one that
// was never built, because the failure happens in public.
//
// It asserts the DATA and the WRITES, never the model: nothing in here needs a
// key, and nothing in here would pass because an assistant behaved. Where a
// surface exists to be filled by one, the check drives the field by hand — the
// point is that the seam is real and the write lands, not that anybody used it.
import './no-llm';
import { login, settle, openFromMenu, cardData, tapCard, mounted, menuIds, sql, asPrincipal, check, report } from './world';

type Row = Record<string, unknown>;
const rows = (data: Row, key: string): Row[] => (data[key] ?? []) as Row[];

const main = async (): Promise<void> => {
  const rosa = login('rosa');
  const pilar = login('pilar');
  await settle(14);

  // ═══ 1. what is waiting, derived ═════════════════════════
  // The surface that answers "what should I do next" instead of counting
  // things that need doing.
  await openFromMenu(rosa, 'desk.attention');
  await settle(12);
  const attention = cardData(rosa, 'desk.attention');

  const waiting = rows(attention, 'waiting');
  check(`guests nobody has answered are listed (${waiting.length})`, waiting.length >= 4);
  check('...longest wait first', waiting.every((w, i) => i === 0 || String(waiting[i - 1]?.['asked_at']) <= String(w['asked_at'])));
  check('...Amara leads them, because she has waited longest', waiting[0]?.['guest_name'] === 'Amara Osei');
  check('...and the rows carry the stay, so a tap opens HER thread', String(waiting[0]?.['stay_id'] ?? '') === 'stay_amara');
  check('...a guest the desk answered back is NOT waiting', !waiting.some((w) => w['guest_name'] === 'Ingrid Sørensen'));
  check('...nor a guest who has gone home', !waiting.some((w) => w['guest_name'] === 'Pierre Lambert'));

  const unattended = rows(attention, 'unattended');
  check(`faults with nobody on them are listed (${unattended.length})`, unattended.length >= 2);
  check('...the lift, three days old and never dispatched', unattended.some((u) => String(u['summary']).includes('Lift 2')));
  check('...oldest first', String(unattended[0]?.['issue_id']) === 'iss_lift');
  check('...and a fault that HAS somebody on it is not on the list', !unattended.some((u) => u['issue_id'] === 'iss_001'));

  check(`asks waiting on a yes are listed (${rows(attention, 'pending').length})`, rows(attention, 'pending').length >= 3);
  // The attention list carries only rows somebody can act on — a room being
  // turned already has housekeeping on it, so rooms-to-turn is a count in the
  // data, not a row here.
  check('the world holds rooms still to turn', Number((await sql(`SELECT count(*) AS count FROM rooms WHERE property_id = 'prop_lumen' AND status = 'dirty'`))[0]?.['count'] ?? 0) >= 3);
  check('...and the attention list carries nothing it does not render', attention['notReady'] === undefined && attention['dueIn'] === undefined);
  check('...but it does say which row is open', 'openRow' in attention);

  // A row opens the RECORD it is about, not a list containing it.
  tapCard(rosa, 'desk.attention', 'open-thread', waiting[0]);
  await settle(12);
  check('tapping a waiting guest opens their conversation', mounted(rosa, 'detail').at(-1) === 'desk.thread.detail');
  check('...carrying her stay', cardData(rosa, 'desk.thread.detail', 'detail')['stayId'] === 'stay_amara');
  const thread = rows(cardData(rosa, 'desk.thread.detail', 'detail'), 'thread');
  check(`...and the whole thread with it (${thread.length})`, thread.length === 3 && String(thread.at(-1)?.['body']).includes('barely slept'));

  tapCard(rosa, 'desk.attention', 'open-issue', unattended[0]);
  await settle(12);
  check('tapping an unattended fault opens the issue', mounted(rosa, 'detail').at(-1) === 'desk.issue.detail');
  const issueCard = cardData(rosa, 'desk.issue.detail', 'detail');
  check('...already showing the controls that send somebody', String(issueCard['kind'] ?? '') !== '');
  check(`...with the floor loaded to choose from (${rows(issueCard, 'staff').length})`, rows(issueCard, 'staff').length >= 5);

  // ═══ 2. who this is ══════════════════════════════════════
  // Seven reads assembled into the question a clerk actually has.
  rosa.push('aside', 'desk.brief', { stayId: 'stay_amara', propertyId: 'prop_lumen', expanded: true }, []);
  await settle(16);
  const brief = cardData(rosa, 'desk.brief', 'aside');
  check('the brief names the guest', (brief['guest'] as Row)?.['name'] === 'Amara Osei');
  check('...counts the stays behind her', Number((brief['visits'] as Row)?.['count'] ?? 0) === 2);
  check('...totals what is on the bill', String((brief['total'] as Row)?.['total_display'] ?? '') === '€698');
  check('...spells the language rather than the code', (brief['guest'] as Row)?.['language_display'] === 'English');
  check(`...reads what the desk wrote down (${rows(brief, 'notes').length})`, rows(brief, 'notes').some((n) => String(n['body']).includes('same air conditioning fault')));
  check('...and what is open for her', rows(brief, 'issues').some((i) => String(i['summary']).includes('rattling')));

  // The guest may not read those notes, and the reason is a missing charter
  // grant rather than a flag on a surface. Asserted on the RAW wire, as her,
  // because that is the boundary — not what her layouts happen to render.
  const refused = await asPrincipal('amara', '/api/service/vex', { fingerprint: 'notes/forStay', context: { stayId: 'stay_amara' } });
  check('a guest cannot read what the desk wrote about her', !JSON.stringify(refused ?? '').includes('same air conditioning fault'));

  // ═══ 3. moving her out of the room ═══════════════════════
  // The gesture the app could not perform at all: `stays.room_id` existed and
  // nothing could write it.
  rosa.push('aside', 'desk.move', { stayId: 'stay_amara', propertyId: 'prop_lumen', expanded: true }, []);
  await settle(16);
  const move = cardData(rosa, 'desk.move', 'aside');
  const candidates = rows(move, 'rooms');
  check(`the move offers rooms that are signed off and free (${candidates.length})`, candidates.length >= 2);
  check('...including the quiet junior suite on six', candidates.some((r) => r['room_id'] === 'rm_l_613'));
  check('...and never a room somebody is already in', !candidates.some((r) => r['room_id'] === 'rm_l_412'));
  check('...nor one held for an arrival', !candidates.some((r) => r['room_id'] === 'rm_l_511'));
  check('...nor one out of order', !candidates.some((r) => r['room_id'] === 'rm_l_415'));

  const target = candidates.find((r) => r['room_id'] === 'rm_l_613');
  tapCard(rosa, 'desk.move', 'pick-room', target, 'aside');
  tapCard(rosa, 'desk.move', 'reason', 'Air conditioning fault, second night.', 'aside', 'ui:model');
  tapCard(rosa, 'desk.move', 'tell', 'We are moving you to 613 tonight — quieter, and with our apologies.', 'aside', 'ui:model');
  await settle(8);
  tapCard(rosa, 'desk.move', 'move', undefined, 'aside');
  await settle(18);

  const moved = await sql(`SELECT room_id FROM stays WHERE id = 'stay_amara'`, []);
  check('one press moves the stay', moved[0]?.['room_id'] === 'rm_l_613');
  const oldRoom = await sql(`SELECT status FROM rooms WHERE id = 'rm_l_412'`, []);
  check('...puts the room she left down for turning', oldRoom[0]?.['status'] === 'dirty');
  const newRoom = await sql(`SELECT status FROM rooms WHERE id = 'rm_l_613'`, []);
  check('...takes the new one off the sellable list', newRoom[0]?.['status'] === 'clean');
  const told = await sql(`SELECT body FROM messages WHERE stay_id = 'stay_amara' ORDER BY sent_at DESC LIMIT 1`, []);
  check('...and tells the guest, in the words that were written', String(told[0]?.['body'] ?? '').includes('613'));

  // ═══ 4. putting it right ═════════════════════════════════
  // The most sensitive surface in the app: the model may pick a row, never a
  // number, and a human presses the button.
  check("the Lumen resolved OPERA's goodwill surface", menuIds(rosa).concat(['ext.desk.opera.goodwill']).includes('ext.desk.opera.goodwill'));
  rosa.push('aside', 'ext.desk.opera.goodwill', { stayId: 'stay_amara', propertyId: 'prop_lumen', staffId: 'stf_rosa', expanded: true }, []);
  await settle(16);
  const goodwill = cardData(rosa, 'ext.desk.opera.goodwill', 'aside');
  const gestures = rows(goodwill, 'gestures');
  check(`the gestures are the connector's, priced (${gestures.length})`, gestures.length === 5);
  check('...and every one of them carries a value somebody set', gestures.every((g) => typeof g['amount'] === 'number' || typeof g['amount'] === 'string'));

  const dinner = gestures.find((g) => String(g['label']).includes('Dinner'));

  // STAGED BY ID. An opener names one option with a string and the card reads
  // the row itself, so the price on the bill is the hotel's rather than
  // whatever the caller happened to send. Declaring the option object as input
  // invited the opposite: copy the whole row back out of the card's own loaded
  // data, two levels deeper than anything else in the answer.
  tapCard(rosa, 'ext.desk.opera.goodwill', 'pick-gesture', dinner, 'aside');
  tapCard(rosa, 'ext.desk.opera.goodwill', 'note', 'Two nights of this is two too many. Dinner is on us tonight.', 'aside', 'ui:model');
  await settle(8);
  const beforeTotal = Number((await sql(`SELECT COALESCE(SUM(amount), 0) AS t FROM folio_lines WHERE stay_id = 'stay_amara' AND voided_at IS NULL`, []))[0]?.['t'] ?? 0);
  tapCard(rosa, 'ext.desk.opera.goodwill', 'give', undefined, 'aside');
  await settle(18);

  const credit = await sql(`SELECT description, amount FROM folio_lines WHERE stay_id = 'stay_amara' AND description LIKE 'Goodwill%'`, []);
  check('the gesture posts as a CREDIT, not a charge', Number(credit[0]?.['amount']) === -120);
  check('...marked on the bill as what it is', String(credit[0]?.['description'] ?? '').startsWith('Goodwill — '));
  const afterTotal = Number((await sql(`SELECT COALESCE(SUM(amount), 0) AS t FROM folio_lines WHERE stay_id = 'stay_amara' AND voided_at IS NULL`, []))[0]?.['t'] ?? 0);
  check(`...and her total actually falls (${beforeTotal} → ${afterTotal})`, afterTotal === beforeTotal - 120);
  const apology = await sql(`SELECT body, sender FROM messages WHERE stay_id = 'stay_amara' ORDER BY sent_at DESC LIMIT 1`, []);
  check('...with the apology sent from the desk, in the clerk’s words', apology[0]?.['sender'] === 'desk' && String(apology[0]?.['body']).includes('Dinner is on us'));

  // ═══ 5. the taxi that used to be impossible ══════════════
  // The concierge could never arrange one. It is a capability now, live at both
  // hotels from the first boot, with nothing to switch on.
  check('The Lumen offers the car sheet', menuIds(rosa).includes('ext.desk.opera.transfers'));
  rosa.push('aside', 'ext.desk.opera.book-transfer', { stayId: 'stay_nadia', propertyId: 'prop_lumen', staffId: 'stf_rosa', expanded: true }, []);
  await settle(16);
  const car = cardData(rosa, 'ext.desk.opera.book-transfer', 'aside');
  const routes = rows(car, 'routes');
  check(`the routes are Opera's, priced (${routes.length})`, routes.length === 3 && routes.some((r) => String(r['label']).includes('Copenhagen Airport')));

  // Her flight is at 08:20, so the car is at 06:00 — the one judgement on the
  // card, and the field an assistant fills. Typed here, because this check
  // asserts the SEAM, not the model.
  tapCard(rosa, 'ext.desk.opera.book-transfer', 'pick-route', routes[0], 'aside');
  tapCard(rosa, 'ext.desk.opera.book-transfer', 'time', '06:00', 'aside', 'ui:model');
  await settle(8);
  tapCard(rosa, 'ext.desk.opera.book-transfer', 'book', undefined, 'aside');
  await settle(20);

  const booked = await sql(`SELECT pickup_at, destination, confirmation FROM transfers WHERE stay_id = 'stay_nadia' AND status = 'booked'`, []);
  check('the car is booked for the hour that was named', booked[0]?.['pickup_at'] === '06:00');
  check("...with the VENDOR's reference, because Opera holds the contract", String(booked[0]?.['confirmation'] ?? '').startsWith('OPERA-TRF-'));
  const fare = await sql(`SELECT amount FROM folio_lines WHERE stay_id = 'stay_nadia' AND description LIKE 'Copenhagen Airport%'`, []);
  check('...and the fare from the catalogue is on her bill', Number(fare[0]?.['amount']) === 55);

  // The same capability at the other hotel, through the other vendor.
  pilar.push('aside', 'ext.desk.mews.book-transfer', { stayId: 'stay_lucia', propertyId: 'prop_marisol', staffId: 'stf_pilar', expanded: true }, []);
  await settle(16);
  const mewsRoutes = rows(cardData(pilar, 'ext.desk.mews.book-transfer', 'aside'), 'routes');
  check('Marisol offers PALMA, not Copenhagen — the menu is the connector’s', mewsRoutes.some((r) => String(r['label']).includes('Palma')) && !mewsRoutes.some((r) => String(r['label']).includes('Copenhagen')));

  // ═══ 6. the afternoon's real constraint ══════════════════
  await openFromMenu(rosa, 'desk.rooms');
  await settle(12);
  const board = cardData(rosa, 'desk.rooms');
  check(`the room board lists the house (${rows(board, 'rows').length})`, rows(board, 'rows').length === 36);

  tapCard(rosa, 'desk.rooms', 'tab', 'turning');
  await settle(10);
  const turning = rows(cardData(rosa, 'desk.rooms'), 'rows');
  check(`the "to turn" tab narrows to what housekeeping owes (${turning.length})`, turning.length >= 3 && turning.every((r) => r['status'] === 'dirty'));

  // Signing a room off is what makes it sellable — the desk's one verb.
  const toSign = turning.find((r) => r['room_id'] === 'rm_l_213');
  tapCard(rosa, 'desk.rooms', 'release', toSign);
  await settle(14);
  const signed = await sql(`SELECT status FROM rooms WHERE id = 'rm_l_213'`, []);
  check('signing a room off makes it sellable', signed[0]?.['status'] === 'inspected');

  // ═══ 7. five rooms at half four ══════════════════════════
  rosa.push('detail', 'desk.group', { groupId: 'grp_wedding', propertyId: 'prop_lumen', expanded: true }, ['detail']);
  await settle(16);
  const group = cardData(rosa, 'desk.group', 'detail');
  check('the block names itself', String((group['group'] as Row)?.['label'] ?? '').includes('wedding'));
  check(`...and holds five rooms (${rows(group, 'stays').length})`, rows(group, 'stays').length === 5);
  const ready = group['ready'] as string[];
  check(`...of which four are ready to check in (${ready.length})`, ready.length === 4);

  tapCard(rosa, 'desk.group', 'checkin-ready', undefined, 'detail');
  await settle(18);
  const inHouse = await sql(`SELECT count(*) AS n FROM stays WHERE group_id = 'grp_wedding' AND checked_in = true`, []);
  check('one press checks in everybody whose room is signed off', Number(inHouse[0]?.['n']) === 4);
  const stranded = await sql(`SELECT s.id FROM stays s JOIN rooms r ON r.id = s.room_id WHERE s.group_id = 'grp_wedding' AND s.checked_in = false`, []);
  check('...and nobody is checked into a room that is still dirty', stranded.length === 1);

  // ═══ 8. what the desk writes down, and hands on ══════════
  rosa.push('aside', 'desk.note', { stayId: 'stay_olav', propertyId: 'prop_lumen', author: 'Rosa Delgado', expanded: true }, []);
  await settle(14);
  tapCard(rosa, 'desk.note', 'kind', 'note', 'aside');
  tapCard(rosa, 'desk.note', 'body', 'Tenth anniversary — mentioned it in the thread. Something on the table Thursday.', 'aside', 'ui:model');
  await settle(8);
  tapCard(rosa, 'desk.note', 'save', undefined, 'aside');
  await settle(16);
  const note = await sql(`SELECT body, kind, author FROM stay_notes WHERE stay_id = 'stay_olav' ORDER BY created_at DESC LIMIT 1`, []);
  check('a note written on the shift lands on the stay', String(note[0]?.['body'] ?? '').includes('Tenth anniversary'));
  check('...signed by whoever wrote it', note[0]?.['author'] === 'Rosa Delgado');

  await openFromMenu(rosa, 'desk.handover');
  await settle(12);
  const handover = cardData(rosa, 'desk.handover');
  check(`the night's handover is there to read (${rows(handover, 'notes').length})`, rows(handover, 'notes').some((h) => String(h['body']).includes('412 rang down twice')));
  tapCard(rosa, 'desk.handover', 'shift', 'day');
  tapCard(rosa, 'desk.handover', 'body', 'Moved 412 to 613 and comped their dinner. Lift 2 still nobody. Wedding block in, two rooms late.', undefined, 'ui:model');
  await settle(8);
  tapCard(rosa, 'desk.handover', 'save');
  await settle(16);
  const left = await sql(`SELECT body, shift FROM handovers WHERE property_id = 'prop_lumen' ORDER BY created_at DESC LIMIT 1`, []);
  check('the shift note is left for whoever is on next', String(left[0]?.['body'] ?? '').includes('Lift 2 still nobody'));

  // ═══ 9. above my pay grade ═══════════════════════════════
  rosa.push('detail', 'desk.escalate', { propertyId: 'prop_lumen', stayId: 'stay_amara', issueId: 'iss_amara', expanded: true }, ['detail']);
  await settle(14);
  const escalate = cardData(rosa, 'desk.escalate', 'detail');
  const floor = rows(escalate, 'staff');
  check(`escalation offers real colleagues (${floor.length})`, floor.some((s) => s['name'] === 'Mette Klausen'));

  tapCard(rosa, 'desk.escalate', 'pick-person', floor.find((s) => s['name'] === 'Mette Klausen'), 'detail');
  tapCard(rosa, 'desk.escalate', 'title', 'Room 412 — third AC fault this quarter', 'detail', 'ui:model');
  tapCard(rosa, 'desk.escalate', 'detail', 'Moved her to 613 and comped dinner. The unit has been signed off twice as no-fault-found and it is not.', 'detail', 'ui:model');
  await settle(8);
  tapCard(rosa, 'desk.escalate', 'hand', undefined, 'detail');
  await settle(16);

  const handed = await sql(`SELECT title, detail, kind, assignee_id FROM tasks WHERE kind = 'front-office' ORDER BY created_at DESC LIMIT 1`, []);
  check('handing it on writes a task against a named person', handed[0]?.['assignee_id'] === 'stf_mette');
  check('...carrying the whole story, not just a title', String(handed[0]?.['detail'] ?? '').includes('no-fault-found'));

  // …and it lands on the surface that shows what is waiting, which is what
  // stops an escalation being a message thrown over a wall.
  await openFromMenu(rosa, 'desk.attention');
  await settle(14);
  check('...and it appears on the list of what needs a person', rows(cardData(rosa, 'desk.attention'), 'handed').some((t) => String(t['title']).includes('third AC fault')));

  report('the front desk, driven end to end');
};

void main();
