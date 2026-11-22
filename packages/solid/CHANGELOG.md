# @niscorp/solid

## 0.2.0

### Minor Changes

- 4f89d7d: BREAKING — approved by moccadroid (owner), 2026-11-22: a strict stream given a non-string for a string-format field (`z.email()`, `z.url()`, `z.uuid()`, `z.iso.*`) now fails, where it resolved; nothing else unless an app relied on what is inside a field that takes any value being dropped.

  What is inside a field whose schema takes any value is now kept, as DESIGN and README say. In `recover` and `strict`, everything below `z.any()`, `z.unknown()` or an intersection was refused as `<unknown path>`: `x: z.any()` given `{"x":{"b":[1,2]}}` ended `{ x: {} }` with an error. The fields of a `z.lazy()` or a pipe are now checked against the schema it stands for (the lazy's schema, the pipe's input side), so a recursive schema keeps every level instead of nothing.

  A string-format field (`z.email()`, `z.url()`, `z.uuid()`, `z.iso.*`) is now kind-checked as a string, as `z.string()` is: `{"to":[1]}` for `to: z.email()` was taken in as a list. In `recover` such a value is skipped with an error; in `strict` it fails the stream.

- d951434: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on solid reading `Infinity`, hex (`0x1F`), a leading `+` or a leading `.` as numbers.

  Only JSON numbers are read. `{"a":Infinity,"b":0x1F,"c":+5,"d":.5}` put `Infinity`, 1, 5 and 0.5 into `current()`; such text is now dropped, with no error, and each field keeps what it had. Valid JSON reads as before at every chunk boundary: `{"price":19.` then `99}` still shows 0, 19, 19.99.

- b210b56: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on a selection's `final()` resolving with the frozen value after a strict failure, or on a root key `""` ending the stream at its object's close.

  A stream now ends once:
  - After a strict failure, a selection's `final()` that had not resolved rejects with `[solid] stream failed validation`, as the root's does: `select('items').final()` awaited before the failure never settled, and `select('count').final()` asked after it resolved with the starting value. A selection that resolved before the failure keeps its value.
  - A `final()` that resolved keeps its value: text after the root that fails a strict stream no longer makes a later `final()` reject.
  - A root key `""` whose value is an object no longer ends the stream at that object's `}`: `{"":{"x":1},"b":2}` resolves `final()` at the last `}`, with `b` in it, and a key beside it finalizes with its value.

- c5aea8b: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on `createStream` throwing for such a schema, or on a cortex agent with such a data schema emitting no `output-partial` events.

  `createStream` without `initial` no longer throws for a schema whose derived starting value only fails a constraint: `.min(1)`, `.positive()`, `array().min(1)`, an email, url or uuid format, a `z.record` or a `z.lazy`. The derived value is used when every value in it is of a kind (and, for a literal or enum, a value) the schema takes at its place; no constraint is asked of it. A `strict` stream started so checks the value `final()` would resolve with against the whole schema and fails when the schema refuses it: `{"t":""}` for `.min(1)`, `{"n":-1}` or a reply that leaves the starting `0` for `.positive()` reject `final()`, where construction threw before. Constraints (`.min(1)`, `.positive()`, a format, `.refine`) are checked in two places only. With `constraints: 'finalize'`, each field when it finishes. And in `strict` mode with no `initial`, when the derived starting value fails the schema: the value `final()` would resolve with (at the root's close or on `close()`) is checked whole, and one the schema refuses fails the stream. Otherwise they are not checked, and in `recover` mode `final()` can resolve with a value the schema refuses (`{"t":""}` for `t: z.string().min(1)`); under `constraints: 'finalize'` such a value is reported with `onError`, and it stays. A starting value that is no object or list (`z.any()`, a `.nullable()` object) no longer makes `write('{…')` throw a `TypeError`: the reply's root is kind-checked and becomes the value.

  Through cortex, which makes its partial-output stream without `initial`, an agent whose data schema has such a field or is recursive now emits `output-partial` events, where it emitted none.

- 9899bd7: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on a union field's value being dropped, or a strict stream failing, when the value is of a kind only a later variant takes.

  A field of a union (discriminated or not) is now kind-checked against every variant that has it, and passes the finalize check when any of them accepts its value. Before, only the first variant counted: with `w: z.discriminatedUnion('kind', [{ kind: 'text', value: z.string() }, { kind: 'count', value: z.number() }])`, `{"w":{"kind":"count","value":5}}` lost the 5 in `recover` and failed a valid reply in `strict`. A field typed alike in every variant behaves as before.

  So that a field cannot take one variant's kind under another variant's discriminator, an object or list a union decides is checked when it closes: it must fit one variant by the kinds of its fields and the values of its literal and enum fields. `{"w":{"kind":"text","value":5}}`, or `{"a":1,"b":"x"}` against the union of `{ a: string, b: string }` and `{ a: number, c: number }`, fails a strict stream, as it did, and in `recover` is reported with `onError` (`expected: 'a variant of the union'`) while the value stays in `current()`; before, `recover` dropped the field's value silently.

### Patch Changes

- f61ffdd: A key with a dot in it (`{"files":{"index.ts":…}}`) is kept and checked against the schema; before, it was dropped with an "expected <unknown path>" error, and strict mode failed the stream.

  A listener that throws no longer cuts `write()` or `close()` short: the chunk is still parsed, every other listener and selection still hears of the change, and the call then throws that listener's error. Before, the rest of the chunk was lost and the stream could stop telling new listeners of changes.

- 88f93c0: A long reply no longer slows a stream down as it grows: a new key or a closing bracket now finalizes only the direct children of its container, where before it walked every container seen so far. 2,000 streamed rows took tens of seconds and now take tens of milliseconds, with the same events, values and order. DESIGN's "O(events)" for finalization is now true.

  A write into a long list copies the list once and rebuilds only the elements it changed: 20,000 streamed numbers take about half the time.

  README and DESIGN say that a number is shown as read so far, as a string is: `{"price":19` then `99}` shows 19, then 1999.

  README and DESIGN say that a selection's `write()` and `close()` do nothing: the root is fed.

## 0.1.3

### Patch Changes

- a2d2df0: The README and DESIGN.md state the speed-up their own table shows (about 3x at 10 KB, growing with size) instead of 44x, and `current()` is described as kind-checked rather than always valid.

  **What to change:** nothing. Documentation only.

## 0.1.2

### Patch Changes

- 5923e38: `destroy()` no longer raises an unhandled rejection when nobody holds `final()`.

  A stream's `final()` promise exists from the start, and `destroy()` rejects it. A stream read through `on` / `onFinal` / `onError` alone never takes that promise, so nothing could catch the rejection: in Node the process ended with `Error: [solid] stream destroyed`, exit code 1, and a browser logged an uncaught error. Every selection made with `select()` rejected a promise of its own the same way.

  Both rejections are now caught where they are raised, as a strict failure's already was. A caller that holds `final()` — taken before or after `destroy()` — still sees it reject with `[solid] stream destroyed`.

  **What to change:** nothing. A `stream.final().catch(() => {})` written only to keep `destroy()` quiet can go.

- 2815107: README and DESIGN say what `current()` holds. Outside `trust` mode, and where the schema states a value's JSON kind, a value of another kind is not written into it. An object the reply creates (a list row, an object where the initial value has `null` or nothing, a record entry) starts empty and fills in key by key, so it can lack required keys until it closes, with no error. `constraints: 'finalize'` reports a violation and leaves the value in place; in `strict` the stream fails with that value in it. What is written should be the JSON alone: a code fence around it is ignored, a `"`, a bracket or a brace in text before it is not. No code changed.

  **What to change:** nothing.

- 885bc1e: README says what a rejected list element leaves behind. "Keep the prior valid one" holds where the list held a value at that position. Where it held nothing there, a rejected element that is followed by an accepted one leaves `undefined` at its position: `{"seats":["C4",5,"C6"]}` against `z.array(z.string())` with an empty initial list gives `['C4', undefined, 'C6']`, which the schema itself refuses. `onError` names the position, and `constraints: 'finalize'` reports the list again when it closes. A rejected element in last place leaves the list one short. Two tests now hold this. No code changed.

  **What to change:** nothing. Code that maps over a streamed list in `recover` mode can meet `undefined` in it after an `onError` for that list.

- f9f1b26: `select(path).onFinal(listener)` added after the reply has ended is called, at once.

  A selection learns that the reply ended from the root, once. A selection first made after that — `stream.select('widget')` called for the first time when the closing `}` had arrived, or after `close()` — was never told, so a listener given to its `onFinal` was never called: not at once, not after `close()`, not after a later write. Its `final()` did resolve, and the root's own `onFinal` was called at once in the same position.

  Such a listener is now called at once with the part's value, as the root's is, and once.

  Everything else is as it was. A listener added while the reply is still arriving is called when its part finishes — or, if the part had already finished when the selection was first made, by the next write, as before. One added from inside a root `onFinal` listener is called after it, as before.

  **What to change:** nothing, with one thing to know. Where the reply had already ended, this listener used to be dropped and is now called inside the `onFinal()` call itself, before `onFinal()` has returned. A listener that calls its own unsubscribe — `const off = sel.onFinal(() => { off(); … })` — cannot name `off` yet at that moment and throws; that is already so for the root's `onFinal`, and for a selection made before the reply. Write `let off = () => {}; off = sel.onFinal(…)`, or do not unsubscribe a listener that is only ever called once.

- e3e0ff2: A value from `current()` or `on()` no longer changes after it was handed out.

  When a piece of the reply ended right after a row's `{` or a list's `[`, the snapshot held the parser's own working object for that row or list — the one it goes on writing into. A value a consumer had kept, `{"rows":[{}]}` say, gained the row's keys as later pieces arrived, without `on()` saying so for that value. Fed a reply character by character, 4 of the 20 values delivered to `on()` changed after delivery.

  A container the parser has only just opened is now copied into the snapshot. Nothing about sharing moves: across a reply fed character by character, in pieces ending right after an opener, and in one write, the same subtrees keep and change their references at every write as before, and every `on()` listener on the root and on selections is called the same number of times.

  **What to change:** nothing.

- ed9d7f4: `write()` no longer throws on a string that begins outside any container.

  Two ways led there. In `mode: 'trust'`, a quoted word in the text around the reply — `write('Here is the "best" option:\n')` — threw `TypeError: Cannot read properties of undefined (reading '0')`, and the reply after it was never read. And a stream whose schema is a bare `z.string()` threw the same error on `write('"hello"')`, in every mode.

  Neither throws now. In `trust` the quoted word is passed over and the reply that follows is read as usual. A string root still receives nothing: its value stays the initial one, as a number or boolean root's already does, and nothing is reported — a stream reads a reply that is an object or an array.

  What `recover` and `strict` do with text around the reply is unchanged.

  **What to change:** nothing.

## 0.1.1

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.
