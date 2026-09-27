import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── the room: which look every screen paints with ──

// Reactive: every screen follows the room row without being told. It answers
// with the look's name and, for the controller's switch, which one it is — so a
// layout marks the one in use without comparing anything itself. A single-row
// shape: the mapping's `result` is the row itself, not a list of them.
export const roomLook: SeedEntry = {
  fingerprint: 'room/look',
  refresh: 'reactive',
  intent: 'The look every screen paints with, poster or plain',
  shape: { look: '', poster: false, plain: false },
  dsl: {
    from: ['room'],
    fields: ['room.look'],
    filter: { eq: ['room.room_id', 'talk'] },
  },
  mapping: {
    $with: {
      let: { look: { $get: { from: { $ref: '$.result' }, path: ['look'], fallback: { $const: 'poster' } } } },
      value: {
        look: { $var: 'look' },
        poster: { $eq: [{ $var: 'look' }, 'poster'] },
        plain: { $eq: [{ $var: 'look' }, 'plain'] },
      },
    },
  },
};

// Change the look. The table holds the closed set: any other word is refused.
export const roomLookSet: SeedMutation = {
  fingerprint: 'room/look/set',
  intent: 'Change the look every screen paints with',
  mutation: {
    op: 'update',
    table: 'room',
    set: { look: { $context: 'look' } },
    where: { eq: ['room.room_id', { $context: 'room' }] },
  },
};

export const ROOM_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [roomLook, roomLookSet];
