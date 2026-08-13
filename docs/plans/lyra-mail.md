# Mail — making the product able to send

> **Status: not built.** This is a build brief, written to be handed to one
> agent and executed. Read it whole before touching anything; the last two
> sections exist because they are the parts people skip.

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

**Build against one transactional provider.** Recommended: **Resend**
(simplest API, good defaults) or **Postmark** (stricter about
transactional-only, which is a useful constraint on us). Either is one HTTPS
POST. The pack must not spread provider vocabulary beyond one file — see
`client.ts` below.

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

**Later, for studios that care: bring your own domain.** They add two DNS
records (DKIM + return-path), the pack verifies via the provider's API, and
their mail starts sending from `hallo@lumenyoga.at`. That is a studio
*setting* and a pack screen — not a code change, and not a prerequisite for
shipping.

---

## Where it goes: a pack, not a new service

`apps/lab/lyra-integrations` already runs several packs in one process. Read
[`src/pack.ts`](../../apps/lab/lyra-integrations/src/pack.ts) first — the contract is
short and it is enforced:

- **`id` is both the URL prefix and the assertion audience.** A pack mounts
  `/send`, never `/mail/send`; a token minted for another pack cannot be read
  here even by a handler that never thought about it.
- **`env` is a declared list.** Reading an undeclared name *throws*. So the
  provider secret is unreachable from every other pack, by the accessor and
  not by convention.
- **Storage is prefixed.** `table('sends')` is `mail_sends`. A pack cannot
  name another pack's table without writing the prefix by hand, which
  `pack-check` looks for.
- **Hooks get a context with no `identity` at all** — the host mints no
  assertion on that path, so a hook cannot believe it has a caller. It
  authenticates the vendor's signature or refuses.

Copy the shape of `packs/belts` for structure and `packs/stripe` for a pack
that talks to a vendor.

### Files to create

```
apps/lab/lyra-integrations/src/packs/mail/
  index.ts      the Pack: id 'mail', env list, mount, hooks
  client.ts     THE ONLY file that knows the provider's name or wire format
  send.ts       the send route: validate → client → record → answer
  store.ts      mail_sends: our record of every attempt
  bundle.ts     what the pack advertises (a settings screen, its grants)
  setup.ts      table DDL, mirroring packs/stripe/setup.ts
```

**`client.ts` is a hard boundary.** Everything else speaks
`{ to, replyTo, fromName, subject, text }` and gets back
`{ ok, providerId?, reason? }`. Swapping Resend for Postmark must be one
file. If a provider type escapes into `send.ts`, the abstraction has already
failed.

### Env this pack declares

```ts
env: ['MAIL_PROVIDER_KEY', 'MAIL_FROM_DOMAIN', 'MAIL_KEY', 'LYRA_BASE']
```

`MAIL_KEY` is the integration key for calling *back* into Lyra (see below).
With `MAIL_PROVIDER_KEY` unset the pack must still boot, accept sends, and
record them as `failed` with the reason `no provider configured` — the same
posture stripe already takes about having no key. **A missing secret is a
visible state, never a crash and never a silent success.**

---

## The two callers, one route

`POST /mail/send` is the whole surface. Two very different callers use it.

### 1. The magic link — direct, synchronous

[`auth.ts`](../../apps/lab/lyra/src/server/functions/auth.ts) calls the pack and waits. A sign-in
link that goes through a queue is a sign-in link that arrives too late.

Replace the `console.log` — but **keep it in development**. A lab with no
provider key must still be able to sign in; log the link when the send did
not happen, and say which happened.

### 2. Automation mail — through the fact bridge

An `outbox` insert is already a committed write, so it already mints a tide
write fact. Add a reflex that watches it:

```
on:     { fact: { entity: 'outbox', op: 'insert' } }
select: automation/outbox-queued   (anchored on $.fact.row.id)
effect: mail.send
```

**Why a reflex and not a loop:** one task per message, so forty sends retry
independently rather than as one batch that half-fails; the retry/backoff
policy already exists; the ledger already records what ran. This is what the
whole bridge was built for, and the wiring is now one moment definition plus
one effect.

**The one piece of new machinery.** `wireTide`'s effect registry is built
from `MUTATION_ENTRIES` — every effect today is a vex mutation replay
([tide.ts](../../apps/lab/lyra/src/server/tide.ts)). `mail.send` is an HTTP call, so the registry
gains its first non-mutation effect. Add it explicitly beside the derived
ones, and give it a `writes: ['outbox']` so the flow graph stays honest —
a blind edge means something bypassed vex, and this effect genuinely does
write through vex when it records the outcome.

### Recording the outcome

The pack marks the row through Lyra's own surface, exactly as belts records a
grading — `POST {LYRA_BASE}/api/automation/vex` with
`Authorization: Bearer <MAIL_KEY>` and `x-nisc-acts-for: <studioId>`. That
needs a new mutation entry in Lyra:

```
outbox/record-sent   update outbox set state, provider_message_id, failed_reason
                     where id = $context.messageId
```

and a `mail` rung in [charter.ts](../../apps/lab/lyra/src/app/charter/charter.ts) holding exactly
two grants: `outbox.read`, `outbox.write.update`. Nothing else. The rung is
found by pack id automatically ([app.ts `integrationRung`](../../apps/lab/lyra/src/app/app.ts)),
so naming it `mail` is all that is required.

---

## Schema changes in Lyra

`outbox` needs three columns. Without them a bounce is invisible:

```sql
provider_message_id TEXT NOT NULL DEFAULT '',   -- the provider's id, for support
failed_reason       TEXT NOT NULL DEFAULT '',   -- why, in the provider's words
sent_at             TIMESTAMPTZ                 -- when, actually
```

`state` already has the right CHECK (`queued | sent | failed`) — it was
written for this.

The Outbox panel on the Automations screen already renders
Sent/Failed/Not sent from `state`. Show `failed_reason` on a failed row: a
studio that cannot see why nothing arrived will ask us, every time.

---

## Consent — the part people skip

**The moment mail actually sends, unsubscribe stops being optional.** This is
much cheaper to build now than to retrofit after the first send.

Lyra's studios trade in AT/DE. The distinction that matters:

- A **class reminder** or **booking confirmation** to a member is arguably
  contractual — they asked for the class.
- **"We have missed you, come back"** is marketing. It needs consent and a
  one-click opt-out, and `member.quiet` is exactly that automation, shipped
  and armed in the seed.

What to build:

1. `studio_people.marketing_ok BOOLEAN NOT NULL DEFAULT false` — per studio,
   because consent is given to a studio and not to Lyra.
2. Every marketing selection filters on it. The safest shape is a flag on the
   **moment** (`marketing: true` in `compose.ts`) so the filter cannot be
   forgotten per-automation — the same place `watch` lives.
3. An unsubscribe link in the footer of marketing mail, resolving to a
   token-addressed public route that flips the flag. **This is the one piece
   that needs a login-free surface** — the front door (review item ②) — so
   either it lands with this work, or this work adds exactly one public route
   and no more.

Decide 3 before starting: it is the only part of this brief that touches an
area the product does not have yet.

---

## Build order

Each step ends green. Do not skip the checks; they are how the next agent
knows this still works.

1. **The pack, with no Lyra involvement.** `mail` pack, `client.ts`,
   `/send` route, `mail_sends` table, bundle. A `pack-check` case proving it
   is mounted at its own prefix with its own env fence. Sends recorded as
   `failed: no provider configured` when the key is absent.
2. **The magic link.** `auth.ts` calls the pack; dev still logs when nothing
   was sent. A check that signing in *reports* which of the two happened.
3. **Outbox columns + `outbox/record-sent` + the `mail` charter rung.** A
   check that the rung can update `outbox` and *cannot* read `people` — the
   grant list is the test.
4. **The reflex.** A `mail.send` effect in `wireTide`, a watched moment on
   `outbox` insert. Extend `tide-check` with the end-to-end claim: a real
   member write → welcome queued → **sent**, with nobody firing anything.
   That assertion is the point of the whole document.
5. **Consent.** `marketing_ok`, the moment flag, the filter, the unsubscribe
   route. A check that a marketing automation skips a person who never opted
   in, and that a reminder still reaches them.
6. **Bring-your-own-domain.** A settings screen in the pack's bundle: enter a
   domain, show the two DNS records, verify, and fall back to the shared
   sender until verification passes.

Steps 1–4 make the product able to send. 5 makes it legal to. 6 is the
upgrade a studio asks for in month two.

---

## What "done" looks like

- A studio is created and sends correctly with **zero configuration**.
- A member signs up, the welcome arrives, and the Outbox says `Sent` with a
  provider id beside it.
- The provider key is removed; nothing crashes, every row says `failed` with
  a readable reason, and the screen shows it.
- A marketing automation reaches nobody who has not opted in, and the
  reminder automation is unaffected.
- `separation-check` still passes: the mail pack imports nothing from Lyra
  and nothing from another pack.
