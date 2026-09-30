import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── identity: read as the `identity` role, pinned to the principal by the
//    engine-side `userId` scope value — never by a request ──

export const identityMember: SeedEntry = {
  fingerprint: 'identity/member',
  intent: 'The member row of the principal being resolved, if they have joined',
  shape: { member_id: '' },
  dsl: {
    from: ['members'],
    fields: ['members.member_id'],
    filter: { eq: ['members.member_id', { $scope: 'userId' }] },
  },
};

export const identityGrants: SeedEntry = {
  fingerprint: 'identity/grants',
  intent: 'The roles granted to the principal being resolved',
  shape: [{ role: '' }],
  dsl: {
    from: ['grants'],
    fields: ['grants.role'],
    filter: { eq: ['grants.principal', { $scope: 'userId' }] },
  },
};

// ── the room ──
//
// REACTIVE: the room's reads answer again whenever a write lands on a table
// they read — somebody joins, or their card is written — on every
// screen that has them open. Nothing announces the change and nothing listens
// for it: vex knows what each query reads, and every write passes through vex.

export const memberMe: SeedEntry = {
  fingerprint: 'members/me',
  refresh: 'reactive',
  intent: 'The signed-in member: their ID card',
  shape: { member_id: '', name: '', title: '', quirk: '' },
  dsl: {
    from: ['members'],
    fields: ['members.member_id', 'members.name', 'members.title', 'members.quirk'],
    filter: { eq: ['members.member_id', { $scope: 'userId' }] },
  },
};

export const memberRegister: SeedEntry = {
  fingerprint: 'members/register',
  refresh: 'reactive',
  intent: 'Everybody who joined, in the order they arrived, with their title',
  shape: [{ member_id: '', name: '', title: '' }],
  dsl: {
    from: ['members'],
    fields: ['members.member_id', 'members.name', 'members.title'],
    sort: [{ field: 'members.joined_at', dir: 'asc' }, { field: 'members.member_id', dir: 'asc' }],
    limit: 500,
  },
};

export const memberCounts: SeedEntry = {
  fingerprint: 'members/counts',
  refresh: 'reactive',
  intent: 'How many people have joined',
  shape: { joined: 0 },
  dsl: {
    from: ['members'],
    aggregate: { joined: { count: '*' } },
  },
};

export const memberJoin: SeedMutation = {
  fingerprint: 'members/join',
  intent: 'Step into the room as yourself',
  mutation: {
    op: 'insert',
    table: 'members',
    values: { name: { $context: 'name' } },
  },
};

// ── the ID card, issued by the Ministry's registry as the model writes it ──
export const memberIssue: SeedMutation = {
  fingerprint: 'members/issue',
  intent: 'Write a member\'s ID card: their name, job title and one line on file',
  mutation: {
    op: 'update',
    table: 'members',
    set: { name: { $context: 'name' }, title: { $context: 'title' }, quirk: { $context: 'quirk' } },
    where: { eq: ['members.member_id', { $context: 'memberId' }] },
  },
};

// ── Forms: change your own record ──
//
// Served at the `personal` reach (behaviors.ts): the engine pins the update to
// the caller's own row, whatever `memberId` a request names.
export const MEMBER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  identityMember,
  identityGrants,
  memberMe,
  memberRegister,
  memberCounts,
  memberJoin,
  memberIssue,
];
