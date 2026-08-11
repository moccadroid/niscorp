# Lyra — the plan

A membership platform for studios and gyms — dance, yoga, pilates, BJJ, karate, CrossFit,
clubs. One deployment, many studios, one URL. What a studio's app *looks like* is not a
fork of the codebase and not a setting buried in a preferences screen: it is rows.

## What this proves

1. **Actions are the product; layouts are disposable.** Every studio runs the same
   feature set and can run a completely different application. An action ships with a
   layout; a studio's theme replaces layouts by action id, partially, revertibly, as a
   row write.
2. **A tenant boundary is engine-side.** One deployment holding hundreds of studios,
   where the boundary is a compiled scope policy no request can forge — not a `WHERE`
   clause somebody remembered to write.
3. **Shipping is a data change.** New actions, new layouts, new themes reach living
   shells without a deploy, a reload, or a sign-out.
4. **The stock app is good.** A studio that never customizes anything still looks like
   it bought something expensive.

## Decision points

| # | Decision | Tier | Answer |
|---|---|---|---|
| D1 | Posture | derived | moss server app. Durable server shells per principal, thin browser terminal, magic link. The degrade is not used. |
| D2 | Environment | derived | PGlite, seeded at boot, with vex's postgres cache on the same pool. Cloud SQL later is a swap of the `{ query }` seam, not a migration. Hosting deferred (Firebase likely). |
| D3 | Reads | derived | Vex entries, replay-only, locked. No LLM hooks wired — an unknown fingerprint is a 500, never a silent generate. |
| D4 | Writes | derived | Vex mutation entries. Every write is a fingerprint replay; nothing writes inline. |
| D5 | Routing | answered | No address-bar sync. Shell state is the truth. Revisit if staff-to-staff deep links become a real workflow. |

## Answered in the interview

- **v1 scope: core operations + theming.** Members, plans, classes, booking, attendance,
  roles, multi-tenancy — plus row-driven themes with two studios visibly different,
  proven by a check. No payments in v1: money bugs are the expensive kind to find while
  the stack is still being proven.
- **Identity: one studio per account.** A membership belongs to one tenant; a person who
  joins a second studio gets a second account. Keeps the tenant boundary and the security
  boundary identical. The schema keeps person and membership as separate rows, so
  cross-studio identity stays possible later without a migration.
- **AI: later.** Nothing wired. Reads stay Vex-shaped so an agent can use them when the
  time comes.
- **Look and feel: clean, bright, modern. No serif anywhere.** Near-white grounds,
  high-contrast ink, one high-chroma neon accent. Deliberately the opposite register to
  atrium's warm serif — which makes the pair a real test that the kit assumes no single
  aesthetic.
- **Data long-term:** a studio that leaves gets an export; rows are retained for a
  defined window, not vaporized. Schema anticipates it; the feature is not v1.
- **Nothing outside `apps/lab/lyra`**, except the moss artifact layer (below), which is
  general and belongs in the app server.

## Derived

- **A program is a taxonomy; a course is a dated block.** A program ("Vinyasa Flow") is a
  stream with a name and a colour that runs indefinitely. A course ("Foundations, six weeks
  from 14 Sept, twelve places") starts, ends, caps enrolment and carries a price. The first
  schema had only programs, so courses lived in blurbs — prose no query can reach. A course
  is a BOUNDED template plus an enrolment: one recurrence concept, one generator.
- **Entities.** studio · person · membership (person × studio) · staff (person × studio +
  role) · plan · subscription (membership × plan) · program · class template · class
  session · booking · check-in · theme (studio × layout overrides).
- **The template/session split is deliberate.** "Tuesday 6pm Vinyasa" as a recurring rule
  and "Tuesday 3 March 6pm Vinyasa" as a bookable occurrence with a capacity are
  different objects. Conflating them makes cancellations and one-off schedule changes
  painful forever.
- **Plans are simple in v1** — one price, one interval, one class allowance. Packs and
  punch-cards when a real customer asks. Cheap to change: PGlite rebuilds from DDL every
  boot and every check runs its own fresh database.
- **Roles:** owner · manager · instructor · front desk · member. Plus a platform operator
  no studio charter grants, in the shape of atrium's admin tool.
- **Scale target:** hundreds of studios, 50–2,000 members each. This is the figure that
  pushes `assignments` from a manifest field to rows, and the one moss's per-principal
  resolution gets boot-tested against.
- **Per-principal difference is ring-1 existence**, as in atrium — not layout variants.
  Ring 2 stays reserved for privilege-shaped differences; **themes are a separate
  mechanism** (below) and are not charter-granted.

## Theming — the mechanism

Settled in design, ahead of implementation:

- Every action **always** ships with a layout. An action is complete and renderable with
  zero rows present. That default is the floor.
- A theme is a set of **replacement layouts keyed by action id**, held in rows. At shell
  build moss looks for a replacement and substitutes it; absent one, the default stands.
- **Themes are partial by nature.** A theme covering 12 of 80 actions is a good theme.
- **Substitution is an attempt, not a contract.** If a replacement cannot be used, the
  default is used. Worst case a studio sees a stock layout wearing their own CSS —
  visually coherent, functionally complete. There are no catastrophic failures by design.
- **Fallback is decided server-side**, at substitution: moss already walks layouts with
  `componentsOf` to register component stubs and can check a candidate the same way
  before serving it. Nothing broken reaches a terminal.
- **Fallback granularity is per-action**, not per-theme. Deliberately unlike atrium's
  whole-payload intake refusal — a theme is already partial, so one unusable layout must
  not cost the other nineteen. *Recorded as a decision because the existing precedent
  points the other way.*
- **A fallback leaves a trace** — a row, surfaced to the operator. A studio that paid for
  a custom layout and silently got the stock one must not find out by complaining.
- **Layouts carry no colour.** They name semantic tokens; the kit maps tokens to CSS
  custom properties. This is already rule 2, and it is what makes the CSS axis free.
- **Two independent axes:** structure (which layout) and surface (which token set).

## Solved: member-facing personal reads — and how the answer changed

A member holds their own card, their own bookings, and the writes that book and
cancel a class.

**The obstacle was real.** Charter verbs are table-level (`memberships.read`) and
scope behaviors were role-blind — every caller got the same rule for a table.
Reads are replay-only by fingerprint, and a fingerprint is replayable by anyone
whose policy covers the tables it touches, so a member holding `memberships.read`
could POST `members/list` and receive the whole roll. That was live;
`scope-check` asserts it is closed.

**What shipped first was projection tables** — `member_cards`, `member_bookings`,
`member_enrolments`, pinned to the caller and read by nothing else. They are all
gone. Three things replaced them, in order:

1. **Reach belongs to the ROLE** (charter: `scoping`, vex: named profiles). One
   table, two reaches: a member reads their own rows, a desk reads the studio's,
   and the query cannot tell which it is.
2. **A person is not one role.** The directory flattened everybody to a single
   word, so an instructor who trains at their own studio stopped being a member
   the moment the charter looked at them. They hold both roles now, one policy is
   compiled per role, and the results merge. `member` came off the bottom of the
   staff ladder at the same time — it is a relationship, not the least anybody can
   be — which is what stopped a member's grants arriving on the front desk.
3. **A read may demand its own reach** (vex: `OkCacheEntry.reach`). The merge is a
   union, so a principal holding two roles reaches as wide as either grants —
   right for the roster they are paid to read, wrong for the screen that says
   *yours*. An entry naming a profile is served at it whoever asks, with the
   caller's own grants unchanged: it narrows rows, never widens verbs, and fails
   closed if the profile cannot be compiled.

A member's booking still carries exactly one client value — the session id.
`membership_id` and `studio_id` are stamped from scope. "Book somebody else" is
not a request the grammar can phrase.

## The moss artifact layer

General, not app-specific, so it lands in moss rather than here — an app server serving an
application whose artifacts change under it is what an app server is for. Sequenced after
the first real actions exist, so the contract is shaped by a consumer rather than guessed:

- artifact intake — validating incoming actions, layouts and entries against their
  schemas and the app's registry, with honest refusal
- `layouts` and `assignments` backed by rows instead of manifest fields
- theme resolution at the substitution point moss already owns
- the refresh/adopt cycle (already present)

Staying in the app: **where artifacts come from.** A vendor pull, an admin upload and a
git sync are three transports feeding one intake; moss learns none of their names.

Until it lands, the app builds against manifest-held layouts behind a single accessor, so
swapping the source is one seam.

## Order of work

1. ~~**Scaffold**~~ — manifest + runtime + terminal; canvases; empty registry; one
   placeholder action renders. **Done.**
2. ~~**Kit**~~ — primitives against a kitchen-sink action. Lock the look before any feature:
   bright, modern, no serif, neon accent, all tokens. **Done** — 26 components.
3. ~~**Data layer**~~ — schema, seed, entries, behaviors; prove one read end-to-end under the
   tenant boundary. **Done** — 21 reads, 25 mutations, tenancy engine-side.
4. ~~**First actions**~~ — members and classes: list → detail → form. **Done.**
5. **Moss artifact layer** — row-backed layouts, resolution with per-action fallback.
   *Not started, and the next structural piece.*
6. ~~**Theming (CSS)**~~ — two studios visibly different, proven by a check. **Done**;
   structure theming waits on 5.
7. **The rest** — booking, attendance, check-in, roles across the full role set.
   Done: check-in desk · timetable grid → generated calendar · staff and ACL
   attribution · intake (sign-up, its own action so a kiosk can mount it alone) ·
   hiring · reports · plans · **the member side** (card, booking, cancelling).
   Left: **Stripe** (planned — see *Stripe* below) · the moss artifact layer (row-backed layouts) · a Postgres store for tide’s ledger ·
   **search and paging on the roll** (the 2,000-member target has neither) · **a retention screen**
   (the "stopped coming" audience exists for automations; nobody can look at it).
8. **Checks and polish** — a dev check per feature; empty states last.
   *11 suites green; empty states written as they were built rather than last.*

### Where it stands

Twenty-two check suites, all green, all end-to-end through the real shell rather than
against the database. Every surface below has been clicked in a browser as well —
twice now a bug has passed every headless check and only shown up on a real click
(`ActionSlot` origin stamping; `set` not evaluating Prism ops), so the browser
pass is not optional.

| Surface | Reads | Writes |
| --- | --- | --- |
| Today (three, one per rung) | ✓ | — |
| Check-in desk | ✓ | ✓ |
| Members: roll, detail, edit, sign-up | ✓ | ✓ |
| Timetable (calendar) | ✓ | — |
| Classes (the grid) | ✓ | ✓ |
| Programs | ✓ | ✓ |
| Plans | ✓ | ✓ |
| Staff and roles | ✓ | ✓ |
| Reports | ✓ | — |
| Appearance (theme swap) | ✓ | ✓ |
| Member: card, book, cancel | ✓ | ✓ |
| Automations (tide) | ✓ | ✓ |
| Courses: blocks + enrolment | ✓ | ✓ |
| Automations: see, preview, run, pause | ✓ | ✓ |
| One-off events | ✓ | ✓ |
| Waitlists, self-promoting | ✓ | ✓ |
| Add-ons: store (meta tiles, toggle, settings door) | ✓ | ✓ |
| Placements: pack screens in domain hubs · panel on member detail | ✓ | ✓ |

**Add-ons is a store, full stop.** Its menu entry (manager and up, a leaf like
Check in) opens tiles built from each bundle's `meta` — title, tagline, and a
derived "Adds …" sentence saying what appears where, printed identically on the
approval card — with Install/Remove and, when installed and declared, the one
integration action a store may open: that pack's own settings screen. Nothing
functional ever lists under Add-ons.

**Pack screens go where their domain lives**, by bundle-declared bindings kept
beside the actions and never on them (nova's schema untouched): `attachments`
(a panel riding a host action that declared `attachable` offers — the member
detail offers `membership_id` and `person_name`), `placements` (a screen under
a hub in `menuSlots` — the Belts roster under People, My belt under Booking),
`settings` (the store door). The contract advertises the vocabulary; intake
refuses anything outside it; hubs fold placed screens in at mount, so installs
surface without any shell rebuild. The old computed "Add-ons" menu ghetto and
its hub are gone.

Hard-won, in two rounds of faults no suite had seen because checks installed by
SQL and asserted derivations instead of clicking: the store read died on a
table created after schema introspection (moss order fix) · Install wrote a row
and re-resolved nothing (`addons.apply`) · a second install collided with the
row uninstall keeps (`addons/reenable`) · the menu's entry reset to a hub never
shipped · the roster fetched Lyra's roll and never joined it, showing raw ids
while the check asserted names that only existed in props · and the join,
written in prism, passed through nova's binding resolver as inert structure —
crashing the browser terminal while the headless snapshot stayed green. That
last one produced `$prism`: nova's resolver keeps its four small directives and
gains one explicit door to the whole transform grammar, evaluated by prism
against the action's root data. `integrations-check` now drives every click
path: store tile, toggle both ways, placed hub rows, the roster's joined
names, the panel, Promote (the keyed notify landing by name), and settings.

## The kit, after the surface pass

The audit that prompted it: **one list component doing six jobs** across 33
specs in 17 files (a hub was a one-column grid with the header switched off — a
menu wearing a table), **zero icons** in the entire product (the only glyphs
were a hardcoded `×`, `←`, `‹`, `›` and three `<span>`s making a hamburger),
**no way to render a paragraph** (`Text` is a span; its one length control is
`truncate`), and a six-slot colour scale serving two incompatible jobs — so an
owner's role badge was the same red as a failed payment, a Competition class
drew a red edge beside cancelled ones, and **every status badge failed WCAG AA
on both themes** (3.07:1 at the worst, 4.5 being the floor).

- **Two colour vocabularies over one scale.** Ten **hues** carry identity
  (programme, role, rank) and mean nothing; five **tones** carry status and are
  aliases of five hues, so there is one palette rather than two that drift.
  Light and dark are both defined in `theme.css` and selected by `data-scheme`
  — a studio theme says `scheme: dark` and inherits a set tuned against its own
  ground instead of hand-listing soft backgrounds it cannot pair with
  foregrounds it has no way to reach.
- **Icons**, as a named vocabulary (`ui/lib/icons.ts`) — a layout names a token,
  never a path, exactly as it does for colour.
- **Three list shapes, not one.** `Rows` keeps the job it is good at (an object,
  its state, its verbs) and gains grouping, selection, sortable headers, an
  overflow menu so verbs stop eating columns, and `wrap` so a sentence stops
  being clipped. `Links` is the menu shape; `Cards` is the object-with-a-
  paragraph shape the admin tool had and lyra did not.
- **`Prose`, `Field`, `Meter`** — a paragraph with a measure, a label/value pair
  so `Stat` goes back to being about figures, and a quantity drawn rather than
  spelled as "12 of 20" in a coloured badge.
- **`Money`, `PersonPicker`, `Checkbox`** — prices are entered in decimal and
  emitted in cents (the hint used to read "In cents. 8900 is €89.00."), people
  are found rather than retyped, and selection exists at all: *no bulk
  operation was expressible anywhere in this application* before the checkbox.
- **`design-check`** (27th suite) holds it: every tone and hue pair ≥4.5:1
  against its pill AND the page, in every scheme and every seeded theme;
  no programme or role coloured with a status word; no prose bound to a
  truncating cell; every icon name real; and the widest list specs reported so
  nobody adds a column without seeing the number. It carries a falsifiable
  fixture — the palette this replaced, measured at 3.63:1 — so the measurement
  itself cannot rot.

Still open from that audit, deliberately: a search that is a read rather than a
local filter, and a screen for `connections` (the rows and the grants exist;
nothing lists them yet).

## Navigation: mobile first, and no hubs

A hub used to be a whole screen whose only content was a list of links — a tap
that taught nothing — and once you were on Pricing there was no way back up:
`resetTo` clears the canvas, and `pop` carries no canvas, so nothing on the
page could return you to Money. Relay reached the same wall from the other
side: it keeps a real stack on `main` and renders a trail chip, and the chip is
**inert by design**, pending "how stack navigation serializes over the wire".

So no stack — and, after a pass on a 375px screen, **no hubs either**. The
first answer expanded the open area inside the drawer, which works at a desk
and is worthless on a phone: below 860px the drawer is a scrim overlay behind a
burger, so the trail was invisible until you covered the thing you were reading,
and moving between two screens of one area cost three taps.

What replaced it, top to bottom:

- **Areas are names, not screens.** `hubs.ts` is deleted, and with it five
  actions, their charter grants and their catalog entries. Tapping People opens
  the roll; `landingFor` picks the first screen the principal actually holds, so
  an instructor and an owner share the area and land in different places without
  anything branching.
- **The second level is tabs above the content** — visible at every width,
  underlined rather than pilled, because a pill tray is what a *filter* is and
  the row read as one. Fed by `nav.context`, derived per move from the same
  table the menu is built from: a message carries no payload in this grammar so
  a screen cannot announce itself, and `inputs` answers once and then lies.
- **A thumb bar at the bottom**: Home plus three areas plus More, which opens
  the same drawer the desktop rail is. More lights when you are behind it.
  CSS hides it at the rail's breakpoint — one arrangement, two shapes.
- **No top bar and no burger.** With the burger gone the bar held studio, role
  and avatar — exactly what the drawer header holds — so a phone spent 44pt
  repeating itself above the tabs. Identity lives in the drawer; which screen
  you are on is said by the screen's own title.

Two kit rules came out of it, both fixes in one place rather than in thirteen:
a `justify: between` row **wraps** (every screen header overflowed 375px, and
the page grew a sideways scrollbar), and a phone row shows **two** display
cells, not three (the third landed on a ragged second line). `Bar position=
bottom` is portalled like the rail and the sheet — `.ly-slot` keeps an identity
transform after its entry animation, so anything `fixed` inside it pins to the
chrome rather than the window.

Depth is unchanged and still the sheet's job, where `$.count` already decides
between a back arrow and a close.

## The person model: three tables, three verbs

`memberships` — they **train** here. `staff` — they **work** here.
`connections` — they **deal** with here (the mat cleaner, the landlord, the
physio, a guest coach, a parent who pays).

**An enquiry is a membership at stage zero.** The old `leads` table carried its
own name, email and phone — a second, shadow human — with a nullable
`person_id` "set when they become a member" that nothing ever wrote; and the
conversion pushed the intake form with input keys the form did not have, so it
opened **blank** and the desk retyped into a second person record with no link
back. `status: 'enquired'` plus a `source` column replaced all of it: joining
is a status change, `intake-check` asserts it writes **no new person and no new
membership**, and the source survives to answer the question the dead column
existed for. The schema's own sentence had it all along — *a trialling member
and a lapsed one are the same row at different times*. Relay agrees from the
other direction: its pipeline lives on the **deal**, never on the contact.

`connections` stays thin on purpose — a kind, a company, a note. If one ever
grows a lifecycle, that is the signal it deserves its own table, not a status
column bolted on. The seed proves the payoff case: one physio, known to both
studios, two connection rows, one human.

## Deployment: what is public and what is not

The integrations service trusts no identity claim outside a verified envelope —
moss mints a signed assertion per proxied call, and identity is only readable
through verifying it against the deployment's public key (`LYRA_VERIFY_KEY` in
the service's environment, served at `/api/integrations/verify-key`). That is
the code half, and it is checked (`perimeter-check`). See *The trust story* in
the Stripe plan below for the whole design.

The deployment half is a rule, and it will rot if nobody writes it down:

- **Routes carrying identity bind to loopback or a private network.** They are
  reached by moss and by nothing else.
- **Only `/bundle` and, later, `/webhook` are public.** A webhook is called by
  Stripe, not by moss, and authenticates by signature against the vendor.
- **A new public route is a decision, not an accident.** The failure mode this
  used to have — somebody adding a route that read identity headers — is gone
  by construction: there are no identity headers, and a route that skips
  verification has no identity to scope by.

## Deliberately not in v1

Payments and Stripe (now planned — below) · automations and scheduled work (see
`/automation-requirements.md`) · email and SMS · POS and inventory · rank and belt
tracking (a good later test of the theming and bundle story as a discipline pack) ·
the public marketing site and its SSR adapter · native mobile · door access.

## Stripe — the plan

Payments arrive as the first real integration, not as app code. Research done
2026-08 against live Stripe docs; a disposable dev account exists (demo mode).
The live platform account gets created fresh under the real legal entity at
go-live — which is why nothing may depend on dashboard clicks.

| # | Decision | Answer |
|---|---|---|
| S1 | Platform shape | Stripe Connect from day one. Studios are the merchants, lyra is the platform. One connected account per studio: `dashboard=none`, `losses=stripe`, `requirement_collection=stripe`, `fees.payer=account`. Studios never visit stripe.com. |
| S2 | Where it lives | `lyra-integrations`, second bundle beside belts, own URL prefix — so splitting into its own deploy later is a re-announce, not a rewrite. It holds the key, the webhook endpoint and the mirror. Lyra gains no Stripe dependency. |
| S3 | Setup is scripts | Every product, price, portal config and webhook endpoint is a runnable artifact against a blank account. The dev account is disposable and the live one does not exist yet; anything clicked would be lost twice. |
| S4 | Standing vs ledger | Lyra's `subscription` row is standing — status, plan, paid-until — and never learns a Stripe id. The ledger (invoices, refunds, mandates, disputes) is the integration's mirror, surfaced through `ext.desk.stripe.*` actions. Cash at the desk and a second provider are then the same mutation with a different caller. |
| S5 | Sync protocol | Fingerprint replay IS the wire. Reads: through the proxy, as the person driving — works today. Writes: the integration acts per studio as an integration principal (tide's automation-principal shape, its own role) and replays mutation fingerprints. Assertions ("active until X"), never deltas — idempotent under retries and reordering. |
| S6 | Contract terms | Mindestlaufzeit and Kündigungsfrist are lyra rows on the plan. Stripe has no native notice period; lyra computes the effective end, the integration sets `cancel_at`. Portal cancel disabled — §312k means lyra owns the cancel flow regardless. |
| S7 | Plans → Prices | No sync loop. The checkout endpoint reads the plan through a granted fingerprint and materializes the Stripe Price lazily, content-addressed by amount+interval+currency. A plan edit in lyra just produces a new Price at next checkout. |

### The trust story — built

One issuer: the deployment. Authority flows from lyra, so credentials do too —
registration is a granting ceremony where moss mints the integration key,
returns it once, and stores only the hash; the operator puts it in the
service's environment and that is the entire exchange. Both directions hang
off it (moss `assert.ts`; nothing Stripe-specific):

1. **moss → integration.** Identity travels inside a short-lived signed
   assertion — ed25519, deployment keypair minted at boot, public half served
   on `/api/integrations/verify-key`. The token carries the integration it is
   for, the principal, the scope values, and an expiry seconds out; the
   service reads identity ONLY through verification, so a forged claim is not
   refused — it is meaningless, forgetting a guard opens nothing, and there is
   no per-integration outbound credential to store, paste, or rotate.
   `perimeter-check` proves it: forged headers are dead, wrong signer,
   tampered payload, expired token, and sideways replay between bundles all
   401, and the bundle stays open.
2. **integration → lyra.** The key presents as a bearer (`ik_` prefix); moss
   resolves it — hash match, approved only — to the per-studio integration
   actor the app names, with its own audience and its own charter rung, and
   from that point nothing is special: same compiled policy, same stamped
   scope, no privileged path around vex. `integrations-check` proves it: a
   keyed mutation lands stamped with the actor's studio, a fingerprint
   outside the rung is refused by the same engine that refuses a person, a
   studio without the install has no actor, an unminted key resolves to
   nobody, uninstalling orphans the key, and deleting the integration kills
   it — one act, both directions.

The key has its first real consumer: Belts' Promote writes the pack's own
storage, then presents `BELTS_KEY` with `acts-for` to replay
`automation/notify` — a grading lands in the studio's inbox by name, and Lyra
never grew a belt column. Belts is now a rounded reference pack: real belts
painted by a generic `Bands` kit component (segments carry tick marks; colors
are the pack's data, never theme), BJJ stripes as state with the four-wall,
promotion resetting the bar, and — the general lesson — **every edit
reversible because the pack's history is a ledger**: one `undo` pops the
newest event and the record becomes whatever the ledger then says, down to the
white-belt floor. All three verbs (stripe, promote, undo) push Lyra's shared
`confirm` sheet and fire only on yes.

That confirm flow surfaced a real nova gap and fixed it: a message emitted then
followed by a pop was lost, because the listener underneath was suspended at
publish time and "a suspended action reacts to nothing". `emit` now publishes
on a microtask, so the same turn's pop resumes the listener (status flips
active synchronously) before the message lands — the confirm pattern works
regardless of which canvas the opener sits on. All 498 nova tests stayed green. Still open, deliberately, waiting for Stripe:
approval naming the exact mutation fingerprints one integration may replay
(today the `integration` rung bounds all of them equally), and key rotation
without a blip.

### The discipline (table stakes for any Stripe integration; written down so a check can hold it)

- Never trust an event payload: refetch the object, upsert the mirror, derive
  lyra's standing from the mirror.
- The mirror is a cache. `membership_id` rides Stripe metadata on every object,
  so the mirror rebuilds from Stripe alone. One durable source of truth per fact.
- A reconcile sweep for webhooks that never arrived (Stripe stops retrying
  after ~3 days).
- The checkout return page shows "confirming…" until the standing assertion
  lands — the redirect races the webhook by design.

### Order of work

1. **The spike** — the one open Stripe question, settled empirically, half a
   day of throwaway scripts: one subscription under direct charges, one under
   destination + `on_behalf_of`. Read off: merchant name on the member's
   statement · where the Customer and SEPA mandate live · how the app fee
   lands · what a refund drains. The answer shapes the mirror schema.
2. ~~**The trust story**~~ (above), with its checks. **Done.**
3. **The bundle**: onboarding action (Account Link flow, KYC state from
   `account.updated`) · checkout endpoint (S7) · webhook → mirror → standing
   assertions · desk billing actions over the mirror.
4. **Test-clock rehearsal**: subscription with `cancel_at` three months out,
   clock advanced, standing lands correct in lyra end-to-end.

### Deferred, anticipated

- §312k Kündigungsbutton needs a login-free public surface — a category lyra
  does not have yet. Must not be designed out.
- Connect embedded components need a kit component hosting connect.js with an
  account-session secret from the integration. Hosted redirects (Checkout,
  Account Links, portal deep links) carry v1 without it.
- Open user decisions: monetization (`application_fee_percent` from day one?) ·
  legal entity DE vs AT (locks the live account at activation) · Accounts v2
  vs v1 for connected accounts · mandate migration from Mindbody/Eversports.
