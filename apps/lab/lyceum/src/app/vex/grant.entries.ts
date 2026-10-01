import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── giving an action to people, and taking it back ──
//
// Which actions somebody has is their roles, and their roles are rows in
// `grants` (server/identity.ts). So giving people something is writing one
// grant row each; taking it back is deleting them. The rows change, the shells
// of the people they name are rebuilt (server/reactions.ts), and ring 1 does
// the rest: the action exists on their phone, or it does not.
//
// Three things are given this way during the talk — the X-ray, the assistant,
// the button — and each is the same three entries with its role fixed in
// them: how many have it (reactive, for the controller's tool), give it to the
// people in a list, take it back from the people in a list. A take names who,
// so the delete is bounded by what the caller passed (vex's lint asks for it).

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
  // One row each, one statement. Somebody who has it already keeps their row.
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

const xray = giving('xray', 'the X-ray');
export const xrayGiven = xray.given;
export const xrayGive = xray.give;
export const xrayTake = xray.take;

const assistant = giving('assistant', 'the assistant');
export const assistantGiven = assistant.given;
export const assistantGive = assistant.give;
export const assistantTake = assistant.take;

// The button goes to three people, picked by chance
// (server/functions/button.functions.ts).
const button = giving('button', 'the button');
export const buttonGiven = button.given;
export const buttonGive = button.give;
export const buttonTake = button.take;

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

// The fingerprints whose writes change what somebody has: their shell is
// rebuilt when one lands (server/reactions.ts).
export const GRANT_CHANGES: readonly string[] = [xray, assistant, button].flatMap((each) => [each.give.fingerprint, each.take.fingerprint]);

export const GRANT_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [...[xray, assistant, button].flatMap((each) => [each.given, each.give, each.take]), buttonHolders];
