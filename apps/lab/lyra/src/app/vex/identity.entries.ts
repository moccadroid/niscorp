import type { CacheEntry } from './index';

// ═══════════════════════════════════════════════════════════════
// IDENTITY AS AN ARTIFACT.
//
// There is exactly ONE question in this application that cannot be asked
// through the engine: "what roles does this principal wear" — because the
// policy every engine read runs under is COMPILED from the answer. That
// question needs three facts (a staff word, an anchor, a tenant), read by the
// one licensed query in `server/identity.ts` and mapped to a session record by
// the authored prism below — data the charter checks can read, not a function.
//
// EVERYTHING ELSE ABOUT A SESSION IS ORDINARY DATA, read through the engine
// once a policy exists: the caller's own name (`identity/person`), their
// studio's trading facts (`identity/studio`), and their tenant's installs
// (`identity/installed`). Each is a single table, pinned by the `identity`
// reach in behaviors.ts, executed by moss as the charter's `identity` role —
// a role nobody wears, holding exactly the verbs these reads need. That is how
// a member gets a session without members getting `people.read`.
//
// The `Person` type, `personCard`, `lookup.ts` and the eleven-column identity
// query existed because this file did not: with no declared model of identity,
// identity became whatever the next caller needed. This file is the model.
// ═══════════════════════════════════════════════════════════════

// ─── the rung table: authored, and checkable ─────────────────
//
// A staff role IS a charter rung, for exactly these five words. Anything else
// on a staff row resolves DOWNWARD to member — the direction that matters when
// the word arrives from somewhere nobody reviewed. `reads-are-vex-check`
// asserts every value here is a charter role, and that none of them is the
// `identity` reader role, which nobody may wear.
export const IDENTITY_RUNGS: Record<string, string> = {
  owner: 'owner',
  manager: 'manager',
  instructor: 'instructor',
  desk: 'desk',
  automation: 'automation',
};

// ─── the licensed read, and the mapping that IS the person model ──
//
// NEVER SERVED: absent from the registered ENTRIES, executed only by
// `server/identity.ts` before any policy exists — a pre-authorisation read
// reachable from HTTP is the bootstrap-policy hole D4 refused. The check
// asserts that, and pins the licensed SQL to the tables declared here.
//
// The mapping receives the row's three facts plus `principal`, and answers the
// SEAM RECORD whole: roles for the charter, the tag moss forgets a tenant by,
// and the scope half that is pure derivation. Nothing else in the codebase
// derives any of this — one spelling, and it is data.
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
        // The rung the staff word names (if the charter knows it), plus
        // `member` when the studio holds an anchor for them.
        roles: {
          $case: {
            branches: [
              { when: { $and: [{ $neq: [{ $var: 'rung' }, ''] }, { $var: 'anchored' }] }, then: [{ $var: 'rung' }, 'member'] },
              { when: { $neq: [{ $var: 'rung' }, ''] }, then: [{ $var: 'rung' }] },
            ],
            else: ['member'],
          },
        },
        // What this record shares a fate with — the key `invalidateTenant`
        // forgets by. Opaque to moss; here it is the studio.
        tag: { $var: 'studioId' },
        scope: {
          studioId: { $var: 'studioId' },
          // Set only for people the studio KNOWS (the anchor row) — staff-only
          // principals get '', which is what an integration's "only somebody the studio
          // knows can pay" check keys on.
          personId: { $case: { branches: [{ when: { $var: 'anchored' }, then: { $ref: '$.principal' } }], else: '' } },
          audience: { $case: { branches: [{ when: { $neq: [{ $var: 'rung' }, ''] }, then: { $var: 'rung' } }], else: 'member' } },
          trains: { $var: 'anchored' },
          automationActor: { $join: { parts: ['automation@', { $var: 'studioId' }] } },
        },
      },
    },
  },
};

// ─── what is DELIBERATELY not here ───────────────────────────
//
// No actor read: an integration actor (`ig_<integration>@<studio>`) names its rung
// and its studio in its own id, purely; whether the install is live is
// `identity/installed`, read through the engine and checked by the app.
// No automation read: a studio's robot IS the synthetic `automation@<studio>`
// — the id names the tenant, nothing needs looking up, and the chain-trust
// comparison (`userId === automationActor`) becomes exact instead of inferred.
// No by-email read: resolving a sign-in address is credential machinery and
// lives with the nonce in `server/links.ts`, a named no-principal door.
//
// The licensed budget is therefore ONE statement, over the three tables the
// `identity/roles` dsl declares — and `reads-are-vex-check` asserts the count.

// ═══════════════════════════════════════════════════════════════
// THE ENGINE-READ HALF — seeded, served, single-table, join-free.
//
// Moss executes these as the `identity` role, in order, merging each mapped
// object into the session's scope — so `identity/studio` is pinned by the
// `studioId` the licensed read established, a value no request authored.
// Serving them is safe by construction: a caller replays them under their OWN
// policy, where the `identity` reach pins rows to the caller, and rungs
// without the grants are refused outright.
//
// Each mapping answers `{}` for a missing row rather than a record of empty
// strings — a merge must never let "no row" overwrite a value somebody else
// already established (the actor path seeds its scope pre-auth).
// ═══════════════════════════════════════════════════════════════

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
  shape: { studioName: '', timezone: '', country: '', legalForm: '', locale: '', currency: '' },
  dsl: {
    from: ['studios'],
    fields: [{ field: 'studios.name', as: 'studio_name' }, 'studios.timezone', 'studios.country', 'studios.legal_form', 'studios.locale', 'studios.currency'],
    limit: 1,
  },
  mapping: emptyWhenNoRow({
    studioName: { $get: { from: { $ref: '$.result' }, path: ['studio_name'], fallback: { $const: '' } } },
    // CARRIED, not looked up: the day is volatile and derived per request from
    // this zone by the `scope` hook — never held for a session.
    timezone: { $get: { from: { $ref: '$.result' }, path: ['timezone'], fallback: { $const: '' } } },
    country: { $get: { from: { $ref: '$.result' }, path: ['country'], fallback: { $const: '' } } },
    // Rides beside `country` for the same reason: both decide what a payment
    // provider asks this business for, both are the studio's own fact, and
    // neither is a question an integration should have to put to a caller.
    legalForm: { $get: { from: { $ref: '$.result' }, path: ['legal_form'], fallback: { $const: '' } } },
    locale: { $get: { from: { $ref: '$.result' }, path: ['locale'], fallback: { $const: '' } } },
    currency: { $get: { from: { $ref: '$.result' }, path: ['currency'], fallback: { $const: '' } } },
  }),
};

// A bare list of ids, consumed wholesale: moss never reads a field off it,
// which is what keeps the record opaque. The no-row shape is naturally [] here.
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
