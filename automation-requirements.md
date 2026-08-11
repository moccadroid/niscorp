# Automation — requirements

What a nisc application needs from an automation library. This is a **wishlist and a
requirements statement**, not a design: it says what must be true, not how. Anyone
picking this up should feel free to arrive at a shape nothing here anticipated.

Written against the needs of a membership-management platform (gyms, dance/yoga/pilates
studios, clubs), but nothing here is specific to that domain — the requirements are the
ones any nisc app hits the moment work has to happen without somebody clicking.

## Why this exists

Every nisc runtime today is **reactive**: a person opens a shell, an action mounts, an
endpoint is called, a write happens. Nothing in the stack can act on its own. Grep the
packages and the only timers that exist are moss's shell idle sweep and its socket
credential revalidation — both infrastructure, neither reachable by an application.

That gap blocks an entire class of product features. In the membership domain alone:
recurring billing, failed-payment retry and dunning, overdue alerts, membership renewal
and expiry, class reminders, missed-attendance win-back sequences, review requests timed
to a good moment, rank/promotion eligibility notices, trial-ending nudges, and every
report that must be computed rather than read. These are not garnish — for most
membership businesses they *are* the product.

There is a second motivation that matters as much. Some of this work should be done by a
model rather than a rule: summarize what happened at this studio this week, flag members
whose pattern looks like they are about to quit, draft the win-back message. Cortex can
run an agent; moss can record what it cost. Nothing can decide to run one on Tuesday.

## The thesis it must not break

The whole stack rests on one claim: **what executes is validated data, not code**. A
scheduled job written as a TypeScript function that queries a database and charges a card
would be the single most consequential piece of logic in the application and the only
piece with none of the properties everything else has — not inspectable, not diffable,
not replayable, not dry-runnable, not serializable, not something a model can safely
emit.

So the central requirement is not "run things on a timer." It is: **an automation is an
artifact.** It parses a schema, it can be stored as a row, it can be diffed in review, it
can be shown to a non-technical operator, and it can be simulated before it is armed.

If a proposed design cannot express the common cases as data, it has failed regardless of
how convenient it is.

---

## Functional requirements

### 1. Triggering

The library must support work initiated by:

- **A clock.** Recurring on a calendar (daily at 03:00, first of the month, every
  Monday), and one-shot at a moment ("this trial ends on the 14th"). Must handle
  timezones honestly — a studio in Vienna and one in Denver both mean "3am local",
  and a monthly billing run must not drift or double-fire across a DST boundary.
- **A data change.** Something was written and that should cause work. Note the
  constraint this runs into: nova's `emit`/`message` channels are shell-local and
  in-memory, so they cannot reach a server-side automation. Whatever the mechanism, the
  durable signal is a row changing, not an action firing.
- **An external event.** A payment provider webhook, an inbound SMS, a device
  callback. These arrive with no session and must be able to start work.
- **A person.** An operator pressing "run this now" — for testing, for recovery after
  an outage, and for the genuinely manual cases ("bill this member now").

Wishlist, not required: dependency between automations (run B after A succeeds).

### 2. Selecting what it acts on

An automation almost never acts on "everything". It acts on the rows that match a
condition — members whose payment failed twice, stays ending tomorrow, students eligible
for promotion.

**Strong preference:** that selection should be an ordinary Vex read, addressed by
fingerprint. Doing so inherits properties we would otherwise have to rebuild — it is
already replay-only, already scoped engine-side, already cached, already inspectable,
already schema-validated, and already the thing the app's own screens use. It also means
an operator can be shown *exactly which members this will affect*, by running a query
that already exists, before anything is armed.

Requirements that follow:

- Selection must be able to take parameters (today's date, the tenant, a threshold).
- A selection returning zero rows is an ordinary outcome, not an error.
- Large result sets must be processable without holding everything in memory at once.
- It must be possible to act **per row** (charge each member) and **per batch** (one
  digest email listing all of them). Both are real.

### 3. Effects

An automation must be able to:

- **Write** — through the same closed mutation grammar the app uses, replayed by
  fingerprint. No new write path, and no privileged path around Vex.
- **Call out** — a payment capture, an email, an SMS, a webhook to somebody else's
  system. These are side effects on the outside world and are the reason the execution
  semantics below are non-negotiable.
- **Run an agent** — a cortex agent, with its run recorded through the same sink moss
  already provides, so a scheduled model run is as accountable as an interactive one.
- **Do several of those in order**, where a failure partway through is handled
  explicitly rather than leaving a half-done state.

It must be possible to express "charge the card, and *if that succeeds* mark the invoice
paid and send the receipt; if it fails, record the failure and schedule a retry" without
dropping into imperative code.

### 4. Execution semantics — the part that must not be hand-waved

This is where a naive scheduler destroys a business.

- **Idempotency is mandatory.** A monthly billing run must charge each member exactly
  once for that period, no matter how many times the trigger fires, how many server
  instances are running, or what crashed halfway. There must be a durable record written
  *before* the effect, keyed such that a repeat is recognised and refused.
- **Retries must be explicit and bounded**, with backoff, and with a terminal state
  that a human can see. A card decline is not a transient failure and must not be
  retried like one — the library needs to distinguish "try again" from "this is done and
  it failed".
- **Concurrency must be controlled.** Two instances must not run the same automation
  simultaneously. Some automations must not overlap with themselves (a long billing run
  that is still going when the next tick arrives).
- **Partial failure must be survivable.** If 500 members are being billed and number
  237 throws, the first 236 stay done, 237 is recorded as failed, and 238 onward still
  run. An all-or-nothing batch is the wrong model here.
- **Ordering** where it matters, and explicit permission to be unordered where it does
  not.
- **Timeouts**, so a hung external call cannot wedge a schedule forever.
- **Catch-up policy must be a choice.** After four hours of downtime: does the 03:00
  run fire late, or is it skipped? Both answers are right for different automations, and
  guessing wrong either double-bills or silently skips a month.

### 5. Identity and authority

- An automation acts with **no user session**. It needs an identity of its own — and
  that identity must be a real, scoped principal that the Vex engine enforces against,
  not a bypass. "It runs as root" is not acceptable: the most powerful actor in the
  system would be the one with no policy.
- Its authority must be **narrow and declared** — this automation may write invoices
  and read members, and nothing else.
- In a multi-tenant app it must act **within one tenant at a time**, and the tenant
  boundary must be enforced by the same engine-side scope that enforces it for people.
  An automation that leaks across tenants is a data breach with a cron schedule.
- Note: this same "acts with no session, still fully scoped" requirement is what an
  inbound payment webhook needs. Two independent features wanting it suggests it is a
  primitive, and it may not belong in this library at all.

### 6. Observability

Non-negotiable, because these run unattended and touch money:

- **A durable run ledger.** Every execution: which automation, which version of it,
  when, what it selected, what it did, what it cost, what happened. Failures recorded as
  faithfully as successes — a failed run spent effort and is exactly the run somebody
  needs to read.
- **Dry run.** Show me what this would do, changing nothing. This is the single most
  valuable feature in the library and should be a first-class verb, not a debug flag.
- **Preview against real data**, so an operator sees the eleven members who will be
  emailed tonight, by name, before arming it.
- **Alerting on silence.** An automation that should have run and did not is more
  dangerous than one that errored loudly.
- The ledger should be queryable by the app itself — it is data like everything else,
  and an operator-facing "what has the system been doing" screen should be an ordinary
  action over ordinary rows.

### 7. Tenancy and configuration

- Automations must be **per-tenant configurable**: enabled or disabled, with different
  parameters (this studio dunned after 3 days, that one after 7), without forking the
  definition.
- Some are platform-wide and not a tenant's business; some are entirely a tenant's own.
  Both must be expressible.
- Enabling and disabling must be **instant and safe** — an operator turning off a
  misbehaving automation should not require a deploy, and should not corrupt work in
  flight.
- It must be possible to change an automation's definition while previous runs exist,
  with the ledger still saying which version did what.

### 8. Where it runs

The library should be **agnostic about what wakes it up**. In-process timers do not
survive multiple instances or serverless hosting; the likely deployment here is a
scheduler pinging an HTTP endpoint (Cloud Scheduler → a Firebase function → the app).

The useful split: the **library owns "what is due, what ran, and what happened"**; the
**host owns "wake me up"**. A design that assumes a long-lived process will not deploy;
one that assumes serverless will not run locally in a dev check. Both must work, and a
headless check must be able to drive time forward deterministically without waiting.

### 9. Testability

A nisc app proves every feature with a headless check that boots the real app and asserts
on real behaviour. Automations must fit that: a check must be able to advance the clock,
run what is due, and assert on the resulting rows — with no sleeping, no wall-clock
dependency, and no mocks. If automations can only be tested by waiting, they will not be
tested.

---

## What it must compose with

The library does not get to invent parallel machinery. It should stand on what exists:

| Existing | Expected role |
|---|---|
| **Vex** entries (`{ fingerprint, context }`) | Selection, and writes. Both already replay-only, scoped, and cached. |
| **Vex** `ScopePolicy` / behaviors | Enforcement of what an automation may touch. Unchanged and unforgeable. |
| **Charter** | Declaring an automation identity's authority, in the same language as everyone else's. |
| **Cortex** | Agent runs as an effect. |
| **Moss** run sink (`RunRecord`) | Recording model runs, already shaped for this. |
| **Prism** | Shaping values inside an automation — parameters, message bodies. |
| **Nova** | Operator surfaces: the ledger, the preview, the arm/disarm control — ordinary actions over ordinary rows. |

## Non-goals

- Not a general-purpose workflow engine with human approval steps and long-running
  state machines. If that is needed later it is a different thing.
- Not a message bus or an event-sourcing substrate.
- Not a replacement for the payment provider's own retry logic — where Stripe already
  does something well, we defer to it.
- Not real-time. Second-level precision is not required anywhere in the known use
  cases; minute-level is fine.

## Open questions

Genuinely open, listed so they are not silently resolved:

- **Is this one library or two?** "Run on a schedule" and "react to a change" may want
  different shapes, and forcing one abstraction over both may serve neither.
- **Does the automation identity belong here?** The scoped no-session principal is
  needed by webhooks too. It may be a moss or charter concern that this library merely
  consumes.
- **How much of the effect vocabulary is closed?** Vex's mutation grammar is closed on
  purpose. "Send an email" cannot be — it reaches an outside service. What is the
  smallest honest seam that keeps the *definition* declarative while the *doing* is a
  registered handler?
- **What does versioning mean** when an automation is a row an operator edited, and the
  ledger must still explain a run from three weeks ago?
- **Does a person-facing "reminder" belong here at all,** or is a notification system a
  separate concern that automations merely trigger?

---

*Requirements only. No implementation is presumed, and a design that meets these while
looking nothing like anything sketched here is a good outcome.*
