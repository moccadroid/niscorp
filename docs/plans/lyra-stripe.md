# Lyra — payments, as an integration

**Status: PARTIALLY BUILT.** The integration exists and ships
(`apps/lab/lyra-integrations/src/integrations/stripe/` — checkout, hooks, ledger,
onboarding, prices, store) and the trust story is done and proven by
`integrations-check`, `perimeter-check`, `role-perimeter-check`, `stripe-check`
and `billing-check`. **Part 7 is the authority on what not to rebuild.**

**Read [`lyra-stripe-review.md`](lyra-stripe-review.md) beside this.** It is the
2026-08-15 audit and it supersedes this document wherever the two disagree: it
records what was actually found wrong, what has since been fixed, and what
remains. In particular this page's own summary of the gap is now out of date —
a member can buy a pass, a drop-in, a course place or a one-off, and can manage
their own card and read their own invoices. What money still cannot do is
narrower: notice given in lyra never reaches Stripe (`cancel_at` is unbuilt), and
there is no invoice or tax model on this side.

Part 6 is still outstanding: it lists what a human must supply.

**Purpose:** a complete, handoff-ready build plan for payments in lyra, as an integration.
Written for an agent starting cold. Everything is cited `file:line` so nothing has to be
re-derived; where something is unverified it says so.

**Target:** Stripe **dev/test mode**. The live platform account does not exist yet and
nothing may depend on a dashboard click (`PLAN.md:427-429`).

**Read first:** [`apps/lab/lyra/PLAN.md`](../../apps/lab/lyra/PLAN.md) §424-470
(the S1–S7 decisions, still valid) and [`tide-refactor.md`](tide-refactor.md)
(adjacent, not a dependency — and now largely built).

---

## Part 0 — the one-paragraph version

Studios become Stripe **connected accounts**; lyra is the platform (S1). Everything
Stripe lives in `lyra-integrations` as a second bundle beside belts (S2) — lyra gains no
Stripe dependency. Lyra's `subscriptions` row stays **standing** (status, plan,
paid-until) and never learns a Stripe id; the **ledger** (invoices, refunds, mandates)
is the integration's own mirror, surfaced through `ext.desk.stripe.*` screens (S4). The
integration writes back by replaying **assertion** mutation fingerprints as a per-studio
integration principal (S5) — which already works and is proven by `integrations-check`.

**Three things block this and must be built first.** They are in Phase 1.

---

## Part 1 — BLOCKERS (build before any Stripe code)

### 1.1 The proxy is a wildcard — close it

`packages/moss/src/server.ts:485-513`. The outbound proxy forwards **any path** under a
bundle's prefix for **any signed-in principal** at an installed studio. The intake
endpoint checks (`packages/moss/src/integrations.ts:177-199`) constrain what a bundle
*declares*; they never constrain what the proxy *forwards*.

For belts this exposes rank data. For a payments service it exposes a payments service.

**Build:** an allow-list derived from the bundle at intake — the union of every endpoint
URL its actions declare plus every `attachments[].preview`. The proxy 404s anything else.
Store it on the `integrations` row beside `actions` (`integrations.ts:245-274`).

**Also:** `operator.post('/integrations/:id/probe')` (`server.ts:455-470`) fetches an
operator-chosen arbitrary path **with no assertion at all**. Either restrict it to the
declared allow-list or make it explicitly a debug verb gated behind an env flag.

**Check:** extend `apps/lab/lyra/src/dev/perimeter-check.ts` — an undeclared path under a
bundle's prefix must 404 for a signed-in owner.

### 1.2 There is no webhook route — build one

**Verified NOT PRESENT.** Every moss route sits behind the `'*'` identity middleware
(`server.ts:184`); the operator seam 404s without `x-operator-key` (`:296-300`); the
proxy demands a principal (`:487`). The only unauthenticated surfaces are two GETs
(`:267`, `:284`). Lyra registers no raw routes (`server/serve.ts:11-12`).

Stripe's entire model is webhooks, so this is not optional.

**Build — in moss**, because it is a hole in moss's identity model and must be designed
once rather than per app:

```
POST /integrations/:id/hook/*      →  forwarded verbatim to <bundle.url>/hook/*
```

- **No principal required.** This is the exception; it must be explicit and narrow.
- **Body forwarded raw and unparsed** — signature verification needs the exact bytes.
  Do not `await c.req.json()` anywhere on this path.
- **Bundle must be `approved`.** Unapproved → 404, not 403 (do not confirm existence).
- **No assertion is minted.** There is no principal to assert. The integration
  authenticates the caller itself, against the vendor's signature.
- **Per-integration rate limit**, because this is unauthenticated by us.
- Path prefix `/hook/` is reserved and refused in the intake endpoint checks
  (`integrations.ts:187-188`) so a bundle cannot declare an action there.

**Check:** a new `webhook-check.ts` — unsigned POST reaches the bundle and the bundle
refuses it; an unapproved bundle 404s; the raw body arrives byte-identical.

### 1.3 A bundle cannot declare config or secrets — add it

`BundleSchema` is `.strict()` with exactly seven fields (`integrations.ts:68-111`):
`integration`, `meta`, `grants`, `actions`, `attachments`, `placements`, `settings`.
Belts sidesteps this with a module-level env var (`lyra-integrations/src/serve.ts:289`).

Stripe Connect needs **per-studio** state (the connected account id, its onboarding
status). Env vars cannot hold that.

**Build:** the integration keeps per-studio config in **its own store** — it already has
one and lyra must not hold Stripe state (S2/S4). What is missing is only the
**deployment-level secret handoff**, which stays an env var (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`), consistent with `BELTS_KEY`.

So: **no bundle schema change is required for config.** Recorded here because the audit
flagged it as a gap and it is not one — the per-studio state belongs to the integration,
and the secret belongs to the environment. **Do not add a config field to the bundle.**

### 1.4 Frames — the third seam, and the one that keeps Stripe out of lyra

Stripe requires three **embedded components** (§4.1c). They are browser UI from
`@stripe/connect-js`. Lyra validates every layout against a fixed component vocabulary
(`app.shell.components`, set from `COMPONENT_NAMES` at `src/server/boot.ts:59-61`) and
**refuses a bundle naming an unknown component** — a live, tested refusal. So an integration
cannot ship a React component, and the naive fix is for lyra's kit to import
`@stripe/connect-js`.

**Do not do that.** Instead: **the integration serves the page and lyra frames it.**

```
{ component: 'Frame', props: { src: 'embed/onboarding', height: '$.frameHeight' } }
   →  GET /integrations/stripe/embed/onboarding  (same origin as lyra)
   →  moss proxy: session → assertion → forwarded to <bundle.url>/embed/onboarding
   →  the integration returns HTML that loads @stripe/connect-js and mounts the component
```

**The auth problem solves itself.** The iframe `src` is same-origin, so the browser sends
lyra's session; the existing proxy (`packages/moss/src/server.ts:485-513`) mints the
assertion and forwards, and it already returns the response verbatim so HTML passes.
**No new authentication mechanism.** The frame is gated by exactly what every other integration
call is gated by: approved bundle, installed at this studio, real principal.

**Build:**
1. **moss** — a `frames` declaration in `BundleSchema` beside `actions`/`attachments`/
   `placements`, holding relative paths under the integration's own prefix. Intake validates the
   prefix the same way it validates action endpoints (`integrations.ts:177-199`), and the
   §1.1 allow-list admits them.
2. **lyra's kit** — one **generic** `Frame` component. Not `StripeEmbed`. It renders an
   iframe at `/integrations/<id>/<declared path>` and knows nothing about any integration.
3. **Theme** — lyra's tokens ride the proxy request the way scope does, so the integration's page
   is not visibly foreign. Stripe's components take an appearance object.
4. **Height** — a `postMessage` resize handshake. Must not fight the mobile layout or the
   thumb bar.
5. **CSP** — lyra permits framing its own origin; Stripe's inner frame has its own
   `frame-ancestors` requirements. There are two nested frames: lyra → integration → Stripe.

**What it costs, stated plainly:** lyra validates layouts precisely so an untrusted
bundle cannot render arbitrary UI, and **inside a frame lyra validates nothing.** That is
a real weakening. It is bounded by same-origin, by approval, and by per-studio install —
and the alternative (lyra importing a payment provider's SDK) is worse. Make it a
**named seam with its own check**, not an iframe that quietly appeared.

**Check:** a new `frame-check.ts` — an undeclared frame path 404s; an uninstalled integration's
frame 404s; the assertion reaches the integration; a bundle declaring a frame outside its own
prefix is refused at intake.

**Why this is Part 1 and not Part 4:** it is the third piece of integration machinery,
beside the proxy allow-list and the webhook route. Belts could have used it. Any integration can.
It is not a Stripe concession.

---

## Part 2 — lyra-side prerequisites

### 2.1 Currency is broken — fix before money moves

Verified:
- `€` is hardcoded in the format prisms (`app/prisms/format.prism.ts:41,49`)
- `plans.currency` exists (`db/schema.ts:224`), is seeded (`db/seed.ts:243`), and is
  **read by nothing** — grep for `currency` across `src/app` returns nothing
- `subscriptions.price_cents` is an override **with no currency** (`schema.ts:260`)
- `monthly_cents` sums across rows with **no currency predicate**
  (`schema.ts:293-296`, `:320-327`) — two currencies in one studio silently add together

**Build:**
1. `subscriptions.currency` column, stamped from the plan by the existing
   `stamp_subscription_terms` trigger (`schema.ts:285-311`).
2. A `CHECK` that a studio's plans share one currency, **or** a documented decision that
   multi-currency is refused in v1. Pick one; do not leave it implicit.
3. `money()` takes the currency from the row rather than hardcoding `€`. The prism
   already receives the row.
4. `design-check` assertion: no layout renders a money value without a currency key.

### 2.2 S6 has no write path — build it

**Verified:** the schema and trigger are correct and seeded with real non-default terms
(`seed.ts:246,250,252`), and the retention screen reads them
(`retention.action.ts:139-142`). But **nothing writes** `notice_given_on`,
`minimum_term_months` or `notice_days` — the plans form is name/price/interval/allowance
only (`plans.form.ts:34,44`; `plans.prism.ts:12,17`). No dev check asserts any of it.

§312k means lyra owns the cancel flow regardless (S6), so this is a prerequisite, not a
follow-up.

**Build:**
1. Plans form gains **Minimum term (months)** and **Notice period (days)**.
2. A **Give notice** action on the member record — writes `notice_given_on`; the trigger
   computes `ends_on = GREATEST(committed_until, notice_given_on + notice_days)`.
   Reversible (a confirm sheet, per the app's standing rule).
3. `plans/update` and a new `subscriptions/give-notice` mutation entry.
4. **Check:** a member on a 6-month term with 60 days' notice, giving notice in month 2,
   ends at month 6 — not month 4. That is the assertion S6 exists for and it has never
   been made.

### 2.3 The assertion mutation — the integration's entire write surface

S5: *assertions, never deltas* — idempotent under retry and reordering.

**Build** `subscriptions/assert` as a seeded mutation entry in
`app/vex/` (new `billing.entries.ts`):

```
context: { membershipId, planId, status, paidUntil, priceCents, currency }
```

- An `update` keyed on `(studio_id, membership_id)` with `studio_id` stamped by the
  engine — the integration cannot name another studio's row.
- It sets standing only. It must **never** write `notice_given_on`, `committed_until`,
  `minimum_term_months` or `notice_days` — those are lyra's and the trigger's.
- Idempotent by construction: re-applying the same assertion is a no-op.

**Note the precedent:** the automation rung deliberately lost `memberships.write.update`
this session ("nothing unattended may move somebody's standing"). Stripe is a different
rung and a different question, but **answer it explicitly** in the charter comment rather
than letting it be inherited.

### 2.4 Charter grants for the Stripe rung

Today the integration rung holds exactly two grants (`app/charter/charter.ts:363-375`):
`follow_ups.write.insert`, `follow_ups.read`. Everything Stripe needs is absent.

**Build:** a separate rung, not a widening of the shared one — belts must not gain
payment grants.

```
subscriptions.read
subscriptions.write.update      // via subscriptions/assert only
plans.read
memberships.read
people.read                     // for the checkout email
follow_ups.write.insert         // dunning outcomes onto the desk's list
```

`app.integrationActor` already resolves a per-(integration, studio) principal
(`app/app.ts:99-105`, `server/users.ts:176-179`); it currently assigns the single
`integration` role. Extend it to assign a per-integration role so `stripe` and `belts`
differ.

**Check:** extend `integrations-check.ts` — belts' key must be refused
`subscriptions/assert`; Stripe's key must be refused anything outside its rung.

---

## Part 3 — the Stripe bundle

### 3.1 The per-module shape — build this before any Stripe code

**Verified:** `apps/lab/lyra-integrations/src/serve.ts` is a single Hono app (`:34`) with
literal per-prefix routes — `app.get('/belts/bundle')` (`:225`) and nine hand-written
`app.post('/belts/...')` handlers. State is a module-level array (`:89`), config a
module-level array (`:55`), identity a literal string at every call site
(`identity(c, 'belts')`), the outbound key one env var (`:289`). There is **no router
factory, no registry, no per-bundle module boundary**. The only precedent for a second
bundle is `/broken/bundle` (`:432-444`), which exists solely to be refused.

**Belts is expected to be retired. Stripe is the first real integration, so the module
boundary must be built for Stripe's benefit, not retrofitted around belts'.**

```
apps/lab/lyra-integrations/src/
  serve.ts                  ← ~40 lines: create Hono, mount(INTEGRATIONS), listen
  integration.ts                   ← the contract every integration implements
  integrations/
    belts/
      index.ts              ← { id, bundle, mount, hooks?, env }
      store.ts              ← belts' own state. Nothing else may import it.
      …
    stripe/
      index.ts
      store.ts              ← connected accounts, customers, prices, ledger mirror
      client.ts             ← the ONLY file that imports the stripe SDK
      onboarding.ts · checkout.ts · ledger.ts · hooks.ts
```

**The contract (`integration.ts`):**

```ts
export type Integration = {
  id: string;                                  // 'stripe' — the URL prefix AND the assertion audience
  bundle: () => Bundle;                        // served at GET /<id>/bundle
  env: readonly string[];                      // names it requires; startup fails loudly if unset
  mount: (r: Hono) => void;                    // routes, mounted UNDER /<id>/ — never absolute
  hooks?: (r: Hono) => void;                   // mounted under /<id>/hook/ — unauthenticated by lyra
};
```

**Isolation rules — enforce these, they are the point:**

1. **An integration may not import another integration.** Nothing outside `integrations/stripe/**` imports
   anything inside it. Add a check that greps for cross-integration imports.
2. **An integration owns its own store.** No shared state module. Belts' array and Stripe's
   account map never meet.
3. **An integration never sees another integration's env.** `env` is declared; `mount` receives only
   those values. `STRIPE_SECRET` must be unreachable from belts.
4. **The audience is the integration id**, derived — not a literal at each call site.
   `identity(c)` inside an integration's router knows which integration it is. The current
   `identity(c, 'belts')` repeated nine times is exactly the bug shape where one call site
   is missed.
5. **Routes are relative.** An integration mounts `r.post('/checkout')`, never
   `app.post('/stripe/checkout')`. The prefix is applied once, by `serve.ts`.
6. **Hooks are a separate router** with its own middleware — no assertion verification, a
   raw body, and a rate limit. An integration cannot accidentally put an authenticated route
   under `/hook/` or an unauthenticated one outside it.

**Do this as its own change**, with belts migrated onto it and `integrations-check`
passing unchanged, before a line of Stripe is written.

### 3.1b Webhook isolation — the URL

Per Part 1.2, the moss route is:

```
POST /integrations/:id/hook/*   →   <bundle.url>/hook/*
```

So Stripe's endpoint is `POST /integrations/stripe/hook/events` and belts', if it ever
had one, would be `/integrations/belts/hook/*`. **The `:id` segment is what isolates
them** — a signature secret, a rate limit and a failure are all per-integration, and one
integration's webhook cannot reach another's handler.

`/hook/` is reserved: the intake endpoint checks (`packages/moss/src/integrations.ts:187-188`)
must refuse a bundle that declares an *action* endpoint under it, or an authenticated
route would inherit the unauthenticated door.

### 3.2 What the Stripe bundle declares

```ts
{
  integration: 'stripe',
  meta: { title: 'Payments', tagline: 'Take money for memberships', description: … },
  grants: {
    actions: ['ext.desk.stripe.*', 'ext.member.stripe.*'],
    data: ['subscriptions.read', 'subscriptions.write.update', 'plans.read',
           'memberships.read', 'people.read', 'follow_ups.write.insert'],
  },
  actions: {
    'ext.desk.stripe.setup':    …,  // Connect onboarding, owner only
    'ext.desk.stripe.ledger':   …,  // invoices/refunds/disputes for this studio
    'ext.desk.stripe.settings': …,  // the settings screen the store tile opens
    'ext.member.stripe.pay':    …,  // checkout / update payment method
  },
  placements:  { 'ext.desk.stripe.ledger': 'hub.money' },
  attachments: { 'people.detail': { to: 'ext.desk.stripe.member',
                                    preview: '/stripe/preview/member' } },
  settings: 'ext.desk.stripe.settings',
}
```

`placements` must name a hub in lyra's `menuSlots` (`app/app.ts:118`) — currently
`['hub.people', 'hub.me']`. **Add `hub.money`** or intake refuses the bundle.

### 3.3 Integration-side state

The integration owns, per studio: `connected_account_id`, onboarding status,
`customer_id` per membership, `price_id` per (amount, interval, currency), and the ledger
mirror. **None of this is ever sent to lyra** (S4).

For dev, a module-level Map is consistent with belts. Note in the file that a real
deployment needs a database.

### 3.4 Endpoints the bundle serves

| path | caller | auth |
|---|---|---|
| `/stripe/bundle` | moss intake | operator key, existing |
| `/stripe/action/*` | lyra proxy | signed assertion (`serve.ts:189-217`) |
| `/stripe/preview/member` | attachment strip | signed assertion |
| `/stripe/hook/*` | **Stripe** | **Stripe signature** — the Phase 1.2 route |

The hook handler verifies with `stripe.webhooks.constructEvent(rawBody, sig, secret)`,
then replays `subscriptions/assert` into lyra over its `ik_` key with
`x-nisc-acts-for: <studioId>`, exactly as belts does (`serve.ts:288-305`).

---

## Part 4 — Stripe specifics

### 4.1 Connect shape — S1 IS OUT OF DATE. Verified 2026-08-11 against live docs.

**S1 names the Accounts *v1* `controller.*` shape.** Stripe's current guidance is explicit:

> *"Dieser Leitfaden gilt nur für bestehende Connect-Plattformen, die die Accounts-v1-API
> verwenden. **Wenn Sie eine neue Connect-Nutzerin oder ein neuer Connect-Nutzer sind,
> verwenden Sie stattdessen die Accounts-v2-API.**"*
> — [design-an-integration](https://docs.stripe.com/connect/design-an-integration)

Lyra is a new platform. **Build on Accounts v2**, and treat S1's field names
(`dashboard=none`, `losses=stripe`, `requirement_collection=stripe`, `fees.payer=account`)
as the *intent* rather than the API. Re-read
[interactive-platform-guide](https://docs.stripe.com/connect/interactive-platform-guide)
and the v2 Accounts reference for the exact request shape before writing the call — the
interactive guide personalises its output and did not yield stable field names to quote
here.

**Three hard constraints, verified, that S1's intent implies:**

1. **Embedded components are mandatory, not a preference.** For accounts where Stripe is
   liable for negative balances, Stripe requires embedded components for **onboarding,
   account management, and the notification banner**. Stripe also emails connected
   accounts directly for risk/compliance; that is customisable with your branding, not
   removable. This is stronger than S1's "studios never visit stripe.com" — it makes the
   embedded account-management screen a *required deliverable*, not an optional nicety.
2. **`account_update` Account Links are unavailable** for accounts with no Stripe-hosted
   dashboard where Stripe carries losses. Account updates must go through the embedded
   account-management component. Do not plan a redirect flow.
3. **The dashboard type is immutable.** It is fixed at account creation; changing it
   requires creating a **new** Account object. Getting this wrong in dev is survivable;
   in live it strands the studio.

Also noted (not our combination, but adjacent): Express dashboard + Stripe-liable is in
**public preview** and needs API version `2026-07-29.preview`. We are `dashboard=none`,
so this should not apply — confirm when choosing the v2 equivalent.

### 4.2 Prices are lazy and content-addressed (S7)

No sync loop. At checkout: read the plan through a granted fingerprint, compute a key
from `(amount, interval, currency)`, look it up in the integration's own map, create the
Stripe Price if absent. A plan edit in lyra just produces a new Price at the next
checkout. Old subscriptions keep their old Price — which is correct, and is the same
"retiring a plan keeps everybody already on it" rule lyra's pricing screen already states.

### 4.3 Cancellation (S6)

Portal cancel **disabled**. Lyra owns the flow: the member gives notice in lyra → the
trigger computes `ends_on` → the integration sets `cancel_at` on the Stripe subscription
to that date. Stripe has no notice-period concept; do not try to model one there.

### 4.4 Dunning

**Stripe's own retry logic is not replaced** (`automation-requirements.md:219`). The
integration configures Stripe's dunning and listens for the outcome:
`invoice.payment_failed` → a follow-up on the desk's list via `automation/notify`
(which now writes `follow_ups` — `app/vex/tide.entries.ts`). Final failure →
`subscriptions/assert` with a lapsed standing.

### 4.5 Webhook events to handle

`account.updated` (onboarding), `checkout.session.completed`,
`customer.subscription.created|updated|deleted`, `invoice.paid`,
`invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`.

Every handler is idempotent on Stripe's `event.id` — Stripe redelivers.

---

## Part 5 — build order

| # | Work | Where | Gate |
|---|---|---|---|
| 1 | Proxy allow-list | moss | `perimeter-check` refuses an undeclared path |
| 2 | Webhook route | moss | new `webhook-check` |
| 2b | `frames` seam + generic `Frame` component | moss + lyra kit | new `frame-check`; **no Stripe import in lyra** |
| 3 | Per-bundle module shape | lyra-integrations | belts still passes `integrations-check` |
| 4 | Currency fix | lyra | `design-check` asserts no bare `€` |
| 5 | S6 write path | lyra | the 6-month/60-day assertion |
| 6 | `subscriptions/assert` + Stripe charter rung | lyra | belts refused it; stripe allowed |
| 7 | `hub.money` in `menuSlots` | lyra | intake accepts the bundle |
| 8 | Stripe bundle skeleton + Connect onboarding | lyra-integrations | a studio onboards in dev |
| 9 | Checkout + lazy Price | both | a member subscribes; standing asserts back |
| 10 | Webhook handlers + ledger screen | lyra-integrations | the money screen shows invoices |
| 11 | Dunning → follow-ups | both | a failed payment lands on the desk's list |
| 12 | S3 setup scripts | lyra-integrations | a blank account is configured by script |

**1–7 are prerequisites and none of them mentions Stripe.** They are worth doing whether
or not payments ship.

---

## Part 6 — what a human must supply

### Supplied — nothing further needed to start

`apps/lab/lyra-integrations/.env` already holds `STRIPE_SECRET` and `STRIPE_PUBLISHABLE`
(sandbox, full access), alongside `LYRA_VERIFY_KEY`, `LYRA_BASE` and `BELTS_KEY`.
**Note the names differ from S3's guess** — use `STRIPE_SECRET`, not
`STRIPE_SECRET_KEY`, and declare both in the Stripe integration's `env` list (§3.1).

**Currency is decided: EUR.** So §2.1 is: read `plans.currency`, add
`subscriptions.currency`, and **refuse multi-currency per studio with a CHECK** —
one currency, stated, rather than left implicit.

### STRIPE_WEBHOOK_SECRET — where it comes from

**It does not exist yet, and there is nothing on the dashboard to find.** A signing
secret is created *with* an endpoint; there is one per endpoint. Two routes, and S3
dictates which:

**Local development — the Stripe CLI.** `stripe listen` prints a `whsec_…` for that
session and forwards to your machine:

```bash
stripe listen --forward-to localhost:5180/integrations/stripe/hook/events
```

That secret is **per session** — expect it to change and read it from the environment,
never bake it in.

**Deployed — create it by API, which is what S3 requires. Use the v2 API, not v1.**

`POST /v1/webhook_endpoints` is the **v1** mechanism. Since we are building on Accounts
v2 (§4.1), the matching surface is **Event Destinations**:

```
POST   /v2/core/event_destinations
GET    /v2/core/event_destinations        · GET /v2/core/event_destinations/:id
POST   /v2/core/event_destinations/:id    · DELETE /v2/core/event_destinations/:id
POST   /v2/core/event_destinations/:id/enable  ·  …/disable
```

**Scope replaces `connect: true`.** v1 took a boolean; v2 takes an `events_from` string —
`@self` (the platform's own account) or **`@accounts`** (all connected accounts).
**Lyra needs `@accounts`** — subscription and invoice events happen on the *studios'*
accounts, not the platform's. As of the 2026-03-25 changelog `events_from` takes strings
rather than an enum; `@organization_members` and `@organization_members/@accounts` also
exist and are not ours.

Event destinations also carry the thin-vs-snapshot event distinction; check which shape
each event in §4.5 arrives as before writing handlers.

**The secret is still returned at creation only.** Capture it in the §12 setup script and
store it; there is no way to read it back.

> **Do not mix generations casually.** This build is v2 for accounts and event
> destinations — but **Account Sessions is still `/v1/account_sessions`** (§4.1b). Stripe
> is mid-migration; verify the namespace of every endpoint against the reference rather
> than inferring it from a neighbour. This document already got it wrong once.

Sources: [Event Destinations (v2)](https://docs.stripe.com/api/v2/event-destinations) ·
[List Event Destinations](https://docs.stripe.com/api/v2/core/event-destinations/list) ·
[events_from changelog 2026-03-25](https://docs.stripe.com/changelog/dahlia/2026-03-25/updates-eventsfrom-parameter-on-event-destinations) ·
[Types of events (v2)](https://docs.stripe.com/api/v2/core/events/event-types) ·
[stripe listen](https://github.com/stripe/stripe-cli/wiki/Listen-command)

### 4.1b Embedded components — what they actually are

Not a redirect and not an iframe you build. Stripe ships a **client library** that renders
Stripe-hosted UI **inside** lyra's own page, styled to lyra's branding.

- **Packages:** `@stripe/connect-js`, and `@stripe/react-connect-js` for React (lyra's
  terminal is React). Mounted either as **HTML custom elements** or as **React
  components**. Responsive; they work in mobile browsers, which matters given lyra's
  thumb-bar layout.
- **An Account Session is the server-side grant.** `POST /v1/account_sessions` — created
  on the server for one connected account, enabling a **named list of `components`**. The
  client library exchanges it for a live session. A component not named in the session
  cannot render. **This is the integration's job**, not lyra's: the Stripe integration creates
  the session and lyra's screen asks the integration for one over the proxy.
- Sessions are short-lived — build a refresh path, not a one-shot.

**The three we are required to embed** (§4.1, because Stripe carries losses):

| component | what it is |
|---|---|
| `account-onboarding` | the localised, validating onboarding form |
| `account-management` | view and edit account details — replaces the unavailable `account_update` Account Link |
| `notification-banner` | required actions: risk interventions and outstanding requirements |

**Optional and directly useful for the `ext.desk.stripe.ledger` screen** — these are
Stripe-built and would save writing a ledger UI: `payments` (list, export, refund,
dispute), `payment-details`, `disputes-list`, `payouts`, `balances`, `documents`.

### 4.1c What is mandatory, what is ours — and where the SDK lives

**Three are mandatory, and only because of `losses=stripe`:**

> *"Wenn Stripe für negative Kontostände Ihrer verbundenen Konten verantwortlich ist,
> **müssen** Sie eingebettete Komponenten für das Onboarding, die Kontoverwaltung und das
> Benachrichtigungsbanner integrieren."*

So `account-onboarding`, `account-management`, `notification-banner` — a **conditional**
requirement attached to Stripe carrying the risk, not an absolute one.

**Everything else is explicitly ours:**

> *"Für alle anderen optionalen Komponenten können Sie auch eingebettete Komponenten
> verwenden **oder eine eigene Benutzeroberfläche erstellen**."*

Payments, payouts, disputes, balances, documents, tax — build them as ordinary lyra
actions over the integration's mirror. **S4 stands**; the earlier "revisit whether to embed the
ledger" note is withdrawn. Embed only the three that are compelled.

**The lever, if the three are unacceptable:** take loss liability yourself and the mandate
disappears — but lyra must then monitor connected accounts for credit and fraud risk, run
remediation flows, and absorb negative balances. Wrong trade for a studio platform;
Stripe's own guidance says so for SaaS. Keep `losses=stripe` and accept the three.

**Onboarding has three shapes, not two:** embedded (Stripe UI inside lyra), hosted
(redirect — violates S1), or **API onboarding** (build the form yourself). The third
requires taking loss liability *and* Stripe flags it as resource-intensive with
verification requirements that must be re-checked every six months. Not worth avoiding
one component.

**Where the SDK lives:**

- `@stripe/connect-js` → `apps/lab/lyra-integrations/integrations/stripe/` **only**, enforced by
  the cross-integration import check (§3.1).
- **Lyra takes no Stripe dependency at all** — it gains the generic `Frame` component
  from §1.4 and never learns what Stripe is.
- The integration serves `embed/onboarding`, `embed/account`, `embed/banner`; it mints the
  Account Session server-side (`POST /v1/account_sessions`) and mounts the component in
  its own page. Sessions are short-lived — build refresh into the page, not into lyra.

Sources: [Supported embedded components](https://docs.stripe.com/connect/supported-embedded-components) ·
[Full embedded integration](https://docs.stripe.com/connect/build-full-embedded-integration) ·
[connect-js](https://github.com/stripe/connect-js) · [react-connect-js](https://github.com/stripe/react-connect-js)

### Decisions still open

- **VAT: Stripe Tax, or lyra?** If lyra, `plans` grows tax columns and §2.1 gets bigger.
- **Does the member give notice, or the desk?** §312k says the member must be able to.
  Affects whether the S6 action lands on `me.membership` or `people.detail` — probably
  both.
- **Country of the first studios.** EUR is settled; the country still decides SEPA
  Direct Debit vs card, which changes the payment-method set at checkout and whether
  mandates need a screen.

---

## Part 7 — what is already built (do not rebuild)

Proven by `integrations-check.ts` and `perimeter-check.ts`:

- **Registration as a granting ceremony** — moss mints an `ik_` key, returns it once,
  stores only the hash (`packages/moss/src/assert.ts`).
- **moss → integration**: short-lived ed25519 signed assertions, public half on
  `/api/integrations/verify-key`. Forged headers, wrong signer, tampered payload, expired
  token and sideways replay between bundles all 401.
- **integration → lyra**: the `ik_` bearer resolves to a per-studio integration actor with
  its own charter rung; from there nothing is special — same compiled policy, same
  engine-stamped scope, no privileged path around vex.
- **Bundle intake**: namespace theft, unknown components and unserved fingerprints are all
  refused, whole-payload.
- **Per-studio install/uninstall**, placements, attachments with previews, settings
  screens, and the Add-ons store.

Belts exercises every one of these end to end. Read `apps/lab/lyra-integrations/src/serve.ts`
before writing the Stripe bundle — it is the working reference for the whole path.
