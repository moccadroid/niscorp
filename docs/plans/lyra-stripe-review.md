# Lyra payments — review, 2026-08-15

> **Since this was written, most of it has been acted on** (`5ffc7ab`, `bfcf2f7`).
> The findings below are kept as written — an audit that edits itself to match
> the fix stops being evidence of what was wrong. What changed is recorded here,
> once, and each section is marked.
>
> | | |
> |---|---|
> | **A1** per-action perimeter | **FIXED**, both doors, `role-perimeter-check` |
> | **A5/A6** studio name, entity type | open — studios still onboard as `st_northrock` |
> | **A2** notice never reaches Stripe | open — still no `cancel_at` anywhere |
> | **A3** double subscription | open — the confirming state that provokes it is unbuilt |
> | **A4** `paid_via` never becomes `stripe` | open for subscriptions; correct for passes and one-offs |
> | **A7** unexercised SQL | **narrower than stated** — see the correction in §A7 |
> | **B/C** owner and member surfaces | member can buy and manage a card; owner surfaces untouched |
> | **D** compliance | unchanged, and §D's cash paragraph is corrected below |
>
> Also built beyond the plan: the studio authors its own terms and billing
> periods, everything it sells is payable, and one-offs exist as their own kind.

Read of `apps/lab/lyra-integrations/src/integrations/stripe/**` (then spelled `packs/`), `packages/moss/src/{server,integrations}.ts`,
lyra's `app/vex/subscription.entries.ts`, `app/charter/charter.ts`, the desk and member
surfaces, and the four checks that claim to cover this (`stripe-check`, `billing-check`,
`webhook-check`, `perimeter-check`).

**Verdict.** The machinery is genuinely finished and it is good: signed assertions both
directions, a webhook door that asks for nothing and proves the bytes survive, assertions
rather than deltas, a per-integration charter rung, content-addressed prices, a frame seam
with its own grant. `docs/plans/lyra-stripe.md` Part 7 is accurate about what not to rebuild.

What is missing is **not** polish. There is one critical security defect, five correctness
defects that would produce wrong money or wrong records on day one, and the entire
user-facing and compliance half of the feature. The independent review's list
(test clock · dunning surfaces · receipts/invoices/tax) is right but starts too late —
none of the items below are blocked on a legal decision.

---

## A — Defects

### A1 · The integration perimeter checks paths, not grants — CRITICAL

`packages/moss/src/server.ts:1041` forwards to an integration on four conditions: signed in,
integration approved, installed at this studio, and `reachAdmits(reach, path)`.
`reachOf` (`integrations.ts:154`) is the flat union of every endpoint every action declares.
**Which action declared it is discarded**, so the charter's `ext.desk.*` (staff, `charter.ts:121`)
versus `ext.member.*` (member, `charter.ts:83`) fence governs which *screens render* and
nothing about which *endpoints answer*.

The assertion carries `principal`, `studioId`, `personId`, `country`
(`lyra-integrations/src/identity.ts:26`) — no roles, no granted actions. So the integration
cannot defend itself either.

Probed against the real stack (member `omar.haddad@example.com` at Northrock, Stripe
installed):

```
a MEMBER cannot read the studio ledger              — 200 []
a MEMBER cannot read the studio merchant account    — 200 {"account_id":"", …}
a MEMBER cannot create the studio merchant account  — 503 {"message":"This deployment holds no Stripe key."}
a MEMBER cannot mint a studio onboarding link       — 409 {"message":"This studio is not connected yet."}
```

All four reached the integration's business logic. The 503/409 are *absence of a key and an
account*, not authorization. With a live key configured, a member of the gym can:

- read the studio's whole invoice ledger,
- create the studio's connected account — one per studio, dashboard type immutable, so a
  premature one strands the studio permanently,
- **mint a hosted Stripe onboarding link for the studio's merchant account** and from there
  enter or change the business identity and the payout bank account.

This is a moss defect and it is not Stripe-specific — it applies to belts and to every
integration this platform will ever install. It is the one thing on this page that must be
fixed before a live key exists anywhere.

**There is a second door.** `/api/integrations/frame` (`server.ts:827`) gates a grant on
exactly the same three conditions and then checks `frames` — a bare array of paths with no
owning action at all (`integrations/stripe/bundle.ts`). So a member can also mint a grant for
`/integrations/stripe/embed/onboarding` and be served the page that mounts Stripe's
`account-onboarding` component against the studio's merchant account.

#### The fix — not structural

The design is already right and already says so: *the declaration is the perimeter*. The bug
is that the derivation throws away one field it is holding. `reachOf` iterates
`Object.values(bundle.actions)` — it has the action id in hand at `integrations.ts:157` and
does not keep it. Restoring it is a change to a derivation, not to the model, and moss stays
universe-blind: it checks the host's own resolved catalog and never learns what "desk" means.

**1 · `reachOf` keeps the owner.**

```ts
export type Reach = Record<string, string[]>;   // endpoint → the actions that declare it

export const reachOf = (bundle: Bundle, integrationId: string): Reach => {
  const own = `/integrations/${integrationId}/`;
  const reach: Reach = {};
  const admit = (url: string, actionId: string): void => {
    if (!url.startsWith(own)) return;
    (reach[normalizeReach(url)] ??= []).push(actionId);
  };
  for (const [actionId, raw] of Object.entries(bundle.actions)) {
    for (const endpoint of Object.values((raw as ActionDefinition).endpoints ?? {})) {
      admit((endpoint as { url?: string }).url ?? '', actionId);
    }
  }
  for (const binding of Object.values(bundle.attachments)) {
    if (typeof binding !== 'string') admit(binding.preview, binding.to);
  }
  return reach;
};

// Fail closed twice: a path nothing declares, and a path no HELD action declares.
export const reachAdmits = (reach: Reach, path: string, held: ReadonlySet<string>): boolean =>
  (reach[normalizeReach(path)] ?? []).some((actionId) => held.has(actionId));
```

An empty object keeps the existing fail-closed rule — a row written before this column
existed forwards nothing.

**2 · The proxy asks the catalog it has already resolved.** `server.ts:1060`:

```ts
const resolved = await resolveIdentity(principal);            // already called, for `installed`
if (resolved.installed !== undefined && !resolved.installed.includes(id)) return notFound(c);
const held = new Set(catalog(resolved).ids);                  // memoized on (roles, installed)
if (!reachAdmits((found.reach ?? {}) as Reach, c.req.path, held)) return notFound(c);
```

`catalog()` is already memoized at `server.ts:349`, and `resolveIdentity` is already being
called two lines up — so the cost is a Set build and a lookup. 404 rather than 403, matching
the rule the neighbouring branches already keep: a stranger learns nothing about which
endpoints exist.

**3 · Frames declare their owner**, which is the one place the bundle format has to change:

```ts
frames: { '/integrations/stripe/embed/onboarding': 'ext.desk.stripe.setup' }
```

Intake validates the named action exists in the bundle, exactly as it already does for
attachments (`integrations.ts:295`) and placements (`:302`). The grant route then runs the
same `held.has(…)` check. One integration ships frames today, so the re-import is one call.

**4 · The check that would have caught it** — `role-perimeter-check`: a member 404s on
`/ledger`, `/account`, `/connect`, `/onboarding-link` and cannot mint the setup frame grant;
an owner passes all five; a manager 404s on member checkout; and belts gets the same
treatment so this is a platform assertion rather than a Stripe one.

**Worth doing in the same change:** the assertion already knows which action admitted the
call, and carrying it costs nothing. It lets an integration log what it was called under, and
refuse something the host would have allowed. Not required for the fix.

**What it deliberately does not do:** an endpoint declared by two actions is reachable by
anyone holding either. That is union semantics, it matches how the charter already resolves,
and the integration's own declaration is what states it — visible on the approval card.

### A2 · Notice given in lyra never reaches Stripe

`grep -rn "cancel_at"` over both workspaces returns nothing. S6 (`PLAN.md:506`) specifies
"lyra computes the effective end, the integration sets `cancel_at`". It is not built, and
there is no lyra→integration direction it could use: the proxy is person-driven and
inbound-only, and bundle-declared automation effects are parked (`PLAN.md`).

So today: a member gives notice, lyra's trigger computes `ends_on` correctly, the screen
says "your last day is the 14th" — and Stripe keeps charging them, forever. Same for the
desk's **End now** (`subscriptions/end`) and for pause.

That is a charge without a contract behind it, and it is precisely the promise §312k makes
the cancel button carry.

### A3 · Nothing stops a second subscription

`integrations/stripe/index.ts` — `/checkout` resolves `billableFor` and creates a Checkout
Session. There is no check for a live Stripe subscription already covering that
`subscriptionId`. A member who taps **Set up payment** again after paying — or who paid,
came back to the screen, and did not see a confirmation (see C4) — gets a second Stripe
subscription and is billed twice. `ensureCustomer` de-duplicates the customer; nothing
de-duplicates the subscription.

### A4 · `paid_via` never becomes `stripe`

- Member self-serve hardcodes it: `me.prism.ts:22` — `paidVia: 'manual'`.
- `subscriptions/assert` deliberately never writes it (`subscription.entries.ts:334`, and the
  charter comment is right that it should not).
- Only the desk's `Paid` select ever sets `stripe`.

So a member who subscribes through the app and pays Stripe shows **"Billed by the studio"**
on both the desk record (`people.layouts.ts:174`) and their own screen
(`me.layouts.ts:172`). The desk will chase money Stripe is already taking.

### A5 · Studios onboard to Stripe under their database id

`index.ts:128` — `createConnectedAccount(stripe, { studioName: who.studioId, … })`, and
`rememberAccount(… studioName: who.studioId …)`. The assertion carries no studio name, so
Northrock becomes a Stripe merchant called `st_northrock`. That name is what Stripe uses in
its own correspondence with the studio.

### A6 · `entity_type: 'company'` is hardcoded

`client.ts:60`. Most small studios in AT/DE are Einzelunternehmen, not GmbH. This decides
which verification documents Stripe demands and is not a field to get wrong on an account
whose type cannot be changed after creation.

### A7 · Every SQL path in the integration is unexercised — *narrower than first stated*

> **CORRECTION.** As first written this section implied lyra's own schema was
> unexercised too. It is not: every lyra check boots PGlite
> (`src/server/runtime.ts`), runs the DDL, and fires the triggers — the notice
> arithmetic, `months_per_period`, the purchase stamp and the kind guards are all
> proven against a real database, and a constraint violation there comes back as a
> real Postgres error.
>
> What has never run is **the integration's own SQL** — the `db.query(...)` calls
> behind `DATABASE_URL` in `store.ts`, `prices.ts`, `ledger.ts`, `checkout.ts` and
> `hooks.ts`. That is still true, still the place a `membership_id` → `subscription_id`
> rename would hide, and still worth one check. The finding stands; its blast
> radius was overstated.

`billing-check.ts:31`, `stripe-check.ts:32` and `lyra-integrations/src/dev/pack-check.ts:33`
all `delete process.env['DATABASE_URL']`. So event claiming, the ledger mirror, the price
map and the customer map run **only** in their in-memory fallbacks in every check that
exists. The four migrations, the `ON CONFLICT` clauses, the `GREATEST` monotonic rules and
the `membership_id`→`subscription_id` rename are covered by nothing.

The isolation reasoning in those comments is sound. The answer is one more check that opts
*in* to a database, not removing the opt-outs.

### A8 · Smaller, real

- No idempotency keys on any Stripe write (`customers.create`, `checkout.sessions.create`,
  `products.create`, `prices.create`). Double-taps make duplicate objects.
- `ensureCustomer` (`checkout.ts:40`) is read-then-create: two concurrent checkouts create
  two Stripe customers; the `ON CONFLICT DO NOTHING` keeps the row consistent and orphans one
  customer at the vendor.
- On failure, `hooks.ts:326` deletes the claim row so Stripe's redelivery re-runs — but only
  on the SQL path. In memory mode `MEMORY_EVENTS` keeps the id and the retry is silently
  dropped.
- Checkout never sends the member's known email (`index.ts:157` reads `body.email`; the pay
  action's `start` endpoint sends `request: {}`). The Stripe rung holds `people.read` and
  `subscriptions/billable` joins `people` — the address is right there and unused, so
  Stripe's receipt goes to whatever the member retypes.

---

## B — What the owner cannot do

The Money hub has the studio's own screens (Pricing, Reports, Retention) plus the
integration's ledger. The ledger is the only payments surface, and:

- **It has no names.** `ledgerRows` (`ledger.ts:129`) emits date, amount, state, note. The
  mirror stores `subscription_id`; the integration holds `people.read`. An owner looking at
  "€89.00 · Disputed" cannot tell whose it is.
- **No refund and no dispute response.** Read-only. A refund has to be done at Stripe, by a
  studio that S1 promised would never visit stripe.com.
- **No invoice document.** Neither `hosted_invoice_url` nor `invoice_pdf` is mirrored
  (`hooks.ts:179`), so there is nothing to hand a member who asks for their invoice.
- **No payouts and no balance.** "When does this money reach my bank" has no answer anywhere.
- **No per-member view.** The bundle declares no `attachments`
  (`integrations/stripe/bundle.ts`), although `docs/plans/lyra-stripe.md` §3.2 planned one on
  `people.detail`. From a member's record there is no way to see their payments.
- **No reconcile sweep.** `PLAN.md` requires one — Stripe stops retrying after ~3 days.
  `grep -rni reconcile` finds nothing. A missed delivery is a membership permanently wrong.
- **Uninstall does not stop billing.** Uninstalling orphans the key
  (`integrations-check`); the studio's live Stripe subscriptions keep charging.
- **Dunning stops at the Notices list.** `notifyDesk` writes a `notifications` row and that
  is all. No email, no escalation, nothing the member ever sees.

## C — What the member cannot do

The member gets one nav item, **Payment**, holding one button that opens Stripe Checkout.
After that:

1. **They cannot see how far they are paid.** `me/membership` returns `paid_until_display`;
   `me.layouts.ts:172` renders only `paid_via_display`. No paid-until, no next charge date,
   no amount.
2. **They cannot see or change their payment method.** No customer portal, no
   `payment-method` component, no update-card path. **An expiring card is an unrecoverable
   dead end** — the only exit is dunning, which they are never told about (B, last point).
3. **No invoices and no receipts.** Nothing on their side, at all.
4. **No confirmation after paying.** `success_url` is lyra's home page (`index.ts:163`).
   `PLAN.md` calls for a "confirming…" state because the redirect races the webhook by
   design; it does not exist, which is also how A3 gets triggered.
5. **No login-free cancel surface** (§312k Kündigungsbutton) — `PLAN.md:587` deferred it and
   it is still deferred.
6. **No 14-day withdrawal** (FAGG §13a Widerrufsbutton, `lyra-model-overhaul.md:515`).

---

## D — Compliance, and what is actually blocked on a decision

**Invoices and receipts — nothing exists, and most of it is not yours to build.** Stripe
already issues numbered invoices on the connected account for every subscription charge,
under the studio's own identity. The correct v1 is to mirror `hosted_invoice_url` and
`invoice_pdf` and link them from both surfaces. **Do not invent invoice numbering in lyra** —
§11 UStG sequential numbering is exactly the thing you do not want two systems both claiming.

**Tax.** `automatic_tax: { enabled: true }` with `tax_behavior: 'inclusive'` on the Price
(`checkout.ts:131`, `prices.ts:84`) is the right call and keeps lyra's number the number.
But nothing registers a connected account for tax and there is no surface to. The code's own
comment says Stripe refuses the session when the studio is not registered — so as built, the
**first real checkout at a fresh studio fails with a raw Stripe error message**. `studios`
has `country` and `currency` and no legal name, no address, and no UID/VAT id
(`schema.ts:52-110`); every one of those is needed both for tax registration and for anything
invoice-shaped. B2B reverse charge is not modelled at all.

**Desk cash and Registrierkassenpflicht.** Worth being precise, because it sharpens the
question for the accountant. `subscriptions/record-payment` (`subscription.entries.ts`)
sets `paid_until` and nothing else — **no amount, no date taken, no who took it**. As built,
lyra records an entitlement date, not a cash transaction.

> **CORRECTION, and it matters for the question below.** The paragraph originally
> concluded that lyra "records no cash transaction at all" and was therefore not
> plausibly a Registrierkasse. That was overstated even when written: `passes/sell`
> with `paid_via: 'manual'` already recorded that a person bought a pass at the
> desk — it simply stored no amount, because a pass carries no price.
>
> It is now wrong. **`purchases` stores an amount, a date and a person, with
> `paid_via: 'manual'` a legal value** — a joining fee taken in cash is written
> down with its number. That is a sales record by any ordinary reading, and it
> is the row to put in front of the accountant. The schema says so at the table.
>
> What lyra still does not do is ISSUE anything: no receipt number, no document,
> no sequence. That is the distinction the question below turns on.

So the question to put to the accountant is not "is lyra a cash register?" but — and this
is the version to actually send, now that the table exists rather than being hypothetical:

> Our system records, per studio, that a named person bought a named thing on a named day
> for a stated amount, and whether it was paid by card through a payment provider or in
> cash at the counter. It issues nothing: there is no receipt, no receipt number and no
> sequence, and nothing is printed or handed to the customer.
>
> For the cash rows: does holding that record make us the Registrierkassensystem for the
> studio — with the RKSV signature-device and FinanzOnline obligations that implies — or
> does the studio's own till remain the Registrierkasse, with ours a downstream record of
> sales it already receipted? And if we later mirror receipts from a certified POS
> terminal, does mirroring carry any obligation of its own?

That is answerable. "Is lyra a cash register" is not.

**A POS integration is the better answer than a cash ledger.** If the studio's till is a
certified terminal — SumUp is the obvious candidate in AT/DE — then the terminal is the
Registrierkasse, it carries the RKSV signature device and the FinanzOnline registration, and
lyra mirrors its receipts the way it already mirrors Stripe's invoices. Same S4 shape, same
`subscriptions/assert` for standing, its own ledger mirror for the money. The obligation
stays where the certified hardware is, and lyra never becomes the system of record for cash.

That is a strictly better position than D3 level 2, where building a `payments` table with
amounts is what pulls the obligation *toward* lyra. It also vindicates the integration
architecture: a second money integration is a new bundle, not a rewrite.

Two things to establish before committing to it — and they belong in the same conversation
with the accountant: whether the specific SumUp product the studios would use is RKSV-certified
(not all POS hardware is), and whether a downstream mirror of a certified till carries any
obligation of its own. Do not treat "SumUp is compliant" as settled.

**It also raises the stakes on A1.** Two payment integrations installed side by side, each
with a merchant onboarding endpoint, on a perimeter that currently admits any signed-in
member.

**`application_fee_percent`.** Absent entirely — no `application_fee`, `on_behalf_of` or
`transfer_data` anywhere. There is no platform revenue in the flow. Adding one later means
touching every live subscription at every studio, so this is genuinely a
decide-before-go-live item.

**Legal entity AT vs DE.** Locks the live platform account. Blocks nothing in A, B or C —
but it does block creating the live account, which blocks the test-clock rehearsal against
anything real.

**Ordering.** The independent review is right that §312k needs the public surface, so public
phase 3 gates Stripe *go-live*. It gates nothing in A–C.

---

## E — running in sandbox indefinitely

Decided: no live account for the foreseeable future; test mode must exercise everything as
if it were live. That is the right call and it changes the ordering.

**Test clocks stop being a rehearsal and become the harness.** They are a test-mode-only
feature, so "long sandbox period" means they are available for the entire build rather than
at the end of it. Everything in phases 1 and 2 — `cancel_at` actually stopping a charge,
renewal moving `paid_until`, Stripe's dunning schedule reaching its end, a notice given in
month 2 of a 6-month term billing through month 6 — is otherwise unobservable without waiting
real months. **Move the test-clock harness into phase 0** and build the rest against it.

*Verify first, because the whole harness rests on it:* that a test clock drives subscriptions
on a **connected** account under direct charges. Check it before building on it.

**Build the application-fee plumbing now, not at cutover.** A fee is fixed on a subscription
when it is created. Shipping without it means every subscription ever created carries no fee
and adding one later is a migration across live subscriptions — which was the original reason
to call it a go-live decision. In sandbox that reverses: put the parameter in the flow from
the first subscription, default it to zero, and the decision at cutover is a **number** rather
than a change. Same for the tax pre-flight and the entity-type parameter.

**Decide mode separation now, while it is free.** `stripe_accounts` is `PRIMARY KEY
(studio_id)` and `stripe_customers` is `PRIMARY KEY (studio_id, person_id)` — neither carries
`livemode`. `stripe_prices` and `stripe_invoices` are keyed on ids that already differ per
mode, so they are safe. Two options, and today's answer is "undefined":

1. **One deployment per mode, one database each.** Nothing to build; the collision cannot
   happen. Recommended.
2. `livemode` in both keys, one deployment serving both. Only worth it if a single deployment
   must ever hold both.

Pick (1) unless something forces (2). It costs nothing today and is a data migration later.

**Webhooks need a stable door.** `stripe listen` mints a per-session secret, which is fine for
an afternoon and wrong for a build that runs for months — the dunning, reconcile and
`cancel_at` work all depend on events arriving over real elapsed time rather than on `stripe
trigger`. Use a test-mode event destination created by `setup.ts` (already written) against a
reachable URL, and treat that URL as an operational prerequisite for phase 1.

**What sandbox will not prove, and should not be assumed:**

- **Real onboarding.** Test accounts verify with dummy data. The `needs_info` / `in_review`
  state machine is coded correctly for three states, but real documents, real delays and real
  rejections are not simulated. Expect surprises here at cutover and nowhere else.
- **Payout timing and bank verification.** Fake in test mode. Anything phase 2 builds over
  payouts is shape-only.
- **Stripe's own emails to connected accounts.** Not sent in test mode, and they are a
  required part of the `losses_collector: 'stripe'` bargain.
- **That test-mode objects migrate.** They do not — accounts, customers, prices and
  subscriptions are separate object spaces. At cutover every studio re-onboards and every
  member re-enters payment details. Do not put a real studio on sandbox expecting a switch.

Everything else — dunning, disputes, refunds, SEPA mandates and their failure modes, invoice
generation, Stripe Tax against test registrations, application fees — is exercisable in test
mode with the documented test values. Which is what makes this a good plan.

## Action plan

### Phase 0 — before a live key exists anywhere

| # | Work | Where | Gate |
|---|---|---|---|
| 1 | ~~**Per-action perimeter**, both doors — proxy and frame grant.~~ **DONE** (`5ffc7ab`). | moss + both bundles | `role-perimeter-check`, over Stripe *and* belts |
| 2 | **Guard `/checkout`** against a live subscription for that `subscriptionId`. | integration | a second checkout for a paying member is refused in a sentence |
| 3 | **Studio identity into the wire.** Legal name and entity type reach the integration — either as scope values beside `country`, or a `studios/identity` read on the stripe rung. Stop A5 and A6 together. | lyra + integration | a connected account carries the studio's real name and its real entity type |
| 4 | **One check against a real database.** A `--db` variant of `billing-check`, or a separate `ledger-sql-check`. Note the scope is narrower than §A7 first claimed: lyra's own DDL and triggers DO run, against PGlite, in every check. What has never run is the INTEGRATION's SQL — the ledger, event, price and customer queries behind `DATABASE_URL`. | lyra-integrations | that SQL runs at least once in CI |
| 5 | **Test-clock harness** (§E). A reusable way to create a clock, put a member's subscription on it and advance it. | integration + a check | a renewal moves `paid_until` in lyra without waiting a month |
| 6 | **Mode separation decided** (§E) — one deployment per mode unless something forces otherwise. | deployment | written down; no `livemode` retrofit later |
| 7 | **A stable test-mode event destination** at a reachable URL, created by `setup.ts`. | integration | events arrive over elapsed time, not only from `stripe trigger` |

The A8 items fold into this phase; they are each a few lines.

**Landed since, though not on this list** — the studio now authors its own terms and
billing periods (no fixed menus), everything it sells is payable including passes,
drop-ins, course places and one-offs, and a member can manage their own card and read
their own invoices through the connected account's billing portal. `bfcf2f7`.

**Unverified against a live key**, and first to check when one exists: the billing-portal
configuration and session, and the one-time checkout with inline `price_data`. Both are
written to the documented shape and neither has ever called Stripe — `stripe-check` runs
without a key by design.

### Phase 1 — close the loop lyra already promises the member

Each of these is provable the day it is written, against the phase 0 clock.

| # | Work | Note |
|---|---|---|
| 8 | **`cancel_at`.** Needs a lyra→integration direction. Recommend a `subscriptions/leaving` read on the stripe rung plus a sweep in the integration: it states `cancel_at` from `ends_on` (idempotent — a state, not an event) and **the same sweep is the reconcile pass B wants**. One mechanism, two jobs, and no new moss seam. |
| 9 | **`paid_via` → `stripe`.** Recommend a second narrow fingerprint written when checkout completes, rather than widening `assert` — `assert` is right to be as narrow as it is, and the charter comment already argues why. |
| 10 | **Confirming state.** `me.membership` polls until `paid_until` moves after a checkout return. Fixes C4 and removes the main way to trigger A3. |
| 11 | **Application-fee plumbing**, defaulted to zero (§E). The parameter, not the number. |

### Phase 2 — the owner's surfaces

12. Names on the money screen (resolve via `people.read`, display-side only — the mirror still stores no names).
13. Mirror `hosted_invoice_url` + `invoice_pdf`; link from the ledger.
14. `attachments: { 'people.detail': … }` — a member's payments on their record.
15. A refund action over the mirror.
16. Payouts and balance (Stripe ships `payouts` and `balances` embedded components; not compelled, but cheap — and shape-only until live, §E).
17. Offboarding: what uninstall does to live subscriptions. Decide, then build it.

### Phase 3 — the member's surfaces

18. Paid-until and next charge on `me.membership`.
19. **Payment-method management.** The highest-value item in this whole list — without it a card expiry is unrecoverable. Stripe customer portal with cancel disabled (S6), or the embedded component.
20. Invoices/receipts on the member's side (falls out of 13).
21. Dunning reaches the member, not only the desk.

### Phase 4 — compliance

22. `studios` grows legal name, address, UID/VAT. Prerequisite for 23 and for anything invoice-shaped.
23. Tax registration surface plus a pre-flight, so the first checkout at a new studio fails on a lyra screen with a sentence rather than on Stripe's with a code. Testable against test-mode registrations.
24. §312k public cancel surface — gated on public phase 3.
25. FAGG 14-day withdrawal.
26. **Erasure.** The integration holds a person→customer mapping and lyra has no delete verb anywhere by design. An Art. 17 request currently has no path on either side. Decide what it means before somebody asks.
27. Desk cash — **only after the accountant answers the question in D**, and prefer a POS
    integration mirroring a certified till over a `payments` table of our own (see D).

### Phase 5 — the cutover, whenever it comes

Small now, because §E moved the substance forward.

28. Legal entity decided → live platform account created → event destination by `setup.ts`, secret captured once.
29. `application_fee_percent` set to a number (the plumbing already shipped in 11).
30. Every studio re-onboards and every member re-enters payment details. Not a migration — a re-run of onboarding. Plan it as a launch, not a deploy.

---

## Decisions only you can make

Three from the independent review, plus two this read surfaced:

Reordered by when they actually bite, given §E.

1. **Mode separation** — one deployment per mode, or `livemode` in the keys? Free today, a
   data migration later. Blocks item 6, which is to say this week.
2. **Should `paid_via` flip to `stripe` automatically** when Stripe starts billing, or stay
   whatever a human chose? It decides whether the desk chases a paying member. Blocks item 9.
3. **Entity type of the first studios** — GmbH or Einzelunternehmen? Blocks item 3. Cheap to
   get wrong in sandbox and close to irreversible per live connected account, so sandbox is
   exactly where to exercise both.
4. **Registrierkassenpflicht** — put the sharpened question in §D to the accountant, now
   reshaped around a POS integration. Blocks item 27 and nothing else.
5. **Legal entity, AT or DE**, and **`application_fee_percent` as a number.** Both blocked
   nothing after §E moved the plumbing forward; they are cutover decisions and can wait.
