import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── identity: read as the `identity` role, pinned to the principal by the
//    engine-side `userId` scope value — never by a request ──

export const identityMember: SeedEntry = {
  fingerprint: 'identity/member',
  intent: 'The member row of the principal being resolved, if they have stepped in',
  shape: { department_id: '' },
  dsl: {
    from: ['members'],
    fields: ['members.department_id'],
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
// they read — somebody steps in, is assigned, changes their name — on every
// screen that has them open. Nothing announces the change and nothing listens
// for it: vex knows what each query reads, and every write passes through vex.

export const memberMe: SeedEntry = {
  fingerprint: 'members/me',
  refresh: 'reactive',
  intent: 'The signed-in member: their ID card and their department, if assigned',
  shape: { member_id: '', name: '', title: '', quirk: '', department_id: '', department_name: '', department_remit: '', department_mark: '', department_sigil: '' },
  dsl: {
    from: ['members', 'departments'],
    fields: [
      'members.member_id',
      'members.name',
      'members.title',
      'members.quirk',
      'members.department_id',
      { field: 'departments.name', as: 'department_name' },
      { field: 'departments.remit', as: 'department_remit' },
      { field: 'departments.mark', as: 'department_mark' },
      { field: 'departments.sigil', as: 'department_sigil' },
    ],
    filter: { eq: ['members.member_id', { $scope: 'userId' }] },
  },
};

export const memberRegister: SeedEntry = {
  fingerprint: 'members/register',
  refresh: 'reactive',
  intent: 'Everybody in the room in the order they arrived, with their title and department',
  shape: [{ member_id: '', name: '', title: '', department_name: '', department_sigil: '' }],
  dsl: {
    from: ['members', 'departments'],
    fields: [
      'members.member_id',
      'members.name',
      'members.title',
      { field: 'departments.name', as: 'department_name' },
      { field: 'departments.sigil', as: 'department_sigil' },
    ],
    sort: [{ field: 'members.joined_at', dir: 'asc' }, { field: 'members.member_id', dir: 'asc' }],
    limit: 500,
  },
};

export const memberCounts: SeedEntry = {
  fingerprint: 'members/counts',
  refresh: 'reactive',
  intent: 'How many people are in the room, and how many are assigned',
  shape: { joined: 0, assigned: 0, unassigned: 0 },
  dsl: {
    from: ['members'],
    // COUNT(column) skips NULLs: an unassigned member has no department_id.
    aggregate: { joined: { count: '*' }, assigned: { count: 'members.department_id' } },
  },
  mapping: {
    joined: { $ref: '$.result.joined' },
    assigned: { $ref: '$.result.assigned' },
    unassigned: { $sub: [{ $ref: '$.result.joined' }, { $ref: '$.result.assigned' }] },
  },
};

// ── the departments ──

export const departmentsAll: SeedEntry = {
  fingerprint: 'departments/all',
  intent: 'Every department, its clearance in plain words, and its mark',
  shape: [{ department_id: '', name: '', remit: '', mark: '', sigil: '' }],
  dsl: {
    from: ['departments'],
    fields: ['departments.department_id', 'departments.name', 'departments.remit', 'departments.mark', 'departments.sigil'],
    sort: [{ field: 'departments.position', dir: 'asc' }],
  },
};

export const departmentsTally: SeedEntry = {
  fingerprint: 'departments/tally',
  refresh: 'reactive',
  intent: 'How many people each department has so far',
  shape: [{ department_id: '', size: 0 }],
  dsl: {
    from: ['members'],
    fields: ['members.department_id'],
    aggregate: { size: { count: '*' } },
    filter: { isNotNull: 'members.department_id' },
    groupBy: ['members.department_id'],
    sort: [{ field: 'members.department_id', dir: 'asc' }],
  },
};

// ── assignment: the speaker's, read and written as the speaker ──

export const membersUnassigned: SeedEntry = {
  fingerprint: 'members/unassigned',
  intent: 'Members not yet in a department, in the order they arrived',
  shape: [{ member_id: '' }],
  dsl: {
    from: ['members'],
    fields: ['members.member_id'],
    filter: { isNull: 'members.department_id' },
    sort: [{ field: 'members.joined_at', dir: 'asc' }, { field: 'members.member_id', dir: 'asc' }],
    limit: 500,
  },
};

export const membersAssigned: SeedEntry = {
  fingerprint: 'members/assigned',
  intent: 'Members already in a department — the ones unassigning takes back out',
  shape: [{ member_id: '' }],
  dsl: {
    from: ['members'],
    fields: ['members.member_id'],
    filter: { isNotNull: 'members.department_id' },
    sort: [{ field: 'members.joined_at', dir: 'asc' }, { field: 'members.member_id', dir: 'asc' }],
    limit: 500,
  },
};

export const memberAssign: SeedMutation = {
  fingerprint: 'members/assign',
  intent: 'Put a member in a department',
  mutation: {
    op: 'update',
    table: 'members',
    set: { department_id: { $context: 'departmentId' }, assigned_at: { $context: 'at' } },
    where: { eq: ['members.member_id', { $context: 'memberId' }] },
  },
};

// For testing the assignment again without emptying the room.
export const memberUnassign: SeedMutation = {
  fingerprint: 'members/unassign',
  intent: 'Take a member back out of their department',
  mutation: {
    op: 'update',
    table: 'members',
    set: { department_id: null, assigned_at: null },
    where: { eq: ['members.member_id', { $context: 'memberId' }] },
  },
};

// ── the door: written by the person stepping in, as themselves ──

// `member_id` is stamped by the engine from their session (behaviors.ts),
// never sent.
export const memberJoin: SeedMutation = {
  fingerprint: 'members/join',
  intent: 'Step into the room as yourself',
  mutation: {
    op: 'insert',
    table: 'members',
    values: { name: { $context: 'name' } },
  },
};

// ── Forms: change your own record ──
//
// Served at the `personal` reach (behaviors.ts): the engine pins the update to
// the caller's own row, whatever `memberId` a request names.
export const memberRename: SeedMutation = {
  fingerprint: 'members/rename',
  intent: 'Change your own name on your record',
  reach: 'personal',
  mutation: {
    op: 'update',
    table: 'members',
    set: { name: { $context: 'name' } },
    where: { eq: ['members.member_id', { $context: 'memberId' }] },
  },
};

// ── Inquiries: questions put to the records ──
//
// Each answers as rows of { label, value } — one shape, so one table shows
// any of them — and each is reactive: an answer on screen keeps answering.

export const inquiryByDepartment: SeedEntry = {
  fingerprint: 'inquiry/by-department',
  refresh: 'reactive',
  intent: 'How many people are in each department',
  shape: [{ label: '', value: '' }],
  dsl: {
    from: ['members', 'departments'],
    fields: [{ field: 'departments.name', as: 'label' }],
    aggregate: { value: { count: '*' } },
    filter: { isNotNull: 'members.department_id' },
    groupBy: ['departments.name'],
    sort: [{ field: 'departments.name', dir: 'asc' }],
  },
};

export const inquiryNewest: SeedEntry = {
  fingerprint: 'inquiry/newest',
  refresh: 'reactive',
  intent: 'The five people who arrived last, and when',
  shape: [{ label: '', value: '' }],
  dsl: {
    from: ['members'],
    fields: [{ field: 'members.name', as: 'label' }, { field: 'members.joined_at', as: 'at' }],
    sort: [{ field: 'members.joined_at', dir: 'desc' }, { field: 'members.member_id', dir: 'desc' }],
    limit: 5,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'row',
      body: {
        label: { $get: { from: { $var: 'row' }, path: ['label'] } },
        value: { $date: { value: { $get: { from: { $var: 'row' }, path: ['at'] } }, format: 'HH:mm:ss' } },
      },
    },
  },
};

export const inquiryWaiting: SeedEntry = {
  fingerprint: 'inquiry/waiting',
  refresh: 'reactive',
  intent: 'Who is still waiting to be assigned',
  shape: [{ label: '', value: '' }],
  dsl: {
    from: ['members'],
    fields: [{ field: 'members.name', as: 'label' }, { field: 'members.member_id', as: 'value' }],
    filter: { isNull: 'members.department_id' },
    sort: [{ field: 'members.joined_at', dir: 'asc' }],
    limit: 50,
  },
};

// ── Archive: the history ──

export const archiveHistory: SeedEntry = {
  fingerprint: 'archive/history',
  refresh: 'reactive',
  intent: 'Everybody, newest first: when they arrived and where they went',
  shape: [{ member_id: '', name: '', arrived: '', department_name: '', assigned: '' }],
  dsl: {
    from: ['members', 'departments'],
    fields: [
      'members.member_id',
      'members.name',
      { field: 'members.joined_at', as: 'joined_at' },
      { field: 'members.assigned_at', as: 'assigned_at' },
      { field: 'departments.name', as: 'department_name' },
    ],
    sort: [{ field: 'members.joined_at', dir: 'desc' }, { field: 'members.member_id', dir: 'desc' }],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'row',
      body: {
        member_id: { $get: { from: { $var: 'row' }, path: ['member_id'] } },
        name: { $get: { from: { $var: 'row' }, path: ['name'] } },
        arrived: { $date: { value: { $get: { from: { $var: 'row' }, path: ['joined_at'] } }, format: 'HH:mm:ss' } },
        department_name: { $get: { from: { $var: 'row' }, path: ['department_name'] } },
        assigned: {
          $case: {
            branches: [{ when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['assigned_at'] } }, null] }, then: '' }],
            else: { $date: { value: { $get: { from: { $var: 'row' }, path: ['assigned_at'] } }, format: 'HH:mm:ss' } },
          },
        },
      },
    },
  },
};

export const MEMBER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  identityMember,
  identityGrants,
  memberMe,
  memberRegister,
  memberCounts,
  departmentsAll,
  departmentsTally,
  membersUnassigned,
  membersAssigned,
  memberAssign,
  memberUnassign,
  memberJoin,
  memberRename,
  inquiryByDepartment,
  inquiryNewest,
  inquiryWaiting,
  archiveHistory,
];
