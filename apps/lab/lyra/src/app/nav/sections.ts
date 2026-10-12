export type NavItem = { action: string; label: string; blurb: string; icon?: string };
export type NavArea = { id: string; label: string; blurb: string; items: NavItem[]; icon?: string };

export const AREAS: NavArea[] = [
  {
    id: 'hub.desk',
    icon: 'checkin',
    label: 'Check in',
    blurb: 'The register, and what to do about whom.',
    items: [
      { icon: 'checkin', action: 'desk.checkin', label: 'Check in', blurb: 'Who has arrived, and who was expected.' },
      { icon: 'inbox', action: 'desk.followups', label: 'Notices', blurb: 'What an installed add-on has told the studio.' },
    ],
  },
  {
    id: 'hub.people',
    icon: 'people',
    label: 'People',
    blurb: 'Everyone the studio deals with, filtered by relationship.',
    items: [
      { icon: 'people', action: 'people.list', label: 'People', blurb: 'Everyone — members, prospects, pass holders, contacts — one list, filtered by relationship.' },
      { icon: 'person', action: 'staff.list', label: 'Staff', blurb: 'Who works here and what they can do. Changing a role changes their whole application.' },
    ],
  },
  {
    id: 'hub.schedule',
    icon: 'schedule',
    label: 'Schedule',
    blurb: 'When things happen, and what is on offer.',
    items: [
      { icon: 'schedule', action: 'schedule.timetable', label: 'Timetable', blurb: 'Every dated class, for the next fortnight — generated from everything that runs.' },
      { icon: 'course', action: 'timetable.list', label: 'Classes', blurb: 'Everything that runs — weekly classes and bounded courses, in one list.' },
      { icon: 'program', action: 'programs.list', label: 'Class types', blurb: 'What a class IS — Vinyasa, Fundamentals, Competition. No times; everything above refers to one.' },
    ],
  },
  {
    id: 'hub.selling',
    icon: 'plan',
    label: 'Selling',
    blurb: 'Everything a member can pay for.',
    items: [
      { icon: 'plan', action: 'plans.list', label: 'Offers', blurb: 'Memberships, class passes, drop-ins and one-offs. Retiring one keeps everybody already on it.' },
    ],
  },
  {
    id: 'hub.money',
    icon: 'money',
    label: 'Money',
    blurb: 'What has come in, and what is on its way.',
    items: [
      { icon: 'reports', action: 'reports.overview', label: 'Reports', blurb: 'Attendance, the roll by status, and which plans people are actually on.' },
      { icon: 'star', action: 'reports.retention', label: 'Retention', blurb: 'Who has stopped coming, who has given notice, and what both are worth a month.' },
    ],
  },
  {
    id: 'hub.marketing',
    icon: 'mail',
    label: 'Marketing',
    blurb: 'What you say to your people, and who hears it.',
    items: [
      { icon: 'mail', action: 'campaigns.list', label: 'Campaigns', blurb: 'Pick who it goes to, type three sentences, send. Nothing to import first.' },
    ],
  },
  {
    id: 'hub.settings',
    icon: 'settings',
    label: 'Studio',
    blurb: 'Who this studio is, and how it is set up.',
    items: [
      { icon: 'building', action: 'studio.business', label: 'Business', blurb: 'Who this studio is on paper — the name, the address and the number a payment provider asks for.' },
      { icon: 'palette', action: 'studio.settings', label: 'Appearance', blurb: 'The look and the language every member and every member of staff sees.' },
      { icon: 'mail', action: 'studio.mail', label: 'Mail', blurb: 'Your studio’s name on what goes out, and where an answer comes back to.' },
      { icon: 'automation', action: 'automations.list', label: 'Automations', blurb: 'What happens overnight, and what it has done lately.' },
      { icon: 'addons', action: 'studio.addons', label: 'Add-ons', blurb: 'What this studio can turn on — payments, and anything else on offer.' },
    ],
  },
  {
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

export const areasFor = (granted: readonly string[]): NavArea[] =>
  AREAS.map((area) => ({ ...area, items: area.items.filter((item) => granted.includes(item.action)) })).filter((area) =>
    area.items.length > 0 ? true : granted.includes(area.id),
  );

export const areaById = (id: string): NavArea | undefined => AREAS.find((area) => area.id === id);

export const landingFor = (area: NavArea): string => area.items[0]?.action ?? area.id;

export const contextFor = (action: string, granted: readonly string[]): { areaId: string; areaLabel: string; tabs: NavItem[] } => {
  const area = areasFor(granted).find((a) => a.id === action || a.items.some((item) => item.action === action));
  if (area === undefined) return { areaId: '', areaLabel: '', tabs: [] };
  return { areaId: area.id, areaLabel: area.label, tabs: area.items.length > 1 ? area.items : [] };
};
