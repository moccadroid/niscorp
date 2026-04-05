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

### Source Data

Every evaluation takes a `source` object — the data the transformation reads from via `$ref`.

### Bindings and Variables

`$ref` reads from source. `$var` reads from scoped variables created by `$with`, `$map`, `$filter`, `$reduce`, and `$sortBy`.

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

Resolves a JSONPath against the source data. Supports `.key` and `[index]` syntax.

```json
{ "$ref": "$.user.name" }
{ "$ref": "$.items[0].sku" }
{ "$ref": "$.deeply.nested.value" }
```

Throws `E_MISSING_PATH` if the path doesn't exist.

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

Without `fallback`, throws `E_MISSING_PATH`. With `fallback`, returns the fallback value instead.

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

`dir` defaults to `"asc"`. Works with numbers and strings.

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

### `$round`
```json
{ "$round": { "value": { "$const": 3.14159 }, "digits": 2 } }
```
Result: `3.14`. `digits` defaults to 0.

---

## String Operations

### `$join` — Concatenate with separator
```json
{ "$join": { "parts": [{ "$ref": "$.first" }, { "$ref": "$.last" }], "sep": " " } }
```
Parts are coerced to strings. `sep` defaults to `""`.

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

### `$replace` — Replace first occurrence
```json
{ "$replace": { "value": { "$ref": "$.text" }, "search": "world", "replacement": "there" } }
```

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

## Time Operations

Powered by [dayjs](https://day.js.org/). Date values can be ISO 8601 strings or Unix timestamps (milliseconds).

### `$date` — Format a date
```json
{ "$date": { "value": { "$ref": "$.createdAt" } } }
{ "$date": { "value": { "$ref": "$.createdAt" }, "format": "YYYY-MM-DD" } }
{ "$date": { "value": { "$ref": "$.createdAt" }, "format": "HH:mm", "utc": true } }
```
Without `format`, returns ISO 8601. With `format`, uses [dayjs format tokens](https://day.js.org/docs/en/display/format).

### `$dateAdd` — Date arithmetic
```json
{ "$dateAdd": { "date": { "$ref": "$.startDate" }, "amount": 30, "unit": "day" } }
{ "$dateAdd": { "date": { "$ref": "$.now" }, "amount": -1, "unit": "hour" } }
```
Returns ISO 8601 string. Units: `year`, `month`, `day`, `hour`, `minute`, `second`.

### `$dateDiff` — Date difference
```json
{ "$dateDiff": { "from": { "$ref": "$.start" }, "to": { "$ref": "$.end" }, "unit": "day" } }
```
Returns a number. Same units as `$dateAdd`.

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
Desugars to `$div($sum, $count)`.

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
// - Stats (node count, op frequency, max depth)
// - Tables (all JSONPaths and string literals for cache priming)

const result1 = execute(ir, source1); // No validation, no desugaring
const result2 = execute(ir, source2); // 2-5x faster than evaluate()
```

The IR is JSON-serializable — store it in a database, cache in Redis, send over a wire.

## Error Codes

| Code | Meaning |
|------|---------|
| `E_SCHEMA` | Config failed Zod validation |
| `E_MISSING_PATH` | `$ref` or `$get` path doesn't exist (and no fallback) |
| `E_TYPE` | Wrong type for operation (e.g. `$map.over` is not an array) |
| `E_DIVISION_BY_ZERO` | `$div` with divisor 0 |
| `E_DATE_INVALID` | Invalid date value |
| `E_VAR_NOT_FOUND` | `$var` references undefined variable |
| `E_NODE_SHAPE` | Unrecognized node structure |

All errors are instances of `PrismError` with `.code` and optional `.context`.
