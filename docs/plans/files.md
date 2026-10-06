# Files

**Status: Built (2026-10-06).** No package gained a mechanism for files.

## What was decided

AGENTS.md rule 9a: *File pickers live in the kit. A file never goes over the
socket; the app saves it wherever it wants.* The review pass's "no `fetch`
outside the endpoint layer" gained its one exception, to send a file. moss
gained one test, `test/app-routes.test.ts`: a route an app adds to the built
server knows who is asking.

The rule is the maintainer's wording. It does not say what a picker emits or
who records the file; neither was decided.

## Why

Measured on 2026-10-06 against a real moss server, with a 15 MB file, a person
who picks it, edits another field three times and keeps it. The programs that
measured it were not kept.

| Way | Socket up | Socket down | Server loop held, worst | Heap over rest |
|---|---|---|---|---|
| base64 in the picker's model value | 20 MB | 100 MB | 119–278 ms | +65 MB |
| the same, frame deltas on | 20 MB | 20 MB | 25 s | +1 GB |
| the picker sends it to a route the app mounts on moss | 0 | 0 | 20–31 ms | +3 MB |
| the picker sends it to another server | 0 | 0 | 16 ms | +3 MB |

The file comes back down because a model-bound node is given its value as a
prop, so it is in every frame of that canvas. The two bottom rows ran with no
package changed.

midas already keeps files — its own table, its own store, a picker in its kit
that emits base64. To follow 9a it changes that picker, its crop preview and
its upload route. It is not touched from here.

## Found broken on the way

- `/api/vex` answered 500 to a body that is not JSON. Fixed since, in
  `2d20daf`.
- moss's frame-delta encoder has no bound: 1.1 s on a 2.7 MB frame, and it
  throws on a 20 MB one. Only with `shellFrameDelta` on. Not fixed; a task was
  started.
- Nothing bounds a socket message below `ws`'s 100 MiB. Not fixed; no task.
- nova's DOM adapter does not hand a component its `ref` or `model`, though
  ADAPTER.md says adapters do; a DOM kit's own control can emit only a string,
  through the `input` convention. Not fixed; no task.

## Traps

- Three drafts proposed a mechanism — a table and a sweep, kinds and a door, a
  seam and a buffer — for something that already ran without one.
- None read midas, the app that has files, until the third.
- "Cannot" was "has not been written down."
- "Prism refuses a file past a million characters" was run with a `$ref` to
  the string; a `$ref` to the object holding it passes at 15 MB.
