# Upgrading to the prism and loom fixes

What changes for an app when it moves to the release with these fixes, and what to do. Every item ships as a `patch` changeset marked `BREAKING (pending consolidation)`: an app that works today can see a different answer in the cases named.

No grammar or table changes. No file under `prism/src/schemas` changed shape (only `.describe()` texts, which the snapshot does not compare), and loom has no grammar. `pnpm check:grammars` and `check:sources` pass unchanged; no app runs `strata upgrade`. `nisc.prism` stays at 4.

Checked against the lab apps (`apps/lab/*`) and, read-only, AnimaApp, anima-finance and mira. "External" below names the file and line that would see a different result.

---

## prism

### prism — `$update` and `$has` read a path as `$get` does
- Before: `$update` of `{ items: [{qty:1},{qty:2}] }` at `["items","0","qty"]` gave `{ items: { "0": { qty: 5 } } }`: the list became an object and item 2 was lost. `$update` of `{ items: [1, 2] }` at `["items","5"]` gave `{ items: { "5": 5 } }`. `$update` of `{ title: "Hello" }` at `["title","en"]` gave `{ title: { en: "Hi" } }`. `$has` at `["items","0"]` over a list answered `false`.
- Now: the first gives `{ items: [{qty:5},{qty:2}] }`; the second is `E_MISSING_PATH` ("No array item at items.5"), as a number index past the end always was; the third is `E_TYPE` ("No key "en" at title.en: the value there is text "Hello", and $update does not replace it."); `$has` answers `true`. A key on a list (`"x"`, `"01"`), a string, a number or a boolean is `E_TYPE`. A missing key or `null` on the path is still created as an object.
- Who notices: a config, or a strata document step, whose `$update` path runs through a list by digit text or through a scalar. In a strata migration the document upgraded after the release gets the new shape (or the error); documents upgraded before keep the shape they got.
- What to do: nothing, unless a config relied on the old replacement. Write the object you want with `$merge`, or test the value first with `$type`.
- Breaking: yes
- Lab apps: lyceum's Look migration (`apps/lab/lyceum/src/app/grammars.ts:49`) updates `props.look` only where `props.look` is `poster` or `plain`, so `props` is an object there: unchanged. No other lab app or corpus document uses `$update` or `$has`.
- External: none (no `$update`/`$has` in AnimaApp, anima-finance or mira).

### prism — `$round` rounds at the decimals as written
- Before: with `digits: 2`, `1.1` `"ceil"` → `1.11`, `4.35` `"floor"` → `4.34`, `1.005` → `1`, `0.285` → `0.28`; `digits: 400` → `NaN`.
- Now: `1.1`, `4.35`, `1.01`, `0.29`; more digits than a number has give the number. `digits: 0` gives every answer it gave before.
- Who notices: `$round` with `digits` above 0 on a value whose decimals end on a half or exactly on the cut. Rounded numbers that get stored differ by one unit in the last place.
- What to do: nothing, unless a stored number must match one rounded before; documents written before keep the old number.
- Breaking: yes
- Lab apps: `apps/lab/encore/src/app/vex/site.entries.ts:84` (`fill: $round(zoneFill, 2)`) can differ by 0.01 for a ratio exactly halfway in decimals; `apps/lab/relay/src/app/prisms/format.prism.ts:4` (`digits: 1` on millions) the same at one decimal. atrium's and the others' `$round` use `digits: 0`: unchanged.
- External: AnimaApp `src/app/actions/store/edit-pass.action.ts:130` (`digits: 1` of days / 30); mira `src/server/atlas/runs.prism.ts:25`, `src/app/actions/answer/steps.action.ts:14`, `src/app/vex/bench.prism.ts:9` (`digits: 1`). Each can show one tenth more or less at a decimal half; nothing errors.

### prism — An overflowing sum, difference, product or quotient is an error
- Before: `{ "$mul": [1e308, 10] }` → `Infinity`, which JSON stores as `null`.
- Now: `E_TYPE`, "$mul gave Infinity, which is not a JSON number." Same for `$add`, `$sub` and `$div`, and for `$sum` and `$avg`, which run as `$add`: `$sum` of `[1e308, 1e308]` is "$add gave Infinity, which is not a JSON number. At $sum, in the $add that $sum runs as."
- Who notices: arithmetic on numbers a person types without a bound.
- What to do: nothing for real amounts. Where a typed number is unbounded, refuse it before the arithmetic (`$lt` against a ceiling) or let the error reach the form.
- Breaking: yes
- Lab apps: none multiply near the limit.
- External: only reachable with a typed number near 1e307: AnimaApp `src/app/actions/page.parts.ts:62,83`, `src/app/actions/payments/settings.action.ts:524`, `src/app/actions/store/edit-plan.action.ts:67`, `src/app/actions/store/edit-pass.action.ts:49`; anima-finance `src/app/actions/accounts/balance.prism.ts:66-69`, `src/app/actions/analysis/analysis.actions.ts:121`. mira: none.

### prism — `$localeMoney` takes the divisor from the currency; the locale ops read the amount as `$toNumber` does
- Before: 1500 JPY with locale `en_US` (a tag Intl cannot read) → `JPY 15.00`. An amount of `[1999]` → `19,99 €`, `true` → `0,01 €`, `"0x10"` → `0,16 €`, `"   "` → `0,00 €`, for `$localeMoney` and likewise for `$localeNumber`.
- Now: `JPY 1500`. Those four amounts are `E_TYPE` ("a number or numeric text"). `" 1999 "` is still read.
- Who notices: a `$localeMoney` with a locale tag Intl cannot read and a currency whose exponent is not 2; an amount that is a list, a boolean, hex text or blank text.
- What to do: hand a number or numeric text; give a fallback (`fallback`) for an absent amount, as today (null and `""` still go to the fallback).
- Breaking: yes
- Lab apps: lyra (`format.prism.ts`) and encore (`impact.entries.ts`) pass numbers with readable locales: unchanged.
- External: none affected. AnimaApp (`src/app/prisms/money.prism.ts:11,14`, `signup.prism.ts:47`), anima-finance (`src/app/prisms/format.prism.ts:12,15,41`, `vex/analysis.entries.ts:1884`) and mira (`src/app/actions/things/tab.prism.ts:26-27`) use readable locales and numeric amounts; a null amount goes to `fallback` as before.

### prism — Options Intl refuses are a Prism error with `E_SCHEMA`
- Before: `$localeDate` with `{ dateStyle, weekday }`, or `$localeNumber` with `minDigits: 2, digits: 1`, validated and then threw a bare `TypeError` or `RangeError`.
- Now: a `PrismError`, code `E_SCHEMA`, with the op and its place: "$localeDate: Intl refused its options: …". A zone or a locale Intl cannot read is `E_TYPE`, as main already made it.
- Who notices: code that catches `RangeError`/`TypeError` by class around prism. Such a config failed before too.
- What to do: catch `PrismError` (or check `code`).
- Breaking: yes
- Lab apps: none.
- External: none. `minDigits` beside `digits` appears in AnimaApp `src/app/prisms/media.prism.ts:83-87` (1, 1), `src/app/actions/store/edit-coupon.action.ts:185-189` (2, 2) and mira `src/app/actions/things/tab.prism.ts:27` (2, 2): `minDigits` is never above `digits`, so Intl takes them.

### prism — An impossible ISO date is `E_DATE_INVALID`
- Before: `"2026-02-30"` was read as 2026-03-02, `"2026-13-01"` as 2027-01-01, `"2026-02-29"` as 2026-03-01, `"…T10:00:60"` as 10:01; `$dateDiff` from 02-28 to 02-30 gave 2.
- Now: `$date`, `$dateAdd`, `$dateDiff` and `$localeDate` refuse each with `E_DATE_INVALID`. `"…T24:00:00"` is still the next midnight; non-ISO text (`"3/4/26"`, RFC 2822) is read as before.
- Who notices: a date built from parts (a year joined to a stored month and day), and a strata document step that reads such a date: the upgrade of that document stops with the error.
- What to do: build the date so it exists — for a 29 February in a common year, pick 28 February or 1 March explicitly — or give the op a value it can read.
- Breaking: yes
- Lab apps: encore builds `2000-01-01T<time>:00` from database times, and the others read stored timestamps: unchanged.
- External: **AnimaApp `src/app/vex/pulse.entries.ts:126-163` (`NEXT_BIRTHDAY`) breaks for anyone born on 29 February**: it joins this year to the stored month and day, which in a common year is `2027-02-29`. That date rolled over to 1 March; it is now refused at `:143` (`$dateAdd`), `:154` (`$dateDiff`) and `:156`/`:163` (`$localeDate`), so that entry errors for such a person. mira `src/server/automation/when.prism.ts:125` reads `2000-<clock.on>` (built at `src/server/automation/offered.ts:33`): 2000 is a leap year, so only a draft with `02-30` or `04-31` would now be refused. anima-finance builds only valid dates.

### prism — A constant with a `__proto__` key answers the same on every call
- Before: `{ out: { $fromEntries: [["__proto__", { $const: { admin: true } }], ["name","x"]] } }` kept an own `__proto__` key on the first call; from the second call of the same config object the key was gone and `out.admin` read `true` through the prototype.
- Now: every call answers as the first.
- Who notices: only a config with a `__proto__` key inside a constant.
- What to do: nothing.
- Breaking: yes (call two onward changes)
- Lab apps / External: none found.

### prism — A part worked out ahead of time costs the steps it took
- Before: a config object run again by `evaluate` had its literal parts worked out from the second call, and each counted as one step: a `$join` of 600 written parts under `maxSteps: 500` failed on call one and passed from call two.
- Now: refused on every call, as on the first. `compile`/`execute` are unchanged (a compiled IR counts such a part as one step).
- Who notices: a kept config whose first call is already near `maxSteps`.
- What to do: nothing; such a config already failed its first call.
- Breaking: yes
- Lab apps / External: none set `maxSteps`.

### prism — `$min` and `$max` skip `null` wherever it is
- Before: `$min` of `[3, null, 1]` → `E_TYPE`, of `[null, 3, 1]` → `1`. Each item cost 8 steps.
- Now: both `1`; a list of nulls → `null`. Each item costs 9 steps, so under the default `maxSteps` (1,000,000) a list of about 111,000 to 125,000 items that passed is refused with `E_BUDGET`. The desugared form changes, so the compiled `fingerprint` of a config that uses `$min`/`$max` changes once (vex re-seeds such a cached entry once at boot; no host action).
- Who notices: a list with `null` after its first item (it gets an answer now), and very long lists.
- What to do: nothing; for a list of more than ~110,000 items raise `maxSteps`.
- Breaking: yes
- Lab apps: lyceum `console.prism.ts:15,27,34`, `step.action.ts:24` and encore `impact.entries.ts:69` take the minimum of two or three values: same answers.
- External: same answers everywhere; anima-finance `src/app/vex/push.entries.ts:71` and AnimaApp `src/app/actions/store/buy.parts.ts:25-26` would now get an answer if a `null` came after the first item, where they threw `E_TYPE`. AnimaApp `src/app/prisms/rewards.prism.ts:81` runs `$max` of two values per week inside a `$reduce`: one step more per week.

### prism — `$replace` writes its replacement as given
- Before: replacement `"US$$5"` wrote `US$5`; `"[$&]"` wrote the matched text in brackets.
- Now: `US$$5` and `[$&]`, as typed.
- Who notices: a replacement containing `$$`, `$&`, `` $` ``, `$'`.
- What to do: write the text you want (`"US$5"`).
- Breaking: yes
- Lab apps / External: none (no replacement contains `$`).

### prism — Text is never cut inside a character
- Before: `$slice` 0–5 of `"Hey 👍 there"` → `"Hey \ud83d"` (half a character, which Postgres jsonb refuses); `$take 1` of `"👍"` → `"\ud83d"`; `$split` of `"a👍"` with `sep: ""` → three items.
- Now: `"Hey "`, `""`, `["a", "👍"]`. A cut that falls between the two halves of one code point leaves that code point out. Every result that was whole text is the same. `$length` still counts UTF-16 units.
- Who notices: text cut by position that can hold emoji.
- What to do: nothing.
- Breaking: yes
- Lab apps: lyra's `$slice` (`people.actions.ts:42-54`) slices lists; relay's `$split` (`contact.form.prism.ts:4`) splits on a space: unchanged.
- External: text people type, cut at a fixed length, is now one code point shorter where an emoji straddles the cut: AnimaApp `src/app/vex/studio.entries.ts:9`, `src/app/prisms/initials.prism.ts:32`; anima-finance `src/app/prisms/items.prism.ts:52,58,59,101`, `src/app/actions/items/one.action.ts:15,86`; mira `src/db/answers.grammar.ts:23` (a strata document step cutting checklist text at 1000), `src/server/waiting/faces.prism.ts:19`, `src/app/actions/people/profile.prism.ts:12`. Where the old result had half a character, it was text Postgres refused.

### prism — `$interpolate` fills names in any script
- Before: `"Hallo {{straße}}"` stayed as written, even with `straße` in `values`.
- Now: `"Hallo A"`, or `"Hallo "` when the key is missing, as an ASCII name always did. `{{first-name}}` and `{{ name }}` are still left as written.
- Who notices: templates with non-ASCII placeholder names.
- What to do: nothing.
- Breaking: yes
- Lab apps: lyceum `{{at}}`: unchanged.
- External: AnimaApp `src/server/mails/index.ts:35-36` interpolates owner-written mail templates from the database: a template with `{{straße}}`-style names would now be filled.

### prism — Date and locale ops are answered where they run
- Before: `compile` (and a kept `evaluate` from its second call) worked out `$date`, `$dateAdd`, `$dateDiff`, `$localeDate`, `$localeMoney` and `$localeNumber` whose inputs were all written: `{"$date":{"value":"2026-01-01T09:00:00Z","format":"HH:mm"}}` compiled in Vienna was stored as `{"$const":"10:00"}` and `execute` in Los Angeles answered `10:00`, where `evaluate` there answered `01:00`. A `$localeDate` with a written `timeZone` was folded.
- Now: these ops stay ops in a compiled IR (including a written-zone `$localeDate`) and answer on the machine that runs them. On the compiling machine every answer is the same.
- Who notices: code comparing stored `fingerprint`s or `meta.stats.optimizations.constantsFolded` of such configs; IRs compiled on one machine and run on another. An IR stored before the release keeps its folded constant until compiled again.
- What to do: nothing; recompile stored IRs if they should answer where they run.
- Breaking: yes
- Lab apps: their date and locale ops read `$ref` values, which were never folded.
- External: none found with all-literal inputs; vex's cache compares fingerprints (`seedCache`) and re-seeds a changed entry once.

---

## loom

### loom — An optional field can be removed; starting values honour the options everywhere
- Before: an optional field (`email: z.string().email().optional()`) started as `""` and had no way to be left out. In a union branch, `toNova`'s `includeOptional: false` and `empty` were ignored. In the Prism plugin a newly chosen `$localeMoney` got `{ minorUnits: false, digits: 0 }` (4500 cents showed `€ 4.500`), `$localeDate` `{ hour12: false, timeZone: "" }` (a runtime error).
- Now: an optional field's `loom:field` node has `model` (the field's path) and `optional: true`, and the kit shows **Remove** beside the label while the field has a value; Remove writes it back to absent. Its controls show as before; typing adds it again. `includeOptional`/`empty` apply in union branches (`{ shape: { kind: "a" } }`). A newly chosen Prism op starts with required arguments only (`$localeMoney: {}`, `$sortBy: { as: "" }`), and an optional argument with a value has Remove.
- Who notices: a host kit that registers its own `loom:field` (it gets the two new fields and can ignore them; it shows no Remove); a host that passes `includeOptional: false` or `empty` with unions.
- What to do: nothing; a custom `loom:field` can add a Remove by writing `undefined` through its `novaModel`.
- Breaking: yes
- Lab apps / External: none compile loom forms (relay depends on loom but uses no editor; no external app uses loom).

### loom — A union shows the branch the value is, or shows the value as JSON
- Before: a stored value no branch recognises (`kind: "triangle"`) was shown as the first branch, and an edit wrote that branch's fields into it. A structural union picked the branch key by the first unique key, even an optional one, so `{ a: "x", t: "y" }` showed the wrong branch. A union of `z.lazy` branches was a raw JSON box.
- Now: with no fallback branch the chooser shows "—" and the value is in the JSON editor until a branch is chosen. A key the branch requires is preferred. Lazy branches form a union.
- Who notices: a host reading `parse`'s `Field` model (a pattern can name another key); a form opened on a value no branch matches.
- What to do: nothing.
- Breaking: yes
- Lab apps / External: none.

### loom — A literal starts as its value
- Before: `z.literal("circle")` parsed as `unknown` (a raw box starting at `null`); a plain union of literal-tagged objects started as `{ kind: null, radius: 0 }`.
- Now: an `enum` of its values with `default` the first — a select starting at `"circle"`; that union starts as `{ kind: "circle", radius: 0 }`.
- Who notices: a host reading the `Field` model; forms with literal fields.
- What to do: nothing.
- Breaking: yes
- Lab apps / External: none.

### loom — Clearing a number leaves it absent unless the schema takes null
- Before: emptying a number box wrote `null`, which `z.number().optional()` refused.
- Now: the key is absent; `null` only where the schema takes `null`. `FieldMeta` gains `nullable?: true`; `loom:number` gets `nullable` and `integer` props, and steps by 1 for an integer.
- Who notices: a host saving on change (the key is now missing instead of `null`).
- What to do: nothing; read a missing key as "no number".
- Breaking: yes
- Lab apps / External: none.

### loom — A select with no value shows "—"
- Before: a required enum with no value displayed its first option, and choosing it wrote nothing.
- Now: a disabled "—" row shows until an option is chosen; every option is a change. Documents are unchanged.
- Who notices: tests that read the select's displayed value. loom's own two tests in `test/react/select.test.tsx` changed their expected value from `'main'` to `''`, as an example.
- What to do: update such a test.
- Breaking: yes
- Lab apps / External: none.

### loom — An object with a dotted key is edited as JSON
- Before: `{ "a.b": string }` bound `$.a.b`: the control showed nothing and an edit wrote `{ a: { b: … } }`.
- Now: such an object is the raw JSON box at its own path, and an edit writes `{ "a.b": … }`; the editor wraps such a root document. `toNova` at the root without `rootKey` keeps the old form: pass `rootKey`.
- Who notices: schemas with dotted keys.
- What to do: with `toNova` directly, pass `rootKey` for a root with a dotted key.
- Breaking: yes
- Lab apps / External: none.
