# Prism Documentation

Complete reference for every operation in `@niscorp/prism`.

---

## Concepts

### Configs and Nodes

A Prism config is a JSON structure that describes a transformation. It can be:
- A **primitive** (`"hello"`, `42`, `true`, `null`) — returned as-is
- An **op node** (`{ $ref: "$.path" }`) — evaluated by the engine
- A **plain object** (`{ name: { $ref: "$.user.name" } }`) — each value evaluated recursively
- An **array** (`[{ $const: 1 }, { $ref: "$.x" }]`) — each element evaluated

A key that starts with `$` is an op's name. A plain object has none: `{ "$fetch": … }` is not a config, because Prism has no `$fetch` — `validate` refuses it with the key's path (`card.$fetch`), and `evaluate` and `compile` fail with `E_SCHEMA` before anything runs. Data that has such keys goes in `$const`, which returns its value untouched; `$fromEntries` builds one from computed values.

### Source Data

Every evaluation takes a `source` — the data the transformation reads from via `$ref`. `evaluate` accepts any JSON value (object, array, or scalar); `"$"` is the whole of it.

### Bindings and Variables

`$ref` reads from source. `$var` reads from scoped variables created by `$with`, `$map`, `$filter`, `$reduce`, `$sortBy`, `$keyBy`, `$groupBy`, `$update`, and `$walk`.

### Optional Fields

Plain objects support an `__optional` metadata key that lists field names to silently omit when they evaluate to null or their path is missing:

```json
{
  "name": { "$ref": "$.user.name" },
  "nickname": { "$ref": "$.user.nickname" },
  "__optional": ["nickname"]
}
```

If `$.user.nickname` doesn't exist, the result is `{ "name": "Alice" }` — no error.

---

## Core Operations

### `$ref` — Read from source

Resolves a path against the source data. A path is keys and indexes: `.key` and `[index]`. The rest of JSONPath — a wildcard `[*]`, a filter `[?(…)]`, a slice, a quoted key, `..` — is refused when the config is checked (`E_SCHEMA`, "Not a path Prism reads"); for every item of a list use `$map` or `$pluck`.

```json
{ "$ref": "$.user.name" }
{ "$ref": "$.items[0].sku" }
{ "$ref": "$.deeply.nested.value" }
{ "$ref": "$" }
```

`"$"` is the whole source. Throws `E_MISSING_PATH` if the path doesn't exist.
`$ref` and `$var` read the context, so the compiler never constant-folds them.

### `$const` — Literal value

Returns a JSON value unchanged. Use this when you need a fixed value inside an expression.

```json
{ "$const": 42 }
{ "$const": "hello" }
{ "$const": { "key": "value" } }
{ "$const": [1, 2, 3] }
{ "$const": null }
```

### `$var` — Read a variable

Reads a variable from the current scope (created by `$with`, `$map`, `$filter`, etc.).

```json
{ "$var": "item" }
{ "$var": "accumulator" }
```

Throws `E_VAR_NOT_FOUND` if the variable doesn't exist in scope.

### `$get` — Dynamic path access

Navigates into a value using an array of path segments. Segments can be strings (object keys), numbers (array indices), or node expressions (evaluated dynamically).

```json
{ "$get": { "from": { "$ref": "$.user" }, "path": ["address", "city"] } }
{ "$get": { "from": { "$ref": "$.items" }, "path": [0, "name"] } }
{ "$get": { "from": { "$ref": "$.data" }, "path": ["missing"], "fallback": { "$const": "N/A" } } }
```

Without `fallback`, throws `E_MISSING_PATH` when the path is missing, and `E_TYPE` when a key is asked of a non-object or an index of a non-array. With `fallback`, returns the fallback value in either case.

Dynamic segments:
```json
{
  "$get": {
    "from": { "$ref": "$.catalog" },
    "path": [{ "$ref": "$.selectedSku" }, "title"]
  }
}
```

### `$with` — Scoped variables

Binds variables in a scoped block. Variables are available only inside `value`.

```json
{
  "$with": {
    "let": {
      "user": { "$ref": "$.user" },
      "tax": { "$mul": [{ "$ref": "$.subtotal" }, { "$const": 0.2 }] }
    },
    "value": {
      "name": { "$get": { "from": { "$var": "user" }, "path": ["name"] } },
      "totalWithTax": { "$add": [{ "$ref": "$.subtotal" }, { "$var": "tax" }] }
    }
  }
}
```

---

## Array Operations

### `$map` — Transform each element

Iterates over an array, binding each element to a variable, and evaluates the body for each.

```json
{
  "$map": {
    "over": { "$ref": "$.items" },
    "as": "item",
    "body": { "$get": { "from": { "$var": "item" }, "path": ["name"] } }
  }
}
```

Source: `{ "items": [{ "name": "A" }, { "name": "B" }] }` → `["A", "B"]`

### `$filter` — Keep matching elements

Keeps elements where the `when` condition evaluates to truthy.

```json
{
  "$filter": {
    "over": { "$ref": "$.numbers" },
    "as": "n",
    "when": { "$gt": [{ "$var": "n" }, { "$const": 10 }] }
  }
}
```

Source: `{ "numbers": [5, 15, 3, 20] }` → `[15, 20]`

### `$reduce` — Fold/accumulate

Reduces an array to a single value. Binds each element as `as` and the running accumulator as `acc` (customizable).

```json
{
  "$reduce": {
    "over": { "$ref": "$.numbers" },
    "as": "n",
    "acc": "total",
    "init": { "$const": 0 },
    "body": { "$add": [{ "$var": "total" }, { "$var": "n" }] }
  }
}
```

Source: `{ "numbers": [1, 2, 3] }` → `6`

The `acc` name defaults to `"acc"` if omitted.

### `$slice` — Slice array or string

```json
{ "$slice": { "from": { "$ref": "$.items" }, "start": 1, "end": 3 } }
{ "$slice": { "from": { "$ref": "$.text" }, "start": 0, "end": 5 } }
```

`start` defaults to 0, `end` defaults to length.

### `$flatten` — Flatten one level

```json
{ "$flatten": { "$ref": "$.nested" } }
```

Source: `{ "nested": [[1, 2], [3], [4, 5]] }` → `[1, 2, 3, 4, 5]`

Non-array elements are kept as-is: `[[1], 2, [3]]` → `[1, 2, 3]`

### `$unique` — Deduplicate

Removes duplicate values, compared by `JSON.stringify`.

```json
{ "$unique": { "$ref": "$.tags" } }
```

Source: `{ "tags": ["a", "b", "a", "c", "b"] }` → `["a", "b", "c"]`

### `$sortBy` — Sort by computed key

```json
{
  "$sortBy": {
    "over": { "$ref": "$.items" },
    "as": "item",
    "by": { "$get": { "from": { "$var": "item" }, "path": ["price"] } },
    "dir": "desc"
  }
}
```

`dir` defaults to `"asc"`. A sort key is a number or a string. Where the keys are of more than one kind, numbers come first, then strings, then `false` and `true`, and `"desc"` turns that around; an item whose key is `null` is last in both directions. Items with equal keys keep the order they came in. A key that is a list or an object is refused (`E_TYPE`): to sort by two keys, sort by the second and then by the first — the sort keeps the order of equal items.

---

## Math Operations

All math ops take a `[left, right]` pair. Both operands are evaluated and must be numbers.

### `$add`
```json
{ "$add": [{ "$ref": "$.price" }, { "$ref": "$.tax" }] }
```

### `$sub`
```json
{ "$sub": [{ "$ref": "$.total" }, { "$ref": "$.discount" }] }
```

### `$mul`
```json
{ "$mul": [{ "$ref": "$.quantity" }, { "$ref": "$.unitPrice" }] }
```

### `$div`
```json
{ "$div": [{ "$ref": "$.total" }, { "$ref": "$.count" }] }
```
Throws `E_DIVISION_BY_ZERO` if the divisor is 0.

### `$mod`
```json
{ "$mod": [{ "$ref": "$.row" }, 2] }
```
The remainder of the first number divided by the second. It takes the sign of the **second** number, so with a positive divisor `n` the answer is always from `0` up to `n` — `{ "$mod": [-1, 5] }` is `4`, where JavaScript's `%` gives `-1`. Throws `E_DIVISION_BY_ZERO` if the divisor is 0.

### `$round`
```json
{ "$round": { "value": { "$const": 3.14159 }, "digits": 2 } }
```
Result: `3.14`. `digits` defaults to 0. `mode` is `"nearest"` unless given: `"floor"` rounds down (toward negative infinity) and `"ceil"` rounds up, at the same `digits`.

```json
{ "$round": { "value": { "$div": [{ "$ref": "$.minutes" }, 60] }, "mode": "floor" } }
```

### `$toNumber` — A number from text
```json
{ "$toNumber": { "value": { "$ref": "$.price" } } }
{ "$toNumber": { "value": { "$ref": "$.discount" }, "fallback": 0 } }
```
A number is answered as it is. Text is read as a number when it is one written in digits, with spaces around it allowed: `"42"`, `"-3.5"`, `".5"`, `" 1e3 "`. Everything else — `""`, `"12 kg"`, `"1,234"`, `"0x10"`, `true`, `null`, a list — throws `E_TYPE`, or answers `fallback` where it is given. The other ops do not convert: `$add` on `"4"` is still an error.

---

## String Operations

### `$join` — Concatenate with separator
```json
{ "$join": { "parts": [{ "$ref": "$.first" }, { "$ref": "$.last" }], "sep": " " } }
```
Parts are coerced to strings. `sep` defaults to `""`. `parts` may also be any
node that evaluates to an array — a mapped list, a `$var`:
```json
{ "$join": { "parts": { "$map": { "over": { "$ref": "$.tags" }, "as": "t", "body": { "$upper": { "$var": "t" } } } }, "sep": ", " } }
```

### `$toString` — Stringify
```json
{ "$toString": { "$ref": "$.count" } }
```
Numbers → `"42"`, null → `"null"`, objects → JSON string.

### `$interpolate` — Template string
```json
{
  "$interpolate": {
    "template": "Hello {{name}}, you have {{count}} items",
    "values": { "$ref": "$.user" }
  }
}
```
Replaces `{{key}}` placeholders with values from the evaluated object. Missing keys become empty strings.

### `$fill` — Fill a counted phrase
```json
{ "$fill": { "$ref": "$.progress" } }
```
Source: `{ "progress": { "phrase": "{n} of {total}", "slots": { "n": 1, "total": 12 } } }` → `"1 of 12"`

Takes a node that evaluates to a pattern value `{ phrase, slots }` and replaces each `{name}` hole with its slot, in the source language. A slot that is itself a pattern is filled recursively; a hole with no slot (or a null one) is left as written. Anything that is not a pattern passes through unchanged.

### `$trim`
```json
{ "$trim": { "$const": "  hello  " } }
```
Result: `"hello"`

### `$lower`
```json
{ "$lower": { "$ref": "$.name" } }
```

### `$upper`
```json
{ "$upper": { "$ref": "$.code" } }
```

### `$split` — String to array
```json
{ "$split": { "value": { "$const": "a,b,c" }, "sep": "," } }
```
Result: `["a", "b", "c"]`

### `$replace` — Replace a substring
```json
{ "$replace": { "value": { "$ref": "$.text" }, "search": "world", "replacement": "there" } }
{ "$replace": { "value": { "$ref": "$.phone" }, "search": " ", "replacement": "", "all": true } }
```
The first occurrence of `search`, or every occurrence with `all: true`. `search` is plain text, not a pattern.

---

## Predicate Operations

All predicates return `true` or `false`.

### `$eq` / `$neq` — Deep equality
```json
{ "$eq": [{ "$ref": "$.status" }, { "$const": "active" }] }
{ "$neq": [{ "$ref": "$.role" }, { "$const": "admin" }] }
```
Compares by `JSON.stringify` — works for primitives, arrays, and objects.

### `$gt` / `$gte` / `$lt` / `$lte` — Ordered comparison
```json
{ "$gt": [{ "$ref": "$.age" }, { "$const": 18 }] }
{ "$lte": [{ "$ref": "$.score" }, { "$const": 100 }] }
```
Works with numbers and strings (lexicographic).

### `$empty` — Emptiness check
```json
{ "$empty": { "$ref": "$.items" } }
```
Returns `true` for: `null`, `""`, `[]`, `{}`. Returns `false` for everything else (including `0` and `false`).

### `$startsWith` / `$endsWith` / `$contains` — String checks
```json
{ "$startsWith": { "value": { "$ref": "$.url" }, "prefix": { "$const": "https://" } } }
{ "$endsWith": { "value": { "$ref": "$.file" }, "suffix": { "$const": ".json" } } }
{ "$contains": { "value": { "$ref": "$.text" }, "search": { "$const": "error" } } }
```

---

## Logic Operations

### `$not` — Boolean negation
```json
{ "$not": { "$ref": "$.isDisabled" } }
```
Negates truthy/falsy: `true` → `false`, `0` → `true`, `null` → `true`.

### `$and` — Short-circuit AND
```json
{ "$and": [{ "$ref": "$.isActive" }, { "$ref": "$.hasPermission" }] }
```
Returns the last truthy value, or the first falsy value. Short-circuits.

### `$or` — Short-circuit OR
```json
{ "$or": [{ "$ref": "$.nickname" }, { "$ref": "$.name" }, { "$const": "Anonymous" }] }
```
Returns the first truthy value, or the last falsy value. Short-circuits.

---

## Structure Operations

### `$merge` — Shallow merge objects
```json
{ "$merge": [{ "$ref": "$.defaults" }, { "$ref": "$.overrides" }] }
```
Left to right, later values win. All elements must evaluate to objects.

### `$coalesce` — First non-null
```json
{ "$coalesce": [{ "$ref": "$.preferred" }, { "$ref": "$.fallback" }, { "$const": "default" }] }
```
Returns the first value that is not `null` or `undefined`.

### `$case` — Conditional branching
```json
{
  "$case": {
    "branches": [
      { "when": { "$gt": [{ "$ref": "$.score" }, { "$const": 90 }] }, "then": { "$const": "A" } },
      { "when": { "$gt": [{ "$ref": "$.score" }, { "$const": 80 }] }, "then": { "$const": "B" } },
      { "when": { "$gt": [{ "$ref": "$.score" }, { "$const": 70 }] }, "then": { "$const": "C" } }
    ],
    "else": { "$const": "F" }
  }
}
```
Evaluates branches in order, returns the `then` of the first truthy `when`. Falls back to `else` (or `null` if omitted).

### `$entriesOf` — Object to entries
```json
{ "$entriesOf": { "$ref": "$.config" } }
```
`{ "a": 1, "b": 2 }` → `[["a", 1], ["b", 2]]`

### `$keyBy` — Array to object by key
```json
{
  "$keyBy": {
    "over": { "$ref": "$.users" },
    "as": "user",
    "key": { "$get": { "from": { "$var": "user" }, "path": ["id"] } }
  }
}
```
`[{ "id": "u1", "name": "Alice" }]` → `{ "u1": { "id": "u1", "name": "Alice" } }`

Last element wins on key collision.

### `$groupBy` — Array to grouped object
```json
{
  "$groupBy": {
    "over": { "$ref": "$.items" },
    "as": "item",
    "key": { "$get": { "from": { "$var": "item" }, "path": ["category"] } }
  }
}
```
Groups elements into arrays by computed key: `{ "fruit": [...], "vegetable": [...] }`

---

## Object Operations

### `$keys`
```json
{ "$keys": { "$ref": "$.config" } }
```
`{ "a": 1, "b": 2 }` → `["a", "b"]`

### `$values`
```json
{ "$values": { "$ref": "$.config" } }
```
`{ "a": 1, "b": 2 }` → `[1, 2]`

### `$fromEntries`
```json
{ "$fromEntries": { "$const": [["x", 1], ["y", 2]] } }
```
Result: `{ "x": 1, "y": 2 }`

### `$pick` — Keep specific keys
```json
{ "$pick": { "from": { "$ref": "$.user" }, "keys": ["name", "email"] } }
```

### `$omit` — Remove specific keys
```json
{ "$omit": { "from": { "$ref": "$.user" }, "keys": ["password", "secret"] } }
```

### `$type` — Get value type
```json
{ "$type": { "$ref": "$.value" } }
```
Returns one of: `"string"`, `"number"`, `"boolean"`, `"null"`, `"array"`, `"object"`.

### `$length` — Array or string length
```json
{ "$length": { "$ref": "$.items" } }
{ "$length": { "$ref": "$.name" } }
```

---

## Transform Operations

Rewriting a document rather than deriving a value — built for migrations
(strata's document steps), useful anywhere a config returns its input with a
precise edit.

### `$has` — Is the path there at all?
```json
{ "$has": { "from": { "$ref": "$.document" }, "path": ["props", "label"] } }
```
True when the whole path exists — a key present with `null` counts; a missing
one does not (which `$get` with a `fallback` cannot tell apart).

### `$renameKeys` — Rename in place
```json
{ "$renameKeys": { "from": { "$ref": "$.endpoint" }, "map": { "body": "request", "transform": "response" } } }
```
Each renamed key keeps its position. Absent keys are ignored; a rename onto an
existing key replaces that entry.

### `$update` — One path changed, everything else identical
```json
{ "$update": { "from": { "$ref": "$.document" }, "path": ["props", "count"], "value": { "$add": [{ "$var": "current" }, 1] } } }
```
The value currently at `path` (null when absent) is bound as `current` (rename
it with `"as"`). Missing objects along a string path are created; an array index
that does not exist is `E_MISSING_PATH`.

### `$assert` — Refuse loudly
```json
{ "$assert": { "when": { "$has": { "from": { "$ref": "$.document" }, "path": ["id"] } }, "message": "An action without an id cannot be migrated.", "value": { "$ref": "$.document" } } }
```
Throws `E_ASSERT` with `message` unless `when` is truthy; otherwise evaluates to
`value`.

### `$walk` — Rewrite every node of a tree
```json
{
  "$walk": {
    "over": { "$ref": "$.document" },
    "as": "n",
    "rules": [
      { "when": { "$eq": [{ "$var": "n" }, "$.q"] }, "then": "$.search" },
      { "when": { "$eq": [{ "$get": { "from": { "$var": "n" }, "path": ["ref"], "fallback": null } }, "q"] },
        "then": { "$update": { "from": { "$var": "n" }, "path": ["ref"], "value": "search" } } }
    ]
  }
}
```
Visits every node — objects, arrays and leaves, at any depth — and replaces it
with the first rule whose `when` holds (bound to `as`); no rule, the node stays.
`"order": "post"` (default) rewrites children first, so a node's rules see them
rewritten; `"pre"` applies the rules first and descends into the result. A
replacement is never walked again at its own level, so it always terminates. A
walk visits objects too: guard a string op with a type check
(`{ "$and": [{ "$eq": [{ "$type": { "$var": "n" } }, "string"] }, …] }`).

---

## The op set only ever grows

Configs are stored — endpoint requests, vex mappings, strata migrations — and a
migration cannot be migrated by the language it is written in. So an op is
never removed or reshaped: an old form stays and desugars to the new one.
`test/transform.test.ts` keeps the record (`EVERY_OP_EVER`) and fails on a
removal. Changes to the grammar are strata migrations on `nisc.prism`
(`@niscorp/prism/migrations`), gated by `pnpm check:grammars`.

---

## Time Operations

Powered by [dayjs](https://day.js.org/). Date values can be ISO 8601 strings or Unix timestamps (milliseconds). A date-only string (`YYYY-MM-DD`) is parsed and computed in UTC, so the calendar day survives the round trip.

### `$date` — Format a date
```json
{ "$date": { "value": { "$ref": "$.createdAt" } } }
{ "$date": { "value": { "$ref": "$.createdAt" }, "format": "YYYY-MM-DD" } }
{ "$date": { "value": { "$ref": "$.createdAt" }, "format": "HH:mm", "utc": true } }
```
Without `format`, returns ISO 8601. With `format`, uses [dayjs format tokens](https://day.js.org/docs/en/display/format).

`$date` is **locale-blind** — `MMM` is `Mar` in every language it will ever run
in. That is right for a machine-readable stamp and wrong for anything a person
reads: for that, use `$localeDate` below.

### `$dateAdd` — Date arithmetic
```json
{ "$dateAdd": { "date": { "$ref": "$.startDate" }, "amount": 30, "unit": "day" } }
{ "$dateAdd": { "date": { "$ref": "$.now" }, "amount": -1, "unit": "hour" } }
```
Returns ISO 8601 string — or, when the input is a date-only string (`"2026-06-01"`), a date-only string (`"2026-07-01"`). Units: `year`, `month`, `day`, `hour`, `minute`, `second`.

### `$dateDiff` — Date difference
```json
{ "$dateDiff": { "from": { "$ref": "$.start" }, "to": { "$ref": "$.end" }, "unit": "day" } }
```
Returns a number. Same units as `$dateAdd`.

---

## Locale-Aware Formatting

Three ops that turn a value into text **for a person reading in a particular
language**. They delegate to the platform's own `Intl`, so the rules come from
CLDR rather than from a table in this package.

`locale` is required on all three. There is no default, deliberately: a default
renders something plausible for everybody it is wrong for, and the only way to
discover it is a reader in Vienna being shown American dates.

All three take an optional `fallback` (default `""`), returned when `value` is
null or an empty string — before `locale` is even looked at.

### `$localeMoney` — an amount as money
```json
{ "$localeMoney": { "value": { "$ref": "$.price_cents" }, "currency": { "$ref": "$.currency" }, "locale": "de-AT" } }
{ "$localeMoney": { "value": { "$ref": "$.total" }, "currency": "EUR", "locale": "de-DE", "minorUnits": false, "digits": 0 } }
```

Why this is not a `$join` of a symbol and a number — one currency, one language,
three countries:

| locale | output |
|---|---|
| `de-AT` | `€ 45,00` |
| `de-DE` | `45,00 €` |
| `de-CH` | `EUR 45.00` |
| `en-IE` | `€45.00` |

- `value` is in **minor units** (cents) by default. The divisor comes from the
  currency, not a hardcoded `100` — JPY has no minor unit, and dividing it would
  be a hundredfold error. Pass `minorUnits: false` for major units.
- `digits` overrides the currency's own fraction digits.
- `fallback` (default `""`) is rendered for a null/absent amount, so an empty
  SUM shows a dash rather than a confident `€0.00`.
- An ISO code `Intl` does not know prints beside the number instead of throwing.

### `$localeDate` — a date for a human
```json
{ "$localeDate": { "value": { "$ref": "$.starts_on" }, "locale": "de-AT" } }
{ "$localeDate": { "value": { "$ref": "$.starts_on" }, "locale": "de-AT", "options": { "weekday": "short", "day": "numeric", "month": "short" } } }
```

`options` is a checked subset of `Intl.DateTimeFormatOptions` (`dateStyle`,
`timeStyle`, `weekday`, `year`, `month`, `day`, `hour`, `minute`, `second`,
`hour12`, `timeZone`). Defaults to `{ "dateStyle": "medium" }`.

**DATE-only values are read as UTC.** `"2026-03-14"` is UTC midnight, and
formatting UTC midnight in any zone west of Greenwich prints the 13th. Every
date column in a schema has this shape, so the trap is handled once here rather
than rediscovered at each call site. An explicit `timeZone` still wins.

### `$localeNumber` — a number
```json
{ "$localeNumber": { "value": { "$ref": "$.attendance" }, "locale": "de-DE", "minDigits": 1 } }
{ "$localeNumber": { "value": { "$ref": "$.rate" }, "locale": "en-GB", "style": "percent" } }
```

`style` is `decimal` (default) or `percent` — percent multiplies by 100, so pass
`0.42`, not `42`. `digits`/`minDigits` cap and floor the fraction digits;
`compact` gives `1.2k`. Grouping and the decimal mark follow the locale
(`1.234,5` in Germany, `1 234,5` in Austria, `1,234.5` in Britain).

---

## Sugar Operations

Convenience shorthands that desugar to core operations before evaluation. You can use these anywhere — they're expanded in a single pass before the config is evaluated or compiled.

### `$sum` — Sum an array
```json
{ "$sum": { "over": { "$ref": "$.prices" } } }
```
Desugars to `$reduce` + `$add`. Empty array → `0`.

### `$avg` — Average an array
```json
{ "$avg": { "over": { "$ref": "$.scores" } } }
```
Desugars to `$div($sum, $count)`. Empty array → `E_DIVISION_BY_ZERO`.

### `$count` — Count elements
```json
{ "$count": { "over": { "$ref": "$.items" } } }
```
Empty array → `0`.

### `$min` / `$max` — Find extremes
```json
{ "$min": { "over": { "$ref": "$.prices" } } }
{ "$max": { "over": { "$ref": "$.scores" } } }
```
Empty array → `null`.

### `$pluck` — Extract a field from each element
```json
{ "$pluck": { "over": { "$ref": "$.users" }, "key": "name" } }
```
`[{ "name": "A" }, { "name": "B" }]` → `["A", "B"]`

### `$take` / `$drop` — Slice from start
```json
{ "$take": { "from": { "$ref": "$.items" }, "count": 3 } }
{ "$drop": { "from": { "$ref": "$.items" }, "count": 2 } }
```

### `$match` — Filter by string containment
```json
{ "$match": { "over": { "$ref": "$.words" }, "as": "w", "search": { "$const": "hel" } } }
```
Keeps elements where the element contains the search string.

### `$flatMap` — Map then flatten
```json
{
  "$flatMap": {
    "over": { "$ref": "$.users" },
    "as": "user",
    "body": { "$get": { "from": { "$var": "user" }, "path": ["tags"] } }
  }
}
```
Each body should return an array. Results are flattened one level.

---

## Compilation

For configs that will be executed many times against different source data, compile once and execute many:

```typescript
const ir = await compile(config, { name: 'user-transform', version: '1.0.0' });

// ir contains:
// - Desugared config (sugar ops already resolved)
// - SHA256 fingerprint (for cache invalidation)
// - Stats (node count, op frequency, max depth, optimizations applied)
// - Tables (all JSONPaths and string literals for cache priming)

const result1 = execute(ir, source1); // No validation, no desugaring
const result2 = execute(ir, source2); // Each op's handler already attached
```

The IR is JSON-serializable — store it in a database, cache in Redis, send over a wire.

## As a host's transform

```typescript
prismTransform(config: unknown, source: unknown): unknown
```

Prism in the shape a host's transform seam takes. nova's shell (`transform`),
tide's engine (`transform`) and strata's upgrader (`{ transform }`) each run a
config through a function they are handed and know nothing of Prism; this is the
function to hand them.

```typescript
import { prismTransform } from '@niscorp/prism';

const tide = createTide({ store, transform: prismTransform, effects });
```

- **The config** is parsed against `ConfigSchema` where it comes in — once for
  each config object, so a config a host keeps and passes again is not parsed
  again: a later call only evaluates. It is kept by the object, so a config
  changed in place after its first call is not read again; pass a new object.
  A config that is a new object on every call is parsed on every call.
- **The source** must be plain JSON: `null`, strings, booleans, finite numbers,
  and arrays and objects of those. One that holds `undefined`, a function or a
  non-finite number is refused — `The source of a transform must be plain JSON.`
- **The result** is what `evaluate` answers, and the caller's to change: a
  `$const` in a kept config is handed out as a copy.

`evaluate` itself is typed for a `JsonValue` source and checks none, so it does
not fit a seam that hands over `unknown`. `@niscorp/prism/migrations` exports the
same function.

## Limits

`evaluate`, `evaluateSafe` and `execute` take an optional third argument, a
`Partial<Limits>`, merged over `DEFAULT_LIMITS`:

| Limit | Default | Counts |
|-------|---------|--------|
| `maxSteps` | `1_000_000` | Nodes evaluated in one evaluation |
| `maxStringLength` | `1_000_000` | Characters in any one string a node produces |
| `maxValues` | `1_000_000` | Values (scalars, array items, object fields) in a `$reduce` accumulator, a `$with` binding, or the result |

Past any of them the evaluation throws `E_BUDGET`.

## Error Codes

| Code | Meaning |
|------|---------|
| `E_SCHEMA` | Config failed Zod validation — a malformed op, or a `$` key that is not an op |
| `E_MISSING_PATH` | `$ref` or `$get` path doesn't exist (and no fallback) |
| `E_TYPE` | Wrong type for operation (e.g. `$map.over` is not an array) |
| `E_DIVISION_BY_ZERO` | `$div` with divisor 0 |
| `E_DATE_INVALID` | Invalid date value |
| `E_VAR_NOT_FOUND` | `$var` references undefined variable |
| `E_NODE_SHAPE` | A node no op answers to, in a tree that never went through the schema |
| `E_ASSERT` | A config's own `$assert` refused its input |
| `E_BUDGET` | Evaluation went past a limit (see Limits) |

All errors are instances of `PrismError` with `.code` and optional `.context`.

**Valid, and what it does not promise.** `validate`, `evaluate` and `compile` hold a config to the same schema, so a config that validates has no node the evaluator cannot dispatch: every object in it is an op Prism has or a plain object with no `$` key. It can still fail on the data it is given — a missing path, a wrong type, a budget. `E_NODE_SHAPE` is what is left for a tree the schema never saw: an IR handed to `execute`, which does not validate.
