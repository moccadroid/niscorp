import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── the button: pressing it, and who pressed ──
//
// A press is a row written as the person who pressed — `member_id` is stamped
// (behaviors.ts) — and only somebody with the `button` role may write one
// (charter.ts): the three the speaker gave it to. So a press replayed by
// anybody else is refused by the engine, not by a screen.

export const pressSend: SeedMutation = {
  fingerprint: 'presses/press',
  intent: 'Record that this person pressed the button',
  mutation: {
    op: 'insert',
    table: 'presses',
    values: { sound: 'chime' },
  },
};

// Who pressed, newest first — the stage's. Reactive: a press is on the
// projector on its own.
export const pressesRecent: SeedEntry = {
  fingerprint: 'presses/recent',
  refresh: 'reactive',
  intent: 'Who pressed the button, newest first',
  shape: [{ press_id: '', name: '' }],
  dsl: {
    from: ['presses', 'members'],
    fields: ['presses.press_id', 'members.name'],
    sort: [{ field: 'presses.pressed_at', dir: 'desc' }, { field: 'presses.press_id', dir: 'desc' }],
    limit: 8,
  },
};

export const PRESS_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [pressSend, pressesRecent];
