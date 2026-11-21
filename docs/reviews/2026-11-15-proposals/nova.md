# nova: fix proposals for the open items

**What changed in this revision** (after an independent check, whose tests are now in `tests\checker.test.ts`):
- N9 is opt-in: the default is today's comparison, because encore's reconcile relies on it. Whether a reconcile should restore rows every time is now an owner question. The saved inputs belong to the shell, not to a map keyed by Shell.
- N11 keeps non-ASCII and trailing-space paths: text only when more words follow the name.
- N14 survives a reply whose body the host already read.
- N17 drops a failure only when a newer call of the endpoint has already come back, the same rule as for successes.
- N1 states what it changes for listeners and what it leaves open (a mount hook that pushes a child pushes it again on every return).
- N2 gives each loop row its ref at render time, so the ref no longer changes when rows are added, and `@event.ref` stays the plain ref. It also states that the render trees moss sends to terminals carry the longer name.
- N10 also leaves `model: '$.index'` unbound, as `$index` already is.
- N12 reports only in strict mode, which no app in the repo turns on. N22 follows the same rule.
- N23 is new: an offer for A2.
- All four prototypes were also run together (`all\`, `all.diff`).

Code read: `review-fix/all-check` at 39c246ab (`C:\Users\manxx\Development\niscorp\.claude\worktrees\fix-all-check`), unchanged.
Every item was run against that build first (the third review's scripts `t1`–`t10`, plus `repro\*.mjs` beside this file for the rest). All of them still happen, except where the table says otherwise.

Prototypes are in `scratchpad\proposals\nova\`: `base\` is a copy of nova's `src` and `test` from fix-all-check, `p1`–`p4\` are copies with a proposal applied (`p1.diff` … `p4.diff` show each change), and `tests\` has the behaviour tests named below. Each prototype ran nova's whole suite (862 tests, all passing on `base`) and the new tests; each new test fails on `base` and passes on its prototype. The source of all four prototypes type-checks. To run one again, link its `node_modules` to fix-all-check's (`mklink /J node_modules <fix-all-check>\packages\nova\node_modules`) and run `vitest run --config vitest.config.mjs`. The links were removed after the runs so a cleanup of the scratch folder cannot reach the worktree.

| Prototype | Proposals in it | nova's suite | New tests on `base` → prototype |
|---|---|---|---|
| p1 | N1 | 862/862 pass | 5 fail → 5 pass |
| p2 | N2 | 862/862 pass | 1 fail → 1 pass |
| p3 | N3 | 862/862 pass | 2 of 4 fail → 4 pass |
| p4 | N4, N5, N6 (TTY only), N7, N8, N9 (opt-in), N10, N11, N12 (strict), N14, N16, N17, N18 | 862/862 pass | each new test for these fails on `base` and passes here, except the guards that check nothing else changed, which pass on both |
| all | p1 + p2 + p3 + p4 together | 862/862 pass | 896 of 898 with every new test and the checker's: the 2 that fail are the checker's N1 cases that N1 now states as changed or open |

Not prototyped: N6 for DOM, React and Vue, N13, N15, N19, N20 (docs), N21 (refactor), N22, N23. moss's suite was not run on the revised prototypes.

## Table

| Item | What | Proposal | Status |
|---|---|---|---|
| A1 NOVA-2 | actions map key differs from the action's id: reported, still loaded under the key | — | needs owner decision (no non-breaking step left beyond the report that already ships) |
| A2 NOVA-3 | `removeAt` index -1 removes the last element; `move` ignores a negative `from` | N20 (docs), N23 (offer) | needs owner decision (refusing is a break; N23 reports without refusing) |
| A3 | fragment around an action whose layout is a stored-layout id shows the id as text | N4 | proposal |
| A4 | `LayoutStore.resolveReferences` overflows the stack on a self-referring stored layout | N5 | proposal |
| A5 | `$.x.constructor` reads what every object inherits | N3 | proposal |
| A6 | `NovaShell` handed a registry with no `CanvasSlot` replaces the registry's own components | N8 | proposal (confirmed: the Ink kit's `Text` is replaced by React's) |
| A7 | fragment-id check in `registerAction` called dead code | — | no change: not dead. A fragment with no id from JavaScript reaches it and gets `UNKNOWN_FRAGMENT`; without it the caller gets `DEFINITION_VALIDATION_ERROR`, a changed error code |
| A8 | talk notes quote "~15 primitives" | — | already fixed in nova: nova's README no longer gives a count (`grep 15\|fifteen` finds nothing in nova's docs). The quote is in `apps/lab/lyceum/talks/*.md` and `src/db/nova.deck.ts`, the lyceum app's files, not nova's. For whoever edits the talk: the React and Vue kits ship 9 names, the DOM kit 15 (Select and Switch included), the TTY kit 16 |
| A9 | functions/endpoints/phrasebook whose entries come through a prototype no longer resolve | N3 | proposal |
| B1 | reconcile run again resets what the person typed | N9 | needs owner decision (opt-in proposed; encore relies on today's default) |
| B2 | `$.` inside a loop reads the loop's names first; `model: '$.index'` reads the loop index but writes `data.index` | N10 | proposal |
| B3 | text starting with `$`: `'$'` renders `[object Object]`, `'$USD'` renders empty, `'$CAD only'` disappears | N11 | proposal for `'$CAD only'`; `'$'` and `'$USD'` need owner decision |
| B4 | a failed call in a trigger is silent, a mistyped endpoint name too; createShell does not run `auditAction` | N12 | proposal (strict mode only; reporting in lax mode is an owner decision) |
| B5 | push to a canvas the shell never declared mounts an action nobody sees | N20 (docs) | needs owner decision |
| B6 | values bound into an endpoint URL are not encoded | N13 | proposal (opt-in; the default stays open) |
| B7 | a plain-text HTTP error body is lost; `request` on a GET passes the schema and fails at call time; `model`/`for` written `'{{$.x}}'` lose two-way binding | N14, N15, N16 | proposal |
| B8 | DESIGN says the event bus validates events; ACTION_DOCS:556 says `clear` does nothing in lax mode; ACTION_DOCS:363 sends a bearer token from action data | N20 | proposal |
| B9 | nova is not linted; shell.ts 764 and dom/index.ts 552 lines; six `catch {}` swallow handler errors | N21, N22 | proposal |
| C1 | navigation in a mount hook runs before the new instance is on its canvas | N1 | proposal (a mount hook that pushes a child stays unusable on a stack: owner decision) |
| C2 | push then pop before the suspend finished leaves the top action suspended | N1 | proposal |
| C3 | a model-bound field with a `ref` inside a loop writes to the last row | N2 | proposal |
| C4 | a canvas placed inside itself overflows the stack in TTY and DOM (and React: out of memory) | N6 | proposal |
| C5 | = B6 | N13 | proposal |
| C6 | a late failure is written over a newer success | N17 | proposal |
| C7 | pop, popTo, removeAction on a list canvas re-run the mount hook of the card left last | N20 (docs for removeAction) | no change for pop and popTo: SHELL_DOCS:126 documents it ("the instance they expose re-runs its `mount` and `resume` hooks") |
| C8 | = A3 | N4 | proposal |
| C9 | a focused bound field cannot be cleared by the action | N19 | proposal (opt-in) |
| C10 | the README's DOM or TTY kit as the shell's registry draws `COMPONENT_NOT_FOUND: CanvasSlot` | N7 | proposal |
| C11 | `'$'` hands the whole data to the render tree | N11, N20 | needs owner decision (a nova test pins `'$'` as the innermost scope) |
| C12 | `for` written as a sole `{{…}}` drops every `model` inside | N16 | proposal |
| C13 | a translation applied to text with spaces around it mangles `$` patterns | N18 | proposal |
| C14 | = B5 | N20 (docs) | needs owner decision |
| C15 | `!` in runtime.ts:105,148; casts in compose.ts; nova outside the lint size block; createShell ~700 lines | N21 | proposal |

## Proposals

### N1. An instance is on its canvas before its mount hook runs; a late suspend does not cover a later resume (C1, C2)

**Problem.** Two orderings in the shell's push and the runtime's status. (C1) `push` starts the mount hook, then puts the instance on the canvas: an opener whose mount is `[{ push: { action: 'child' } }]` ends `home:suspended > child:active > opener:active`; `[{ removeSelf: true }]` does nothing; `[{ pop: true }]` unmounts `home`. (C2) `suspend` awaits its hook and then sets `suspended`; `resume` sets `active` at once. Push a dialog and pop it before the covered action's suspend finished, and that action ends `suspended` on top for good: clicks do nothing (also with no suspend hook, when push and pop run in one turn).

**Design.**
- `shell.ts`, `spawn`: build and register the runtime, put the instance on the canvas, record its birth, origin and key, and only then start `mount`. `push` and `replace` stop doing the last three themselves. Recording birth, origin and key before the hook runs matters: a hook that removes its own instance clears them through `onUnmount`, and nothing sets them again afterwards.
- `runtime.ts`: one counter, bumped by `suspend`, `resume` and `unmount`. `suspend` remembers its number before awaiting its hook and sets `suspended` only if no later `resume` or `unmount` came:

```ts
const suspend = async (): Promise<void> => {
  moves += 1;
  const mine = moves;
  await runLifecycleHook('suspend', definition, buildContext);
  if (moves === mine) setStatus('suspended');
};
```

**What changes for apps.** A mount hook that navigates on its own canvas does what it says (today it does something else). A push and pop that cross a suspend end with the top action active. When nothing races, the status events and their order are as today.
Two things become visible:
- While a mount hook's first steps run, `getCanvasState` already lists the new instance (a data-change listener called during those steps sees it).
- When a mount hook pushes onto *another* canvas, the first `onStateChange` snapshot (fired by that inner push) already shows the new instance on its own canvas. Pushing `opener` onto `main`, whose mount pushes `side` onto `aside`, gives a first snapshot `main=opener aside=side`; today it is `main= aside=side`. The second snapshot, and so what moss sends in its frames, is unchanged.

Owner to confirm: no working app can rely on a mount-hook navigation that lands on the wrong instance, on a top action left suspended, or on a first snapshot that leaves out an instance already pushed. This is argued as a fix, not a break.

**What stays open (owner decision).** A mount hook that pushes a child is still unusable on a stack canvas, for a different reason. Pop the child, and the opener's `resume` re-runs its `mount` hook (documented: "resume already re-runs mount", ACTION_DOCS `reload`), which pushes the child again. That is not this ordering defect. Fixing it means a hook that runs only on the first mount, which would be a new mechanism, or changing what `resume` re-runs, which would be a break. The checker's case (`home:suspended > opener:active` after the pop) fails on every prototype for this reason.

**Test** (`tests\navigation-order.test.ts`, 5 cases, all fail today). A mount of `push child` → `home:suspended > opener:suspended > child:active`; `removeSelf` → `home:active`; `pop` → `home:active`. An action with a 30 ms suspend save, push dialog, pop 1 ms later → `a:active`, and a click on it counts. Push and pop in one turn → `a:active`.

**Size.** src +25 −19 (two files), test ~70. **New mechanism:** no.

### N2. A model-bound field with a `ref` inside a loop writes to its own row (C3)

**Problem.** The runtime maps a model ref to one path. `for: '$.lines', do: { component: 'Input', ref: 'qty', model: '$line.qty' }` gives three fields the ref `qty`; the map keeps the last row's path, so typing 5 into row 0 gives `[1, 1, 5]`. Without the ref it works (each auto ref carries its path). The event does not say which row it came from, and adding a field to it would change the wire that moss parses with a strict schema.

**Design.** Decided when the renderer builds the field, so a row's name does not depend on how many rows there are.
- **Renderer.** A field with a `ref` whose model path comes through a loop name (the path differs from what the same binding gives outside any loop) gets `model.ref` = `<ref>@<path>` (`qty@lines.0.qty`). Its own `ref` stays `qty`, so clicks and the DOM's `data-ref` are as today.
- **Runtime.** It maps each such name to its row's path. It also keeps mapping the plain `qty` to the last row, as today, so a `ui:model` an app dispatches itself with `ref: 'qty'` lands where it lands today.
- **Triggers.** They compare the field's own ref, so `{ event: 'ui:model', ref: 'qty' }` and `{ event: 'ui:key', ref: 'qty' }` still fire, and their steps see `@event.ref` as `qty` (the event is handed on with the plain ref).
- A field without a `ref` (auto refs already carry the path), or one bound with `$.` to the root, is untouched.

**What changes for apps.** Typing in a row writes that row. A row's model ref is the same with one row or ten, so a field being typed in is not rebuilt (and does not lose focus) when rows are added.
Owner to confirm: in such loops the render tree's `model.ref` reads `qty@lines.0.qty` instead of `qty`, already with a single row. Everything that shows a model ref shows the longer name:
- the adapters and devtools;
- the TTY command list (`set` targets, and a field's label when it has no text);
- the render trees moss sends to terminals, and the targets its terminal commands answer to.

**Test** (`tests\loop-model-ref.test.ts`, fails today). The loop above with a trigger `{ event: 'ui:model', ref: 'qty' }` that counts and records `@event.ref`. Dispatch the first field's `model.ref` with payload 5 → `lines` is `[{qty:5},{qty:1},{qty:1}]`, the trigger ran once and saw `qty`. The checker's case also passes: row 0's model ref is unchanged when a second row appears.

**Size.** src +20 −5 (renderer.ts, model-bindings.ts, runtime.ts, triggers.ts), test ~40. **New mechanism:** yes, small and internal: a per-row model ref. No public option.

### N3. One rule for names a record inherits: its own prototype counts, Object.prototype does not (A5, A9)

**Problem.** Two sides of one question. (A5) A data path walks with `in`, so `{{$.x.constructor}}` renders `function Object() { [native code] }`, and `$toString` reads a function. (A9) The NOVA-1 fix (not yet released) made `ownEntry` own-only, so a `functions` object made with `Object.create(base)` or as a class instance no longer finds `hello`: the call fails with `LIFECYCLE_ERROR` where the last release called it.

**Design.** One helper in `shared/common.ts`, used by `ownEntry`, by `getPath` (in place of `in`) and by the two scope lookups in `resolvePath` (in place of `hasKey`):

```ts
// What every object inherits from Object.prototype (toString, constructor, __proto__) is not an entry; what a record inherits from a prototype of its own is.
export const isEntry = (record: object, name: string): boolean => {
  for (let at: object | null = record; at !== null && at !== Object.prototype; at = Object.getPrototypeOf(at)) {
    if (Object.hasOwn(at, name)) return true;
  }
  return false;
};
```

NOVA-1's protection is kept in full: an endpoint with `fn: 'toString'` still fails (tested). Renaming `ownEntry`, which is no longer own-only, would be a move-only commit of its own.

**What changes for apps.** Against the last release: a function, endpoint, phrase or reconciler reached through a record's own prototype works as it did. A path no longer reads Object.prototype's members: `$.x.constructor` is undefined. A getter on a class the data carries (`$.person.full`) still reads (tested).
Owner to confirm: reading `constructor`, `toString` or `__proto__` through a binding is not something a working app needs.

**Test** (`tests\inherited-names.test.ts`). `getPath({ x: {} }, 'x.constructor')` → undefined (fails today); `Object.create({ hello })` as `functions`, mount calls `hello` → data `r` is `'hi'` (fails today); class getter still read; `fn: 'toString'` still `LIFECYCLE_ERROR`.

**Size.** src +14 −6 (three files), test ~40. **New mechanism:** no (one rule replaces two).

### N4. A stored-layout id composed into a fragment's slot renders the stored layout (A3, C8)

**Problem.** `composeAction` fills `{ slot: 'body' }` with the layout composed so far; when that is a layout id (`layout: 'invoice-body'`), the string goes in and renders as the text `invoice-body`.

**Design.** Fill the slot with a reference node: `{ body: typeof layout === 'string' ? { ref: layout } : layout }`. The renderer already renders `{ ref }` from the layout store at render time, with its loop guard. This also removes the `as LayoutNode` cast at compose.ts:27. The fragment `layout` description (an agent reads it) changes its sentence "a layout id is dropped in as its string and renders as that text" to "a layout id renders the stored layout"; per the style guide, that edit is reviewed by a subagent before it lands. A fragment whose *own* layout is an id still replaces the layout so far, as described today.

**What changes for apps.** Owner to confirm: the slot shows the stored layout where it shows the id as text today. The description says the text is what happens, but nobody wants it.

**Test** (in `tests\p4.test.ts`, fails today). Store `invoice-body` = `Text 'Invoice {{$.n}}'`, action `invoice` with `layout: 'invoice-body'`, `n: 7`, pushed with fragment `frame` → texts `['Frame', 'Invoice 7']`.

**Size.** src 1 line, describe 1 sentence, test ~15. **New mechanism:** no.

### N5. `resolveReferences` leaves a reference inside its own expansion as a reference (A4)

**Problem.** `store.set('tree', { component: 'Stack', children: { for: '$node.children', as: 'node', do: { ref: 'tree' } } })`, then `store.resolveReferences({ ref: 'tree' })` → `RangeError: Maximum call stack size exceeded`. It expands without data, so even a correct recursive tree never ends.

**Design.** Expand with the set of refs already open on the way down. A ref met again inside its own expansion stays `{ ref }`; the renderer resolves it with data later and has its own guard. The public signature stays `(layout) => LayoutNode`.

**What changes for apps.** Nothing: the output is unchanged for every layout that does not refer to itself, and that case throws today.

**Test** (in `tests\p4.test.ts`, throws today). The call above returns the Stack with `do: { ref: 'tree' }` inside.

**Size.** src +9 −3, test ~8. **New mechanism:** no.

### N6. A canvas placed inside itself draws an error where it comes back (C4)

**Problem.** An action on canvas `main` whose layout has `{ component: 'CanvasSlot', props: { canvasId: 'main' } }`: the TTY and DOM walkers recurse until the stack overflows, and React's `NovaShell` runs out of memory (exit 134). `headOf` already guards this (`shell/head.ts:89`).

**Design.** Each walker carries the canvases open on the current path. A `CanvasSlot` naming one of them draws an error node, `RENDER_ERROR: canvas "main" is placed inside itself`, the way an error node is drawn already. TTY: a set in `Ctx` (prototyped). DOM: the same in `build` and in the `CanvasSlot` branch of `reconcile`. React and Vue: a context (provide/inject) of open canvas ids read by their `CanvasSlot`.

**What changes for apps.** Nothing: the case crashes today.

**Test** (`tests\kits.test.tsx` for TTY, passes on p4). Register `CanvasSlot` and draw the frame above: the TTY text contains `canvas "main" is placed inside itself` instead of a RangeError. The same shape for DOM (`renderToString`) and React (`renderToString(<NovaShell/>)` returns).

**Size.** src ~40 over four adapters, test ~40. **New mechanism:** no.

### N7. The DOM and TTY kits register `CanvasSlot` (C10)

**Problem.** Following the README, the DOM or TTY kit as the shell's registry draws `!! COMPONENT_NOT_FOUND: Component not found in registry: CanvasSlot`: the default shell layout uses `CanvasSlot`, the renderer checks the registry, and these two kits do not register it (their walkers draw it themselves). The React and Vue kits do; nova's own tests register it by hand.

**Design.** `defaultRegistry()` of the DOM and TTY kits adds `CanvasSlot`, entered as the same stack-of-children component as `ActionSlot`. The walkers draw a `CanvasSlot` before they look in the registry, so the entry is never called; it is there so the renderer accepts the name, as it does for the React and Vue kits.

**What changes for apps.** The README's example draws. Owner to confirm: `registry.list()` of these two kits names one more component, so a component list built from them (for an agent, say) shows `CanvasSlot`, as the React and Vue kits' lists already do.

**Test** (`tests\kits.test.tsx`, fails today). `createShell({ canvases: [{ id: 'main', initial: 'hello' }], registry: ttyKit() })`, TTY view text contains `Hello`.

**Size.** src 2 lines, test ~10. **New mechanism:** no.

### N8. `NovaShell` adds the React components a registry lacks and replaces none (A6)

**Problem.** `NovaShell` and `NovaCanvas` call `registerNovaReactComponents` on any registry without `CanvasSlot`, which overwrites the registry's own `Text`, `Stack`, `Input`, `Button`, `Box`, `Panel`, `JsonTree` and `ActionSlot`. Run: the Ink kit's registry handed to `NovaShell` comes back with React's `Text` in place of Ink's.

**Design.** Same trigger (no `CanvasSlot`), but register only the builtin names the registry does not have, with their meta: build the builtins in a fresh registry and copy across what is missing.

**What changes for apps.** Owner to confirm: an app that hands `NovaShell` its own registry with its own `Text` (or any of the eight) and no `CanvasSlot` sees its own component where it sees React's today. A registry that has `CanvasSlot` is untouched, as today.

**Test** (`tests\kits.test.tsx`, fails today). Ink `defaultRegistry()` handed to `NovaShell`, rendered: `registry.get('Text').component` is still Ink's, and `CanvasSlot` was added.

**Size.** src +6 −1, test ~10. **New mechanism:** no.

### N9. A reconcile can compare a row with the input it gave last time: opt-in (B1)

**Problem.** `differs` compares the row's input with the instance's current data. Run a reconcile that placed `form` with `{ title: 'T' }`, type "typed title" into it, run the same reconcile with the same rows: the title goes back to `T`. ACTION_DOCS says the input is written when the row's input changed.

**Why it cannot be the default.** encore depends on today's comparison (`apps/lab/encore/src/server/intent/reconcile.ts`). It compares with what the card shows now, hands nova only the keys that differ, and expects them written. After `touched.reset()` it puts back `tue` over a typed `fri`, and its intent pass hands a partial input before its assist pass hands a full one. Comparing with the last input given by default breaks both (the checker's two encore cases pass on `base` and fail on the first version of this proposal).

**Question for the owner.** Is a reconcile meant to restore its rows every time (today, what encore relies on), or to write only the rows that changed since last time (what ACTION_DOCS says)? The design below keeps the first as the default and offers the second.

**Design.**
- `ReconcileOptions` gets an optional `lastInputs: Map<instanceId, input>`. Without it, everything is as today.
- With it, an instance is compared key by key with the input the map says it was last given, and only keys that changed are written. A partial input is merged into what the map has, so a full input after a partial one does not count the missing keys as changed. An instance the map does not know is compared with its current data, as today.
- The `reconcile` step opts in with one more field, `keepTyped: true`. The map belongs to the shell: it is passed only for steps that opt in, and an entry is deleted in the shell's `onUnmount`. There is no module-level map keyed by Shell, which moss's wrapped shell would split in two.
- A host calling `reconcileCanvas` directly passes its own map.

**What changes for apps.** Nothing without `keepTyped` or `lastInputs`.

**Test** (`tests\reconcile-typed.test.ts`).
- With a `lastInputs` map: place `form` with `{ title: 'T', note: 'N' }`, type both, reconcile again → both typed values stay. Change the row's title to `U` → `title: 'U'`, `note` still typed.
- With the map: a partial input then a full one → the same instance, not re-opened.
- Without the map: the typed title goes back to `T`, as today. The checker's encore cases pass.
- The step field and the shell's map are not in the prototype.

**Size.** src ~25 (reconcile.ts, step schema field, shell wiring), docs ~4, test ~50. **New mechanism:** yes, an opt-in step field and an optional option.

### N10. Inside a loop, a model `$.<name>` writes where it reads (B2)

**Problem.** Inside a loop, `$.index`, `$.items` and `$.<as>` read the loop's own values (the renderer's comment says so, nova's test pins it), but a `model` written that way writes the root: `model: '$.line.qty'` shows the row's qty and writes `data.line.qty`. LAYOUT_DOCS says `$.foo` starts at the root.

**Design.** Make the write follow the read, not the other way round (changing reads would change what working layouts show).
- `resolveDataPath` looks a `$.` head up in the loop's names first, as it does for `$name`, and falls back to the root.
- The loop index has no place in the data it could be written to. So `model: '$.index'` inside a loop binds nothing, as `model: '$index'` already binds nothing; the loop registers `index` as a loop name with no path.
- Docs: LAYOUT_DOCS's "`$.foo.bar` — start from the data root" becomes "start from the data root; inside a loop, the loop's own names (`index`, `items` and the `as` name) come first", in N20.

**What changes for apps.** What every layout shows is unchanged.
Owner to confirm: inside a loop, `model: '$.<as>.x'` writes the row it shows, where today it writes a root key `<as>` that no field shows. `model: '$.index'` writes nothing, where today it writes a root `index` while showing the loop index. With this, B2 is fixed for writes.

**Test** (`tests\loop-dotted-model.test.ts`, fails today). `for '$.lines' as 'line'`: `Input model '$.line.qty'` → its `model.path` is `lines.0.qty`, and `Input model '$.index'` has no `model` with path `index`.

**Size.** src +6 −4, test ~18. **New mechanism:** no.

### N11. A `$` word followed by more words is text (B3; `'$'` and `'$USD'` stay)

**Problem.** Any string that starts with `$` and a letter is read as a path: `'$CAD only'` renders empty. DESIGN says only `"$.path"` and `"$item.field"` forms are paths and "anything else → returned literally"; LAYOUT_DOCS says "strings starting with `$` are resolved as paths".

**Design.** The bare-path test changes in `resolve.ts`, and the same test in `i18n/phrases.ts`. A string is still a path if it is `$.` and anything, `$` alone, or `$`, a letter or `_`, and then no whitespace except at the very end: `/^\$(\.|[A-Za-z_]\S*\s*$|$)/`. It is text only when more words follow the name, as in `'$CAD only'` (and, being text, it is offered to the phrasebook like other text).

Every path that resolves today still resolves:
- non-ASCII keys (`'$item.größe'`, `'$item.prénom'`);
- a path with a trailing space (`'$item.name '`, empty today and still empty);
- `$.` forms with spaces in them.

An earlier version used `\w`, which is ASCII only and would have made those first two text.

`'$'` alone stays the innermost scope: nova's own test pins it ("returns innermost scope for $"), so changing it is a break. `'$USD'` stays a path (empty when nothing has `USD`): it is DESIGN's `$item` form, and `children: '$error'` with `error` missing must keep rendering empty. Both go in the docs (N20): a lone `$` is the whole scope, and a label that starts with `$` and a name comes from data (`'{{$.label}}'`).
What stays open: `label: '$'` meant as a dollar sign hands the whole scope to the render tree, which moss sends to the client. Removing that is a break the owner decides on.

**What changes for apps.** Owner to confirm: `'$CAD only'` renders `$CAD only` where it renders empty today, and such strings now reach `onPhraseMiss`. The only thing read differently is a data key with a space in it, read the `$name` way.

**Test** (`tests\dollar-text.test.ts`). `resolve('$CAD only')` → `'$CAD only'`, and `'$USD only'` likewise (both fail today). These resolve as today: `$.amount`, `$amount`, `'$amount '`, `$USD`, `$`, `{{$}}`, `$item.größe` and `$item.prénom`. nova's suite passes (the first try, which also made `'$'` text, failed nova's own test, which is why `'$'` stays).

**Size.** src 2 lines, test ~20. **New mechanism:** no.

### N12. In strict mode, a failed call nothing takes is reported to `onError` (B4)

**Problem.** In a trigger, a call that fails with no `onError` steps and no `errorTarget` goes nowhere, even in strict mode; `{ call: 'svae' }` (no such endpoint) goes nowhere either. In a lifecycle hook both already raise `LifecycleError`.

**Why strict mode only.** Reporting in every mode is a visible change for working apps. mythos logs every `onError` with `console.error`, and its `loadStats` (from a message trigger) and `completeTodo` calls would start logging. relay's screen builder turns each failed probe call into a finding, which changes the repair prompt its model reads, and a generated screen whose trigger calls an unknown endpoint would be turned away. Strict mode is the existing opt-in for "fail loudly", and no app in the repo turns it on (`grep strict` over apps and moss finds no `createShell` with it).

**Design.** In `steps.ts`, outside lifecycle hooks, and only when the shell is strict:
- A failed call with no `onError` steps and no `errorTarget` reports a `NovaError` with a new code `ENDPOINT_FAILED` (`endpoint '<name>' failed: <message>`) to the context's `onError`.
- An unknown endpoint with no `onError` steps reports the same code.
- An unknown function already raises `UnknownFunctionError` in strict mode, unchanged.

Nothing is thrown that is not thrown today. `onEndpoint` is not given events for endpoints that do not exist. `auditAction` is not run by `createShell`: most of what it finds is advice (a key with no default), and as reports to `onError` it would be noise.

**What changes for apps.** Nothing outside strict mode. Owner to confirm: a strict app's `onError` is now called for these failures.
Owner decision: whether lax mode should report them too, given the mythos and relay changes above.

**Test** (in `tests\p4.test.ts`).
- Strict: trigger `call save` where `save` throws, and trigger `call svae` → `onError` gets `ENDPOINT_FAILED` twice (it gets nothing today).
- With `errorTarget` set → nothing is reported.
- Lax: nothing is reported, as today.

**Size.** src +6 −2 and one error code, test ~40. **New mechanism:** no (a new error code in an existing channel, under an existing option).

### N13. An HTTP endpoint can encode the values it puts into its URL: `encodeValues: true` (B6, C5)

**Problem.** `url: '/api/notes/{{$.picked}}'` with `picked = '../users/42'` sends `DELETE /api/notes/../users/42`, which a browser makes `/api/users/42`; `7?cascade=all` adds a query.

**Design.** Encoding by default would break working URLs that mean their slashes (`url: '{{$.apiBase}}/notes'`, `url: '/files/{{$.path}}'`), so it is opt-in: an optional `encodeValues: boolean` on the HTTP endpoint schema. With it, each `{{…}}` value put into the URL text goes through `encodeURIComponent`; a URL that is a single `{{…}}` is the whole URL and is not encoded. Its `.describe()` (an agent reads it, so it is reviewed first) says: set it whenever a value comes from data or from what someone typed, unless the value is meant to carry `/`. ACTION_DOCS and the example endpoints show it.

**What changes for apps.** Nothing; an endpoint opts in. What stays open: an endpoint without `encodeValues` sends values raw, as today. Making it the default is a later break for the owner to approve.

**Test.** Endpoint `{ url: '/api/notes/{{$.picked}}', method: 'DELETE', encodeValues: true }`, `picked = '../users/42'` → the fetch sees `/api/notes/..%2Fusers%2F42`; without the flag, as today.

**Size.** src ~10 (schema field, `callHttpEndpoint` resolves the URL with an encoding replacer), docs ~6, test ~20. **New mechanism:** yes, a public option on the endpoint schema.

### N14. A plain-text HTTP error body reaches `errorTarget` (B7, first part)

**Problem.** On a failed reply, `tryParseJson` calls `json()`, which consumes the body; the fallback `text()` then fails, so a real `Response('Service down for maintenance', { status: 503 })` gives `errorTarget = { status: 503, message: 'HTTP 503' }` with no `data`.

**Design.** `FetchResponse` gets an optional `clone?: () => FetchResponse` (a real `Response` has one). In the failed-reply branch, try to take a clone before `json()`, and read `text()` from the clone when `json()` fails. The clone is taken inside a `try`. When the host's fetch already read the body (moss's internal wire returns real Responses for failures), `clone()` throws, and the reply is then read as today. A fetch that returns objects without `clone` (a test fake) also behaves exactly as today.

**What changes for apps.** Owner to confirm: `errorTarget.data` (and `@error.data`) carries the reply's text where today it is missing. The message is unchanged. The added type member is optional.

**Test** (in `tests\p4.test.ts`, fails today). The 503 above → `err` equals `{ status: 503, message: 'HTTP 503', data: 'Service down for maintenance' }`. The checker's case also passes: a fetch that read the body and then returns the same Response → `err` is `{ status: 503, message: 'HTTP 503' }` as today, and nothing reaches `onError`.

**Size.** src +11 −5, test ~25. **New mechanism:** no.

### N15. A GET endpoint with a `request` body is reported when the shell starts (B7, second part)

**Problem.** `{ method: 'GET', request: {...} }` passes the schema; every call then fails in fetch with "Request with GET/HEAD method cannot have body."

**Design.** Refusing it in the schema would refuse definitions accepted today, so it is reported instead, the way NOVA-2's key mismatch already is: `createShell` and `registerAction` pass a `DefinitionValidationError` naming the action and endpoint to `onError` and load the action as today. The `request` description gets "not on a GET" (reviewed first). It is not added to `auditAction`: moss's generated-action check reads its issues, and a new issue could turn away an action moss accepts today.

**What changes for apps.** Nothing refused; one report through `onError` for a definition that cannot work.

**Test.** `createShell` with such an endpoint and an `onError` → one `DEFINITION_VALIDATION_ERROR` naming the endpoint, and the action still pushes.

**Size.** src ~12, test ~15. **New mechanism:** no.

### N16. `for` and `model` written as a single `{{…}}` keep their binding (B7, third part; C12)

**Problem.** `for: '{{$.lines}}'` iterates fine but every `model` inside loses its binding (the loop's base path is not worked out), and `model: '{{$.x}}'` alone binds nothing, so typing does nothing.

**Design.** `resolveDataPath` unwraps a single `{{ … }}` before reading the path, using the resolver's own sole-template pattern (exported as `unwrapSoleTemplate` from the bindings module, internal to nova).

**What changes for apps.** Owner to confirm: such fields write what is typed where today they write nothing, and their render nodes carry `model` and `value`.

**Test** (in `tests\p4.test.ts`, fails today). `for: '{{$.lines}}' as 'line'`, `Input model '{{$line.qty}}'` → the node's `model.path` is `lines.0.qty`.

**Size.** src +4 −1, test ~10. **New mechanism:** no.

### N17. A failure that comes back after a newer call of the same endpoint already came back does not write `errorTarget` (C6)

**Problem.** Search "a" (slow, fails at 50 ms), then search "ab" (succeeds at 5 ms): rows show "ab", then the late failure writes `err = 'first search failed late'`. Successes already check the call's ticket before writing `target`; failures do not.

**Design.** The same rule as for successes. A failure is dropped (no `errorTarget` write) only when a newer call of the same endpoint has already come back: its ticket is lower than the last one that landed. The runtime's call ledger gets one question, `isSuperseded(endpoint, ticket)`. As for successes today, the call's `onError` steps still run.

An earlier version dropped any failure that was not the latest call *issued*. That hid a different call's failure: save row 1, then row 2, on one endpoint, and row 1's failure is never shown (and with `errorTarget` set, N12 does not report it either).

**What changes for apps.** Owner to confirm: a failure that comes back after a newer call of the endpoint already came back no longer writes `errorTarget`.
What stays open:
- A failure that comes back while a newer call is still on its way is written, and stays written if that newer call then succeeds. That is the same as today, because a success does not clear `errorTarget`.
- `onError` and `onSuccess` steps of replaced calls still run, as they do today.

**Test** (in `tests\p4.test.ts`, fails today). The search above → `rows = ['row for ab']`, `err = null` after both settle. The checker's case also passes: row 1's save fails at 30 ms while row 2's save is still on its way → `err` is set.

**Size.** src +4 −1, test ~30. **New mechanism:** no.

### N18. A translation is put in as written (C13)

**Problem.** Text with spaces around it is translated by `value.replace(trimmed, onTrimmed)`, which reads `$$`, `$&` and the like in the translation: "Price in dollars " with "Preis in US$$" renders "Preis in US$ ".

**Design.** `value.replace(trimmed, () => onTrimmed)`.

**What changes for apps.** Owner to confirm: a translation containing `$$`, `$&`, `` $` ``, `$'` or `$1`, on text with spaces around it, renders as written, as the same translation already does on text without spaces.

**Test** (in `tests\p4.test.ts`, fails today). The example above → `'Preis in US$$ '`.

**Size.** src 1 line, test ~8. **New mechanism:** no.

### N19. A bound field can take a value the action writes while it is focused: `replaceDraftOnWrite` (C9)

**Problem.** While a bound field is focused, every adapter keeps what is typed and ignores the tree's value, by design (ADAPTER.md §6, "or a value from elsewhere"). So Escape → `set q ''` empties the data, the field still shows "abc", and the next key writes "abcd". Clear-on-Escape and send-and-clear (relay's topbar search) cannot work.

**Design.** The documented behaviour stays the default; a field opts in with a prop, `replaceDraftOnWrite: true`, next to `debounce`, in `primitive-props.ts`. Each kit that keeps a draft (DOM, React, Vue, Ink) remembers the values the field dispatched since it last caught up. A tree value equal to one of them is the field's own echo and is ignored while focused, as today; equal to the last one, the list is emptied. Any other value was written by the action: it replaces the draft, a pending debounced dispatch is dropped (it would write the old text back), and the caret goes to the end. The TTY has no draft and needs nothing.

**What changes for apps.** Nothing without the prop. Not prototyped: the four kits each need their own form of it, and the debounce interplay wants a test per kit.

**Test.** DOM (the third review's `t5`) with the prop: type "abc", Escape → field shows "", next key "d" → data `q = 'd'` (today "abcd"). Same through React's `Input` with `@testing-library/react`. Without the prop, unchanged.

**Size.** src ~15 per kit (~60), props schema 1, docs ~8, test ~60. **New mechanism:** yes, a public prop on bound fields.

### N20. Docs corrections (A2, B5/C14, B8, C7, the `$` rules)

Docs only; one patch changeset (a docs-only package change still carries one).
- DESIGN:132: the event bus does not validate events. A host that takes events from outside parses them with `NovaEventSchema` (moss does, in `shells/sessions.ts`).
- ACTION_DOCS:556: in lax mode a mutation aimed at a missing or wrong-typed path is a no-op, except `clear`, which removes the key (as ACTION_DOCS:212 already says).
- ACTION_DOCS:363: the example's `authorization: 'Bearer {{$.token}}'` header goes. Auth is the session (AGENTS rule 12), and the example shows a plain `content-type` header only.
- `removeAt` (A2): "A negative index counts from the end, as in JavaScript: -1 removes the last element. An index computed as -1 for 'not found' therefore removes the last element." What stays open: that hazard. Refusing negatives, or a step that guards it, is a later break for the owner to approve. `move` already documents an out-of-range `from` as a no-op.
- Push to an undeclared canvas (B5, C14): "`push` (and a `push` step) to a canvas id the shell was not given creates that canvas. It is not in the shell layout; only a `CanvasSlot` naming it or `getCanvasRenderTree` shows it. Declare it with `canvases` or `addCanvas`." What stays open: a mistyped canvas id mounts an action nobody sees. Reporting it would also fire for apps that use such canvases on purpose, and refusing it is a break: owner decision.
- `removeAction` on a list canvas (C7): when it takes the last card off, the card left last re-runs its `mount` and `resume` hooks, as after `pop`.
- Bindings (N10, N11): inside a loop, `$.<name>` reads the loop's own `index`, `items` and `as` name first. A lone `$` is the whole innermost scope. A `$` followed by a name is a path, so a label like `$USD` comes from data.

**What changes for apps.** Nothing. **Test.** None (docs). **Size.** ~15 lines over DESIGN, ACTION_DOCS, LAYOUT_DOCS, SHELL_DOCS. **New mechanism:** no.

### N21. nova joins the typed lint block; the shell and DOM adapter are split where they stopped being one thing (B9, C15)

**Problem.** nova is not in `eslint.config.mjs`'s typed block or the `lint` script, so the rules the other packages are checked against are not run on it. Counted with grep, not with a lint run: 2 non-null `!` (runtime.ts:105, 148), about 58 lines with an `as` cast (rough count: compose.ts:27 and :63, `as ComponentRegistry<NovaComponent>` in nova.tsx, `node.props['canvasId'] as string` in the TTY walker, and others), files over 400 lines (shell.ts 764, adapters/dom/index.ts 552, ink/components.tsx 405 with blank lines), and `createShell` at about 710 lines against a 300 ceiling.

**Design.** Move-only commits first, then the gate:
1. Remove the two `!` (bind `config.onNavigate` and `config.onEndpoint` to locals that narrow) and fix the casts by fixing the types. compose.ts:27 goes with N4.
2. Split `createShell`: the navigation operations (push, pop, popTo, replace, clear, removeInstance, moveInstance, restore, back) become `shell/navigation-ops.ts`, handed a narrow deps object (canvases, journal, lifecycle ops, spawn, fireState). `createShell` keeps configuration, wiring and the public object. Split `adapters/dom/index.ts`: field and event wiring (`wireEvents`, focus restore) into its own file.
3. Add `packages/nova/src` to the typed block's `files` and to the `lint` script.

**What changes for apps.** Nothing: no behaviour moves (one commit moves code, another changes behaviour, never both). nova's 862 tests are the check.

**Test.** `pnpm lint` passes with nova in it; nova's suite unchanged.

**Size.** ~400 lines moved, ~60 lines touched for casts. The real cast count needs one lint run. **New mechanism:** no.

### N22. A handler that throws is reported to the shell's `onError` (B9, `catch {}`)

**Problem.** Six `catch {}` drop a throwing subscriber's error without a trace: event bus, message bus, data store, telemetry (`onStateChange`/`onDataChange`/`onEndpoint`), the runtime's status subscribers, and devtools' `pop`. The style guide says handlers' errors are caught *and logged*; nova has no log, so the developer never learns.

**Design.** Keep catching (a handler must never break the bus), and report what was caught when there is somewhere to report it. `createEventBus` and `createMessageBus` take an optional `{ onHandlerError }`. A strict shell passes `config.onError`, wrapped in a `NovaError` with a new code `HANDLER_FAILED`, to:
- the buses it creates itself;
- its telemetry;
- each runtime's data store and status subscribers.

It is strict mode only, for the same reason as N12: an `onError` that logs or shows every error (mythos) would start showing these. A bus the app hands in is untouched. The devtools `pop` stays as it is: it returns `null` on a disposed shell on purpose.

**What changes for apps.** Outside strict mode, or with their own buses: nothing. Owner to confirm: in a strict shell, a subscriber that throws is now reported to `onError`.

**Test.** `createShell({ strict: true, onError })`, `shell.onStateChange(() => { throw new Error('x') })`, push → `onError` gets `HANDLER_FAILED` with message `x`, and the push still completes. Without `strict`, nothing is reported.

**Size.** src ~25, test ~30. **New mechanism:** yes, an optional option on two exported factories and a new error code.

### N23. Offer: a `removeAt` index that a template turns negative is reported, and still applied (A2)

**Problem.** `{ removeAt: 'rows', index: '{{$.found}}' }` with `found = -1` (a search's "not found") removes the last row without a word.

**Design.** The same form as N15: report, do not refuse.
- In `steps.ts`, where a mutation's index template is resolved: a `removeAt` index that came from a template and resolved to a negative whole number reports a `NovaError` with code `MUTATION_ERROR` (`removeAt: index {{$.found}} resolved to -1, which removes the last element`) to `onError`.
- The mutation then runs as today.
- A literal `index: -1` is a deliberate "remove the last" and is not reported. `move` needs nothing: a negative `from` is already a documented no-op.

**What changes for apps.** Nothing is refused or changed in the data. Owner to confirm: an app that computes a negative index on purpose gets a report it did not get before. Whether to make this strict-only, like N12, is the owner's choice. Proposed as written because the case it reports is almost always a mistake.

**Test.** `index: '{{$.found}}'`, `found: -1`, rows `[1, 2, 3]`, with `onError` → rows `[1, 2]` as today, and one `MUTATION_ERROR` naming the template. With `index: -1` written as a number, there is no report.

**Size.** src ~8, test ~20. **New mechanism:** no (an existing code through an existing channel). Not prototyped.

## Owner decisions, collected

- A1: an actions-map key that differs from the id. The report already ships; loading it under its id or refusing it is a break.
- A2: `removeAt` with a computed -1. Documented by N20, and N23 offers a report; refusing negatives is a break.
- B1 / N9: is a reconcile meant to restore its rows every time (today; encore relies on it) or to write only rows that changed since last time (ACTION_DOCS)? N9 offers the second as an opt-in.
- C1 / N1: a mount hook that pushes a child pushes it again whenever the opener returns, because `resume` re-runs `mount`. Fixing it needs a hook that runs once (a new mechanism) or a change to `resume` (a break).
- N12 and N22: whether lax-mode shells should also report failed calls and throwing handlers (visible in mythos's log and relay's screen builder).
- B5 / C14: push to an undeclared canvas. Documented by N20; reporting or refusing it changes things for apps that do it on purpose.
- B3 / C11: `'$'` alone is the innermost scope (pinned by nova's test) and `'$USD'` is a path. Making either text is a break; N11 changes only `'$CAD only'`.
- N13: whether `encodeValues` should later become the default.
- Every "Owner to confirm" line above: N1, N2, N3, N4, N7, N8, N10, N11, N12, N14, N16, N17, N18, N22, N23.
