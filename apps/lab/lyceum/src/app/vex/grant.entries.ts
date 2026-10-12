import type { SeedEntry, SeedMutation } from '@niscorp/vex';

type Giving = { given: SeedEntry; give: SeedMutation; take: SeedMutation };

const giving = (role: string, what: string): Giving => ({
  given: {
    fingerprint: `grants/${role}/count`,
    refresh: 'reactive',
    intent: `How many people have been given ${what}`,
    shape: { count: 0, given: false },
    dsl: {
      from: ['grants'],
      filter: { eq: ['grants.role', role] },
      aggregate: { count: { count: '*' } },
    },
    mapping: {
      $with: {
        let: { count: { $get: { from: { $ref: '$.result' }, path: ['count'], fallback: { $const: 0 } } } },
        value: { count: { $var: 'count' }, given: { $gt: [{ $var: 'count' }, 0] } },
      },
    },
  },
  give: {
    fingerprint: `grants/${role}/give`,
    intent: `Give ${what} to every member in the list`,
    mutation: {
      op: 'insertEach',
      table: 'grants',
      items: { $context: 'members' },
      values: { principal: { $item: 'member_id' }, role },
      onConflict: { target: ['principal', 'role'] },
    },
  },
  take: {
    fingerprint: `grants/${role}/take`,
    intent: `Take ${what} back from every member in the list`,
    mutation: {
      op: 'delete',
      table: 'grants',
      where: { and: [{ eq: ['grants.role', role] }, { in: ['grants.principal', { $context: 'members' }] }] },
    },
  },
});

// Not a row per person, which would miss somebody who joins a minute later:
// one row for the principal `everybody`, which is nobody's id. The identity
// seam gives every member the roles that row holds, whenever they joined.
export const EVERYBODY = 'everybody';
const givingAll = (role: string, what: string): Giving => ({
  given: {
    fingerprint: `grants/${role}/count`,
    refresh: 'reactive',
    intent: `Whether everybody has been given ${what}`,
    shape: { count: 0, given: false, state: '' },
    dsl: {
      from: ['grants'],
      filter: { and: [{ eq: ['grants.role', role] }, { eq: ['grants.principal', EVERYBODY] }] },
      aggregate: { count: { count: '*' } },
    },
    mapping: {
      $with: {
        let: { count: { $get: { from: { $ref: '$.result' }, path: ['count'], fallback: { $const: 0 } } } },
        value: {
          count: { $var: 'count' },
          given: { $gt: [{ $var: 'count' }, 0] },
          state: { $case: { branches: [{ when: { $gt: [{ $var: 'count' }, 0] }, then: { $const: 'Everybody' } }], else: { $const: 'Nobody' } } },
        },
      },
    },
  },
  give: {
    fingerprint: `grants/${role}/give`,
    intent: `Give ${what} to everybody, whoever joins later included`,
    mutation: {
      op: 'insert',
      table: 'grants',
      values: { principal: { $context: 'to' }, role },
      onConflict: { target: ['principal', 'role'] },
    },
  },
  take: {
    fingerprint: `grants/${role}/take`,
    intent: `Take ${what} back from everybody`,
    mutation: {
      op: 'delete',
      table: 'grants',
      where: { and: [{ eq: ['grants.role', role] }, { eq: ['grants.principal', { $context: 'to' }] }] },
    },
  },
});

const xray = givingAll('xray', 'the X-ray');
export const xrayGiven = xray.given;
export const xrayGive = xray.give;
export const xrayTake = xray.take;

const assistant = givingAll('assistant', 'the assistant');
export const assistantGiven = assistant.given;
export const assistantGive = assistant.give;
export const assistantTake = assistant.take;

const button = giving('button', 'the button');
export const buttonGiven = button.given;
export const buttonGive = button.give;
export const buttonTake = button.take;

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

export const GRANT_CHANGES: readonly string[] = [xray, assistant, button].flatMap((each) => [each.give.fingerprint, each.take.fingerprint]);

export const GRANT_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [...[xray, assistant, button].flatMap((each) => [each.given, each.give, each.take]), buttonHolders];
