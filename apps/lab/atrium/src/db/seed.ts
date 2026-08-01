// Atrium's demo dataset — the ESTATE half, and the composer for everything else.
//
// This file authors only what is ours and what is shared: the capability
// vocabulary, the connector registry, the properties and their bindings, and the
// core slot catalog. The two hotels themselves — their rooms, guests, stays,
// bills, threads, faults and history — live in `demo/lumen.ts` and
// `demo/marisol.ts`, because a rooming list is a different kind of document from
// a capability matrix and reading one while looking for the other was the reason
// this file used to be unreadable.
//
// What is NOT here at all: anything an integration ships. Bundles (actions,
// queries, slots, menus) and each connector's capability matrix arrive over the
// wire — boot and every resync PULL them from the integrations service and
// upsert through intake.
//
// The dataset shifts with the wall clock, and it does so in SQL rather than in
// node, so the seeded dates and the database's own column defaults are computed
// on one clock. See `demo/sql.ts` for why that is not a detail.

import { resolveSql } from './resolve';
import { integrationsBase } from '../integrations/port';
import { insert, type Val } from './demo/sql';
import { lumenSql } from './demo/lumen';
import { marisolSql } from './demo/marisol';
import { assistantsSql, seenSql, staffSql } from './demo/staff';

export { LUMEN } from './demo/lumen';
export { MARISOL } from './demo/marisol';

// ─── our capability vocabulary ───────────────────────────────
//
// The fourth column is `core`: TRUE when the app implements the capability
// itself, over its own tables, with no vendor behind it. Those are live at a
// property the moment it switches them on, whether or not any integration is
// reachable — so the board, the inbox, the movements list and room status keep
// working while a vendor's process is down.
//
// FALSE is the interesting half, and the line is drawn by asking one question:
// could we serve this with the integrations service switched off forever? A
// door credential, a spa diary, express checkout, a car — no. Those stay dark
// until their connector reports them, which is the whole four-factor claim.
//
// id, label, blurb, core
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
  // Correcting a posted charge is a PMS feature — Opera does folio adjustments,
  // Mews voids bill items — so the SURFACES for it ship in those connectors'
  // bundles. This row is only the word we call it by; the app holds no way to
  // perform it.
  ['folio.adjust', 'Correct the bill', 'Take a wrongly posted charge off a folio, through the PMS that owns it.', false],
  // Airport transfers. The capability the concierge could famously never serve
  // — "ask either for a taxi and neither invents one" — and now both PMS
  // connectors implement it, switched on, at both hotels, from the first boot.
  // Nothing to enable and nothing to find: a feature somebody has to go and
  // flip before it works is a feature nobody in the room believes in.
  //
  // NOT core: somebody has to actually send a car, and that somebody is a
  // vendor with a fleet.
  ['transfer.book', 'Airport transfers', 'Book a car to or from the airport against a stay.', false],
  // What a desk gives away to put something right. Ours as a word; the GESTURES
  // and their prices are connector rows, which is the only reason a machine may
  // choose one — it picks from a menu somebody priced, and never a number. That
  // menu is why this is not core either: with no connector there is no priced
  // list, and a gesture surface with nothing on it is worse than none.
  ['goodwill.grant', 'Goodwill', 'Put something right: a comped item, a credit, a gesture on the bill.', false],
  // ── the floor: our own product, over our own tables ──
  ['issue.manage', 'Work issues', 'Front office issue queue: triage, assign, resolve.', true],
  ['task.assign', 'Assign work', 'Dispatch housekeeping and maintenance tasks.', true],
  ['room.manage', 'Room status', 'Read and move a room between clean, inspected and out of order.', true],
  ['ops.overview', 'House overview', 'Occupancy, arrivals, out-of-order rooms.', true],
  // Provided by the TICKETING system, not the PMS — so a hotel's report
  // categories come from a different integration than its spa.
  ['issue.report', 'Report a fault', 'Guest raises a categorised ticket against a room.', false],
];

// ─── the CORE slot catalog ───────────────────────────────────
// What the app itself ships (source 'core'). The integrations add their own rows
// at sync time — spa, minibar, wake calls, transfers, goodwill and approvals all
// arrive with their connector, stamped with its source.
//
// `canvas` is where the surface belongs on a shell that has several. Guests have
// one column, so every guest slot says `home`. A crew screen is several:
// `work` (the wide column you actually work in), `detail` (the one record open
// beside it, only ever pushed) and `aside` (stay-scoped, arriving in a guest's
// workspace when one is opened).
//
// ═══════════════════════════════════════════════════════════
// HOW TO WRITE A BLURB — read this before adding or editing one.
//
// The blurb is the ONLY thing the assistant has when it chooses. Titles are
// short by design, ids are structural, and keywords never reach the prompt. If
// the wrong action gets picked, this string is why.
//
// Three clauses, in this order:
//
//   what it does      the verb and its object.
//                     "Approve or decline one pending upgrade or late checkout."
//   when it applies   the precondition — and, when something else is confusable,
//                     what it is NOT for.
//                     "Only for a stay still due in, never for a guest in house."
//   what comes out    what changes when the clerk presses the button. For a
//                     read-only surface, say that nothing does.
//                     "Posts the charge and answers the guest."
//
// A blurb that describes what the card SHOWS is not finished. A contents list
// ("room state, preferences, and what is already asked for") reads as a match
// for anything those words appear in.
//
// The test: cover the title and the id. Could somebody who knows nothing about
// this hotel still tell this action apart from every other one in the list, and
// know when to reach for it? If not, it is not written yet.
//
// No mood, no adjectives, no phrase that is there because it reads well.
// ═══════════════════════════════════════════════════════════
//
// audience, id, action, title, blurb, icon, capability, stay_state, keywords, canvas, position
export const SLOTS: [string, string, string, string, string, string, string | null, string, string, string, number][] = [
  ['guest', 'gs_stay', 'stay.overview', 'Your stay', 'Read this reservation: room, dates, rate and what is booked. Use to answer what was booked or when it runs. Nothing to submit.', 'bed', 'stay.view', 'any', 'stay room booking reservation dates', 'home', 10],
  ['guest', 'gs_checkin', 'stay.checkin', 'Check in', 'Complete arrival formalities before reaching the desk. Only for a stay still due in. Marks the stay checked in.', 'check', 'checkin.online', 'arriving', 'check in arrive arrival early', 'home', 20],
  ['guest', 'gs_key', 'stay.key', 'Room key', 'Issue a door credential to this guest’s phone. Only once they are in house. Adds a working key.', 'key', 'key.issue', 'in_house', 'key door unlock card access room', 'home', 30],
  // One action, two capabilities: the same form serves a service ask and a fault
  // report, and the capability chosen decides which menu it loads. Each blurb
  // describes ITS OWN job — the assistant is shown all of them, so neither may
  // rule out what the other offers.
  ['guest', 'gs_housekeeping', 'stay.request', 'Housekeeping', 'Ask housekeeping for a service in the room — towels, turndown, or to skip it today. Only while in house. Raises a request the floor picks up.', 'sparkle', 'housekeeping.request', 'in_house', 'housekeeping towels clean room service tidy', 'home', 40],
  ['guest', 'gs_report', 'stay.request', 'Report a problem', 'Report something broken or wrong in the room. Only while in house. Raises an issue the desk triages and sends a trade to.', 'alert', 'issue.report', 'in_house', 'broken problem wrong rattling noisy hot cold water air conditioning wifi noise leak smell', 'home', 55],
  ['guest', 'gs_message', 'stay.message', 'Message the desk', 'Write to the front desk and read what they write back. Use when no other action covers what they are asking for. Sends words only — it dispatches nobody.', 'chat', 'message.send', 'any', 'message desk ask help problem broken tell', 'home', 60],
  ['guest', 'gs_folio', 'stay.folio', 'Your bill', 'Read what has been posted to this stay so far. Use to answer what something cost or what the bill stands at. Nothing to submit — a wrong charge is taken off by the desk.', 'receipt', 'folio.read', 'any', 'bill folio charges cost invoice receipt pay', 'home', 70],
  ['guest', 'gs_checkout', 'stay.checkout', 'Express checkout', 'Settle the bill and leave without stopping at the desk. Only on departure day, while in house. Closes the stay and frees the room.', 'door', 'checkout.express', 'in_house', 'checkout leave depart early flight morning taxi', 'home', 80],

  // ── the desk ──
  ['desk', 'ds_attention', 'desk.attention', 'Needs a person', 'Read everything with nobody on it: guests waiting for a reply, faults nobody was sent to, and asks awaiting a yes. Oldest first. The queue to work from when nothing else is pointing anywhere. Acting on a row happens in the action for that row, not here.', 'alert', 'stay.view', 'any', 'waiting stalled unanswered overdue what should i do next needs attention queue urgent', 'work', 6],

  // The issue family. `tile` is pushed, never composed; `list` opens a `detail`;
  // `detail` carries the dispatch controls. Each is its own slot because a slot
  // is what the assistant reads — a detail with no slot row would be addressable
  // and still invisible to it.
  ['desk', 'ds_issue_tile', 'desk.issue.tile', 'Issues', 'Read how many faults are open. A count only — open the board to work them.', 'flag', 'issue.manage', 'any', 'issues board problems complaints how many open', 'detail', 8],
  ['desk', 'ds_issue_list', 'desk.issue.list', 'Issue board', 'Read every fault raised at this property, filtered by state. Use to FIND one; opening a row is what acts on it. Changes nothing itself.', 'flag', 'issue.manage', 'any', 'issues board problems complaints queue', 'work', 10],
  ['desk', 'ds_issue', 'desk.issue.detail', 'The issue', 'Work one fault: read what was reported and what has been done about it, send it to a trade, or mark it resolved. Use whenever one specific fault is the subject. Sending creates a task against the person chosen; resolving closes the fault.', 'flag', 'issue.manage', 'any', 'issue open read complaint problem this one', 'detail', 11],

  // The message family. The conversation is a `detail`-canvas slot: only ever
  // pushed, by its parent or by the assistant, never composed or listed.
  ['desk', 'ds_inbox_tile', 'desk.message.tile', 'Messages', 'Read the latest thing a guest said. A preview only — open the conversation to answer it.', 'chat', 'message.send', 'any', 'messages inbox chat guests latest unread', 'detail', 18],
  ['desk', 'ds_inbox', 'desk.message.list', 'Messages', 'Read every guest conversation at this property, newest first. Use to FIND one; opening a row is what lets you reply. Changes nothing itself.', 'chat', 'message.send', 'any', 'messages inbox chat guests', 'work', 20],
  ['desk', 'ds_thread', 'desk.thread.detail', 'The conversation', 'Read one guest’s thread and put a written reply in the box for them. Use whenever the next step is words to that guest. Sends nothing — the user presses send.', 'chat', 'message.send', 'any', 'thread conversation what they said reading talking to guest reply write back answer respond tell them', 'detail', 21],

  // Movements. One list of who is coming and going, filtered — it used to be two
  // surfaces reading the same query, one of which searched by name in order to
  // cut a key.
  ['desk', 'ds_movements', 'desk.movements', 'Arrivals & departures', 'Read who is arriving, who is leaving, and who is still waiting on a room. Use to FIND a stay by name or by slice; acting on one happens in the action for it. Changes nothing itself.', 'door', 'stay.view', 'any', 'arrivals departures today movements checking in out due expected group block', 'work', 30],
  // Room status — the desk's half of it. Ops owns taking a room out of service;
  // the desk needs to know what is sellable and to release one when it is ready.
  ['desk', 'ds_rooms', 'desk.rooms', 'Rooms', 'Read which rooms are clean, ready or unsellable, and move one between those states. Use when a ROOM is the question, not a guest. Changes what the desk may sell.', 'bed', 'room.manage', 'any', 'rooms clean dirty ready inspected status housekeeping release sellable free available', 'work', 32],
  ['desk', 'ds_handover', 'desk.handover', 'Handover', 'Read the note the last shift left, and write the one for the next. Use at the end of a shift to leave it, or at the start to catch up on what happened overnight. Saving it puts it in front of whoever comes on next.', 'chat', 'stay.view', 'any', 'handover shift note end of shift pass on leaving night', 'work', 60],

  // Stay-scoped: the workspace, never the house screen.
  ['desk', 'ds_guest', 'desk.guest', 'The stay', 'Read the state of one reservation, and check the guest in or out. Use whenever the stay itself is the subject; the check in and check out are live on the day they arrive or leave. Either one commits or frees the room.', 'bed', 'stay.view', 'any', 'guest check in check out manage stay checked arrival departure', 'aside', 25],
  ['desk', 'ds_brief', 'desk.brief', 'Guest profile', 'Read who a guest is: previous stays, what they have spent, their preferences, and what is still open for them. Use before speaking to them, and most of all when they have stayed before — that is when there is something to know. Nothing to submit.', 'sparkle', 'stay.view', 'any', 'who is this brief context history background regular returning spend preferences vip', 'aside', 5],
  ['desk', 'ds_move', 'desk.move', 'Move rooms', 'Put a guest in a different room and write them the line explaining why. Use when their own room cannot be made right under them. Reassigns the room; the user sends the words.', 'door', 'room.manage', 'any', 'move room change relocate transfer another room swap different quiet away', 'aside', 30],
  ['desk', 'ds_request', 'desk.request', 'Guest request', 'Send something a guest has asked for to whoever does it — housekeeping, maintenance or the front office. Use when a guest wants something and nothing is broken; a fault goes to the issue board instead, and a note only records. Puts a job on that person’s list.', 'sparkle', 'task.assign', 'any', 'request ask wants asked for pillows towels breakfast extra bring send housekeeping job errand', 'aside', 32],
  ['desk', 'ds_note', 'desk.note', 'Notes', 'Write down a fact about a guest for whoever deals with them next — a preference, an occasion, something to be careful of. For knowledge worth keeping, NEVER for work that needs doing. Saves a note; it dispatches nobody.', 'chat', 'stay.view', 'any', 'note remember preference anniversary birthday quiet floor allergy write down', 'aside', 35],
  ['desk', 'ds_escalate', 'desk.escalate', 'Escalate', 'Hand a stay, a fault or a room to the duty manager with the whole story written out. Use when it is past what the desk can settle. Creates a job on the manager’s list.', 'alert', 'issue.manage', 'any', 'escalate manager duty supervisor above my pay grade hand over get someone', 'detail', 40],
  // Pushed only — the arrival prep sheet is opened AT a stay, not composed.
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

  // service_url comes from the one port seam (integrations/port.ts) — the same
  // number the service listens on, so the checks' hermetic world and the dev
  // environment each agree with themselves and never with each other.
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

  // NOTE what is deliberately absent: connector_capabilities. The matrix is the
  // SERVICE's truth — the first sync pulls it (with each capability's default
  // switch state) and upserts; from then on the vendor console owns the switches
  // and a re-sync never flips them.

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

  // Every integration each property runs — the PMS of record plus the shared
  // ticketing tool. The resolver unions capabilities across these.
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

  // Also deliberately absent: request_options, bundle_actions, bundle_entries
  // and every bundle-shipped slot. All of it is the integrations' cargo — it
  // arrives with the pull, through intake, never from this file.

  // What each property has turned ON. The Lumen enables everything its
  // connectors could ever do — so the ONLY thing keeping the key dark is the
  // connector's own switch, which is what makes the flip legible. Casa Marisol
  // enables everything except online check-in: a boutique that wants you to meet
  // a human first. That one row is the second factor, visible without touching a
  // connector.
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

  // The floor of both houses, then the houses themselves.
  out.push(staffSql());
  out.push(lumenSql());
  out.push(marisolSql());
  out.push(assistantsSql());
  out.push(seenSql());

  // Resolve the whole matrix once, so a fresh database boots coherent. From here
  // on, only the vendor console moves these rows.
  out.push(resolveSql());

  return out.join('\n');
};
