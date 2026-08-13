# Mail — making the product able to send

> **Status: built — all eight steps, green in the suite** (`mail-check`,
> `bounce-check`, `consent-check`, `auth-check` carry the claims). The cap is
> a per-studio column (`daily_mail_cap`, default 1000/day) with a field on
> the settings screen. Bring-your-own-domain is built end to end — register,
> show the DNS records, verify, send from the studio's own domain — and is
> the one thing that has never run LIVE: the current provider key is
> send-only, so the domains API answers 403 until a broader one exists.
> This header said four different things at once for a while; the one line
> above is current, and the history lives in git rather than stacked here.
>
> **Revision.** The first draft of this document put mail in a pack. It is
> platform now, and the section that argues why is the one to read first — the
> decision changes what gets built more than anything else here.
>
> **Proven against the real provider (13 Aug 2026).** A member joined on the
> live surface and the welcome arrived in a real inbox — `Lumen Yoga
> <lumen@resend.dev>`, the studio's own words, `Sent` with the provider's id on
> the row. Also confirmed by response rather than documentation: the failure
> shape (`API key is invalid`, not retryable), `reply_to` (Gmail composes to
> the studio), `List-Unsubscribe` + One-Click (Gmail renders its own control),
> and the idempotency header (same key → same id, no second message).
>
> **Two things that reframes.** A 200 from the provider is ACCEPTANCE, not
> delivery — `Sent` on that screen means "the provider took it", and only a
> bounce webhook can make it mean more. And the provider key is send-only, so
> the domains API (step 8) and webhook management (step 7) need a broader one.
>
> Landed alongside: `storeUnwatchedWrites: false` in tide, so a write fact
> nothing watches is no longer stored — see the cost section.

## The gap, stated once

Lyra cannot send anything to anyone.

- The magic link is `console.log` ([auth.ts:12](../../apps/lab/lyra/src/server/functions/auth.ts:12)).
  Nobody signs in without somebody reading the server log.
- The `outbox` table receives rows and nothing ever reads them. Every row
  says `queued` forever, and the Automations screen renders "Not sent" — which
  is honest, and is also the whole feature not existing.
- All five shipped automations end in "email them".

Everything else in the automation stack is finished and proven: a write
commits, vex's write observer hands moss the rows, moss mints a tide fact
stamped with the studio's automation identity, the driver wakes, the reflex
runs as that studio's robot, and a row lands in `outbox` — milliseconds after
the click, with retries and idempotency. **The pipe is complete and ends in a
dead end.** This document is the last metre of pipe.

---

## The decision: one provider, chosen by us

The obvious-sounding alternative — "let each studio connect their Gmail" — is
wrong, and it is worth writing down why so it does not come back:

- **Volume.** Gmail caps around 500 recipients a day and suspends accounts
  that look like bulk senders. A studio with 300 members sending "tonight's
  class is cancelled" is exactly that shape, on exactly the day it must not
  fail.
- **Custody.** It means holding OAuth refresh tokens for every studio's
  personal mailbox — a serious credential obligation, for a capability the
  studio does not actually want to think about.
- **Deliverability is unowned.** When a welcome lands in spam, nobody can
  diagnose it: not us (no access), not them (no tooling).

**Build against one transactional provider. Recommended: Resend**, and for a
sharper reason than "simplest API": it accepts an `Idempotency-Key` on the send
call and Postmark does not. We do not *depend* on that — the claim state below
is what actually prevents a double send — but a provider that can refuse a
duplicate on its own side is worth the choice, and it is the only functional
difference between the two that reaches our design. **Confirm it still holds
before committing**; if it does not, the two are interchangeable and Postmark's
transactional-only discipline is a fine reason to prefer it instead.

### Sender identity: shared domain now, own domain later

**Day one, zero setup.** Every studio sends from one verified deployment
domain, wearing its own name:

```
From:     Lumen Yoga <lumen@mail.lyra.app>
Reply-To: hallo@lumenyoga.at          ← the studio's own address
```

The display name is the studio's, so the member sees who it is from; the
`Reply-To` is the studio's, so a reply reaches the studio and not us. This is
the single most important design choice in the document: it means a studio
sends correctly the moment they are created, with nothing to configure.

**`studios` had nowhere to put that reply address** — the table carried name,
slug, kind, timezone, currency, country, locale, theme
([schema.ts:52](../../apps/lab/lyra/src/db/schema.ts:52)) and no contact of any
kind. It now has `reply_to`, and both seeded studios carry one.

**An empty `reply_to` is not a small gap.** Mail leaves from the shared domain
wearing the studio's name, so that header is the only thing pointing home: with
it blank, a member's reply goes to `lumen@mail.lyra.app`, which nobody reads.
The transport still sends — an unanswerable message beats no message — so the
studio settings screen asking for it is the fix, and until that screen exists
no shipped copy may promise a reply reaches anybody. The effect's blurb says
only what is true for every studio; the sentence about replies belongs on the
settings screen, beside the field that makes it true.

**The cost of a shared domain, stated rather than discovered.** One reputation
is one failure domain: a studio that imports a stale list and collects
complaints degrades delivery for every other studio sending from
`mail.lyra.app`. That is the real price of zero setup, and it is worth paying —
but it means bounce handling and per-studio volume caps are not optional
forever, and it means bring-your-own-domain is the answer for anybody sending
at real volume rather than a cosmetic upgrade.

**Later, for studios that care: bring your own domain.** They add two DNS
records (DKIM + return-path), we verify via the provider's API, and their mail
starts sending from `hallo@lumenyoga.at`. That is a studio *setting* and an
owner screen — not a code change, and not a prerequisite for shipping.

---

## Where it goes: the platform, not a pack

`apps/lab/lyra-integrations` runs several packs in one process, and the first
draft of this document put mail beside them. That was wrong. **Delivery,
the provider credential and the sender reputation are platform. Sender
identity, the words and consent are tenant rows.** The line is worth
memorising in that form, because everything below follows from it.

### Why a pack cannot hold this

**Auth mail happens before a principal exists.** You have an email address, not
a person — so there is no tenant to resolve an install against. The proxy is
the only host→pack path there is, and it answers `Sign in first.` before
anything else runs ([server.ts:813](../../packages/moss/src/server.ts:813));
`installedFor` resolves through `personById` and returns nothing for anyone
anonymous ([users.ts:57](../../apps/lab/lyra/src/server/users.ts:57)). A pack is
not an awkward home for sign-in mail, it is an unreachable one.

**A studio uninstalling it would lock its own users out.** Packs are per-studio
installs by design. Login is not a feature a tenant opts into.

**It would couple the login path to two seams that are being replaced.**
`installedIntegrations` and `integrationActor` are two of the six synchronous
seams the identity work is migrating
([lyra-identity.md](lyra-identity.md), Part 1); 7.2 moves `integrationActor` to
the wire-bearing signature and 7.3 deletes `INSTALLED` outright. Sign-in has to
keep working across that.

**And there is no tenant to wear anyway.** A person known to two studios
resolves to the oldest anchor, deterministically but arbitrarily — the
directory says so itself
([users.ts](../../apps/lab/lyra/src/server/users.ts:83)). A sign-in link
arriving in a studio's name would be a phishing surface we built on purpose.
Auth mail is from the platform: `Lyra <no-reply@mail.lyra.app>`, no reply-to.

**The same argument then eats the rest of it.** Automation mail *does* have a
principal, so the proxy could serve it — but only with a per-studio install and
a `reach` entry no action declares
([integrations.ts:146](../../packages/moss/src/integrations.ts:146), fail-closed).
Keeping delivery in a pack for that path alone costs a new moss seam, an
integration key, a charter rung and an HTTP callback. And it would put the
provider credential in two places: two components holding one secret, owning
one sender reputation, maintaining one suppression list. One credential means
one delivery component.

**What is left for a pack is nothing.** Domain verification calls the provider's
API, so it lands platform-side too; the remainder is a settings screen over
rows Lyra owns, which is a Lyra screen. Build no mail pack. If BYO-domain is
ever something to package and price as an add-on, revisit it then — and even
then it calls a host fingerprint, never the provider.

### What this costs, so nobody rediscovers it as a surprise

The pack boundary was buying three things, and in-house each gets weaker:

- **`separation-check` proved no provider vocabulary could reach Lyra.** It
  becomes a module boundary enforced by a check
  ([mail-check](#the-three-fences) below) rather than by a process. Weaker.
  Say so in the file header.
- **The env fence made the secret unreachable from undeclared code**
  ([pack.ts:93](../../apps/lab/lyra-integrations/src/pack.ts:93)). In Lyra it is
  `process.env` like everything else.
- **A pack brought its own storage.** The per-attempt log folds into columns on
  `outbox`, which is arguably better: one row per message instead of two.

### The rule that keeps it a file instead of a subsystem

**The transport touches no database.** It takes a finished message and hands
back an outcome. No pool, no vex, no identity, no retries, no scheduling.

That works because everything else is already solved. *Who* to write to and *in
whose name* is a vex selection running as the studio's automation principal.
*Whether they consented* is a filter in that same selection. *Retry and
idempotency* are the tide task. *What the words are* is a column. The only
thing with no home is "put this text in front of that human", and that
genuinely is one function.

Put that sentence in the file header, because it is the thing that erodes: the
moment mail can read the database it starts resolving recipients, and then it
needs tenancy, and then it is a subsystem.

### The tree

```
apps/lab/lyra/src/server/mail/
  send.ts     the verb the rest of Lyra calls        (~40 lines)
  client.ts   the ONLY file that knows the provider  (~60 lines)
```

It could be one file. Two, because the swap should be *replacing a file* rather
than editing one, and the check that keeps the vendor contained needs something
to point at.

### What crosses the boundary

```ts
type Message = { to; fromName; fromBox; replyTo; subject; text; key; headers? };
type Sent = { ok: true; id } | { ok: false; reason; retry: boolean };

export const sendMail = (message: Message): Promise<Sent>;
```

`retry` is the one judgement the vendor layer makes, and it belongs there
because only the provider's answer settles it: a refused address will be
refused again, an unreachable host might not be. It is our word — no caller
learns what status produced it — and it decides whether the outbox row goes
back in the queue or stops at `failed`.

Two types and one verb is the entirety of what Lyra knows about email. Note
what is absent: **the caller cannot name a from-address.** `fromName` is a
display name and `fromBox` a local part sanitised to `[a-z0-9-]`; the domain
comes from `MAIL_FROM_DOMAIN`. No field in `Message` can carry an `@`, so no
call site can move the address its mail appears to come from. When
bring-your-own-domain lands, one optional field appears and nothing else moves.

`key` is the message's identity — the `outbox` row id, or the sign-in token —
passed to the provider as an idempotency key where the provider has one.

**Newlines are stripped from every header-bound field** (`fromName`, `fromBox`,
`replyTo`, `subject`) and from none of the body. A newline in a display name is
not a formatting quirk: it ends that header and begins one of the caller's
choosing, which is how a message acquires a recipient nobody authored.

### `client.ts` — the vendor's whole surface, named now, one function shipped

```ts
send(message)                → Sent
readEvent(headers, rawBody)  → { kind: 'bounced' | 'complained' | 'delivered', id, reason } | null
addDomain(domain)            → DnsRecord[]
checkDomain(domain)          → boolean
```

Ship `send`. The other three are named holes so that nobody puts them anywhere
else later. `readEvent` is the one that matters: webhook parsing is where a
provider abstraction normally breaks, because somebody parses the vendor's
payload in the route handler and the vendor is suddenly in two places.
Signature check and payload dialect both live here, and the route stays
vendor-blind.

What varies between providers, and how the contract absorbs it: **idempotency**
(a header we pass when it exists, never something we depend on), **errors** (one
string, the provider's own words, truncated — it lands in `failed_reason` and on
the screen), **webhooks** (`readEvent`). The swap is then: write a new 60-line
file, change one env name. Nothing else in the repo names the vendor.

### The three fences

1. **Two call sites, ever** — `auth.ts` and the tide effect. A module with two
   callers does not spread. This is the real fence; the other two keep it true.
2. **One export.** `send.ts` exports `sendMail`; `client.ts` is imported by
   `send.ts` and by nothing else.
3. **`mail-check.ts`**, in `src/dev/` beside the other forty and shaped like
   [separation-check](../../apps/lab/lyra/src/dev/separation-check.ts) — read
   the source, assert three things: the provider's name appears in exactly one
   file, `MAIL_*` env is read in exactly one file, nothing outside
   `server/mail/` imports `client`.

### And one rule worth more than the three fences

**No templating layer, ever.** The body is a column. If HTML mail is wanted
later that is another column or a prism template — the same machinery every
other piece of studio-authored text already uses. Mail codebases do not grow
because of sending; they grow because of composing.

### Env

```
MAIL_PROVIDER_KEY    the provider's secret
MAIL_FROM_DOMAIN     the verified sending domain
MAIL_SINK=log        the lab's transport — off unless named
```

`MAIL_SINK` is the same posture as `LYRA_DEV_PACKS`: unreachable unless a
deployment names it, and it exists because a development database is replayed
from seed on every save. An automation that can only ever report `Failed`
teaches nobody whether the automation worked. The sink makes the mail **visible
without making it sent**, and the id says which it was — a row reading `sink_…`
on a screen is not a claim that anybody received anything.

With `MAIL_PROVIDER_KEY` unset the transport must still load and still answer —
`{ ok: false, reason: 'no provider configured' }` — the same posture stripe
already takes about having no key. **A missing secret is a visible state, never
a crash and never a silent success.** For automation mail that means every row
reads `Failed` with a readable reason. For sign-in it means nobody can sign in,
which is not a state to record quietly: raise it where an operator looks.

---

## The two callers

### 1. The magic link — direct, synchronous, and carrying a credential

[`auth.ts`](../../apps/lab/lyra/src/server/functions/auth.ts) calls `sendMail`
and waits. A sign-in link that goes through a queue is a sign-in link that
arrives too late. Five lines change; **keep the `console.log` in development**,
because a lab with no provider key must still be able to sign in — log the link
when the send did not happen, and say which of the two happened.

**This is the step that turns a lab credential into a production one, and it
must not be treated as a transport swap.** The link carries `mintDevToken`:
base64 JSON with a `sub` and an `iat`, unsigned, never expiring
([runtime.ts:79](../../packages/moss/src/runtime.ts:79)); `devSession` decodes
it and believes the `sub`. Anybody can mint one for any principal id, including
`automation@st_lumen` or `ig_stripe@st_lumen`. Today the only way to obtain one
is to read the server log, which is why it has been survivable. Emailing it is
what makes it reachable.

**And it was worse than that.** The link did not merely *carry* a session token
— the browser stored it verbatim (`?token=` → `localStorage`, main.tsx). The
mail **was** the account: no expiry, unlimited uses, and worth everything to
anyone who saw the URL in an inbox, a log, a referrer or over a shoulder.

So this step includes a real link token, and it is small:

- **Unguessable** — 256 bits from the platform's CSPRNG, naming a row in
  `login_links`. **No signature**, and that is a change from this document's
  first draft: a signed stateless token still needs a row to be single-use, and
  once the row exists the signature proves nothing the lookup does not. One
  mechanism, and no secret to rotate.
- **Short-lived** — fifteen minutes.
- **Single-use** — `DELETE ... RETURNING`, so reading the link and spending it
  are one statement. Anything less means "single-use unless two requests arrive
  together", which is exactly what a double-click is.
- **Not a session token.** `?login=` is traded at `POST /api/auth/redeem` for a
  session that is minted at redemption and not before. The param is stripped
  from the address bar whether or not it worked.
- **Refusals are identical.** Spent, expired and never-existed all answer with
  one sentence; three would make it a place to test nonces against.

And `auth.request` needs a **rate limit** — per address and per source — or it
is an open endpoint for sending mail to strangers on our domain. It correctly
returns `true` whether or not the address is known, so it leaks no membership;
keep that.

> **Decision, and the only one in this document that can be cut.** If the token
> work is deferred, then step 2 ships as dev-logging only and Lyra still cannot
> email a sign-in link. That is a coherent position — the automation half is
> the product half — but it must be a decision somebody makes, not a thing that
> happens quietly.

### 2. Automation mail — through the fact bridge

An `outbox` insert is already a committed write, so it already mints a tide
write fact ([app.ts:244](../../apps/lab/lyra/src/app/app.ts:244), stamped with
`automation@<studioId>` from scope). Add a reflex that watches it:

```
on:     { fact: { entity: 'outbox', op: 'insert' } }
select: automation/outbox-queued   (anchored on $.fact.row.id, one row)
effect: mail.send
mode:   each, unitKey message_id
```

**Why a reflex and not a loop:** one task per message, so forty sends retry
independently rather than as one batch that half-fails; the retry/backoff
policy already exists; the ledger already records what ran. This is what the
whole bridge was built for.

Four things this needs that are not obvious:

**The selection carries the envelope.** Because the transport reads nothing, the
selection hands the effect a finished message: recipient, subject, body, the
studio's name and its reply address. That is a join onto `studios`, and the
automation rung cannot read that table today — see Charter below. It is the
same failure the [compose.ts](../../apps/lab/lyra/src/app/reflexes/compose.ts:50)
comment records: three moments shipped that were refused on every single run
because a grant was missing, and the screen offering them had no way to know.

**The reflex has no home yet.** `reloadReflexes` builds reflexes only from
`automations` rows ([boot.ts:14](../../apps/lab/lyra/src/server/boot.ts:14)) and
`reflexesFor` drops anything whose moment is not in `MOMENTS`. This one is not a
studio's automation: it is per-studio infrastructure, always enabled, appended
in `reflexesForEveryStudio`, with an id that cannot collide with
`<studioId>:<automationId>` — and it must exist for a studio that has no
automations at all.

**The effect is the registry's first non-mutation.** `wireTide`'s effects are
built from `MUTATION_ENTRIES`
([tide.ts:64](../../apps/lab/lyra/src/server/tide.ts:64)). `mail.send` calls
`sendMail` and then replays `outbox/record-sent` through vex as the studio's own
automation principal — the same `callVex` path every other effect uses, so the
chain headers stay believed ([app.ts:262](../../apps/lab/lyra/src/app/app.ts:262)
believes them from automation principals only) and the run stays on its chain
rather than starting a fresh one. Declare `writes: ['outbox']` beside the
derived ones so the flow graph stays honest.

**Which breaks a check, on purpose.** The graph's watcher map is keyed by entity
and ignores `op` ([graph.ts:56](../../packages/tide/src/engine/graph.ts:56)), and
`findCycles` counts self-loops
([graph.ts:155](../../packages/tide/src/engine/graph.ts:155)) — so a reflex that
watches `outbox` and writes `outbox` is reported as a cycle. It is a *guarded*
one (it has a selection), which is why it raises no error, but
[tide-check.ts:118](../../apps/lab/lyra/src/dev/tide-check.ts:118) asserts
`cycles.length === 0` and will fail. **Change that assertion to "no unguarded
cycles" and say why in the check.** The alternative — recording the outcome
somewhere other than `outbox` — buys a passing assertion by making the screen
unable to show what happened.

### Not sending the same email twice

Tide retries a failed task (`max: 2`,
[compose.ts:227](../../apps/lab/lyra/src/app/reflexes/compose.ts:227)) and its
per-unit keying makes a *second fan-out* a no-op — but a retry of the same task
after the provider already accepted is exactly the case that bites: the send
succeeded, the record-back timed out at fifteen seconds, and the retry sends it
again.

So the effect **claims the row before it sends**: `queued → sending`, and it
sends only if it won that update. A retry finds `sending` and stops. One extra
value in the CHECK constraint, no new table, and the provider's idempotency key
is then a second line of defence rather than the only one.

That makes four small mutations rather than the one this document first
imagined, and every state in them is a literal:

```
outbox/claim          → 'sending', WHERE state = 'queued'   ← the whole mechanism
outbox/record-sent    → 'sent', provider id, sent_at
outbox/record-failed  → 'failed', failed_reason
outbox/requeue        → 'queued', failed_reason
```

The last two were briefly one entry taking its state from context, which reads
as tidy and is not: a fingerprint called `record-unsent` that can write `sent`
holds more authority than its name admits, and a charter grant is table.verb —
it cannot tell two updates on `outbox` apart, so anything holding the pen for
one held it for the other. **A fingerprint's name should be the whole of what
it can do.**

Which of the two a failure earns comes from `retry`: the transport draws that
line, not the entry.

The order in the effect is claim, send, record — and it records **even when the
send threw**, because a row left saying `sending` is a message nobody will look
at again. The one path that can still strand one is the process dying mid-send.
That wants a sweep, and it is not this.

**Requeueing has to stop.** The retry policy gives a message three attempts;
putting the row back to `queued` on the third is putting it somewhere nothing
will ever read again — the insert fact that woke the dispatcher was consumed
long ago, so the row would sit reading "Not sent" forever. So the effect
compares `ctx.attempt` against `MAIL_ATTEMPTS` (exported beside the policy, so
the two cannot drift) and a message out of attempts is recorded `failed`, with
the count in the reason. A queue nobody drains is worse than a failure
somebody can see.

### What one message costs, and the one line that is waste

Three writes (claim, send, record) and one tide run per message. The run and
the task are the design working — one per message is what makes forty
reminders retry independently — and the driver's retention already bounds them
(facts 7 days, tasks and runs 30, [boot.ts](../../apps/lab/lyra/src/server/boot.ts)).

The **facts** were a different story, and mail did not cause it. `mintWrites`
([tide.ts:501](../../packages/moss/src/tide.ts:501)) mints a fact for every row
of every committed write, and `ingest` stored every fact it was handed. Three
`(entity, op)` pairs are watched in the whole of Lyra, so every booking,
check-in and note — and the claim and the outcome of every message — paid for
an **awaited INSERT on the hot path of the click that caused it**, to be read by
nobody and swept a week later.

**This is now `storeUnwatchedWrites: false`**, a tide config flag Lyra sets
([tide.ts](../../apps/lab/lyra/src/server/tide.ts)). A write fact no loaded
reflex could ever watch is not stored. `tide-check` asserts the ledger holds
nothing outside those three pairs.

It is a **flag and not the default**, for a reason worth keeping: today
`ledger.facts()` means *every write this host committed*, and `causeChain`
walks it — an audit trail that answers "why did this person get this" without
anybody having predicted the question. That is the better default; it is simply
not what Lyra's ledger is for, because `outbox` says what was sent,
`notifications` what was told, and `tide_run` how each automation ran.

The filter is deliberately weaker than the matcher, and each weakness is a bug
it would otherwise have: it drops nothing while no reflexes are loaded — a fact
arriving in that window still waits, which is the rule `matchFacts` was fixed
to keep — and it ignores `enabled`, `as` and `armedAt`, which are delivery
rules rather than facts about whether anybody is listening at all.

---

## Schema changes

```sql
-- outbox: what happened, and enough to answer "why did nothing arrive?"
ALTER TABLE outbox ADD COLUMN provider_message_id TEXT NOT NULL DEFAULT '';
ALTER TABLE outbox ADD COLUMN failed_reason       TEXT NOT NULL DEFAULT '';
ALTER TABLE outbox ADD COLUMN sent_at             TIMESTAMPTZ;
-- Written by the same statement that takes the row, because a claim recorded a
-- moment later is a claim missing exactly when the process died. It is the only
-- thing that can ever free a row stuck in 'sending': no state distinguishes
-- mid-flight from abandoned, so a sweep needs an age, and an age needs a
-- timestamp somebody wrote down BEFORE the thing that might not come back.
ALTER TABLE outbox ADD COLUMN claimed_at          TIMESTAMPTZ;
-- 'sending' is the claim (above). The rest of the CHECK was written for this.
--   state IN ('queued', 'sending', 'sent', 'failed')

-- studios: where a reply goes. Nothing on this table is a contact today.
ALTER TABLE studios ADD COLUMN reply_to TEXT NOT NULL DEFAULT '';

-- consent, per studio, because it is given to a studio and not to Lyra.
ALTER TABLE studio_people ADD COLUMN marketing_ok BOOLEAN NOT NULL DEFAULT false;
```

`sent_at` must actually be written — pass it in the mutation's context or give
the column a trigger. A column added by a plan and set by nothing is how a
schema grows fields that are always NULL.

The Outbox panel already renders Sent/Failed/Not sent from `state`
([automations.layout.ts:107](../../apps/lab/lyra/src/app/actions/domains/automations/automations.layout.ts:107)).
Show `failed_reason` on a failed row: a studio that cannot see why nothing
arrived will ask us, every time.

## Charter changes

The `automation` rung ([charter.ts:177](../../apps/lab/lyra/src/app/charter/charter.ts:177))
needs two grants:

- **`studios.read`** — the envelope's from-name and reply address. The rung
  extends nothing on purpose, so this is explicit.
- **`outbox.write.update`** — the claim and the outcome.

The second contradicts a sentence that has been absolute: *"Everything here only
ADDS… Nothing running unattended can alter a row a human wrote."* The narrow
reading survives — `outbox` is a table no human ever writes; every row in it is
an automation's own — so the grant contradicts the wording rather than the
reason. **Amend the comment to say exactly that**, and do not invent a second
robot audience for one verb. It is the first hole in that sentence, and it
should read as a decision rather than a slip.

No `mail` rung, no integration key, no `LYRA_BASE`: the effect runs in Lyra's
own process and writes through the surface it already uses.

---

## Consent — the part people skip

**The moment mail actually sends, unsubscribe stops being optional.** Much
cheaper now than retrofitted after the first send.

Lyra's studios trade in AT/DE. The distinction that matters: a **class
reminder** or **booking confirmation** is arguably contractual — they asked for
the class. **"We have missed you, come back"** is marketing: it needs consent
and a one-click opt-out, and `member.quiet` is exactly that automation, shipped
and armed in the seed.

1. `studio_people.marketing_ok`, above.
2. **A flag on the moment** (`marketing: true` in `compose.ts`, beside `watch`)
   rather than a filter each automation remembers — so it cannot be forgotten
   per-automation. Note that `not-seen-since` selects `subscriptions` and
   `people` ([tide.entries.ts:88](../../apps/lab/lyra/src/app/vex/tide.entries.ts:88))
   and has no `studio_people` in it at all; the join has to be added for the
   filter to have anything to filter on.
3. **A way to collect it.** A checkbox on the desk's person form (the rung
   already holds `studio_people.write.update`) and on the member's own screen.
   Consent nobody can give is a feature that sends nothing forever.
4. **An unsubscribe link in the footer of marketing mail**, plus
   `List-Unsubscribe` and `List-Unsubscribe-Post` headers — which the large
   mailbox providers now expect from bulk senders, and which are one field on
   `Message` today and a migration later.

Composed Lyra-side, never by the transport: an HMAC over
(studio, person) with a deployment secret needs no table at all.

**Say the consequence out loud:** `marketing_ok` defaults false, so on the day
this ships `member.quiet` reaches nobody. That is correct, and it will look
like a bug to whoever did not read this paragraph.

---

## The two public doors

The webhook and the unsubscribe route are the only genuinely new surface, and
they are cheap: `MossServer` **is** a Hono instance
([server.ts:60](../../packages/moss/src/server.ts:60)) and the global middleware
sets `principal` without enforcing it — enforcement is per-route
([server.ts:189](../../packages/moss/src/server.ts:189)) — so `boot.ts`
registers them after `createServer` with no change to moss.

```
POST /mail/events         signature-checked by client.readEvent → record, suppress
GET  /unsubscribe/:token  flips marketing_ok, answers with a page
```

Both login-free, both addressed by a token or a signature rather than a session.
The frame route ([server.ts:623](../../packages/moss/src/server.ts:623)),
registered ahead of the proxy precisely so it demands no principal, is the
precedent for the shape.

---

## The copy that says this does not exist

Four places assert the feature is missing, and two of them are German rows:

- [automations.layout.ts:114](../../apps/lab/lyra/src/app/actions/domains/automations/automations.layout.ts:114) — the Outbox section's subtitle.
- [compose.ts:149](../../apps/lab/lyra/src/app/reflexes/compose.ts:149) — the `email` effect's blurb.
- [phrases.de.ts](../../apps/lab/lyra/src/db/phrases.de.ts:395) — three keys, one of them the joined moment+effect blurb.

Changing them is part of the work, not a follow-up. The assertion at
[automations-check.ts:36](../../apps/lab/lyra/src/dev/automations-check.ts:36)
(a card's body is the moment's words, not the effect's) keeps passing either
way.

---

## Build order

Each step ends green. Do not skip the checks; they are how the next agent knows
this still works.

1. **The transport, alone.** `client.ts`, `send.ts`, `mail-check.ts`. No caller.
   A check that a message with no provider key is answered
   `{ ok: false, reason: 'no provider configured' }`, and that the vendor's name
   appears in exactly one file.
2. **Schema and charter.** The `outbox` columns, the `sending` state,
   `studios.reply_to`, `studio_people.marketing_ok`; `studios.read` and
   `outbox.write.update` on the automation rung with the comment amended. A
   check that the rung can update `outbox` and read a studio's name, and still
   cannot read `plans` — the grant list is the test.
3. **The reflex.** `automation/outbox-queued`, the `mail.send` effect with its
   claim, `outbox/record-sent`, the per-studio system reflex, the relaxed cycle
   assertion. Extend `tide-check` with the end-to-end claim: a real member write
   → welcome queued → **sent**, with nobody firing anything. That assertion is
   the point of the whole document.
4. **The screen.** `failed_reason` on the Outbox panel, and the four pieces of
   copy above.
5. **The magic link.** The link token (signed, short, single-use), the rate
   limit, `auth.ts` calling `sendMail`, dev still logging when nothing was sent.
   A check that signing in *reports* which of the two happened. See the decision
   in caller 1 — this step can be cut, deliberately and out loud.
6. **Consent.** The moment flag, the join, the filter, the collection surface,
   the unsubscribe route and headers. A check that a marketing automation skips
   a person who never opted in, and that a reminder still reaches them.
7. **Bounces.** ✅ `client.readEvent` (Svix: HMAC-SHA256 over
   `id.timestamp.rawBody`, keyed on the secret base64-DECODED after stripping
   `whsec_`, five-minute replay window), `POST /api/mail/events`, and a
   suppression list scoped by KIND: a hard bounce is a fact about the address
   and holds everywhere, a complaint is a fact about the relationship and holds
   at the studio complained about — and takes that studio's consent with it.
   The door always answers 200: a 4xx tells a webhook sender to retry all
   night. Per-studio volume caps: `daily_mail_cap` on the studio row,
   default 1000/day, with a field on the settings screen.
8. **The studio's own mail settings.** ✅ `studio.mail` on the owner rung under
   Settings: the sender a member actually sees (asked of the server, because
   the domain lives in the environment and a screen inventing it lies the day a
   deployment changes it) and the reply address, saved to the studio's own row.
   Bring-your-own-domain is built end to end but has never run LIVE:
   `addDomain`/`checkDomain` need a provider key with more than send
   permission, and the current one answers 403.

Steps 1–4 make the product able to send. 5 makes people able to sign in. 6
makes it legal. 7 keeps the shared domain alive. 8 is what a studio asks for in
month two.

---

## What "done" looks like

- A studio is created and sends correctly with **zero configuration**.
- A member signs up, the welcome arrives, and the Outbox says `Sent` — with the
  provider's id carried on the row for support, and the failure reason printed
  beside the address on any row that did not go.
- The provider key is removed; nothing crashes, every row says `Failed` with a
  readable reason, and the screen shows it.
- The provider is swapped by replacing `client.ts` and one env name, and
  `mail-check` proves nothing else in the repo knew who it was.
- A marketing automation reaches nobody who has not opted in, and the reminder
  automation is unaffected.
- Sending the same message twice is not possible: the claim refuses it and the
  provider's idempotency key refuses it again.

---

## What this brief cannot do for itself

Three things have to come from outside the repository, and step 1 is blocked
without the first two:

1. **A provider account and an API key** (`MAIL_PROVIDER_KEY`).
2. **A sending domain we control**, with its DKIM/SPF/DMARC records published
   — `mail.lyra.app` is a placeholder in this document, not a decision.
3. **A deployment secret** for the link token and the unsubscribe HMAC, if
   there is not already one to reuse.

And one thing has to be decided by a person: whether step 5 ships with the link
token or is cut until it can.
