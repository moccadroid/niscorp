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

// What everybody was given (vex/grant.entries.ts): the roles on the one
// `everybody` row. Read for a member whenever their identity is resolved — so
// somebody who joins after the X-ray was given has it too.
export const identityEverybody: SeedEntry = {
  fingerprint: 'identity/everybody',
  intent: 'The roles given to everybody in the audience',
  shape: [{ role: '' }],
  dsl: {
    from: ['grants'],
    fields: ['grants.role'],
    filter: { eq: ['grants.principal', 'everybody'] },
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
  intent: 'The signed-in member: the name they chose',
  shape: { member_id: '', name: '' },
  dsl: {
    from: ['members'],
    fields: ['members.member_id', 'members.name'],
    filter: { eq: ['members.member_id', { $scope: 'userId' }] },
  },
};

export const memberRegister: SeedEntry = {
  fingerprint: 'members/register',
  refresh: 'reactive',
  intent: 'Everybody who joined, in the order they arrived, by name',
  shape: [{ member_id: '', name: '' }],
  dsl: {
    from: ['members'],
    fields: ['members.member_id', 'members.name'],
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
  intent: 'Join as a member, under the name you chose',
  mutation: {
    op: 'insert',
    table: 'members',
    values: { name: { $context: 'name' } },
  },
};

// ── a typed name the moderator refused, kept for reference (server/moderation.ts) ──
export const nameRefuse: SeedMutation = {
  fingerprint: 'names/refuse',
  intent: 'Keep a name somebody typed that was not fit to show, with how sure the moderator was',
  mutation: {
    op: 'insert',
    table: 'refused_names',
    values: { text: { $context: 'text' }, score: { $context: 'score' } },
  },
};

export const MEMBER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  identityMember,
  identityGrants,
  identityEverybody,
  memberMe,
  memberRegister,
  memberCounts,
  memberJoin,
  nameRefuse,
];
