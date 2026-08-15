# Families — a parent acting for a child

> **Status (2026-08-16): BUILT.** All three commits of §8.7 landed, and the
> `packages/vex` change (§8.6) landed with them. 50/50 Lyra checks, 391/391
> vex, 186/186 moss, 17/17 charter.
>
> A parent signs in and sees their own classes and both children's in one
> read; books a child into a class and the booking belongs to the CHILD; and
> a member who guards nobody reads precisely what they read before. The child
> is on the roll, derives standing, and cannot be signed in as.
>
> **R6's routing half landed too** (§8.8) — a child's mail reaches their
> guardian, via a resynced `mail_to` mirror on the anchor. Its CONSENT half is
> open and needs a human: whose consent governs for a child, which guardian
> when there are two, and what the unsubscribe door acts on.
>
> **Two departures from §8 worth reading before trusting it** — both forced
> by the code and both argued where they landed:
>
> 1. **`people/enroll-child` is TWO artifacts, not one.** Statements in a
>    multi-statement write bind only `$context`/`$scope`, so statement two
>    cannot reference what statement one inserted; `people/enroll` gets away
>    with it because email is a natural key and a child has none. So the
>    child's id comes from the row the first call returned, and the desk's
>    action chains them. Argued in `intake.entries.ts`.
> 2. **A child's NAME does not come through the engine.** §8.7 assumed the
>    household reach would carry it. It cannot: a name lives on `people`, and
>    granting `people.read` to the member rung makes `people/list` replayable
>    — which three perimeter checks refuse, correctly, even with the rows
>    clamped to one. So the names ride on the identity record (read once by
>    the `identity` role at the household reach) and reach the screen through
>    `nav.family`. The member rung gained NO new read verb.
>
> §8 otherwise stands as built. The recommendation, the six findings and the
> vex ask are all as landed.
>
> ⟲ **Status (2026-08-15): decided — one approval outstanding.** Part R's
> research answered by §8; the recommendation was B split in half, with the
> `packages/vex` commit as the single outstanding human decision. Approved and
> built.
>
> ⟲ **Status (2026-08-14): research first — do not build.** This file carried
> a RESEARCH MANDATE (Part R) and the original build brief (§1–§7) as a draft
> the research had to confirm or amend. §3's instruction to "choose A or B"
> was superseded because the option space was too narrow — option D (Part R.1)
> moved the question into identity instead of the reach. That mandate is now
> answered; it is kept below because §8 is only readable as a reply to it.

---

## Part R — the research mandate

### R.0 The question, stated once

A parent must be able to see and act on their child's standing, bookings and
credits, without weakening the property that makes the member surface safe:
**every member-facing read is clamped to the caller by the engine, and every
member-facing write stamps `person_id` from scope — "book somebody else" is
currently unsayable in the grammar.** Families require saying it. The
question is not *whether* to reopen that door but *which layer* reopens it:

- **the reach** (the engine learns "me and mine" — options A and B), or
- **the identity** (the parent temporarily *is* the child — option D).

Both keep enforcement engine-side. They distribute the cost differently, and
the costs are of different kinds: B pays in the query engine, D pays in
identity and UX. C (each entry guards itself) stays rejected — it fails open,
and this codebase's posture is that the boundary is engine-side.

### R.1 The four options

**A — `household_id`, a scalar everyone shares.** §3 describes it. Likely
eliminated early by R7 (separated parents: a child cannot be in two
households under a scalar) and by its symmetry (a 16-year-old reads a
parent's subscription). Run R7 first; if A dies, the research narrows to
B vs D and says so.

**B — a set-valued match in vex** (§3's recommendation). The behavior
grammar gains `{ match: 'person_id', in: 'householdIds' }` compiling to
`person_id = ANY($n)`; `scope()` resolves the set to caller-plus-guarded.
Reach becomes plural; the member rung flips to a `household` profile; writes
change from *stamp-to-caller* to *stamp-from-chosen-context, validated
against the set* — which §4 correctly flags as the single most likely bug in
the whole feature.

**C — per-entry guards.** Rejected in §3; stays rejected. Do not revisit.

**D — the parent enters the child's principal.** A child is an ordinary
person with no email and no login of their own; a guardianship row entitles
the parent's *session* to open the child's *shell*. The chrome grows a
switcher ("acting for Emma"). Under D:

- the reach is **untouched** — `personal` everywhere, because the scope *is*
  the child;
- the write-stamp bug class **vanishes by construction** — stamps already
  stamp from scope;
- no vex change, no behavior change, no entry change;
- the cost moves to identity (how does a session lawfully hold a second
  principal?) and to product (a parent never sees the family in one read —
  see R4).

### R.2 The empirical questions

Each answer must carry `file:line` evidence, per house rules. Where a
question says *sketch*, the deliverable is a diff sketch in the
recommendation, never a landed change.

**R1 — what B actually costs vex.** Read
`packages/vex/src/scope/apply.ts` (the scalar match is ~line 99) and the
filter compiler. Sketch the `in:` match end to end: grammar, compile,
parameter binding, the fail-closed path when the set is empty or the scope
value is absent. Verify or refute §3's claim of "one filter shape, one
compile branch." Count what the write side needs (R3). Estimate the test
surface in `packages/vex/test/scope`.

**R2 — what D actually costs identity.** This is the least-mapped territory
and the reason the research exists. Read the identity design as landed
(commit `55bdfd8` — the licensed identity read and the machinery-role
`executeAs` shape — plus `docs/plans/lyra-identity.md` 7.1's `wearable`).
Then answer:

- The identity read is deliberately **singular** — one licensed SQL, and
  `executeAs` exists for *machinery* (automations, integrations), not
  people. Does a guardian entering a child's principal fit the existing
  machinery shape, the `wearable` shape, or neither? **If it needs a second
  identity door, say so plainly — that may kill D on its own**, because the
  singularity of that read is a law of this codebase, not a preference.
- What is a session, today, and can one session hold or exchange for a
  second principal without a second magic link? (`mintToken`, the socket
  token, moss session/shell roster.)
- What does a child-shell cost and when is it built — at switch, or at the
  parent's login? (moss-bench: ~140 KB per shell at birth.)
- The multirole precedent is the closest existing thing to "one person,
  several reaches" (PLAN.md *"A person is not one role"*; `multirole-check`):
  policies compile per role and merge. Is "guardian of Emma" expressible as
  a role-shaped thing the existing merge machinery already handles, rather
  than as new identity code?

**R3 — writes under B, precisely.** Find the write-stamp path (`behaviors.ts`
write rules; scope application on mutations in vex). Under `household`, the
stamp must become *validate-against-set* with the subject riding in context.
Confirm or refute §4's claim that entries need no edits. Name where the
chosen `person_id` travels and what refuses a value outside the set. Write
the falsifiable check sentence first: *a parent books for their child; the
booking's `person_id` is the child's, not the parent's.*

**R4 — the family-at-a-glance question (product, not code).** Under A/B, "the
family's week" is one read. Under D it is N shells or a guardian-side
aggregate read that D was supposed to avoid. How much does this matter? Spend
at most an hour on what Gymdesk, Mindbody and Eversports family accounts
actually show a parent (one combined calendar? per-child tabs?), and state
what a BJJ/dance parent with two enrolled kids expects to see on their phone
Saturday morning. If the honest answer is "a combined view is table stakes,"
D pays for it with exactly the kind of special-case read it exists to avoid —
weigh that.

**R5 — a person with no email, through every path that assumes one.**
`people.email` is `NOT NULL UNIQUE` today. Nullable-email touches: the
licensed identity SQL (does it key or join on email?), `mintToken` (must
refuse, fail closed), the login picker, the automation effects that select
`people.email` and hand it to mail (must skip null and route to the guardian
— see R6), seed, and the uniqueness constraint itself (two children, no
email, one UNIQUE column). Also the transition out: the child turns 14/16,
gains an email and a login of their own — does anything break when email
arrives *later*, and does guardianship end by rule or by hand?

**R6 — minors, consent, and who gets the mail (option-independent — scope
it regardless of A/B/D).** Consent for a child's data is the guardian's to
give and withdraw (GDPR Art. 8; the age is member-state law — 14 in Austria,
16 in Germany; this product's seed studios are AT). The mail system enforces
consent inside the selection today. What does a consent row mean when the
subject is a child — who is asked at the desk, whose address receives a
booking confirmation, what does the unsubscribe door do when the recipient is
a guardian, and which guardian receives mail when there are two? This block
of work is needed under every option; size it so it stops being invisible.

**R7 — separated parents.** Two guardians, two households, one child. B: two
guardianship rows, the child appears in both sets — natural. D: both parents
may enter the child's principal — natural. A: a scalar `household_id` cannot
put one child in two households — if confirmed, A is dead; say so and move
on. Also answer the awkward corollary honestly under each survivor: do two
guardians see *each other* (payment arrangements, notes), or only the child?

**R8 — must-not-preclude: family pricing.** One offering covering several
people is out of scope and will be asked for. Confirm none of the surviving
options makes "one subscription, N beneficiaries" structurally harder later.
One paragraph.

### R.3 Evaluation criteria, in order

1. **Fail-closed, engine-enforced** — non-negotiable; anything that moves
   enforcement into entries or screens is C in disguise.
2. **Write-subject safety** — by construction (D) beats by validation (B)
   beats by convention (never). Weigh how much R3's bug class costs to hold
   shut forever.
3. **Blast radius** — which packages change. `packages/*` is not modified
   without explicit permission; a smaller ask is a real advantage. Name the
   exact ask for each survivor.
4. **The identity law** — the singular identity read and machinery-only
   `executeAs` are load-bearing. An option that bends them needs to say so
   in bold, not in a footnote.
5. **Separated parents** (R7) and **the Saturday-morning screen** (R4) — the
   two product facts most likely to overrule an architecturally prettier
   answer.
6. **Migration cost now vs later** — every member-facing entry written
   before this lands is written against a reach that cannot express a
   family.

### R.4 The deliverable

Appended to this file, replacing nothing:

- The recommendation — **one option** — argued against the criteria above,
  every claim cited `file:line`, every rejected option killed by evidence
  rather than taste.
- For the chosen option: the diff sketch for any `packages/*` change, stated
  as an isolated ask ("one commit, its own tests, approved before Lyra
  work") — or, if D, the identity mechanism named precisely and its
  compatibility with the identity law argued.
- Amendments to §1–§7 where the draft below got it wrong.
- The R6 consent scope, sized, regardless of option.
- The one-sentence human decision that remains.

Explicitly not the deliverable: code, migrations, or edits to `packages/*`.

---

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

> **Amended — §8.9 (a).** True of the *scope grammar*, and misleading about
> the cost. The FILTER it would compile to already exists and already binds:
> `{ in: [path, { $scope: key }] }` → `col = ANY($n)`
> ([operators.ts:189](../../packages/vex/src/adapters/postgres/operators.ts#L189)).
> The read half of B is this one line changing shape — no new compile branch.

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

> **Amended — §8.9 (b). A is dead, and it was never the cheap one.**
> "No library change" hid the real price: `bookings`, `enrolments`,
> `subscriptions`, `passes` and `purchases` carry no `household_id`, so the
> rule `match household_id to householdId` needs the column denormalised onto
> eight tables and held true by triggers. That is the largest schema change on
> the whole option list, wearing the smallest ask. R7 kills it independently.

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

> **Amended — §8.9 (c).** Right about reads and wrong about writes. Reads are
> smaller than claimed (no compile branch at all — see (a) above). Writes are
> larger: on INSERT a `match` rule is **pinned into the values**
> ([engine.ts:193](../../packages/vex/src/mutations/engine.ts#L193)), and a set
> cannot be pinned. Making that work needs a new rule kind, an
> `INSERT … SELECT … WHERE` shape, and a refusal path that does not exist —
> today a failed guard yields zero rows and a `200 {result: []}`, not
> `scope_denied`. §8.6 declines to build that half at all.

### Option C — loosen the reach, guard in each entry *(rejected)*

Drop the person clamp for members and have every member-facing entry carry
its own `exists` into `guardianships`. Expressible today, no changes anywhere
— and **wrong**: it moves enforcement from the engine into the entries, so a
single entry that forgets the predicate exposes the whole studio. It fails
open. This codebase's entire posture is that the boundary is engine-side; do
not trade that for convenience.

> **Superseded by Part R.** This section's A-or-B framing was too narrow —
> option D (Part R.1) never appears here, and choosing between reach and
> identity on taste is exactly what the research mandate exists to prevent.
> The recommendation lands per R.4; if it lands on B, the vex change is asked
> for explicitly and in isolation — one commit, its own tests in
> `packages/vex/test/scope`, before any Lyra work.

---

## 4. What the reach touches

> **Amended — §8.9 (d). This section's premise is wrong, and it is the one
> that most changes the work.** Reach is a property of the rung *by default*,
> and an entry overrides it: `OkCacheEntry.reach` is honoured on reads
> ([handler.ts:374](../../packages/vex/src/handler.ts#L374)) and on writes
> ([handler.ts:324](../../packages/vex/src/handler.ts#L324)), recompiling the
> same grants at the named profile. `me/bookings` already carries
> `reach: 'personal'` ([me.entries.ts:84](../../apps/lab/lyra/src/app/vex/me.entries.ts#L84)).
> So step 1 below — flipping the `member` rung — **must not be done**. The
> family surface is NEW entries at a new reach, and every existing member
> entry keeps `personal` untouched. See §8.7, commit 3.

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

> **Amended — §8.9 (e). The diagnosis is right; the prescription is refused.**
> "Match against the set" trades a guarantee that holds by *construction* for
> one that holds by *diligence*: an overwrite cannot be forgotten, a check
> can. §8.6 keeps the overwrite by having the subject arrive through a
> `$lookup` on `guardianships`, whose read rules the engine ANDs into the
> subquery ([engine.ts:132](../../packages/vex/src/mutations/engine.ts#L132)) —
> so a non-guardian resolves NULL and the insert dies on `NOT NULL`. The check
> sentence above stands exactly as written and is the first thing to land.

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

> **Amended — §8.9 (f). Superseded wholesale by §8.7.** The order below is
> right in spirit and wrong in two ways: step 1's decision is made (§8.1), and
> step 3 flips the member rung, which §8.9 (d) refuses. §8.7 is the order to
> build from. Steps 2, 4 and 5 survive into it substantially unchanged.

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

---

## 8. The answer (2026-08-15)

*This part is the deliverable Part R.4 asked for. It replaces nothing above;
§8.9 names the four places §1–§7 are wrong, and each of those places carries
an inline marker pointing here.*

### 8.1 The recommendation

**B, split in half — the set-valued reach for READS, and the write subject
pinned by an engine-applied `$lookup` instead of by a set-valued write rule.**

The mandate framed this as *reach versus identity* and asked which layer
reopens the door. The answer is the reach — but the mandate also assumed the
two halves of the reach travel together, and they do not. Reads and writes
fail differently here, so they get different mechanisms:

- **Reads** need the set. There is no honest way around it: a parent must see
  rows whose `person_id` is not theirs, and every alternative that avoids
  teaching the engine "several rows" ends up asking an *entry* to carry the
  predicate, which is option C wearing a better suit.
- **Writes** do not need the set, and must not have it. Today a member's write
  does not *check* `person_id`, it **overwrites** it
  ([engine.ts:193](../../packages/vex/src/mutations/engine.ts#L193)) — "book
  somebody else" is not refused, it is silently rewritten into "book
  yourself". That guarantee holds whether or not anybody thought about it. A
  set-valued write rule trades it for a check, and a check is something a
  future author can forget.

So: the set is granted to reads only, and it is made **structurally
impossible** to grant it to a write (§8.6, item 4). The write subject arrives
instead through a `$lookup` on `guardianships`, whose read rules the engine
ANDs into the subquery
([engine.ts:132](../../packages/vex/src/mutations/engine.ts#L132)) — a
non-guardian resolves NULL and the insert dies on `NOT NULL`. Engine-applied,
unforgeable by an entry, and no new grammar.

**The mandate also conflated two problems and priced them as one:**

- **P1 — a child cannot be represented.** `people.email` is
  `NOT NULL UNIQUE` ([people.ts:9](../../apps/lab/lyra/src/db/schema/people.ts#L9)).
  This is the market blocker, and it needs **no authorization change at all**:
  the desk's default reach deliberately does not stamp `person_id` from the
  caller ([behaviors.ts:41](../../apps/lab/lyra/src/app/vex/behaviors.ts#L41)),
  so the desk can already enrol, book and sell for anybody.
- **P2 — a parent cannot act.** The `personal` clamp
  ([behaviors.ts:13](../../apps/lab/lyra/src/app/vex/behaviors.ts#L13)). This is
  the part that touches `packages/*`.

They are separable, and separating them is the whole de-risking move: P1 ships
first, alone, and a studio can run a kids' class the day it lands.

### 8.2 Six things the code says that the mandate did not

Every one of these moved the answer. They are the part of this document worth
keeping after the feature is built.

**(1) Reach is per-ENTRY, not only per-rung.** `OkCacheEntry.reach` is
honoured on reads ([handler.ts:374](../../packages/vex/src/handler.ts#L374))
and on writes ([handler.ts:324](../../packages/vex/src/handler.ts#L324)),
recompiling the same grants at the named profile via
`resolvePolicyAtReachForRoles`
([principal.ts:103](../../packages/moss/src/principal.ts#L103)). §4's premise
is wrong, and the consequence is large: the family surface is **additive**,
and §7's regression guard ("a member with no children sees exactly what they
saw before") stops being a test you hope passes and becomes a structural fact.

**(2) The set-valued read already compiles.**
`{ in: [path, { $scope: key }] }` → `col = ANY($n)`
([operators.ts:189](../../packages/vex/src/adapters/postgres/operators.ts#L189)).
An absent or empty set binds NULL / `{}` and matches nothing —
`resolveParams` pushes `scope[key]` verbatim
([context.ts:47](../../packages/vex/src/utils/context.ts#L47)), so fail-closed
comes free from SQL rather than from a guard somebody has to write.

**(3) The set-valued WRITE is not one branch — §3's cost claim is refuted.**
On INSERT a `match` rule is pinned into the values
([engine.ts:193](../../packages/vex/src/mutations/engine.ts#L193)); a set
cannot be pinned. It would need a new rule kind, an `INSERT … SELECT … WHERE`
shape, and a refusal path — a failed guard currently yields zero rows and a
`200 {result: []}`, not `scope_denied`. §8.6 declines to build it.

**(4) Adding a new profile NAME is fail-OPEN, per table.**
`behaviorFor` resolves `entry[profile] ?? entry['default']`
([grants.ts:76](../../packages/vex/src/scope/grants.ts#L76)). The fail-closed
sentence in that file covers only tables with **no** default — and every
member-facing table here has `default: tenantWrite`. Declare `household` on
`bookings`, forget it on `passes`, and a household-reached read of passes
returns every pass at the studio. Ten tables, forever. **This is the single
strongest argument against B and it is nowhere in the mandate.** It is the
reason §8.7 commit 3 carries a coverage check as a non-negotiable, not a
nicety.

**(5) Option D does NOT need a second identity door — R2's own kill-shot
misses.** `identityFor` already parses two synthetic principal shapes
([identity.ts:46](../../apps/lab/lyra/src/server/identity.ts#L46)), and
`composeScope` spreads the record's scope OVER `userId`
([server.ts:285](../../packages/moss/src/server.ts#L285)), so a record can
lawfully redefine who the caller is. A guardianship check rides `read()` as
the `identity` role — the `identity/installed` precedent exactly
([identity.entries.ts:186](../../apps/lab/lyra/src/app/vex/identity.entries.ts#L186)).
**The licensed SQL count stays one.** D survives R2 cleanly. It is rejected on
product grounds instead (§8.5), which is a better reason and not the one the
mandate expected.

**(6) The write-subject problem is already solvable, with no vex change.** A
`$lookup` in a mutation's values is scoped by the **read** rules of the
looked-up table ([engine.ts:132](../../packages/vex/src/mutations/engine.ts#L132)).
This does **not** generalise to reads — an entry that forgets the join gets
the studio, which is C in disguise — and that asymmetry is exactly why §8.1
splits reads from writes.

Two smaller ones, both answering R5:

- **`mintToken` already refuses a child, by SQL semantics.**
  `credential/principal-by-email` filters `people.email = $1`
  ([machinery.entries.ts:34](../../apps/lab/lyra/src/app/vex/machinery.entries.ts#L34))
  and NULL never equals. R5 needs an **assertion**, not a mechanism. It
  requires NULL and forbids `''` — two empty strings collide under UNIQUE.
- **The mail hole fails loudly, not silently.** `to_address` is
  `NOT NULL` ([mail.ts:8](../../apps/lab/lyra/src/db/schema/mail.ts#L8)), so a
  selected child throws rather than mailing `''`. Still a defect; see §8.8.

### 8.3 The questions the argument skipped

*§8.1 was written as an argument, and an argument stops when it is convincing.
Three of R.2's questions were not answered by it, and one of them hides a
hazard. They are answered here rather than left to be rediscovered.*

**R2's last sub-question — is "guardian of Emma" a ROLE? No, and the reason
is a live hazard.** The mandate asked whether the multirole machinery already
handles this, since policies compile per role and merge
([grants.ts:151](../../packages/vex/src/scope/grants.ts#L151)). It does not,
and reaching for it would be a subtle mistake:

> `mergeScopePolicies` keeps, per entity and phase, the rule set with the
> **fewest matches** — and on a tie the first policy in the array wins
> ([grants.ts:167](../../packages/vex/src/scope/grants.ts#L167)). A `household`
> read rule and a `personal` read rule both carry **two** matches
> (`person_id`, `studio_id`). So a principal wearing both `member` and a
> hypothetical `guardian` role would get whichever reach happened to come
> first out of the identity prism's `roles` array
> ([identity.entries.ts:85](../../apps/lab/lyra/src/app/vex/identity.entries.ts#L85)).

That is order-dependence in an authorization decision, which is the one place
it may not live. **The reach belongs on the ENTRY, not on a new role** — and
that is why §8.7's commit 3 adds household-reached entries rather than a
`guardian` rung. The merge rule is correct for what it was built for (an
instructor who also trains needs the wider of two genuinely different reaches);
it is simply the wrong instrument for two reaches of the *same* width.

**R7's corollary — do two guardians see each other? No.** `householdIds`
resolves to `[self, ...children]` and nothing else, so guardian A reads the
children's rows and never guardian B's subscription, notes or payment
arrangement. Two guardians are two independent sets that happen to overlap on
the child. This falls out of the design rather than being enforced by
anything extra, which is the good kind of answer — but it is a product fact
somebody will ask for, and it should be stated before they do.

**Criterion 6 — migration cost now vs later — is smaller than R.3 assumed.**
The criterion reads "every member-facing entry written before this lands is
written against a reach that cannot express a family," which argued for
urgency. Finding (1) mostly dissolves it: existing entries keep
`reach: 'personal'` and are not revisited, because the family surface is new
entries at a new reach. What remains true is narrower and worth keeping: every
member-facing table that gains a `personal` variant from here on must gain a
`household` one in the same commit, or finding (4) turns it into a studio-wide
read. That is what the coverage check in §8.7 is for, and it is the whole of
the migration cost.

**The other five criteria get no separate treatment**, deliberately. Fail-closed
enforcement, write-subject safety, blast radius, the identity law and R7/R4 are
each argued where they bite — §8.1, §8.2 and §8.5 — and restating them in
R.3's order would be ceremony rather than evidence.

### 8.4 R5 — a person with no email, through every path that assumes one

*The complete sweep the mandate asked for. Commit 1 works from this list.*

| Path | Verdict |
|---|---|
| **The licensed identity SQL** | **Nothing to do.** It keys on `p.id` and never mentions email ([identity.ts:30](../../apps/lab/lyra/src/server/identity.ts#L30)). R5 asked; this is the answer. |
| **`mintToken` / `principalByEmail`** | **Refuses by construction.** `people.email = $1` ([machinery.entries.ts:34](../../apps/lab/lyra/src/app/vex/machinery.entries.ts#L34)); NULL never equals, and the caller already rejects `''` ([links.ts:53](../../apps/lab/lyra/src/server/links.ts#L53)). Needs an **assertion**, not a mechanism. |
| **The login picker** | **A real defect.** `email: String(row.email ?? '')` ([dev-login.ts:28](../../apps/lab/lyra/src/server/dev-login.ts#L28), [:34](../../apps/lab/lyra/src/server/dev-login.ts#L34)) — a child would appear in the dev roster with a blank address and clicking them dies at `principalByEmail`. Dev-only. Fix: drop null-email rows from the roster, because a person you cannot be does not belong in a picker of people to be. |
| **The seed** | **Two edits.** `Person` types `email` as `string` ([seed/people.ts:6](../../apps/lab/lyra/src/db/seed/people.ts#L6)) and the insert names it in a fixed column tuple ([:53](../../apps/lab/lyra/src/db/seed/people.ts#L53)). Both widen to `string \| null` to seed the family §6 asks for. |
| **The UNIQUE constraint** | **Holds unchanged.** Postgres permits many NULLs in a unique column and exactly one `''`. This is the whole reason the column must be NULL and never the empty string. |
| **`people/enroll`** | **Unusable for a child** — it keys on email in both statements ([intake.entries.ts:62](../../apps/lab/lyra/src/app/vex/intake.entries.ts#L62), [:68](../../apps/lab/lyra/src/app/vex/intake.entries.ts#L68)). Hence the separate entry in §8.7. |
| **The automation effects** | **A real defect** — see §8.8, which owns it. |
| **The transition out** | **Nothing breaks when email arrives late.** Setting it is an ordinary desk update, and the row becomes an ordinary sign-in identity that moment. Guardianship ends by hand in v1; see §8.11. |

### 8.5 Why not the others

**A — dead twice.** R7 kills it: a scalar cannot put one child in two
households, and separated parents are common enough that any model which
cannot express them is rebuilt within a year. Independently, §8.9 (b): its
"no library change" advertised price hides a denormalised authorization key on
eight tables.

**C — stays rejected**, and note the tempting variant: "just join
`guardianships` in the entry" is this option, not a third way. The join would
be authored by the entry, so an entry that omits it reads the studio. Engine
enforcement means the entry cannot express the mistake.

**D — survives the identity law (§8.2 finding 5) and loses on R4.** A parent
with two children at a BJJ school on Saturday morning wants **one screen**.
Under D that is N sessions: shells are keyed per principal
([shells.ts:335](../../packages/moss/src/shells.ts#L335)), so a switch is a
full shell rebuild, and a combined view is exactly the special-case aggregate
read D exists to avoid. Two further costs: no table carries an actor column
([bookings.ts](../../apps/lab/lyra/src/db/schema/bookings.ts)), so every row
would read as though a seven-year-old wrote it; and the switch itself is a
token-exchange door, which is small code in the highest-stakes place in the
app.

**On R4 specifically** — the industry split is real and it is regulatory, not
architectural. Products with statutory per-record isolation (health portals,
where the term of art is *proxy access*) took the switcher and expire it at an
age threshold. Products without it (class booking, youth sports, schools) took
the combined view, because a parent wants one screen. A dance school has no
per-record isolation requirement, so D would pay the switcher's cost and
collect none of its benefit. **This is a general-pattern argument, not a
verified survey** — R4's hour on Gymdesk, Mindbody and Eversports is still
unspent, and §8.11 says what it would change.

**E — reach compiled as a correlated subquery** (`person_id IN (SELECT …
FROM guardianships …)`) was considered and dropped. It buys freshness — a
revoked guardianship bites on the next query rather than at the next identity
revalidation — for a strictly larger vex change and a join on every member
read. The staleness it fixes is already bounded by `sessionRevalidateMs`
(60 s, [runtime.ts:29](../../packages/moss/src/runtime.ts#L29)), the same
window every other identity fact carries, and `invalidate(principal)` exists
for the immediate case.

### 8.6 The ask — one commit in `packages/vex`

Smaller than §3 assumed, because the filter already exists (§8.2 finding 2).

1. **`scope/scope.types.ts`** — `ScopeMatch` gains a set-valued form,
   `{ match: string; in: string }`, beside `{ match: string; to: string }`.
2. **`scope/apply.ts:99`** — emit `{ in: [path, { $scope: rule.in }] }` for
   that form. Reads.
3. **`mutations/engine.ts:231` and `:241`** — the same, for the UPDATE and
   DELETE `where` (a parent cancelling a child's booking needs it).
4. **`mutations/engine.ts:193` — THROW if a set-valued rule reaches the
   INSERT pin.** This is the load-bearing line. It makes a set-valued write
   stamp unauthorable, which is what keeps a member write an overwrite rather
   than a check — the property §8.1 refuses to trade.

**The sketch, end to end.** The grammar:

```ts
// scope/scope.types.ts — one union member, nothing else moves.
export type ScopeMatch =
  | { match: string; to: string }   // unchanged: the scalar, `col = $n`
  | { match: string; in: string };  // new: the set,    `col = ANY($n)`
```

The read placement — the whole of the change at
[apply.ts:99](../../packages/vex/src/scope/apply.ts#L99):

```ts
const original: Filter = 'in' in match
  ? { in: [path, { $scope: match.in }] }   // → col = ANY($n)   (operators.ts:189)
  : { eq: [path, { $scope: match.to }] };  // → col = $n        (unchanged)
```

The compile and the binding need **no edit at all**: `{ in: [path, { $scope }] }`
already emits `= ANY($n)` and pushes a `{ kind: 'scope', type: 'string[]' }`
slot ([operators.ts:189](../../packages/vex/src/adapters/postgres/operators.ts#L189)),
which `resolveParams` binds as `scope[key]` verbatim
([context.ts:47](../../packages/vex/src/utils/context.ts#L47)).

The fail-closed path is therefore SQL's, not ours: an **absent** scope value
binds NULL and `col = ANY(NULL)` is NULL — not true — so the row is dropped; an
**empty** set binds `{}` and `col = ANY('{}')` is false. Neither needs a guard,
and neither can be forgotten. *(This is worth one test each precisely because it
is inherited rather than written.)*

The write refusal, at
[engine.ts:193](../../packages/vex/src/mutations/engine.ts#L193) — the load-bearing
edit, because it is what makes §8.1's split enforceable rather than merely
intended:

```ts
for (const r of gate.rules) {
  if ('match' in r && 'in' in r) {
    throw new VexScopeError(table, `Scope rule for "${table}" is set-valued ("${r.match}" in "${r.in}") and cannot pin an INSERT. A write's subject must be a single value.`);
  }
  values = { ...values, ['set' in r ? r.set : r.match]: { $scope: r.to } };
}
```

**The test surface, measured.** `packages/vex/test/scope` is 700 lines over
three files — `scope.test.ts` (31 cases), `grants.test.ts` (18),
`scope-placement.test.ts` (11). This adds roughly six to ten: the set matches
its members; an absent value matches nothing; an empty set matches nothing; the
set rule survives placement into a LEFT join's `ON` (the bug
[apply.ts:130](../../packages/vex/src/scope/apply.ts#L130) exists to prevent, and
the one place a new filter shape could regress silently); UPDATE and DELETE
`where`; and the INSERT refusal throwing.

**One commit, its own tests, approved and landed before any Lyra work.** No new
compile branch, no adapter change, no change to any existing rule shape, and no
behavior change for any rule written today.

### 8.7 The build, in three commits

#### Commit 1 — the child exists *(no approval needed; unblocked today)*

No authorization change anywhere.

- `people.email` → nullable. **NULL, never `''`.**
- `people.born_on DATE` nullable. The one addition beyond §1: kids' classes
  are age-graded, and it touches the same table.
- `guardianships` exactly as §1 states it — per studio, directional,
  `can_book`/`can_pay` shipping `true` with no UI.
- **A new `people/enroll-child` entry.** It cannot reuse `people/enroll`,
  which keys on email in both statements
  ([intake.entries.ts:62](../../apps/lab/lyra/src/app/vex/intake.entries.ts#L62),
  [:68](../../apps/lab/lyra/src/app/vex/intake.entries.ts#L68)); with a NULL
  address that `$lookup` returns NULL and the anchor insert dies on `NOT NULL`.
- Desk: a Family section on a person's record, and "Add a child" — name, date
  of birth, no email.
- Charter: `desk` gains `guardianships.read` and `.write.insert`. Behaviors:
  `guardianships: tenantWrite`.
- **The seed widens** — `Person.email` to `string | null`
  ([seed/people.ts:6](../../apps/lab/lyra/src/db/seed/people.ts#L6)) — and seeds
  the family §6 asks for: a parent with two children at Lumen.
- **The dev login picker drops null-email rows**
  ([dev-login.ts:28](../../apps/lab/lyra/src/server/dev-login.ts#L28)) — a person
  you cannot be does not belong in a picker of people to be. Dev-only, and the
  smallest item here, but it is the one §8.4 found by looking rather than by
  reasoning.
- **R6 rides here** — see §8.8.

Checks: a child appears on the roll; derives standing normally; **cannot be
logged in as** (assert `principalByEmail` answers null, per §8.2); no
automation can select one into a send.

#### Commit 2 — the vex change

§8.6, alone, with its own tests. Blocks commit 3 and nothing else.

#### Commit 3 — the reach

- **`householdIds`, resolved once per session.** A new `identity/guarded`
  entry at `reach: 'identity'`, reading `guardianships` pinned to
  `guardian_person_id = userId` and `studio_id`. The `identity` charter role
  gains `guardianships.read`; `identityFor` composes
  `[principal, ...children]` — one more `read()` call, the `identity/installed`
  precedent exactly. **No new licensed SQL**, which keeps the identity law
  intact rather than merely unbroken.
- **A `household` profile** on `bookings`, `enrolments`, `subscriptions`,
  `passes`, `purchases`, `studio_people`, `subscription_notices` and
  `subscription_pauses`: reads pinned by studio plus
  `{ match: 'person_id', in: 'householdIds' }`; writes carry the studio stamp
  and **no person stamp**.
- **New household-reached entries** for the family surface. Every existing
  `personal` entry is untouched — that is finding (1) doing the work.
- **Writes take the subject through a `$lookup` on `guardianships`**, per
  §8.1. The subject is engine-pinned, never entry-validated.
- `member` gains `guardianships.read`, so the switcher can list the children.
- **A coverage check in `dev/`: every table declaring `personal` also declares
  `household`.** Non-negotiable — finding (4) is why. It belongs beside
  `scoping-check.ts`, which is already the file that reads reach off a
  compiled policy.

The three checks, written before the code: a parent books their child and the
booking's `person_id` is the **child's**; a parent reads **nothing** of an
unrelated member; the member and me-surface checks pass **unchanged**.

### 8.8 R6 — consent, minors, and whose mailbox *(option-independent)*

**ROUTING: BUILT. CONSENT: OPEN, and deliberately so.**

**The defect, as it was.** The automation selections read `people.email`
straight into the mail effect and `outbox.to_address` is `NOT NULL`
([mail.ts:8](../../apps/lab/lyra/src/db/schema/mail.ts#L8)) — so a child
selected by any moment did not mail the wrong person, it **threw and took the
whole run down with it**.

**What landed.** `studio_people.mail_to` — where mail for this person at this
studio goes: their own address, or their guardian's when they have none.
Recomputed by trigger on the same terms as the counters beside it, and every
mail selection now reads it and tests `isNotNull` on it rather than on
`people.email`.

**Why a mirror rather than a join, since the first instinct is that this
belongs in the selection.** The derivation needs `people` TWICE in one query —
the subject and the guardian — and the read grammar cannot express it: entity
sources are keyed by name so `['people','people']` collides, the `as` form is
subquery-only, a subquery source compiles to `CROSS JOIN` (so correlating it
is an INNER join and every adult without a guardian would vanish), and views
are invisible to introspection (`table_type = 'BASE TABLE'`). Five selections
would each have had to express it, and the one that got it wrong would have
mailed a guardian's address to the wrong family. So the complexity sits in one
plpgsql function, and the selections read a column.

**It is a fact, not a conclusion**, so the paid_until doctrine holds: an
address is the same class as `pass_live_until`'s horizon date. What is still
decided at read is whether to write to somebody at all.

**Two triggers, because it changes from both ends** — a guardianship landing or
leaving moves the child, and a guardian's own address changing moves every
child of theirs. `families-check` asserts both, plus that a child whose
guardian has no address is *unreachable* rather than a crash.

**WHAT IS STILL OPEN, and needs a human:**

1. **Whose consent governs when the subject is a child.** `marketing_ok` sits
   on the child's own anchor and ships `false`, so a child is in no marketing
   selection today. That is the safe default and it is not an answer: under
   GDPR Art. 8 the consent is the guardian's to give (14 in AT, 16 in DE), and
   nothing yet lets them give it *for* the child, nor decides whether the
   guardian's own `marketing_ok` should stand in.
2. **Which guardian, when there are two.** The resync picks the oldest
   guardianship, ties broken by id — stated in SQL so it is deterministic, and
   flagged in the function's own comment as **a holding position, not an
   answer**. Both parents? The one who pays? The one who enrolled them?
3. **The unsubscribe door** still acts on the anchor of the RECIPIENT. When a
   guardian unsubscribes from mail sent about their child, that should act on
   the child's anchor, not theirs — otherwise a parent silently opts
   themselves out of their own studio's mail. Unbuilt, and the smallest of the
   three.

### 8.9 Amendments to §1–§7

Each is marked inline at the place it is wrong.

| | Where | What is wrong |
|---|---|---|
| (a) | §3, "The constraint, verified" | True of the scope grammar; misleading about cost. The filter already compiles (§8.2 finding 2). |
| (b) | §3, Option A | "No library change" hides a denormalised key on eight tables. A is dead on R7 regardless. |
| (c) | §3, Option B | Right about reads, wrong about writes. Reads are cheaper than claimed; writes are much dearer (§8.2 finding 3). |
| (d) | §4, opening premise | **Reach is per-entry too.** Do not flip the `member` rung. This is the amendment that most changes the work. |
| (e) | §4, "Writes need care" | Diagnosis right, prescription refused — "match against the set" trades construction for diligence. The check sentence stands. |
| (f) | §6, build order | Superseded wholesale by §8.7. Steps 2, 4 and 5 survive substantially unchanged. |

§1, §2, §5 and §7 stand as written. §5's switcher sentence — *"the reach is
what makes it permitted, and the switcher is only what makes it convenient.
Never the other way round"* — is exactly right and is worth re-reading before
commit 3.

### 8.10 The one human decision

> **Approve §8.6 — a set-valued read match in vex plus an explicit refusal on
> the insert pin, as one commit with its own tests in
> `packages/vex/test/scope`, landed before any Lyra work.**

Nothing else in this plan needs a human. If the answer is no, **commit 1 still
ships** and families work from the desk; only the parent's own surface waits.

### 8.11 What remains open

- **R4 is DECLINED, not deferred**, and this is a disagreement with the mandate
  rather than a gap in the work. R.2 budgeted an hour on what Gymdesk, Mindbody
  and Eversports show a parent. That hour cannot change the option: A and D were
  each killed on other evidence (R7; §8.5), and every surviving shape renders off
  **one household read**, so the survey would decide the *layout of a screen* —
  combined calendar versus per-child tabs — three commits from now. Research
  that lands three commits early is research that goes stale, and this
  particular question is better answered with the screen and real seeded data in
  front of you than from a competitor's marketing site. The general pattern
  (§8.5) is enough to choose the reach, which is all this document had to do.
  **If it is revisited, revisit it while building commit 3's screens, not
  before.**
- **R8 confirmed, one paragraph, as asked.** Family pricing — one offering
  covering several people — is untouched by this. `guardianships` names a
  relationship between two people and says nothing about who an offering
  covers; `subscriptions.person_id` stays singular, and the day somebody wants
  one subscription with N beneficiaries, the beneficiary set is a new table
  pointing at the subscription. Nothing here makes that harder, and `paid_via`
  already decouples the payer from the holder, which is the half most designs
  get wrong.
- **The age transition** (a child gains an address and a login; guardianship
  ends) is permitted by the model and automated by nothing. Deliberate for v1:
  the columns are there, the rule is a decision nobody has made yet, and
  health portals — the only industry with a hard answer — get theirs from
  statute rather than from judgement.
