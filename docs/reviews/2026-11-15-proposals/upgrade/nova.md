# Upgrading past the nova "owner to confirm" fixes

Each section is one change an app can see, in `@niscorp/nova`. None of them changes nova's grammar (the action and layout schemas), so no `strata.lock.json` moves and no stored document migrates. "Breaking: yes" means an app that works on the current release can see a different result; what it must do is under "What to do". The apps checked are the lab apps in this repository, the create-nisc templates, moss, and the apps outside it (AnimaApp, anima-finance, mira).

### nova — a mount hook's navigation acts from its own instance; a late suspend no longer leaves the top action suspended
- Before: an action `opener` with `lifecycle: { mount: [{ push: { action: 'child' } }] }`, pushed over `home`, ended `home:suspended > child:active > opener:active` (the child went under the opener). `mount: [{ removeSelf: true }]` did nothing, and `mount: [{ pop: true }]` closed `home`. Separately: push a dialog over an action whose `suspend` hook takes 30 ms, pop it 1 ms later, and the action ended `suspended` on top for good, so its buttons did nothing (also with no suspend hook, when push and pop ran in one turn).
- Now: the same opener ends `home:suspended > opener:suspended > child:active`; `removeSelf` and `pop` close the opener and leave `home:active`. The action revealed by the pop ends `active` and its triggers fire. Two more things are visible: `getCanvasState` (and `getState`) list the new instance while its mount hook runs, so a data-change listener called for the instance's first writes (the input merged at mount, a mount hook's first steps) finds it on its canvas, and when a mount hook pushes onto another canvas the first `onStateChange` snapshot already shows the new instance on its own canvas (`main=opener aside=side`, where it was `main= aside=side`). The second snapshot, and so what moss sends in its frames, is unchanged.
- Who notices: actions whose `mount` steps navigate before their first `call` returns, and listeners that read the very first state snapshot after a push. Navigation in a call's `onSuccess` ran after the push already and is unchanged.
- What to do: nothing, unless the app relied on the old order (the child under its opener, or `pop` in a mount hook closing the action below). Still open, unchanged: a mount hook that pushes a child pushes it again whenever the opener is revealed, because `resume` re-runs `mount`.
- Breaking: yes
- Lab app changed: encore's `src/dev/assistant-check.ts` counts, with `shell.onDataChange`, the writes a run makes to the answer card while the card is on the `assist` canvas. The card is placed by a reconcile with no input, which pushes it with `{}`, and its mount writes its data merged with that input, here exactly its defaults (`status: 'running'`, empty answer). That write now happens while the card is already on its canvas, so the listener saw one write more (4 where 3 were expected). The check now skips the write that equals the data the card was placed with (`assistAnswerAction.data` merged with no input), and still counts every write after it. This is the pattern to look for in an app: a data-change listener that looks an instance up in `getState()` and counts or reacts to its writes.
- Also checked: `apps/lab/encore/src/server/intent/assist.ts:747` reads a question card through `getState()` in its `onDataChange` listener and now also sees that card's mount-time write. Checked, no effect: it acts on `saved === true`, which no mount sets, and otherwise only restarts its re-author timer (`HANDOFF_IDLE_MS`) when an authored answer is waiting and no run is out; encore's checks pass.
- Affected apps: encore's assistant-check (above). Otherwise none found that change result. `apps/lab/lyceum/src/app/actions/slide/nova.actions.ts:49` runs `resetTo` on canvas `demo` at the start of a mount hook: only its first state snapshot now already lists the slide. `apps/lab/atrium/src/app/actions/domains/staff/menu.action.ts:35` and `apps/lab/lyceum/src/app/actions/stage/deck.action.ts:6` navigate in a call's `onSuccess`, which is unchanged. No `onStateChange` listener found reads the first snapshot (`apps/lab/atrium/src/server/assistant/watch/index.ts:250`, `apps/lab/lyceum/src/server/placement.ts:53`, moss `src/shells/stream.ts:90` ignore its content or subscribe later). AnimaApp, anima-finance and mira: no mount hook found that navigates before a call returns.

### nova — a field with a `ref` inside a loop writes its own row
- Before: `{ for: '$.lines', as: 'line', do: { component: 'Input', ref: 'qty', model: '$line.qty' } }` over three rows gave all three fields the model ref `qty`; typing 5 into the first row gave `lines = [{qty:1},{qty:1},{qty:5}]`.
- Now: each row's field has the model ref `qty@lines.0.qty`, `qty@lines.1.qty`, …; typing 5 into the first row gives `[{qty:5},{qty:1},{qty:1}]`. The field's `ref` stays `qty`, so clicks and a DOM `data-ref` are as before, triggers on `ref: 'qty'` fire for every row and read `@event.ref` as `qty`, and a `ui:model` dispatched by hand with `ref: 'qty'` still writes the last row. The row's model ref does not change when rows are added, so a field being typed in is not rebuilt.
- Who notices: code that reads `model.ref` from a render tree for such a field and compares it with the written `ref`; the TTY command list (`set` targets, a field's label when it has no text) and moss's terminal render trees show the longer name. Kits that dispatch `ui:model` with the node's `model.ref` keep working unchanged.
- What to do: nothing, unless code compares a loop field's `model.ref` with its written `ref`: compare the node's `ref` instead. A terminal script that typed `set qty …` for such a field types `set qty@lines.0.qty …`.
- Breaking: yes
- Affected apps: none found. No field in the lab apps, the templates, AnimaApp, anima-finance or mira has both `model` and `ref` inside a loop (the loop fields in AnimaApp `signup.parts.ts`, `field.action.ts:28`, `edit-wear.action.ts:378`, `invites.action.ts:12`, and mira `src/app/actions/automation/card.layout.ts:150` have no `ref`). Every kit found dispatches `ui:model` with `novaModel.ref` from the node (for example `packages/create-nisc/templates/react/files/src/ui/kit.tsx:188`, mira `src/ui/kit/input.tsx:118`), which keeps working. moss's TTY `set` command (`packages/moss/src/terminal/tty/commands.ts:71`) shows and accepts the longer name for such fields. Layouts generated at run time (relay's screen builder, lyceum's screens) could produce such a field; they then get the per-row behaviour.

### nova — bindings never read what every object inherits; a record's own prototype counts
- Before: `{{$.x.constructor}}` rendered `function Object() { [native code] }`, and `$toString` read a function. On this branch before the release, a `functions` object made with `Object.create({ hello })` or as a class instance no longer found `hello` (the call failed with `LIFECYCLE_ERROR`); in the last release it was found.
- Now: `$.x.constructor`, `$.x.toString` and `$.x.__proto__` are `undefined` (the text renders empty). `Object.create({ hello })` as `functions` calls `hello`, as in the last release, and endpoints, phrasebooks and reconcilers resolve the same way. A getter on a class the data carries (`$.person.full`) still reads, and `fn: 'toString'` still fails as an unknown function.
- Who notices: a layout that reads one of `Object.prototype`'s members through a binding.
- What to do: nothing, unless a layout reads such a member: put the value in the data instead.
- Breaking: yes
- Affected apps: none found. No binding reads `constructor`, `toString` or `__proto__` in the lab apps, the templates, AnimaApp, anima-finance or mira, and moss builds `functions`, `reconcilers` and `phrases` as plain objects (`packages/moss/src/shells/build.ts:166-179`).

### nova — a fragment's slot renders the stored layout an action names
- Before: an action `invoice` with `layout: 'invoice-body'` (an id in the layout store), pushed with a fragment whose layout has `{ slot: 'body' }`, showed the text `invoice-body` in the slot.
- Now: the slot shows the stored layout (`Invoice 7`). A fragment whose own `layout` is an id still replaces the layout composed so far, as before.
- Who notices: actions with a string `layout` pushed `with` a fragment.
- What to do: nothing.
- Breaking: yes (what the slot shows changes; nobody wants the old text)
- Affected apps: none found. No action definition in the lab apps, the templates, AnimaApp, anima-finance or mira has a string `layout`; stored layouts are used through `{ ref }` nodes (`apps/lab/encore/src/app/app.ts:37`, `apps/lab/lyceum/src/app/app.ts:39`). moss accepts string layouts (`packages/moss/src/shells/host-state.ts:21`, `src/artifactory/generated.ts:67`), so a model-made action pushed with a fragment gets the new behaviour.

### nova — the DOM and TTY kits register `CanvasSlot`
- Before: `createShell({ canvases: [{ id: 'main', initial: 'hello' }], registry: ttyKit() })` (or the DOM kit), as the README shows, drew `!! COMPONENT_NOT_FOUND: Component not found in registry: CanvasSlot`.
- Now: the default shell layout draws (`Hello`). `defaultRegistry().list()` of the DOM and TTY kits names `CanvasSlot` too, as the React and Vue kits' lists already did. The Ink kit is unchanged.
- Who notices: code that builds a component list (for a model, say) from the DOM or TTY kit's `registry.list()`.
- What to do: nothing.
- Breaking: yes (the list has one more name)
- Affected apps: none found. `defaultRegistry()` of these kits is used in `apps/lab/relay/src/console.ts:21`, `apps/lab/relay/src/dev/devtools-check.ts:37` and moss's terminals (`packages/moss/src/terminal/dom/index.ts:25`, `dom/server.ts:16`, `tty/index.ts:47`); none calls `.list()`. The `.list()` calls in the apps (`apps/lab/relay/src/app/app.ts:50`, the model-first template's `src/dev/artifacts-check.ts:54`, AnimaApp `src/dev/artifacts-check.ts:63`, anima-finance `src/dev/artifacts-check.ts:50`, mira `src/dev/artifacts-check.ts:45`) are on the apps' own React registries.

### nova — `NovaShell` adds only the React components a registry lacks
- Before: `<NovaShell shell={shell} registry={registry} />` with a registry that had no `CanvasSlot` registered all nine default React components on it, replacing the registry's own `Text`, `Stack`, `Input`, `Button`, `Box`, `Panel`, `JsonTree` and `ActionSlot`. The Ink kit's registry came back with React's `Text` in place of Ink's. `NovaCanvas` did the same.
- Now: only the names the registry does not have are added (`CanvasSlot`, and any other missing one); the registry's own components stay.
- Who notices: an app that hands `NovaShell`/`NovaCanvas` its own registry with its own versions of those names and no `CanvasSlot`: it now sees its own components where it saw React's.
- What to do: nothing, unless the app wanted React's defaults over its own: then register React's (`registerNovaReactComponents(registry)`) itself.
- Breaking: yes
- Affected: loom's `LoomEditor` (`packages/loom/src/react/editor/loom-editor.tsx:52`) hands `NovaShell` a registry with no `CanvasSlot`, so a plugin's own `Text`, `Stack`, `Input` and the other default names are now kept where React's replaced them; no app uses `LoomEditor`. Apps: none found. The only `NovaShell` users in apps, `apps/lab/fable/src/app.tsx:4` and the create-nisc React template's `with/page/src/ui/screen.tsx:5`, hand registries that have `CanvasSlot`. mythos's registry has no `CanvasSlot` (`apps/lab/mythos/src/ui/registry.ts:9`) but renders through `NovaShellProvider` and `RenderTree`, not `NovaShell`/`NovaCanvas`.

### nova — inside a loop, `model: '$.<as>.x'` writes the row it shows
- Before: in `{ for: '$.lines', as: 'line', do: { component: 'Input', model: '$.line.qty' } }` the field showed the row's `qty` but typing wrote `data.line.qty`, a root key no field shows. `model: '$.index'` showed the loop index and wrote a root `index`.
- Now: `model: '$.line.qty'` writes `lines.0.qty` (its model path is `lines.0.qty`); `model: '$.index'` binds nothing (no `model` on the node), as `model: '$index'` already did. Any other `$.name` in a loop still binds the root. What every layout shows is unchanged.
- Who notices: a layout in a loop that writes through `$.<as>`, `$.items` or `$.index`. Nested loops move too: an inner `for: '$.g.items'` inside `for: '$.groups', as: 'g'` gave a model inside it the path `g.items.0.v` in every group; now `groups.0.items.0.v` and `groups.1.items.0.v`.
- What to do: nothing.
- Breaking: yes (where the write lands)
- Affected apps: none found. Loop models in the lab apps, the templates, AnimaApp, anima-finance and mira use the `$part.answer` / `$field.value` form, not `$.<as>`, and no app nests a loop over `$.<as>.…` (AnimaApp `field.action.ts:162` loops at the root).

### nova — `for` and `model` written as one `{{…}}` keep their binding
- Before: `model: '{{$.q}}'` bound nothing, so typing changed nothing; `for: '{{$.lines}}'` iterated, but every `model` inside it lost its binding.
- Now: both bind as the bare path does (`model: '$.q'`, `for: '$.lines'`): the field's render node carries `model: { path: 'q', … }` and a `value`, and typing writes the data.
- Who notices: layouts that write `model` or a loop's `for` as a single template.
- What to do: nothing.
- Breaking: yes (such fields now write)
- Affected apps: none found in the lab apps, the templates, AnimaApp, anima-finance or mira. Layouts a model generates at run time (relay's screen builder, lyceum's screens, moss's artifactory) could contain the form; such fields now work.

### nova — `'$CAD only'` renders as text
- Before: any string starting with `$` and a letter was read as a path: `children: '$CAD only'` rendered empty, and it never reached the phrasebook.
- Now: a `$` name followed by more words is text: `'$CAD only'` renders `$CAD only`, and with a phrasebook it is looked up and reported to `onPhraseMiss` when missing. Unchanged: `'$'` alone is the innermost scope, `'$USD'` is a path (empty when there is no `USD`), `'$item.größe'` and `'$item.name '` resolve as before.
- Who notices: layouts with such text; an `onPhraseMiss` handler hears of it. Also a condition written as a `$` name and more words: `{ if: '$count > 0', then: THEN, else: ELSE }` with `count: 0` rendered ELSE (the string was read as a path that does not exist) and now renders THEN (the string is text, which is truthy); a step value `{ $if: '$count > 0', … }` the same. Neither ever compared anything: write the comparison with `{ $prism: … }`.
- What to do: nothing; add a translation if the phrasebook reports it.
- Breaking: yes
- Affected apps: none found. No layout string or condition in the lab apps, the templates, moss, loom, AnimaApp, anima-finance or mira starts with `$`, a name and more words, and no app found sets `onPhraseMiss`.

### nova — in strict mode, a failed call nothing takes is reported (`ENDPOINT_FAILED`)
- Before: a trigger with `{ call: 'save' }`, where `save` fails, no `onError` steps and no `errorTarget`, went nowhere, even with `strict: true`; `{ call: 'svae' }` (no such endpoint) went nowhere too.
- Now: with `strict: true`, `onError` receives a `NovaError` with code `ENDPOINT_FAILED`: `endpoint 'save' failed: disk full`, and `unknown endpoint: svae`. Nothing is thrown. Lax mode (the default) is unchanged. The exported `ErrorCodes` gains `endpointFailed`, and the `ErrorCode` type `'ENDPOINT_FAILED'`.
- Who notices: strict shells whose `onError` logs or shows errors; code that switches exhaustively over `ErrorCode`.
- An `onError` that throws (`(e) => { throw e }`) changes nothing: the throw goes no further, and the step, the push or the next handler runs as it did before this change.
- What to do: nothing; handle the new code if `onError` switches over codes.
- Breaking: yes (strict shells only)
- Affected apps: none. No `createShell` in the lab apps, the templates, moss, AnimaApp, anima-finance or mira passes `strict: true` (fable `src/shell.ts:16`, mythos `create-shell.ts:35`, relay `src/screen-builder/mount.ts:58`, the classic template's `with/page/src/boot.ts:12`, moss `src/shells/build.ts:187`, anima-finance `src/dev/start-check.ts:174`), and moss has no strict option.

### nova — a plain-text HTTP error body reaches `errorTarget.data`
- Before: an HTTP endpoint with `errorTarget: 'err'` whose server answered `503` with the text `Service down for maintenance` wrote `err = { status: 503, message: 'HTTP 503' }`: reading the body as JSON used it up, so the text was lost.
- Now: `err = { status: 503, message: 'HTTP 503', data: 'Service down for maintenance' }`, and `@error.data` in `onError` steps carries the text. The message is unchanged. A JSON error body is read as before. The type `FetchResponse` gains an optional `clone?: () => FetchResponse`; a real `Response` has it. A fetch that returns objects without `clone`, or a reply whose body the host already read (moss's internal wire), behaves exactly as before.
- Who notices: layouts or steps that read `errorTarget.data` / `@error.data` for servers that answer errors in plain text, or that show the whole error object.
- What to do: nothing.
- Breaking: yes (a field is present where it was missing)
- Affected apps: none found. No layout or step reads `@error.data` in the lab apps, the templates, AnimaApp, anima-finance or mira. The lab apps' 120 HTTP endpoints with `errorTarget` talk to servers that answer errors as JSON `{ message }` (for example `apps/lab/atrium/src/server/boot.ts:60-79`, `apps/lab/mythos/src/api/routes.ts:45-75`); AnimaApp's plain-text error routes (`src/server/media/index.ts:317`) have no nova endpoint with `errorTarget`.

### nova — a failure that comes back after a newer call of the endpoint came back is dropped
- Before: search "a" (slow, fails after 50 ms), then search "ab" (succeeds after 5 ms), on an endpoint with `target: 'rows'` and `errorTarget: 'err'`: the rows showed "ab", then the late failure wrote `err = 'first search failed late'` over a screen that was fine.
- Now: `err` stays as it was (`null`), as a late success already does not overwrite `target`. The failed call's `onError` steps still run. Unchanged: a failure that comes back while a newer call is still on its way is written (save row 1, then row 2; row 1's failure shows), and stays written if that newer call then succeeds, because a success does not clear `errorTarget`.
- Who notices: endpoints with `errorTarget` called again before an earlier call failed (search as you type, repeated saves).
- What to do: nothing.
- Breaking: yes
- Affected apps: four lab apps call such endpoints repeatedly, and each gets the intended result (a stale error no longer shows): `apps/lab/atrium/src/admin/app/actions/catalog.action.ts:19` and `entries.action.ts:15` (load on every filter change), `apps/lab/lyceum/src/app/actions/screens/screens.ts:90` (`type` on every keystroke), `apps/lab/encore/src/app/actions/live/move-impact.action.ts:35-49` (four endpoints re-read on each draft move). AnimaApp, anima-finance and mira: none found.

### nova — translations go in as written
- Before: on text with spaces around it (`'Price in dollars '`), a translation was put in with `String.replace`, which reads `$$`, `$&`, `` $` ``, `$'` and `$1` as patterns: `'Preis in US$$'` rendered `Preis in US$ `.
- Now: it renders `Preis in US$$ `, as the same translation already did on text without spaces.
- Who notices: phrasebooks with those sequences in a translation.
- What to do: nothing.
- Breaking: yes
- Affected apps: none found. The phrasebooks in the repo (`apps/lab/lyra/src/db/phrases.de.ts`, `src/db/seed/phrases.ts`, `apps/lab/encore/src/app/rail-phrases.ts`) contain none of those sequences; AnimaApp, anima-finance and mira have no phrasebook found.

### nova — in strict mode, a subscriber that throws is reported (`HANDLER_FAILED`)
- Before: `createShell({ strict: true, onError })`, then `shell.onStateChange(() => { throw new Error('x') })` and a push: the error was caught and dropped without a trace. The same for the shell's data and endpoint listeners, handlers on its buses, and a runtime's `onDataChange`/`onStatusChange` handlers.
- Now: in a strict shell, `onError` receives a `NovaError` with code `HANDLER_FAILED` and message `x`; the push (or write) still completes and the other handlers still run. Lax shells report nothing, as before, and a bus the app hands in (`eventBus`, `messageBus` in the shell config) is left as it is. The exported `ErrorCodes` gains `handlerFailed`, and the `ErrorCode` type `'HANDLER_FAILED'`.
- Who notices: strict shells whose subscribers throw; code that switches exhaustively over `ErrorCode`.
- An `onError` that throws (`(e) => { throw e }`) changes nothing: the throw goes no further, and the step, the push or the next handler runs as it did before this change.
- What to do: nothing; handle the new code if `onError` switches over codes.
- Breaking: yes (strict shells only)
- Affected apps: none. No shell in the lab apps, the templates, moss, AnimaApp, anima-finance or mira is strict (see the `ENDPOINT_FAILED` section).

### nova — a template-made negative `removeAt` index is reported, then applied
- Before: `{ removeAt: 'rows', index: '{{$.found}}' }` with `found = -1` (a search's "not found") removed the last row without a word.
- Now: the last row is still removed, exactly as before, and `onError` receives a `NovaError` with code `MUTATION_ERROR`: `removeAt: index {{$.found}} resolved to -1, which counts from the end (-1 removes the last element)`. In strict and lax mode. A literal `index: -1` is not reported.
- Who notices: apps whose `onError` logs or shows errors, when a `removeAt` template yields a negative index.
- An `onError` that throws (`(e) => { throw e }`) changes nothing: the throw goes no further, and the step, the push or the next handler runs as it did before this change.
- What to do: nothing if the index is never negative. If it can be (a "not found"), guard the step (`$if`) so it does not run; if it is meant (count from the end), the report can be ignored.
- Breaking: yes (a new report; the data is unchanged)
- Affected apps: six steps use a template index, and each passes an index taken from the clicked row, which is never negative, so none should see a report: `packages/create-nisc/templates/model-first/files/src/app/actions/guide/checklist.action.ts:20,21` (`'{{@event.payload}}'`), AnimaApp `src/app/actions/signup/form.action.ts:192,197` (`'{{@event.payload.at}}'`), AnimaApp `src/app/actions/store/edit-coupon.action.ts:519` and `edit-gift.action.ts:290` (`'{{@event.payload}}'`). Not checked at run time: whether every kit there sends a non-negative payload.
