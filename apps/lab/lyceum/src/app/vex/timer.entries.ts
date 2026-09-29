import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── timers: automations the speaker asked for and saved ──
//
// Each row is a tide reflex as a document — the automation IS data — beside
// when it fires. The speaker writes it (their own vex, from the assistant);
// the `scheduler` reads every one at boot and loads it into tide; the
// controller's countdown follows the newest.

// Every saved timer, for loading into tide. Read as the `scheduler` machinery
// role at boot, when there is no principal.
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

// The newest timer — the controller's countdown. Reactive: a timer saved
// anywhere reaches the controller with nobody announcing it.
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

// Save a timer, as the speaker — `saved_by` is stamped by the engine.
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

export const TIMER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [timersAll, timerNext, timerSave];
