# vex — parameters, not fingerprints

**Status: BUILT, 2026-08-13.** All of it. Lyra went from 141 fingerprints to
112, sorting is wired, five dead automation selections are gone, and **optional
context keys exist in vex** — the item this whole document was written to
justify. Two checks hold it down:
[`sort-check.ts`](../../apps/lab/lyra/src/dev/sort-check.ts) and
[`optional-check.ts`](../../apps/lab/lyra/src/dev/optional-check.ts).

The roll now takes lens, search, cursor and sort as four values on one
fingerprint, and answers an **empty context** with the whole roll — no lens
name, no `'%'`, no empty-string cursor. Every sentinel is gone.

**Read Part 4.6 before extending this.** Three things were decided differently
from the design below once the code was in front of me, and one of Part 5's
steps was abandoned for a better reason than it failing. Part 7 lists what is
genuinely still open — chiefly the sort-aware cursor.

This document is kept for the reasoning, not as instructions. Parts 1–3 record
why the collapse was worth doing and which collapses were REFUSED; Part 4
records the design space and which point in it was chosen. Both get
re-litigated otherwise.

Every claim carries a `file:line`. Where a claim was **verified by execution**
it says so. If something is not cited, treat it as unverified opinion and check
it.

---

## Part 0 — the honest preamble

This started with a reviewer's note about Lyra's read surface:

> Reads are replay-only, one entry per question. People is 9 lenses × (list +
> count) = 18 fingerprints for one screen. Add a sort axis and paging and it
> multiplies. Decide deliberately: a bounded, validated parameter surface on an
> entry (sort field from a declared allowlist, limit/offset as context values)
> or accept the ceiling. The security property you're protecting is "the caller
> can't invent a query" — that survives an allowlist fine.

The note was right about the shape of the problem and wrong in three specifics.
All three are worth keeping, because each one would have sent the work in a
wrong direction:

1. **"We don't use vex context at all" is false.** There were 196 `$context`
   refs across 60 distinct keys. Context was used heavily — for *row identity*
   and *write payloads*. What it was never used for was **selection**: which
   subset, which order, which page. That is the real defect, and it is much
   narrower than "context is unused".

2. **The sort axis was already free and already safe.** `sortBy`/`sortDir` are
   reserved context keys the engine reads straight into the ORDER BY
   (`packages/vex/src/engine/runtime.ts:29`), and `sortBy` is resolved through
   the ordinary field resolver (`packages/vex/src/engine/resolver.ts:586`), so
   the "declared allowlist" the reviewer asked for already existed as *the
   entry's own schema*. Lyra simply never sent the keys. Zero fingerprints were
   ever at risk from sorting.

3. **"limit/offset as context values" is not expressible, and offset never
   will be.** `limit` is a literal in the DSL
   (`packages/vex/src/schemas/query.schema.ts:78`) interpolated straight into
   the SQL (`packages/vex/src/adapters/postgres/compile.ts:155`); there is no
   `offset` at all, deliberately (`packages/vex/DOCS.md:367` — use a cursor).
   Paging is an engine change, not an authoring change, and the right answer is
   a seek, not an offset.

The thing actually holding the ceiling down turned out to be none of these. It
is one line, and it is Part 4.

---

## Part 1 — what was measured

Lyra's seed at the start: **141 fingerprints** — 85 reads and 56 mutations
(`apps/lab/lyra/src/app/vex/index.ts`).

The mutations are not a combinatorics problem. A replay-only write is one verb,
dev-authored, and the def never travels; 56 verbs for this app is roughly one
per thing a person can do. The reads were where the multiplication lived.

**What was genuinely collapsible, and what only looked collapsible:**

| Pattern | Verdict |
|---|---|
| 9 lenses × (list + count) | Collapsible — the lens is a value |
| `offerings/options/{recurring,pass}` | Collapsible — the kind is a value |
| `attended-recently` / `attended-on-day` | Collapsible — one window |
| `bookings-today` / `bookings-on-day` | Dominated — delete one |
| `subscriptions-ending` / `memberships-ended` | Collapsible — status + window |
| 4 × retire/restore | Collapsible — the flag is a value |
| `me/*` ↔ staff twins (3 pairs) | **Not** collapsible — differ by `reach` |
| `revenue/{expected,committed,leaving}` | **Not** collapsible — differ by *column* |
| `attendance-by-{hour,week,program}` | **Not** collapsible — differ by `groupBy` |
| every list/byId pair | **Blocked** — see Part 4 |

The `reach` twins are the important negative result. `me/membership` and
`subscriptions/for-member` are the same query; what differs is that one is
`reach: 'personal'` and the other takes a `personId`. Collapsing them would let
a member surface name somebody else's id — the exact thing `reach` exists to
prevent. **They are not slack. Do not "fix" them.**

---

## Part 2 — what landed (BUILT)

**141 → 112 fingerprints.** Reads 85 → 60, mutations 56 → 52. `tsc` clean;
`sort-check`, `tide-check`, `automations-check`, `course-check`, `intake-check`,
`model-check`, `timetable-check` all green — **verified by execution**.

### 2.1 The lens is a value (18 → 2)

`people/list/{lens}` and `people/count/{lens}` became `people/list` and
`people/count`, taking a `lens` context value
(`apps/lab/lyra/src/app/vex/member.entries.ts:127-132`). Each lens is a guarded
arm of one OR: `{ eq: [{ $context: 'lens' }, '<name>'] }` ANDed with that lens's
conditions. Exactly one guard can be true, so the OR reduces to that lens.

The old comment in that file claimed this was impossible, because a computed
standing cannot be filtered on. That part is still true — but it was never the
obstacle. Two things make the collapse work:

- **A `$context` ref is legal on either side of a comparison**
  (`packages/vex/src/schemas/filter.schema.ts:28` — `comparisonPair` is
  `[FieldOrValue, FieldOrValue]`) and compiles symmetrically
  (`packages/vex/src/adapters/postgres/operators.ts:80`). So the guard compiles
  to `$1 = 'members'`.
- **It stays a flat scan.** `anchored()`
  (`apps/lab/lyra/src/app/vex/standing.ts:30`) returns *bare local predicates*
  when the base is `studio_people`. The roll's base IS the anchor, so all nine
  arms are comparisons against mirror columns on the row already being read —
  not nine correlated subqueries.

The closure property survives and is now tested: an invented lens guards no arm
and selects nobody (`scope-check.ts`, "an invented lens selects nobody" —
**verified by execution**). Previously an invented lens was a 404; now it is an
empty result. Both are refusals; neither widens anything.

### 2.2 Sorting, wired (0 → 2 lists, 0 new fingerprints)

`sortBy`/`sortDir` now flow prism → action data → layout headers → re-read
trigger on Staff and Pricing. An empty `sortBy` leaves the entry's authored
order alone (`runtime.ts:29` returns the DSL unchanged), so the default costs
nothing.

`sort-check.ts` proves the allowlist is the schema — **verified by execution**:
sorting by a table the entry does not join, by an invented column, and by
`offerings.name; DROP TABLE offerings` are all refused with 400. This is the
reviewer's "declared allowlist", except nobody has to declare or maintain it.

**Two lists deliberately not wired**, and the reasons are load-bearing:

- **The People roll.** It has a keyset seek on `(name, person_id)`
  (`member.entries.ts:92`), and `applySortContext` **replaces the entire sort
  array** (`runtime.ts:29`). A caller-supplied `sortBy` would drop the
  `person_id` tiebreaker and desync the cursor — skipping or repeating people.
  Sorting and seeking cannot both own the order until Part 4 lands.
- **The timetable.** Grouped by `runs_display`; a replaced sort makes group
  headings repeat down the page. Its inert `sortable: 'name'` was removed (it
  never had an `onSortRef`, so it had never done anything).

### 2.3 The read pairs, and two refusals

Merged: `offerings/options` (kind as context), `automation/attended` (a
`from`/`to` window), `automation/subscriptions-by-end` (status + window).
Deleted: `automation/bookings-today`, strictly dominated by
`automation/bookings-on-day`, which is the one an actual moment uses.

**Two from the original list were dropped after reading the compiler.** Both
would have made the code worse to save one fingerprint each:

- **`staff/list` + `staff/teachers`.** `in` with a `$context` ref always binds
  `string[]` (`operators.ts:185`), so a boolean array is not passable; and
  `staff/list`'s `neq 'automation'` is deliberately *negative*, so a new role
  appears on the roster automatically. Merging meant trading that for a
  fragile positive enumeration.
- **`studio/members/active-count`.** Genuinely derivable from
  `reports/members-by-status`, but they are a scalar dashboard tile and a
  grouped chart series, on different endpoints. The saving would have pushed
  array-picking into a layout.

### 2.4 The four boolean pairs (8 → 4)

`templates`, `courses`, `offerings`, `staff` retire/restore became
`*/set-active` taking `active` as a boolean context value.

**This gives up nothing, and the reason is worth writing down.** A boolean
column bounds the value completely, and charter grants are `table.operation`,
not per-fingerprint (`apps/lab/lyra/src/app/charter/charter.ts`) — so
`templates/retire` and `templates/restore` already sat behind one identical
grant (`class_templates.write.update`). Splitting them never bought a narrower
permission; it only bought two entries that could drift.

**The pairs that were NOT merged, and why:** `subscriptions/pause` +
`resume` and `give-notice` + `withdraw-notice` are different **ops** on
different **tables** (an insert into a ledger vs an update of it). They are not
a flag. `addons/install` + `uninstall` likewise. And `sessions/cancel` +
`restore` write an *enum*, not a boolean — mergeable, but it would widen one
verb to any legal status, so it was left alone as a judgment call a human
should make rather than a cleanup.

### 2.5 Dead automation selections, removed

Five entries were seeded but wired to no moment, no recipe and no check:
`automation/attended`, `automation/waitlisted`,
`automation/subscriptions-by-end`, `automation/enrolments-starting`,
`automation/memberships-paused`. Only five moments exist
(`apps/lab/lyra/src/app/reflexes/compose.ts`), and they use
`joinedSubscription`, `enquiredPerson`, `trialsDue`, `membersLapsedAway`,
`bookingsOnDay`.

They were the residue of moments cut for stated reasons (three were *refused
every time they ran* — they read tables the automation rung has no grant on).
The reasoning for the cut is preserved in the comment at `compose.ts:50-70`;
that is the part worth keeping. The unreachable SQL was not.

---

## Part 3 — a note for whoever runs the checks next

While this work was in flight, a **concurrent session** landed i18n on the same
tree. Six dev-check assertions now fail and one crashes, and **none of them are
about anything in this plan**:

- Lumen is seeded `locale: 'de-AT'` (`apps/lab/lyra/src/db/seed.ts:69`), so
  `fillText` renders "12 **von** 20" and money renders `€ 89,00`, while
  `scope-check` and `plans-check` still assert `'of '` and `'€89'`.
- `phrases.de.ts:444` maps `'Start plan' → 'Tarif starten'`, so `members-check`
  and `member-check` fail on English button labels.
- `roundtrip-check` **crashes**: `directory.greetingFor is not a function`
  (`apps/lab/lyra/src/app/app.ts:353`).

The reads behind those assertions were probed directly and answer correctly.
Fix the assertions with the i18n work, not with this.

---

## Part 4 — the wall: optional context keys (BUILT)

### 4.1 The mechanism, exactly

`packages/vex/src/engine/runtime.ts:444-446`: after compiling, the engine calls
`findMissingContext`. If **any** param slot's key is absent from `context`, the
read returns `result: []` with `meta.missingContext` and **never executes**.

Every `$context` ref is mandatory, always. There is no way to author "this
clause applies only when the key is present."

### 4.2 What that one line costs, concretely

Every one of these is the same defect wearing different clothes:

- `q: '%'` is passed on every roll read because the search clause cannot be
  absent (`member.entries.ts:65`).
- The seek passes `after: ''` for a first page, relying on every name sorting
  above the empty string (`member.entries.ts:92`).
- The lens needed **nine guarded OR arms** to express one clause
  (`member.entries.ts:127`). It works, but it is the ugliest DSL in the app.
- `people/byId` and `people/byEmail` cannot merge: there is no sentinel that
  means "no id filter."
- **Every list/byId pair in the app is two entries for this reason alone.**
- The People roll cannot be sorted, because the seek clause cannot become
  optional per sort column (Part 2.2).

Sentinels work where a type has a "match everything" value (`ilike '%'`, `> ''`).
They do not exist for an `eq` on an id. That is the boundary.

### 4.3 The finding that changes the trade-offs

**vex has no compiled-SQL cache.** `runPipeline` (`runtime.ts:110`) executes on
every request, and `applySortContext` already varies the DSL per call
(`runtime.ts:438`). So "the SQL text varies per call" is not a new cost — it is
the existing design.

This matters because the usual objection to clause-dropping is "you can no
longer cache the compiled query." There is nothing to lose. The only real cost
is **Postgres plan-cache pressure** from more distinct SQL texts, which is a
different and much smaller problem.

### 4.4 The decisions that have to be made

1. **Where optionality is declared** — on the ref, on the filter node, or in an
   entry-level parameter contract.
2. **What "absent" means** — key missing only, or also `null`, or also `''`.
   Get this wrong and "search for the empty string" becomes unsayable. The
   recommendation is **missing-or-`undefined` only**; `null` stays a real value.
3. **What happens to the enclosing boolean** — dropping a clause from `and` is
   identity-true, from `or` identity-false, from `not` ambiguous. Either the
   engine infers it (fragile) or the author states it (verbose).
4. **Whether it applies to writes. It must not.** `executeMutation` throws
   `missing_context` deliberately (`packages/vex/src/mutations/engine.ts:396`)
   — a write with a hole is a blanket UPDATE waiting to happen. **Reads only.**

### 4.5 The four options

**① Sentinel discipline — no engine change.**
Formalise what Part 2 did: `'%'` for ilike, `''` for a seek, an `everyone` arm
for a lens.
*For:* zero risk; already shipped.
*Against:* no sentinel exists for `eq` on an id, so list/byId is split forever;
sentinel semantics live in the author's head; the lens cost nine arms to say one
thing. **This is the ceiling as it stands.**

**② Null-guarded refs.** `{ $context: 'q', optional: true }` compiles to
`($n IS NULL OR col ILIKE $n)`; an absent key binds NULL.
*For:* smallest change; one SQL shape per entry; fingerprint identity untouched;
`findMissingContext` simply skips optional keys.
*Against:* `OR $1 IS NULL` can push Postgres off an index — on the 2,000-row
roll this is meant to serve, which is the whole point. And NULL stops being a
passable value through that param.

**③ Presence-shaped filter node.** A first-class
`{ optional: { key, then: <filter> } }`. The engine computes a presence
signature from the supplied keys, drops absent branches, compiles the rest.
*For:* the author states *where* the clause sits, so `and`/`or`/`not` placement
is explicit rather than inferred (decision 3 above, solved by construction);
each variant is a tight query with a clean plan; **it is the only option that
collapses list/byId**, because it can drop an `eq` on an id entirely. Costs vex
nothing extra given 4.3.
*Against:* plan-cache pressure, bounded at 2^(optional keys) — cap it and log
the first sighting of each variant; it is a new DSL node, so the Zod schema and
the agent-generation path both need it.

**④ Declared parameter contract with defaults.** The entry declares its
parameters up front — name, type, required/optional, default — and absence
substitutes the default.
*For:* this is what the reviewer actually asked for: "a bounded, validated
parameter surface on an entry." `buildContextContract` already returns half of
it in `meta.context`; this makes it *authored* and introspectable, so discovery
can tell a caller what a fingerprint takes without a `missing_context`
round-trip.
*Against:* on its own it is ① with the sentinel moved server-side. It still
needs a meaningful default per type and still cannot say "no id filter at all."

### 4.6 What was actually built, and where it departs from the above

**③+④ was chosen** — the presence-shaped node with a published contract. Four
things turned out differently once the code existed, and each is worth keeping:

**① The prune is a DSL→DSL pass, not a compiler feature.**
[`engine/optional.ts`](../../packages/vex/src/engine/optional.ts) resolves every
optional condition at the same point `applySortContext` runs
(`runtime.ts:438`), so the node **never reaches the resolver, the compiler, or
the scope walker**. That was not the plan — the plan assumed three walkers to
teach. It is strictly better, and the reason is a safety argument rather than a
tidiness one: an entity cannot enter the query after `discoverEntities` has
decided what to scope, because by then there is nothing left to resolve. All
three walkers now `refuseOptional()` if they ever meet the node, which
converted a silent hole into an error — `scope/discover.ts` fell THROUGH on an
unrecognised node (contributing no entities, hence no tenant filter) and
`operators.ts` fell through to `return 'TRUE'`.

**② The contract is derived, not declared.** ④ said entries would declare their
parameters. They do not: `optionalKeysOf(dsl)` reads them off the stored DSL and
`buildContextContract` marks them `optional: true`, plus `absent: true` for the
ones this run did not supply. A hand-written declaration can disagree with the
filter it describes; a derived one cannot. This is the rule vex already applies
to mutation signatures ("Nothing is authored; nothing drifts", DOCS.md).
**Defaults were dropped entirely** — with clause-dropping, a default is a second
mechanism for the same job.

**③ Absent means missing, `undefined`, OR `null`** — wider than 4.4's
recommendation. Two reasons agreed. A bound null can never match anything
(`col = NULL` is NULL, never true), so "send null" could only ever have meant
"I have nothing", and `isNull`/`isNotNull` already exist for the real question.
And a request prism assembles a fixed object — it **cannot omit a key** — so
without this every empty search box would need a sentinel again, which is the
thing being removed. `findMissingContext` keeps its narrower `undefined` test
for required keys.

**④ `people/byId` + `people/byEmail` do NOT merge**, and Part 5 step 4 was
abandoned. Not for ergonomics — they read different tables on purpose.
`people` is global (no `studio_id`, schema.ts:103); `studio_people` is the
per-studio anchor. `byEmail` reads `people` ALONE so intake can find a human who
exists but has no anchor here yet — a former member, or a signup whose address
is already known. Joining `studio_people` would make that INNER and return
nobody for exactly the case it exists for. **The proof case became `staff/list`'s
search sentinel instead**, then the roll.

### 4.7 Found in review, after the above was written

**A gate names EVERY key its condition reads.** `key` accepts a string or an
array, and the condition applies only when *all* of them are present. The first
cut gated the roll's cursor on `after` alone while the surviving clause also
read `afterId` — so a caller sending half a cursor got `[]` and
`missingContext: ["afterId"]`, which on a paging loop reads as **the end of the
roll**. People silently lost. An incomplete gate now drops the whole condition
and answers the first page: still wrong, but wrong where a caller can see it.
This is the failure mode the feature was supposed to remove, reintroduced by
gating carelessly, and it is worth assuming any future two-key condition has it
until the gate says otherwise.

**"Absence widens" is only true under `and`.** Under `or` an absent key removes
an *alternative*, so the answer gets narrower. Both readings are correct —
absence means "as if the condition were never written", and position decides
the direction. The earlier wording here and in the check stated the `and` case
as though it were general. What holds unconditionally is the security property,
and only that: **absence never reaches past scope**, because scope is injected
after the prune. `optional-check.ts` now asserts both directions on the pure
function.

**Two claims in Part 7 were made without a test.** The seed lint refusing an
optional inside a mutation, and the three walkers refusing an unpruned node,
were both written and then listed as done. Neither had an assertion until this
review. Both do now.

---

## Part 5 — the recommendation and the build order

**Build ④ as the surface and ③ as the mechanism.** The contract is what callers,
the agent and discovery see; the presence-shaped node is how the filter actually
varies. They are complementary, not alternatives: ④ without ③ cannot drop a
clause, and ③ without ④ has no introspectable surface.

Take **② instead** only if the constraint is "smallest possible change this
week" — and expect to revisit it the first time the roll gets slow.

Order:

1. **Schema + contract.** Add the optional/default parameter declaration to the
   seed entry type and to `ContextSchema`'s validation path. Surface it in
   `meta.context` — no behaviour change yet, so nothing can break.
2. **The `optional` filter node.** Zod schema, then the resolver, then the
   compiler. Reads only; assert at seed-lint that no mutation contains one.
3. **Presence signature + `findMissingContext`.** A key that is declared
   optional is not "missing". Log the first compile of each presence variant,
   and cap the variant count per entry.
4. **Prove it on the smallest real case:** merge `people/byId` and
   `people/byEmail`. Two required keys today, one optional clause each after —
   if that does not read cleanly, stop and reconsider the node shape.
5. **Then the roll.** Replace the nine guard arms with an optional lens clause,
   drop the `q: '%'` sentinel, and make the seek clause optional.
6. **Then sorting on the roll** — which is the payoff. With the seek clause
   optional per column, sort and seek stop fighting.
7. **Fix `applySortContext` while you are there.** It replaces the whole sort
   array (`runtime.ts:29`); it should compose with the entry's trailing
   tiebreaker instead of discarding it. This is what blocked Part 2.2, and it is
   a five-line fix that needs a decision about precedence.

Do **not** do the list/byId sweep across the app until step 4 has been reviewed
by a human. It touches every domain.

---

## Part 6 — the decisions, and how they went

1. ~~**② or ③+④**~~ — **③+④**, built. See 4.6 for how each half landed.
2. ~~**Absence semantics**~~ — **missing, `undefined`, or `null`**, wider than
   recommended. Reasoning in 4.6 ③.
3. ~~**The variant cap**~~ — **32, and it warns rather than refuses**
   (`maxPresenceVariants`, `runtime.ts`). Every variant is still a query the
   author wrote and scope still applies, so failing a legitimate read to make a
   point about authoring was the wrong trade. The warning says an entry has
   stopped being a question and started being a query builder.
4. **`sessions/cancel` + `restore`** — STILL OPEN. Merging writes an enum from
   context; the column's CHECK bounds it to three legal statuses, so it is safe
   in the database but widens one verb. Deliberately left for a human.
5. ~~**Sort precedence**~~ — **the caller's column leads, the entry's own keys
   stay behind it as tiebreakers**, with the caller's column removed from the
   tail so it cannot appear twice with two directions (`applySortContext`). The
   old behaviour replaced the sort outright, which silently un-totalled any
   keyset page key — `(name, id)` became `name`, and two people sharing a name
   could straddle a boundary and never be reached.
6. **Whether the cut moments come back** — STILL OPEN. Part 2.5 deleted their
   SQL. Three were refused by the charter every time they ran; they need a grant
   and a proof, not a re-paste.

---

## Part 7 — done, and what is left

Done, each with a passing assertion:

- ✅ A read that omits an optional key executes with that clause **absent**
  rather than returning `[]`.
- ✅ The People roll takes lens, search, cursor and sort on **one** fingerprint
  and answers an empty context with the whole roll.
- ✅ `meta.context` publishes optional keys — including the ones this run did
  not supply (`optional: true, absent: true`) — so a caller learns the shape
  without failing first.
- ✅ A mutation containing an `optional` node fails the seed lint
  (`mutations/signature.ts`).
- ✅ `sort-check.ts` passes unchanged: the schema is still the allowlist, and
  optionality opened no way to name a column the entry does not read.
- ✅ The negatives are tested in `optional-check.ts`: an absent key reaches no
  further than the tenant's own rows; an invented lens still selects nobody; a
  condition that is not optional survives its neighbour's absence; direction is
  asserted in **both** the `and` and `or` cases; half a cursor drops the seek
  instead of emptying the page; and the two refusals above actually throw.
- ❌ ~~`people/byId` and `people/byEmail` are one entry~~ — withdrawn, 4.6 ④.

Still open:

1. **A sort-aware cursor.** The seek compares `(name, person_id)`, so it is a
   position in THAT order. Sorting the roll by any other column therefore gets
   one ordered page and no "show more" — stated in the UI rather than left as a
   paging bug (`people.actions.ts`, `FULL_PAGE`). Lifting it means a cursor per
   sortable column **and per direction**: four optional clauses for two columns.
   Worth doing when a second sortable list wants paging too.
2. **The list/byId sweep.** Now unblocked, and deliberately not done — it
   touches every domain and wants a human's eye per pair, since `byId`/`byEmail`
   showed that "same shape" does not mean "same question".
3. **Part 6 items 4 and 6.**

Not this plan's, but blocking a green suite: **7 checks fail on the concurrent
i18n work** — `$localeMoney needs an ISO-4217 currency code` is a real bug in
that feature, not a stale assertion. See Part 3.
