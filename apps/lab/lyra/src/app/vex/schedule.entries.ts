import type { CacheEntry } from './index';
import { dayText, fillText, fillTone, sessionStateText } from '@lyra/app/prisms/format.prism';

const row = (name: string) => ({ $get: { from: { $var: 's' }, path: [name] } });

// Every session today, in the order they happen. `today` arrives as injected
// context, never a wall-clock read inside the query.
export const sessionsToday: CacheEntry = {
  fingerprint: 'schedule/today',
  intent: "Today's classes at this studio, in start order",
  shape: [{ session_id: '', name: '', program_name: '', program_tone: '', time_display: '', booked_display: '', fill_tone: '', capacity: 0, cancelled: false }],
  dsl: {
    from: ['class_sessions', 'programs'],
    fields: [
      { field: 'class_sessions.id', as: 'session_id' },
      'class_sessions.name',
      'class_sessions.starts_at',
      'class_sessions.capacity',
      'class_sessions.booked_count',
      'class_sessions.status',
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'program_tone' },
    ],
    filter: { eq: ['class_sessions.held_on', { $scope: 'today' }] },
    sort: [{ field: 'class_sessions.starts_at', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 's',
      body: {
        session_id: row('session_id'),
        name: row('name'),
        program_name: row('program_name'),
        program_tone: row('program_tone'),
        time_display: sessionStateText(row('status'), row('starts_at')),
        booked_display: fillText(row('booked_count'), row('capacity')),
        fill_tone: fillTone(row('booked_count'), row('capacity')),
        capacity: row('capacity'),
        cancelled: { $eq: [row('status'), 'cancelled'] },
      },
    },
  },
};

// The week ahead, for the timetable screen. Same shape as today plus the day,
// so one column spec serves both lists.
export const sessionsUpcoming: CacheEntry = {
  fingerprint: 'schedule/upcoming',
  intent: 'Classes at this studio from today forward, in date and start order',
  shape: [{ session_id: '', name: '', program_name: '', program_tone: '', held_on: '', starts_at: '', day_display: '', time_display: '', booked_display: '', fill_tone: '', cancelled: false }],
  dsl: {
    from: ['class_sessions', 'programs'],
    fields: [
      { field: 'class_sessions.id', as: 'session_id' },
      'class_sessions.name',
      'class_sessions.held_on',
      'class_sessions.starts_at',
      'class_sessions.capacity',
      'class_sessions.booked_count',
      'class_sessions.status',
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'program_tone' },
    ],
    filter: { and: [{ gte: ['class_sessions.held_on', { $scope: 'today' }] }, { lte: ['class_sessions.held_on', { $scope: 'horizon' }] }] },
    sort: [
      { field: 'class_sessions.held_on', dir: 'asc' },
      { field: 'class_sessions.starts_at', dir: 'asc' },
    ],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 's',
      body: {
        session_id: row('session_id'),
        name: row('name'),
        program_name: row('program_name'),
        program_tone: row('program_tone'),
        // The RAW date as well as the pretty one: a list reads the label, a
        // calendar has to group by the day itself.
        held_on: row('held_on'),
        starts_at: row('starts_at'),
        day_display: dayText(row('held_on')),
        time_display: sessionStateText(row('status'), row('starts_at')),
        booked_display: fillText(row('booked_count'), row('capacity')),
        fill_tone: fillTone(row('booked_count'), row('capacity')),
        cancelled: { $eq: [row('status'), 'cancelled'] },
      },
    },
  },
};

// The studio's streams, for filters and for the timetable's legend.
export const programsList: CacheEntry = {
  fingerprint: 'schedule/programs',
  intent: 'The active programs at this studio',
  shape: [{ program_id: '', name: '', blurb: '', tone: '' }],
  dsl: {
    from: ['programs'],
    fields: [{ field: 'programs.id', as: 'program_id' }, 'programs.name', 'programs.blurb', { field: 'programs.colour', as: 'tone' }],
    filter: { eq: ['programs.active', true] },
    sort: [{ field: 'programs.name', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'p',
      body: {
        program_id: { $get: { from: { $var: 'p' }, path: ['program_id'] } },
        name: { $get: { from: { $var: 'p' }, path: ['name'] } },
        blurb: { $get: { from: { $var: 'p' }, path: ['blurb'] } },
        tone: { $get: { from: { $var: 'p' }, path: ['tone'] } },
        value: { $get: { from: { $var: 'p' }, path: ['program_id'] } },
        label: { $get: { from: { $var: 'p' }, path: ['name'] } },
      },
    },
  },
};
