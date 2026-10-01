import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── giving an action to people, and taking it back ──
//
// Which actions somebody has is their roles, and their roles are rows in
// `grants` (server/identity.ts). So giving everybody the X-ray is writing one
// grant row per member; taking it back is deleting them. The rows change, the
// shells of the people they name are rebuilt (server/reactions.ts), and ring 1
// does the rest: the X-ray exists on their phone, or it does not. The role is
// fixed in each statement — these entries give the X-ray and nothing else.

// How many people have the X-ray now — the controller's tool shows it.
// Reactive: it follows every give and take.
export const xrayGiven: SeedEntry = {
  fingerprint: 'grants/xray/count',
  refresh: 'reactive',
  intent: 'How many people have been given the X-ray',
  shape: { count: 0, given: false },
  dsl: {
    from: ['grants'],
    filter: { eq: ['grants.role', 'xray'] },
    aggregate: { count: { count: '*' } },
  },
  mapping: {
    $with: {
      let: { count: { $get: { from: { $ref: '$.result' }, path: ['count'], fallback: { $const: 0 } } } },
      value: { count: { $var: 'count' }, given: { $gt: [{ $var: 'count' }, 0] } },
    },
  },
};

// Give the X-ray to everybody in the list: one row each, one statement.
// Somebody who has it already keeps the row they have.
export const xrayGive: SeedMutation = {
  fingerprint: 'grants/xray/give',
  intent: 'Give the X-ray to every member in the list',
  mutation: {
    op: 'insertEach',
    table: 'grants',
    items: { $context: 'members' },
    values: { principal: { $item: 'member_id' }, role: 'xray' },
    onConflict: { target: ['principal', 'role'] },
  },
};

// Take the X-ray back from everybody in the list (their ids).
export const xrayTake: SeedMutation = {
  fingerprint: 'grants/xray/take',
  intent: 'Take the X-ray back from every member in the list',
  mutation: {
    op: 'delete',
    table: 'grants',
    where: { and: [{ eq: ['grants.role', 'xray'] }, { in: ['grants.principal', { $context: 'members' }] }] },
  },
};

// ── the button: three people, picked by chance (server/functions/button.functions.ts) ──

// How many people have the button now — the controller's tool shows it.
export const buttonGiven: SeedEntry = {
  fingerprint: 'grants/button/count',
  refresh: 'reactive',
  intent: 'How many people have been given the button',
  shape: { count: 0, given: false },
  dsl: {
    from: ['grants'],
    filter: { eq: ['grants.role', 'button'] },
    aggregate: { count: { count: '*' } },
  },
  mapping: {
    $with: {
      let: { count: { $get: { from: { $ref: '$.result' }, path: ['count'], fallback: { $const: 0 } } } },
      value: { count: { $var: 'count' }, given: { $gt: [{ $var: 'count' }, 0] } },
    },
  },
};

// Who has the button — so the next three are picked from the rest, and so
// taking it back names exactly them. Reactive: the tool's list follows.
export const buttonHolders: SeedEntry = {
  fingerprint: 'grants/button/holders',
  refresh: 'reactive',
  intent: 'Who has been given the button',
  shape: [{ principal: '' }],
  dsl: {
    from: ['grants'],
    fields: ['grants.principal'],
    filter: { eq: ['grants.role', 'button'] },
    sort: [{ field: 'grants.principal', dir: 'asc' }],
    limit: 100,
  },
};

// Give the button to the people in the list: one row each.
export const buttonGive: SeedMutation = {
  fingerprint: 'grants/button/give',
  intent: 'Give the button to every member in the list',
  mutation: {
    op: 'insertEach',
    table: 'grants',
    items: { $context: 'members' },
    values: { principal: { $item: 'member_id' }, role: 'button' },
    onConflict: { target: ['principal', 'role'] },
  },
};

// Take the button back from everybody in the list (their ids).
export const buttonTake: SeedMutation = {
  fingerprint: 'grants/button/take',
  intent: 'Take the button back from every member in the list',
  mutation: {
    op: 'delete',
    table: 'grants',
    where: { and: [{ eq: ['grants.role', 'button'] }, { in: ['grants.principal', { $context: 'members' }] }] },
  },
};

export const GRANT_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [xrayGiven, xrayGive, xrayTake, buttonGiven, buttonHolders, buttonGive, buttonTake];
