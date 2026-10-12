import type { CacheEntry } from './index';

// A staff role is a charter rung for exactly these words. Any other word on a
// staff row resolves downward, to `member`.
export const IDENTITY_RUNGS: Record<string, string> = {
  owner: 'owner',
  manager: 'manager',
  instructor: 'instructor',
  desk: 'desk',
  automation: 'automation',
};

// Never served: absent from ENTRIES and executed only by `server/identity.ts`,
// before any policy exists. It must not become reachable over HTTP.
export const identityRoles: CacheEntry = {
  fingerprint: 'identity/roles',
  intent: 'What a policy compiles from: what a studio employs this principal as, whether it knows them, and which tenant their record shares a fate with',
  shape: { staff_role: '', anchor_id: '', studio_id: '' },
  dsl: {
    from: ['people', 'staff', 'studio_people'],
    fields: [
      { field: 'staff.role', as: 'staff_role' },
      { field: 'studio_people.id', as: 'anchor_id' },
      { field: 'studio_people.studio_id', as: 'studio_id' },
    ],
    filter: { eq: ['people.id', { $context: 'principal' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: {
        rung: {
          $get: {
            from: { $const: IDENTITY_RUNGS },
            path: [{ $coalesce: [{ $ref: '$.staff_role' }, { $const: '' }] }],
            fallback: { $const: '' },
          },
        },
        anchored: { $neq: [{ $coalesce: [{ $ref: '$.anchor_id' }, { $const: '' }] }, ''] },
        studioId: { $coalesce: [{ $ref: '$.studio_id' }, { $const: '' }] },
      },
      value: {
        roles: {
          $case: {
            branches: [
              { when: { $and: [{ $neq: [{ $var: 'rung' }, ''] }, { $var: 'anchored' }] }, then: [{ $var: 'rung' }, 'member'] },
              { when: { $neq: [{ $var: 'rung' }, ''] }, then: [{ $var: 'rung' }] },
            ],
            else: ['member'],
          },
        },
        tag: { $var: 'studioId' },
        scope: {
          studioId: { $var: 'studioId' },
          // '' for a staff-only principal (no anchor row): an integration's
          // "only somebody the studio knows can pay" check keys on that.
          personId: { $case: { branches: [{ when: { $var: 'anchored' }, then: { $ref: '$.principal' } }], else: '' } },
          audience: { $case: { branches: [{ when: { $neq: [{ $var: 'rung' }, ''] }, then: { $var: 'rung' } }], else: 'member' } },
          trains: { $var: 'anchored' },
          automationActor: { $join: { parts: ['automation@', { $var: 'studioId' }] } },
        },
      },
    },
  },
};

// Moss merges each mapped object into the session's scope in order: a missing
// row answers `{}`, so it never overwrites a value already established.
const emptyWhenNoRow = (value: unknown): unknown => ({
  $case: { branches: [{ when: { $eq: [{ $ref: '$.result' }, null] }, then: {} }], else: value },
});

export const identityPerson: CacheEntry = {
  fingerprint: 'identity/person',
  intent: "The caller's own name — the one fact about a person a session needs that is not derivable from the licensed read",
  reach: 'identity',
  shape: { name: '' },
  dsl: {
    from: ['people'],
    fields: ['people.name'],
    limit: 1,
  },
  mapping: emptyWhenNoRow({ name: { $get: { from: { $ref: '$.result' }, path: ['name'], fallback: { $const: '' } } } }),
};

export const identityStudio: CacheEntry = {
  fingerprint: 'identity/studio',
  intent: "The session's studio, as it trades: name, clock zone, country, language, currency",
  reach: 'identity',
  shape: { studioName: '', timezone: '', country: '', legalForm: '', legalName: '', locale: '', currency: '' },
  dsl: {
    from: ['studios'],
    fields: [{ field: 'studios.name', as: 'studio_name' }, 'studios.timezone', 'studios.country', 'studios.legal_form', 'studios.legal_name', 'studios.locale', 'studios.currency'],
    limit: 1,
  },
  mapping: emptyWhenNoRow({
    studioName: { $get: { from: { $ref: '$.result' }, path: ['studio_name'], fallback: { $const: '' } } },
    timezone: { $get: { from: { $ref: '$.result' }, path: ['timezone'], fallback: { $const: '' } } },
    country: { $get: { from: { $ref: '$.result' }, path: ['country'], fallback: { $const: '' } } },
    legalForm: { $get: { from: { $ref: '$.result' }, path: ['legal_form'], fallback: { $const: '' } } },
    legalName: { $get: { from: { $ref: '$.result' }, path: ['legal_name'], fallback: { $const: '' } } },
    locale: { $get: { from: { $ref: '$.result' }, path: ['locale'], fallback: { $const: '' } } },
    currency: { $get: { from: { $ref: '$.result' }, path: ['currency'], fallback: { $const: '' } } },
  }),
};

export const identityGuarded: CacheEntry = {
  fingerprint: 'identity/guarded',
  intent: 'The children this session may act for — the set half of the household reach, pinned to the guardian',
  reach: 'identity',
  // Ids only. Joining `people` for the names would answer nothing, silently:
  // the `identity` reach pins `people.id = userId`, which no child's row
  // satisfies. The names come from `identity/household`.
  shape: [{ value: '', can_book: false }],
  dsl: {
    from: ['guardianships'],
    fields: [
      { field: 'guardianships.child_person_id', as: 'child_person_id' },
      'guardianships.can_book',
    ],
    // `can_book` is not filtered on: this answers who the session may see, and
    // seeing a child's classes is not booking them.
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        value: { $get: { from: { $var: 'r' }, path: ['child_person_id'] } },
        can_book: { $eq: [{ $get: { from: { $var: 'r' }, path: ['can_book'] } }, true] },
      },
    },
  },
};

// Read at the household reach: the identity role's grants compiled with
// `people.id = ANY(householdIds)`, the set `identity/guarded` established and
// the server passes in. Two reads, because this one is pinned by that answer.
export const identityHousehold: CacheEntry = {
  fingerprint: 'identity/household',
  intent: "The names of the people this session may act for — pinned to the household the guardianship read established",
  reach: 'household',
  shape: [{ value: '', label: '' }],
  dsl: {
    from: ['people'],
    fields: ['people.id', 'people.name'],
    sort: [{ field: 'people.name', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        value: { $get: { from: { $var: 'r' }, path: ['id'] } },
        label: { $get: { from: { $var: 'r' }, path: ['name'] } },
      },
    },
  },
};

export const identityInstalled: CacheEntry = {
  fingerprint: 'identity/installed',
  intent: "The integrations live at this session's studio — what the catalog filter and every ext.* surface key on",
  reach: 'identity',
  shape: [''],
  dsl: {
    from: ['studio_integrations'],
    fields: [{ field: 'studio_integrations.integration_id', as: 'integration_id' }],
    filter: { eq: ['studio_integrations.enabled', true] },
  },
  mapping: { $map: { over: { $ref: '$.result' }, as: 'r', body: { $get: { from: { $var: 'r' }, path: ['integration_id'] } } } },
};
