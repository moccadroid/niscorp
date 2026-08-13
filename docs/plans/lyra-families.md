# Families — a parent acting for a child

> **Status: not built.** This is a build brief, written to be handed to one
> agent and executed. **Section 3 contains a decision that must be made by a
> human before any code is written** — it decides whether this touches vex.

## Why now, and why it is not a table

Kids' classes are a large share of BJJ, karate, dance and music schools —
the exact verticals this product aims at. Today Lyra cannot express one:

- **A person is an email is a login.** A seven-year-old has neither. Every
  route into the app assumes `people.email`.
- **`connections.kind = 'guardian'` is not this.** It is a contact tag on a
  `UNIQUE (studio_id, person_id, kind)` row — it records that a studio *deals
  with* a guardian, in the same list as 'supplier' and 'physio'. It does not
  name **which child**, and it does not mean **may act for**.
- **The member reach forbids it by construction.** Every member-facing read
  runs at `scoping: 'personal'`
  ([charter.ts:17](../../apps/lab/lyra/src/app/charter/charter.ts)), whose rule is
  `match person_id to userId` ([behaviors.ts:13](../../apps/lab/lyra/src/app/vex/behaviors.ts)).
  A parent's `userId` will never equal a child's `person_id`, so a parent
  sees none of their child's bookings, credits, or membership — and no screen
  can fix that, because the engine applies the rule underneath every screen.

**This is an authorization change wearing a schema change's clothes.** That
is precisely why deferring it is expensive: every member-facing entry written
between now and then is written against a reach that cannot express a family,
and each one is another thing to revisit. The `studio_people` anchor and the
concurrent-relationship model landed recently, which makes this the cheapest
it will ever be.

Also note what is *already* right: money and access are decoupled
(`paid_via`), so "the child holds the plan, the parent pays" is expressible
the day the people model can name both.

---

## 1. The relationship

```sql
CREATE TABLE guardianships (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  studio_id          TEXT NOT NULL REFERENCES studios(id),
  guardian_person_id TEXT NOT NULL REFERENCES people(id),
  child_person_id    TEXT NOT NULL REFERENCES people(id),
  can_book           BOOLEAN NOT NULL DEFAULT true,
  can_pay            BOOLEAN NOT NULL DEFAULT true,
  created_on         DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (studio_id, guardian_person_id, child_person_id),
  CHECK (guardian_person_id <> child_person_id)
);
```

**Per studio, and that is deliberate** — it is a relationship *at* a studio,
exactly like `studio_people`, `staff` and `connections`. A family that trains
at two studios is two sets of rows, and neither studio learns about the
other.

**Directional.** Guardian → child. The reverse must not be implied: a child
does not act for a parent.

**Two capabilities, not one.** `can_book` and `can_pay` separate because a
16-year-old may book for themselves while a parent still pays. Ship with both
`true` and no UI for changing them; the columns exist so the model does not
have to move when somebody asks.

### The child as a person

A child gets an ordinary `people` row and an ordinary `studio_people` anchor —
they are known to the studio, they have standing, they appear on the roll.
What they do not have is a way in:

- `people.email` becomes **nullable**. Check every read that assumes it.
  (`automation/joined-subscription` and `automation/enquired-person` both
  select `people.email` and hand it to an effect — a mail effect must skip a
  null address rather than send to `''`, and the guardian is who should be
  written to instead. See §4.)
- `mintToken` must refuse a person with no email. A row nobody can log in as
  is the point, not an oversight.

---

## 2. What breaks if you only do §1

Everything above is inert without the reach. Concretely, with the table added
and nothing else, a parent still sees nothing: `personal` clamps
`person_id = userId` on `bookings`, `enrolments`, `subscriptions`, `passes`,
`studio_people` and every `me/*` entry. **The table is not the feature. The
reach is the feature.**

---

## 3. THE DECISION — how the reach expresses "me and mine"

Read this before writing code. It is the only part that can touch a library,
and the user's standing rule is that **`packages/*` is not modified without
explicit permission**.

### The constraint, verified

A scope behavior's `match` compiles to a **scalar equality** — hard-coded, one
value:

```ts
// packages/vex/src/scope/apply.ts:99
const original: Filter = { eq: [path, { $scope: match.to }] };
```

There is no set-valued match. So "person_id is any of my household" cannot be
written as a behavior today.

### Option A — `household_id`, a scalar everyone shares

Give `studio_people` a `household_id` (defaulting to its own id, so a member
with no family is a household of one). Add a `household` profile whose rule is
`match household_id to householdId`, and put `householdId` in the app's
`scope()`.

- **No library change.** It is the same shape as `studio_id` tenancy, which
  the whole app already runs on.
- Engine-enforced, uniformly, under every screen.
- **Cost: it is symmetric.** Everyone in a household sees everyone else's
  rows — a 16-year-old could read a parent's subscription. And a child of
  separated parents belongs to one household id, not two.

### Option B — a set-valued match in vex, with `guardianships` *(recommended)*

Teach a behavior match to carry a set:

```ts
{ match: 'person_id', in: 'householdIds' }   // → person_id = ANY($n)
```

`scope()` resolves `householdIds` to the caller plus every child they guard.

- **Directional and per-child**, which is what the domain actually is.
- Handles separated parents (a child appears in two guardians' sets).
- Still engine-enforced — the property that makes this safe at all.
- **Cost: a vex change**, needing explicit permission. It is small (one
  filter shape, one compile branch) and principled: "a reach covers several
  rows" is a real concept the grammar currently cannot say.

### Option C — loosen the reach, guard in each entry *(rejected)*

Drop the person clamp for members and have every member-facing entry carry
its own `exists` into `guardianships`. Expressible today, no changes anywhere
— and **wrong**: it moves enforcement from the engine into the entries, so a
single entry that forgets the predicate exposes the whole studio. It fails
open. This codebase's entire posture is that the boundary is engine-side; do
not trade that for convenience.

> **Ask the user to choose A or B before starting.** If B, ask for the vex
> change explicitly and in isolation — one commit, its own tests in
> `packages/vex/test/scope`, before any Lyra work.

---

## 4. What the reach touches

Once the profile exists, the change is smaller than it sounds, because reach
is a property of the **rung**, not of each entry:

1. `member` in [charter.ts](../../apps/lab/lyra/src/app/charter/charter.ts):
   `scoping: 'personal'` → `scoping: 'household'`.
2. Every table in [behaviors.ts](../../apps/lab/lyra/src/app/vex/behaviors.ts) that declares a
   `personal` profile gains a `household` one: `bookings`, `enrolments`,
   `studio_people`, `subscriptions`, `passes`, and the notice/pause ledgers.

That is the whole enforcement change. **Entries are not edited.** A table
declaring named variants and no `default` fails closed for an unprofiled
principal, which is the behavior you want while migrating.

**Writes need care.** `personal`'s write rules `set person_id to userId` —
they overwrite whatever the caller sent, which is what makes "start somebody
else's plan" unsayable. Under `household` that stamp must become a *match
against the set* rather than a set-to-caller, or a parent booking for a child
silently books for themselves. **This is the single most likely bug in the
whole brief.** Write the check first:

> a parent books for their child; the booking's `person_id` is the child's,
> not the parent's.

---

## 5. Screens

Keep this deliberately small for a first landing:

- **People → a member's record** gains a "Family" section: the children this
  person guards, and an "Add a child" form (name, date of birth — no email).
- **The member's own surface** (`me.*`) gains a switcher: "booking for
  Me / Anna / Tom". The chosen person rides in the request context; the reach
  is what makes it *permitted*, and the switcher is only what makes it
  *convenient*. Never the other way round.
- **The roll** gains nothing. A child is a person the studio knows; they
  already appear, with standing derived the ordinary way.

Deliberately **not** in scope: family pricing (one offering covering several
people). It is a real request and a separate model change — one subscription
currently belongs to one person. Do not let it grow into this piece of work;
just confirm `guardianships` does not make it harder, which it does not.

---

## 6. Build order

1. **Decide A or B** (§3). If B, land the vex change alone, with its own
   tests, and get it approved.
2. **`guardianships` + nullable `people.email` + `mintToken` refusal.** Seed a
   family into the dataset — a parent with two children at Lumen. A check
   that a child exists, appears on the roll, and cannot be logged in as.
3. **The reach.** The `household` profile on the tables listed in §4, the rung
   flipped, `scope()` resolving the new value. **Write the write-side check
   first** (§4). Then: a parent reads their child's bookings; a parent reads
   *nothing* of an unrelated member; a member with no children sees exactly
   what they saw before — that last one is the regression guard for the whole
   existing member surface.
4. **A child holds a plan the parent pays for.** `subscriptions.person_id` is
   the child, `paid_via` is the parent's arrangement. Prove standing derives
   for the child and the money appears in the studio's forecast.
5. **Screens** (§5), driven through checks as the rest of this app is.

---

## 7. What "done" looks like

- A parent signs in and sees their own membership *and* their two children's
  classes, with nothing of anybody else's.
- A parent books their child into a class; the booking belongs to the
  **child**.
- A child cannot sign in, appears on the roll, and derives standing normally.
- An existing member with no children sees precisely what they saw before —
  proven by the member and me-surface checks passing unchanged.
- The tenant boundary is untouched: a guardianship at one studio grants
  nothing at another.
