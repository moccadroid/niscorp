# lyra — campaigns: the studio writes to its people

> **Status (2026-08-16): Stage 0 BUILT. Stages 1–3 not started.** This is a
> build brief, written to be handed to one agent and executed in stages. Read
> the whole document before touching anything; Part 6 (what is NOT being
> built) is load-bearing, and the two traps in Part 8 are the ones this
> feature will actually die on.
>
> **What runs today.** An owner opens Marketing → Campaigns, picks one of
> eight questions, unticks anybody they would rather leave out, types a
> subject and three sentences, and presses Send. That writes ONE row — the
> campaign — and a reflex running as the studio's own machinery re-asks the
> question, keeps only the people who can honestly be written to, checks the
> day's ceiling, and fans the answer into `outbox` in a single statement. The
> existing dispatcher sends them, unchanged. `campaigns-check` is the 51st
> suite and `pnpm check` is green.
>
> **Where the built thing departs from what is written below**, in the two
> places it does — both discovered by running the code, both recorded here
> rather than quietly:
>
> 1. **§2.3's four-number sentence is two numbers plus per-person reasons.**
>    An `exists` resolves only in a query's own filter, so "how many are
>    suppressed" cannot be a conditional sum beside "how many have no
>    address", and a group-by cannot group on a computed column. So the sheet
>    reads *"6 will be written to / 7 in this list"* from two entries, and the
>    REASON sits beside each name in the untick list ("Has not opted in") —
>    which is more use than a tally anyway. The count that matters is counted
>    through the same filter the write uses.
> 2. **There is no audience `blurb` on the screen.** It was written, and it
>    came out in English on a German studio's screen: the language pass walks
>    the rendered tree's props, so a word must be a layout literal or arrive
>    from a read with a `_display` name. A one-line description bound from
>    action data is neither. The dropdown's labels say enough; the column
>    stays on `campaign_audiences` for the screen that later explains a
>    question properly.
> 3. **Composing is a PAGE and the recipients are a link.** §2.4 said one
>    shared compose sheet. That was wrong twice over: writing to four hundred
>    people is the task rather than a detail glanced at over another screen,
>    so it takes the width a desk has (a `Grid` — two columns where there is
>    room, one where there is not); and a list of every recipient pinned open
>    under the compose box is furniture, not information. The count is always
>    visible, **who gets it** is one click away in a sheet, and that sheet
>    lists ONLY the people who will receive it — the ones who will not are not
>    a decision anybody is being asked to make there.
>
> **One nova change was needed and is landed with its own tests.** A message
> trigger was invoked with no event at all, so `{ emit: { channel, payload } }`
> — declared in the schema, resolved by the step, delivered by the bus — was
> dropped on arrival, and an overlay could only ever announce "something
> happened". Now a listener reads `@event.payload` whether it was woken by a
> click or by an announcement
> ([triggers.ts](../../packages/nova/src/action/runtime/triggers.ts)). That is
> what lets the recipients sheet hand its result back to the page underneath —
> which it must do on CLOSE rather than per tick, because the page is
> suspended while the sheet is over it.
>
> **Only two decisions are still open, and neither blocks anything now.** D1
> (nav), D6 (what an audience IS), D7 (who writes the outbox row), D4 (the
> Book button) and D8 (the editor is a form) were all answered on 2026-08-16
> and built into Parts 2, 3.4, 4.1 and 7. What remains: **D2** (where uploaded
> files live) gates Stage 2's images, and **D5** (get a full-scope provider
> key and run bring-your-own-domain once for real) gates volume rather than
> code. D3 lives in the families plan and ships a conservative default.
>
> **Parts 1, 2 and 3.2 were corrected on 2026-08-16 against the code they
> describe.** Four things the first draft asserted are not true of this
> codebase: the roll cannot be ticked past a page, the "gone quiet" selection
> already filters out everybody the partition was supposed to name, the
> charter says no human ever writes to `outbox`, and a `$lookup` inside
> `insertEach` is constant across rows. Each is now a gap with a fix beside
> it (G4–G7). The design did not change; the mechanism did.
>
> Every claim below carries a `file:line`. Where a claim says **verify**, the
> cited code was read on 2026-08-16 and may have moved — check before building
> on it. Anything uncited is opinion.

---

## Part 0 — what this is, and the two sentences that govern every choice

A studio writes to the right people in minutes, it looks expensive with zero
effort, and everything hard — audience, consent, brand, language, families —
was already done before the screen opened.

The competition is Mailchimp and Squarespace Email, and the strategy is NOT
feature parity. It is two things, in priority order:

1. **Deleted concepts.** Mailchimp needs list imports, field mapping, a
   segment builder, merge-tag setup, and a brand kit wizard because it does
   not know who the customers are, what the business sells, or what it looks
   like. Lyra knows all three. The audience picker is a dropdown of lenses
   the studio already thinks in; the brand is the theme rows; merge fields
   are columns the product already holds. **Every setup concept we do not
   have to build is the feature.** When a screen in this plan starts growing
   a wizard, stop — the data model almost certainly already knows the answer.
2. **Beautiful by default.** PLAN.md's rule — *"the stock app is good: a
   studio that never customizes anything still looks like it bought
   something expensive"* — applies to email verbatim. The winning experience
   is: pick a template, type three sentences, send, and the result looks
   designed. The defaults matter more than the editor, and the editor, when
   it arrives (Stage 2), is small and excellent, never large and capable.

**The sender is never new.** Everything in this plan queues rows into the
existing outbox and lets the existing dispatch reflex send them. There is one
mail door in this product ([mail-check](../../apps/lab/lyra/src/dev/mail-check.ts):
"mail leaves by one door") and campaigns do not get a second one.

---

## Part 1 — what already exists (build ON this, not around it)

The reason this plan is smaller than it looks. Verified 2026-08-16:

| Piece | Where | State |
|---|---|---|
| Audiences | The nine lenses over the roll ([member.entries.ts:162](../../apps/lab/lyra/src/app/vex/member.entries.ts)), retention's windowed "gone quiet" (`automation/not-seen-since`, [tide.entries.ts:148](../../apps/lab/lyra/src/app/vex/tide.entries.ts)), given-notice | Built, checked |
| Selection UI | `Rows` has `selectRef`, per-row checkboxes, select-all header ([rows.tsx:141–196](../../apps/lab/lyra/src/ui/components/rows.tsx)) | Built, **used nowhere** |
| The outbox | `outbox` table with the claim state machine (`queued → sending → sent/failed`), `claimed_at` sweep, `delivered_at`, `provider_message_id`, `failed_reason`, a `marketing` flag carried on the ROW ([schema/outbox](../../apps/lab/lyra/src/db/schema)) | Built, checked |
| Dispatch | The outbox-dispatch reflex claims, checks the cap, sends, records ([tide.ts:133–162](../../apps/lab/lyra/src/server/tide.ts)); a stuck-row sweep rescues died-mid-send ([compose.ts:271](../../apps/lab/lyra/src/app/reflexes/compose.ts)) | Built, checked |
| Transport | `send(secret, envelope)` with idempotency key, retry judgement, provider-words failure reasons ([client.ts:63](../../apps/lab/lyra/src/server/mail/client.ts)); webhook reader ([client.ts:141](../../apps/lab/lyra/src/server/mail/client.ts)); domains API ([client.ts:218](../../apps/lab/lyra/src/server/mail/client.ts)) | Built, proven live |
| Consent | `studio_people.marketing_ok` ([people.ts:101](../../apps/lab/lyra/src/db/schema/people.ts)), enforced **inside selections** as a join so cache invalidation works ([tide.entries.ts:153](../../apps/lab/lyra/src/app/vex/tide.entries.ts)), login-free unsubscribe door ([unsubscribe.ts](../../apps/lab/lyra/src/server/unsubscribe.ts)) | Built, checked |
| Family routing | `studio_people.mail_to` mirror, resynced by trigger — a child's mail reaches the guardian; no address means refused by name, never `''` ([people.ts:151,183](../../apps/lab/lyra/src/db/schema/people.ts), `families-check`) | Built, checked |
| Caps | `studios.daily_mail_cap` ([studios.ts:87](../../apps/lab/lyra/src/db/schema/studios.ts)), enforced claim-then-count at dispatch; **a capped message FAILS rather than waits** ([tide.ts:139](../../apps/lab/lyra/src/server/tide.ts)) | Built |
| Brand | `themes.tokens` rows; the studio's look is data | Built |
| Language | The phrasebook pass, run server-side between flatten and serialize ([shells.ts:285](../../packages/moss/src/shells.ts) area); `studios.locale` | Built, gated |
| Sender identity | `studios.reply_to`, `legal_name`, `address` ([studios.ts:51–80](../../apps/lab/lyra/src/db/schema/studios.ts)) | Built |
| Automations | Tide moments/effects/recipes — five mail recipes already running | Built |

**Seven verified gaps this plan must close, named here so nobody rediscovers
them mid-build.** G1–G3 were in the first draft; G4–G7 came out of reading
the code the draft cited, and each one falsifies a mechanism the draft
proposed. The design survives all four; the sentences that described *how*
did not.

- **G1 — the envelope is text-only, and it is six places rather than one.**
  `Envelope` has `text` and no `html`
  ([client.ts:42](../../apps/lab/lyra/src/server/mail/client.ts)) — but the
  HTML has to survive the whole path from queue to wire, and that path is a
  row, two reads and two effects before it is ever a type. In order:
  `outbox.body_html` ([mail.ts:10](../../apps/lab/lyra/src/db/schema/mail.ts))
  → the fields of `automation/outbox-queued`
  ([tide.entries.ts:423](../../apps/lab/lyra/src/app/vex/tide.entries.ts)) →
  `outboxStuck`, **which shares that shape on purpose and will silently drop
  the HTML from every swept message if it is missed** → the dispatch effect
  and the sweep effect, which are two separate envelope constructions
  ([compose.ts:292,334](../../apps/lab/lyra/src/app/reflexes/compose.ts)) →
  `Message` ([send.ts:28](../../apps/lab/lyra/src/server/mail/send.ts)) →
  `Envelope` → the provider body. Stage 1 changes all six or none.
- **G2 — the magic link is 15 minutes and single-use** (`TTL_MS`,
  [links.ts:24](../../apps/lab/lyra/src/server/links.ts); `DELETE…RETURNING`
  redemption). An email is opened tomorrow. The Book button CANNOT reuse
  `login_links` as-is — see D4.
- **G3 — there is no asset pipeline.** No upload, no storage, no public file
  URL anywhere in the product. Email that looks good needs images; images in
  email need public URLs. Stage 2 owns this, and it is the only genuinely new
  infrastructure in the plan — see Part 4.2 and D2.
- **G4 — the roll cannot be ticked past a page, and `selectRef` has never
  rendered.** `people/list` pages at fifty with a cursor
  ([member.entries.ts:112,313](../../apps/lab/lyra/src/app/vex/member.entries.ts)),
  and `Rows`' select-all header ticks the rows it can see — so "everybody on
  trial" is eight pages of clicking, and the count on the compose sheet would
  be the page's count. Separately: `selectRef` appears in exactly one file
  outside the component, and it is a `click-check` fixture
  ([click-check.ts:301](../../apps/lab/lyra/src/dev/click-check.ts)) — the
  first screen to use it is the first screen to find out what is wrong with
  it. **Fix: the audience is the question (§2.1, D6); ticking is subtraction
  from it, never the way it is assembled.**
- **G5 — the partition has nothing to say on the screen this plan opens
  with.** `automation/not-seen-since` filters `marketing_ok` and
  `mail_to IS NOT NULL` *inside the selection*, and the comments say why: a
  consent test written outside the read is a test vex cannot invalidate a
  cache on ([tide.entries.ts:148+](../../apps/lab/lyra/src/app/vex/tide.entries.ts)).
  That is correct for an automation and fatal for a partition — "39 will be
  written to, 2 opted out" reads as "39, 0 opted out, 0 unreachable" on
  Gone quiet, forever. Given notice does *not* pre-filter
  ([forecast.entries.ts](../../apps/lab/lyra/src/app/vex/forecast.entries.ts)),
  so the same sheet would tell the truth on one list and a comfortable lie on
  the other. **Fix: campaigns get their own audience entries that ANSWER the
  disposition instead of filtering on it — the doctrine `outbox-queued`
  already keeps for suppression, in those words: "SUPPRESSED IS ANSWERED, NOT
  FILTERED" ([tide.entries.ts:449](../../apps/lab/lyra/src/app/vex/tide.entries.ts)).**
- **G6 — the charter says no human ever writes to `outbox`.** Not a grant to
  add, a sentence to keep: *"`outbox` is the one table in this app that no
  human ever writes — every row in it is an automation's own"*, and the
  automation rung's `outbox.write.update` grant is justified BY that sentence
  ([charter.ts:290](../../apps/lab/lyra/src/app/charter/charter.ts)). A
  manager's principal inserting rows on a button press revokes the reasoning
  under a grant that stays. **Fix: the button writes a campaign, not mail
  (§2.2, D7).**
- **G7 — a `$lookup` inside `insertEach` is constant across rows.** The
  grammar says so in as many words — a `{$item}` reads the current element,
  and *"every other value (literal, `$context`, `$lookup`, engine-injected
  `$scope`) is constant across rows"*
  ([schema.ts:83](../../packages/vex/src/mutations/schema.ts)); the compiler
  inlines the lookup as one scalar subquery
  ([engine.ts:350](../../packages/vex/src/mutations/engine.ts)), and its
  filter grammar has no `$item`. So the draft's "`to_address` arrives via an
  engine-applied `$lookup` on the anchor's `mail_to` keyed by `person_id`" is
  true of ONE row per call and false of N. **Fix: the address is resolved by
  the audience read and travels as a `$item` — which is safe because the
  resolution happens server-side (§2.2), so it is still true that no screen
  ever handles an address.**

---

## Part 2 — Stage 0: the spine (audience → partition → send)

The walking skeleton. Everything later hangs on it; nothing later changes it.
Ships alone, and it is useful alone — this stage IS the "retention verbs"
feature, absorbed.

**The shape of the whole stage, in one sentence, because four mechanisms
changed and the shape did not:** the owner picks a QUESTION, unticks whoever
they want left out, and presses Send; that writes ONE campaign row; a reflex
running as the studio's own machinery re-asks the question, drops the
unticked and the unwritable, and fans the answer into the outbox in a single
statement. Nothing a browser holds is ever an address, a recipient list, or
a permission to mail somebody.

### 2.1 The campaign row

```sql
CREATE TABLE campaigns (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  studio_id    TEXT NOT NULL REFERENCES studios(id),
  subject      TEXT NOT NULL,
  -- Stage 0: the body is text. Stage 1 adds `layout JSONB` beside it and the
  -- text becomes the fallback part. Never a third column after that.
  body         TEXT NOT NULL DEFAULT '',
  -- WHO THIS WENT TO, AS THE QUESTION THAT WAS ASKED — and it is the question
  -- because a page of ticked names is not an audience (G4). Three keys:
  --
  --   { "audience": "roll/trial",        -- a name from the closed list, §2.3
  --     "context":  { "cutoff": "..." }, -- what that question needs to be asked
  --     "except":   ["person-id", ...] } -- who the owner struck off by hand
  --
  -- `except` is SUBTRACTION FROM A QUESTION, never the way one is assembled:
  -- it is how "everybody on trial, but not him" is sayable, and it stays a
  -- handful of ids rather than a recipient list. No prose in here — the label
  -- an owner reads ("Gone quiet · 30 days") is composed by the screen from
  -- the audience name, so it goes through the phrasebook like every other
  -- sentence in the product.
  audience     JSONB NOT NULL,
  -- 'sending' is what the fan-out reflex arms on; 'draft' exists for Stage 2's
  -- editor and wakes nothing. 'refused' is the cap saying no BEFORE any mail
  -- exists — see §2.3, and see the outbox's own posture: a failure is a value
  -- with words on it, not a crash and not a silence.
  state          TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'sending', 'sent', 'refused')),
  refused_reason TEXT NOT NULL DEFAULT '',
  queued_count   INTEGER NOT NULL DEFAULT 0,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

And two things on the outbox: `campaign_id TEXT REFERENCES campaigns(id)`,
nullable — automation mail has none — and

```sql
CREATE UNIQUE INDEX outbox_campaign_person ON outbox (campaign_id, person_id)
  WHERE campaign_id IS NOT NULL;
```

That column is what makes a campaign's report an aggregate over rows that
already exist. **That index is what makes the fan-out safe to run twice.**
The reflex writes N rows in one statement and then stamps the campaign
`sent`; a process that dies between those two is a process that runs the
statement again, and the alternative to this index is a claim state machine
on `campaigns` duplicating the one `outbox` already has. With it, the second
run inserts nothing (`onConflict: DO NOTHING`, which vex's insert grammar
already carries — [schema.ts:97](../../packages/vex/src/mutations/schema.ts))
and nobody gets a second copy.

**No recipient snapshot table.** The outbox rows ARE the record of who was
written to. Resist inventing a `campaign_recipients` — it is the same fact
twice, and the copy that is not load-bearing will drift.

### 2.2 The send — a campaign is written, and mail is a consequence

**The button does not queue mail.** It inserts one row: the campaign, with
its subject, its body and its audience. That is the whole of what a human's
principal does, and it is what keeps the charter's sentence true — *"`outbox`
is the one table in this app that no human ever writes"*
([charter.ts:290](../../apps/lab/lyra/src/app/charter/charter.ts), G6). The
manager rung gains `campaigns.read` and `campaigns.write.insert`; it gains
nothing on `outbox` beyond the `outbox.read` it already holds.

**A reflex does the rest**, armed on `campaigns` insert where the state is
`sending`, running as the `automation` principal by `executeAs` — the
identity law's machinery path, no new door, no new role. In order:

1. **Re-ask the question.** The reflex reads the audience entry named by the
   row (§2.3) with the row's own `context` and `except`, as the automation
   principal — which already holds every read those questions need
   (`studio_people`, `people`, `subscriptions`, `mail_suppressions`,
   `class_sessions`, `bookings` — [charter.ts:270](../../apps/lab/lyra/src/app/charter/charter.ts);
   `automation/not-seen-since` runs on this rung today). **Re-asking rather
   than trusting the sheet's answer is the consent story:** somebody who
   opted out in the ninety seconds it took to write three sentences is
   somebody this send does not reach, and the screen's numbers were always
   advisory — that was true in the first draft and it is now literally how it
   works.
2. **Keep only `ok`.** The read answers a disposition per person; the reflex
   takes the `ok` rows. There is no path by which a `no_consent` row reaches
   an insert, because the thing that decides is the read the write is built
   from — not a filter somebody remembered to apply.
3. **One statement.** `insertEach` over those rows: `to_address` and
   `person_id` as `{$item}` (G7 — a `$lookup` here would resolve once for
   everybody, which is one wrong address repeated N times), `campaign_id`,
   `subject`, `body`, `source` as `$context`, and `marketing: true` as a
   literal. `onConflict: DO NOTHING` against the index above.
4. **Stamp the campaign** `sent`, with `queued_count` and `sent_at`.

The address never leaves the server: it is resolved by a read the reflex
performs and consumed by a write the reflex performs, in the same principal,
in the same task. **The screen never handles an address** — the first
draft's promise, kept by a different mechanism, and kept more strictly than
before (a browser now cannot see one even for the people it CAN see).

Every row carries `marketing: true`. Bulk send from a list is marketing,
full stop — the unsubscribe footer and `List-Unsubscribe` headers ride the
flag that already exists on the outbox row. **No toggle on the compose
sheet.** A desk under pressure will flip a toggle to reach the opted-out;
the absence of the toggle is the consent feature (D-c from the review
discussion, settled).

Existing dispatch takes it from there, unchanged, one row at a time, claimed,
capped, swept, idempotent. Nothing in this stage sends anything.

### 2.3 The honest partition — answered, not filtered

Before anything sends, the compose sheet says: *"412 in this list — 397 will
be written to. 12 have opted out. 2 have no address. 1 reported us."* Named
counts, not a surprise in the outbox.

This needs audience entries that **answer** a disposition instead of
filtering on it (G5) — the doctrine `automation/outbox-queued` already keeps
for suppression, in those words: *"SUPPRESSED IS ANSWERED, NOT FILTERED"*,
and for the same reason, that a row dropped from an answer is a fact nobody
can be shown ([tide.entries.ts:449](../../apps/lab/lyra/src/app/vex/tide.entries.ts)).
The disposition is one computed column, `case`-shaped like that one:
`no_address` (`mail_to` NULL) / `no_consent` (`marketing_ok = false`) /
`suppressed` (a `mail_suppressions` row for this address, this studio or the
empty one) / `ok`.

**Entries by SHAPE, not by lens.** The roll's nine lenses are one
fingerprint already — the guarded-arm pattern, where each arm is `{$context
'lens'} = 'trial'` and a lens nobody declared matches nothing
([member.entries.ts:230](../../apps/lab/lyra/src/app/vex/member.entries.ts)).
Campaigns reuse it exactly. So Stage 0 ships three entries and eleven
audiences:

| Entry | Answers |
|---|---|
| `campaigns/audience-count` | the four counts, for the sheet's sentence |
| `campaigns/audience-page` | a page of `{ person_id, person_name, disposition }` — the untick list. **No address in the shape**, deliberately: the browser has no business holding one. |
| `campaigns/audience-resolve` | `{ person_id, to_address }` for the `ok` rows — automation rung only, and the only place an address is ever selected |

All three take the same context: the audience name, its parameters, and
`except` — which is an engine-side `notIn` on the id
([filter.schema.ts:80](../../packages/vex/src/schemas/filter.schema.ts))
under an `optional` key, so unticking nobody sends no key at all rather than
an empty sentinel. Same question, three depths — and because the exclusion
lives in the filter, the count on the sheet and the rows in the outbox
answer the same question by construction.

**The cap is part of the partition.** Dispatch fails capped messages rather
than deferring them ([tide.ts:139](../../apps/lab/lyra/src/server/tide.ts) —
right for a reminder about tomorrow's class, wrong for a newsletter silently
half-sent). So compose reads today's remaining headroom (a manager-rung
entry over `outbox` + `studios.daily_mail_cap`; the automation rung's
`automation/sent-today` is not readable from here) and the send button says
*"397 to send, 603 left today"* — and does not fire when it does not fit.
**The reflex checks it again** for the same reason it re-asks the question,
and a campaign that no longer fits lands `refused` with the number in
`refused_reason` rather than queueing a newsletter that goes half out. Do
not change dispatch; guard at the source, twice.

### 2.4 Where the verb lives

**Its own area — *Marketing*** (D1, decided): Campaigns, and the outbox view
that has never had a home. One row in
[`nav/sections.ts`](../../apps/lab/lyra/src/app/nav/sections.ts), whose
labels and blurbs the harvest walks like every other area's.

The audience is picked *on the compose sheet* — it is a dropdown of the
eleven names, which is the whole "deleted concepts" argument made concrete:
no list import, no segment builder, no field mapping, because the questions
already exist and the studio already thinks in them. Retention's two lists
and the People roll grow a **"Write to this list"** button that opens the
sheet with the audience preselected — the deep link, not the mechanism.

`Rows`' `selectRef` is used for the untick list on the sheet, which is its
first appearance anywhere outside a fixture (G4) — budget for finding out
what is wrong with it, and expect `click-check` to grow the coverage that
proves it.

Plus `campaigns.list`: what was sent, when, to which question, with counts —
the screen an owner opens twice a week.

Charter: `campaigns.*` actions and `campaigns.read`/`campaigns.write.insert`
land on the **manager** rung
([charter.ts:198](../../apps/lab/lyra/src/app/charter/charter.ts)) beside
`automations.*` — the desk selects and serves people; deciding what the
studio broadcasts is a manager's call. The `automation` rung gains
`campaigns.read` and `campaigns.write.update` (the stamp), and nothing else.

### 2.5 Done when (`campaigns-check`, new suite)

A German studio, an audience of "gone quiet · 30 days" holding four people —
one opted out, one a child with a guardian, one whose address the provider
suppressed, one ordinary member — and one more member the owner unticks.

Asserts: the count entry names all four dispositions and the sheet's
sentence is composed from them, not concatenated; the campaign row stores
the question, its context and the unticked id; **exactly two** outbox rows
land when the reflex runs — the ordinary member and the child, the child's
addressed to the guardian — both `marketing`, both carrying the
`campaign_id`; the opted-out and suppressed people have no row
and no error; the unticked person has no row; running the fan-out a second
time inserts nothing (the index); `queued_count` is 2 and `sent_at` is
stamped; a campaign whose audience exceeds today's headroom lands `refused`
with the number and queues NOTHING; and a manager principal attempting
`outbox.write.insert` directly is refused by the charter. Wire it into
`all-checks.ts`.

---

## Part 3 — Stage 1: beautiful by default (the email adapter and the house templates)

The stage where the product grows its face. The bar, stated once: **a studio
picks a template, types three sentences, and the result looks like they
hired a designer — wearing the studio's own theme, in the studio's own
language, with zero configuration.**

### 3.1 The email adapter — nova's fifth surface

Nova has four adapters (`react`, `dom`, `ink`, `tty` —
[packages/nova/src/adapters/](../../packages/nova/src/adapters)); the core is
deliberately surface-blind. Email is the fifth: a walker over the same
layout JSON against an **email-safe component registry**, emitting the HTML
dialect inboxes actually render — nested tables, inline styles, no flexbox,
no grid, no external CSS, no JS, bulletproof buttons, `width` attributes on
images.

Constraints that are design inputs, not trivia:

- **Outlook desktop renders with Word's engine.** Tables and inline styles
  only. The registry emits VML-free markup and accepts the corners will be
  square there — no conditional-comment arms race in v1.
- **Gmail clips at ~102KB.** The adapter enforces a size budget: rendering
  asserts the emitted HTML is under 90KB and the blocks are bounded (the
  schedule block caps its rows) so a template cannot wander over the cliff.
- **Theme tokens resolve to literal values at render time.** CSS custom
  properties do not survive an inbox. The adapter takes the studio's
  resolved token set (the same rows the shell wears) and prints hex.
- **The language pass runs before serialization** — the same
  `@niscorp/nova/i18n` pass moss runs on shells, over the email tree, in
  `studios.locale`. Per-person locale stays future, exactly as I18N.md says.
- **Where it runs:** server-side, at queue time, per recipient (the layout
  walk is cheap — the shell bench prices a full navigation in ~18ms; a
  2,000-recipient studio renders in seconds). Personalization slots fill
  per recipient via prism against the recipient's row — `$fill` exists
  ([me.actions.ts:128](../../apps/lab/lyra/src/app/actions/surfaces/me/me.actions.ts))
  and the pattern machinery is the one the i18n work built. **No string
  concatenation composes a sentence anywhere** — the phrase-harvest weld
  rule applies to email templates too, and the harvest should walk them.

Close **G1** here: `Envelope` gains `html?`; the `text` part is generated
from the same tree by the `tty`-style plain walk (a real text part, not a
stripped-tags afterthought — it is what previews and spam scoring read).

**Package placement:** the adapter is generic (`@niscorp/nova/adapters/email`)
and touches `packages/nova` — per the standing rule, ask for that change
explicitly and land it in isolation with its own tests before any Lyra work
consumes it.

### 3.2 The block vocabulary — closed, and closed on purpose

Ten blocks. Intake of an eleventh is a design conversation, not a PR:

| Block | Notes |
|---|---|
| `header` | Studio name/logo, accent bar from theme |
| `heading`, `text` | The measure rules from `Prose` apply |
| `image` | Needs Stage 2's asset pipeline; Stage 1 ships without it or with URL-only |
| `button` | Bulletproof markup; the one CTA per email the templates encourage |
| `divider`, `spacer` | Structure |
| `schedule` | **Vertical block**: "this week at the studio" — filled at queue time from the same session reads the app uses, bounded to N rows, in the studio's locale |
| `course` | **Vertical block**: a real course row — name, dates, places left, price |
| `footer` | **Mandatory and not optional in any template** — but see below: the adapter reserves it, dispatch fills it. |

**The footer already has an author, and it is not the adapter.** Dispatch
composes the unsubscribe line into the text, sets `List-Unsubscribe` and
`List-Unsubscribe-Post`, and — the part that matters — **fails the row
outright when no unsubscribe secret is configured**, because marketing mail
carrying an opt-out that will not verify is worse than none
([tide.ts:120–160](../../apps/lab/lyra/src/server/tide.ts)). It can do that
because it is the only place that holds the secret and the per-recipient
link. A second author at render time means either a doubled footer or an
HTML part whose opt-out exists only in the text part.

So: **the adapter emits the footer's SHAPE — the studio's `legal_name` and
`address` ([studios.ts:51](../../apps/lab/lyra/src/db/schema/studios.ts)),
the rule, the spacing, and a marked slot where the link belongs — and
dispatch substitutes the link into both parts.** A template that omits the
block cannot be expressed; a deployment that cannot mint the link still
refuses to send. Compliance by construction, with one author.

The vertical blocks are the moat made visible: Mailchimp cannot ship a block
that knows what a class is. Their reads run as the machinery principal at
queue time — the automation rung already holds `class_sessions.read`,
`bookings.read` ([charter.ts:70](../../apps/lab/lyra/src/app/charter/charter.ts)),
consistent with the identity law (machinery via `executeAs`, no new doors).

### 3.3 Six house templates

Newsletter · announcement · schedule-this-week · new-course · offer · plain
note. Each is a nova layout wearing tokens, seeded as rows (Stage 2's editor
edits copies of them per studio; until then they are pick-and-fill). Every
one passes the size budget and an extended `design-check`: the email palette
meets the same ≥4.5:1 contrast rule against the studio's resolved tokens
that the app's tones do — the suite that already knows how to hold this
([design-check.ts](../../apps/lab/lyra/src/dev/design-check.ts)).

### 3.4 The Book button (D4, decided)

What a member sees, and it is three taps with nothing typed:

> **Book** in the email → *"Tuesday 18:00 · Vinyasa with Anna. 3 places
> left."* → **Book it** → booked, and signed in, so the next tap is *My
> classes*.

**Nobody here is signing up.** A campaign reaches people the studio already
knows — a `people` row, a `studio_people` anchor, `marketing_ok` ticked —
and every one of them can already sign in by typing their address today
([auth.ts:27](../../apps/lab/lyra/src/server/functions/auth.ts)).
There is no account to create, and a Book button that offered to create one
would be offering a second identity to somebody who has one. (The stranger
on the studio's website IS an account to create, name and all — that is the
public-surface track, and it should work exactly the way the instinct says.)

So the button is the sign-in link the product already has, with two
differences and no third: **it lasts a week, and it knows which class.**
Shaped like `login_links` — a row that IS the credential, 256 bits, no
signature, redeemed by `DELETE…RETURNING` — plus a `target`. **G2 stands:
do not widen `login_links` itself**; its fifteen minutes is a property
`auth-check` pins, and a forwarded newsletter must not be a standing key.

**The confirm screen is not a tax, it is the screen.** A link that books
somebody the instant they tap it books people who tapped it to see what it
was; showing the class first is what you would design with no security
question in the room at all. That it also survives corporate mail scanners
— which follow links looking for malware, and would otherwise spend a
single-use credential before the human ever saw it, on a mail with no
"send me another" to fall back on — is a consequence, not the reason.
**The confirm button spends the token; the link does not.**

**Whose session, when the mail went to a guardian.** A child's mail reaches
an adult ([people.ts:151](../../apps/lab/lyra/src/db/schema/people.ts)), so
the human tapping Book in a child's newsletter is the parent. The token
therefore signs in **the owner of the address it was sent to**, and carries
the child as the booking's subject — a parent acting for their child, which
is the shape the families work already built and the engine already pins by
`$lookup`. Minting a session for the person the mail is ABOUT would hand a
parent a login as their seven-year-old, which that work deliberately
refused. The token needs both ids, and `campaigns-check` needs the case.

### 3.5 The compliance gates that ride Stage 1

- **Double-opt-in + provenance.** `marketing_ok` is a boolean with no
  history. Add `marketing_ok_at TIMESTAMPTZ` and `marketing_ok_source TEXT`
  (`desk` / `confirmed` / `imported`), and a confirmation door: a public
  route in the unsubscribe door's exact shape
  ([unsubscribe.ts](../../apps/lab/lyra/src/server/unsubscribe.ts)) that
  flips consent to `confirmed` from a signed link. The desk checkbox stays
  legal collection for v1 (AT); the door exists so self-serve signup (the
  public-surface track) has consent that stands up. `consent-check` grows
  the provenance assertions.
- **A child's consent is their guardian's** — the families plan flagged this
  half-open (R6). The partition already routes by `mail_to`; the provenance
  columns record *whose* yes it was. The remaining policy question (which
  guardian of two, what unsubscribe acts on) is **D3 in
  [lyra-families.md](lyra-families.md) §8.8 — do not resolve it silently
  here**; until decided, unsubscribe on a guardian-routed address suppresses
  that ADDRESS for that studio (the machinery that exists), which is the
  conservative reading.
- **BYOD must run before volume.** Built end to end, never executed — the
  provider key is send-only ([lyra-mail.md](lyra-mail.md) step 8). Marketing
  volume on a shared sender domain is a reputation time bomb. This is a
  HUMAN task (D5): procure the full-scope key, run the domain flow once
  against a real DNS zone, and mark the plan.

### 3.6 Done when

`email-adapter` tests in nova (isolated commit): tree → HTML snapshots per
block, footer injection unconditional, token resolution to literals, size
budget asserted, text part generated. In lyra, `campaigns-check` grows: a
template send produces HTML mail (both parts), the schedule block's rows
match the timetable read for the same window, the German studio's email is
German (harvest covers template phrases), and a send to a member with the
Book button yields a token that redeems once onto the right session — and
not twice.

---

## Part 4 — Stage 2: the form (not an editor) and the asset pipeline

### 4.1 It is a form, not an editor (D8, decided)

**An owner who has never sent a newsletter is done in two minutes.** They
pick a template and get a short list of what is in it:

> Headline · `[Winter term starts Monday]`
> Words · `[three sentences]`
> ☑ This week's schedule
> ☑ Button — `[Book a class]`

Toggles and text fields, in the template's own order. **Nothing to drag,
nothing to add, nothing to learn, and nothing an owner can produce that
looks bad** — which is the actual promise, and a canvas cannot keep it.
Live preview beside it rendered by the **react adapter from the same
artifact** (one layout, two surfaces — the demo IS the architecture), and
"send me a test" to the signed-in owner.

**Why this is a stopping point and not a cop-out:** it edits exactly the
data a block editor would. Ticking *This week's schedule* writes the same
layout node either way, so if a real studio asks to reorder blocks or add a
second paragraph, the editor GROWS from this rather than replacing it — the
form is the palette with `add` and `move` withheld. So the rule from the
first draft stands and matters more, not less: **architect the palette and
block-property schemas as data from day one**, because this is the machinery
that later grows a site palette and a `theme_layouts` configurator palette
([lyra-model-overhaul.md](lyra-model-overhaul.md) Part 10).

**What it is not, and what it will not become without a decision recorded
here:** freeform drag-anywhere design, custom fonts, arbitrary HTML, nested
columns, adding a block that is not in the chosen template.

**How it is built:** an ordinary nova action (`campaigns.compose`) whose
data is the draft layout — nova editing a nova artifact, loom's
schema-driven property editing for a block's props. Saved studio templates
are rows beside the house ones.

### 4.2 The asset pipeline — the one genuinely new piece of infrastructure

Nothing in the product uploads, stores, or serves a file. Email images need
public URLs; so will the public site; the theme's logo wants one too.

- **The seam:** `{ put(bytes, meta) → assetId, url(assetId) → public URL }`
  — a two-function store in the D2 tradition (swap the seam, not the
  callers). Dev: local disk under the server, served by a route. Prod: the
  bucket D2 decides.
- **Upload:** one new server route (multipart — the first non-JSON endpoint;
  moss `fn:` endpoints are JSON, so this is an explicit new door), owner/
  manager-gated, accepting jpeg/png/webp ≤ 2MB, re-encoded and capped at
  1600px on the long edge (strips EXIF including GPS — a studio's phone
  photo should not publish coordinates).
- **Serving is PUBLIC, and that is a decision being made, not an accident.**
  PLAN.md's deployment rules say a new public route must be chosen
  deliberately ([PLAN.md](../../apps/lab/lyra/PLAN.md), *Deployment*).
  Asset URLs are unguessable (the id is the hash), carry no identity, and
  serve bytes only. Write that paragraph in the code where the route lands.
- **Ownership:** `assets` table — id (content hash), studio_id, filename,
  bytes/dims, created_at. Tenancy on the row like everything else; the URL
  being public does not make the LIST public.

### 4.3 Done when

`assets-check`: upload → public URL serves the bytes → EXIF gone → a second
identical upload dedupes on hash → another studio cannot list it.
`render-check`/`click-check` grow the compose screen the way they grew every
other screen. And the editor's falsifiable fixture: a layout containing an
eleventh block name is refused by the palette schema, not rendered broken.

---

## Part 5 — Stage 3: close the loop (measurement, and the recipes get beautiful)

- **Opens and clicks.** The provider reports them; `readEvent` already
  parses `delivered`/`bounced`/`complained` and shrugs at `other`
  ([client.ts:137](../../apps/lab/lyra/src/server/mail/client.ts)). Extend
  the event kinds, and stamp `opened_at` / `first_clicked_at` on the outbox
  row by `provider_message_id` — columns beside `delivered_at`, same
  pattern, no new table. Signature verification is the bounce door's,
  already checked (`bounce-check`).
- **The report is five numbers.** Sent · delivered · opened · clicked ·
  unsubscribed, per campaign, aggregated from outbox rows by `campaign_id`.
  One screen, no dashboard maze. An honest asterisk in the copy: opens are
  approximate (Apple MPP inflates them) — say "opened (approx.)" rather
  than pretending.
- **The recipes send the beautiful version.** Point tide's five mail recipes
  at the house templates (welcome rides the newsletter shape with a
  schedule block). The composed-sentence i18n discipline already covers
  recipe copy; the template's phrases join the harvest. **No journey
  builder** — the recipes ARE the journeys until a real studio asks for
  more, per the automations doctrine ([PLAN.md](../../apps/lab/lyra/PLAN.md),
  *Automations: rules out, moments in*).
- **Done when:** `campaigns-check` replays a provider `opened` webhook and
  the report's number moves; a forged one is a 200 that changed nothing
  (the bounce-check property, inherited).

---

## Part 6 — deliberately NOT building (the discipline list)

Written down so the agent does not wander and the next reviewer does not
"helpfully" add one: **A/B testing · send-time optimization · audience
scoring · landing pages and signup forms** (that is the public-surface
track; its trial form feeds THIS consent machinery) · **SMS** (the outbox
has the `channel` column; that is the whole provision) · **freeform design
canvas · template marketplace · per-person locale · a second mail
provider · a journey builder.** Each is either breadth (the race this plan
refuses) or another plan's work.

---

## Part 7 — decisions a human must make

Three are **answered** (2026-08-16) and built into Parts 2 and 3; two remain.

| # | Decision | Blocks | State |
|---|---|---|---|
| **D1** | Where campaigns lives in the nav | Stage 0 | **DECIDED: its own area, *Marketing*** — Campaigns plus the outbox view, which has never had a home. A weekly-use owner surface, not a setting. |
| **D6** | What an audience IS: a question the app re-asks, or a list of ticked names | Stage 0 | **DECIDED: the question, minus who the owner strikes off.** Pick a list by name, untick individuals, send. The ticked-names-only design cannot express an audience larger than one page of the roll (G4); the question-only design cannot leave out the one awkward person. `audience` JSONB carries both halves (§2.1). |
| **D7** | Who writes the outbox rows | Stage 0 | **DECIDED: a reflex, as the automation principal.** The button writes a campaign; machinery turns it into mail. Keeps the charter's "no human ever writes `outbox`" sentence true (G6), makes a 2,000-recipient render a task rather than a request, and re-asks the consent question at the moment of writing rather than trusting a ninety-second-old screen. |
| **D2** | Asset store shape — provider bucket vs self-hosted disk behind the seam | Stage 2 | Decide with hosting (PLAN.md D2 defers hosting; the seam makes this cheap to defer, expensive to skip) |
| **D3** | *(In lyra-families.md)* Whose consent for a child, which guardian of two, what unsubscribe acts on | Nothing — conservative default ships (suppress the address) | Decide before the public signup form exists |
| **D4** | The Book button | Stage 1's flagship moment | **DECIDED: build it — the sign-in link with a week's life and a destination.** Nobody in a campaign lacks an account, so there is nothing to create; the only problem was that a 15-minute link is dead by the time a newsletter is read. Single-use, **spent by the confirm button rather than by the link**, because the confirm screen is the screen you would design anyway and it happens to survive mail scanners. Signs in the address's owner, targets the child — §3.4. |
| **D8** | Editor shape | Stage 2 | **DECIDED: a form, not an editor.** Toggles and text fields over the chosen template's own blocks. Same data a block editor would write, so the editor grows from it later if a real studio asks — §4.1. |
| **D5** | Procure the full-scope provider key and run BYOD once for real | Volume, not code | Do it during Stage 1; it is a vendor errand, not engineering |

---

## Part 8 — build order, and the two traps

**Order:** ~~Stage 0~~ **(done)** → 3.1–3.3 with the nova adapter as its own
isolated, approved commit → 3.4 after D4 → 3.5 alongside → Stage 2 (the form
after assets; assets after D2) → Stage 3. Do not batch stages; each has its
own check gate and lands green (`pnpm check` grows by one suite per stage,
never shrinks).

**What Stage 0 actually touched**, for whoever picks up Stage 1:
`db/schema/campaigns.ts` (new) and two columns plus one unique index on
`outbox`; `app/vex/campaign.entries.ts` (new — eight audiences, three reads,
four writes); `charter.ts` (manager gains `campaigns.*` and the suppression
READ; the automation rung gains `campaigns.read` + `write.update` and nothing
on `outbox` it did not already hold); `behaviors.ts`; a `campaigns` vex
resource; `reflexes/compose.ts` (`campaignReflex`) and `server/tide.ts`
(`campaign.fanOut`, the second effect that is not one write);
`actions/domains/campaigns/` (two screens); the Marketing nav area; the
German book; and `dev/campaigns-check.ts`. `tide-check` counts three
infrastructure reflexes per studio now rather than two.

**Trap 1 — the second sender.** The moment campaign sending grows its own
"just this once" path around the outbox (a loop calling `send()` directly,
a bulk endpoint at the integration service, anything), the claim state
machine, the cap, the suppression list, the idempotency key and the sweep
all silently stop applying to the product's highest-volume mail. Every
message is an outbox row. If a requirement seems to need a second path, the
requirement is wrong or the outbox needs a column — bring it back as a
question.

**Trap 2 — the open vocabulary.** Every email tool that died ugly died by
block accretion. The palette is ten blocks; the eleventh is a design
decision recorded in this file, with the contrast, size-budget, harvest and
snapshot obligations that every existing block carries. The schema refusing
unknown blocks is the enforcement (Part 4.3's fixture), not this paragraph.

**Five small facts that will each cost an hour if discovered late** — none
is a design question, and all five were verified 2026-08-16:

- **There is no migration system, and none is wanted.** DDL is composed in
  dependency order and applied as one statement at boot
  ([db/schema/index.ts](../../apps/lab/lyra/src/db/schema/index.ts)); a
  development database is replayed from seed. `campaigns`, the two outbox
  columns and the index are an edit to a fragment, not a migration. Do not
  build one on the way past.
- **The phrasebook harvest walks four sources**, named in the file: the
  action catalogue, the nav table, the moments/recipes, and the entries
  ([phrase-harvest.ts](../../apps/lab/lyra/src/dev/phrase-harvest.ts)).
  Email templates are a fifth, and a template whose phrases the harvest
  cannot enumerate is a German studio sending English mail with a green
  `language-check`. Grow the harvest in the same commit as the templates.
- **The compose sheet cannot read `automation/sent-today`** — it is on the
  automation rung. Today's headroom needs its own manager-rung entry over
  `outbox` and `studios.daily_mail_cap`.
- **`outbox.source` already exists** and is tempting as a place to write
  `campaign:<id>`. It is not the column: the report aggregates, `source` is
  free text, and a foreign key is what makes the aggregate cheap and the
  orphan impossible.
- **`design-check` checks the app's tones**, not an email's. Extending it
  means the studio's *resolved* token set has to be reachable outside the
  shell — the same set the email adapter prints as hex (§3.1). Do that once,
  for both.

**Whole-plan done-when:** an owner at a German studio selects "Gone quiet ·
30 days", picks the offer template, types three sentences, sees *"39 will
be written to — 2 opted out, 1 unreachable"*, sends, and every recipient
gets a designed, German, theme-correct email whose footer carries the
studio's own name and address, whose child recipients' mail reached their
guardians, whose Book button books, and whose five numbers appear on the
campaign's row — while `pnpm check` stays green with three new suites, and
not one line of it touched a second mail door.
