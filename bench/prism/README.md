# Prism against the libraries it is compared with

One set of tasks, one answer for each, every library held to that answer before it is timed. This folder stands
alone: it is not in the pnpm workspace, it installs with `npm install`, and none of what it depends on reaches
`@niscorp/prism`.

```bash
npm install
npm run check        # every library against every task's answer
npm run bench        # the timed runs, one process for each case; writes results/
npm run report       # results/ as tables
npm run sizes        # what each library adds to a bundle
```

## What is fixed

| file | holds |
|---|---|
| `data.mjs` | The data: orders of a small shop, made from a seed. The same bytes for every library and every run. |
| `tasks.mjs` | The eleven tasks. Each is an input and a plain function; what the function returns **is** the answer. |
| `harness/check.mjs` | Holds a library to the answers. Nothing is timed for a library that fails a task it claims. |
| `libs/<id>.mjs` | One library, or one way of running it: each task written in that library. One file is one row of the results. |

The tasks:

| id | input | what it asks |
|---|---|---|
| `project` | one order | four fields, two from nested objects, renamed |
| `reshape` | one order | a new nested shape, the lines mapped to `{ sku, qty }` |
| `strings` | one order | an interpolated string, a joined list, an upper-cased field |
| `conditional` | one order | a three-way choice, and a nested choice on two fields |
| `defaults` | one order | a missing key and a `null` each fall back to a default; two constants |
| `dates` | one order + `now` | the day as `YYYY-MM-DD` (UTC), and whole days until `now` |
| `rule` | one order | a boolean: an `and`, an `or`, and "some line has qty ≥ 3" |
| `totals` | `{ orders, now }` | for every order its id, its total and its units |
| `top` | `{ orders, now }` | filter on two fields, sort newest first, take ten, project |
| `groups` | `{ orders, now }` | by country: a count and a sum, as an object keyed by country |
| `screen` | `{ orders, now }` | a count, a sum, and the twenty newest paid orders as rows |

One-order tasks run at one size. The others run over 100 and over 10,000 orders. `tasks.mjs` has the exact
functions; where these words and a function differ, the function is right.

## An adapter

`libs/<id>.mjs` default-exports:

```js
export default {
  id: 'jsonata',                 // the file's name
  name: 'JSONata',               // as the tables print it
  package: 'jsonata',            // the npm name; null for no package
  transform: 'string',           // 'string' (an expression that is parsed), 'json' (the transform is JSON data) or 'code'
  usesEval: false,               // true if this row runs through eval or new Function
  prepared: true,                // false if the library has no form that is parsed or compiled once and run many times
  notes: 'one or two sentences a reader of the tables needs',

  // The three calls, for every task unless a task gives its own.
  prepare: (source) => jsonata(source),                       // parse or compile once
  run: (prepared, input) => prepared.evaluate(input),         // run what prepare made
  oneShot: (source, input) => jsonata(source).evaluate(input), // from the stored form to an answer, in one go

  tasks: {
    project: { source: '{ "id": id, "name": customer.name, … }' },
    dates: { notExpressible: 'why, in one sentence' },
    totals: { source: '…', run: (prepared, input) => …, glue: 'what the task-specific run does and why' },
  },
};
```

- **`source`** is what an author would write and a host would store: a string, or JSON. It is printed beside the
  results, so it is the expression as someone fluent in the library writes it: the library's own operator for the
  job where it has one, not a clever encoding, and not the shortest possible either.
- **`prepare`**, **`run`** and **`oneShot`** may return a promise. A library that is asynchronous is measured as it
  is. Where the library has no prepared form, `prepared: false`, `prepare` returns its source, and `run` does what
  `oneShot` does.
- **`run` is the library's call and nothing else.** Glue is allowed only for what the library's own shape forces:
  wrapping a single document in a list for a library that takes collections, unwrapping the one result, converting
  a value the library hands back in its own type. That glue is inside `run` and `oneShot`, so it is timed, and it is
  named in `glue`. A registered custom function, a JavaScript callback or a post-processing step that does part of
  the task is not glue: that task is `notExpressible`.
- A row that keeps the stored form itself between calls (its `prepare` hands the source back, and the library
  recognises the same object again) sets `prepareTimed: false`: it has no prepare to time.
- **`notExpressible`** is a plain result, not a failure. Say what is missing in one sentence.
- The harness hands `prepare` and `oneShot` a copy of `source` on each call (a fresh object for JSON; for a string,
  the same characters). An adapter keeps nothing between calls: no cache of its own in the module.
- The input is deep-frozen during the check and must come back as it was. The answer must equal the reference
  after one JSON round trip (`JSON.parse(JSON.stringify(answer))`), key order aside. An empty list of orders is one
  of the inputs: a sum over nothing is `0`, a group over nothing is `{}`.

`*.shared.mjs` in `libs/` is not an adapter: it is for what several rows of one library share.

## Rules of the comparison

1. Exact versions, pinned in `package.json`. Node version, CPU and date are written into the results.
2. Each library at its defaults. A limit that is off by default stays off, and the tables say which libraries
   have limits on.
3. Three things are timed apart, because they are different costs: **prepare** (parse, compile, check),
   **run** (the prepared form over an input), **one shot** (stored form to answer). A row is never compared
   across them.
4. Every case runs in a process of its own, in a shuffled order.
5. A library that cannot do a task has "not expressible" in that cell. Nothing is substituted.
6. A row that runs through `eval` or `new Function` says so.
