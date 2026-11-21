# Fix proposals — prism and loom

**What changed in this revision** (after an independent check; its probes are in `scratchpad\proposal-check\prism-loom\out`):

- **P7** is now the smaller design. Only the impossible-date check is added, inside each existing reader; `$localeDate` reads as before. The earlier version changed answers for real dates (two-digit years, `$localeDate` on year-only text, a one-item list) and changed one error code.
- **P10** costs 9 steps an item instead of 8. Lists of about 111,000–125,000 items that pass the default limit today would be refused, so P10 now needs an owner decision. The first version cost 11.
- **P21** offers a fix that needs no grammar change: a `timeZone` option on `evaluate` and `execute`. It is built and tested.
- **L1**: the prism plugin part is built and tested. An optional field now keeps showing its controls as today, with a Remove link while it has a value. There is no Add, and one new prop (`optional`).
- **L12** checks against zod's core classes (`$ZodObject` …), which zod/mini schemas match too.
- **P1** names two more newly refused cases.
- Test labels now match the proposal numbers, and the prototype's line endings match the repo's (LF).

Written against `review-fix/all-check` (worktree `fix-all-check`, at 39c246ab). Nothing there was changed, built or committed.

How each item was checked:

- The third review's probes (`scratchpad\review3\prism-loom\p1.mjs` … `p6.mjs`) were run again against `fix-all-check`'s built prism. Loom was probed with a vitest file of my own (`scratchpad\proposals\prism-loom\loomprobe\probe.test.tsx`, output in the same folder).
- Most proposals were built in a copy of the two packages, in `scratchpad\proposals\prism-loom\proto\packages\{prism,loom}`. That copy's `node_modules` links to `fix-all-check`'s, and only the copy's `src` was edited.
- Each proposal's behaviour test is written and run:
  - prism: `proto\packages\prism\test\zz-proposals.test.ts`. On the prototype, 25/25 pass and the package's own 743 tests still pass, in Vienna and with `TZ=America/Los_Angeles`; `tsc` is clean. On today's code (a copy of `fix-all-check`'s src in `scratchpad\proposals\prism-loom\orig`), the 22 tests that check a fix fail, and the 3 that check an answer stays the same pass.
  - loom: `loomprobe\proposals.test.tsx`, run against the prototype (`LOOM_ROOT=…\proto\packages\loom`) and against `fix-all-check`. On the prototype, 17/17 pass and `tsc` is clean. On today's code, the 16 tests that check a fix fail, and the 1 that checks a stored document still shows its controls passes. The package's own suite has 111 tests; 109 pass on the prototype, and the 2 that fail are the ones that test the select behaviour that L5 changes on purpose.

Facts that apply to every proposal below:

- **No proposal changes a schema.** No file under `prism/src/schemas` changes, and loom has no grammar. So `pnpm check:grammars` and every app's `strata.lock.json` stay as they are, and no app has to run `strata upgrade`.
  - This matters because an app pays for any grammar change, even an additive one with an empty marker migration. It raises prism's grammar version, and each lab app's CI step `strata status --check` then fails until that app runs `strata upgrade` + `verify` (`packages/strata/src/node/index.ts:246-262`, `.github/workflows/verify.yml:84`). By the owner's definition that is something a host must do before upgrading. Every proposal that would need a new field in an op is therefore written in another form, or marked for the owner.
- **Edits to `.describe()` text are prose.** The snapshot comparison strips `description`, so these edits need no migration. STYLE_GUIDE still requires a subagent review of every description edit before it lands.
- **Fingerprints.** Where a proposal changes what a config compiles to (P10, P15), the IR's `fingerprint` changes for configs that use those ops.
  - Vex compares fingerprints when it seeds its cache (`vex/src/cache/seed.ts:59-70`) and re-seeds such an entry once. No host action is needed.
  - An IR stored before the upgrade keeps running exactly as it was compiled.
- **strata migrations.** The only document-step migration in the lab apps is lyceum's "Look" step (`apps/lab/lyceum/src/app/grammars.ts:39-55`). It uses `$update` on `props.look`, and only when `props.look` is `poster` or `plain`, so `props` is an object there. No proposal changes its result.
  - Nova's, prism's, vex's and tide's sequences have no document steps that use a changed op.
  - The corpus (`strata/corpus`) is checked by schema only, so its stored `$min`, `$fill`, `$slice`, `$dateDiff`, `$get` and `$eq` are not evaluated by the gate.
- **Changesets.** Every change carries a `patch` changeset.

---

## Table

| # | Item (open file) | Proposal | Status |
|---|---|---|---|
| U1 | PRISM-3 config side: zod drops a `__proto__` key in a template, `$const`, `$with`, `$renameKeys` | P20 | needs owner decision |
| U2 | PRISM-4 `$date` reads a zone-free time in the server's zone | P21 (+ P15) | proposal (additive option) |
| U3 | PRISM-6 lenient path parser (`$.a.`, `[1e0]`, `[0x1]`, `[ 1 ]`, `$.`) | P19 | needs owner decision |
| U4 | Intl formatter caches unbounded | P16 | proposal |
| U5 | `$localeNumber`/`$localeDate` bare RangeError for bad authored options | P6 | needs owner decision |
| U6 | LOOM-9 dotted keys | L8 | needs owner decision |
| U7 | LOOM-10 inline colours, no tokens | L9 | proposal |
| U8 | LOOM-6: `toNova` + `attachValidation` used directly with a top-level `_errors` | L10 | proposal (docs) |
| U9 | LOOM-9(b) enum discriminator branch | — | already fixed: `tagPattern` keeps every value (`compile/parse.ts:69-73`), `matches` tests `values` (`react/kit/shared.ts`) |
| U10 | Rename refusal shows a clash | — | already fixed: `react/kit/key-input.tsx` keeps the typed name and shows `"x" is already a key` |
| U11 | LOOM-4 template names; LOOM-7 refused non-object seed | — | already fixed: names are `loom:tree:<id>:<n>` (`to-nova.ts:252`); probe: seed `42` for `z.string().email()` reports `{"value":42}` |
| S1 | `$replace` replacement read as a JS pattern | P11 | needs owner decision |
| S2 | `$date` accepts nonsense ("hello 5", "2026-02-30") | P7 | needs owner decision ("2026-02-30"); "hello 5" stays as it is, see P7 |
| S3 | Math results Infinity/NaN; `$round 1.005` → 1 | P4, P3 | needs owner decision |
| S4 | `$eq`/`$neq` key-order dependent; `$unique` keeps both | P17 | needs owner decision |
| S5 | `$reduce` with `as` equal to `acc` | P22 | proposal (docs) |
| S6 | `$localeMoney` swallows a bad locale, divides by 100 | P5 | needs owner decision |
| S7 | DESIGN context type omits `kept`; "63 more" stale | P23 | proposal (docs). The count is already right: 65 guards = the 2 shown + 63 |
| S8 | loom key with a dot | L8 | needs owner decision |
| S9 | LoomEditor `onChange` on mount with the default for a refused non-object root | — | already fixed (LOOM-7): probe reports the stored seed `{"value":42}`. An object-root document whose seed is not an object opens the defaults, as DESIGN documents |
| S10 | `parse` calls `safeParse(undefined)`, a `z.preprocess` throws at compile | L11 | proposal |
| S11 | Inside unions `empty`/`includeOptional:false` ignored; plain `z.union` of literal-tagged objects starts with `kind: null` | L1, L3 | needs owner decision |
| S12 | Union of `z.lazy` branches → raw JSON box | L2 | needs owner decision |
| S13 | `parse` reads zod internals by cast; imports reach behind module doors | L12 | proposal |
| R3-p1 | `$update` drops list items, overwrites a scalar; `$has` ≠ `$get` | P1 | needs owner decision |
| R3-p2 | `$fill` builds 559 MB before the string limit | P2 | proposal |
| R3-p3 | `$round` floor/ceil wrong at exact decimals; digits 400 → NaN; `$mul` → Infinity | P3, P4 | needs owner decision |
| R3-p4 | `$localeMoney` bad locale divisor; `Number()` reads `[1999]`, `true`, `"0x10"`, `"   "` | P5 | needs owner decision |
| R3-p5 | Intl errors escape with no code | P6 | needs owner decision |
| R3-p6 | `$date` accepts impossible dates; `$dateDiff` to Feb 30 | P7 | needs owner decision |
| R3-p7 | Second call differs from first: `__proto__` via `copyOf`; `$join` 600 parts passes the step limit on call 2 | P8, P9 | P8 needs owner decision (one line); P9 needs owner decision |
| R3-p8 | `$min`/`$max` depend on where a null sits | P10 | needs owner decision (step cost) |
| R3-p9 | `$replace` `$$`, `$&` | P11 | needs owner decision |
| R3-p10 | Text ops cut a character in half; `$length "👍🏽"` = 4; `$interpolate` names ASCII only | P12, P13 | needs owner decision |
| R3-p11 | `__optional` does not cover a `$get` that runs into null | P14 | proposal |
| R3-p12 | Zone-dependent text worked out at compile time | P15 | needs owner decision |
| R3-p13 | Intl caches never shrink (50,000 locales ≈ 20 MB) | P16 | proposal |
| R3-p14 | `$walk` "always terminates"; `$eq` key order; `{$ref:"$."}` | P18, P17, P19 | P18 proposal; P17, P19 need owner decision |
| R3-l1 | Prism op chooser fills optional args that change what the op does | L1 | needs owner decision |
| R3-l2 | An optional field cannot be left out | L1 | needs owner decision |
| R3-l3 | A union shows the wrong branch (optional key; unknown tag) | L2 | needs owner decision |
| R3-l4 | Clearing a number writes null; `integer` ignored | L4 | needs owner decision |
| R3-l5 | First option of a required enum not choosable | L5 | needs owner decision |
| R3-l6 | `onChange` fires twice per edit | L6 | proposal |
| R3-l7 | Field names `toString`/`constructor` never show their message | L7 | proposal |
| R3-l8 | `node-editor.tsx` is a second form engine | L1 (its defaults), L13 (the rest) | needs owner decision |

Counts:

- 46 items (U1–U11, S1–S13, R3 prism 1–14, R3 loom 1–8; R3-p7 and R3-p10 each have two causes).
- 4 already fixed: U9, U10, U11, S9. The "63 more" count in S7 is also right already.
- 36 proposals: P1–P23 and L1–L13.
  - 13 can go as written: P2, P14, P16, P18, P21, P22, P23, L6, L7, L9, L10, L11, L12.
  - 23 need an owner decision. Each one says why in a line that starts "Owner to confirm:".
- For 3 items no non-breaking fix exists, and what stays open is stated: P19, P20 and L13. P17 is the same in effect: today's result is documented and tested, so a real fix changes answers.

---

# Prism

## P1 — `$update` and `$has` read a path the way `$get` does

**Problem.** The three ops that take a literal path read its segments in three ways.

- `$update` `{items:[{qty:1},{qty:2}]}` at `["items","0","qty"]` → `{"items":{"0":{"qty":5}}}`: the list becomes an object, and item 2 is lost.
- `$update` `{title:"Hello"}` at `["title","en"]` → `{"title":{"en":"Hi"}}`: "Hello" is lost, with no error.
- `$get` reads `"0"` on a list as index 0. `$has` answers `false` for the same path.

**Root cause.** `setIn` (`ops/transform.ops.ts:59`) treats every string segment as an object key, and when the value there is not an object it uses `{}` in its place. `has` and `current` do not use `$get`'s rule either (`ops/core.ops.ts:79`: digit text on a list is an index).

**Design.** One rule for a segment, shared by `$has`, `$update` and `$update`'s `current` value. It is `$get`'s rule:

- a number, or digit text (`INDEX_TEXT`) on a list, is an index;
- any other text is a key.

`setIn` then never puts an object where a value was. On a list, a text key that is not an index is refused with `E_TYPE`: "No key "x" at items.x: the value there is a list…". A string, number or boolean on the path is refused the same way. A missing key or `null` on the path is still created as an object, as documented ("Missing objects along a string path are created").

Prototype: `asIndex` plus the refusal, 12 lines in `transform.ops.ts`.

**What changes for apps.**

- lyceum's "Look" migration: `props` is an object there, so its result is unchanged.
- No other lab app and no corpus document uses `$update` or `$has`.
- Owner to confirm: three results change.
  - A digit-text segment over a list now updates the item. Today the list is replaced by an object and its other items are lost.
  - A non-index key on a list, or any key on a string, number or boolean, is now refused with `E_TYPE`. Today that value is replaced by a new object and is lost. This includes:
    - `from` itself being a number (`$update` of `5` at `["a"]`, today `{a:…}`);
    - `"01"` on a list. It is not index text, as for `$get`, so it is refused; today the list becomes `{"01":…}`.
  - `$has` with a digit-text segment over a list now answers `true` where the item exists. Today it answers `false`.
- A strata document step that uses `$update` in one of these ways gives a different result to a document upgraded after the release than to one upgraded before. Documents already upgraded keep the shape the old result gave them.
- If the owner wants only the list cases, the string, number or boolean case can stay as it is and be documented. It is the same class of loss.

**Test.** `zz-proposals.test.ts` "P1":

- `["items","0","qty"]` over a list → `{items:[{qty:5},{qty:2}]}`;
- `$has` → `true`;
- `["items","x"]`, `["title","en"]` over a string, `from: 5`, and `["items","01"]` → `E_TYPE`;
- `{}` and `{props:null}` still get `{props:{look:"dom"}}`.

All fail today.

**Size.** src ~12, test ~15. New mechanism: no. It reuses `$get`'s `INDEX_TEXT`.

## P2 — `$fill` is measured while it builds

**Problem.** Nested slots that use one slot twice (`{phrase:"{a}{a}", slots:{a:…}}`) double the text at each level.

- Probe, depth 23 (798-byte source, `maxStringLength` 1000): 8,388,608 characters and 2 s before the refusal.
- The review measured 15 s and 559 MB for 900 bytes.

**Root cause.** Every other op returns through `evaluateNode`, which measures each result (`engine/evaluate.ts:24`). `fillOne` recurses on its own, so the string limit is checked only once, on the finished text. This is the only op that builds a value through its own recursion. `$walk` and `$reduce` evaluate through `evaluate`, and `$reduce` already measures its accumulator on each item.

**Design.** `fillOne` takes the budget and measures each phrase it fills (`measureString`) before returning it. The first level past the limit refuses. The work done is about twice the limit, then it stops.

**What changes for apps.**

- Nothing. A fill within the limit gives the same text, and a fill past it is refused with the same `E_BUDGET`, sooner.
- The refusal message names a smaller character count.
- lyra's `$fill` (`me.actions.ts:129`) is unchanged.

**Test.** Depth 25, limit 1000: `E_BUDGET` in under 200 ms (today 8.5 s). `{phrase:"{n} items",slots:{n:3}}` → `"3 items"`.

**Size.** src ~8, test ~10. New mechanism: no.

## P3 — `$round` rounds at the decimals as written

**Problem.**

- ceil of 1.1 at 2 digits → 1.11;
- floor of 4.35 at 2 → 4.34;
- floor of 0.29 at 2 → 0.28;
- 1.005 at 2 → 1;
- digits 400 → NaN;
- 1e300 at 10 digits → NaN.

**Root cause.** `value * 10**digits` (`ops/math.ops.ts:62`) is a binary product: 1.1 × 100 = 110.00000000000001. Past about 308 digits the factor is Infinity.

**Design.** Move the number by its decimal exponent instead of multiplying: `Number("1.1e2")` is exactly 110. Round, then move it back the same way. If moving makes the number non-finite, it has no digits at that place, so it is returned unchanged.

Prototype: `shifted(value, digits)`, 5 lines. `Math.round`'s rule for halves is kept (−2.5 → −2).

**What changes for apps.**

- With `digits` 0 (atrium's `€` and minute formats, encore's percent) every result is identical, because a move by 0 is the number itself.
- encore's `fill: $round(zoneFill, 2)` can differ by 0.01 for a ratio that is exactly halfway when written in decimals (0.285 → 0.29 instead of 0.28).
- Owner to confirm: floor and ceil change at values that are exact in decimals (1.1 → 1.1, not 1.11). Nearest changes at decimal halves (1.005 → 1.01, not 1). Digits beyond a number's precision give the number, not NaN.
- These are numbers that get stored. A strata migration or a stored transform that rounds such values writes a different number after the release, with no error. Documents written before keep the old number.

**Test.** `zz-proposals.test.ts` "P3": the six values above, plus `3.14159` → 3.14 and `-2.5` → −2, unchanged.

**Size.** src ~8, test ~12. New mechanism: no.

## P4 — A math answer is a JSON number

**Problem.**

- `$mul [1e308, 10]` → Infinity;
- `$div [1, 5e-324]` → Infinity;
- `$round` digits 400 → NaN (fixed by P3).

These pass even under `check:'always'`, which refuses the same values in a source. `JSON.stringify` writes them as `null`.

**Root cause.** `$add`, `$sub`, `$mul` and `$div` return `a op b` unchecked. Every other path refuses a non-finite number (`validate`, `check:'always'`, `$toNumber`).

**Design.** One helper, `finite(result, node, op)`, at the four returns in `math.ops.ts`. A non-finite result is refused with `E_TYPE`: "$mul gave Infinity, which is not a JSON number." `$mod` cannot produce one.

**What changes for apps.**

- No lab app multiplies or divides near the limits.
- Owner to confirm: a sum, difference, product or quotient that overflows is now an error. Today it is `Infinity`, stored as `null`. The owner names this kind of output as plainly wrong ("outputs that are not JSON").

**Test.** `$mul [1e308,10]` → `E_TYPE`; `$div [1, 5e-324]` → `E_TYPE`.

**Size.** src ~8, test ~6. New mechanism: no.

## P5 — `$localeMoney`: the amount does not depend on the locale

**Problem.**

- 1500 JPY with locale `en_US` → "JPY 15.00", one hundredth of the amount.
- The value is read with `Number()`, so `[1999]` → "19,99 €", `true` → "0,01 €", `"0x10"` → 16, `"   "` → 0.

**Root cause.**

- `minorUnitDivisor(locale, currency)` builds a formatter with the locale. When Intl refuses the locale, it falls back to 100, although the exponent belongs to the currency.
- `numberOf` (`ops/intl.ops.ts:39`) uses `Number()`, while `$toNumber` already has the rule for numeric text (`NUMERIC_TEXT`, `math.ops.ts:76`).

**Design.**

- The divisor is read from the currency alone, with a locale Intl always has (`'en'`), and cached by currency. 100 stays only for a code Intl refuses, as today.
- The fallback text uses the currency's own digits (`JPY 1500`).
- `numberOf`, shared by `$localeMoney` and `$localeNumber`, accepts a number or text that matches `NUMERIC_TEXT` after trimming, which is `$toNumber`'s rule. Anything else is refused with the `E_TYPE` it already uses.

**What changes for apps.**

- lyra (`format.prism.ts:24`) and encore (`impact.entries.ts:11`) pass numbers, so their results are unchanged.
- Owner to confirm:
  - A locale Intl refuses now prints the right amount (`JPY 1500`, not `JPY 15.00`).
  - A list, a boolean, hex text or blank text given as the amount is now refused, where it printed a made-up number.
  - Text with spaces around the digits (`" 1999 "`) is still read.

**Test.** `en_US` JPY 1500 → `"JPY 1500"`. `[1999]`, `true`, `"0x10"`, `"   "` → `E_TYPE`. `" 1999 "` → `19,99 €`.

**Size.** src ~15, test ~8. New mechanism: no.

## P6 — Intl's refusals carry a code

**Problem.** `$localeDate {dateStyle, weekday}`, `timeZone:"Europe/Wien"` and `$localeNumber {minDigits:2, digits:1}` validate, then throw a bare `TypeError` or `RangeError` with no code, no position and no form.

**Root cause.** The formatter constructors in `intl.ops.ts` (lines 66 and 137) are called unguarded. These options are written in the config (they are literals in the schema), so the fault is the config's.

**Design.** One wrapper, `intl(make, node, op)`, around each `new Intl.*Format`. A `RangeError` or `TypeError` from Intl becomes `E_SCHEMA` through `failAt`, with the position and the op's form: "$localeDate: Intl refused its options: …". Prototype: 9 lines.

**What changes for apps.**

- Nothing for a config that works.
- Owner to confirm: the thrown error for such a config changes class, from `TypeError` or `RangeError` to `PrismError` with code `E_SCHEMA`. An app that caught `RangeError` by class would no longer catch it. It always failed before too.

**Test.** The three configs above → `E_SCHEMA` (today `TypeError`, `RangeError`, `RangeError`).

**Size.** src ~12, test ~8. New mechanism: no.

## P7 — An impossible date is refused by each reader

**Problem.**

- "2026-02-30" → 2026-03-02;
- "2026-13-01" → 2027-01-01;
- "2026-02-29" → 2026-03-01;
- "…T10:00:60" → 10:01;
- `$dateDiff` from 02-28 to 02-30 → 2.

DOCS promises `E_DATE_INVALID` for a value that cannot be read as a date.

**Root cause.** Both readers, dayjs in `time.ops.ts` and `new Date()` in `$localeDate`, roll an out-of-range day, month, hour, minute or second over into the next one.

**Design.** One check, `isImpossibleDate(text)`, in `time.ops.ts`, called by each existing reader after it has read the value.

- It looks only at ISO-shaped text (`YYYY-MM-DD[ T]HH:mm[:ss]…`). The text is impossible when its month, day, hour, minute or second is out of range. Day 29 of February counts only in a leap year, and `24:00:00` is allowed as ISO allows it.
- Nothing else changes: each reader reads every other value as it does today, and every error code stays the same.
  - `$localeDate` keeps `new Date()`: year-only text, a one-item list, `"20260314"` and `true` give today's answers.
  - Two-digit years (`"3/4/26"`, `"14 Mar 26"`, RFC 822) are read as today.

Prototype: 10 lines in `time.ops.ts`, 1 line in `intl.ops.ts`.

**What stays open.** Text the platform reads by guessing is still read: `"1"` → 2001-01-01, `"hello 5"`, `"Mar 14"` → 2001. Refusing it would refuse real dates too. The first version of this proposal refused text with no four-digit year, and the check showed that refuses `"3/4/26"` and RFC 822 dates.

**What changes for apps.**

- The lab apps date values from their database or build them as `2000-01-01T<time>:00` (encore), so their answers are unchanged.
- One edge: if encore's `time` were `25:00`, it is now refused where it rolled into the next day.
- Owner to confirm: an ISO date or time with a field out of range is refused with `E_DATE_INVALID`, where today it is read as a later date. This refuses input accepted today. In a strata migration it stops that document's upgrade with an error.

**Test.** `zz-proposals.test.ts` "P7":

- "2026-02-30", "2026-13-01", "2026-02-29", "2026-03-14T25:00" and "…T10:00:60" → `E_DATE_INVALID` for both `$date` and `$localeDate`; `$dateDiff` to "2026-02-30" → `E_DATE_INVALID`.
- Unchanged:
  - `$date` reads "2024-02-29", "…24:00:00Z", "3/4/26", "14 Mar 26", RFC 822 and RFC 2822, "1" and "Mar 14" as `new Date` does;
  - `$localeDate` reads "2026-03", "2026", "03/04/2026" and `["2026-03-14"]` as today;
  - `true` and "20260314" still give `E_DATE_INVALID` from `$localeDate`.

Run in Vienna and in Los Angeles. The impossible-date assertions fail today; the unchanged ones pass today.

**Size.** src ~12, test ~20. New mechanism: no.

## P8 — A kept config copies a constant with its own keys

**Problem.** `{out:{$fromEntries:[["__proto__",{$const:{admin:true}}],["name","x"]]}}`:

- the first call returns an own `__proto__` key;
- from the second call the key is gone, and `out.admin === true` comes through the prototype.

**Root cause.** `copyOf` (`ops/core.ops.ts:33`) assigns `copy[key] = …`. That is the one write in prism that does not go through `writeOwnKey`.

**Design.** `writeOwnKey(copy, key, copyOf(inner))`. One line.

**What changes for apps.**

- Nothing for a constant without a `__proto__` key.
- Owner to confirm (one line): from the second call, such a constant answers as the first call already does.

**Test.** Three calls of the config above return the same own keys, and `admin` is not inherited.

**Size.** src 1, test ~8. New mechanism: no.

## P9 — A constant worked out ahead of time costs the steps it took

**Problem.** `$join` of 600 literal parts with `maxSteps: 500`: the first call is refused with `E_BUDGET`, and the second succeeds.

**Root cause.** From the second call, the optimizer works out ahead of time any subtree that does not read the source, its "constant folding". The result then counts as one step, while the first call (and `check:'always'`) counts every node.

**Design.**

- When the optimizer works a subtree out, it records the steps that took on the result, as a non-enumerable property beside the handler. `$const` spends them each time it is evaluated (`spendSteps`).
- Only `evaluate`'s kept trees record it: `compile` does not. A stored IR is JSON, so it could not carry the cost anyway, and `execute` keeps counting such a constant as one step.

Prototype: about 15 lines in `optimize.ts`, `core.ops.ts` and `budget.ts`.

**What changes for apps.**

- Nothing under the default limit (1,000,000 steps).
- What stays open:
  - `execute` of an IR still counts one step for such a constant.
  - A long intermediate string inside a worked-out subtree is measured only in the first call.
- New mechanism: yes, a cost carried on a node.
- Owner to confirm: a kept config near its step limit is now refused on every call, as its first call already is.

**Test.** Limit 500: calls 1 and 2 → `E_BUDGET`, `E_BUDGET` (today `E_BUDGET`, success). Limit 700: both succeed.

**Size.** src ~15, test ~6.

## P10 — `$min` and `$max` skip null wherever it is

**Problem.** `[3,null,1]` throws `E_TYPE`; `[null,3,1]` → 1.

**Root cause.** The sugar (`sugar/rewriters.ts:54-88`) starts from `null`. A null item at the start is taken as "no value yet", and a null later is compared.

**Design.** In both rewriters, the comparison reads `$coalesce: [item, accumulator]` instead of the item. A null item is then compared with the accumulator as equal and is skipped. A list of nulls → `null`, as an empty list does.

The first version added a branch, which cost 11 steps an item instead of today's 8. This form costs 9, the fewest found: a null item needs one node to test it.

**What changes for apps.**

- Every list that has an answer today has the same answer. Only lists that throw today get one.
- lyceum's `$max [$min[picked, last], 0]` is unchanged.
- The desugared form changes, so the compiled fingerprint of a config with `$min` or `$max` changes once (see the top of this file).
- Owner to confirm: each item costs 9 steps instead of 8. Under the default limit of 1,000,000 steps, a `$min` or `$max` over about 111,000 to 125,000 items, which passes today, is refused with `E_BUDGET`. The lab apps take the minimum of two or three values.

**Test.** `[3,null,1]` → 1, `[null,3,1]` → 1, `$max [3,null,1]` → 3, `[null,null]` → null. A binary search for the step limit over 1,000 items finds 9 steps an item (today 8).

**Size.** src 1 line × 2, test ~12. New mechanism: no.

## P11 — `$replace` writes its replacement as given

**Problem.** Replacement `"US$$5"` → "US$5"; `"[$&]"` → "[X]". DOCS: "`search` is plain text, not a pattern", and the field is described as "Replacement string."

**Root cause.** `String.prototype.replace` reads `$` patterns in a replacement string (`ops/string.ops.ts:89`).

**Design.** Pass a function that returns the replacement. A function's answer is used as it is.

**What changes for apps.**

- No lab app and no corpus document uses `$replace`.
- Owner to confirm: a replacement containing `$$`, `$&`, `` $` `` or `$'` is now written as typed. A config that wrote `$$` to get `$` would now get `$$`.

**Test.** `"US$$5"` → `"price: US$$5"`; `"[$&]"` with `all` → `"[$&] [$&]"`.

**Size.** src 2, test ~4. New mechanism: no.

## P12 — Text is never cut inside a character

**Problem.**

- `$slice` 0–5 of "Hey 👍 there" → "Hey \ud83d", half of a character;
- `$take 1` of "👍" → "\ud83d";
- `$split` with `sep ""` of "a👍" → `["a","\ud83d","\udc4d"]`.

A lone half is not valid text. Postgres jsonb refuses it, and a browser shows �.

**Root cause.** Text ops index UTF-16 units: `array.ops.ts:57` and `string.ops.ts`'s `split`.

**Design.**

- Indexes stay UTF-16 units, so every result that is valid text today is the same.
- A cut that falls between the two halves of one character moves to the near side of that character: an end cut moves back, a start cut moves forward.
- `$split` with `sep ""` splits into characters (`Array.from`).
- `$length` is not changed: it counts UTF-16 units, as zod's `.max()` does. DOCS and its `.describe()` say so: "`$length` of "👍🏽" is 4".

**What changes for apps.**

- lyra's `$slice` slices lists. No lab app slices or splits text with emoji.
- Owner to confirm: a cut or split that produced half a character now produces whole characters, so the result is shorter, or has fewer items for `sep ""`.

**Test.** "Hey 👍 there" 0–5 → "Hey ", start 5 → " there", `$take 1` of "👍" → "", "abcd" 1–3 → "bc", −2 → "cd", split "" of "a👍" → `["a","👍"]`.

**Size.** src ~15, docs ~3, test ~8. New mechanism: no.

## P13 — `$interpolate` fills names in any script

**Problem.** `{{straße}}` and `{{名前}}` are left in the text as written, even when `values` has those keys.

**Root cause.** The name pattern is `\w+` (`string.ops.ts:34`), which is ASCII.

**Design.** The name is letters, marks, digits and `_` in any script: `/\{\{([\p{L}\p{M}\p{N}_]+)\}\}/gu`. A name with other characters (`{{first-name}}`, `{{ name }}`) is still left as written, as today. DOCS says which names are filled.

**What changes for apps.**

- lyceum's `{{at}}` is unchanged.
- Owner to confirm: a template that contains `{{straße}}` now gets the value, or `""` when `values` lacks it, as an ASCII name does today. Today the braces stay in the text.

**Test.** "Hallo {{straße}} {{名前}} {{first-name}}" → "Hallo A C {{first-name}}".

**Size.** src 1, docs ~2, test ~3. New mechanism: no.

## P14 — `__optional` leaves out a `$get` that runs into null

**Problem.** `{nick:{$get:{from:{$ref:"$.user"},path:["nick"]}}, __optional:["nick"]}` with `user: null` throws `E_TYPE`. The same field written as `$ref "$.user.nick"` is left out.

**Root cause.** `__optional` skips `E_MISSING_PATH` only. `$get` reports a path that runs into `null` as `E_TYPE` (`core.ops.ts:75,86`).

**Design.**

- `$get` keeps its code, `E_TYPE`. When the value it stopped at is `null`, it adds `details.absent: true`.
- The template's `__optional` skips an error with that mark, as it skips `E_MISSING_PATH` (`engine/evaluate.ts:62`).
- A `$get` that stops at a number or a string is still refused under `__optional`.

**What changes for apps.**

- No lab app uses `__optional`. Today the field throws. Nothing that works changes: the error code, the message and the result without `__optional` are the same.

**Test.** With `user: null` the field is left out. Without `__optional` it is still `E_TYPE`. With `user: 5` it is still `E_TYPE`.

**Size.** src ~6, test ~6. New mechanism: a one-key mark on the error. It is smaller than a new code, and it changes no code an app sees.

## P15 — What depends on the machine is not worked out ahead of time

**Problem.**

- `compile` works out `$date` and `$localeDate` on a literal value on the machine that compiles: `{"$date":{"value":"2026-01-01T09:00:00Z","format":"HH:mm"}}` is stored as `{"$const":"10:00"}`, from Vienna.
- `execute` on a server in Los Angeles answers "10:00", while `evaluate` there answers "01:00".
- A kept `evaluate` config does the same with its process's zone, which is right on that machine.

**Root cause.** The optimizer works out any op whose inputs are literals (`engine/optimize.ts:214-232`). Six ops read the machine's clock zone or Intl data: `$date`, `$dateAdd`, `$dateDiff`, `$localeDate`, `$localeMoney` and `$localeNumber`.

**Design.**

- The context the optimizer uses to work a subtree out carries `folding: true`, an optional field on `EvalContext`.
- Each of the six ops refuses, in its first line (`notAheadOfTime(context)`), when it sees that field. The optimizer already keeps a node that throws as an op.
- The op says this about itself, so there is no list beside the schema.

**What changes for apps.**

- On the machine that compiled, every answer is the same.
- The lab apps' date and locale ops read `$ref` values, so they are not worked out ahead of time today either.
- Owner to confirm:
  - An IR compiled from such a literal now keeps the op, so `meta.stats.optimizations.constantsFolded` and the `fingerprint` change for those configs.
  - Executed on another machine, it answers in that machine's zone, not the compiling machine's.
  - IRs already stored keep their worked-out constant until they are compiled again.
- `EvalContext` gains an optional field, which is additive.
- With P21, a host that names a zone also gets the same answer from a compiled IR on every machine, because these ops are now worked out where the IR runs.

**Test.** `compile({opens:{$date:{value:"2026-01-01T09:00:00Z",format:"HH:mm"}}, n:{$upper:"a"}})`: `core` still contains `$date`, and `constantsFolded` is 1 (only `$upper`). `execute` answers the same as `evaluate` with `check:'always'`.

**Size.** src ~10, test ~8. New mechanism: one optional context field.

## P16 — Intl formatter caches have a ceiling

**Problem.** 50,000 distinct locale tags read from data grow the heap by about 20 MB, and the caches never shrink. The divisor cache is also keyed by locale.

**Root cause.** `DATE_FORMATTERS` and `NUMBER_FORMATTERS` (`intl.ops.ts:6-7`) are plain maps. The path cache already has the remedy: at 1,000 entries it is emptied and starts again (DESIGN, "JSONPath Subset").

**Design.**

- One helper, `cached(map, key, make)`, with the same rule (1,000 entries, emptied when full), used by the three caches.
- The divisor cache is keyed by currency alone (P5).
- It shares the place where formatters are built with P6's wrapper.

**What changes for apps.** Nothing. The same formatters give the same text; a host with more than 1,000 distinct option sets builds some again.

**Test.** After 5,000 distinct locales, each cache has at most 1,000 entries. This needs a size read, which a test can reach through a test-only export, or through heap growth as the probe `p4.mjs` measures it.

**Size.** src ~15, test ~6. New mechanism: no. It is the path cache's rule.

## P17 — `$eq`, `$neq` and `$unique` compare JSON text, as documented

**Problem.** `$eq [{x:1,y:2},{y:2,x:1}]` → false, and `$unique` keeps both. The heading says "Deep equality".

**Finding.** This is not undocumented. DOCS: "Compares by `JSON.stringify`". The schema's `.describe()`: "Deep equality comparison (JSON.stringify-based)". `test/predicate.test.ts:17` pins "objects with the keys in another order: as their JSON texts compare". The prototype of a key-order-free comparison failed exactly that test.

**Design.** No change to answers. Retitle the DOCS heading and the `.describe()` to "Equality of JSON text — objects with the same keys in another order are not equal", and say the same in `$unique`'s text.

**What changes for apps.** Nothing.

**What stays open.** Order-free equality changes answers that are documented, tested, and stored inside strata migrations: lyceum's `$eq`, and 106 lab files use `$eq`. A new op beside `$eq` is a grammar change, which costs every app a `strata upgrade`. Owner to confirm: whether order-free equality is wanted at that price.

**Test.** None for behaviour. The `.describe()` edit is prose and goes through the description review.

**Size.** docs and describe ~4. New mechanism: no.

## P18 — `$walk`'s text says when it ends

**Problem.** The schema and DOCS say `$walk` "always terminates". With `order:"pre"`, a rule that wraps a string in a list (`then: [n]`) walks into its own result without end and stops at `E_BUDGET`.

**Design.** Text only, in the `.describe()` and DOCS: "`post` (the default) always ends. With `pre`, the walk goes into what a rule returns, so a rule whose result contains a value it matches again does not end; the run stops at the budget (`E_BUDGET`)."

**What changes for apps.** Nothing.

**Test.** The existing probe stays as it is: `pre` with a wrapping rule → `E_BUDGET`, and this documents it.

**Size.** ~4 lines of text. New mechanism: no.

## P19 — Lenient `$ref` paths: documented, not refused

**Problem.**

- `$.a.` reads `$.a`;
- `$.x[1e0]`, `[0x1]` and `[ 1 ]` read index 1;
- `$.` reads the whole source;
- `$.x[0]b` and `$.[0]` validate and then fail with `E_MISSING_PATH`.

**Design.** No change to what is read. Refusing these spellings refuses configs that validate and work today. The repo's safe path for that is a grammar migration with document steps that rewrite each `$ref` to its plain spelling, then a refusal at the next version. That costs every app a `strata upgrade` with edits to its TypeScript sources. DOCS gains one sentence: these spellings are read as their plain form, and new configs should use `$.a`, `[1]` and `$`.

**What changes for apps.** Nothing.

**What stays open.** These spellings stay valid. Owner to confirm: whether to pay for the migration.

**Test.** None, because behaviour does not change.

**Size.** docs ~3. New mechanism: no.

## P20 — A `__proto__` key in a config: documented, not changed

**Problem.** zod drops a `__proto__` key while it parses a `z.record`. A template key, a `$const` payload, a `$with` binding or a `$renameKeys` key `__proto__` disappears, and `validate` says ok. Probe: `{"out":{"__proto__":{"$const":1},"a":2}}` → `{"out":{"a":2}}`.

**Design.** No change. DESIGN already documents it ("zod drops a `__proto__` key while it parses a config").

The other forms:

- Refusing it is breaking, because the config validates today.
- Keeping it means evaluating a subtree zod never validated, or writing a parser that keeps keys beside zod. Both are new mechanisms. The second changes the JSON Schema and so the grammar snapshot.
- A warning needs a channel `validate` does not have.

**What changes for apps.** Nothing.

**What stays open.** The key is silently dropped. Owner to confirm: whether a warning channel on `validate` (a new, additive field) is wanted for this one key.

**Size.** 0. New mechanism: no.

## P21 — A host can name the time zone

**Problem.** `2026-01-01T09:00` is read in the machine's zone: 08:00Z in Vienna, 17:00Z in Los Angeles. A `format` prints in that zone too.

**Design.** An optional `timeZone` (an IANA name) beside `limits` and `check`. It is not part of the config, so it is not grammar.

- **Where it is given.**
  - `evaluate(config, source, { timeZone })`, through `EvaluateOptions`.
  - `execute(ir, source, limits, { timeZone })`. A fourth parameter, because the third is the limits object and adding a key to it would mix the two.
- **What it changes.** When given, a time with no zone of its own is read in that zone (`dayjs.tz`, the timezone plugin of the `dayjs` already depended on). `$date`'s `format`, `$dateAdd` and `$localeDate` print in it. Everything else reads as before:
  - a bare date (`2026-03-14`) is still UTC midnight;
  - a time that names its zone (`Z`, `+01:00`) is the instant it names;
  - `utc: true` and an authored `options.timeZone` still win.
- **A zone Intl does not know** is refused once, at the call, with `E_SCHEMA`.
- **Without the option** nothing changes.
- **DOCS** gains the option beside the existing paragraph on zones (line 583), and says a server can also set `TZ` for the process.

**What changes for apps.**

- Nothing, until a host passes the option.
- strata migrations run through the host's transform. Under moss that transform is `evaluate` without options, so migrations answer as today; a host that wants them pinned wraps the transform.
- No grammar version and no `strata upgrade`.
- `EvaluateOptions` and `EvalContext` each gain one optional field, and `execute` one optional parameter, all additive.

**Test.** `zz-proposals.test.ts` "P21":

- `2026-01-01T09:00:00` with `America/Los_Angeles` → `…T17:00:00.000Z`; with `Europe/Vienna` → `…T08:00:00.000Z`.
- `format HH:mm` of `…09:00:00Z` in LA → `01:00`.
- `$localeDate` of `…23:30:00Z` in `Asia/Tokyo` → `2 Jan 2026`.
- A bare date and a `+01:00` time are unchanged.
- `execute` of a compiled IR with the zone → `01:00`.
- `Europe/Wien` → `E_SCHEMA`.

All fail today.

**Size.** src ~30, docs ~4, test ~15. New mechanism: one option, the same at both entry points.

## P22 — `$reduce` with `as` equal to `acc`: documented

**Problem.** `as:"x", acc:"x"`: the body never sees the items, because `acc` overwrites them.

**Finding.** A config can rely on this. `{$reduce:{over:[1,2,3], as:"acc", init:0, body:{$add:[{$var:"acc"},1]}}}` counts the items and answers 3. The default `acc` is `"acc"`, so `as:"acc"` gives the same case. Refusing the config would break it.

**Design.** The `as` and `acc` descriptions and DOCS say: "When `as` and `acc` are one name, the body sees the accumulator, not the item."

**What changes for apps.** Nothing.

**Size.** ~3 lines of text. New mechanism: no.

## P23 — DESIGN catches up

**Problem.** DESIGN's `EvalContext` lists `source`, `vars` and `budget` and omits `kept`. It would also omit `folding`, after P15. The "63 more" in the dispatcher snippet is right (65 guards).

**Design.** Add `kept` (and `folding`, if P15 lands) with one line each.

**Size.** ~4 lines. New mechanism: no.

---

# Loom

## L1 — An optional field can be removed, and starting values come from one place

**Problem.**

- **(a)** `email: z.string().email().optional()` starts as `""`, which is invalid. An optional `address` with `min(1)` fields is always present, so a new document never passes. No control removes either field.
- **(b)** The prism op chooser fills optional arguments, and they change what the op does:
  - `$localeMoney` gets `{minorUnits:false, digits:0}`, so 4500 cents in de-AT shows "€ 4.500";
  - `$localeNumber` gets `digits:0`;
  - `$localeDate` gets `{hour12:false, timeZone:""}`, which is a `RangeError` at run time;
  - `$sortBy` gets `dir`.

  No control removes an optional argument.
- **(c)** Inside a union, `toNova`'s `empty` and `includeOptional:false` are ignored. Probe: `{shape:{kind:"a",note:""}}` with `includeOptional:false`.

**Root cause.**

- A field's starting value is decided in several places, and some of them drop the caller's options: `variantDefaults` calls `buildDocument(variant.field, {})` (`compile/parse.ts:247`), and so do `containersOf` and the variant props in `to-nova.ts`.
- `node-editor.tsx`'s `defaultFor`, `defaultItem` and `nodeSlot` call `buildDocument(…, {})`.
- No role offers to remove a field.

**Design.**

1. `variantDefaults(variant, options)` takes the options, and `to-nova.ts` passes `ctx.options` at its three calls.
2. An optional field's wrapper (`loom:field`) is bound to the field's path (`model`) and gets one new prop, `optional: true`. The kit's `LoomField` shows a **Remove** link while the field has a value. Remove writes `undefined`, so the key serialises as absent and `.optional()` accepts it.
   - The field's controls show as today, whether the field has a value or not. Typing into them adds the field again, so no Add button is needed.
   - A stored document without the field looks as it does today.
   - Nova already renders a bound component with children (`loom:variant`).
3. The prism plugin's `defaultFor`, `defaultItem` and `nodeSlot` call `buildDocument(…, {includeOptional:false})`.
4. The plugin's `ArgEditor` shows a Remove link under an optional argument that has a value. It writes the argument object without that key.

`createLoomEditor`'s new documents keep including optional fields (today's default): a person can now remove them.

**What changes for apps.**

- Every compiled optional field gains a `model` and one prop on its `loom:field` node. A host kit that registers its own `loom:field` gets them and can ignore them; it then has no Remove link. The showroom's two-kits demo does not replace `loom:field`, and no lab app compiles loom forms.
- A form shows the same controls as today, plus a Remove link beside each optional field that has a value. A document is unchanged until someone presses Remove.
- Owner to confirm:
  - **(b)** A newly chosen prism op no longer gets optional arguments: `$localeMoney`, `$localeDate` and `$round` start as `{}`, and `$sortBy` as `{as:""}`.
  - **(c)** A host that passes `includeOptional:false` or `empty` now also gets them inside union branches, as the README says.

**Test.** `loomprobe/proposals.test.tsx` "L1":

- Remove → `{name:"", email:undefined}`, which `safeParse` accepts. The Remove link then goes and both text boxes stay; typing writes `email` again.
- A stored `{name:"x"}` shows both text boxes and no Remove. This passes today too: it checks nothing changed.
- `includeOptional:false` with a union → `{shape:{kind:"a"}}`.
- `defaultFor('$localeMoney')` → `{$localeMoney:{}}`, `$localeDate` → `{}`, `$sortBy` → `{as:""}`.
- In the prism plugin, `{$round:{value:1.5,digits:2}}` shows one Remove; pressing it reports `{$round:{value:1.5}}`.

The prism plugin's own tests pass on the prototype.

**Size.** compile ~6, kit ~15, prism plugin ~15, test ~35. New mechanism: no new role; one prop on an existing role.

## L2 — A union shows the branch the value is, or shows the value as JSON

**Problem.**

- **(a)** A stored value whose tag no branch has (`kind:"triangle"`) is labelled with the first branch ("circle"), and editing writes `radius` into it.
- **(b)** `z.union([{a:number, b?}, {a:string, note?}])` with stored `{a:"x"}` (valid for the second branch) is shown as the first branch, with a number field. Each branch is recognised by its optional key, and that key is absent.
- **(c)** A union of `z.lazy` branches becomes a raw JSON box.

**Root cause.**

- `LoomVariant` shows branch 0 when no pattern matches (`react/kit/variant.tsx`: `Math.max(0, fallback)`).
- `distinguish` picks the first key unique to a branch, even an optional one, and reads `def.shape` and `def.type` of the branch as written. A `z.lazy` has neither (`compile/parse.ts:62-90`).

**Design.**

1. When no branch matches and there is no fallback branch, the select shows "—" and the value is shown in the JSON editor (`JsonEditor`, already in the kit). Choosing a branch writes its defaults, as today.
2. `distinguish` prefers a key the branch requires. A required key is in every value of that branch. It falls back to an optional unique key only when there is no required one.
3. `branchKeys`, `jsonType` and the tag lookup read the branch after `unwrap`, which already resolves `z.lazy`, optional, nullable and default.

**What changes for apps.**

- Owner to confirm:
  - A stored value no branch recognises is shown as JSON, not as the first branch.
  - `parse`'s output (the exported `Field` model) can name a different key in a branch's pattern.
  - A union of lazy branches is a union, not `unknown`.
- Documents do not change.

**Test.**

- Stored `kind:"triangle"` shows no number field, and the select's value is `""`.
- A union with optional and required unique keys gets patterns on `n` and `t`.
- `z.union([z.lazy(A), z.lazy(B)])` has kind `union`.

**Size.** parse ~8, kit ~6, test ~20. New mechanism: no.

## L3 — A literal starts as its value

**Problem.** A plain `z.union` of literal-tagged objects starts with `{kind:null, radius:0}`, which no branch accepts. Any `z.literal` field compiles to a raw box that starts at `null`.

**Root cause.** `parse` has no case for `literal`, so it falls to `unknown`, whose starting value is `null`.

**Design.** `literal` parses as an `enum` of its values with `default` set to the first. It is shown as a select of one option (or several, for a multi-value literal) and starts at its value.

**What changes for apps.** Owner to confirm: a literal field is now a select that starts at the literal, where it was a raw box starting at `null`. The starting document changes from invalid to valid.

**Test.** That union → `{kind:"circle", radius:0}`.

**Size.** parse ~5, test ~4. New mechanism: no.

## L4 — Clearing a number

**Problem.** Clearing a number writes `{"qty":null}`, which an optional number refuses. The `integer` prop is passed and never read.

**Root cause.** `LoomNumber` writes `null` for an empty box (`react/kit/controls.tsx:32-34`). `parse` does not keep whether a schema takes `null`, so the control cannot know.

**Design.**

- `unwrap` records `nullable` while it unwraps, and the field gets `nullable: true`. This is one optional key on `FieldMeta`, which is additive.
- `numberBuild` passes `nullable` and `integer` as props.
- `LoomNumber` writes `null` when cleared only for a nullable field, and `undefined` (absent) otherwise. It sets `step` to 1 for an integer and `"any"` otherwise.

**What changes for apps.**

- A nullable number is unchanged (still `null`).
- Owner to confirm: a cleared, non-nullable number is now absent from the document rather than `null`. A host that saves on change stores the key as missing.

**Test.** Optional: clearing → `{qty:undefined}`. Nullable: clearing → `{qty:null}`. `z.number().int()` has `step="1"`.

**Size.** parse ~8, to-nova 1, kit ~4, test ~12. New mechanism: no.

## L5 — A select with no value says so

**Problem.** A required enum with no value displays its first option. Choosing that option is no change, so nothing is written. README documents this ("A select has no row for "none"").

**Design.** When the value is not one of the options, the select shows a disabled "—" first row. Every real option is then a change.

**What changes for apps.**

- Owner to confirm: the display changes from the first option to "—", and the README note goes.
- Documents do not change.
- The two tests in `test/react/select.test.tsx` that pin today's display change their expected `shown` from `'main'` to `''`.

**Test.** `z.enum(['s','m','l'])` shows `''`. Choosing `s` writes `{size:"s"}`.

**Size.** kit ~3, test ~6 (+2 updated). New mechanism: no.

## L6 — `onChange` once per edit

**Problem.** One keystroke calls `onChange` twice, with the same documents. Probe: `{"value":{"a":"x"}}` twice.

**Root cause.** `attachValidation` writes `_errors` back into the runtime (`validate.ts`), and that write is a data change of its own. The editor's listener emits `change` for both.

**Design.** The editor emits `change` only when the published documents and validations differ from the last ones it emitted (one JSON comparison in `editor/editor.ts`). The validation write of the same edit therefore adds no second call. No published state is dropped, because a call is skipped only when nothing it would carry changed.

**What changes for apps.** `onChange` is called half as often, with the same values. A host that counted calls would see the change. Nothing a host could rely on is lost.

**Test.** One keystroke → one call.

**Size.** src ~10, test ~6. New mechanism: no.

## L7 — Every field name shows its message

**Problem.** A field named `toString` or `constructor` never shows its inline message.

**Root cause.** `setPath` (`validate.ts`) asks `leaf in node`, which is true for inherited names. It also reads `node[key]` through the prototype, so a path through `__proto__` would write into `Object.prototype`.

**Design.** Read with `Object.hasOwn` and write with `defineProperty` (the rule prism already uses in `own-keys.ts`).

**What changes for apps.** Nothing, except that the missing messages appear.

**Test.** `z.object({toString: min(3), constructor: min(3)})`: after editing both, 2 messages are shown (today 1).

**Size.** src ~8, test ~8. New mechanism: no.

## L8 — A key with a dot is edited as JSON

**Problem.** `{"a.b": string}` binds `$.a.b`. The control shows nothing, and an edit writes `{a:{b:…}}`.

**Root cause.** Nova splits a binding at every `.` (`nova/src/shared/bindings/paths.ts:5`) and has no escape. Fixing it in nova is another package, and per the owner's rule that needs its own approval.

**Design.**

- An object that has a key with a dot compiles to the raw JSON box (`loom:raw`) at its own path. Nova can bind that path, because no key above it has a dot (an ancestor with one is already a raw box).
- At the root, `createLoomEditor` wraps such a document as it wraps a non-object root (`needsWrap`).
- `toNova` used directly at the root without `rootKey` keeps today's form, because there is nothing to bind the box to. The README says to pass `rootKey`.

**What changes for apps.** Owner to confirm: such an object's form changes from controls that write to the wrong place to a JSON box that writes the right keys.

**Test.**

- `z.object({meta: z.object({"a.b": string})})` → `{"component":"loom:raw","model":"$.meta"}`.
- In the editor, a root `{"a.b":"x"}` edited to `{"a.b":"y"}` reports `{"a.b":"y"}`.

**Size.** src ~5, test ~10. New mechanism: no.

## L9 — Colours as CSS variables with today's values

**Problem.** The kit and plugins write about 26 colours inline (45 occurrences in 14 files), so a host cannot restyle them.

**Design.**

- One file in the kit, `react/kit/tokens.ts`, has one entry per colour now used. Each is `var(--loom-<name>, <today's hex>)`: `--loom-border` for `#d1d5db`, `--loom-text` for `#111827`, and so on.
- Each distinct colour keeps its own name, so nothing merges and nothing renders differently.
- The inline styles read the tokens.
- README lists the names. They are a new public surface.

**What changes for apps.** Nothing renders differently unless a host sets a variable.

**Test.** Render `LoomField` with an error: its colour is `var(--loom-danger, #dc2626)`. With `--loom-danger` set on a parent, the computed colour is the host's.

**Size.** tokens ~30, edits ~45. New mechanism: yes, a set of CSS variable names, published.

## L10 — `toNova` + `attachValidation` with a top-level `_errors` field

**Problem.** A schema with a field `_errors`, compiled with `toNova` and checked with `attachValidation` directly, has the field overwritten by the error tree and stripped from the document. `createLoomEditor` already avoids this.

**Design.** README, under `rootKey`: "A schema with a top-level `_errors` field: compile it with `rootKey` and validate `z.object({ [rootKey]: schema })`, as the editor does." A fix in code would make `toNova` or `attachValidation` refuse or move such a schema, and that is breaking.

**What changes for apps.** Nothing.

**What stays open.** Direct use still collides unless the host follows the note.

**Size.** docs ~3. New mechanism: no.

## L11 — Compiling never runs into a schema's own error

**Problem.** `name: z.preprocess(v => v.trim(), z.string())` throws `TypeError` from `parse`.

**Root cause.** Requiredness is `!value.safeParse(undefined).success` (`compile/parse.ts:58`), which runs the schema's code with `undefined`.

**Design.** `acceptsAbsence(schema)`: the same `safeParse(undefined)`, in `try`/`catch`. A schema whose own code throws on a missing value cannot accept one, so the field is required. L2 uses the same helper.

**What changes for apps.** Nothing for a schema that compiles today.

**Test.** A preprocess that throws on `undefined` → required. One that turns it into `"undefined"` → optional, as today.

**Size.** src ~8, test ~5. New mechanism: no.

## L12 — `parse` reads zod through zod's core classes; imports go through module doors

**Problem.**

- `parse` casts `schema.def as ZodDef`, its own partial shape, which STYLE_GUIDE forbids.
- A zod release that renames a field it reads would make fields fall to `unknown` with no type error.
- Code imports files inside other directories (`@compile/parse`, `@react/kit/json-editor.js`).

**Design.**

1. Read each kind through zod's core classes from `zod/v4/core` (`$ZodObject`, `$ZodArray`, `$ZodEnum`, `$ZodLiteral`, `$ZodUnion`, `$ZodDiscriminatedUnion`, `$ZodOptional`, `$ZodNullable`, `$ZodDefault`, `$ZodLazy`, `$ZodTuple`), reading each one's own typed `_zod.def`. The classic classes of `zod` (`z.ZodObject` …) would miss a zod/mini schema; the core classes match both. Checked with zod 4.6.5: a mini object is not `instanceof z.ZodObject` but is `instanceof $ZodObject`. What is read:
   - `$ZodObject` → `def.shape`;
   - `$ZodArray` → `def.element`;
   - `$ZodEnum` → `def.entries`;
   - `$ZodLiteral` → `def.values`;
   - `$ZodUnion` → `def.options`;
   - `$ZodDiscriminatedUnion` → `def.discriminator`;
   - `$ZodOptional`, `$ZodNullable` and `$ZodDefault` → `def.innerType` and `def.defaultValue`;
   - `$ZodLazy` → `def.getter`;
   - `$ZodTuple` → `def.items`.

   zod 4's `instanceof` checks a schema's traits, not its class, so two copies of zod still match. `tsc` then fails when zod changes what is read. There is no cast.

   zod/mini is not supported today, and this does not change that: `parse` also calls `.meta()` and reads `.description`, which a mini schema lacks. Probe: today's and the prototype's `parse` both throw "schema.meta is not a function" for a mini object. Supporting mini is a separate addition.
2. Give `compile/`, `editor/` and `react/` each an `index.ts` door, and import through the doors.
3. Add loom to `scripts/check-modules.mts`.

**What changes for apps.** Nothing: the same model for the same schema. The package's 111 tests are the check.

**Size.** parse ~60 changed, 3 doors ~20, check-modules ~15. New mechanism: no. It joins an existing gate.

## L13 — The prism node editor beside the compiler

**Problem.** `plugins/prism/react/node-editor.tsx` (389 lines) has its own `ArgEditor`, `ListEditor`, `TemplateEditor` and its own defaults beside `toNova` and the kit. R3-l1 came from that split.

**Design (this change).** L1 removes the defaults it kept apart: they come from `buildDocument` with `includeOptional:false`, and optional arguments get Add/Remove. That fixes the defect.

**What stays open.** The widget remains a second set of editors. It exists because `toNova` renders the 75-op union as one select, while the plugin offers a categorised chooser, search, wrap and unwrap. Folding it into `toNova` plus the kit means giving the kit those features (a categorised chooser role, wrap and unwrap menus). That is a design change, not a fix. Owner to confirm: whether to plan that refactor.

**Size.** In L1. New mechanism: no.
