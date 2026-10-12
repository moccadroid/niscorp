import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export const pressSend: SeedMutation = {
  fingerprint: 'presses/press',
  intent: 'Record that this person pressed the button',
  mutation: {
    op: 'insert',
    table: 'presses',
    values: { sound: 'chime' },
  },
};

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
