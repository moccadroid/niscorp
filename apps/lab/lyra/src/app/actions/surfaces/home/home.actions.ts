import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { classesLayout, deskLayout, overviewLayout } from './home.layouts';
import { checkInsPrism, memberCountPrism, revenuePrism, sessionsTodayPrism } from './today.prism';

// Three landing surfaces, one per audience. Which one a principal gets is ring
// 1: the `main` canvas carries all three as a CANDIDATE list and the first id
// they actually hold mounts. Nothing branches, and nothing is hidden.
//
// The important property is that an action a principal lacks does not merely
// render differently — it never mounts, so its endpoints never fire. An
// instructor's shell makes no revenue request, and the engine would refuse one
// anyway (the charter grants them no `subscriptions.read`). Two independent
// reasons, which is the posture money deserves.

const greeting = { studioName: '', personName: '', greeting: '', identity: {} };
const day = { loading: true, sessionsToday: [] };

// Every read this surface makes fires on mount, independently: the member count
// does not depend on the timetable, and chaining them would let the slowest
// decide when any of it appears.
const sessions = { url: '/api/schedule/vex', method: 'POST' as const, request: sessionsTodayPrism, target: 'sessionsToday' };
// WHO YOU ARE, ON EVERY MOUNT.
//
// This used to arrive as boot `inputs`, which seed the action mounted at boot
// and nothing after it — so the landing screen was headless the moment you
// navigated away and came back, and the durable shell kept it that way through
// a reload. A read on mount cannot go stale that way.
const identity = { fn: 'nav.identity', target: 'identity' } as const;
const loadIdentity = {
  call: 'identity',
  onSuccess: [
    { set: 'greeting', value: '$.identity.greeting' },
    { set: 'studioName', value: '$.identity.studioName' },
    { set: 'personName', value: '$.identity.personName' },
  ],
};

const listen = [
  { message: 'sessions-changed', do: [{ call: 'sessions' }] },
  { message: 'check-ins-changed', do: [{ call: 'checkIns', onSuccess: [{ set: 'checkedInToday', value: '$.checkInsRow.total' }] }] },
  { message: 'members-changed', do: [{ call: 'members', onSuccess: [{ set: 'memberCount', value: '$.memberCountRow.total' }] }] },
];

// ── manager and owner ────────────────────────────────────────
export const homeOverviewAction: ActionDefinition = {
  id: 'home.overview',
  title: 'Today',
  data: { ...greeting, ...day, memberCount: 0, checkedInToday: 0, revenue: '', memberCountRow: {}, checkInsRow: {}, revenueRow: {} },
  layout: overviewLayout,
  endpoints: {
    identity,
    sessions,
    members: { url: '/api/studio/vex', method: 'POST', request: memberCountPrism, target: 'memberCountRow' },
    checkIns: { url: '/api/studio/vex', method: 'POST', request: checkInsPrism, target: 'checkInsRow' },
    revenue: { url: '/api/studio/vex', method: 'POST', request: revenuePrism, target: 'revenueRow' },
  },
  lifecycle: {
    mount: [
      loadIdentity,
      { call: 'members', onSuccess: [{ set: 'memberCount', value: '$.memberCountRow.total' }] },
      { call: 'checkIns', onSuccess: [{ set: 'checkedInToday', value: '$.checkInsRow.total' }] },
      { call: 'revenue', onSuccess: [{ set: 'revenue', value: '$.revenueRow.monthly_display' }] },
      { call: 'sessions', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: listen,
};

// ── the front desk ───────────────────────────────────────────
export const homeDeskAction: ActionDefinition = {
  id: 'home.desk',
  title: 'Today',
  data: { ...greeting, ...day, memberCount: 0, checkedInToday: 0, memberCountRow: {}, checkInsRow: {} },
  layout: deskLayout,
  endpoints: {
    identity,
    sessions,
    members: { url: '/api/studio/vex', method: 'POST', request: memberCountPrism, target: 'memberCountRow' },
    checkIns: { url: '/api/studio/vex', method: 'POST', request: checkInsPrism, target: 'checkInsRow' },
  },
  lifecycle: {
    mount: [
      loadIdentity,
      { call: 'members', onSuccess: [{ set: 'memberCount', value: '$.memberCountRow.total' }] },
      { call: 'checkIns', onSuccess: [{ set: 'checkedInToday', value: '$.checkInsRow.total' }] },
      { call: 'sessions', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: listen.filter((t) => t.message !== 'members-changed').concat([{ message: 'members-changed', do: [{ call: 'members', onSuccess: [{ set: 'memberCount', value: '$.memberCountRow.total' }] }] }]),
};

// ── instructors and members ──────────────────────────────────
// The day, and nothing else. No endpoint here touches a membership, a
// subscription or a plan — so there is no figure to leak and no read to refuse.
export const homeClassesAction: ActionDefinition = {
  id: 'home.classes',
  title: 'Today',
  data: { ...greeting, ...day },
  layout: classesLayout,
  endpoints: { identity, sessions },
  lifecycle: { mount: [loadIdentity, { call: 'sessions', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [{ message: 'sessions-changed', do: [{ call: 'sessions' }] }],
};

// Rule 14: what an opener may seed. Nothing seeds these — they are landing
// surfaces — but the contract is authored from the start, because a catalog, a
// URL and an agent all read it.
export const homeInputSchema = z.toJSONSchema(
  z.object({
    studioName: z.string().optional().describe('The studio being viewed; seeded from the session, never client-authored.'),
  }),
);
