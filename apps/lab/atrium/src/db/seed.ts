import { resolveSql } from './resolve';
import { integrationsBase } from '../integrations/port';
import { insert, type Val } from './demo/sql';
import { lumenSql } from './demo/lumen';
import { marisolSql } from './demo/marisol';
import { assistantsSql, seenSql, staffSql } from './demo/staff';

export { LUMEN } from './demo/lumen';
export { MARISOL } from './demo/marisol';

export const CAPABILITIES: [string, string, string, boolean][] = [
  ['stay.view', 'See the stay', 'Read a reservation: room, dates, rate, state.', true],
  ['checkin.online', 'Check in online', 'Complete arrival formalities before reaching the desk.', false],
  ['key.issue', 'Mobile room key', 'Issue a door credential to the guest’s phone.', false],
  ['checkout.express', 'Express checkout', 'Settle and depart without stopping at the desk.', false],
  ['folio.read', 'Read the folio', 'Show posted charges against the stay.', true],
  ['message.send', 'Message the desk', 'Two-way messaging between guest and front office.', true],
  ['housekeeping.request', 'Request housekeeping', 'Guest-initiated service requests against a room.', false],
  ['spa.book', 'Book the spa', 'Reserve a treatment slot from the property’s spa module.', false],
  ['upgrade.offer', 'Offer upgrades', 'Present paid room upgrades, and answer the asks.', false],
  ['wakecall.set', 'Wake-up calls', 'Guest sets a morning call; the desk works the sheet.', false],
  ['checkout.late', 'Late checkout', 'Sell extra hours on departure day, desk-approved.', false],
  ['minibar.post', 'Minibar honesty bar', 'Guest posts taken items straight to the folio.', false],
  ['folio.adjust', 'Correct the bill', 'Take a wrongly posted charge off a folio, through the PMS that owns it.', false],
  ['transfer.book', 'Airport transfers', 'Book a car to or from the airport against a stay.', false],
  ['goodwill.grant', 'Goodwill', 'Put something right: a comped item, a credit, a gesture on the bill.', false],
  ['issue.manage', 'Work issues', 'Front office issue queue: triage, assign, resolve.', true],
  ['task.assign', 'Assign work', 'Dispatch housekeeping and maintenance tasks.', true],
  ['room.manage', 'Room status', 'Read and move a room between clean, inspected and out of order.', true],
  ['ops.overview', 'House overview', 'Occupancy, arrivals, out-of-order rooms.', true],
  ['issue.report', 'Report a fault', 'Guest raises a categorised ticket against a room.', false],
];

export const SLOTS: [string, string, string, string, string, string, string | null, string, string, string, number][] = [
  ['guest', 'gs_stay', 'stay.overview', 'Your stay', 'Read this reservation: room, dates, rate and what is booked. Use to answer what was booked or when it runs. Nothing to submit.', 'bed', 'stay.view', 'any', 'stay room booking reservation dates', 'home', 10],
  ['guest', 'gs_checkin', 'stay.checkin', 'Check in', 'Complete arrival formalities before reaching the desk. Only for a stay still due in. Marks the stay checked in.', 'check', 'checkin.online', 'arriving', 'check in arrive arrival early', 'home', 20],
  ['guest', 'gs_key', 'stay.key', 'Room key', 'Issue a door credential to this guest’s phone. Only once they are in house. Adds a working key.', 'key', 'key.issue', 'in_house', 'key door unlock card access room', 'home', 30],
  ['guest', 'gs_housekeeping', 'stay.request', 'Housekeeping', 'Ask housekeeping for a service in the room — towels, turndown, or to skip it today. Only while in house. Raises a request the floor picks up.', 'sparkle', 'housekeeping.request', 'in_house', 'housekeeping towels clean room service tidy', 'home', 40],
  ['guest', 'gs_report', 'stay.request', 'Report a problem', 'Report something broken or wrong in the room. Only while in house. Raises an issue the desk triages and sends a trade to.', 'alert', 'issue.report', 'in_house', 'broken problem wrong rattling noisy hot cold water air conditioning wifi noise leak smell', 'home', 55],
  ['guest', 'gs_message', 'stay.message', 'Message the desk', 'Write to the front desk and read what they write back. Use when no other action covers what they are asking for. Sends words only — it dispatches nobody.', 'chat', 'message.send', 'any', 'message desk ask help problem broken tell', 'home', 60],
  ['guest', 'gs_folio', 'stay.folio', 'Your bill', 'Read what has been posted to this stay so far. Use to answer what something cost or what the bill stands at. Nothing to submit — a wrong charge is taken off by the desk.', 'receipt', 'folio.read', 'any', 'bill folio charges cost invoice receipt pay', 'home', 70],
  ['guest', 'gs_checkout', 'stay.checkout', 'Express checkout', 'Settle the bill and leave without stopping at the desk. Only on departure day, while in house. Closes the stay and frees the room.', 'door', 'checkout.express', 'in_house', 'checkout leave depart early flight morning taxi', 'home', 80],

  ['desk', 'ds_attention', 'desk.attention', 'Needs a person', 'Read everything with nobody on it: guests waiting for a reply, faults nobody was sent to, and asks awaiting a yes. Oldest first. The queue to work from when nothing else is pointing anywhere. Acting on a row happens in the action for that row, not here.', 'alert', 'stay.view', 'any', 'waiting stalled unanswered overdue what should i do next needs attention queue urgent', 'work', 6],

  ['desk', 'ds_issue_tile', 'desk.issue.tile', 'Issues', 'Read how many faults are open. A count only — open the board to work them.', 'flag', 'issue.manage', 'any', 'issues board problems complaints how many open', 'detail', 8],
  ['desk', 'ds_issue_list', 'desk.issue.list', 'Issue board', 'Read every fault raised at this property, filtered by state. Use to FIND one; opening a row is what acts on it. Changes nothing itself.', 'flag', 'issue.manage', 'any', 'issues board problems complaints queue', 'work', 10],
  ['desk', 'ds_issue', 'desk.issue.detail', 'The issue', 'Work one fault: read what was reported and what has been done about it, send it to a trade, or mark it resolved. Use whenever one specific fault is the subject. Sending creates a task against the person chosen; resolving closes the fault.', 'flag', 'issue.manage', 'any', 'issue open read complaint problem this one', 'detail', 11],

  ['desk', 'ds_inbox_tile', 'desk.message.tile', 'Messages', 'Read the latest thing a guest said. A preview only — open the conversation to answer it.', 'chat', 'message.send', 'any', 'messages inbox chat guests latest unread', 'detail', 18],
  ['desk', 'ds_inbox', 'desk.message.list', 'Messages', 'Read every guest conversation at this property, newest first. Use to FIND one; opening a row is what lets you reply. Changes nothing itself.', 'chat', 'message.send', 'any', 'messages inbox chat guests', 'work', 20],
  ['desk', 'ds_thread', 'desk.thread.detail', 'The conversation', 'Read one guest’s thread and put a written reply in the box for them. Use whenever the next step is words to that guest. Sends nothing — the user presses send.', 'chat', 'message.send', 'any', 'thread conversation what they said reading talking to guest reply write back answer respond tell them', 'detail', 21],

  ['desk', 'ds_movements', 'desk.movements', 'Arrivals & departures', 'Read who is arriving, who is leaving, and who is still waiting on a room. Use to FIND a stay by name or by slice; acting on one happens in the action for it. Changes nothing itself.', 'door', 'stay.view', 'any', 'arrivals departures today movements checking in out due expected group block', 'work', 30],
  ['desk', 'ds_rooms', 'desk.rooms', 'Rooms', 'Read which rooms are clean, ready or unsellable, and move one between those states. Use when a ROOM is the question, not a guest. Changes what the desk may sell.', 'bed', 'room.manage', 'any', 'rooms clean dirty ready inspected status housekeeping release sellable free available', 'work', 32],
  ['desk', 'ds_handover', 'desk.handover', 'Handover', 'Read the note the last shift left, and write the one for the next. Use at the end of a shift to leave it, or at the start to catch up on what happened overnight. Saving it puts it in front of whoever comes on next.', 'chat', 'stay.view', 'any', 'handover shift note end of shift pass on leaving night', 'work', 60],

  ['desk', 'ds_guest', 'desk.guest', 'The stay', 'Read the state of one reservation, and check the guest in or out. Use whenever the stay itself is the subject; the check in and check out are live on the day they arrive or leave. Either one commits or frees the room.', 'bed', 'stay.view', 'any', 'guest check in check out manage stay checked arrival departure', 'aside', 25],
  ['desk', 'ds_brief', 'desk.brief', 'Guest profile', 'Read who a guest is: previous stays, what they have spent, their preferences, and what is still open for them. Use before speaking to them, and most of all when they have stayed before — that is when there is something to know. Nothing to submit.', 'sparkle', 'stay.view', 'any', 'who is this brief context history background regular returning spend preferences vip', 'aside', 5],
  ['desk', 'ds_move', 'desk.move', 'Move rooms', 'Put a guest in a different room and write them the line explaining why. Use when their own room cannot be made right under them. Reassigns the room; the user sends the words.', 'door', 'room.manage', 'any', 'move room change relocate transfer another room swap different quiet away', 'aside', 30],
  ['desk', 'ds_request', 'desk.request', 'Guest request', 'Send something a guest has asked for to whoever does it — housekeeping, maintenance or the front office. Use when a guest wants something and nothing is broken; a fault goes to the issue board instead, and a note only records. Puts a job on that person’s list.', 'sparkle', 'task.assign', 'any', 'request ask wants asked for pillows towels breakfast extra bring send housekeeping job errand', 'aside', 32],
  ['desk', 'ds_note', 'desk.note', 'Notes', 'Write down a fact about a guest for whoever deals with them next — a preference, an occasion, something to be careful of. For knowledge worth keeping, NEVER for work that needs doing. Saves a note; it dispatches nobody.', 'chat', 'stay.view', 'any', 'note remember preference anniversary birthday quiet floor allergy write down', 'aside', 35],
  ['desk', 'ds_escalate', 'desk.escalate', 'Escalate', 'Hand a stay, a fault or a room to the duty manager with the whole story written out. Use when it is past what the desk can settle. Creates a job on the manager’s list.', 'alert', 'issue.manage', 'any', 'escalate manager duty supervisor above my pay grade hand over get someone', 'detail', 40],
  ['desk', 'ds_arrival', 'desk.arrival', 'Arrival prep', 'Ready a room for somebody who has not walked in yet and release it to them. ONLY for a stay still due in — never for a guest already in house, and never a way to answer something they have asked for. Marks the room given to them.', 'check', 'stay.view', 'any', 'arriving prep ready before arrival due eta expected preparing', 'detail', 26],
  ['desk', 'ds_group', 'desk.group', 'The group', 'Check in a block of stays booked together, in one go. Use when a party of several rooms arrives at once. Checks in every stay in the block whose room is ready, and leaves the rest.', 'door', 'stay.view', 'any', 'group block wedding party together conference tour five rooms', 'detail', 28],
  ['desk', 'ds_keys', 'desk.keys', 'Issue a key', 'Cut a door credential for a stay. Use when a guest needs a key or has lost the one they had. Issues a working key to their phone.', 'key', 'key.issue', 'any', 'key credential door cut issue card', 'aside', 40],

  ['service', 'sv_tasks', 'service.tasks', 'My work', 'Read the jobs sent to you and mark one finished. Newest first. Closing a job is what tells the desk it is done.', 'wrench', 'task.assign', 'any', 'work tasks jobs', 'work', 10],

  ['ops', 'op_issues', 'ops.issues', 'Issues by type', 'Read which faults keep recurring and in which rooms. Counts only — one fault is worked from the desk’s issue board, not here.', 'flag', 'issue.manage', 'any', 'issues type recurring', 'work', 20],
  ['ops', 'op_rooms', 'ops.rooms', 'Rooms', 'Take a room out of service, or put it back. Use when a room must not be sold at all — a room that is merely dirty is handled at the desk. Changes what the whole property can sell.', 'bed', 'ops.overview', 'any', 'rooms inventory out of order service', 'work', 30],
  ['ops', 'op_integrations', 'ops.integrations', 'Integrations', 'Switch a connector’s services on or off for this hotel. Use to change what the property can do at all, never to act on one guest. Adds or removes actions from every screen in the building.', 'plug', null, 'any', 'integrations services connector pms capabilities offer enable disable switch turn on off check-in checkout spa minibar wake', 'work', 40],
];

export const buildSeedSql = (): string => {
  const out: string[] = [];

  out.push(insert('capabilities', ['id', 'label', 'blurb', 'core'], CAPABILITIES.map(([id, label, blurb, core]) => [id, label, blurb, core] as Val[])));

  out.push(
    insert(
      'connectors',
      ['id', 'name', 'vendor', 'kind', 'live_version', 'service_url', 'notes'],
      [
        ['con_opera', 'Opera Cloud', 'Oracle Hospitality', 'pms', 2, `${integrationsBase()}/opera`, 'Mobile key + express checkout are built and switched off. Flip them and go live.'],
        ['con_mews', 'Mews', 'Mews Systems', 'pms', 3, `${integrationsBase()}/mews`, 'Spa (live availability) and housekeeping modules. No door credential API.'],
        ['con_ticketing', 'HotelFix', 'HotelFix Ltd', 'ticketing', 1, `${integrationsBase()}/hotelfix`, 'Fault ticketing. Both hotels run it; it owns the report categories.'],
      ],
    ),
  );

  out.push(
    insert(
      'properties',
      ['id', 'name', 'city', 'accent', 'connector_id', 'external_id'],
      [
        ['prop_lumen', 'The Lumen', 'Copenhagen', 'sage', 'con_opera', 'OPERA-HTL-4417'],
        ['prop_marisol', 'Casa Marisol', 'Palma', 'clay', 'con_mews', 'MEWS-ENT-0092'],
      ],
    ),
  );

  out.push(
    insert(
      'property_connectors',
      ['id', 'property_id', 'connector_id'],
      [
        ['pcx_lumen_opera', 'prop_lumen', 'con_opera'],
        ['pcx_lumen_ticketing', 'prop_lumen', 'con_ticketing'],
        ['pcx_marisol_mews', 'prop_marisol', 'con_mews'],
        ['pcx_marisol_ticketing', 'prop_marisol', 'con_ticketing'],
      ],
    ),
  );

  const pcRows: Val[][] = [];
  for (const [cap] of CAPABILITIES) {
    pcRows.push([`prop_lumen:${cap}`, 'prop_lumen', cap, true]);
    pcRows.push([`prop_marisol:${cap}`, 'prop_marisol', cap, cap !== 'checkin.online']);
  }
  out.push(insert('property_capabilities', ['id', 'property_id', 'capability_id', 'enabled'], pcRows));

  out.push(
    insert(
      'surface_slots',
      ['audience', 'id', 'action_id', 'title', 'blurb', 'icon', 'capability_id', 'stay_state', 'keywords', 'canvas', 'position'],
      SLOTS.map((s) => [...s] as Val[]),
    ),
  );

  out.push(staffSql());
  out.push(lumenSql());
  out.push(marisolSql());
  out.push(assistantsSql());
  out.push(seenSql());

  out.push(resolveSql());

  return out.join('\n');
};
