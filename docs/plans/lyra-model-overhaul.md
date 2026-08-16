# MODEL_OVERHAUL.md

**Status: BUILT — all ten steps of Part 11, 2026-08-12.** The suite grew to 33
checks (`model-check` is the new one: concurrent entitlements, the drop-in
attending, manual money, and the live socket push) and every gate below holds,
including Tom Vogel's full arc: prospect → chooses a plan himself (D2 hard
confirm) → manual billing → pauses himself (D4: the term moved out by exactly
the days frozen) → gives notice himself (leaves when the extended commitment
ends). Decisions D2/D3/D4/D5 were resolved as recommended (D4: pause extends
the term; D5: courses kept their own price and `enrolments` gained
`paid_via`). Two things the plan did not name, found by building: vex grew
**EXISTS inside computed CASE** (the standing derivation) and a **`probe`
grant verb** (the desk derives standing without holding the revenue read);
and cross-studio offering references are refused by a composite FK the day
`subscriptions/start` existed to abuse them.

**Purpose:** a complete, handoff-ready plan to remodel the core domain of lyra —
**people, what they hold, how they pay, and how the studio is told things** —
before any more feature work lands on top of a model we have agreed is not
merely flawed but *wrong*.

**Written for an agent starting cold.** Everything is cited by table / function
/ file *name* rather than line number, because the lyra schema is uncommitted
and moving — line numbers will drift; names will not. Where a decision is the
human's to make, it says so.

**Read first:** `apps/lab/lyra/PLAN.md` (the original product decisions),
`apps/lab/lyra/BUILD_STRIPE.md` (payments as an integration — already built,
Phases 1–12 complete), and this document's **Part 1**, which is the argument for
why the remodel is necessary at all.

**Status of the payments work this builds on:** the Stripe integration is built
and live end-to-end (onboarding via hosted Account Links, checkout with lazy
content-addressed Prices, webhook → `subscriptions/assert`, dunning → the
follow-up list, a ledger mirror). It already assumes the model this document
replaces. **The remodel must keep the payment loop working** — see Part 9.

---

## Part 0 — the one-paragraph version

A human near a studio is forced by the schema into exactly one of
`member | lead | staff | connection`, and that is the root mistake. It makes
"enquiries" a *membership that isn't one*, it has nowhere to put a drop-in
visitor who pays once and is not a member, and it literally cannot represent the
milkman. The fix is to invert it: **a person is just a person; what varies is
their relationships to a studio — plural, concurrent, typed.** On top of that,
studios sell more than recurring plans (drop-ins, class passes, courses), and
**access must be decoupled from payment** so a studio with no Stripe can still
put someone on a plan and settle the money offline. This document specifies that
model in full, the migration, and Tom Vogel's whole lifecycle as the acceptance
test.

---

## Part 1 — why the current model is wrong (the evidence)

Not opinion — the schema says it. Current tables: `people`, `memberships`,
`connections`, `staff`, `plans`, `subscriptions`, `subscription_notices`,
`courses`, `enrolments`, plus the schedule/booking tables.

### 1.1 A person is forced to *be* a category

`memberships` has `status TEXT CHECK (status IN ('enquired','active','paused','cancelled'))`
and `UNIQUE (studio_id, person_id)`. So:

- **A lead is a membership.** `status = 'enquired'` is a membership row for
  somebody who is not a member. `standing.ts` then computes `enquiry` from it.
  The word "enquiries" the human hates is this lie surfacing in the UI.
- **One slot per person per studio.** The `UNIQUE` means a human can hold exactly
  one membership at a studio — they cannot be simultaneously "a lapsed member"
  and "a drop-in this week", or "a member" and "a parent paying for a child".

### 1.2 The milkman cannot exist

`loadDirectory` in `server/users.ts` builds every principal from
`LEFT JOIN staff sf … LEFT JOIN memberships mb … WHERE COALESCE(sf.studio_id, mb.studio_id) IS NOT NULL`.
A person whose only tie to a studio is a `connections` row (kind `supplier` /
`professional` / `guardian` / `guest`) resolves to **no studio and no
principal**. The supplier the studio deals with every fortnight is invisible to
the system unless somebody fraudulently gives him a membership. `connections`
exists but is a dead-end table — nothing derives identity or standing from it.

### 1.3 Drop-ins and passes have nowhere to live

The only commercial relationship the schema models is a **recurring** `plan` →
`subscription`. The person who pays €18, takes one class, and is *not a member*
— the backbone of a yoga or dance studio — has no representation. Neither does a
10-class pass. `plans` is recurring-only by construction (`interval IN
('month','year')`).

### 1.4 Access is welded to payment, and payment is welded to Stripe

A subscription's standing is written by `subscriptions/assert` (built for the
Stripe integration) and by the desk flipping `status`. But there is **no desk-side way
to put someone on a plan and record that they paid offline**. The desk can only
mark a membership "active" with no plan attached — which is exactly why Tom
Vogel "just *has* a membership" with no plan and no money attached. A studio
without Stripe cannot sell a plan through the app at all.

### 1.5 The roll conflates "our members" with "humans we deal with"

Every roll/desk read is `from: ['memberships', 'people', …]`. The People area
*is* the members table. There is no single place that is "everyone this studio
deals with" — leads, drop-ins, members, suppliers, guardians, staff — lensed by
relationship.

**Conclusion:** the entity that is stable is the *person*. The entities that
vary are their *relationships*. The current schema models the reverse, and every
symptom above follows from that one inversion.

---

## Part 2 — the target model

One person, many concurrent typed relationships to a studio. Everything the
studio needs to know about a human is **derived** from the set of relationships
they currently hold — never stored as "what they are".

```
person ──────────────┐   (a human; thin; identity only)
                      │
        studio_people │   (this human is KNOWN to this studio: source, notes,
                      │    first_seen — the anchor a prospect and the milkman
                      │    both need, replacing the "enquired membership")
                      │
   ┌──────────────────┼───────────────────────────────────────────┐
   │ relationships that hang off (studio_id, person_id):           │
   │                                                               │
   │  subscription   recurring membership (exists; keep, extend)   │
   │  pass           N class-credits, incl. single-use drop-in     │
   │  enrolment      a seat in a bounded course (exists; keep)     │
   │  staff          works / teaches here (exists; keep)           │
   │  contact tag    supplier / guardian / professional / guest    │
   │                 (the milkman) — a TAG, not a person-category   │
   └───────────────────────────────────────────────────────────────┘
```

### 2.1 `studio_people` — the anchor (new)

The fact that a human is in a studio's orbit, independent of any single
engagement. Carries what belongs to the *relationship*, not to a plan:

```
studio_people (
  id, studio_id, person_id,
  source        walk-in | website | referral | social | event | other
  first_seen_on date,
  notes         text,
  UNIQUE (studio_id, person_id)
)
```

- **A prospect** = a `studio_people` row with no active entitlement. "Enquiry"
  the word dies; the *relationship* (interested, no access yet) is derived.
- **The milkman** = a `studio_people` row with a `supplier` contact tag and no
  attendance entitlement. He now resolves as somebody the studio deals with.
- `loadDirectory` builds principals from `studio_people` (⋃ `staff`), not from
  `memberships` — which is what lets a non-member resolve at all.

### 2.2 `offerings` — what a studio sells (generalises `plans`)

Studios sell more than recurring plans, and **each studio enables the subset it
sells**. One table, a `kind`:

```
offerings (
  id, studio_id, name, kind, price_cents, currency, active,
  -- kind = 'recurring' (a membership plan)
  interval             month | year
  minimum_term_months  integer
  notice_days          integer
  class_allowance      integer | null (unlimited)
  -- kind = 'pass'  (a credit pack; credits = 1 IS a drop-in)
  credits              integer
  valid_days           integer | null (never expires)
  -- kind = 'course' — see note
)
```

- `plans` → `offerings WHERE kind = 'recurring'`. Same fields, renamed table.
- **Drop-in = a pass with `credits = 1`.** No separate table; a drop-in is the
  degenerate pass, which keeps one code path for "buy classes".
- **Courses**: `courses` is already a *dated, bounded* thing (starts_on/ends_on/
  capacity) and should stay its own table — but a course *offering* (its price
  and whether it needs membership) can be an `offerings` row of `kind='course'`
  pointing at a `course`, OR the course keeps its own price. **Decision D5.**

  > **D5 was answered "keeps its own price", and reversed on 2026-08-16.** The
  > table stays; `courses.price_cents` and `courses.currency` are gone and
  > `courses.offering_id` (NOT NULL, UNIQUE) names an `offerings` row of
  > `kind='course'`. What changed is not the argument but the requirement: a
  > **store add-on** publishes a catalogue, and a catalogue split across two
  > tables is one every publisher, checkout and integration has to know is
  > split — with a voucher, a workshop and a retail item each queued to become a
  > third. The owner-facing half was already broken by the split: blocks were
  > priced under Schedule, plans under Offers, and *editing a block was
  > reachable from no screen at all.* Both are authored on Offers now. Gate:
  > `course-check` asserts the block's price is a catalogue row; `plans-check`
  > asserts a block opens and reprices from the Offers screen.
- Retiring an offering keeps everyone already on it — the existing plan-retire
  rule, generalised. `subscriptions`/`passes` reference the offering they were
  sold on, never "the current price list".

### 2.3 Entitlements — what a person holds

An **entitlement** is a person's active right to attend, of a `kind`:

- **subscription** (recurring) — keep the table; it already has term / notice /
  `committed_until` / `notice_given_on` / `paid_until` / currency and the
  triggers. Add `paid_via` (Part 2.4) and repoint `plan_id → offering_id`.
- **pass** (new) — credits that decrement on booking/check-in:
  ```
  passes (
    id, studio_id, person_id, offering_id,
    credits_total, credits_used, purchased_on, expires_on,
    paid_via, status  active | used_up | expired | refunded
  )
  ```
  A booking against a pass decrements `credits_used`; `credits_used =
  credits_total` → `used_up`. Drop-in is `credits_total = 1`.
- **enrolment** (keep) — a seat in a course.

A person can hold **several at once** (a member who also buys their partner a
drop-in; a lapsed member on a pass). The `UNIQUE (studio_id, person_id)` on
`memberships` is exactly what forbids that today and must go.

### 2.4 Payment decoupled from access — the decisive change

**Access and payment are different facts with different writers.** S4/S5 already
said so: *"cash at the desk and a second provider are then the same mutation
with a different caller."* `subscriptions/assert` is the integration's writer.
This adds the desk's.

Every entitlement carries **how it is paid**:

```
paid_via  stripe | manual | comp | free
```

- **`manual`** — the studio bills offline (SEPA the member set up at the bank,
  cash, invoice). The desk records the standing: "active, paid until X", or just
  "active, I'll chase the money". **No Stripe required, and this is the PRIMARY
  path** — most small studios start here.
- **`stripe`** — the member self-serves checkout; webhooks write the standing.
- **`comp` / `free`** — the owner's kid, a staff perk. Access, no money.

The subscription's `paid_until` / `status` is the single truth, written by
**whichever caller is responsible** — Stripe over the webhook (`ik_` key,
already built) or the desk over its own charter grant. Neither is privileged.

**Manual payment depth — Decision D3.** Two levels:
1. *Standing only* — the desk sets "active, paid until X". Simplest; unblocks
   everything.
2. *A payment ledger* — a `payments` table recording each manual receipt
   (amount, date, method, who took it), so a studio has a cash record. Real
   feature; more work. **The human decides which for v1.** Recommend (1) now,
   (2) as a follow-on — the Stripe ledger mirror (`stripe_invoices`) is the
   pattern a manual `payments` table would mirror.

### 2.5 Standing is derived, always

There is no stored "what this person is". `standing.ts` today computes
`enquiry | left | paused | trialling | trial-over | active` from
`memberships.status` + a date. Replace it with a computation over the person's
**active relationships**:

```
staff row                              → "staff"
active subscription                    → "member"       (+ paid-up? from paid_until vs today)
unexpired pass with credits left       → "pass holder"
future course enrolment                → "on a course"
contact tag, no attendance entitlement → "supplier" / "guardian" / …
studio_people row, none of the above   → "prospect"
```

Same rule the codebase already lives by (see `standing.ts`'s own comment:
"if turning a job off makes the DATA wrong, it was a rule with a cron attached").
Standing is a view over rows, computed on the studio's own day, never stored.

---

## Part 3 — the People reframe in detail

### 3.1 "Enquiries" dies; "People" is the roll, lensed

The People area becomes **everyone the studio deals with** (`studio_people` ⋈
`people`), with derived standing, filterable:

- **Members** — active subscription
- **Prospects** — known, no active access (was "enquired")
- **Pass holders / drop-ins** — active credits
- **On a course** — enrolled
- **Staff** — teaches/works
- **Contacts** — supplier / guardian / professional / guest (the milkman)
- **Past** — lapsed, left, expired

One list, one query, many lenses. `leads.action.ts` / the "Enquiries" nav item
collapse into a lens of this. `connections` folds in as **contact tags** on
`studio_people` (a person can be a member *and* a guardian — tags, not a
mutually-exclusive `kind`).

### 3.2 Directory / identity

`loadDirectory` (`server/users.ts`) rebuilds from `studio_people` ⋃ `staff`, so
a non-member (prospect, contact) resolves as a principal at their studio. Roles
still come from `staff.role`; "member" as a *role* is replaced by "holds a
member-shaped entitlement" — but note the **charter audience** work (a person's
rung) already keys off `staff.role` and membership; that seam
(`audienceOf`, `rolesOf`) must be re-derived from the new relationships.

### 3.3 Scoping stays engine-side

Every new table (`studio_people`, `passes`, `offerings`, `payments`) is
tenant-scoped in `vex/behaviors.ts` exactly like the rest — `studio_id` stamped
and matched from scope, `person_id` pinned to `userId` on the `personal` reach.
`scope-check` / `scoping-check` extend to cover them. The tenancy story does not
change; it widens.

---

## Part 4 — offerings & entitlements, concretely

- Rename `plans` → `offerings`, add `kind` (default `recurring` so existing rows
  migrate untouched), add pass fields (`credits`, `valid_days`).
- Repoint `subscriptions.plan_id` → `offerings.id` (an offering of kind
  `recurring`). Keep the trigger machinery (`stamp_subscription_terms`,
  `resync_subscription_value`, the currency composite FK, the notice ledger).
- New `passes` table (2.3) with a decrement trigger on booking/check-in.
- Drop `memberships` **as the person-category table**. What it currently carries
  splits:
  - `status/trial_ends_on` → the derived standing + a `trial` on `studio_people`
    or the first subscription.
  - `source/joined_on/notes` → `studio_people`.
  - the "is a member" fact → *having an active subscription*.
- `courses` / `enrolments` stay; optionally get an `offerings` row for pricing
  (D5).

**This is the largest single change and touches the most reads.** Every
`from: ['memberships', …]` in `vex/` (roll, desk, check-in, session, lead,
member, forecast, retention) re-points at `studio_people` + the relevant
entitlement. Budget for it.

---

## Part 5 — payment: manual + Stripe as equal callers

- `subscriptions.paid_via` (+ on `passes`).
- **Desk mutations** (new, on the `desk`/`manager` charter rung):
  - `subscriptions/start` — put a person on a recurring offering, `paid_via`
    chosen (manual/stripe/comp). Stamps term/notice/currency via the existing
    trigger.
  - `subscriptions/record-payment` — manual: set `paid_until`, optionally write
    a `payments` row (D3).
  - `passes/sell` — sell a credit pack / drop-in, `paid_via` chosen.
- **Stripe stays exactly as built** — checkout creates a `stripe` subscription;
  webhooks `assert` standing. The only change: when Stripe is *not* connected,
  the member-facing "Choose a plan" flow routes to a **manual/pending** state
  the desk confirms, instead of to checkout. The setup screen already knows
  `ready` — reuse it to branch the member CTA.

The invariant to preserve and test: **a subscription reaches "active, paid until
X" identically whether Stripe or the desk wrote it** — the integration and the
desk are the same mutation with a different caller (extend `integrations-check`
/ a new `manual-billing-check`).

---

## Part 6 — notifications (decided: build it, push-first)

### 6.1 Rename `follow_ups` → `notifications`

A **notification** is "the studio was told something". A **task** is a
notification that needs action — it has a `due_on` and can be ticked `done`. So
**one table, actionable-ness a property**, not two tables:

```
notifications (
  id, studio_id, person_id (nullable), title, detail, source,
  due_on (nullable), done (bool), seen_at (nullable, new), created_at
)
```

- `due_on` set + `done` → a task ("call Ruben about the failed payment").
- `due_on` null → an FYI ("payment failed").
- `automation/notify` (the fingerprint the Stripe integration and automations already
  use) writes here unchanged — it is already a published interface; the table
  underneath just gets the honest name.

### 6.2 Push over the socket that already exists

moss runs a per-principal websocket (`ws://…/socket`; `shells.ts` revalidates
over it). **A notification insert fans out over it** to the studio's connected
owners → a toast + a bell badge in the chrome, with no navigation. The pull
list (the bell → the archive) is for what was missed. This is *push built on the
transport you already run*, per-principal-scoped already — you build a fan-out,
not a transport.

- `seen_at` distinguishes unread (badge) from read.
- Genuinely urgent ones (final payment failure) also go to `outbox`
  (email/SMS), which already exists, so they reach a closed laptop.
- **Web Push** (browser notifications with the tab closed — service worker,
  VAPID, permission prompt) is a separate, later phase. Not v1.

The integration boundary does not change: an integration still can only `notify` through
the granted fingerprint; moss decides how loud that is.

---

## Part 7 — information architecture

- **Offerings / Pricing leaves "Money".** Money is what you *earned* (reports +
  the Stripe ledger). Offerings are what you *sell* — studio configuration,
  beside class types and the schedule. Move the pricing screen out of
  `hub.money` (see `nav/sections.ts`) into a studio-setup area.
- **People** — the lensed roll (Part 3).
- **Money** — reports + Stripe ledger only.
- **Schedule** — classes & courses (unchanged).
- **Member surface (`me.*`)** — gains a real **CTA dashboard** (Part 8) and the
  self-service actions (subscribe / give notice / pause) as they land.

---

## Part 8 — Tom Vogel: the full lifecycle (the acceptance test)

Tom (`p_tomv` / currently `mb_tomv`, an `enquired` membership at Lumen) is the
canonical self-service subject. **Seed him for it:** a `studio_people` row at
Lumen, source `referral`, a **live trial** (a trial marker a week out) and **no
entitlement** — a fresh human standing exactly at the plan-choice cliff. Every
stage below is an acceptance test for the remodel.

| # | Stage | What Tom does | After remodel |
|---|---|---|---|
| 1 | **Known** | logs in (magic link) | resolves as a principal from `studio_people` — *works because he is no longer forced to be a membership* |
| 2 | **Prospect** | sees his own status | derived "prospect, trial ends in 6 days" — a **CTA dashboard**, not a dead card: "Choose a plan →" |
| 3 | **Choose** | picks an offering | member `subscriptions/start` (self, personal-scoped) **or** desk-approve (D2); terms-confirm because a committed plan is a contract |
| 4 | **Pay** | card, or offline | Stripe connected → checkout (built); not connected → manual/pending the desk confirms (Part 5) |
| 5 | **Attend** | books & trains | already works (`bookings.write`, `enrolments.write`) |
| 5b | **Drop-in path** | (alt) buys a single class | `passes/sell` credits=1 — the milkman/casual path the model could not represent before |
| 6 | **Pause** | freezes | member grant + the **pause-vs-commitment** decision (D4) |
| 7 | **Give notice** | leaves within notice | *machinery already built desk-side* (`subscription_notices`, the trigger, the arithmetic — proven in `plans-check`); member needs **one** grant (`subscription_notices.write.insert`, personal) + one control on `me.membership`. Smallest gap. |
| 8 | **Leave / return** | lapses, comes back | leaving derives (standing → past); reactivate = another `subscriptions/start` |

The acceptance bar: **Tom drives his own arc end to end without a desk** (except
where D2 says otherwise), with or without Stripe, and the milkman can drop in
for one class without becoming a member.

---

## Part 9 — Stripe outlook for Tom (what the remodel must not break, and what it enables)

The payment loop is built (BUILD_STRIPE, Phases 1–12) and **assumes today's
model**. Under the new model:

- **Checkout reads `subscriptions/billable`** (amount/currency/interval/person).
  That fingerprint currently joins `subscriptions` + `plans` + `memberships` +
  `people`. It re-points at `subscriptions` + `offerings` + `studio_people` +
  `people`. The *shape* it returns to the integration is unchanged — keep it, so the
  integration does not change.
- **`subscriptions/assert`** (webhook write-back) is unchanged — it already
  writes standing keyed on `membership_id`. If `memberships` goes away,
  `assert`'s key becomes `subscription_id` or `(studio_id, person_id)`; the
  integration sends whatever metadata checkout stamped, so update **both** the checkout
  metadata and `assert`'s `where` together (they are one contract — see the
  billing-check that proves it).
- **`paid_via`** lets checkout mark a subscription `stripe` and the desk mark one
  `manual`, and dunning (`invoice.payment_failed` → notification) only applies to
  `stripe` ones — a manual subscription's failed SEPA is the studio's to chase,
  not Stripe's to report.
- **Drop-in via Stripe** (Tom pays €18 once for a single class): a one-off
  Checkout in `payment` mode (not `subscription`) creating a `pass` credits=1.
  New, small, additive to the integration — not part of this remodel, but the offerings
  model is what makes it expressible.
- **The manual-first reality:** most studios onboard without Stripe. The remodel
  makes the app fully usable (sell plans, passes, drop-ins; take attendance;
  give notice) with `paid_via = manual` and **no payment processor at all** —
  Stripe becomes an upgrade, exactly as BUILD_STRIPE framed it (an integration, not app
  code).

---

## Part 10 — the configurator direction (future, design for it now)

The human wants owners to **customise member-facing screens** — the CTA, the
dashboard, per-studio. This is not a stretch for this codebase: the app is
already **data** (`roundtrip-check` proves it survives serialization to JSON and
back), **themes are rows**, layouts are declarative nova. A **layout/action
configurator** is the natural next expression of that philosophy.

- **Not v1.** But **design the offering/CTA/dashboard screens as
  configurable-shaped** — driven by rows (like themes), not hardcoded — so the
  configurator later edits data rather than requiring a rewrite. Cheap foresight.
- The existing `theme_layouts` table (per-studio layout overrides) is the seed
  of this; the configurator is its UI.

---

## Part 11 — build order

Sequenced so each step is usable and the payment loop never breaks. **1–3 are
the foundation and touch the most reads; do them as their own change with the
existing checks green before member self-service (5+) lands.**

| # | Work | Gate |
|---|---|---|
| 1 | `studio_people` anchor + `loadDirectory` rebuild; a non-member resolves as a principal | a `connections`-only person (milkman) logs in; roll is "People, lensed" |
| 2 | `plans` → `offerings` (+ kind); repoint `subscriptions.plan_id`; keep all triggers | every money read still renders; currency FK still bites (`plans-check` equivalent) |
| 3 | Retire `memberships` as the category; standing derived from relationships; "enquiries" → "prospect" lens | `standing`-equivalent computes over relationships; scope/scoping checks green |
| 4 | `passes` (+ drop-in = credits 1); decrement on booking | a drop-in attends without becoming a member |
| 5 | `paid_via` + desk `subscriptions/start` / `passes/sell` / `record-payment` (manual, no Stripe) | a studio with no Stripe sells a plan; standing reaches "active, paid until X" |
| 6 | Repoint `subscriptions/billable` + `subscriptions/assert` for the new model | the built billing loop still closes (billing-check) |
| 7 | `follow_ups` → `notifications` (+ `seen_at`); socket fan-out; bell in chrome | an integration `notify` reaches an owner as a push, not a pull |
| 8 | Member CTA dashboard + member `subscriptions/start` (self) + terms confirm | Tom picks a plan himself |
| 9 | Member give-notice (`subscription_notices.write.insert`, personal) + `me.membership` control | Tom gives notice himself; 6-month/60-day arithmetic holds |
| 10 | Member pause (after D4) | Tom pauses himself within the rules |

Notifications (7) can run in parallel — it improves every stage.

---

## Part 12 — open decisions (the human's to make)

- **D1 — how far the person reframe goes.** *DECIDED: all the way* (full
  `studio_people` + relationships, not incremental).
- **D2 — self-subscribe vs desk-approve.** When a *member* picks a committed
  (e.g. 12-month) offering, does it commit immediately behind a hard terms
  confirm, or land as a desk approval first? Consumer-law-adjacent (AT §13a
  FAGG *Widerrufsbutton*, ~June 2026 — a *separate* 14-day withdrawal flow worth
  planning). *Recommend: immediate + hard confirm; flag high-commitment plans
  for optional approval.*
- **D3 — manual payment depth.** Standing-only, or a real `payments` cash
  ledger? *Recommend: standing-only for v1; ledger as a follow-on mirroring
  `stripe_invoices`.*
- **D4 — pause vs commitment.** Does a paused month still owe the minimum term?
  (Otherwise pause is an escape hatch from a contract.) *Blocks member pause
  only.*
- **D5 — course pricing.** Do courses become `offerings` of kind `course`, or
  keep their own price on `courses`? *Recommend: keep `courses` its own table;
  add an offering row only if a course needs the full offering machinery.*
- **D6 — notifications vs tasks as one table.** *DECIDED: one table
  (`notifications`), actionable-ness a property.*
- **D7 — configurator scope.** *DECIDED: not v1; design screens
  configurable-shaped now.*

---

## Part 13 — what must NOT regress (the checks are the spec)

The suite encodes the invariants the remodel must preserve. A fresh session
should run `pnpm --filter lyra check` (32 checks) + `pnpm --filter
lyra-integrations check` green **before and after** each step:

- **Tenancy** (`scope-check`, `scoping-check`) — every new table stamped &
  matched on `studio_id` from scope; personal reads pinned to `userId`.
- **Currency** (`design-check` money rule, `plans-check` composite-FK proof) —
  one currency per studio, no bare `€`, the `(studio_id, currency)` FK bites.
- **Notice arithmetic** (`plans-check`) — 6-month term + 60-day notice, notice
  in month 2, ends month 6 not month 4. The ledger + trigger must survive the
  offerings rename.
- **The payment loop** (`billing-check`, `stripe-check`, `webhook-check`,
  `frame-check`, `perimeter-check`, `integrations-check`) — signed webhook →
  `assert` → standing; the integration sees no lyra internals; the frame seam holds.
- **The app is data** (`roundtrip-check`) — it still boots identically from
  serialized JSON (the property the configurator will build on).
- **Separation** (`separation-check`, `integration-check`) — lyra imports no payment
  SDK; integrations share no code; one prefix per integration.

New checks the remodel should add: a milkman resolves as a principal; a person
holds two concurrent entitlements; a drop-in attends without a subscription; a
manual subscription reaches active-paid-until without Stripe; a notification
reaches a connected owner over the socket.

---

## Appendix — running dev state (as handed off)

- **lyra** dev on `:5180`; **stripe integration** on `:8781`; **`stripe listen`**
  forwarding to `localhost:5180/integrations/stripe/hook/events`; **Postgres**
  (the integration's own store) on `:5433`.
- **Dev ergonomics already fixed:** `LYRA_SIGNING_SEED` in `apps/lab/lyra/.env`
  keeps lyra's assertion keypair stable across restarts (the integration's
  `LYRA_VERIFY_KEY` stays valid); `LYRA_DEV_INTEGRATIONS` auto-registers/approves/
  installs the integration on boot (`server/dev-integrations.ts`, called only from
  `bootDevServer`, never from the shared `boot()` the checks use).
- **The connected test account** `acct_1U3YTxPqgTbTvqhS` belongs to **North
  Rock** (sign in as Dario). It is Stripe-liable, `dashboard=none`, AT. Its
  embedded onboarding needs the platform's Connect profile configured (a
  one-time Stripe-dashboard task); **hosted onboarding (Account Links) works
  today** and is what the setup screen uses.
- The integration's own store is Postgres and **persists across lyra restarts** — the
  connected-account mapping survives even though lyra's PGlite resets. This is
  deliberate (a connected account is unrecoverable if lost).
