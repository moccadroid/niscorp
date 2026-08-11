// THE INFORMATION ARCHITECTURE — one table, read by the menu and by the hubs.
//
// The problem this solves is growth. Every feature so far arrived as another
// entry in a flat list: twelve of them, under headings that labelled the list
// without shortening it. At fifty features that menu is fifty long, and no
// amount of grouping-by-heading fixes a list you have to scroll.
//
// So the shape is a TREE, two levels deep and no deeper:
//
//   AREAS are what the menu holds. There are six, they are stable, and they do
//   not grow when features do. Each one answers a question somebody actually
//   has — "who are these people", "when does stuff happen", "what does it earn",
//   "how is this thing configured".
//
//   A HUB is an area's own page: a list of its screens, each with a sentence
//   saying what it is for. It is an ordinary action with links on it, which is
//   the whole trick — depth costs one action, not a new navigation mechanism.
//
// The test for whether a new feature needs a menu entry is now: does it answer
// a question none of these answer? Almost nothing will. Invoices go in Money,
// waivers go in People, an installed pack's screens go in whichever hub its
// bundle placed them — and the menu is exactly as long tomorrow as it is
// today. (Add-ons earned an entry because "what can this studio turn on" is a
// question none of the others ask: it is the store, never a destination for a
// pack's own screens.)
//
// WHY THESE SIX, and the two judgement calls in them:
//
//   MEMBERS AND STAFF ARE BOTH PEOPLE. They were in different halves of the
//   old menu — one under "Run the day", one under "Set up" — because they are
//   administered differently. But somebody looking for a human looks in one
//   place, and an instructor who also trains is one row in each. People is the
//   area; how you administer them is a screen inside it.
//
//   APPEARANCE IS A SETTING. It sat beside Reports and Pricing under "Studio",
//   which is a junk drawer wearing a name. What a studio LOOKS like and what it
//   EARNS have nothing to do with each other; the first is configuration you
//   touch twice a year, the second is something you read weekly.
// `icon` is a NAME from the kit vocabulary (ui/lib/icons.ts), never a path —
// the same rule colours follow. A menu of eight words was most of why every
// screen read as a wall of grey text.
export type NavItem = { action: string; label: string; blurb: string; icon?: string };
export type NavArea = { id: string; label: string; blurb: string; items: NavItem[]; icon?: string };

// `home` is not an area. It is where you land, it belongs to no category, and
// its action differs per rung — so the menu takes it from `homeId` and it never
// appears in this table.
export const AREAS: NavArea[] = [
  {
    // Not a hub: the desk's whole day is this one screen, so an extra tap to
    // reach it would be an extra tap two hundred times.
    id: 'desk.checkin',
    icon: 'checkin',
    label: 'Check in',
    blurb: 'Who has arrived.',
    items: [],
  },
  {
    id: 'hub.people',
    icon: 'people',
    label: 'People',
    blurb: 'Members, staff, and everybody in between.',
    items: [
      { icon: 'people', action: 'people.list', label: 'Members', blurb: 'The roll — who trains here, and what they are paying for.' },
      { icon: 'inbox', action: 'leads.list', label: 'Enquiries', blurb: 'People who have asked and not joined. Where they came from, and what happened next.' },
      { icon: 'person', action: 'staff.list', label: 'Staff', blurb: 'Who works here and what they can do. Changing a role changes their whole application.' },
    ],
  },
  {
    id: 'hub.schedule',
    icon: 'schedule',
    label: 'Schedule',
    blurb: 'When things happen, and what is on offer.',
    // THREE, NOT FOUR — and the cut is the point.
    //
    // "Weekly plan" and "Courses" were separate entries over the SAME table
    // with different filters, which is what produced the fair question "what
    // are courses and programs?". Rewriting the blurbs on four links did not
    // answer it, because there was nothing to explain: they were never two
    // things. One list, with a column saying whether a row repeats forever or
    // runs between two dates.
    //
    // What is left is one idea in layers: a KIND of class, everything that
    // RUNS, and the dated CLASSES all of it produces.
    items: [
      // A BLURB MAY NOT COUNT ITS SIBLINGS. The items on a hub are filtered by
      // what the reader holds, so "what the two below produce" was true for a
      // manager and a lie to an instructor, who holds this one and neither of
      // the others. Each line says what its own screen is.
      { icon: 'schedule', action: 'schedule.timetable', label: 'Timetable', blurb: 'Every dated class, for the next fortnight — generated from everything that runs.' },
      { icon: 'course', action: 'timetable.list', label: 'Classes', blurb: 'Everything that runs — weekly classes and bounded courses, in one list.' },
      { icon: 'program', action: 'programs.list', label: 'Class types', blurb: 'What a class IS — Vinyasa, Fundamentals, Competition. No times; everything above refers to one.' },
    ],
  },
  {
    id: 'hub.money',
    icon: 'money',
    label: 'Money',
    blurb: 'What the studio charges, and what it earns.',
    items: [
      { icon: 'plan', action: 'plans.list', label: 'Pricing', blurb: 'The plans on sale. Retiring one keeps everybody already paying for it.' },
      { icon: 'reports', action: 'reports.overview', label: 'Reports', blurb: 'Attendance, the roll by status, and which plans people are actually on.' },
      { icon: 'star', action: 'reports.retention', label: 'Retention', blurb: 'Who has stopped coming, who has given notice, and what both are worth a month.' },
    ],
  },
  {
    id: 'hub.settings',
    icon: 'settings',
    label: 'Settings',
    blurb: 'How this studio is set up.',
    items: [
      { icon: 'building', action: 'studio.settings', label: 'Appearance', blurb: 'The look every member and every member of staff sees.' },
      { icon: 'automation', action: 'automations.list', label: 'Automations', blurb: 'What happens overnight, and what it has done lately.' },
    ],
  },
  {
    // THE STORE, and only the store. Like Check in, a leaf: the id IS the
    // action. What an installed pack DOES never appears here — its screens are
    // placed where their domain lives (a roster under People, a panel on the
    // member detail) by the placement declarations in its bundle. Add-ons is
    // where an owner browses, installs, removes, and opens a pack's settings.
    id: 'studio.addons',
    icon: 'addons',
    label: 'Add-ons',
    blurb: 'What this studio can turn on.',
    items: [],
  },
  {
    // The member's own. An area rather than two menu entries, for the same
    // reason as the rest — it is one question ("what about me") with two
    // answers, and it is where a payment history and a waiver will go.
    id: 'hub.me',
    icon: 'person',
    label: 'Booking',
    blurb: 'Your classes and your membership.',
    items: [
      { icon: 'schedule', action: 'me.classes', label: 'Book a class', blurb: 'Everything on the timetable, and the courses you can join.' },
      { icon: 'checkin', action: 'me.bookings', label: 'My classes', blurb: 'What you are booked into, and what you are waiting for.' },
      { icon: 'plan', action: 'me.membership', label: 'My membership', blurb: 'What you are on, and since when.' },
    ],
  },
];

// An area is offered when the principal holds it — its own action for a leaf,
// or at least one of its items for a hub. Ring 1 does every bit of the
// filtering, so nothing here asks what role anybody is.
//
// WHERE INTEGRATION SCREENS WENT. There used to be a computed "Add-ons" menu
// group holding every `ext.*` action — a ghetto that answered "where do I put
// screens that arrived over a wire" with "somewhere else". The answer now is
// PLACEMENT: a pack's bundle declares which hub each screen lists under
// (validated at intake against `menuSlots`), and `nav.hub` folds the placed
// screens into their hub beside lyra's own. The menu never grows an entry;
// the domain the screen belongs to gains a row.

// AN AREA IS OFFERED WHEN IT LEADS SOMEWHERE.
//
// This used to require `granted.includes(area.id)` — the HUB action — which was
// the same trick twice: a hub was both the menu entry and a screen. There are
// no hub screens now, so an area with children is offered when the principal
// holds at least one of them, and a leaf area is offered when its own action is
// granted. Ring 1 still does all the filtering; nothing here asks what role
// anybody is.
export const areasFor = (granted: readonly string[]): NavArea[] =>
  AREAS.map((area) => ({ ...area, items: area.items.filter((item) => granted.includes(item.action)) })).filter((area) =>
    area.items.length > 0 ? true : granted.includes(area.id),
  );

export const areaById = (id: string): NavArea | undefined => AREAS.find((area) => area.id === id);

// WHERE AN AREA TAKES YOU. Its first granted screen, or itself when it is a
// leaf. There is no landing page between the menu and the work: tapping People
// opens the roll, and the roll's siblings are tabs above it.
export const landingFor = (area: NavArea): string => area.items[0]?.action ?? area.id;

// WHICH AREA A SCREEN BELONGS TO, and what its siblings are — derived from the
// one table, so the chrome never has to be told where it is.
//
// A message carries no payload in this grammar, so a screen cannot announce
// itself to the chrome; and `inputs` seeds only the action mounted at boot, so
// it cannot answer on navigation either. A `fn:` can, on every move, from the
// same taxonomy the menu is built from — which is why this is a derivation and
// not a second copy of the tree.
export const contextFor = (action: string, granted: readonly string[]): { areaId: string; areaLabel: string; tabs: NavItem[] } => {
  const area = areasFor(granted).find((a) => a.id === action || a.items.some((item) => item.action === action));
  if (area === undefined) return { areaId: '', areaLabel: '', tabs: [] };
  // A single tab is a label pretending to be a control — an area with one
  // screen shows none, and the screen's own Hero says where you are.
  return { areaId: area.id, areaLabel: area.label, tabs: area.items.length > 1 ? area.items : [] };
};
