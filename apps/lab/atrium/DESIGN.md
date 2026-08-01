# Atrium — design

## The problem it exists to answer

Vertical SaaS dies on integration divergence. Every property runs a different
PMS, every PMS exposes a different capability set, every customer enables a
different subset, and every role sees a different slice. Handled as code, that
becomes feature flags smeared through a UI, a release cycle between a customer's
question and its answer, and a fork per large account.

Atrium is that problem stored as rows instead. The claim under test:

> Shipping a feature to every property at once is a write, not a deploy.

## The layers

Three, and being precise about the boundary matters more than making it sound
magic — the first technical buyer will push on it.

| What changed | How it ships |
|---|---|
| Renderer primitives, the server | A deploy. Rare. |
| What an integration offers — its capabilities, actions, queries, surfaces, menus | A deploy of **that vendor's own service**, then a pull. |
| Which actions are live, per property, per audience | **A write. No deploy.** |
| Property enablement, charter grants | A write. Instant. |

The middle two rows are the product. They work because a nova action is data the
running server already knows how to execute, so making one available is a change
of state rather than of code — and because the app never held that data in the
first place.

What it does **not** claim: a genuinely new primitive is a client release. Say
that out loud rather than implying otherwise.

## The resolved layer

`live_capabilities` and `property_slots` are written by `db/resolve.ts` and by
nothing else. Every shell reads what exists from `property_slots`; there is no
second path. Four statements recompute it:

```
live_capabilities = (a connector offers X, enabled) ∩ (property enabled X)
property_slots    = every (property × shipped slot), with `live` and `reason`
                    — live iff the capability is live here AND the property
                      runs the connector that SHIPPED the slot
```

That second condition only became visible when two vendors implemented one
capability. Opera and Mews both do folio adjustment, and each ships its own
surface calling its own service; without the source gate, the Mews surface
resolves at an Opera-only hotel and its calls go to a connector that hotel
does not have. `reason` gains a fourth value, `source`, because "this hotel
does not run that integration" is a different answer from "that capability is
switched off" and a clerk asking why deserves the right one.

`connectors.live_version` is provenance on the audit line — which build of an
integration introduced a capability — and nothing resolves against it. What a
connector offers is its set of enabled `connector_capabilities` rows.

`reason` is written in SQL — `live`, `connector`, or `property` — because the
resolver is the only thing that knows. That single column is what keeps every
layout free of capability arithmetic: the ops pane prints an answer rather than
deriving one.

### More than one connector per property

Hotels run a PMS and a separate ticketing tool, and they never agree on which.
`property_connectors` binds a property to every integration it runs, and the
resolver unions capabilities across them: a capability is live if ANY of the
property's connectors implements it at its live version and the property enabled
it. Shipping the ticketing connector lights up fault categories at both hotels
without touching either PMS. `properties.connector_id` remains the PMS of
record — where the reservation actually lives.

### Menus are integration data

`request_options` is the request catalogue: what each connector version offers
for a capability — Mews's spa treatments, Mews's housekeeping items, HotelFix's
fault categories. One generic `stay.request` action loads the menu for whatever
capability its slot carries; the option chosen supplies both the summary and the
issue kind. No layout lists an option, so a hotel's menus change by shipping a
connector version, exactly like every other capability.

### Why the vocabulary is ours

Capabilities are `key.issue`, never "Opera mobile key". Connectors map into our
verbs, and that mapping is the entire integrator job. It is also why one guest
layout serves both backends: `stay/current` returns the same shape whether Opera
or Mews owns the truth.

### Charter vs surface

Both are needed and they answer different questions.

- **The charter** is the ceiling: which action ids a role may *ever* hold.
  Compiled and verified at boot; moss refuses to start on an incoherent one.
- **The resolved surface** is what is placed *right now*. Moves at any moment.

Inés holds `stay.key` in her charter at every hotel on earth. Her hotel's PMS has
no door API, so it is never placed. Neither layer alone expresses that.

## The front desk, and what a dataset has to be for one to exist

The desk surfaces were built twice. The first set was correct and thin, and the
reason is worth writing down because it was not a design failure — it was a
DATA failure that looked like one.

With three guests, four faults and two messages, every list has one obvious row,
so every surface collapses to "show the row". Nothing needs ordering, nothing
needs deriving, no verb needs aiming, and the assistant has exactly one move
available at any moment. The app looked finished and had nothing to do.

So the dataset came first: two working hotels at a quarter to four on a Tuesday,
with four months behind them. The Lumen is 36 rooms at 78%, nine arrivals
including a five-room block whose last two rooms are dirty, twelve faults of
which two are days old with nobody assigned, fourteen live threads in six states,
and ~62 departed stays so that a returning guest is a COUNT. Every surface below
exists because that world made a question askable.

### What is waiting is a read, not a count

There used to be a `figures` strip across the top of the crew screen —
`desk.today` for the desk, `ops.house` for operations — carrying counts of
things that were WAITING: unread messages, open issues, rooms to turn. A count
of things waiting is decoration: "6 unread" does not say which one has been
ignored for four hours, and there is nothing on it to press.

The queue half moved into `desk.attention`, which asks the five questions a
clerk actually holds — who has spoken and heard nothing, what is broken with
nobody sent, what is waiting on a yes, how many rooms are still to turn, what
has been handed to a colleague — and answers each with rows that open the
record they are about. The read-only remainder died with the strip: the canvas,
`desk.today` and `ops.house` are gone, and a surface that is only numbers ships
as an ordinary `work` slot opened from the menu (the Mews spa report does). The
aggregates stay seeded reads, so the assistant can still answer "how full are
we tonight?" through its query tool.

"Who has waited longest" turned out to be the one non-obvious query in the app.
There is no window function and no HAVING in the grammar, so it is two
conditional MAX aggregates per stay (the newest thing the guest said, the newest
thing anybody here said) and a mapping that keeps the rows where the first is
later. The sort key is the guest's own timestamp rather than the gap between
them: a thread nobody ever answered has an epoch on the desk's side, so ranking
by the gap floats every never-answered thread above every slowly-answered one
regardless of the hour, which is not the question.

### The brief: the card the composition cannot produce

Opening a guest composes every stay-scoped surface, and every one of them answers
"what can I DO for this person". None answered "who is this", which is the
question a clerk has in the two seconds before they speak. `desk.brief` is seven
existing reads assembled — stay, guest, visit count, spend, faults, notes,
what is already arranged — plus ONE declared input the assistant may write, shown
marked as its own. The surface is complete and true with no model at all, and
better with one. Every AI-adjacent surface here takes that shape.

`desk.guest` shed its issue list the day the brief arrived: two live cards
half-answering one question is the same bug as two live figures for one number.

### Room status is one column, and two people own it

`rooms.out_of_order` was a boolean, which meant "not sellable" and "not ready
yet" were the same word and the desk could say neither. It is now
`rooms.status` — clean, inspected, dirty, out_of_order — and the distinction that
earns the column is `inspected`: housekeeping has finished versus a supervisor
has signed it off. Only the second may be given to somebody standing at a
counter.

Ops keeps the estate decision (out of service for a fortnight, made once).
`desk.rooms` takes the shift decision (this room is turned, it can be sold, made
forty times a day). One column, one write, two surfaces, split on the role — the
same seam the issue board took when it became a family.

That split is also what made the room MOVE possible. `stays.room_id` had existed
since the first schema with nothing able to write it, so the most ordinary
front-desk gesture there is — a fault in a room with somebody in it — had no
answer anywhere in the product. One press now moves the stay, puts the old room
down for turning, takes the new one off the sellable list and tells the guest.
The candidate list is the interesting half: rooms that are inspected AND not
already spoken for, which is what makes it two taps instead of a conversation
with housekeeping.

### Goodwill, and where the ceiling on a machine actually goes

`goodwill.grant` is the most sensitive surface in the app and the simplest one to
reason about, because the design is one sentence: **the gestures are
connector-shipped rows with prices on them, and nothing — not a layout, not an
assistant, not a request body — can produce an amount that is not on one of
them.** The credit posted is `0 − the option's value`, so the menu reads as money
a hotel recognises and the folio records a credit.

What is left for a model to do is the part it is good at: knowing that this is
the guest with two nights of a rattling air conditioner and a note saying she
reported the same fault last time, and writing the apology that says so. Picking
from a priced list is safe; writing the sentence is valuable; pressing the button
is a human's. That is the whole shape, and it generalises — it is why `desk.move`
takes the words but not the room, and why `desk.escalate` takes the story but not
the assignee's consent.

### Transfers ship live, on purpose

The concierge's most quotable property was that it could not invent a taxi. The
honest answer to that is not a better refusal, it is the capability: both PMS
connectors implement `transfer.book`, switched on, at both hotels, from the first
boot. Routes and fares are catalogue rows; the pickup TIME is typed, because what
hour a car should come is a fact about a flight nobody has told the database
about — which makes it precisely the field worth suggesting and the wrong thing
to put in a menu.

It is deliberately NOT a switch somebody flips during a demo. A feature that has
to be enabled before it works is a feature nobody in the room believes in, and
the key flip already carries that beat.

### Escalation is a task, not a channel

"This is above my pay grade" happens several times a shift and had no button. It
writes a `tasks` row: a task already means "somebody must do this", already
carries an assignee and a status, and is already read by the surfaces that show
work. The only thing missing was room for a sentence, which is one column
(`tasks.detail`). The receiving end is the stall list — an escalation nobody can
see is a message thrown over a wall.

### Three things the query grammar taught us

All three surfaced building the above, all three are now load-bearing knowledge:

- **Joins are INNER.** `from: ['issues', 'rooms']` silently drops every issue
  with no room, so a house-wide fault is invisible on its own board. Faults are
  logged against a location now; `tasks/frontOffice` names no rooms table at all,
  because an escalation usually has no room and naming it would drop exactly the
  rows the read exists to return.
- **There is no correlated EXISTS.** "Rooms nobody is in" and "issues nobody was
  sent to" are therefore two reads each: one returning a flat array of ids, one
  filtering with `notIn` against it, composed by the action. This is the same
  shape `desk.move` and `desk.attention` both use.
- **A state range only works if the states sort contiguously.** The issue board's
  tab trick (`gte`/`lte` over the status text) does not transfer to stays,
  because `departed` sorts between `booked` and `in_house` — so a movements list
  ranged over the live states swallows four months of history. The exclusion sits
  outside the range.

### Batch gestures without a loop

Nova triggers do not iterate and layouts do not filter, so "check in everybody
whose room is ready" cannot be written as a loop anywhere. It is a QUERY that
returns the stay ids who qualify plus a write that takes a set (`in`). The rule —
nobody is checked into a room that is not signed off — lives in SQL, where the
button cannot forget it.

## Mirrored, ours, resolved

The schema is three kinds of row and the comments say which is which.

- **Mirrored** — `guests`, `stays`, `rooms`, `folio_lines`. A PMS owns the truth;
  we keep a projection so a shell renders without a network call and so one
  layout serves every backend. Each carries `external_id` and `synced_at`.
- **Ours** — connectors, capabilities, slots, issues, tasks, messages, staff.
- **Resolved** — never authored, never edited by hand.

## Discovery: the app has no built-in vendor knowledge

`src/integrations/` is its own process on its own deployment clock, and since
the discovery flip it is the SOURCE of every integration. The app's seed
authors only what is ours — the capability vocabulary, the connector registry,
the properties and their bindings, the core slots. Everything else about a
vendor arrives from that vendor's `GET /:connector/bundle`:

```
{ capabilities, actions, queries, mutations, slots, options, tables }
```

`syncIntegrations` (server/bundles.ts) pulls it at boot and on demand, gates it
(below), and writes rows in one transaction per connector: `bundle_actions`,
`bundle_entries`, `surface_slots` stamped `source = <connector>`,
`request_options`, `connector_capabilities`. Then it re-reads the rows into
`bundleState`, re-seeds the pulled fingerprints into `vex_cache`, and calls
moss's `refresh()`, so living shells adopt what just arrived.

Three consequences, and the checks name each:

1. Shipping an integration deploys **that vendor's process**. The app is not
   rebuilt and not restarted; it learns what the vendor can do by asking.
2. A refusal or an unreachable service leaves that connector's last-synced rows
   serving, reports the reasons in the vendor console, and touches nothing
   else. Nothing lands half-way — validation runs over the whole payload before
   any write.
3. When a connector is unreachable the app degrades **structurally**. `/key`
   failing means the guest reads which service did not answer, and our database
   records nothing. A credential is never claimed to exist because a process was
   down. The surfaces that connector shipped keep working — they are rows.

### The floor: capabilities that are ours

`capabilities.core` marks the verbs the app implements over its own tables with
no vendor behind them — `stay.view`, `folio.read`, `message.send`,
`issue.manage`, `task.assign`, `room.manage`, `ops.overview`. The resolver seeds
them into `live_capabilities` from the property's own enablement, before it asks
any connector anything.

It exists because the claim above was false in one direction nobody had tested.
Every slot gates on a capability and the entire capability matrix arrived over
the wire, so an app booted with the integrations service down came up not "with
only its own surfaces" but with **none** — a front desk staring at an empty page,
with no sentence anywhere saying why. That is not degrading honestly; it is the
worst failure mode the product has, and it happened on the most ordinary
operational mistake there is (starting two processes in the wrong order).

The line is drawn by one question: could we serve this with the integrations
service switched off forever? The board, the inbox, the movements list and room
status — yes, they are our product. A door credential, a spa diary, express
checkout, a car — no, and those stay dark until their connector reports them,
which is the four-factor claim working exactly as intended.

One consequence worth stating: a core capability that IS dark can only be dark
because the hotel switched it off, so `reason` answers `property`. Reporting
`connector` there would blame a vendor for a decision no vendor was party to,
and a clerk repeats that answer to a guest.

### The intake gate

`server/intake.ts` is the whole gate, and it is a lint, not a sandbox. The
integrations service is ours; the threat model is mistakes, not malice. Each
rule exists so a careless bundle fails loudly at sync with a sentence naming
the reason:

- **Grammar.** Actions parse `ActionDefinitionSchema`, queries `QuerySchema`,
  writes `MutationDefinitionSchema` plus vex's own authoring lint.
- **Namespace.** Action ids are `ext.<audience>.<connector>.<name>`, so the
  charter's four audience globs cover a new action with no charter edit.
- **Ownership.** A fingerprint, action id or slot id already held by core or
  another connector is a collision, not a replacement.
- **Footprint.** A bundle declares the tables it writes; every shipped mutation
  must stay inside that list, and the list must name real schema tables. A
  declaration plus a lint — it catches a typo and a collision, and does not
  pretend to be an access control.
- **Endpoints.** A bundle action reaches exactly two places: the app's
  fingerprint replay (`/api/*/vex`, with a literal fingerprint that is its own
  or core) and its OWN connector through the proxy. No `fn:` — that is
  in-process code, and a bundle ships data. Security by convention, enforced.
- **Both halves.** Every capability a bundle offers a guest has a staff surface
  in the same bundle. A guest asking the desk for something the desk cannot
  perform is a dead end.

`artifacts-check` runs the exact payloads the service serves through this gate,
and then breaks each rule on purpose to prove it bites.

### A worked example: `folio.adjust`

The capability added last, on purpose, to test everything above. Correcting a
posted charge is a PMS feature — Opera calls it a folio adjustment, Mews calls
it voiding a bill item — so the app holds no way to perform it. What the app
authored was one row of vocabulary (`folio.adjust`, reviewed like a schema
change) and one charter grant (`folio_lines.write.update` for the desk: a
clerk who may add a charge is not automatically one who may take one off).

Everything else arrived over the wire. Both services report the capability;
both bundles ship a `The bill` surface with its own fingerprint
(`opera/folioVoid`, `mews/folioVoid`) calling its own `/folio/void`. Both are
stay-scoped, so neither sits on the house screen — they arrive in a guest's
workspace, which is where a clerk reading *"I accidentally added a local beer
to my bill"* actually needs one. The order is load-bearing: the PMS owns the
bill, so the reversal happens there and only its answer moves our mirror.

The correction is a VOID, not a delete — `folio_lines.voided_at` survives and
the reads filter it — because a folio remembers what was reversed.

No app change was needed to make the surfaces appear, and intake accepted a
capability it had never seen without an edit.

### Capability vocabulary

A capability id is a join key: `spa.book` in a bundle's slot means the same
thing as `spa.book` in `capabilities`, or the slot never resolves. Intake
refuses a capability the app has not defined, which makes the vocabulary a
reviewed artifact of the app — the same posture as a schema change. No
machinery: one lookup against a table the seed authors.

## The application is COMPOSED, not navigated

No audience has a nav bar, and the absence is the design rather than a
simplification. A nav bar is a fixed affordance list: writing one means naming
the destinations at authoring time, which an application assembled from
resolved rows cannot do. The staff chrome used to carry eleven authored edges
plus a strip of discovered ones — two mechanisms for one thing, and the
authored half could never learn about an integration that shipped after it was
written.

Every working surface for every audience is now a live action instance on the
`home` canvas, seeded by the manifest's `seeds` hook from the same resolved
read that decides a guest's tiles:

- **guests** — their stay's surface, stay-state filtered engine-side
- **crew** — their house's surface; the stay-scoped ones are held back
- **vendor** — not slot-resolved at all, so ring 1 is its resolution

An action joins that composition by declaring `expanded` in its input — it can
render itself small — and nothing anywhere keeps a list. The chrome is left
with what is genuinely chrome: which house, who you are, the unread count, the
property switch, Leave.

### One record at a time, and what belongs beside it

There was a `desk.openGuest` that composed a whole GUEST workspace: opening a
guest filled the aside with every live desk surface whose input declared
`stayId`, each seeded with that stay. It is gone, and the reason is worth
keeping.

It read as generous and was the opposite. It meant the aside was **always full
before the assistant had a thought**, so the bounds that keep an agent from
adding noise — never a second copy of what is on screen, never a duplicate in
the column — left it nothing it was permitted to add for the one situation that
matters most, a clerk working a guest. Its only legal move became reordering
cards the app had already chosen.

A guest is one record now, opened on `detail` from a row click like every other
record. What belongs BESIDE it — the bill, because they are disputing a charge;
the wake call, because they asked — is a judgement made per situation, and that
judgement is the entire reason there is a model here.

The derivation it rested on was sound and survives elsewhere: **what a surface
can be aimed at is a property of its input contract**, declared, never
hand-kept. Ship a stay-scoped desk surface in a bundle and the assistant can
open it, seeded, at any property whose connector reports its capability.

### `reload`, and why nova needed it

A stack canvas suspends what it covers, and `resume` re-runs `mount`, so a
revealed action is never stale. A LIST canvas suspends nothing — every card
stays live — so a card seeded at login and opened an hour later would answer
with hour-old figures. Nova gained a `reload` effect (re-run the firing
instance's own mount hook, same instance, no navigation) and the preview
contract uses it: **opening a card is re-reading it**. Nothing in atrium names
which endpoints refresh; the action's own mount hook is the only definition of
"current" it has.

### What a layout draws, and what the placement draws

A layout draws CONTENT and its boundary. It does not draw the region it sits
in, and it does not decide how it arrives there.

**The boundary.** A worked surface sits on a card. Three shapes carry one:
`Card` for a surface, `Rows` for a list (it draws its own — never wrap one),
`Tile` for a folded face. A layout that roots in none of them lands on the bare
page ground, which is how the issue record and the conversation ended up
floating beside a carded queue: both came out of a collapsible monolith whose
card came from `previewable()`, and the split dropped the frame with the
branch. This is a convention, not a rule anything enforces — the chrome
canvases (`nav`, `chrome`), the docks and the sheet are all deliberately
unbounded, and a check would spend its life being told about exceptions.

**The entrance.** How an instance appears belongs to the **slotWrapper**
(`ui/slot-wrapper.tsx`), moss's ActionSlot seam: the terminal wraps every
action instance in it, keyed by instanceId, so a swapped instance remounts and
the animation replays. That key is the argument. A layout cannot know it is
being placed — the same surface is a card on a home, a record beside a queue
and a sheet over a phone — and the canvas wrapper around it stays mounted while
the action inside changes, so neither of them can time an entrance. It was an
`appear: true` prop on `Card`/`Box`/`Stack` that five layouts set by hand; the
prop is gone from the kit, so there is no way back into that.

**Fragments** are the third writer, and they are chrome you get by LANDING
somewhere rather than by being yourself: `sheet` composes the overlay frame and
its close, `detail` composes closing when the clerk changes what they are
working on. Both are asked for at the placement (`with: [...]`). There was an
`aside` fragment; it drew nothing and answered a close ref no layout fired —
the residue of the collapsible card that used to carry that header — and it is
deleted. A fragment that draws no chrome and answers no event is not a seam,
it is a leftover.

## The concierge

It selects; it does not generate. The contract is resolved slots in, one of those
slots out, plus a sentence.

The guarantee is structural rather than behavioural. A tile's click payload is
the resolved row, and the push target is `{{@event.payload.action_id}}` — nova
resolves dynamic nav targets natively. So the only ids reachable are ids that
came out of `property_slots`. It cannot announce an arranged taxi because there
is no code path that produces that string.

Today the scorer is keyword overlap. Swapping in `@niscorp/signal` changes the
body of `choose` and nothing else; the guarantee does not depend on how well a
model behaves.
## The assistant: two ways in, one contract

The assistant lives in `src/server/assistant/`. It is reached two ways and both
return the same thing.

- **The dock** (`assistant.send`) — a person asks. A real `fn:` endpoint.
- **The watcher** (`./watch`) — nobody asked. It looks at the screen and reacts.
  Not an endpoint: nothing calls it, by design, because attention that an action
  could grant or withhold is not the agent's.

Same `defineAgent` machinery, same resolved action set, same ring-1 ceiling, same
tenancy. What differs is one thing — whether somebody asked — and that difference
lives in the steering, not in the plumbing.

### It returns a state, not a sequence of edits

Both paths return one object (`contract.ts`):

```
say      one plain line, required
columns  the COMPLETE contents of the canvases it holds
fill     fields to write into cards already on screen, including the person's
```

`columns` is a state, not a change. Every canvas the person granted is rebuilt
from the answer, so anything left out closes — tidying is not something the model
has to remember, and a duplicate cannot be expressed because a canvas is a list.

An earlier version had it call `push` / `update` / `pop` / `remove_instance` as
tools. Every failure mode of that needed its own guard: do not duplicate, do not
offer what is visible, do not stack a second copy, remember to close what you
opened. All four are consequences of describing a screen as edits to one nobody
holds a picture of. A declared state makes them structural.

Two tools survive, and neither touches the screen: `query` (the caller's own vex
API, replay-only, under their compiled scope policy) and `message_desk` (guests
only — a real write, not a screen operation).

### What a prompt cannot hold, code holds

Three invariants live in `apply`, because a prompt is a request:

- **Ownership.** `columns` governs only instances the assistant placed. What the
  person opened survives whatever comes back.
- **Profile.** A canvas outside the caller's profile is dropped on the way in.
- **Fill.** Writing into a card the person owns never re-mounts it, so a fill
  into a key that feeds that card's own load is refused.

That third one is the subtle one. `push` injects input and then runs mount, so a
load overwrites what it wrote; `setData` writes and nothing re-runs. The model
never has to know: it states what should be true and `reconcileCanvas` picks
push, write, or re-open. Setting a key the surface's own mount-time load reads
would leave the previous record's data on screen under a new id, so those
re-mount instead of being written.

### Profiles: how much of a screen the WATCHER arranges

One row of `staff.layout_control`, one table in `profiles.ts`:

```
authored   places nothing, and no watcher attaches at all
mixed      the aside
full       work, detail and aside
```

The dial binds the watcher alone. The dock is dial-blind: a person who asks is
answered with the whole screen they work in (`chatPlacesFor` — the three
columns for staff, the sheet for a guest) and the whole catalog their grants
resolve to. It was briefly coupled — the chat path read the same profile — and
the default `mixed` quietly reduced the asked agent to one canvas and a thinned
catalog. A bound written for what nobody asked for must never reach an answer
somebody did.

Read per run, not held from login, so changing it takes effect on the next tick
rather than the next sign-in. A person changes it from their own chrome
(`staff.settings.form`), and the write is pinned twice: the row behavior matches
`staff.id` against the caller, and the only mutation that exists sets one column.

`off` means off — no wake, no prompt, no model call. The dock still answers,
because they asked.

Filling is not a mode. Writing a declared input field into a card that is already
open is non-destructive and re-renders nothing, so it is available in every mode
and bounded by the rule above instead.

### The territory is visible

Three states, all structural, all in the assistant's own palette
(`--assist-a…c`, three luminous greens plus a jade; every hue on the warm side
of green, because a cyan-leaning green bites against the paper ground). The
palette is pastel because the ground is paper: a dark saturated colour on a
light ground reads as pigment, and light is what reads as light. The mark is
never a border or a per-side gradient — a border reads as a frame drawn on the
page, and per-side gradients double up in corners and meet the chrome above as
a line.

- **Available.** The ground of what the assistant may arrange is tinted —
  paper mixed with a third of the pale spring, so the territory reads as a
  differently-painted panel rather than a drawn frame: the aside for `mixed`,
  the whole working row for `full`, nothing for `authored`. The frame is
  static served data with nothing to bind, so the state rides the document
  root: `assistant.profile` returns the territory as one word (`scopeOf` in
  profiles.ts), the dock's `AssistState` component writes it as `data-assist` —
  the same host-effect pattern `Accent` uses for the palette — and the
  stylesheet styles the frame layout's named `Region` wrappers. The settings
  form emits `settings-changed` on save and the dock re-reads, so a mode flip
  re-frames without a re-login.
- **Thinking.** A comet runs the border while a run is composing: a 3px ring
  masked to the edge, carrying one soft arc — pastel tail, base-green head —
  around the perimeter. Three pixels wide, it cannot reach a card whatever
  the region's shape, and it fades in rather than popping with the state.
  `data-assist-think` is written from the dock's own `thinking` — the field
  the gate already sets for the spinner — so the two indicators cannot
  disagree.
- **Landed.** What the answer placed marks itself: `apply` composes a `landed`
  fragment onto every placement — one narrow band in the assistant's greens
  crosses the card, fast, then nothing. Placement makes the timing honest —
  reconcile mounts a new instance only for a new or re-aimed card, so a
  re-stated answer replays nothing, and a card the person opened never wears
  it.

### Attention, derived from the action grammar

The watcher's only input is nova's telemetry, reduced to a fingerprint of the
person's half of the screen (`watch/screen-diff.ts`). Two exclusions, both read
off `ActionDefinition` through `@niscorp/nova/reflect`:

```
loadedKeys      what an endpoint writes — a `load` refreshing rows
lifecycleKeys   what a surface writes to itself on mount — `loading` clearing
```

A card re-reading itself is not a person doing something. Both readings are
mechanical, so a surface an integration ships is watched the day its rows land,
with nothing wired.

The diff of two fingerprints is simultaneously the gate's verdict (empty means
nothing happened) and the prompt's anchor — the model reacts to exactly what woke
it, never to one thing having been woken by another.

**Why attention cannot live in the actions.** The first version was a
`notice: { fn: 'assistant.notice' }` endpoint an action carried. It handed the
decision to whoever authored the surface; it could never reach an integration,
because intake forbids `fn:` in a bundle by design; and it could only name
moments someone thought of in advance. All three are the same mistake.

### Why it cannot chase its own tail

Three brakes, all structural. None is a prompt line, because an instruction the
model forgets is not a rule.

1. **Placing is ours, what moves inside a card is theirs.** An open or a close of
   a card the assistant owns is not in the value being compared, and neither is
   any key its own last answer wrote. Ownership is nova's:
   `shell.push(..., { origin })` and `shell.originOf(id)`, dropped with the
   instance. It used to be inferred by diffing a census around each run — a
   window as long as a model call, so a row the clerk clicked mid-run was
   recorded as the assistant's. Under a state contract that is the assistant
   closing the record somebody is reading. There is no window now.
2. Endpoint and lifecycle keys are excluded, per above.
3. One run at a time.

Brake 1 was once the whole of `aside`: the assistant's column was simply not
watched, on the grounds that watching it meant watching itself. That stopped
being true once every actionable card landed there. The clerk pressing **Book**
on a staged transfer is the single most meaningful gesture in the feature, and it
happened on the one canvas nothing could see — the car got booked and the watcher
never woke. Excluding by ownership is too coarse: it hides the hand along with
the card. Excluding by *who made this particular change* is the same brake at the
right grain, and it is what `mine` on a fingerprint card and `wrote` on an
applied answer are between them for.

A fourth, smaller: the shift starting is not a gesture. `seeds` composes the
screen card by card after the watcher attaches, so during a short warm-up every
settle re-baselines instead of firing.

### The gate: when to look

Four states, one variable (`watch/index.ts`):

```
warming   the screen is still being composed; re-baseline, do not react
idle      a change fires AT ONCE
running   one run at a time; changes arriving now are remembered, and a
          NAVIGATION cancels the run outright
cooling   the gap after a run, in which what arrived during it is delivered
          as one follow-up look
```

**Cancel in flight.** The model reads a screen, thinks for some seconds, and by
the time it answers the clerk may be on a different guest. The answer is then not
late, it is about the wrong person — which is how an apology for one guest's bill
arrived in the column beside another guest's anniversary. So a run holds an
`AbortController`, and a card of *theirs* opening or closing while it is in
flight raises it: cortex returns `code: 'aborted'`, nothing is applied, and the
trace records `cancelled` rather than `failed`, because the gate deciding an
answer was about to be wrong is not a fault.

The test is `navigatedBetween`, and it is deliberately narrower than
`changesBetween`: a value moving inside a card is a person working where they
already are, and cancelling on that would mean a clerk who types is the one who
never gets an answer. The baseline arithmetic needs no special case — they
navigated, so `during` is non-empty, so the baseline holds and the follow-up look
opens on the screen they actually moved to.

The leading edge matters: a person who clicks a row and gets nothing for four
seconds has already concluded nothing is there. An earlier version put a debounce
*and* a twenty-second cooldown in front of every wake, which bounded the rate by
making the screen look dead. The rate is still bounded — one run at a time, and a
follow-up waits out the cooling gap — but the bound is between runs, never before
the first.

`WATCH_QUIET_MS` and `WATCH_WARMUP_MS` are the dials, environment-overridable so
`watch-check` exercises the shipped gate rather than a copy with test-friendly
timings.

The desk only, for now. `WATCHING` is one word wide — everything under it is
audience-blind, because the action set, the ceiling and the composition all come
from the caller's own resolution.

### It must not be able to take the server down

Every entry point is a timer or a subscription callback. There is no request to
fail and no caller to catch, so an exception on one ends the node process and
every signed-in person loses their session — over a run nobody asked for. Each
entry point is wrapped; a throw retires the watcher instead of propagating. Every
timer it starts is tracked and cleared on dispose, so none outlives it.

The ordinary cause is a shell that can no longer be read: a sign-out, a
revocation, a dev-server reload leaving a stale watcher behind. There was also a
latent version from declaration order — a timer reaching for `dispose` before it
was defined, which is a ReferenceError inside a timer, the one failure that takes
the process with it. `dispose` is declared before anything that can call it.

`watch-check` proves this the only way worth proving it: it breaks a shell under
a live watcher, fires a real gesture, and asserts that nothing originating in the
watcher reaches the process and that the watcher retires itself. Removing the
guard fails both. The assertion filters escapes to ones raised inside the watch
folder on purpose — the same sabotage also breaks moss's flush loop, and that is
the library's business.

### The record: a conversation and a log are different things

`assistant_turns.origin` is `chat` when a person asked and `watch` when nobody
did, and the two are read separately.

- `assistant/turns` (chat only) is the **conversation** — what the window renders
  and the memory the chat agent runs with.
- `assistant/log` (watch only) is what the assistant **did unasked**.

They were one read, and that was wrong in a way that mattered more than display:
the memory window is built from the same rows, so the chat agent was being fed
the watcher's lines as its own prior turns — told it had said "Opening the
thread." to somebody. An ambient line is a record of something done, not
something said.

The chat agent is shown none of it — the two agents share no history, in either
direction. "Why is that there?" is answered off the screen itself: SCREEN marks
the watcher's cards `[YOURS]`, because both agents place under the one
`assistant` origin, and that mark is the only fact about them the chat agent
needs.

A run that changed nothing writes nothing either way. Quiet runs live in the
in-memory trace, which is the debugging surface, not the record.

### The prompt's shape: static first, dynamic last

Latency, not cost, is what shapes this. A one-step glance is nearly all prefill, a
provider's prefix cache stops at the first byte that changed, and everything after
that byte is re-read whether or not it moved. So every block is written to be
**either** static for the life of a session **or** dynamic per run, never both, and
they are ordered accordingly. Each agent authors its own document — the dock's in
`chat.ts`, the watcher's in `watch/prompt.ts` — over the shared placement
vocabulary in `prompt.ts`:

```
static    voice + persona (the agent's `instructions`), the canvas contract,
          the action catalog, the steering
dynamic   SCREEN, the refusal record, the user turn
```

The persona lives in `instructions` rather than in a producer, which is why the
agent is memoized per persona and profile: identity is the one thing cortex keeps
first, so folding it in there puts the name inside the cached prefix instead of
after it.

**Who injects the output schema.** Not us. cortex builds that message
(`run.ts`) and signal decides whether it is needed, returning one boolean from
`resolveTransport`. The order cortex assembles is `instructions → tool guides →
schema doc → finish protocol → context producers → input`, so the schema is inside
the static prefix, not floating mid-prompt. Whether it appears at all depends on
what the transport can carry: `native` puts the schema in `response_format` and
`respond` puts it in the exit tool's parameters, both `false`; `emit` — which Groq
resolves to, because it corrupts nested tool-call args — has the content channel
and nothing else, so prose is the only carrier and it is `true`. On that path the
block is the output contract, not overhead, and turning it off would delete the
only statement of it the model ever sees.

**The data API is fetched, not recited.** Forty-nine query fingerprints were
~1,100 tokens on every run, and most runs never query. They are a `list_queries`
tool call instead, and filtered by the caller's charter: a read over a table the
principal cannot see is refused engine-side anyway, so listing it only teaches a
word that dies.

**ACTIONS is keyed by action id**, the same id SCREEN prints and the menu carries.
Keyed by resolved slot id — as it was — the model read `desk.issue.detail` on
screen and had to answer `ds_issue`, a translation nothing gave it and nothing
could give it, since an instance does not record which slot placed it. The one
thing a slot carried that an action does not is the capability, which is now a
validated choice in `capabilities`.

**What the model sees is narrower than what wakes it.** `WATCHED` includes `nav`,
because the menu is how a clerk changes which list they work, so it moving is a
real signal. `SEEN` excludes it: the menu's own rows name actions the catalog
already names, on a canvas nothing may be placed onto. Same reasoning drops
presentation fields (`_tone`, `_display`) and the assistant's own dock.

**`keywords` go to both heads.** They are the slots' authored match terms, the
same signal the concierge's scorer uses. They were once withheld from the watcher
on the grounds that an ambient run reacts to a screen rather than a phrase — which
is wrong in exactly the case the watcher exists for, because when a clerk opens a
conversation the phrase *is* the screen. "Could you arrange a car to the airport"
sat in `SCREEN` while the terms that match it were visible only to the head
nobody needed to help. Asked in the dock it found the surface; watching the same
words it found nothing.

They are a **retrieval aid, not the selection method**, and the catalog says so.
With a couple of dozen actions the whole list reads in one pass; what decides is
whether an action produces the outcome, not whether its terms overlap what the
guest happened to type.

Measured, watch head: **~2,130 tokens, 1.4–2.3s** end to end. It was 3,140 and up
to 4.0s.

### Reading what it saw

The context is producers over live shell state, so the only honest answer to
"what does it actually see" is the assembled messages. Every wake keeps them,
taken from cortex's own `agent.preview()` — the same pure assembly the run
performs, tool guides and finish protocol included, so a trace is the request
that went out rather than a reconstruction that can drift. Preview needs no key,
which is why `watch-check` asserts on the full prompt while reaching no network.
`WATCH_TRACE=1` prints each wake; `watch-check --trace` dumps them.

The trace is in-memory and per wake. The durable half is one row per model run in
`assistant_runs`, written through the caller's own wire like everything else, so a
record is pinned to whoever the run was for. It holds what the run cost and
**the whole exchange, turn by turn**: every message that went out, every tool the
model called with its arguments, every result that came back, and the envelope.

The abstraction is moss's — `RunRecord`, `RunTurn`, and a `runs` sink on the
manifest. moss produces nothing itself and depends on neither an LLM client nor
an agent framework: `RunTurn` is the library-blind shape cortex's messages are
flattened into (`server/assistant/runs.ts`), so a second agent, or a different
client, records through the same door. `agentId` and `agentPath` are dimensions on
the row, which is why the pane reading it is *Agent runs* rather than the
assistant's.

Two decisions worth naming. A tool call and its result stay **two turns**, in the
order the model saw them — collapsing them into pairs would lose the case that
matters most, a call nothing answered. And arguments stay the **string the
provider sent**; the pane pretty-prints when it parses and shows it raw when it
does not, because a malformed call is the most interesting thing in a transcript
and must not be tidied into looking fine.

There are no prices. Per-model rates move and rot, tokens are the honest unit, and
the row keeps `provider` and `model` so pricing can be layered on later without a
migration. `reported: false` marks a run signal had to count itself because the
provider's streamed usage frame never arrived; the pane prefixes those with `~`.

### What is not here, and why

**No second head for drafting.** `assistant.draft` was a separate `fn:` with its
own system prompt and its own model call, whose job was to propose a reply. It is
gone: a conversation takes `draft` as declared input, so the assistant writes one
through the same answer it uses for everything else.

### What moved to the libraries

Everything here that was about *nova's own vocabulary* now lives in nova, because
the app was re-deriving it:

- `isMutationStep` and the op list — there were **three** copies (nova's runtime,
  nova's audit, this app). All derive from the `OPS` registry now.
- The grammar readings (`gesturedKeys`, `declaredKeys`, `loadedKeys`,
  `lifecycleKeys`, `mountInputKeys`) → `@niscorp/nova/reflect`.
- `describeShell` — rendering a shell as text for a model → the same place.
- Push origin → `shell.push(..., { origin })` / `shell.originOf`.
- `reconcileCanvas` — make a canvas equal a desired list, honouring origin →
  `@niscorp/nova`. The declarative counterpart to push/pop/replace.
- `onSession(session)` → moss. The manifest's `functions` hook is for endpoints;
  two things that are not endpoints (the operator roster, this watcher) used to
  ride it and be registered as handlers nothing called.

What stayed is what is about *this hotel*: the profiles, the steering, the
knowledge (charter plus vex entries), the trace, and the gate's policy.
## Freshness: the database is the bus

There is no cross-session push. A write lands in the database; every other
surface reads it on its own lifecycle — mount, resume, navigation, or a message
within the writer's own shell. Correctness never depends on delivery: a missed
signal means "seen on the next read", never "lost".

An earlier revision kept a process-local session registry and broadcast into
other principals' shells. It was removed deliberately: it pinned every shell a
principal ever opened into memory, and it broke the moment a second server
process existed. The upgrade path, when liveness is wanted, is a signal THROUGH
the database (Postgres LISTEN/NOTIFY telling each process to nudge its own local
shells) and, for closed apps, external push — both purely additive over the
read-on-lifecycle model, which is why shipping without them is safe.

## The administration tool, and the seam it plugs into

Atrium is the product. `src/admin` is not part of it: it is the tool our own
company runs the platform with, and no customer, no hotel and no member of a
hotel's staff will ever hold it. It is split in two on purpose, and the split is
the only interesting decision in it.

**The seam** (`src/server/operator.ts`) lives with the app, because the things
worth administering live in the app's memory: the compiled charter closures, the
action definitions, the living shells, `refresh()`. Something must answer from
inside. It is a dozen routes gated by an `x-operator-key` header compared
against `OPERATOR_KEY`, and an unset key makes every one of them 404 — a
deployment that never sets it does not have this surface. A wrong key gets the
same 404 as no key, so nothing is learned by knocking.

**The tool** (`src/admin`) is a separate process on its own port, and it is
itself a moss app — its own charter, its own catalog, its own principal space.
It holds the key; browsers never do. `src/integrations` is a separate process
because integrations are somebody else's system; this is a separate process
because it is not part of the product being sold. The parallel is exact.

**The pill** is a second wire in the app's page, connected to the admin service,
bottom left. Atrium's served trees never mention it and atrium's server never
learns it is there. The gate is not the loader: a page with a stale token still
renders nothing, because the admin charter's `public` role grants no actions and
an unknown principal therefore resolves to an application with no surfaces.
`op_atrium` is not in atrium's cast and Rosa is not in the tool's assignments —
the two identity spaces do not intersect, which is a stronger boundary than any
check on a role could be.

### What it may do, and what it may not

The tool controls the **resolved layer** and never the charter. Withdrawing a
surface, flipping a connector's offer, moving a hotel's enablement, pulling
bundles — all rows, all followed by the resolver and `refresh()`, all reversible
without a deploy. Changing who may *ever* hold an action is the charter, which is
code, compiled and verified at boot. Making that editable at runtime would trade
`verifyCharter`'s boot-time coherence guarantee for a convenience nobody asked
for.

The one new column is `surface_slots.enabled`: ours, estate-wide, checked ahead
of the other factors and resolving as `reason = 'disabled'`. It is deliberately
not per-property — a hotel switching a service off is `property_capabilities`, a
vendor withdrawing one is `connector_capabilities`, and retiring a surface *we*
shipped is neither of those. It survives a bundle pull the same way connector
switches do, because a re-ship must not undo our own decision.

The trust boundary is structural rather than promised: the admin manifest has no
`entries`, no `resources`, no `behaviors` and no `data` section anywhere in its
charter, so there is no engine under it to ask for a hotel's rows. The seam
serves artifacts and resolution only. `admin-check` asserts both — that the
charter grants no data verbs, and that no route exists for the messages the app
demonstrably holds.

### Previewing a layout

The Catalog pane renders the layout of any action in the app — including the
ones that were never files, which arrived as `bundle_actions` rows from a
vendor's service. It works because a layout is data all the way down: the seam
returns the same JSON the shell renders from, the tool registers the component
names it uses onto its own shell (moss builds a server-side registry of
name-only stubs from the app's *own* layouts, so a foreign layout would fail
validation without this), replaces the declared `admin.preview` placeholder via
`shell.registerAction`, and pushes it wearing a fragment that supplies the
chrome — the layout inside is not ours, so the frame cannot live in it.

Endpoints, lifecycle and triggers are not carried over, so nothing in a preview
can call anything — a property of what is registered rather than a rule being
enforced.

The data is derived from the layout itself (`src/admin/app/sample.ts`). An
action's declared data is its EMPTY state — `rows: []`, `loading: true` — so
rendering it faithfully draws three skeleton bars. But a layout says exactly
which fields it will touch: `{ for: '$.rows', as: 'c' }` followed by `$c.name`
says rows is a list of things with names, and a `Rows` column spec names its own
cell keys (the case worth knowing about — without it every table in the app
previews as blank lines). Walking the tree for bindings recovers the shape with
no schema involved and nothing to keep in step, because the source is the thing
being previewed. Values are frank filler: the point of a preview is the
arrangement, and filler that reads as filler beats plausible fiction nobody can
act on. Field names still carry meaning, so `*_at` gets a timestamp and `*_tone`
gets a chip colour.

Two pieces of naming lore, declared rather than hidden: keys named
`loading`/`working`/`pending` are forced false (a preview of a skeleton is not a
preview) and `error` is forced empty. Everything else keeps what the action
declared — `expanded: true` is a real statement about which form opens.

`admin.preview` is a declared catalog entry rather than an id conjured at
runtime, so everything stays inside the rules: the operator's `admin.*` grant
covers it, moss's closure audit sees the push aimed at it, and `registerAction`
is doing what it says — replacing a definition the shell already knew.

### Explaining a refusal

"Why can this guest not see X" is the support question, and answering it meant
reading four tables while holding the charter in your head. The Explain pane
puts the chain in one line — audience → charter → resolver → stay state — and
names the link that broke. It computes no new truth: the resolver already
decided the middle and recorded *why* in `property_slots.reason`, and the
charter already decided the ceiling.

The fourth factor would have needed a hotel's row, so it is **asked instead of
read**: the operator picks a stay state. That is the more useful question anyway
("what would a departing guest see?"), and it means the pane that answers the
most operationally sensitive question is the one that touches the least.

### The API as an artifact

Entries are not a cache in the usual sense. The app is warm-only, so an unknown
fingerprint is a 500 rather than a silent generate — which makes the seeded
entries the API surface, and makes two derived facts worth as much as the
listing: entries nothing calls (`surface/matrix` sat like that for weeks) and
calls with no entry (a 500 waiting for its first click, invisible to a boot
check because nothing evaluates an endpoint until it runs).

Building it surfaced a real hole. `app.entries` is fixed at build, and boot's
refresh re-reads bundle *actions* into the running manifest but not bundle
*entries* — it never needed to, because a sync seeds them straight into
`vex_cache` and the engine reads from there. Harmless for the app, wrong for
anything trying to describe the API: on a fresh database the manifest array
holds core entries only. The seam unions the manifest with the live
`bundleState` registry.

### The timeline

nova fires an event for every endpoint an action calls — `fn:` and HTTP alike,
with outcome and duration. It has always been there; on the server nothing was
listening. The seam keeps the last three hundred, subscribed on a microtask
after session registration (`session.shell` throws until the build finishes).

**Names and timings only**, and that is a property of the record rather than a
promise: the `Call` type has no field that could hold a request body or a
response, and there is no route that would serve one. You can see that Rosa's
board called `issues/open` and that it took 4ms. What came back is not in the
feed. It re-reads on demand rather than streaming, because a push would need a
second channel from the app to this tool and the posture of the whole stack is
that freshness is a re-read.

### Agent runs

The timeline's opposite: **everything** the record holds, because what an agent was
shown is the only account of why it did what it did, and one that cannot be
reconstructed later — the prompt is assembled from screen state that has already
moved. Four cuts of one table (per agent, per person, per model, and the raw feed)
because nothing is aggregated on write.

Opening a run gives **the prompt as one text**, whole, in one scroll — reading it
straight through is the only way to see a block that says the same thing twice, or an
ordering that breaks a prefix cache. The tool calls sit **beside** it, never inside:
what was asked, and what answered. Rendering the turns as a clickable table was tried
and reverted — it looked tidy and destroyed the one artifact the pane exists for.

This is the one pane that reads ACROSS principals, which is the whole point of it
and the reason it sits behind the operator key. The seam serves no guest data, but
be clear about what it does serve: a transcript carries whatever was on the
person's screen when the model looked.

### Where the tool touches something a hotel owns

One place, named rather than hidden: the Charter and Shells panes show principal
*names*, and where a principal is a guest that name comes from a `guests` row.
It is identity metadata rather than guest data — no folio, no message, no
booking — and the demo cast is fictional, but it is the line to watch. A
deployment that wanted the boundary absolute would serve principal ids and roles
and let the operator match them up elsewhere.

### The roster, and the one thing moss is missing

"Who is connected and what is on their screen" has no answer in moss: the shell
host owns the map and exposes no enumeration. The app keeps its own note instead,
registered from the manifest's `functions(session)` hook — one call per living
shell, and the only such hook an app gets. It never touches `session.shell` at
registration time (that getter throws mid-build) and drops entries it finds dead
on read. It is best-effort by construction. The honest version is `shells.list()`
in moss, and that is promotion work rather than something to fake here.

### Promotion

Everything the seam does is `NiscApp` artifacts plus moss runtime seams, which is
the point: it is app-shaped only by accident. `createAdminPlane(app, runtime,
server)` moving into moss would make every `defineApp` server administrable by
construction, and the tool would become a generic operator client pointable at
any moss deployment — it already takes its seam as a parameter rather than an
import, and the check exercises that by handing it the app's own
`server.request`. Until it has earned that, it lives here (PLAN.md: new
machinery is built in the app first; promotion is a later, separate decision).
`admin-check` asserts the direction of the dependency, because one import the
wrong way quietly ends both properties.

## Open, and deliberately not resolved here

**Tenancy is enforced in the engine.** moss grew a `scope` seam — the app hands
it `(principal) → { propertyId }` and the merged scope context is what a
behavior's `to:` resolves against. Every PII and operational table carries
`{ match: 'property_id', to: 'propertyId' }` (writes also `set` it), so a forged
propertyId in a request body ANDs against the caller's real tenant and returns
nothing. `scope-check` proves it on the raw HTTP surface. The estate tables
(connectors, capabilities, slots) stay unscoped on purpose: the vendor is
cross-tenant by definition, and they carry no guest data.

The residual, named honestly: property scope isolates hotel-from-hotel, not
guest-from-guest within a hotel. That finer rule is role-shaped (`guest_id =
userId` for guests only) and a per-table behaviors doc cannot carry it; its home
is the charter, which knows the role. A separate, larger change.

**~~The staff chrome branches on boot-input booleans.~~** Closed. The booleans
and the nav they drove are gone; the crew's surface is composed from resolved
rows like everyone else's, so there is nothing left for a ring-2 variant to
vary.

**No auth.** Picking a name grants a token. The demo's subject is what a token
does, not how it is obtained. The administration tool inherits this: its key is
a shared secret in `.env` and its operator token is the same dev mint. Real auth
replaces the mint on both sides together, and nothing else moves.

**The tool cannot deploy yet.** It observes and it switches things on and off.
Landing new action or layout rows from it — the mechanism already exists, it is
the bundle intake path plus `refresh()` — is the obvious next slice and was left
out of the first cut on purpose, so the trust boundary could be settled before
the write surface grew.

## Verification

Thirteen headless checks, ~470 assertions, no browser and no mocks (`pnpm --filter
atrium check`), plus two jsdom probes against a running dev server
(`home-probe`, `integrations-probe`). Each runs in its own process over its own fresh database,
because several of them ship the app a different history and a shared database
would make suite order part of its meaning.

| Check | What it proves |
|---|---|
| `artifacts-check` | Every manifest artifact is pure JSON and parses its schema; every served bundle passes intake, and intake refuses six deliberate mistakes. |
| `discovery-check` | A fresh database holds no integration rows; one pull lands all three connectors; console switches survive the next pull; a refusal and a dead service both leave the old rows serving. |
| `resolution-check` | Two properties on two backends resolve to different surfaces, and each dark slot records why. |
| `shells-check` | Five principals boot five applications from one manifest. |
| `scope-check` | The tenant boundary holds against a hand-forged request body. |
| `ship-check` | A switch flip reaches shells that are already open — including an action that never existed until a row did. |
| `thread-check` | One guest sentence moves through four applications as one row. |
| `functional-check` | Every loop closes through the DB: two-way messaging (tenant-scoped), integration-supplied menus, room inventory, checkout against the real folio. |
| `desk-check` | The front desk end to end, on the shipped dataset: what is stalled and in what order, the brief's seven reads, a room move writing four rows, a goodwill credit that a machine could not have priced, a car booked through the vendor, a block checked in without stranding anybody, and an escalation landing where somebody will see it. Model-free — every field a model would fill is typed by hand, so the check asserts the seam rather than the behaviour. |
| `assistant-check` | The assistant's machinery, keyless: knowledge inside the ceiling, one tool that touches no screen, rule 14 at the seam, and the contract — placing, omitting, re-aiming without leaving stale data, filling someone else's card without taking it, and the profile bounds. |
| `watch-check` | The assistant's attention: who is watched, silence at login, a wake with an aimed reason, silence on a re-read, its own cards invisible to its own eye, a closure recorded as a refusal, `off` meaning no watcher at all, and nothing escaping into the process. |
| `integrations-check` | The app degrades honestly when the service is down, and only records a key when one was really cut. |
| `admin-check` | The operator seam is closed without our key; the tool is a separate application no hotel principal exists in; a foreign layout previews from its own JSON; the explain chain names the link that broke; the API listing flags what nothing calls; the timeline keeps names without payloads; withdrawing a surface reaches a guest's open shell and reverses; the tool can read no hotel data and the app imports nothing from it. |

`ai-check` is separate and not in the suite: it needs a key, costs money, and
asserts on model behaviour.

Two lessons from repairing it are worth keeping, because both are traps any check
against a composed application will fall into:

- **A canvas is not a place any more.** Several assertions read
  `canvases['main'].active`, which was right when a clerk's screen was one column
  and is now empty — the working surfaces are cards on `work`. An
  assertion that reads the wrong canvas asserts on `{}` and can only fail. Drive
  a composed surface by its INSTANCE (`cardDataOf`/`tapCardOf`), and check for
  placement across all canvases rather than one.
- **Composition can fake a model.** "The right surface is on the aside" was
  satisfied by the workspace composition alone, so it passed with the model
  switched off — a green tick that means nothing is worse than a red one,
  because a failure sends you looking. When the app does something
  deterministically, assert the model's half separately or assert nothing.
- **A check that does not wait measures the wrong run.** Two gestures in a row
  produce two runs, and the second lands while a naive assertion is still
  counting. Drain until the gate is quiet, then assert on a still screen.
