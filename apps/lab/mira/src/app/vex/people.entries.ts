import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export const personRole: SeedEntry = {
  fingerprint: 'people/role',
  intent: 'The role of the person being resolved',
  shape: { role: '' },
  dsl: { from: ['people'], fields: ['people.role'], filter: { eq: ['people.id', { $scope: 'userId' }] } },
};

export const personByEmail: SeedEntry = {
  fingerprint: 'people/by-email',
  intent: 'The person with this email address, if they were invited',
  shape: { id: '', email: '' },
  dsl: { from: ['people'], fields: ['people.id', 'people.email'], filter: { eq: ['people.email', { $context: 'email' }] } },
};

export const peopleList: SeedEntry = {
  fingerprint: 'people/list',
  intent: 'Everybody who may sign in, the earliest first',
  shape: [{ id: '', email: '', name: '', role: '', created_at: '' }],
  dsl: {
    from: ['people'],
    fields: ['people.id', 'people.email', 'people.name', 'people.role', 'people.created_at'],
    sort: [{ field: 'people.created_at', dir: 'asc' }, { field: 'people.id', dir: 'asc' }],
    limit: 500,
  },
};

// Inviting somebody already invited changes nothing. Their role, and who invited them, are the owner's row rule.
export const personInvite: SeedMutation = {
  fingerprint: 'people/invite',
  intent: 'Invite a person by email address, under a name',
  mutation: { op: 'insert', table: 'people', values: { email: { $context: 'email' }, name: { $context: 'name' } }, onConflict: { target: ['email'] } },
};

export const ownerAdmit: SeedMutation = {
  fingerprint: 'people/owner',
  intent: 'Let the owner in, by the email address the app was started with',
  mutation: { op: 'insert', table: 'people', values: { email: { $context: 'email' }, role: 'owner' }, onConflict: { target: ['email'] } },
};

export const PEOPLE_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [personRole, personByEmail, peopleList, personInvite, ownerAdmit];
