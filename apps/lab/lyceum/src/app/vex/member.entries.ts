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

// Who is watching the room — the principals a change to the members is
// announced to. Read as the `identity` role; the talk's principals are rows.
export const roomWatchers: SeedEntry = {
  fingerprint: 'grants/watchers',
  intent: 'The principals that watch the room: the speaker and the stage',
  shape: [{ principal: '' }],
  dsl: {
    from: ['grants'],
    fields: ['grants.principal'],
    filter: { in: ['grants.role', ['speaker', 'stage']] },
  },
};

// ── the room ──

export const memberMe: SeedEntry = {
  fingerprint: 'members/me',
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

export const memberJoin: SeedMutation = {
  fingerprint: 'members/join',
  intent: 'Let a person into the room',
  mutation: {
    op: 'insert',
    table: 'members',
    values: { member_id: { $context: 'memberId' }, name: { $context: 'name' } },
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

export const MEMBER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  identityMember,
  identityGrants,
  roomWatchers,
  memberMe,
  memberRoster,
  memberCounts,
  housesAll,
  membersUnsorted,
  houseSizes,
  memberJoin,
  memberSort,
];
