# Prism against the libraries it is compared with — node-24

Run 2026-10-08 on 13th Gen Intel(R) Core(TM) i9-13900K (32 threads, 64 GB), Windows_NT 10.0.26200 x64, Node v24.13.1 (V8 13.6.233.17-node.40). 2 passes; every case in a process of its own; each figure is the median over passes of that process's median for one call.

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
| A function written by hand | 11 | 0.02× | 0.02× | 0.04× | 0.00× |
| json-logic-engine (build) ⚠ eval | 6 | 0.03× | 0.05× | 0.05× | 0.92× |
| lodash | 11 | 0.06× | 0.21× | 0.20× | 0.00× |
| Jora ⚠ eval | 10 | 0.29× | 0.32× | 0.30× | 0.02× |
| JSON Query (text format) | 9 | 0.46× | 0.28× | 0.27× | 2.72× |
| JSON Query (JSON format) | 9 | 0.47× | 0.29× | 0.28× | 1.14× |
| JMESPath Community | 10 | 0.52× | 0.56× | 0.54× | 0.29× |
| CEL (@marcbachmann/cel-js) | 7 | 0.56× |  |  | 0.42× |
| Prism (compile, execute) | 11 | 1.00× | 1.00× | 1.00× | 1.00× |
| Prism (evaluate) | 11 | 1.01× | 1.03× | 0.99× | 1.02× |
| json-logic-engine (interpreted) | 6 | 1.38× | 0.76× | 0.68× | 0.15× |
| Prism 0.2.2 (compile, execute) | 11 | 3.34× | 2.47× | 2.10× | 79.9× |
| JsonLogic (json-logic-js) | 1 | 4.37× |  |  | 0.06× |
| JMESPath (jmespath.js) | 6 | 6.78× | 0.92× | 0.78× | 0.29× |
| GROQ (groq-js) | 10 | 6.97× | 10.5× | 10.1× | 1.13× |
| mingo (aggregation pipeline) | 11 | 8.41× | 4.63× | 3.87× | 1.78× |
| JSONata | 11 | 10.4× | 10.2× | 12.1× | 4.12× |
| JSON-e | 10 | 57.8× | 69.3× | 48.0× | 2.81× |
| jq (jq-wasm) | 11 | 923× | 34.9× | 23.2× | 58.0× |
| Prism 0.2.2 (prismTransform) | 11 | 1093× | 38.3× | 6.85× | 171× |

## One order

### `project` — Pick and rename fields
Four fields out of one order, two of them from nested objects, under new names.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| json-logic-engine (build) ⚠ eval | 4.49 µs | 5.7 ns | 4.60 µs |
| A function written by hand |  |  | 5.8 ns |
| Jora ⚠ eval | 15 ns | 123 ns | 137 ns |
| JMESPath Community | 782 ns | 126 ns | 1.28 µs |
| JSON Query (text format) | 10.00 µs | 127 ns | 10.3 µs |
| JSON Query (JSON format) | 2.94 µs | 129 ns | 3.81 µs |
| CEL (@marcbachmann/cel-js) | 816 ns | 170 ns | 1.79 µs |
| lodash |  |  | 233 ns |
| Prism (compile, execute) | 40.0 µs | 240 ns | 3.43 µs |
| Prism (evaluate) |  | 242 ns | 3.64 µs |
| json-logic-engine (interpreted) |  | 473 ns | 782 ns |
| Prism 0.2.2 (compile, execute) | 342 µs | 1.33 µs | 277 µs |
| JMESPath (jmespath.js) |  |  | 1.58 µs |
| GROQ (groq-js) | 3.78 µs | 2.42 µs | 7.04 µs |
| mingo (aggregation pipeline) | 3.74 µs | 3.21 µs | 14.8 µs |
| JSONata | 23.3 µs | 4.75 µs | 30.8 µs |
| JSON-e |  |  | 16.0 µs |
| Prism 0.2.2 (prismTransform) |  | 240 µs | 581 µs |
| jq (jq-wasm) |  |  | 568 µs |

Not expressible: JsonLogic (json-logic-js).

### `reshape` — Reshape into a nested object
A new nested shape, with the order lines mapped to { sku, qty }.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| json-logic-engine (build) ⚠ eval | 12.3 µs | 25 ns | 12.7 µs |
| A function written by hand |  |  | 26 ns |
| Jora ⚠ eval | 14 ns | 320 ns | 326 ns |
| JSON Query (text format) | 23.9 µs | 323 ns | 25.0 µs |
| JMESPath Community | 2.20 µs | 325 ns | 3.22 µs |
| JSON Query (JSON format) | 8.03 µs | 333 ns | 10.3 µs |
| CEL (@marcbachmann/cel-js) | 3.07 µs | 949 ns | 7.13 µs |
| lodash |  |  | 1.13 µs |
| Prism (compile, execute) | 64.3 µs | 1.33 µs | 14.2 µs |
| Prism (evaluate) |  | 1.36 µs | 13.9 µs |
| json-logic-engine (interpreted) |  | 1.79 µs | 8.44 µs |
| JMESPath (jmespath.js) |  |  | 3.44 µs |
| Prism 0.2.2 (compile, execute) | 1.48 ms | 7.62 µs | 1.48 ms |
| GROQ (groq-js) | 7.44 µs | 9.50 µs | 18.0 µs |
| mingo (aggregation pipeline) | 3.72 µs | 10.1 µs | 25.8 µs |
| JSONata | 33.2 µs | 14.0 µs | 50.1 µs |
| JSON-e |  |  | 36.8 µs |
| jq (jq-wasm) |  |  | 562 µs |
| Prism 0.2.2 (prismTransform) |  | 1.25 ms | 3.39 ms |

Not expressible: JsonLogic (json-logic-js).

### `strings` — Build strings
An interpolated string, a joined list, an upper-cased field.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| A function written by hand |  |  | 63 ns |
| lodash |  |  | 92 ns |
| Jora ⚠ eval | 61 ns | 344 ns | 405 ns |
| CEL (@marcbachmann/cel-js) | 1.93 µs | 529 ns | 5.19 µs |
| JMESPath Community | 2.51 µs | 642 ns | 3.61 µs |
| Prism (evaluate) |  | 1.04 µs | 10.6 µs |
| Prism (compile, execute) | 60.6 µs | 1.07 µs | 11.1 µs |
| Prism 0.2.2 (compile, execute) | 1.16 ms | 3.21 µs | 1.09 ms |
| JSONata | 33.6 µs | 7.32 µs | 43.6 µs |
| GROQ (groq-js) | 6.24 µs | 7.60 µs | 14.5 µs |
| mingo (aggregation pipeline) | 3.75 µs | 8.46 µs | 22.0 µs |
| JSON-e |  |  | 42.5 µs |
| jq (jq-wasm) |  |  | 655 µs |
| Prism 0.2.2 (prismTransform) |  | 933 µs | 2.11 ms |

Not expressible: JMESPath (jmespath.js), json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js), JSON Query (JSON format), JSON Query (text format).

### `conditional` — Choose by condition
A three-way choice on one field and a nested choice on two.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| lodash |  |  | 5.1 ns |
| A function written by hand |  |  | 5.2 ns |
| json-logic-engine (build) ⚠ eval | 12.1 µs | 18 ns | 12.6 µs |
| Jora ⚠ eval | 14 ns | 125 ns | 146 ns |
| JSON Query (text format) | 49.5 µs | 232 ns | 48.4 µs |
| JSON Query (JSON format) | 18.8 µs | 240 ns | 20.7 µs |
| JMESPath Community | 4.70 µs | 306 ns | 5.45 µs |
| CEL (@marcbachmann/cel-js) | 2.20 µs | 387 ns | 5.12 µs |
| Prism (compile, execute) | 75.5 µs | 476 ns | 17.0 µs |
| Prism (evaluate) |  | 492 ns | 17.3 µs |
| json-logic-engine (interpreted) |  | 626 ns | 1.42 µs |
| Prism 0.2.2 (compile, execute) | 1.49 ms | 2.02 µs | 1.36 ms |
| GROQ (groq-js) | 8.21 µs | 3.38 µs | 12.5 µs |
| JMESPath (jmespath.js) |  |  | 4.87 µs |
| mingo (aggregation pipeline) | 3.85 µs | 5.51 µs | 17.9 µs |
| JSONata | 39.3 µs | 6.89 µs | 47.7 µs |
| JSON-e |  |  | 19.3 µs |
| jq (jq-wasm) |  |  | 594 µs |
| Prism 0.2.2 (prismTransform) |  | 1.17 ms | 3.40 ms |

Not expressible: JsonLogic (json-logic-js).

### `defaults` — Fill in what is missing
A missing key and a null each fall back to a default; two constants are added.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| A function written by hand |  |  | 6.2 ns |
| json-logic-engine (build) ⚠ eval | 5.10 µs | 6.3 ns | 4.94 µs |
| lodash |  |  | 6.5 ns |
| Jora ⚠ eval | 15 ns | 36 ns | 53 ns |
| JSON Query (JSON format) | 8.91 µs | 108 ns | 10.2 µs |
| JSON Query (text format) | 25.8 µs | 109 ns | 26.1 µs |
| JMESPath Community | 1.51 µs | 201 ns | 2.05 µs |
| CEL (@marcbachmann/cel-js) | 2.02 µs | 253 ns | 4.22 µs |
| Prism (compile, execute) | 47.9 µs | 320 ns | 6.12 µs |
| Prism (evaluate) |  | 321 ns | 6.17 µs |
| json-logic-engine (interpreted) |  | 676 ns | 1.00 µs |
| Prism 0.2.2 (compile, execute) | 515 µs | 1.47 µs | 446 µs |
| GROQ (groq-js) | 4.15 µs | 1.67 µs | 6.35 µs |
| JMESPath (jmespath.js) |  |  | 1.90 µs |
| mingo (aggregation pipeline) | 3.72 µs | 4.68 µs | 17.1 µs |
| JSONata | 26.5 µs | 5.37 µs | 34.1 µs |
| JSON-e |  |  | 17.4 µs |
| Prism 0.2.2 (prismTransform) |  | 387 µs | 909 µs |
| jq (jq-wasm) |  |  | 582 µs |

Not expressible: JsonLogic (json-logic-js).

### `dates` — Format a date and count days
The order's day as YYYY-MM-DD (UTC), and the whole days from then to a fixed moment, 2026-10-01T00:00:00Z.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| lodash |  |  | 190 ns |
| A function written by hand |  |  | 194 ns |
| CEL (@marcbachmann/cel-js) | 2.68 µs | 861 ns | 6.18 µs |
| Prism (compile, execute) | 52.0 µs | 5.01 µs | 17.3 µs |
| Prism (evaluate) |  | 5.04 µs | 19.3 µs |
| GROQ (groq-js) | 8.10 µs | 5.17 µs | 13.9 µs |
| mingo (aggregation pipeline) | 3.74 µs | 5.87 µs | 18.8 µs |
| Prism 0.2.2 (compile, execute) | 886 µs | 6.03 µs | 854 µs |
| JSONata | 34.4 µs | 9.34 µs | 48.3 µs |
| jq (jq-wasm) |  |  | 614 µs |
| Prism 0.2.2 (prismTransform) |  | 707 µs | 1.92 ms |

Not expressible: JMESPath (jmespath.js), JMESPath Community, Jora, JSON-e, json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js), JSON Query (JSON format), JSON Query (text format).

### `rule` — Answer a yes/no rule
Paid, and gold or shipping of at least 1000, and some line with a quantity of 3 or more. The answer is a boolean.

| library | prepare | run prepared | one shot |
|---|---:|---:|---:|
| A function written by hand |  |  | 0.5 ns |
| lodash |  |  | 0.5 ns |
| json-logic-engine (build) ⚠ eval | 11.0 µs | 11 ns | 11.2 µs |
| Jora ⚠ eval | 31 ns | 86 ns | 122 ns |
| JMESPath Community | 2.13 µs | 110 ns | 2.50 µs |
| CEL (@marcbachmann/cel-js) | 1.55 µs | 113 ns | 2.87 µs |
| json-logic-engine (interpreted) |  | 120 ns | 505 ns |
| Prism (compile, execute) | 58.8 µs | 176 ns | 12.2 µs |
| Prism (evaluate) |  | 176 ns | 12.0 µs |
| JSON Query (JSON format) | 13.1 µs | 178 ns | 14.4 µs |
| JSON Query (text format) | 27.1 µs | 179 ns | 28.3 µs |
| Prism 0.2.2 (compile, execute) | 1.15 ms | 364 ns | 1.07 ms |
| JsonLogic (json-logic-js) |  |  | 767 ns |
| JMESPath (jmespath.js) |  |  | 2.44 µs |
| mingo (aggregation pipeline) | 3.83 µs | 3.28 µs | 13.9 µs |
| JSONata | 41.4 µs | 3.62 µs | 45.8 µs |
| GROQ (groq-js) | 5.10 µs | 7.22 µs | 13.4 µs |
| JSON-e |  |  | 40.6 µs |
| jq (jq-wasm) |  |  | 591 µs |
| Prism 0.2.2 (prismTransform) |  | 952 µs | 2.08 ms |

## Many orders

### `totals` — Map with a computed field
For every order: its id, its total (each line's qty × unitCents, plus shipping) and how many units it holds.

| library | prepare | repeated call, 100 | repeated call, 10,000 | one shot, 100 | one shot, 10,000 |
|---|---:|---:|---:|---:|---:|
| A function written by hand |  | 793 ns | 176 µs | 793 ns | 176 µs |
| lodash |  | 5.32 µs | 598 µs | 5.32 µs | 598 µs |
| json-logic-engine (build) ⚠ eval | 16.7 µs | 6.17 µs | 717 µs | 32.7 µs | 1.27 ms |
| JSON Query (text format) | 28.9 µs | 26.0 µs | 2.53 ms | 55.4 µs | 2.51 ms |
| JSON Query (JSON format) | 12.7 µs | 25.9 µs | 2.55 ms | 59.0 µs | 3.41 ms |
| Jora ⚠ eval | 32 ns | 29.3 µs | 3.07 ms | 28.2 µs | 3.01 ms |
| JMESPath Community | 1.47 µs | 53.3 µs | 5.88 ms | 55.5 µs | 5.91 ms |
| json-logic-engine (interpreted) |  | 87.5 µs | 8.92 ms | 109 µs | 9.83 ms |
| Prism (evaluate) |  | 121 µs | 12.8 ms | 474 µs | 42.0 ms |
| Prism (compile, execute) | 83.5 µs | 115 µs | 13.1 ms | 463 µs | 41.0 ms |
| Prism 0.2.2 (compile, execute) | 1.50 ms | 290 µs | 31.6 ms | 2.03 ms | 65.6 ms |
| mingo (aggregation pipeline) | 3.72 µs | 544 µs | 51.9 ms | 734 µs | 54.6 ms |
| Prism 0.2.2 (prismTransform) |  | 1.58 ms | 64.3 ms | 3.44 ms | 71.2 ms |
| JSONata | 39.5 µs | 946 µs | 96.2 ms | 1.03 ms | 96.4 ms |
| jq (jq-wasm) |  | 1.71 ms | 118 ms | 1.71 ms | 118 ms |
| GROQ (groq-js) | 6.41 µs | 1.34 ms | 137 ms | 1.41 ms | 137 ms |
| JSON-e |  | 5.63 ms | 434 ms | 5.63 ms | 434 ms |

Not expressible: CEL (@marcbachmann/cel-js), JMESPath (jmespath.js), JsonLogic (json-logic-js).

### `top` — Filter, sort, take
Paid orders of gold customers, newest first by placedAt (unique, ISO, so string order is time order), the first ten, as { id, placedAt }.

| library | prepare | repeated call, 100 | repeated call, 10,000 | one shot, 100 | one shot, 10,000 |
|---|---:|---:|---:|---:|---:|
| A function written by hand |  | 209 ns | 104 µs | 209 ns | 104 µs |
| Jora ⚠ eval | 32 ns | 5.38 µs | 520 µs | 5.41 µs | 532 µs |
| JSON Query (text format) | 25.2 µs | 5.80 µs | 631 µs | 33.3 µs | 852 µs |
| JSON Query (JSON format) | 9.36 µs | 6.43 µs | 673 µs | 22.1 µs | 1.04 ms |
| JMESPath (jmespath.js) |  | 12.0 µs | 929 µs | 12.0 µs | 929 µs |
| JMESPath Community | 1.84 µs | 9.61 µs | 1.01 ms | 11.9 µs | 1.04 ms |
| Prism (compile, execute) | 82.0 µs | 13.1 µs | 1.19 ms | 170 µs | 14.8 ms |
| Prism (evaluate) |  | 13.6 µs | 1.25 ms | 167 µs | 14.5 ms |
| lodash |  | 17.8 µs | 1.39 ms | 17.8 µs | 1.39 ms |
| mingo (aggregation pipeline) | 3.71 µs | 28.3 µs | 2.17 ms | 55.7 µs | 2.82 ms |
| Prism 0.2.2 (compile, execute) | 1.29 ms | 44.6 µs | 3.62 ms | 1.35 ms | 17.2 ms |
| GROQ (groq-js) | 5.45 µs | 166 µs | 17.3 ms | 184 µs | 17.2 ms |
| Prism 0.2.2 (prismTransform) |  | 1.08 ms | 20.9 ms | 2.40 ms | 22.3 ms |
| JSONata | 47.6 µs | 185 µs | 21.5 ms | 257 µs | 22.3 ms |
| JSON-e |  | 1.08 ms | 73.5 ms | 1.08 ms | 73.5 ms |
| jq (jq-wasm) |  | 1.27 ms | 73.6 ms | 1.27 ms | 73.6 ms |

Not expressible: CEL (@marcbachmann/cel-js), json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js).

### `groups` — Group and aggregate
By the customer's country: how many orders, and the sum of their shipping. An object keyed by country.

| library | prepare | repeated call, 100 | repeated call, 10,000 | one shot, 100 | one shot, 10,000 |
|---|---:|---:|---:|---:|---:|
| A function written by hand |  | 757 ns | 142 µs | 757 ns | 142 µs |
| JSON Query (JSON format) | 7.18 µs | 7.14 µs | 779 µs | 21.0 µs | 1.10 ms |
| JSON Query (text format) | 19.3 µs | 7.20 µs | 782 µs | 26.1 µs | 845 µs |
| lodash |  | 9.37 µs | 982 µs | 9.37 µs | 982 µs |
| JMESPath Community | 1.76 µs | 12.3 µs | 1.00 ms | 14.3 µs | 1.01 ms |
| Jora ⚠ eval | 93 ns | 10.4 µs | 1.12 ms | 10.8 µs | 1.15 ms |
| Prism (evaluate) |  | 22.4 µs | 1.90 ms | 97.4 µs | 6.05 ms |
| Prism (compile, execute) | 84.6 µs | 22.4 µs | 1.96 ms | 93.9 µs | 6.00 ms |
| Prism 0.2.2 (compile, execute) | 1.87 ms | 50.9 µs | 3.32 ms | 1.95 ms | 10.9 ms |
| Prism 0.2.2 (prismTransform) |  | 1.71 ms | 12.9 ms | 3.87 ms | 16.7 ms |
| mingo (aggregation pipeline) | 3.84 µs | 176 µs | 16.5 ms | 228 µs | 17.4 ms |
| JSONata | 29.7 µs | 217 µs | 30.8 ms | 274 µs | 31.8 ms |
| jq (jq-wasm) |  | 1.48 ms | 102 ms | 1.48 ms | 102 ms |
| JSON-e |  | 3.19 ms | 241 ms | 3.19 ms | 241 ms |

Not expressible: CEL (@marcbachmann/cel-js), GROQ (groq-js), JMESPath (jmespath.js), json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js).

### `screen` — An API answer into a screen model
The paid orders: how many, their revenue, and the twenty newest as rows of { id, buyer, city, totalCents, skus }.

| library | prepare | repeated call, 100 | repeated call, 10,000 | one shot, 100 | one shot, 10,000 |
|---|---:|---:|---:|---:|---:|
| A function written by hand |  | 2.32 µs | 292 µs | 2.32 µs | 292 µs |
| lodash |  | 8.45 µs | 608 µs | 8.45 µs | 608 µs |
| JSON Query (JSON format) | 29.3 µs | 22.8 µs | 1.37 ms | 74.4 µs | 1.98 ms |
| JSON Query (text format) | 69.7 µs | 22.5 µs | 1.39 ms | 100.0 µs | 1.53 ms |
| Jora ⚠ eval | 90 ns | 24.9 µs | 1.50 ms | 25.7 µs | 1.50 ms |
| JMESPath Community | 6.17 µs | 63.8 µs | 4.40 ms | 73.9 µs | 4.59 ms |
| Prism (evaluate) |  | 124 µs | 9.93 ms | 488 µs | 28.4 ms |
| Prism (compile, execute) | 176 µs | 119 µs | 10.4 ms | 504 µs | 27.9 ms |
| Prism 0.2.2 (compile, execute) | 3.31 ms | 227 µs | 16.1 ms | 3.58 ms | 35.6 ms |
| mingo (aggregation pipeline) | 3.88 µs | 679 µs | 38.5 ms | 1.05 ms | 38.6 ms |
| Prism 0.2.2 (prismTransform) |  | 2.96 ms | 40.2 ms | 6.28 ms | 42.5 ms |
| GROQ (groq-js) | 16.3 µs | 940 µs | 70.9 ms | 981 µs | 73.2 ms |
| jq (jq-wasm) |  | 1.86 ms | 105 ms | 1.86 ms | 105 ms |
| JSONata | 67.9 µs | 1.16 ms | 108 ms | 1.38 ms | 109 ms |
| JSON-e |  | 4.74 ms | 219 ms | 4.74 ms | 219 ms |

Not expressible: CEL (@marcbachmann/cel-js), JMESPath (jmespath.js), json-logic-engine (interpreted), json-logic-engine (build), JsonLogic (json-logic-js).

## Start, and many configs in turn

"Import" is loading the library in a new process; "first call" is `project` answered once after that. "In turn" is every one-order task the library can do, prepared once and called one after another, next to the mean of the same tasks each timed alone: above `1×` is what a process running many transforms pays over one running a single transform.

| library | import | first call | in turn, one call | against each alone |
|---|---:|---:|---:|---:|
| CEL (@marcbachmann/cel-js) | 14.3 ms | 1.73 ms | 617 ns | 1.32× |
| GROQ (groq-js) | 18.5 ms | 2.00 ms | 5.74 µs | 1.09× |
| A function written by hand | 0.7 ms | 703 µs | 52 ns | 1.22× |
| JMESPath (jmespath.js) | 6.2 ms | 1.83 ms | 3.05 µs | 1.07× |
| JMESPath Community | 3.4 ms | 1.27 ms | 347 ns | 1.22× |
| Jora ⚠ eval | 26.4 ms | 2.18 ms | 215 ns | 1.25× |
| jq (jq-wasm) | 9.8 ms | 11.8 ms | 626 µs | 1.05× |
| JSON-e | 9.5 ms | 1.85 ms | 22.1 µs | 0.77× |
| json-logic-engine (interpreted) | 4.4 ms | 1.25 ms | 783 ns | 1.06× |
| json-logic-engine (build) ⚠ eval | 4.5 ms | 1.20 ms | 16 ns | 1.20× |
| JsonLogic (json-logic-js) |  |  | 637 ns | 0.83× |
| JSONata | 16.0 ms | 1.74 ms | 8.35 µs | 1.14× |
| JSON Query (JSON format) | 3.2 ms | 870 µs | 245 ns | 1.24× |
| JSON Query (text format) | 3.2 ms | 1.24 ms | 230 ns | 1.19× |
| lodash | 19.9 ms | 1.24 ms | 272 ns | 1.15× |
| mingo (aggregation pipeline) | 125.6 ms | 1.79 ms | 6.40 µs | 1.09× |
| Prism (compile, execute) | 94.1 ms | 3.18 ms | 1.47 µs | 1.20× |
| Prism 0.2.2 (compile, execute) | 70.7 ms | 11.2 ms | 3.42 µs | 1.09× |
| Prism 0.2.2 (prismTransform) | 70.3 ms | 12.3 ms | 852 µs | 1.06× |
| Prism (evaluate) | 94.0 ms | 3.15 ms | 1.41 µs | 1.13× |

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
