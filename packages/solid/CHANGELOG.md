# @niscorp/solid

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
