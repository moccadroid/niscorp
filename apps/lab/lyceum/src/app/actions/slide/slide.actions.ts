import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import { departmentsAll, inquiryByDepartment, memberCounts } from '@lyceum/app/vex/member.entries';
import { queriesTally } from '@lyceum/app/vex/query.entries';
import { querySlideLayout, assignmentLayout, clearanceLayout, codeLayout, liveLayout, statementLayout, titleLayout } from './slide.layouts';

// THE SLIDES. Each is an action only the stage is granted; the deck (`slides`
// rows) decides which is on screen and in what order, and which tool the
// speaker's controller shows alongside. A slide's words are its data; its
// layout is one of a few shapes. The words are provisional — the talk's text
// is written with the story.

const read = (fingerprint: string, target: string): EndpointConfig => ({ url: '/api/vex', method: 'POST', request: { fingerprint, context: {} }, target });
const COUNTS = { joined: 0, assigned: 0, unassigned: 0 };
// Where people open the room — the deployment's, handed out by the server.
const ADDRESS = { url: '', host: '' };

export const titleSlide: ActionDefinition = {
  id: 'slide.title',
  title: 'The talk is an application',
  data: {
    kicker: 'The Ministry — tonight',
    title: 'The talk is an application',
    lines: ['Everything you will see tonight is running — not a recording, not a mock-up.', 'Take your phone out.'],
    counts: COUNTS,
    address: ADDRESS,
  },
  layout: titleLayout,
  endpoints: { counts: read(memberCounts.fingerprint, 'counts'), address: { fn: 'room.address', target: 'address' } },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'address' }] },
  triggers: [],
};

export const dataSlide: ActionDefinition = {
  id: 'slide.data',
  title: 'Everything is data',
  data: {
    kicker: 'How it is built',
    title: 'Everything is data',
    file: 'member.card.action.ts',
    code: [
      "{ id: 'member.card',",
      '  data: { me: {} },',
      '  endpoints: { load: {',
      "    request: { fingerprint: 'members/me' },",
      "    target: 'me' } },",
      "  layout: { component: 'Sheet',",
      "    areas: ['kick', 'name', 'status'],",
      '    children: [ … ] } }',
    ].join('\n'),
    marked: [4, 7],
    lines: [
      'The ID card on your phone is this object. No component knows who you are: the screen is data, and so is the query behind it.',
      'A screen is JSON · A query is JSON · A permission is JSON',
    ],
  },
  layout: codeLayout,
  triggers: [],
};

// Assignment: the four departments, each with its mark and its count so far,
// filling as the speaker assigns the room.
export const assignmentSlide: ActionDefinition = {
  id: 'slide.assignment',
  title: 'Assignment',
  data: {
    kicker: 'Look at your phone',
    title: 'Assignment',
    lines: ['Your department is a role. Being assigned is one row changing — and your phone changes with it.'],
    departments: [],
    tally: [],
    counts: COUNTS,
  },
  layout: assignmentLayout,
  endpoints: {
    departments: read(departmentsAll.fingerprint, 'departments'),
    tally: read(inquiryByDepartment.fingerprint, 'tally'),
    counts: read(memberCounts.fingerprint, 'counts'),
  },
  lifecycle: { mount: [{ call: 'departments' }, { call: 'tally' }, { call: 'counts' }] },
  triggers: [],
};

// Clearance: what each department's role is granted, in plain words — and so
// what exists on its phones.
export const clearanceSlide: ActionDefinition = {
  id: 'slide.clearance',
  title: 'If you can’t use it, it isn’t there',
  data: {
    kicker: 'Compare with your neighbour',
    title: 'If you can’t use it, it isn’t there',
    lines: ['An action your role is not granted is never sent to your phone. Not hidden, not disabled — it does not exist for you.'],
    departments: [],
  },
  layout: clearanceLayout,
  endpoints: { departments: read(departmentsAll.fingerprint, 'departments') },
  lifecycle: { mount: [{ call: 'departments' }] },
  triggers: [],
};

// Live: the room counted as it changes. Nobody tells this slide anything —
// its reads answer again whenever somebody steps in or is assigned.
export const liveSlide: ActionDefinition = {
  id: 'slide.live',
  title: 'Nobody announced anything',
  data: {
    kicker: 'Watch the numbers',
    title: 'Nobody announced anything',
    lines: ['Every screen that shows the room follows it on its own — no channel, no listener. The query knows what it reads.'],
    counts: COUNTS,
  },
  layout: liveLayout,
  endpoints: { counts: read(memberCounts.fingerprint, 'counts') },
  lifecycle: { mount: [{ call: 'counts' }] },
  triggers: [],
};

// Queries from words: everybody's, counted as they are answered — replayed
// from a stored query, written new by a model, or refused. A reactive read:
// the numbers climb while the room queries.
export const querySlide: ActionDefinition = {
  id: 'slide.query',
  title: 'Vex queries',
  data: {
    kicker: 'On your phone: your assistant',
    title: 'Intent and shape',
    lines: [
      'Your assistant hands vex an intent; vex picks the shape. A model writes a query only when no stored one fits — under your clearance, never past it. Every one like it after that is a replay.',
      'The model is a compiler that runs once, not an interpreter that runs every time.',
    ],
    tally: { replayed: 0, generated: 0, refused: 0 },
  },
  layout: querySlideLayout,
  endpoints: { tally: read(queriesTally.fingerprint, 'tally') },
  lifecycle: { mount: [{ call: 'tally' }] },
  triggers: [],
};

export const endSlide: ActionDefinition = {
  id: 'slide.end',
  title: 'It is all in the folder',
  data: {
    kicker: 'apps/lab/lyceum',
    title: 'It is all in the folder',
    points: [
      { label: 'Live', text: 'Everything you saw tonight was running, on this server, as you watched.' },
      { label: 'Data', text: 'Every screen, query and permission is a file you can read.' },
      { label: 'Yours', text: 'Open it. Change a slide. It is the same thing the room just used.' },
    ],
  },
  layout: statementLayout,
  triggers: [],
};

export const SLIDE_ACTIONS: readonly ActionDefinition[] = [titleSlide, dataSlide, assignmentSlide, clearanceSlide, liveSlide, querySlide, endSlide];
