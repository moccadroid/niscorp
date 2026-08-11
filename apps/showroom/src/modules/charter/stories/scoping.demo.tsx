import { CharterLab } from '@showroom/modules/charter/charter-lab';

// REACH, as distinct from WHICH.
//
// Every role below holds `bookings.read` — the same string, in the same
// universe. What differs is how far it reaches, and that is `scoping`: an
// opaque name the governed target resolves (vex looks it up in its behaviors
// and ANDs the extra filter on). The charter never learns what 'personal'
// means; it only knows which role said it.
//
// The thing to click: toggle `member`, then toggle `desk`. Both hold the same
// data grants, and the reach panel goes empty for the desk — `scoping` is the
// ONE thing `extends` does not compose. A desk holds every screen a member
// holds; it must not hold a member's "only my own rows", or the roster it
// exists to read would filter to whoever is operating it.
//
// Why this exists: without it, "the desk reads every booking, a member reads
// their own" is unsayable, and the only way to say it is a SECOND TABLE with a
// tighter rule attached — one fact in two places, kept level by a trigger.
const charter = {
  member: {
    actions: ['me.*'],
    data: ['bookings.read', 'class_sessions.read'],
    scoping: 'personal',
  },
  desk: {
    extends: ['member'],
    actions: ['desk.*'],
    data: ['memberships.read'],
  },
  owner: { extends: ['desk'], actions: ['reports.*'], data: ['plans.read'] },
};

const actions = ['me.bookings', 'me.classes', 'desk.checkin', 'desk.roster', 'reports.revenue'];
const data = ['bookings.read', 'class_sessions.read', 'memberships.read', 'plans.read'];

export const Demo = () => <CharterLab charter={charter} actions={actions} data={data} initialRoles={['member']} />;
