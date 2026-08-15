import type { CacheEntry, MutationEntry } from './index';

export const personCreate: MutationEntry = {
  fingerprint: 'people/create',
  intent: 'Create a person — a human, not yet anybody at a studio',
  mutation: {
    op: 'insert',
    table: 'people',
    values: {
      id: { $context: 'personId' },
      email: { $context: 'email' },
      name: { $context: 'name' },
      phone: { $context: 'phone' },
    },
  },
};

export const studioPersonCreate: MutationEntry = {
  fingerprint: 'people/add',
  intent: 'Record that this studio knows a person — the anchor every relationship hangs off',
  mutation: {
    op: 'insert',
    table: 'studio_people',
    values: {
      id: { $context: 'studioPersonId' },
      person_id: { $context: 'personId' },
      // No status, deliberately. A prospect is this row holding nothing; a
      // member is this row plus a subscription; the milkman is this row plus a
      // contact tag. What they ARE is derived, never written. See standing.ts.
      //
      // A trial is a DATE, not a status: NULL means none, a date means the
      // free window closes on its own.
      trial_ends_on: { $context: 'trialEndsOn' },
      source: { $context: 'source' },
      notes: { $context: 'notes' },
    },
  },
};

// ── the whole signup, as ONE artifact ────────────────────────
//
// This used to be a server function: look the person up by email, mint ids,
// insert `people` only if absent, insert the anchor, translate the duplicate-
// key error. Every step existed because the grammar couldn't say it — and now
// it can. Statement 1 ensures the person (ON CONFLICT on the email identity —
// DO NOTHING, because statement 2 finds them by $lookup either way, fresh or
// returning). Statement 2 writes the anchor, idempotently: someone already on
// the roll conflicts on (studio_id, person_id) and returns no row — signing
// up an existing member is a no-op, not an error. Ids are DB-minted,
// `first_seen_on` is stamped by the studio-clock trigger, and the tenant
// column is pinned by scope. The reply says what happened by its row count:
// two rows = new person enrolled, one = known person enrolled (or fresh
// person already anchored — impossible), zero = already on the roll.
export const peopleEnroll: MutationEntry = {
  fingerprint: 'people/enroll',
  intent: 'Write a person down: ensure the human exists, then anchor them to this studio',
  mutation: [
    {
      op: 'insert',
      table: 'people',
      values: { email: { $context: 'email' }, name: { $context: 'name' }, phone: { $context: 'phone' } },
      onConflict: { target: ['email'] },
    },
    {
      op: 'insert',
      table: 'studio_people',
      values: {
        person_id: { $lookup: { from: 'people', field: 'id', where: { eq: ['people.email', { $context: 'email' }] } } },
        trial_ends_on: { $context: 'trialEndsOn' },
        source: { $context: 'source' },
        notes: { $context: 'notes' },
      },
      onConflict: { target: ['studio_id', 'person_id'] },
    },
  ],
};

// ── WRITING A CHILD DOWN ─────────────────────────────────────
//
// A SEPARATE ARTIFACT FROM `people/enroll`, and not for tidiness: that one is
// keyed on email in BOTH statements — `onConflict: { target: ['email'] }` and
// a `$lookup` that finds the person by address — and a child has no address.
// With a NULL email the conflict target never arrests anything (Postgres
// treats NULLs as distinct, so a second run makes a second person) and the
// lookup returns NULL, which lands on `studio_people.person_id NOT NULL` as a
// constraint violation rather than as an answer. Reusing it would have been a
// duplicate-child machine that failed loudly on every second attempt.
//
// ── AND WHY IT IS TWO ARTIFACTS RATHER THAN ONE ──────────────
//
// It should be one. `people/enroll` is one, and for the same subject. What
// stops it is that the statements of a multi-statement write are compiled up
// front and bind only `$context` and `$scope` (vex mutations/engine.ts):
// there is NO reference from statement two back to what statement one
// inserted. `people/enroll` works around that with a `$lookup` on the email —
// the natural key — and re-finds the person by the same value it just wrote.
//
// A child has no natural key. Not email (absent, and absent by design), not
// name (two children called Tom), not name-and-birthday (still not a
// constraint anybody could enforce). So the child's id has to travel in
// context, and nothing in the request path can mint one: prism is a pure
// mapping language and giving it a generator would make it not one.
//
// So the id comes from where it already exists — the row the database minted
// in the first call — and the second call is made with it. The desk's action
// chains them (people.actions.ts).
//
// WHAT THAT COSTS, stated rather than discovered: between the two calls a
// child row exists with no anchor and no guardian. That person is invisible —
// no anchor means no studio knows them, so they are on no roll, in no
// selection and in no reach — and the second call is idempotent, so retrying
// costs nothing. It is an orphan row, which is the same failure `people/enroll`
// already tolerates, and not a child somebody can see but nobody can act for.
export const childCreate: MutationEntry = {
  fingerprint: 'people/create-child',
  intent: 'Create a child: a person with a name, an age and deliberately no way in',
  mutation: {
    op: 'insert',
    table: 'people',
    values: {
      name: { $context: 'name' },
      born_on: { $context: 'bornOn' },
      // `email` is not named at all, so the column takes its NULL. Writing ''
      // here would let exactly one child exist per studio, silently, because
      // the UNIQUE index treats empty strings as equal and NULLs as distinct.
    },
  },
};

export const childAttach: MutationEntry = {
  fingerprint: 'people/attach-child',
  intent: 'Put a child on the roll and say who may act for them — both, or the child is nobody’s',
  mutation: [
    {
      op: 'insert',
      table: 'studio_people',
      values: {
        person_id: { $context: 'childPersonId' },
        source: { $context: 'source' },
        notes: { $context: 'notes' },
      },
      onConflict: { target: ['studio_id', 'person_id'] },
    },
    {
      // The guardian is named by the CALLER'S context rather than by scope:
      // the desk is writing this, and the desk is not the parent. What stops
      // it naming somebody arbitrary is that `guardianships` is tenant-scoped
      // — the studio pin is stamped by the engine — so a desk can only ever
      // link two people at its own studio. A member never replays this: the
      // member rung holds no insert on this table.
      op: 'insert',
      table: 'guardianships',
      values: {
        guardian_person_id: { $context: 'guardianPersonId' },
        child_person_id: { $context: 'childPersonId' },
      },
      onConflict: { target: ['studio_id', 'guardian_person_id', 'child_person_id'] },
    },
  ],
};

// Somebody who already exists — a former member coming back — looked up by the
// address they would sign in with.
export const personByEmail: CacheEntry = {
  fingerprint: 'people/byEmail',
  intent: 'Find a person by the email they sign in with',
  shape: { person_id: '', name: '', email: '' },
  dsl: {
    from: ['people'],
    fields: [{ field: 'people.id', as: 'person_id' }, 'people.name', 'people.email'],
    filter: { eq: ['people.email', { $context: 'email' }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        person_id: { $get: { from: { $var: 'r' }, path: ['person_id'], fallback: { $const: '' } } },
        name: { $get: { from: { $var: 'r' }, path: ['name'], fallback: { $const: '' } } },
        email: { $get: { from: { $var: 'r' }, path: ['email'], fallback: { $const: '' } } },
      },
    },
  },
};
