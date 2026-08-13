// One URL, five applications. Boots the server's own shell for each principal
// and asserts on what actually mounted and what actually resolved onto it.
//
// Run: pnpm --filter atrium exec tsx src/dev/shells-check.ts
import { login, settle, mounted, topData, composed, cardData, catalogFor, openFromMenu, check, report } from './world';

// Slots are identified by slot_id now — spa, housekeeping and report all share
// the one generic `stay.request` action id, so the action id no longer tells
// them apart. The slot id does.
type Slot = { slot_id?: string; action_id?: string };
const slotIds = (data: Record<string, unknown>): string[] => (Array.isArray(data['slots']) ? (data['slots'] as Slot[]).map((s) => String(s.slot_id)) : []);
const actionIds = (data: Record<string, unknown>): string[] => (Array.isArray(data['slots']) ? (data['slots'] as Slot[]).map((s) => String(s.action_id)) : []);

const main = async (): Promise<void> => {
  // ── the five audiences boot five different applications ──
  const amara = await login('amara');
  const rosa = await login('rosa');
  const kwame = await login('kwame');
  const henrik = await login('henrik');
  const vendor = await login('atrium');
  await settle();

  // `main` is FURNITURE now — the guest's concierge and nothing else. Every
  // working surface for every audience is COMPOSED onto `home` from what
  // resolved, which is what let the crew's authored nav bar be deleted.
  check('a guest boots the concierge', mounted(amara, 'main')[0] === 'concierge');
  check('the front desk boots no authored screen at all', mounted(rosa, 'main').length === 0);
  check('...nor maintenance', mounted(kwame, 'main').length === 0);
  check('...nor operations', mounted(henrik, 'main').length === 0);
  check('...nor the vendor', mounted(vendor, 'main').length === 0);

  // What each of them gets instead: a composed working surface. The desk's
  // comes from its resolved slots, the vendor's from ring 1 (its console is
  // granted outright, never placed per property).
  // Composition is the MENU. `work` is a stack a clerk opens things onto, so it
  // starts empty — what is composed is the way IN, and the menu's contents are
  // the same resolved rows the cards used to be.
  check('the way in is the menu', composed(rosa).includes('staff.menu'));
  const rosaMenu = (cardData(rosa, 'staff.menu', 'nav')['entries'] ?? []) as Record<string, unknown>[];
  const menuIds = rosaMenu.map((row) => String(row['action_id']));
  check(`...and the menu offers what resolved for her (${menuIds.length})`, menuIds.includes('desk.issue.list'));
  check('...including what an INTEGRATION shipped for the desk', menuIds.some((id) => id.startsWith('ext.desk.')));
  check('...one row per surface, even when it holds two capability slots', menuIds.filter((id) => id === 'ext.desk.opera.approvals').length === 1);
  check('...but not the stay-scoped ones — those wait for a guest', !menuIds.includes('desk.guest') && !composed(rosa).includes('desk.guest'));
  check(`maintenance composes its own, shorter surface (${composed(kwame).length})`, composed(kwame).includes('staff.menu'));
  check('the vendor composes its console from ring 1', composed(vendor).includes('deploy.connectors') && composed(vendor).includes('deploy.rollout'));

  // The work column holds ONE working surface, and the menu owns which. A pile
  // of collapsed cards is what forced every surface to carry two faces; the menu
  // opening its own first entry is what replaced that.
  check('the menu has already opened its first surface onto work', mounted(rosa, 'work').length === 1);
  await openFromMenu(rosa, 'desk.issue.list');
  check('...the menu opens a surface onto it', mounted(rosa, 'work').includes('desk.issue.list'));
  await openFromMenu(rosa, 'ext.desk.opera.call-sheet');
  check('a BUNDLE surface opens from the menu like any other', mounted(rosa, 'work').includes('ext.desk.opera.call-sheet'));
  check('...replacing what was there — one working surface at a time', mounted(rosa, 'work').length === 1);
  check('the guest keeps one column — nothing else was composed for them', mounted(amara, 'home').length > 0 && mounted(amara, 'work').length === 0);

  // The ASSISTANT's column is empty until a guest comes into context — it is
  // one canvas with two writers (the app composes, the model adds), and
  // neither has anything to say at login.
  check('the assistant column is empty until there is a guest', mounted(rosa, 'aside').length === 0);

  check('guests get guest chrome', mounted(amara, 'chrome')[0] === 'chrome.guest');
  check('staff get staff chrome', mounted(rosa, 'chrome')[0] === 'chrome.staff');
  // Every principal needs chrome, or they cannot navigate or sign out. The
  // vendor is the one that does not extend a chrome-bearing role, so it is the
  // one to assert explicitly.
  check('the vendor has chrome too', mounted(vendor, 'chrome')[0] === 'chrome.staff');
  check('...so it can reach both its panes', mounted(kwame, 'chrome').length === 1 && mounted(henrik, 'chrome').length === 1);

  // ── ring 1: an action a principal lacks does not exist ──
  // Not hidden, not disabled — absent from the shell's own catalog.
  const guestHolds = new Set(catalogFor('amara'));
  const guestSees = (id: string): boolean => guestHolds.has(id);
  check('a guest holds no issue board', !guestSees('desk.issue.list'));
  check('a guest holds no deployment console', !guestSees('deploy.connectors'));

  // ── the surface each guest actually resolved ──
  const amaraSlots = slotIds(topData(amara, 'main'));
  check(`Amara's stay loaded (${amaraSlots.length} tiles)`, amaraSlots.length > 0);
  check('...with no room key — The Lumen runs Opera v1', !amaraSlots.includes('gs_key'));
  check('...and no express checkout', !amaraSlots.includes('gs_checkout'));
  check('...but she can message the desk', amaraSlots.includes('gs_message'));
  check('...and report a fault — the ticketing system is live', amaraSlots.includes('gs_report'));
  check('...but not the spa — Opera has no spa module', !amaraSlots.includes('gs_spa'));

  // Same property, same code, different stay state → a different application.
  const theo = await login('theo');
  await settle();
  const theoSlots = slotIds(topData(theo, 'main'));
  check('Theo is arriving, so he gets check-in', theoSlots.includes('gs_checkin'));
  check('Amara is in house, so she does not', !amaraSlots.includes('gs_checkin'));

  // Different property, different PMS, genuinely different application.
  const ines = await login('ines');
  await settle();
  const inesSlots = slotIds(topData(ines, 'main'));
  check('Inés gets the spa — Mews has that module', inesSlots.includes('gs_spa'));
  check('...and housekeeping requests', inesSlots.includes('gs_housekeeping'));
  check('...and never a key', !inesSlots.includes('gs_key'));
  check('...and no online check-in, because her hotel switched it off', !inesSlots.includes('gs_checkin'));
  check('...and report, from the SAME ticketing system The Lumen uses', inesSlots.includes('gs_report'));

  check('the two guests at different hotels see different surfaces', amaraSlots.join(',') !== inesSlots.join(','));

  // spa, housekeeping and report all resolve to the one generic request action.
  check('spa and report share the generic request action', actionIds(topData(ines, 'main')).filter((a) => a === 'stay.request').length >= 2);

  // ── the composed HOME: live action instances, seeded per principal ──
  // The seeds hook derives the list from the resolved surface (async — give it
  // a beat); every card mounts COLLAPSED and the guest's tap expands in place.
  await settle(10);
  const amaraHome = amara.getState().canvases['home']?.stack ?? [];
  check(`Amara's home is a list of live cards (${amaraHome.length})`, amaraHome.length >= 4);
  check('...every one collapsed to its preview', amaraHome.every((i) => amara.getRuntime(i.id)?.getData()['expanded'] === false));
  check('...all of them her own actions, none dark', amaraHome.every((i) => catalogFor('amara').includes(i.definitionId)));
  const inesHome = (ines.getState().canvases['home']?.stack ?? []).map((i) => i.definitionId);
  check("Inés's home carries the Mews cards instead", inesHome.includes('ext.guest.mews.spa') && inesHome.includes('ext.guest.mews.minibar') && !inesHome.includes('ext.guest.opera.wake'));
  check("Amara's carries Opera's", (amara.getState().canvases['home']?.stack ?? []).some((i) => i.definitionId === 'ext.guest.opera.wake'));
  // Expand in place: the tap's trigger, driven with the card's own origin.
  const wakeCard = (amara.getState().canvases['home']?.stack ?? []).find((i) => i.definitionId === 'ext.guest.opera.wake');
  if (wakeCard !== undefined) {
    amara.dispatch({ type: 'ui:click', ref: 'expand', origin: wakeCard.id } as Parameters<typeof amara.dispatch>[0]);
    await settle();
    check('a tap expands the card in place — same instance, full surface', amara.getRuntime(wakeCard.id)?.getData()['expanded'] === true);
    amara.dispatch({ type: 'ui:click', ref: 'collapse', origin: wakeCard.id } as Parameters<typeof amara.dispatch>[0]);
    await settle();
    check('...and Done collapses it back to the preview', amara.getRuntime(wakeCard.id)?.getData()['expanded'] === false);
  }
  // A composed card carries exactly the session ids it declares — never what a
  // client sent. The menu is composed for every crew member, so it is the card
  // to ask.
  check('a composed card carries the session ids it declares — never the client', cardData(rosa, 'staff.menu', 'nav')['propertyId'] === 'prop_lumen');

  report('five principals, one deployment');
};

void main();
