# Prism against the libraries it is compared with — node-22

Run 2026-10-08 on 13th Gen Intel(R) Core(TM) i9-13900K (32 threads, 64 GB), Windows_NT 10.0.26200 x64, Node v22.22.1 (V8 12.4.254.21-node.35). 1 pass; every case in a process of its own; each figure is the median over passes of that process's median for one call.

Read `README.md` for the tasks and the rules, and `results/SOURCES.md` for each task as each library writes it.

## The libraries

| library | package | version | the transform is | prepared form | notes |
|---|---|---|---|---|---|
| CEL (@marcbachmann/cel-js) | @marcbachmann/cel-js | 8.0.0 | string | yes | prepare is parse, which returns a function; run calls it with the input as the variables. The package's parse and evaluate at their defaults: a map literal must have values of one type, so where they differ they are written dyn(…). Numbers from JSON are CEL doubles; a CEL int comes back as a BigInt. |
| GROQ (groq-js) | groq-js | 2.0.0 | string | yes | prepare is parse (a syntax tree); run is evaluate on that tree, which is asynchronous: it resolves to a value whose get() resolves to the answer. The package also exports evaluateSync, marked internal and as covering a subset of the language, so it is not used. The input is given as the root of the query, not as a dataset. |
| A function written by hand |  |  | code | no | Not a transform a user can store or an LLM can be handed a schema for: it is code. Here as the ceiling. |
| JMESPath (jmespath.js) | jmespath | 0.16.0 | string | no | The original jmespath.js. Its one documented call is search(data, expression), which parses on every call; compile() is exported but nothing public runs what it returns, so there is no prepared form. |
| JMESPath Community | @jmespath-community/jmespath | 1.3.0 | string | yes | The JMESPath Community specification: arithmetic, let, group_by, items and from_items, string functions, and a ternary this package calls experimental. prepare is compile (to a syntax tree); run is TreeInterpreter.search, as its README shows. |
| Jora ⚠ eval | jora | 1.0.0-beta.16 | string | yes | prepare is jora(query), which turns the query into JavaScript text and compiles it with new Function; run calls that function. At its defaults jora keeps every compiled query in a map inside the package, keyed by the query text: only the first prepare or one shot of a query in a process compiles, the later ones find it there. |
| jq (jq-wasm) | jq-wasm | 3.0.0-jq-1.8.2 | string | no | jq 1.8.2 compiled to WebAssembly. No prepared form: the public API takes the filter as text on every call and compiles it inside jq. Every call crosses the WASM boundary with JSON text: the input is stringified going in and the output parsed coming out. The module is loaded once before anything is timed; jq.first hands back the first output of the filter. |
| JSON-e | json-e | 4.8.4 | json | no | No prepared form: jsone(template, context) walks the template and parses every expression string in it on every call, once for each element inside $map, $reduce and $sort. It keeps nothing between calls. |
| json-logic-engine (interpreted) | json-logic-engine | 5.0.7 | json | yes | engine.run on one LogicEngine at its defaults. There is no call that prepares a rule for the interpreter, but the engine itself keeps a plan for each rule object it has seen (a WeakMap on the object), so run on the same object reuses it and oneShot, handed a fresh copy, plans again; after 500 unseen objects in a row the engine turns that planning off for good. |
| json-logic-engine (build) ⚠ eval | json-logic-engine | 5.0.7 | json | yes | engine.build on one LogicEngine at its defaults: the rule becomes JavaScript source that is run through eval (compiler.js, processBuiltString), so it needs a host that allows eval. oneShot is build and one call. The engine keeps nothing between builds. |
| JsonLogic (json-logic-js) | json-logic-js | 2.0.5 | json | no | The reference JsonLogic implementation, standard operators only. No prepared form: apply walks the rule on every call, and keeps nothing between calls. A rule language, not a transform language: it cannot build an object. |
| JSONata | jsonata | 2.2.2 | string | yes | Asynchronous: evaluate returns a promise, and it is measured so. prepare is jsonata(source), which parses; run is evaluate on what it returned. groups carries one extra step (orders.$ in place of orders) because 2.2.2 writes into an empty input list when it groups. |
| JSON Query (JSON format) | @jsonquerylang/jsonquery | 5.1.1 | json | yes | The query as JSON data. prepare is compile, which turns the query into a closure without checking it against anything; run is that closure. Built-in functions only. |
| JSON Query (text format) | @jsonquerylang/jsonquery | 5.1.1 | string | yes | The same queries as the JSON row, in the text format. prepare is parse then compile; oneShot is jsonquery(data, text), which does both and runs. Built-in functions only. |
| lodash | lodash | 4.18.1 | code | no | Code, not a transform that can be stored: each task as a function over lodash calls (plain calls, not _.chain). The total of an order is a helper shared by totals and screen; lodash has no date functions, so dates is plain JavaScript. |
| mingo (aggregation pipeline) | mingo | 7.2.4 | json | yes | MongoDB aggregation pipelines over in-memory arrays. prepare is new Aggregator(pipeline), which keeps the pipeline and checks nothing until it runs; run is .run(collection). Default options (no cloning of inputs or outputs); all operators registered by the default entry point. |
| Prism (compile, execute) | @niscorp/prism |  | json | yes | This repository build. prepare is compile (check, desugar, optimize, fingerprint); run is execute; oneShot is evaluate with a new config object each call. |
| Prism 0.2.2 (compile, execute) | @niscorp/prism |  | json | yes | The version on npm before this work. Same configs. |
| Prism 0.2.2 (prismTransform) | @niscorp/prism |  | json | yes | The version on npm before this work, through prismTransform. |
| Prism (evaluate) | @niscorp/prism |  | json | yes | This repository build, as a host calls it: evaluate with the config object it holds. run passes the same config object again; oneShot passes a new object each call. |

## What each can express

`ok`: the library gives the task's answer on every check input. `—`: it cannot express the task without custom code.

| library | project | reshape | strings | conditional | defaults | dates | rule | totals | top | groups | screen | of 11 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CEL (@marcbachmann/cel-js) | ok | ok | ok | ok | ok | ok | ok | — | — | — | — | 7 |
| GROQ (groq-js) | ok | ok | ok | ok | ok | ok | ok | ok | ok | — | ok | 10 |
| A function written by hand | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |
| JMESPath (jmespath.js) | ok | ok | — | ok | ok | — | ok | — | ok | — | — | 6 |
| JMESPath Community | ok | ok | ok | ok | ok | — | ok | ok | ok | ok | ok | 10 |
| Jora ⚠ eval | ok | ok | ok | ok | ok | — | ok | ok | ok | ok | ok | 10 |
| jq (jq-wasm) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |
| JSON-e | ok | ok | ok | ok | ok | — | ok | ok | ok | ok | ok | 10 |
| json-logic-engine (interpreted) | ok | ok | — | ok | ok | — | ok | ok | — | — | — | 6 |
| json-logic-engine (build) ⚠ eval | ok | ok | — | ok | ok | — | ok | ok | — | — | — | 6 |
| JsonLogic (json-logic-js) | — | — | — | — | — | — | ok | — | — | — | — | 1 |
| JSONata | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |
| JSON Query (JSON format) | ok | ok | — | ok | ok | — | ok | ok | ok | ok | ok | 9 |
| JSON Query (text format) | ok | ok | — | ok | ok | — | ok | ok | ok | ok | ok | 9 |
| lodash | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |
| mingo (aggregation pipeline) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |
| Prism (compile, execute) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |
| Prism 0.2.2 (compile, execute) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |
| Prism 0.2.2 (prismTransform) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |
| Prism (evaluate) | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 11 |

Why not:
- **CEL (@marcbachmann/cel-js)**, `totals`: CEL has no sum or fold over a list: its macros are all, exists, exists_one, map and filter. The lines of an order cannot be added up.
- **CEL (@marcbachmann/cel-js)**, `top`: CEL has no sorting, and this package has no list sort or slice function either (cel-go has them as an extension).
- **CEL (@marcbachmann/cel-js)**, `groups`: CEL has no sum or fold over a list: its macros are all, exists, exists_one, map and filter. The shipping of a country cannot be added up, and there is no grouping.
- **CEL (@marcbachmann/cel-js)**, `screen`: CEL has no sum or fold over a list: its macros are all, exists, exists_one, map and filter. The revenue cannot be added up, and a list cannot be sorted.
- **GROQ (groq-js)**, `groups`: GROQ has no grouping, and an object key is always a literal string: an object keyed by the countries found in the data cannot be built.
- **JMESPath (jmespath.js)**, `strings`: JMESPath has no function that changes the case of a string.
- **JMESPath (jmespath.js)**, `dates`: JMESPath has no date functions and no arithmetic, and a string cannot be sliced.
- **JMESPath (jmespath.js)**, `totals`: JMESPath has no arithmetic: nothing multiplies qty by unitCents or adds shipping to a sum.
- **JMESPath (jmespath.js)**, `groups`: JMESPath has no grouping function, and no way to build an object whose keys come from the data.
- **JMESPath (jmespath.js)**, `screen`: JMESPath has no arithmetic: nothing multiplies qty by unitCents or adds shipping to a sum.
- **JMESPath Community**, `dates`: No date functions: a timestamp cannot be turned into a number, so the days between two of them cannot be counted.
- **Jora**, `dates`: Jora has no date parsing and no date arithmetic: the whole days between two ISO times cannot be counted.
- **JSON-e**, `dates`: No date parsing and no difference between two dates: the only date feature is $fromNow, which makes a timestamp from an offset.
- **json-logic-engine (interpreted)**, `strings`: No operator changes the case of a string.
- **json-logic-engine (interpreted)**, `dates`: No operator parses a date or measures the time between two.
- **json-logic-engine (interpreted)**, `top`: No operator sorts a list, and none takes its first n.
- **json-logic-engine (interpreted)**, `groups`: No operator groups a list, and none builds an object whose keys come from the data (eachKey takes fixed keys).
- **json-logic-engine (interpreted)**, `screen`: No operator sorts a list, and none takes its first n.
- **json-logic-engine (build)**, `strings`: No operator changes the case of a string.
- **json-logic-engine (build)**, `dates`: No operator parses a date or measures the time between two.
- **json-logic-engine (build)**, `top`: No operator sorts a list, and none takes its first n.
- **json-logic-engine (build)**, `groups`: No operator groups a list, and none builds an object whose keys come from the data (eachKey takes fixed keys).
- **json-logic-engine (build)**, `screen`: No operator sorts a list, and none takes its first n.
- **JsonLogic (json-logic-js)**, `project`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `reshape`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `strings`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `conditional`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `defaults`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `dates`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `totals`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `top`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `groups`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JsonLogic (json-logic-js)**, `screen`: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).
- **JSON Query (JSON format)**, `strings`: No built-in function changes the case of a string, so the upper-cased city cannot be written (the interpolated string and the joined list can).
- **JSON Query (JSON format)**, `dates`: No date functions: a timestamp cannot be parsed or subtracted, so the whole days until `now` cannot be written (the day itself is a substring).
- **JSON Query (text format)**, `strings`: No built-in function changes the case of a string, so the upper-cased city cannot be written (the interpolated string and the joined list can).
- **JSON Query (text format)**, `dates`: No date functions: a timestamp cannot be parsed or subtracted, so the whole days until `now` cannot be written (the day itself is a substring).

## Against Prism, over everything

How long a call takes next to Prism's `execute`, as a geometric mean over the tasks both express: `2.00×` is twice as long as Prism, `0.50×` is half. "Repeated call" is the prepared form where a library has one, its one-shot call where it has none. One-order tasks and 10,000-order tasks are apart, because fixed cost rules the first and per-row cost the second.

| library | tasks | repeated call, one order | repeated call, 100 orders | repeated call, 10,000 orders | one shot, one order |
|---|---:|---:|---:|---:|---:|
| A function written by hand | 11 | 0.02× | 0.02× | 0.03× | 0.00× |
| json-logic-engine (build) ⚠ eval | 6 | 0.03× | 0.04× | 0.05× | 0.78× |
| lodash | 11 | 0.06× | 0.25× | 0.22× | 0.00× |
| Jora ⚠ eval | 10 | 0.29× | 0.32× | 0.30× | 0.02× |
| JSON Query (text format) | 9 | 0.49× | 0.28× | 0.27× | 2.88× |
| JSON Query (JSON format) | 9 | 0.50× | 0.28× | 0.27× | 1.25× |
| JMESPath Community | 10 | 0.52× | 0.58× | 0.54× | 0.32× |
| CEL (@marcbachmann/cel-js) | 7 | 0.58× |  |  | 0.41× |
| Prism (compile, execute) | 11 | 1.00× | 1.00× | 1.00× | 1.00× |
| Prism (evaluate) | 11 | 1.03× | 1.00× | 1.05× | 0.98× |
| json-logic-engine (interpreted) | 6 | 1.54× | 0.85× | 0.75× | 0.15× |
| Prism 0.2.2 (compile, execute) | 11 | 3.23× | 2.61× | 2.27× | 72.4× |
| JsonLogic (json-logic-js) | 1 | 4.83× |  |  | 0.07× |
| GROQ (groq-js) | 10 | 6.90× | 10.5× | 10.1× | 1.18× |
| JMESPath (jmespath.js) | 6 | 7.22× | 1.00× | 0.85× | 0.31× |
| JSONata | 11 | 9.88× | 9.94× | 11.7× | 4.69× |
| mingo (aggregation pipeline) | 11 | 10.2× | 5.41× | 4.52× | 2.52× |
| JSON-e | 10 | 58.3× | 73.6× | 52.4× | 2.85× |
| jq (jq-wasm) | 11 | 929× | 34.9× | 23.3× | 59.5× |
| Prism 0.2.2 (prismTransform) | 11 | 1180× | 45.5× | 7.19× | 145× |

## One order

### `project` — Pick and rename fields
Four fields out of one order, two of them from nested objects, under new names.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| A function written by hand |  |  | 5.5 ns |
| json-logic-engine (build) ⚠ eval | 4.09 µs | 5.5 ns | 4.04 µs |
| Jora ⚠ eval | 15 ns | 123 ns | 139 ns |
| JMESPath Community | 810 ns | 129 ns | 1.36 µs |
| JSON Query (text format) | 10.2 µs | 137 ns | 10.7 µs |
| JSON Query (JSON format) | 3.34 µs | 139 ns | 4.33 µs |
| CEL (@marcbachmann/cel-js) | 850 ns | 190 ns | 1.96 µs |
| Prism (compile, execute) | 44.2 µs | 248 ns | 3.49 µs |
| Prism (evaluate) |  | 258 ns | 3.40 µs |
| lodash |  |  | 274 ns |
| json-logic-engine (interpreted) |  | 578 ns | 902 ns |
| Prism 0.2.2 (compile, execute) | 311 µs | 1.30 µs | 256 µs |
| JMESPath (jmespath.js) |  |  | 1.68 µs |
| GROQ (groq-js) | 3.89 µs | 2.52 µs | 7.27 µs |
| mingo (aggregation pipeline) | 3.92 µs | 3.83 µs | 22.7 µs |
| JSONata | 27.4 µs | 4.63 µs | 35.6 µs |
| JSON-e |  |  | 16.9 µs |
| Prism 0.2.2 (prismTransform) |  | 254 µs | 506 µs |
| jq (jq-wasm) |  |  | 598 µs |

Not expressible: JsonLogic (json-logic-js).

### `reshape` — Reshape into a nested object
A new nested shape, with the order lines mapped to { sku, qty }.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| json-logic-engine (build) ⚠ eval | 9.97 µs | 20 ns | 10.7 µs |
| A function written by hand |  |  | 25 ns |
| Jora ⚠ eval | 15 ns | 323 ns | 348 ns |
| JMESPath Community | 2.34 µs | 341 ns | 3.51 µs |
| JSON Query (text format) | 26.1 µs | 344 ns | 27.3 µs |
| JSON Query (JSON format) | 8.73 µs | 348 ns | 11.3 µs |
| CEL (@marcbachmann/cel-js) | 3.23 µs | 959 ns | 7.29 µs |
| lodash |  |  | 1.18 µs |
| Prism (compile, execute) | 74.1 µs | 1.34 µs | 14.8 µs |
| Prism (evaluate) |  | 1.37 µs | 14.8 µs |
| json-logic-engine (interpreted) |  | 2.12 µs | 7.40 µs |
| JMESPath (jmespath.js) |  |  | 3.75 µs |
| Prism 0.2.2 (compile, execute) | 1.43 ms | 7.47 µs | 1.30 ms |
| GROQ (groq-js) | 7.85 µs | 9.76 µs | 19.6 µs |
| mingo (aggregation pipeline) | 4.04 µs | 11.9 µs | 32.6 µs |
| JSONata | 37.0 µs | 13.4 µs | 63.2 µs |
| JSON-e |  |  | 38.9 µs |
| jq (jq-wasm) |  |  | 602 µs |
| Prism 0.2.2 (prismTransform) |  | 1.45 ms | 2.63 ms |

Not expressible: JsonLogic (json-logic-js).

### `strings` — Build strings
An interpolated string, a joined list, an upper-cased field.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| A function written by hand |  |  | 69 ns |
| lodash |  |  | 96 ns |
| Jora ⚠ eval | 56 ns | 344 ns | 419 ns |
| CEL (@marcbachmann/cel-js) | 1.92 µs | 531 ns | 5.17 µs |
| JMESPath Community | 2.61 µs | 621 ns | 3.91 µs |
| Prism (compile, execute) | 75.8 µs | 1.11 µs | 11.2 µs |
| Prism (evaluate) |  | 1.14 µs | 11.1 µs |
| Prism 0.2.2 (compile, execute) | 1.09 ms | 3.17 µs | 1.03 ms |
| JSONata | 39.0 µs | 7.33 µs | 50.8 µs |
| GROQ (groq-js) | 6.39 µs | 7.89 µs | 16.1 µs |
| mingo (aggregation pipeline) | 3.93 µs | 11.1 µs | 30.2 µs |
| JSON-e |  |  | 43.0 µs |
| jq (jq-wasm) |  |  | 706 µs |
| Prism 0.2.2 (prismTransform) |  | 1.07 ms | 2.03 ms |

Not expressible: JMESPath (jmespath.js), json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js), JSON Query (JSON format), JSON Query (text format).

### `conditional` — Choose by condition
A three-way choice on one field and a nested choice on two.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| lodash |  |  | 5.1 ns |
| A function written by hand |  |  | 5.2 ns |
| json-logic-engine (build) ⚠ eval | 10.8 µs | 20 ns | 11.4 µs |
| Jora ⚠ eval | 17 ns | 128 ns | 147 ns |
| JSON Query (text format) | 50.3 µs | 257 ns | 52.9 µs |
| JSON Query (JSON format) | 21.2 µs | 265 ns | 23.6 µs |
| JMESPath Community | 5.29 µs | 343 ns | 6.32 µs |
| CEL (@marcbachmann/cel-js) | 2.23 µs | 412 ns | 5.24 µs |
| Prism (evaluate) |  | 486 ns | 16.8 µs |
| Prism (compile, execute) | 91.0 µs | 486 ns | 16.9 µs |
| json-logic-engine (interpreted) |  | 678 ns | 1.40 µs |
| Prism 0.2.2 (compile, execute) | 1.43 ms | 1.99 µs | 1.31 ms |
| GROQ (groq-js) | 8.87 µs | 3.41 µs | 13.3 µs |
| JMESPath (jmespath.js) |  |  | 5.12 µs |
| JSONata | 43.6 µs | 6.98 µs | 54.9 µs |
| mingo (aggregation pipeline) | 3.95 µs | 7.14 µs | 25.8 µs |
| JSON-e |  |  | 18.6 µs |
| jq (jq-wasm) |  |  | 615 µs |
| Prism 0.2.2 (prismTransform) |  | 1.39 ms | 2.58 ms |

Not expressible: JsonLogic (json-logic-js).

### `defaults` — Fill in what is missing
A missing key and a null each fall back to a default; two constants are added.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| json-logic-engine (build) ⚠ eval | 4.19 µs | 5.7 ns | 4.28 µs |
| A function written by hand |  |  | 5.8 ns |
| lodash |  |  | 10 ns |
| Jora ⚠ eval | 16 ns | 40 ns | 48 ns |
| JSON Query (text format) | 28.1 µs | 113 ns | 28.7 µs |
| JSON Query (JSON format) | 10.0 µs | 116 ns | 10.9 µs |
| JMESPath Community | 1.68 µs | 200 ns | 2.32 µs |
| CEL (@marcbachmann/cel-js) | 2.05 µs | 285 ns | 4.40 µs |
| Prism (compile, execute) | 49.4 µs | 322 ns | 6.35 µs |
| Prism (evaluate) |  | 325 ns | 6.47 µs |
| json-logic-engine (interpreted) |  | 799 ns | 1.08 µs |
| Prism 0.2.2 (compile, execute) | 510 µs | 1.46 µs | 414 µs |
| GROQ (groq-js) | 4.48 µs | 1.75 µs | 6.91 µs |
| JMESPath (jmespath.js) |  |  | 2.07 µs |
| JSONata | 31.5 µs | 5.21 µs | 39.8 µs |
| mingo (aggregation pipeline) | 3.98 µs | 5.68 µs | 26.1 µs |
| JSON-e |  |  | 17.5 µs |
| Prism 0.2.2 (prismTransform) |  | 424 µs | 848 µs |
| jq (jq-wasm) |  |  | 591 µs |

Not expressible: JsonLogic (json-logic-js).

### `dates` — Format a date and count days
The order's day as YYYY-MM-DD (UTC), and the whole days from then to a fixed moment, 2026-10-01T00:00:00Z.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| lodash |  |  | 324 ns |
| A function written by hand |  |  | 325 ns |
| CEL (@marcbachmann/cel-js) | 2.34 µs | 995 ns | 5.71 µs |
| GROQ (groq-js) | 8.34 µs | 5.49 µs | 15.2 µs |
| Prism (compile, execute) | 54.2 µs | 6.33 µs | 19.3 µs |
| Prism (evaluate) |  | 6.64 µs | 17.7 µs |
| Prism 0.2.2 (compile, execute) | 812 µs | 7.07 µs | 803 µs |
| mingo (aggregation pipeline) | 3.98 µs | 8.21 µs | 28.1 µs |
| JSONata | 38.8 µs | 10.0 µs | 54.3 µs |
| jq (jq-wasm) |  |  | 654 µs |
| Prism 0.2.2 (prismTransform) |  | 837 µs | 1.51 ms |

Not expressible: JMESPath (jmespath.js), JMESPath Community, Jora, JSON-e, json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js), JSON Query (JSON format), JSON Query (text format).

### `rule` — Answer a yes/no rule
Paid, and gold or shipping of at least 1000, and some line with a quantity of 3 or more. The answer is a boolean.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| lodash |  |  | 0.5 ns |
| A function written by hand |  |  | 0.5 ns |
| json-logic-engine (build) ⚠ eval | 9.26 µs | 14 ns | 9.54 µs |
| Jora ⚠ eval | 31 ns | 94 ns | 129 ns |
| JMESPath Community | 2.57 µs | 112 ns | 2.85 µs |
| json-logic-engine (interpreted) |  | 118 ns | 496 ns |
| CEL (@marcbachmann/cel-js) | 1.53 µs | 124 ns | 2.76 µs |
| Prism (compile, execute) | 78.5 µs | 176 ns | 12.1 µs |
| Prism (evaluate) |  | 184 ns | 12.1 µs |
| JSON Query (text format) | 30.3 µs | 193 ns | 30.2 µs |
| JSON Query (JSON format) | 14.7 µs | 196 ns | 16.2 µs |
| Prism 0.2.2 (compile, execute) | 1.17 ms | 370 ns | 1.03 ms |
| JsonLogic (json-logic-js) |  |  | 848 ns |
| JMESPath (jmespath.js) |  |  | 2.69 µs |
| JSONata | 47.4 µs | 3.58 µs | 53.4 µs |
| mingo (aggregation pipeline) | 3.97 µs | 4.36 µs | 21.9 µs |
| GROQ (groq-js) | 5.32 µs | 7.54 µs | 14.5 µs |
| JSON-e |  |  | 43.7 µs |
| jq (jq-wasm) |  |  | 638 µs |
| Prism 0.2.2 (prismTransform) |  | 1.05 ms | 2.15 ms |

## Many orders

### `totals` — Map with a computed field
For every order: its id, its total (each line's qty × unitCents, plus shipping) and how many units it holds.

| library | prepare | repeated call, 100 | repeated call, 10,000 | one shot, 100 | one shot, 10,000 |
|---|---:|---:|---:|---:|---:|
| A function written by hand |  | 748 ns | 141 µs | 748 ns | 141 µs |
| json-logic-engine (build) ⚠ eval | 14.8 µs | 5.04 µs | 674 µs | 37.7 µs | 1.89 ms |
| lodash |  | 7.77 µs | 804 µs | 7.77 µs | 804 µs |
| JSON Query (JSON format) | 14.3 µs | 27.0 µs | 2.63 ms | 55.5 µs | 4.29 ms |
| JSON Query (text format) | 30.8 µs | 26.9 µs | 2.68 ms | 59.9 µs | 2.68 ms |
| Jora ⚠ eval | 30 ns | 29.2 µs | 3.17 ms | 29.0 µs | 3.15 ms |
| JMESPath Community | 1.51 µs | 52.3 µs | 6.16 ms | 56.3 µs | 6.15 ms |
| json-logic-engine (interpreted) |  | 97.0 µs | 10.3 ms | 118 µs | 11.4 ms |
| Prism (compile, execute) | 91.1 µs | 114 µs | 13.7 ms | 460 µs | 43.5 ms |
| Prism (evaluate) |  | 117 µs | 14.6 ms | 447 µs | 43.2 ms |
| Prism 0.2.2 (compile, execute) | 1.30 ms | 310 µs | 32.8 ms | 1.89 ms | 71.0 ms |
| Prism 0.2.2 (prismTransform) |  | 1.93 ms | 66.0 ms | 3.02 ms | 76.7 ms |
| mingo (aggregation pipeline) | 3.96 µs | 715 µs | 69.8 ms | 823 µs | 72.5 ms |
| JSONata | 46.3 µs | 924 µs | 95.1 ms | 1.06 ms | 96.9 ms |
| jq (jq-wasm) |  | 1.77 ms | 120 ms | 1.77 ms | 120 ms |
| GROQ (groq-js) | 6.64 µs | 1.42 ms | 143 ms | 1.47 ms | 140 ms |
| JSON-e |  | 6.36 ms | 483 ms | 6.36 ms | 483 ms |

Not expressible: CEL (@marcbachmann/cel-js), JMESPath (jmespath.js), JsonLogic (json-logic-js).

### `top` — Filter, sort, take
Paid orders of gold customers, newest first by placedAt (unique, ISO, so string order is time order), the first ten, as { id, placedAt }.

| library | prepare | repeated call, 100 | repeated call, 10,000 | one shot, 100 | one shot, 10,000 |
|---|---:|---:|---:|---:|---:|
| A function written by hand |  | 229 ns | 52.3 µs | 229 ns | 52.3 µs |
| Jora ⚠ eval | 30 ns | 5.76 µs | 537 µs | 5.75 µs | 546 µs |
| JSON Query (text format) | 29.8 µs | 6.02 µs | 663 µs | 35.7 µs | 861 µs |
| JSON Query (JSON format) | 10.3 µs | 6.31 µs | 699 µs | 23.6 µs | 1.19 ms |
| JMESPath (jmespath.js) |  | 14.0 µs | 1.02 ms | 14.0 µs | 1.02 ms |
| JMESPath Community | 1.93 µs | 10.6 µs | 1.13 ms | 13.2 µs | 1.12 ms |
| Prism (compile, execute) | 82.8 µs | 14.0 µs | 1.20 ms | 160 µs | 12.8 ms |
| Prism (evaluate) |  | 13.4 µs | 1.24 ms | 156 µs | 12.7 ms |
| lodash |  | 21.8 µs | 1.76 ms | 21.8 µs | 1.76 ms |
| mingo (aggregation pipeline) | 4.00 µs | 32.6 µs | 2.42 ms | 60.8 µs | 2.96 ms |
| Prism 0.2.2 (compile, execute) | 1.12 ms | 48.0 µs | 4.01 ms | 1.18 ms | 17.0 ms |
| GROQ (groq-js) | 5.87 µs | 169 µs | 17.4 ms | 189 µs | 17.3 ms |
| Prism 0.2.2 (prismTransform) |  | 1.26 ms | 22.0 ms | 2.24 ms | 23.6 ms |
| JSONata | 55.4 µs | 190 µs | 22.2 ms | 277 µs | 21.9 ms |
| jq (jq-wasm) |  | 1.33 ms | 77.6 ms | 1.33 ms | 77.6 ms |
| JSON-e |  | 1.18 ms | 82.1 ms | 1.18 ms | 82.1 ms |

Not expressible: CEL (@marcbachmann/cel-js), json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js).

### `groups` — Group and aggregate
By the customer's country: how many orders, and the sum of their shipping. An object keyed by country.

| library | prepare | repeated call, 100 | repeated call, 10,000 | one shot, 100 | one shot, 10,000 |
|---|---:|---:|---:|---:|---:|
| A function written by hand |  | 754 ns | 169 µs | 754 ns | 169 µs |
| JSON Query (text format) | 19.3 µs | 7.25 µs | 754 µs | 28.2 µs | 841 µs |
| JSON Query (JSON format) | 8.07 µs | 7.35 µs | 757 µs | 22.8 µs | 1.14 ms |
| lodash |  | 10.7 µs | 1.02 ms | 10.7 µs | 1.02 ms |
| JMESPath Community | 1.91 µs | 13.1 µs | 1.03 ms | 15.8 µs | 1.00 ms |
| Jora ⚠ eval | 77 ns | 10.8 µs | 1.20 ms | 10.9 µs | 1.14 ms |
| Prism (evaluate) |  | 22.9 µs | 2.09 ms | 90.3 µs | 5.63 ms |
| Prism (compile, execute) | 97.1 µs | 22.7 µs | 2.10 ms | 94.9 µs | 5.57 ms |
| Prism 0.2.2 (compile, execute) | 1.75 ms | 56.3 µs | 4.07 ms | 1.78 ms | 11.1 ms |
| Prism 0.2.2 (prismTransform) |  | 2.00 ms | 14.9 ms | 3.32 ms | 18.1 ms |
| mingo (aggregation pipeline) | 3.95 µs | 205 µs | 18.8 ms | 264 µs | 19.3 ms |
| JSONata | 34.7 µs | 216 µs | 28.4 ms | 285 µs | 30.0 ms |
| jq (jq-wasm) |  | 1.56 ms | 112 ms | 1.56 ms | 112 ms |
| JSON-e |  | 3.58 ms | 276 ms | 3.58 ms | 276 ms |

Not expressible: CEL (@marcbachmann/cel-js), GROQ (groq-js), JMESPath (jmespath.js), json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js).

### `screen` — An API answer into a screen model
The paid orders: how many, their revenue, and the twenty newest as rows of { id, buyer, city, totalCents, skus }.

| library | prepare | repeated call, 100 | repeated call, 10,000 | one shot, 100 | one shot, 10,000 |
|---|---:|---:|---:|---:|---:|
| A function written by hand |  | 2.66 µs | 259 µs | 2.66 µs | 259 µs |
| lodash |  | 10.0 µs | 651 µs | 10.0 µs | 651 µs |
| JSON Query (text format) | 75.2 µs | 23.5 µs | 1.45 ms | 103 µs | 1.65 ms |
| JSON Query (JSON format) | 32.7 µs | 22.9 µs | 1.47 ms | 81.8 µs | 2.24 ms |
| Jora ⚠ eval | 87 ns | 26.4 µs | 1.55 ms | 27.1 µs | 1.53 ms |
| JMESPath Community | 6.26 µs | 73.0 µs | 4.46 ms | 80.4 µs | 4.56 ms |
| Prism (compile, execute) | 184 µs | 131 µs | 10.7 ms | 457 µs | 30.0 ms |
| Prism (evaluate) |  | 132 µs | 11.6 ms | 464 µs | 30.5 ms |
| Prism 0.2.2 (compile, execute) | 2.78 ms | 263 µs | 18.2 ms | 3.22 ms | 39.9 ms |
| Prism 0.2.2 (prismTransform) |  | 4.19 ms | 45.7 ms | 6.81 ms | 49.2 ms |
| mingo (aggregation pipeline) | 3.97 µs | 850 µs | 48.3 ms | 1.08 ms | 55.3 ms |
| GROQ (groq-js) | 16.9 µs | 1.01 ms | 73.5 ms | 1.06 ms | 73.6 ms |
| jq (jq-wasm) |  | 1.92 ms | 105 ms | 1.92 ms | 105 ms |
| JSONata | 80.1 µs | 1.22 ms | 116 ms | 1.39 ms | 120 ms |
| JSON-e |  | 5.17 ms | 256 ms | 5.17 ms | 256 ms |

Not expressible: CEL (@marcbachmann/cel-js), JMESPath (jmespath.js), json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js).

## Start, and many configs in turn

"Import" is loading the library in a new process; "first call" is `project` answered once after that. "In turn" is every one-order task the library can do, prepared once and called one after another, next to the mean of the same tasks each timed alone: above `1×` is what a process running many transforms pays over one running a single transform.

| library | import | first call | in turn, one call | against each alone |
|---|---:|---:|---:|---:|
| CEL (@marcbachmann/cel-js) | 16.2 ms | 2.05 ms | 645 ns | 1.29× |
| GROQ (groq-js) | 20.2 ms | 2.41 ms | 6.01 µs | 1.10× |
| A function written by hand | 0.9 ms | 777 µs | 72 ns | 1.16× |
| JMESPath (jmespath.js) | 7.4 ms | 1.84 ms | 3.27 µs | 1.07× |
| JMESPath Community | 3.7 ms | 1.48 ms | 353 ns | 1.21× |
| Jora ⚠ eval | 26.4 ms | 2.69 ms | 218 ns | 1.24× |
| jq (jq-wasm) | 10.7 ms | 11.2 ms | 628 µs | 1.00× |
| JSON-e | 12.3 ms | 2.33 ms | 25.1 µs | 0.84× |
| json-logic-engine (interpreted) | 4.9 ms | 1.54 ms | 913 ns | 1.06× |
| json-logic-engine (build) ⚠ eval | 4.9 ms | 1.43 ms | 17 ns | 1.30× |
| JsonLogic (json-logic-js) |  |  | 661 ns | 0.78× |
| JSONata | 18.0 ms | 1.79 ms | 8.05 µs | 1.10× |
| JSON Query (JSON format) | 3.8 ms | 1.03 ms | 247 ns | 1.16× |
| JSON Query (text format) | 3.7 ms | 1.49 ms | 248 ns | 1.19× |
| lodash | 22.0 ms | 1.17 ms | 311 ns | 1.15× |
| mingo (aggregation pipeline) | 198.5 ms | 2.08 ms | 8.15 µs | 1.09× |
| Prism (compile, execute) | 90.7 ms | 3.69 ms | 1.63 µs | 1.14× |
| Prism 0.2.2 (compile, execute) | 65.5 ms | 12.5 ms | 3.61 µs | 1.11× |
| Prism 0.2.2 (prismTransform) | 65.9 ms | 14.8 ms | 1.26 ms | 1.36× |
| Prism (evaluate) | 91.0 ms | 3.85 ms | 1.74 µs | 1.17× |

## What each adds to a bundle

One entry that imports what the adapter uses, bundled and minified by esbuild for the browser, with everything it depends on.

| library | minified | gzip | note |
|---|---:|---:|---|
| Prism: evaluate | 497.6 kB | 108.0 kB | checks the config: includes zod |
| Prism: prismTransform | 500.0 kB | 108.7 kB | includes zod |
| Prism: execute only | 496.4 kB | 107.7 kB | runs an IR compiled elsewhere |
| Prism: everything | 505.1 kB | 110.4 kB | includes zod |
| JSONata | 81.1 kB | 25.7 kB |  |
| JsonLogic (json-logic-js) | 5.4 kB | 1.8 kB |  |
| JsonLogic (json-logic-engine) | 36.9 kB | 9.7 kB |  |
| JSON Query | 7.0 kB | 3.0 kB |  |
| JSON Query, JSON form only | 7.0 kB | 3.0 kB |  |
| mingo | 82.9 kB | 29.6 kB | the default entry, every operator |
| JMESPath (jmespath) | 22.0 kB | 6.2 kB |  |
| JMESPath (community) | 32.4 kB | 9.3 kB |  |
| json-e | 25.4 kB | 8.6 kB |  |
| GROQ (groq-js) | 60.5 kB | 16.4 kB |  |
| CEL (@marcbachmann/cel-js) | 83.4 kB | 24.4 kB |  |
| jora | 54.4 kB | 19.4 kB |  |
| lodash | 72.1 kB | 26.2 kB | the whole of lodash, as `import _ from "lodash"` brings it |
