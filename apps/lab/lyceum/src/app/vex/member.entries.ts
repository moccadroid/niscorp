import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── identity: read as the `identity` role, pinned to the principal by the
//    engine-side `userId` scope value — never by a request ──

export const identityMember: SeedEntry = {
  fingerprint: 'identity/member',
  intent: 'The member row of the principal being resolved, if they have joined',
  shape: { house_id: '' },
  dsl: {
    from: ['members'],
    fields: ['members.house_id'],
    filter: { eq: ['members.member_id', { $scope: 'userId' }] },
  },
};

export const identityGrants: SeedEntry = {
  fingerprint: 'identity/grants',
  intent: 'The capability roles granted to the principal being resolved',
  shape: [{ role: '' }],
  dsl: {
    from: ['grants'],
    fields: ['grants.role'],
    filter: { eq: ['grants.principal', { $scope: 'userId' }] },
  },
};

// ── the room ──
//
// REACTIVE: the room's own reads answer again whenever a write lands on a
// table they read — somebody steps in, somebody is sorted — on every screen
// that has them open, the projector and the controller included. Nothing
// announces the change and nothing listens for it: vex knows what each query
// reads, and every write passes through vex.

export const memberMe: SeedEntry = {
  fingerprint: 'members/me',
  refresh: 'reactive',
  intent: 'The signed-in member: their name and their house, if sorted',
  shape: { name: '', house_id: '', house_name: '' },
  dsl: {
    from: ['members', 'houses'],
    fields: ['members.name', 'members.house_id', { field: 'houses.name', as: 'house_name' }],
    filter: { eq: ['members.member_id', { $scope: 'userId' }] },
  },
};

export const memberRoster: SeedEntry = {
  fingerprint: 'members/roster',
  refresh: 'reactive',
  intent: 'Everybody in the room in the order they joined, with their house if sorted',
  shape: [{ member_id: '', name: '', house_name: '' }],
  dsl: {
    from: ['members', 'houses'],
    fields: ['members.member_id', 'members.name', { field: 'houses.name', as: 'house_name' }],
    sort: [{ field: 'members.joined_at', dir: 'asc' }, { field: 'members.member_id', dir: 'asc' }],
    limit: 500,
  },
};

export const memberCounts: SeedEntry = {
  fingerprint: 'members/counts',
  refresh: 'reactive',
  intent: 'How many people have joined, and how many of them are sorted',
  shape: { joined: 0, sorted: 0 },
  dsl: {
    from: ['members'],
    // COUNT(column) skips NULLs: an unsorted member has no house_id.
    aggregate: { joined: { count: '*' }, sorted: { count: 'members.house_id' } },
  },
};

// ── the hat's reads ──

export const housesAll: SeedEntry = {
  fingerprint: 'houses/all',
  intent: 'Every house in its standing order',
  shape: [{ house_id: '', name: '' }],
  dsl: {
    from: ['houses'],
    fields: ['houses.house_id', 'houses.name'],
    sort: [{ field: 'houses.position', dir: 'asc' }],
  },
};

export const membersUnsorted: SeedEntry = {
  fingerprint: 'members/unsorted',
  intent: 'Members not yet in a house, in the order they joined',
  shape: [{ member_id: '' }],
  dsl: {
    from: ['members'],
    fields: ['members.member_id'],
    filter: { isNull: 'members.house_id' },
    sort: [{ field: 'members.joined_at', dir: 'asc' }, { field: 'members.member_id', dir: 'asc' }],
    limit: 500,
  },
};

export const membersSorted: SeedEntry = {
  fingerprint: 'members/sorted',
  intent: 'Members already in a house — the ones an unsorting takes back out',
  shape: [{ member_id: '' }],
  dsl: {
    from: ['members'],
    fields: ['members.member_id'],
    filter: { isNotNull: 'members.house_id' },
    sort: [{ field: 'members.joined_at', dir: 'asc' }, { field: 'members.member_id', dir: 'asc' }],
    limit: 500,
  },
};

export const houseSizes: SeedEntry = {
  fingerprint: 'members/house-sizes',
  intent: 'How many members each house holds so far',
  shape: [{ house_id: '', size: 0 }],
  dsl: {
    from: ['members'],
    fields: ['members.house_id'],
    aggregate: { size: { count: '*' } },
    filter: { isNotNull: 'members.house_id' },
    groupBy: ['members.house_id'],
  },
};

// ── writes ──

// Written by the person stepping in, as themselves; `member_id` is stamped by
// the engine from their session (behaviors.ts), never sent.
export const memberJoin: SeedMutation = {
  fingerprint: 'members/join',
  intent: 'Step into the room as yourself',
  mutation: {
    op: 'insert',
    table: 'members',
    values: { name: { $context: 'name' } },
  },
};

export const memberSort: SeedMutation = {
  fingerprint: 'members/sort',
  intent: 'Place a member in a house',
  mutation: {
    op: 'update',
    table: 'members',
    set: { house_id: { $context: 'houseId' } },
    where: { eq: ['members.member_id', { $context: 'memberId' }] },
  },
};

// For testing the sorting again without emptying the room.
export const memberUnsort: SeedMutation = {
  fingerprint: 'members/unsort',
  intent: 'Take a member back out of their house',
  mutation: {
    op: 'update',
    table: 'members',
    set: { house_id: null },
    where: { eq: ['members.member_id', { $context: 'memberId' }] },
  },
};

export const MEMBER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  identityMember,
  identityGrants,
  memberMe,
  memberRoster,
  memberCounts,
  housesAll,
  membersUnsorted,
  membersSorted,
  houseSizes,
  memberJoin,
  memberSort,
  memberUnsort,
];
