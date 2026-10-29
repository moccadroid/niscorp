import type { SeedEntry, SeedMutation } from '@niscorp/vex';

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

export const nameRefuse: SeedMutation = {
  fingerprint: 'names/refuse',
  intent: 'Keep a name somebody typed that was not fit to show, with how sure the moderator was',
  mutation: {
    op: 'insert',
    table: 'refused_names',
    values: { text: { $context: 'text' }, score: { $context: 'score' } },
  },
};

// A VALUE IN THE REQUEST: members whose name contains the text sent as `q`,
// bound as a parameter — the vex talk's values slide (slide.value). `%` is
// the wildcard; the search tool wraps what the speaker typed in it. Sent
// without `q`, it answers empty and names the key it missed.
export const memberSearch: SeedEntry = {
  fingerprint: 'members/search',
  intent: 'Members whose name contains the search text',
  shape: [{ name: '' }],
  dsl: {
    from: ['members'],
    fields: ['members.name'],
    filter: { ilike: ['members.name', { $context: 'q' }] },
    sort: [{ field: 'members.name', dir: 'asc' }],
    limit: 20,
  },
};

export const MEMBER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  identityMember,
  identityGrants,
  identityEverybody,
  memberMe,
  memberRegister,
  memberCounts,
  memberSearch,
  memberJoin,
  nameRefuse,
];
