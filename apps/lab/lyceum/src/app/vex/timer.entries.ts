import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export const timersAll: SeedEntry = {
  fingerprint: 'timers/all',
  intent: 'Every saved timer, with its reflex document and who saved it, oldest first',
  shape: [{ timer_id: '', reflex: {}, intent: '', saved_by: '' }],
  dsl: {
    from: ['timers'],
    fields: ['timers.timer_id', 'timers.reflex', 'timers.intent', 'timers.saved_by'],
    sort: [{ field: 'timers.saved_at', dir: 'asc' }, { field: 'timers.timer_id', dir: 'asc' }],
    limit: 200,
  },
};

export const timerNext: SeedEntry = {
  fingerprint: 'timers/next',
  refresh: 'reactive',
  intent: 'The newest saved timer: what it does and when it fires',
  shape: { timer_id: '', intent: '', due_at: '' },
  dsl: {
    from: ['timers'],
    fields: ['timers.timer_id', 'timers.intent', 'timers.due_at'],
    sort: [{ field: 'timers.saved_at', dir: 'desc' }, { field: 'timers.timer_id', dir: 'desc' }],
    limit: 1,
  },
};

export const timerDocument: SeedEntry = {
  fingerprint: 'timers/document',
  intent: 'The newest saved timer as it is stored: its reflex document, and when it fires',
  shape: { timer_id: '', reflex: {}, due_at: '' },
  dsl: {
    from: ['timers'],
    fields: ['timers.timer_id', 'timers.reflex', 'timers.due_at'],
    sort: [{ field: 'timers.saved_at', dir: 'desc' }, { field: 'timers.timer_id', dir: 'desc' }],
    limit: 1,
  },
};

export const timersSaved: SeedEntry = {
  fingerprint: 'timers/saved',
  refresh: 'reactive',
  intent: 'Every saved timer: what it does and when it fires, newest first',
  shape: [{ timer_id: '', intent: '', due_at: '' }],
  dsl: {
    from: ['timers'],
    fields: ['timers.timer_id', 'timers.intent', 'timers.due_at'],
    sort: [{ field: 'timers.saved_at', dir: 'desc' }, { field: 'timers.timer_id', dir: 'desc' }],
    limit: 50,
  },
};

export const timerDelete: SeedMutation = {
  fingerprint: 'timers/delete',
  intent: 'Delete one saved timer',
  mutation: {
    op: 'delete',
    table: 'timers',
    where: { eq: ['timers.timer_id', { $context: 'timerId' }] },
  },
};

export const timerSave: SeedMutation = {
  fingerprint: 'timers/save',
  intent: 'Save a timer: its reflex document, what it does, and when it fires',
  mutation: {
    op: 'insert',
    table: 'timers',
    values: {
      timer_id: { $context: 'timerId' },
      reflex: { $context: 'reflex' },
      intent: { $context: 'intent' },
      due_at: { $context: 'dueAt' },
    },
  },
};

export const TIMER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [timersAll, timerNext, timerDocument, timersSaved, timerSave, timerDelete];
