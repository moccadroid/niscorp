# lyra — defects from the product review

> **Status (2026-08-14): in progress.** Decisions taken: D1 = a prose-capable
> `phrase` prop on Field/Stat, local to lyra (nova untouched); D2 = none —
> first version, fingerprints may change freely, 4.3 dropped; D3 = rename the
> two keys off the suffix. Landed: Part 2.7 (language-check + phrase-harvest
> gate `pnpm check`, one PHRASE_KEYS declaration), Part 1 (all four member
> fixes, checks grown), 6.1, 6.2's comment, 6.3, 6.4. Open: 2.1–2.6, Part 3,
> Part 5 (bench numbers re-measured 2026-08-14 and WORSE: 214.5 KB/shell,
> 384 KB/nav without --expose-gc), 4.1, 4.2, 4.4, 6.5.
>
> Every item below was found by clicking
> the running app or reading the code at the cited line, and each one is
> reproducible. Nothing here is a feature request — this is the list of things
> that are wrong, missing their last wire, or silently unenforced.
>
> **All 44 checks pass and every defect below survives them.** That is the
> shape of this list: the suites assert what was built, and these are the
> places where what was built was never connected, never declared, or never
> looked at on a screen.
>
> Every claim carries a `file:line`. Claims marked **[seen]** were reproduced
> in a browser against the dev server; claims marked **[measured]** came out of
> a bench or a harvest run. Anything uncited is opinion — check it.

---

## Part 0 — how to work this

Parts are ordered by **damage per unit of work**, not by area. Part 1 is four
small fixes to the screens a paying member looks at. Part 2 is one connected
problem that must be done as a piece. Parts 4–6 carry the two items that need
a human decision first — they are marked **DECISION** and should not be
started until Part 8 is answered.

Do not batch Part 1 with Part 2. Part 1 is behaviour; Part 2 is vocabulary,
and mixing them makes both diffs unreviewable.

---

## Part 1 — member-facing correctness

Four defects on the two screens a member opens most. All four were in the
previous review and none were fixed, so treat the list as the first thing that
lands.

### 1.1 A cancelled class still tells the member they are booked — **[seen]**

The most damaging bug in the product.

`me/bookings` filters the BOOKING's status and never looks at the SESSION's:

```
apps/lab/lyra/src/app/vex/me.entries.ts:102
filter: { and: [
  { gte: ['class_sessions.held_on', { $scope: 'today' }] },
  { neq: ['bookings.status', 'cancelled'] },
] }
```

Reproduced against the seed, same shell, same moment, one session
(`Yin & Restore`, Tue 18 Aug):

| Screen | Renders |
|---|---|
| Book a class (`me.classes`) | `Yin & Restore \| Di., 18. \| Abgesagt \| 1 von 18` — correct, no Book button |
| My classes (`me.bookings`) | `Yin & Restore \| Di., 18. Aug. \| Booked` — **wrong** |

The studio cancels the class; the member finds out by turning up.

**Fix.** Two parts, and do both — hiding it is not enough.

1. Add `class_sessions.status` to the entry's fields, and surface it. A
   cancelled session must not read `Booked`; it reads as cancelled, with its
   own tone, and the Cancel verb hidden (there is nothing left to cancel).
2. Do **not** simply filter cancelled sessions out. A member who booked a
   class needs to be told it is off — removing the row silently is the same
   failure with better manners.

**Done when.** A check cancels a seeded session a member holds a booking for,
renders `me.bookings` for that member, and asserts the row is present, is not
labelled `Booked`, and offers no Cancel. Put it in `member-check`.

### 1.2 No time on any booked class — **[seen]**

The field is already fetched and then dropped.

```
apps/lab/lyra/src/app/vex/me.entries.ts:98   { field: 'class_sessions.starts_at', as: 'starts_at' }   ← selected
apps/lab/lyra/src/app/vex/me.entries.ts:117  when_display: dateText(row('held_on'))                    ← time discarded
```

`starts_at` is used only for `sort`. Both screens that bind `when_display`
(`me.layouts.ts:106` on Today, `me.layouts.ts:315` on My classes) therefore
show `Do., 13. Aug.` with no time — on the screen whose entire job is telling
somebody when to turn up.

**Fix.** Compose `when_display` from day *and* time. Note this interacts with
Part 2.3: do not build it with a `$join` of English fragments — the date and
the time each already have a locale-aware op, and the separator is
punctuation, not a word.

**Done when.** `member-check` asserts a booked row's `when_display` contains
the session's `starts_at`.

### 1.3 The booking list does not know what the member already booked — **[seen]**

The read exists and has existed for two reviews. Its own comment says what it
is for:

```
apps/lab/lyra/src/app/vex/me.entries.ts:130
// So the class list can mark what they already hold, without a join their
// policy would not permit anyway.
export const myBookedSessions = { fingerprint: 'me/booked-sessions', … }
```

Nothing calls it. The Book cell carries one condition and it is not this one:

```
apps/lab/lyra/src/app/actions/surfaces/me/me.layouts.ts:289
{ cell: { kind: 'action', label: 'Book', ref: 'book', …, hideKey: 'cancelled' } }
```

Seen: `Open Practice | Do., 13. | 12:00 | 1 von 12 | Buchen` — the member is
already booked into that session; it is in her own My-classes list.

**Fix.** Call `me/booked-sessions` on mount alongside the class list, mark each
session, and swap the verb: booked → a `Booked` state and no Book button (or a
Cancel, if you want the two screens to converge). The `UNIQUE (session_id,
person_id)` constraint means the current behaviour is a guaranteed error
message, not a double booking — but the member is being invited to press a
button that cannot work.

**Done when.** `member-check` renders `me.classes` for a member holding a
booking and asserts that session's row offers no Book.

### 1.4 "Committed until" prints a meaningless past date — **[seen]**

With no minimum term the trigger stamps the start date:

```
apps/lab/lyra/src/db/schema.ts:456
IF NEW.committed_until IS NULL THEN
  NEW.committed_until := NEW.started_on + (p.minimum_term_months || ' months')::interval;
END IF;
```

`minimum_term_months = 0` → `committed_until = started_on`. The screen then
reads, in one card: `MINDESTLAUFZEIT: No minimum` beside `GEBUNDEN BIS:
Do., 19. Juni` — a commitment date in the past, next to a statement that there
is no commitment.

The arithmetic downstream is unharmed (`ends_on = GREATEST(committed_until,
…)` at `schema.ts:466` — a past date loses). **This is a display defect only;
do not change the column or the trigger.**

**Fix.** `committed_display` returns empty when the offering has no minimum
term, and both Fields (`people.layouts.ts:170`, `me.layouts.ts:167`) use their
`empty:` prop.

**Done when.** `model-check` asserts a no-minimum subscription renders no
committed-until value.

---

## Part 2 — i18n: finish the mechanism

**The architecture is right and the product is not localized.** Words as rows,
nova language-blind, `Intl` for unbounded cardinality, language separated from
region — all correct, all keep. What is missing is that three categories of
word never reach the pass at all, and nothing measures it.

Harvest says **466 of 494 phrases translated for de-AT** — **[measured]** — and
that number is true and irrelevant, because the harvester walks authored
layouts and by design never sees a word a read manufactures
(`packages/nova/src/i18n/harvest.ts:16`).

Do 2.1 through 2.4 as one change. They are one problem seen from four sides.

### 2.1 `_label` keys are not declared as prose

The app declares one suffix:

```
apps/lab/lyra/src/app/app.ts:233
phraseKeys: { props: [...DEFAULT_PHRASE_KEYS.props, 'role', 'phrase', 'why', 'sentence'],
              suffixes: ['_display'] }
```

But the vex mappings use **two** conventions — 32 keys end `_display` and
**8 end `_label`**: `state_label`, `status_label`, `arrived_label`,
`kind_label`, `place_label`, `days_label`, `body_label`, `subject_label`.

The proof this is the cause and not a missing translation: `Booked` **is** in
the German book at `apps/lab/lyra/src/db/phrases.de.ts:111` (`Booked:
'Gebucht'`) and still renders `Booked` **[seen]**, because it arrives on
`state_label` (`me.entries.ts` mapping, bound at `me.layouts.ts` via
`cell.key`).

**Fix.** Add `_label` to `suffixes`. Then audit the eight for the `value`
trap — `body_label` and `subject_label` carry a studio's own composed mail
copy and must **not** become prose keys, or Part 2's own rule ("never
translate what a form is about to save") is broken. If they must stay
untranslatable, rename those two off the suffix instead.

**Done when.** `language-check` asserts a German member's My-classes row reads
`Gebucht`.

### 2.2 A binding renames the key, and the key is what decides proseness

`Field value="$.subscription.paid_via_display"` resolves into the render tree
as a prop named `value`. The `_display` suffix is gone by then, and `value` is
deliberately excluded from prose props — correctly:

```
packages/nova/src/i18n/phrases.ts:64
// Deliberately absent: `name`, `value`, `id`, `icon`, `tone`, `variant`, `key`.
// Those carry data or design tokens, and translating them is how a person
// called "Active" gets renamed.
```

`Rows` escapes this because its `rows` prop is an array of objects whose keys
*are* `status_display` — the key survives into the tree. `Field` and `Stat`
do not.

**14 render sites**, all of them contract or membership facts:

| File | Lines |
|---|---|
| `apps/lab/lyra/src/app/actions/domains/people/people.layouts.ts` | 110, 167, 168, 169, 170, 171, 172 |
| `apps/lab/lyra/src/app/actions/surfaces/me/me.layouts.ts` | 38, 41, 165, 166, 167, 168 |
| `apps/lab/lyra/src/app/actions/domains/schedule/session.action.ts` | 30 |

Seen on a German studio's person record — labels German, values English, in
the two fields that carry Austrian contract law:

```
MINDESTLAUFZEIT   No minimum
KÜNDIGUNG         30 days
BEZAHLT           Billed by the studio   ← 'Vom Studio abgerechnet' IS in the book, phrases.de.ts:105
```

**Fix — pick one, and Part 8 D1 decides which.** Either give `Field`/`Stat` a
prose-capable prop distinct from `value`, or teach the resolver to carry the
binding's terminal key with the value so the suffix survives resolution. The
second is the real repair and touches nova; the first is local to lyra's kit.
**Do not simply add `value` to the prose props** — that is the exact hole the
comment above is guarding, and it will rename a member called "Active".

**Done when.** `language-check` asserts `paid_via_display` renders German on
`people.detail` for a de-AT studio.

### 2.3 Welded English fragments cannot be translated by any dictionary

**14 sites** compose values by welding English words into a string. No book
reaches them and no `Intl` op formats them:

| File:line | Fragment |
|---|---|
| `apps/lab/lyra/src/app/vex/course.entries.ts:47` | `' of '` |
| `apps/lab/lyra/src/app/vex/timetable.entries.ts:85` | `' of '` |
| `apps/lab/lyra/src/app/vex/me.entries.ts:74` | `' of '`, `' left'` |
| `apps/lab/lyra/src/app/vex/member.entries.ts:277` | `' matching'` |
| `apps/lab/lyra/src/app/vex/member.entries.ts:381, 440` | `' classes a month'`, `' a month'` |
| `apps/lab/lyra/src/app/vex/member.entries.ts:387` | `'-month minimum'` |
| `apps/lab/lyra/src/app/vex/member.entries.ts:389, 477` | `'Rolling · '`, `' days notice'` |
| `apps/lab/lyra/src/app/vex/member.entries.ts:439, 462` | `' classes'`, `'Valid '`, `' days'` |
| `apps/lab/lyra/src/app/vex/member.entries.ts:471` | `' days notice'` |
| `apps/lab/lyra/src/app/vex/subscription.entries.ts:42` | `' months'` |
| `apps/lab/lyra/src/app/vex/subscription.entries.ts:48` | `' days'` |

The visible result is worse than uniform English, because it is inconsistent.
On one member screen, one line apart **[seen]**:

```
Foundations — autumn block …  1 of 12    ← course.entries.ts:47, unfixed
Open Practice … 12:00         1 von 12   ← a sibling site, fixed
```

And the Preise screen — the commercial centre of the product — renders
`Rolling · 30 days notice`, `Valid 180 days` and `12 months` in English beside
`Laufend` and `Läuft nie ab` in German **[seen]**.

The same defect on Automations, from a different direction: the composed
recipe sentence is German for exactly one of five recipes and English for the
other four **[seen]**, because assembly-then-lookup needs one book row per
(moment × effect) pair. That does not converge.

**Fix.** A pattern op — a phrase with slots, translated as a whole and filled
in the target language (`'{n} von {total}'`, `'{n} Tage Kündigungsfrist'`).
The book then holds one row per *pattern*, not per combination. Apply it to
all 14 sites and to the automation sentence.

**Done when.** `phrase-harvest` reports zero welded fragments (2.6 makes them
visible), and `language-check` asserts a German count reads `1 von 12`.

### 2.4 Closed-set words that are simply absent from the book

Missing from `apps/lab/lyra/src/db/phrases.de.ts` — **[measured]**, verified
by lookup:

`One-off` (`member.entries.ts:427`) · `No minimum` (`subscription.entries.ts:43`) ·
`Offered` and `Retired` (`member.entries.ts:446`) · `Waiting` (`me.entries.ts`)

These are only reachable once 2.1 and 2.2 land — `Offered` sits on
`state_label` and is missing from the book, so it needs both.

**Fix.** Add them. 2.6 is what stops the next batch going missing.

### 2.5 The Mail screen ships entirely untranslated — **[seen]**

**28 phrases missing**, of which 24 are `studio.mail` and its nav entry. A
German studio's mail settings screen is wholly English.

**Fix.** Translate them. Mechanical; the harvest already prints the exact list
with paths.

Two of the 28 are not phrases at all: `"asc"` at `people.list.data.sortDir`
and `"people.name"` at `people.list.data.sortBy`. Machine values are leaking
into the phrase surface — exclude sort keys from the harvest rather than
translating them.

### 2.6 The harvest has a blind spot, and the file already knows how to fix it

`harvest.ts` walks authored artifacts, "never a value that arrived from the
database" (`packages/nova/src/i18n/harvest.ts:16`) — correct and deliberate.
So the entire closed-set vocabulary invented by vex mappings is invisible to
it, which is why 2.1–2.4 were undetectable.

**There is already a precedent in the same file.** `phrase-harvest.ts` handles
two other unharvestable sources by naming them explicitly: the automation
vocabulary that lives in rows (`src/dev/phrase-harvest.ts:57`) and the strings
`app.ts` composes (`:86`). Follow it.

**Fix.** Add a third named source: the closed-set values the vex mappings can
emit — the literal `then:`/`else:` strings inside `$case` branches on
`_display` and `_label` keys, plus every pattern from 2.3. Enumerate them from
the entries rather than by hand, or the list rots the way this one did.

**Done when.** Harvest's total rises to include the vocabulary, and the
missing count for de-AT is zero.

### 2.7 Nothing gates any of this

- **`language-check.ts` is the only check on disk not wired into
  `all-checks.ts`.** Verified: 44 of 45 suites are listed; this one is not.
- **`phrase-harvest` is not a gate either.** It prints a number nobody has to
  act on.

This is the whole reason a screen shipped in one language and nobody noticed.

**Fix.** Add `language-check` to `all-checks.ts`. Make the harvest fail when
the missing count for any seeded locale is above zero — the seed already runs
`de-AT` and `en-GB`, so the check has two real locales to hold.

**Done when.** Deleting one row from `phrases.de.ts` turns `pnpm check` red.

---

## Part 3 — the walk-in desk is built underneath and never surfaced

The desk cannot check in anybody who is not already booked. Drop-ins are most
of a front desk's day.

The reads and the write **already exist**:

```
apps/lab/lyra/src/app/vex/desk.entries.ts:48   fingerprint: 'check-ins/walk-ins-today'
apps/lab/lyra/src/app/vex/desk.entries.ts:81   fingerprint: 'people/bookable-for-session'
apps/lab/lyra/src/app/vex/desk.entries.ts:138  fingerprint: 'bookings/create'
apps/lab/lyra/src/app/actions/domains/desk/desk.prism.ts:5   export const walkInsPrism = …
```

`desk.action.ts` calls none of them, and `desk.layout.ts` is 66 lines with no
search, no `PersonPicker` and no walk-in section.

Worse, the screen makes a promise the product does not keep:

```
apps/lab/lyra/src/app/actions/domains/desk/desk.layout.ts:53
emptyHint: 'Walk-ins can still be checked in from the member record.'
```

The member record has **zero** check-in controls (`people.layouts.ts` — no
match for check-in of any spelling).

**Fix.** Wire the screen: a `PersonPicker` over `people/bookable-for-session`
for the chosen session, `bookings/create` then the existing check-in mutation,
and the walk-ins list from `walkInsPrism`. If for any reason this is deferred,
**delete the empty-state sentence in the same commit** — a false promise is
worse than a missing feature.

**Done when.** `checkin-check` picks a session, searches somebody with no
booking, checks them in, and asserts both the booking and the check-in landed.

---

## Part 4 — the pack seam

Three issues that surfaced from running both packs installed. One needs a
decision.

### 4.1 A failing pack shows the studio owner `HTTP 500` — **[seen]**

With the Stripe pack's store unreachable, its settings screen renders a red
banner reading exactly `HTTP 500`. That string is nova's fallback when a
non-OK response carries no `message`:

```
packages/nova/src/action/runtime/endpoints.ts:113
: `HTTP ${response.status}`;
```

The host has a rich, honest refusal vocabulary at **intake** — validated
against the registry, refused with sentences a person can read. It has nothing
at **call** time. A third-party service being down is the steady state of a
marketplace, not an exception.

**Fix.** Two halves.
1. The contract requires a pack's error responses to carry a `message`;
   `pack.ts` wraps handler throws into that shape so a pack cannot forget.
2. The host still needs a floor for the case where a pack returns nothing
   usable, or is unreachable entirely — a sentence naming the pack, not a
   status code. Decide where it lives: nova's fallback is generic, so this
   probably belongs in the app's endpoint error handling rather than in nova.

**Done when.** `integrations-check` points an installed pack's endpoint at a
dead port and asserts the rendered notice contains no bare status code.

### 4.2 Packs cannot be translated at all — **[seen]**

Both packs render English on a German studio, in the most visible place there
is. The member's own navigation:

```
Kurs buchen · Meine Kurse · Meine Mitgliedschaft · My belt · Payment
```

And the Belts roster header mixes host and pack in one row:
`MITGLIED | BELT | SINCE`.

The store tiles, the taglines and the derived "Adds …" sentences are all
English too.

**Fix.** The bundle contract gains an optional phrasebook — the same
`(locale, source, text)` shape the app already uses — and intake stores it
alongside the pack's actions. The pass already runs over the whole served
tree, so a pack's words translate with everything else once the book is
reachable. Refuse a phrasebook keyed to a locale the deployment does not
serve, the same way placements outside the vocabulary are refused.

**Done when.** `integrations-check` installs a pack carrying a `de` book and
asserts its placed screen's nav label renders German.

### 4.3 **DECISION** — a fingerprint rename is a silent breaking change

The parameter collapse deleted `people/list/members` in favour of
`people/list` + `{ lens }`. Belts called the old name. The host refused it at
registration with a clear sentence — *"which this app does not serve"* — and
the only reason nothing broke in the wild is that Belts lives in this repo and
was edited in the same commit.

The contract endpoint publishes the fingerprint list. **Nothing diffs it
across releases, and there is no version.** A published fingerprint is a
public API the moment somebody outside the repo builds on it.

This needs Part 8 D2 before any work. Recorded here because it surfaced here,
and because the *next* collapse is the expensive one.

### 4.4 An entry with no consumer is invisible

`reachable-check` proves every action a principal holds can be opened and
every menu item leads somewhere. Nothing proves a **vex entry or prism has a
caller**. That is how Part 3's walk-in reads sat built and unreachable, and
how `me/booked-sessions` (1.3) survived two reviews unused.

**Fix.** Extend `reachable-check`: every entry in the registry is either
reachable from some action's endpoints/prisms, or explicitly listed as
deliberately unwired with a reason.

**Done when.** Deleting the call site of any entry turns `pnpm check` red.

---

## Part 5 — the shell grows with use — **[measured]**

`moss-bench` runs again, and the number it produced that nobody had before:

```
Memory per live shell
  live shells created            250
  per shell                      80.6 KB
  build + settle                 20.7 ms each

Does one shell grow with use?
  120 navigations on one shell   286 KB total
  per navigation                 2.38 KB   GROWING — 3.6× one shell's own cost
```

A durable shell costs 80 KB at birth and grows **2.38 KB per navigation with
no observed ceiling**. A front desk doing 500 navigations in a shift ends the
day at roughly 1.3 MB — about 15× birth size. The 30-minute idle sweep does
not help: the shells that grow are exactly the ones in continuous use.

The bench's own projections (79 MB / 787 MB / 7.7 GB at 1k / 10k / 100k
concurrent) are computed from the **birth** figure and are labelled as linear
extrapolation. With growth, the number that matters for the stated target —
hundreds of studios, 50–2,000 members each — is materially higher.

**This is the only defect in this document that gets worse while nobody is
watching.** It will not appear in a check, will not appear in a demo, and will
appear as an OOM after the first real customer has been live a few weeks.

**Fix.** Find what accumulates per navigation. Candidates in rough order:
retained per-action data for popped/replaced canvases, listener or
subscription registration that outlives its action, and history or trail state
that has no cap. The bench already isolates it — one shell, 120 navigations —
so this is a measurable loop, not a hunt.

**Done when.** `moss-bench` reports per-navigation growth at or near zero over
120 navigations, and the bench asserts a ceiling rather than only printing the
figure.

---

## Part 6 — dev environment, and documents that lie

Small, but each one costs somebody an hour and two of them cost it repeatedly.

### 6.1 The dev sign-in picker is broken by an env-var name mismatch

```
apps/lab/lyra/src/server/functions/auth.ts:66   process.env['LYRA_DEV_PICKER']   ← the guard
apps/lab/lyra/src/app/app.ts:404                process.env['LYRA_DEV_LOGIN']    ← the list
```

Two names, one feature. Set only `LYRA_DEV_PICKER` (which is what `.env` had)
and you get a login screen with no picker; set only `LYRA_DEV_LOGIN` and you
get a list of people that refuses to sign any of them in.

This is transition residue from `lyra-identity` batch 3 — the plan says "the
login picker is behind a transport flag" and only half the code moved.

**Fix.** One name. `LYRA_DEV_LOGIN`, since that is what the identity plan and
`identity-check` assert against. Delete the other read.

### 6.2 `LYRA_DEV_PACKS` pointed at a dead port — **fixed during the review**

`.env` had `stripe@http://127.0.0.1:8781/stripe`; the integrations service
listens on `8799` (`apps/lab/lyra-integrations/src/serve.ts:45`), and `belts`
was not listed at all. The consequence was that the Add-ons store read
"Nothing on offer" in the only environment anybody would look at, for at
least two sessions.

Changed to `stripe@…:8799/stripe,belts@…:8799/belts`; backup at
`apps/lab/lyra/.env.bak`. **Left for this plan:** the example in the code
comment (`apps/lab/lyra/src/server/dev-packs.ts:17`) still says `8781`, while
the admin screen's placeholder says `8799`
(`apps/lab/lyra-admin/src/app/actions/integrations.action.ts:77`). Make them
agree.

Related and worth a line in whatever README covers the dev loop: the
integrations service runs under `tsx` with no watch, so it serves whatever
bundle it started with. It had been running since before the parameter
collapse and was serving a fingerprint that no longer exists — which presents
as a 422 at registration and looks like a broken pack.

### 6.3 The plans shelf contradicts the plans

`docs/plans/README.md` exists to enforce *"a plan whose status is stale is
worse than no plan"*. Its own table is stale:

| Plan | README says | The plan's own status line says |
|---|---|---|
| `lyra-mail.md` | Not started | built and green, all 8 steps |
| `lyra-identity.md` | Not started | batches 1, 2 and 4 landed; batch 3 all but the deletion |

**Fix.** Correct both rows, and consider deriving the table from the status
lines rather than restating them.

### 6.4 `lyra-mail.md`'s own header contradicts itself four times

Within twelve lines: *"Status: not built"* → *"steps 1–7 are built and 8 is
half"* → *"All eight steps are built"* → a paragraph listing 7 and 8 as
remaining. Someone reading top-down acts on the wrong one.

**Fix.** One status line, current, at the top; move the history below a rule
or delete it.

### 6.5 Raw machine values on the Reports screen — **[seen]**

`2026-W25` as a week label and lowercase `active` / `paused` as roll statuses
reach the screen unformatted. The status values also miss the language pass,
being neither `_display` nor `_label`.

**Fix.** Format the week key into the studio's locale, and map the status
values through the same `standingLabel` vocabulary every other screen uses.

---

## Part 7 — what is explicitly NOT in this document

So nobody widens the scope mid-flight. These are real and belong elsewhere:

public/login-free surface · families and guardians · invoicing, receipts,
numbering and tax · charts on Reports · settings depth (hours, address, rooms,
booking window, cancellation policy, waiver) · no-show as distinct from
not-yet-checked-in · member profile editing, attendance history and payment
method · bulk operations · keyboard paths.

---

## Part 8 — decisions a human must make first

**D1 — how `Field`/`Stat` values become translatable (blocks 2.2).**
(a) Give the kit a prose-capable prop distinct from `value`, local to lyra.
(b) Teach nova's resolver to carry the binding's terminal key alongside the
value, so `_display` survives resolution — the real repair, touches nova and
every adapter.
*Recommend (b) if nova is still soft enough to change; the rule "proseness is
decided by the key" is only true today for keys that survive binding, and (a)
leaves that hole open for the next component.*

**D2 — versioning the fingerprint contract (blocks 4.3).**
(a) Fingerprints are forever: never rename, only add, deprecate by
documentation.
(b) The contract carries a version; packs declare which they build against;
intake refuses a mismatch.
(c) Aliases: a renamed fingerprint keeps its old name as a served alias for N
releases.
*Recommend (c) plus a check that diffs the published fingerprint list against
the previous release and fails on a disappearance without an alias — it costs
almost nothing now and is the only option that does not either freeze the read
layer or break every pack on a release.*

**D3 — do `body_label` and `subject_label` translate? (blocks 2.1).**
They carry a studio's own composed mail copy. Translating them would show
German and save English — the exact failure the i18n design already forbids
for form values. Either rename them off the `_label` suffix, or make the
suffix rule subtractive with a declared exception list.
*Recommend renaming: an exception list is a thing to forget.*

---

## Part 9 — suggested order

1. **Part 1** — four member-facing fixes, one commit each, `member-check`
   grows with them.
2. **Part 6.1, 6.3, 6.4** — twenty minutes, and they stop costing people time.
3. **Part 2.7** — wire `language-check` and gate the harvest **first**, so
   everything after it is measured rather than asserted.
4. **Part 2.1 → 2.6** — one connected change, after D1 and D3.
5. **Part 3** — the walk-in desk.
6. **Part 5** — the shell leak. Independent of everything above; start it in
   parallel if there is a second pair of hands, because it is a hunt with a
   measurable target rather than a list.
7. **Part 4.1, 4.4** — the pack error contract and the reachability check.
8. **Part 4.2** — pack phrasebooks, once the app's own i18n is closed.
9. **Part 4.3** — after D2.

**Done, for the whole document:** `pnpm check` is green with
`language-check` in it and the harvest gating at zero missing for both seeded
locales; a German studio's Preise, person record and member screens carry no
English; a member whose class was cancelled is told so; the desk can check in
a walk-in; and `moss-bench` reports flat memory across 120 navigations.
