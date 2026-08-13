import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { classesLayout, deskLayout, overviewLayout } from './home.layouts';
import { checkInsPrism, memberCountPrism, revenuePrism, sessionsTodayPrism } from './today.prism';

const greeting = { studioName: '', personName: '', greeting: '', identity: {} };
const day = { loading: true, sessionsToday: [] };

const sessions = { url: '/api/schedule/vex', method: 'POST' as const, request: sessionsTodayPrism, target: 'sessionsToday' };
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
export const homeClassesAction: ActionDefinition = {
  id: 'home.classes',
  title: 'Today',
  data: { ...greeting, ...day },
  layout: classesLayout,
  endpoints: { identity, sessions },
  lifecycle: { mount: [loadIdentity, { call: 'sessions', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [{ message: 'sessions-changed', do: [{ call: 'sessions' }] }],
};

export const homeInputSchema = z.toJSONSchema(
  z.object({
    studioName: z.string().optional().describe('The studio being viewed; seeded from the session, never client-authored.'),
  }),
);
