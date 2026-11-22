# Upgrading past the nova "owner to confirm" fixes

Each section is one change an app can see, in `@niscorp/nova`. None of them changes nova's grammar (the action and layout schemas), so no `strata.lock.json` moves and no stored document migrates. "Breaking: yes" means an app that works on the current release can see a different result; what it must do is under "What to do". The apps checked are the lab apps in this repository, the create-nisc templates, moss, and the apps outside it (AnimaApp, anima-finance, mira).

### nova — a mount hook's navigation acts from its own instance; a late suspend no longer leaves the top action suspended
- Before: an action `opener` with `lifecycle: { mount: [{ push: { action: 'child' } }] }`, pushed over `home`, ended `home:suspended > child:active > opener:active` (the child went under the opener). `mount: [{ removeSelf: true }]` did nothing, and `mount: [{ pop: true }]` closed `home`. Separately: push a dialog over an action whose `suspend` hook takes 30 ms, pop it 1 ms later, and the action ended `suspended` on top for good, so its buttons did nothing (also with no suspend hook, when push and pop ran in one turn).
- Now: the same opener ends `home:suspended > opener:suspended > child:active`; `removeSelf` and `pop` close the opener and leave `home:active`. The action revealed by the pop ends `active` and its triggers fire. Two more things are visible: `getCanvasState` lists the new instance while its mount hook runs, and when a mount hook pushes onto another canvas the first `onStateChange` snapshot already shows the new instance on its own canvas (`main=opener aside=side`, where it was `main= aside=side`). The second snapshot, and so what moss sends in its frames, is unchanged.
- Who notices: actions whose `mount` steps navigate before their first `call` returns, and listeners that read the very first state snapshot after a push. Navigation in a call's `onSuccess` ran after the push already and is unchanged.
- What to do: nothing, unless the app relied on the old order (the child under its opener, or `pop` in a mount hook closing the action below). Still open, unchanged: a mount hook that pushes a child pushes it again whenever the opener is revealed, because `resume` re-runs `mount`.
- Breaking: yes
- Affected apps: none found that change result. `apps/lab/lyceum/src/app/actions/slide/nova.actions.ts:49` runs `resetTo` on canvas `demo` at the start of a mount hook: only its first state snapshot now already lists the slide. `apps/lab/atrium/src/app/actions/domains/staff/menu.action.ts:35` and `apps/lab/lyceum/src/app/actions/stage/deck.action.ts:6` navigate in a call's `onSuccess`, which is unchanged. No `onStateChange` listener found reads the first snapshot (`apps/lab/atrium/src/server/assistant/watch/index.ts:250`, `apps/lab/lyceum/src/server/placement.ts:53`, moss `src/shells/stream.ts:90` ignore its content or subscribe later). AnimaApp, anima-finance and mira: no mount hook found that navigates before a call returns.

### nova — a field with a `ref` inside a loop writes its own row
- Before: `{ for: '$.lines', as: 'line', do: { component: 'Input', ref: 'qty', model: '$line.qty' } }` over three rows gave all three fields the model ref `qty`; typing 5 into the first row gave `lines = [{qty:1},{qty:1},{qty:5}]`.
- Now: each row's field has the model ref `qty@lines.0.qty`, `qty@lines.1.qty`, …; typing 5 into the first row gives `[{qty:5},{qty:1},{qty:1}]`. The field's `ref` stays `qty`, so clicks and a DOM `data-ref` are as before, triggers on `ref: 'qty'` fire for every row and read `@event.ref` as `qty`, and a `ui:model` dispatched by hand with `ref: 'qty'` still writes the last row. The row's model ref does not change when rows are added, so a field being typed in is not rebuilt.
- Who notices: code that reads `model.ref` from a render tree for such a field and compares it with the written `ref`; the TTY command list (`set` targets, a field's label when it has no text) and moss's terminal render trees show the longer name. Kits that dispatch `ui:model` with the node's `model.ref` keep working unchanged.
- What to do: nothing, unless code compares a loop field's `model.ref` with its written `ref`: compare the node's `ref` instead. A terminal script that typed `set qty …` for such a field types `set qty@lines.0.qty …`.
- Breaking: yes
- Affected apps: none found. No field in the lab apps, the templates, AnimaApp, anima-finance or mira has both `model` and `ref` inside a loop (the loop fields in AnimaApp `signup.parts.ts`, `field.action.ts:28`, `edit-wear.action.ts:378`, `invites.action.ts:12`, and mira `src/app/actions/automation/card.layout.ts:150` have no `ref`). Every kit found dispatches `ui:model` with `novaModel.ref` from the node (for example `packages/create-nisc/templates/react/files/src/ui/kit.tsx:188`, mira `src/ui/kit/input.tsx:118`), which keeps working. moss's TTY `set` command (`packages/moss/src/terminal/tty/commands.ts:71`) shows and accepts the longer name for such fields. Layouts generated at run time (relay's screen builder, lyceum's screens) could produce such a field; they then get the per-row behaviour.

### nova — bindings never read what every object inherits; a record's own prototype counts
- Before: `{{$.x.constructor}}` rendered `function Object() { [native code] }`, and `$toString` read a function. On this branch before the release, a `functions` object made with `Object.create({ hello })` or as a class instance no longer found `hello` (the call failed with `LIFECYCLE_ERROR`); in the last release it was found.
- Now: `$.x.constructor`, `$.x.toString` and `$.x.__proto__` are `undefined` (the text renders empty). `Object.create({ hello })` as `functions` calls `hello`, as in the last release; the same holds for endpoints, phrasebooks and reconcilers. A getter on a class the data carries (`$.person.full`) still reads, and `fn: 'toString'` still fails as an unknown function.
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
- Affected apps: none found. The only `NovaShell` users, `apps/lab/fable/src/app.tsx:4` and the create-nisc React template's `with/page/src/ui/screen.tsx:5`, hand registries that have `CanvasSlot`. mythos's registry has no `CanvasSlot` (`apps/lab/mythos/src/ui/registry.ts:9`) but renders through `NovaShellProvider` and `RenderTree`, not `NovaShell`/`NovaCanvas`.

### nova — inside a loop, `model: '$.<as>.x'` writes the row it shows
- Before: in `{ for: '$.lines', as: 'line', do: { component: 'Input', model: '$.line.qty' } }` the field showed the row's `qty` but typing wrote `data.line.qty`, a root key no field shows. `model: '$.index'` showed the loop index and wrote a root `index`.
- Now: `model: '$.line.qty'` writes `lines.0.qty` (its model path is `lines.0.qty`); `model: '$.index'` binds nothing (no `model` on the node), as `model: '$index'` already did. Any other `$.name` in a loop still binds the root. What every layout shows is unchanged.
- Who notices: a layout in a loop that writes through `$.<as>`, `$.items` or `$.index`.
- What to do: nothing.
- Breaking: yes (where the write lands)
- Affected apps: none found. Loop models in the lab apps, the templates, AnimaApp, anima-finance and mira use the `$part.answer` / `$field.value` form, not `$.<as>`.

### nova — `for` and `model` written as one `{{…}}` keep their binding
- Before: `model: '{{$.q}}'` bound nothing, so typing changed nothing; `for: '{{$.lines}}'` iterated, but every `model` inside it lost its binding.
- Now: both bind as the bare path does (`model: '$.q'`, `for: '$.lines'`): the field's render node carries `model: { path: 'q', … }` and a `value`, and typing writes the data.
- Who notices: layouts that write `model` or a loop's `for` as a single template.
- What to do: nothing.
- Breaking: yes (such fields now write)
- Affected apps: none found in the lab apps, the templates, AnimaApp, anima-finance or mira. Layouts a model generates at run time (relay's screen builder, lyceum's screens, moss's artifactory) could contain the form; such fields now work.
