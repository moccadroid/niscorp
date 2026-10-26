# @niscorp/nisc

## 0.8.2

### Patch Changes

- 49a4766: `npm create nisc` makes an app from items instead of four whole templates. Each answer is a folder under `templates/` — `moss` or `page`, `react` or `dom`, and the kind of app — with its files, its files for another item (`with/<item>/`), its `package.json` fragment, the keys it asks for and its lines in AGENTS.md and PLAN.md; the questions are `templates/questions.json`. The command names no item, so a new kit, shell or kind of app is a new folder, and its flag follows from it. The four apps it made before come out as they were, but for a sentence: the welcome screen no longer says which kit draws it, PLAN.md's scaffold step says "the files `npm create nisc` wrote", and AGENTS.md's line for `nisc.config.ts` is one sentence for both shells.

  An item that needs keys asks for them masked, after the questions, and writes them to `.env` (`.env.example` gets the names); with no terminal they are read from the environment, never from a flag. `--workspace` keeps `workspace:^` ranges, for an app made inside the nisc repository.

- 49a4766: `npm create nisc` asks who leads. **Model-first** (`--model-first`) is a moss app where a person types a message and the answer is a screen: up to six canvases, each an action opened with an input, on the areas of an arrangement (`src/app/arrangements.ts`) or a grid the model writes. One dock at the bottom holds the screens, a chip naming the answer shown with back, forward and every answer to go back to, and the line to ask in.

  Jev, a fast decision model, reads the message and the open screen and says which actions likely belong; gpt-oss-120b on Groq composes the screen as a cortex agent, naming only the areas that change, and its reply is checked against the app's actions, their input schemas and the arrangements, and corrected inside the run when it does not hold. The answer streams in. What a person presses, ticks and picks stays on the screen, the model sees it, and an answer gone back to shows it as it was left. A card's link opens a screen at once; only what is typed, or a thing to ask pressed, goes to the model. Every message is recorded as a run for each model it went to, through `session.recordRun`. It asks for its keys — Groq, and TypeSafe for Jev — and writes them to `.env`.

  The app starts as a tour of nisc: five screens of cards to read, and a counter, a checklist and a quick check to use, which the model can fill in too. Its AGENTS.md says how to remove the tour — a folder, a check, and edits in five files — and what to build next. The checks run the loop offline with a scripted decision model and chat model, and `src/dev/live-ask.ts` asks the real models a run of cases.

  Both kits gain the components it uses — a frame, the dock, a menu, a grid and its areas, a card, code, points, steps, a checkbox, an input and the line to ask in — and a classic app has them too. The stylesheet gains their look. `src/dev/strata.ts` is each kind's own: a model-first app's also records its frame and arrangements.

## 0.8.1

### Patch Changes

- 8eaea60: The docs say where `server.checkFunctions()` goes: after every route of the app's own, before it listens.

  Nobody's shell makes its reads in-process, and the server takes no route once it has answered one: a route mounted after the check throws `Can not add a route since the matcher is already built.` moss's DOCS, nisc's AGENTS and the cli README say so.

- 1a67306: `nisc start` checks the app's functions after the project's `routes` and the site are mounted.

  Checking the functions answers requests in-process, and the server takes no route once it has answered one. An app with functions whose first screen reads as it mounts failed to start: `Can not add a route since the matcher is already built.`

- Updated dependencies [8eaea60]
- Updated dependencies [1a67306]
  - @niscorp/moss@0.8.1
  - @niscorp/cli@0.8.1

## 0.8.0

### Minor Changes

- 2076f80: `session.draft.add` is what `session.draft.put` was. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-18: rename `session.draft.put(...)` to `session.draft.add(...)`. Nothing else about it changes: it takes what `save` takes, what is added is in that one shell when the add answers, and `save`, `discard`, `show`, `remove` and `list` are as they were.

- cdc89cc: `server.checkFunctions()` reads the app's functions and refuses what is wrong with them before anyone is served. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-18: `serve` of `@niscorp/moss/node`, and `nisc dev`, `nisc build`, `nisc check` and `nisc start`, refuse to come up on an action that calls a function the app has no function of, a charter `functions` deny that matches nothing, or two functions under one id. An app that hands a function only to signed-in sessions, with a shipped action calling it, hands it to every session (the function refuses whom it must), or is refused.

  An app's functions are known only once a session is: `functions(session)` is called for each shell, and a session hook may reach for the server object, which the app holds only once `createServer` has answered. So the check is the app's to call, once it holds the server and before it listens; `serve` of `@niscorp/moss/node` calls it, and so do `nisc dev`, `nisc build`, `nisc check` and `nisc start` after the project's `boot`; each closes what it built where it refuses. It builds nobody's shell once, after everything is in force, and drops it. What that call returned is checked, and it refuses on:
  - **an action, or a fragment a shell ships, that calls a function the app does not have**: `"home" calls "auth.leave", which the app has no function of`. Before, the call failed when a person pressed the button. An app with no `functions` has none. A set of actions handed over while the app runs is held to the same at that refresh.
  - **a charter `functions` deny that matches nothing**: `Charter is incoherent over the app’s functions — refusing to serve:`.
  - **two functions under one id**: `moss: functions(session) returned "auth.leave" twice.`

  What the charter only warns of (a grant that names no function, a function no role grants), the functions with no description, and a map of handlers are said at that point, once.

  The cost is one anonymous shell built, as any visitor who is not signed in causes. Every check reads nobody's functions: an app that hands a function only to signed-in sessions is refused where an action calls it.

### Patch Changes

- edd3271: `session.answerIntent(writers, asked)` also replays a query that exists: `asked` may be `{ fingerprint, context }`.

  It is answered as the caller, as an intent is, with what vex knows of the query: the context keys it binds, the ones the call left out (`meta.missingContext`), its warnings. The wire answers a replay with the rows alone. A model that proves a query before it builds on it learns from this why a replay came back empty.

- f461b98: What a person generated and nobody has used for long enough is deleted, with `runtime.artifactsUnusedMs`.
  - A version of an artifact a person saved is stamped as used (`artifacts.last_used_at`, migration `nisc.moss/6`) when a shell is built for them, once an hour at most, through the same vex entries and row rule as the save itself.
  - A sweep runs as the server comes up and then every hour: every artifact of a person whose newest version was neither saved nor used within `artifactsUnusedMs` is deleted, every version of it, and the saves left empty with them. What is published for everybody (`*`) never ages; what the build ships is not a row.
  - Without the setting nothing is deleted. `0` or less refuses the boot.
  - The sweep is one raw statement in moss (`data/aging.ts`), entered in the raw-SQL ledger: vex keeps every statement of its own to one principal's rows, and the sweep crosses them all.

- 37422bf: `server.defaults(publisher)` publishes every kind a person saves: an action, a fragment and a read, beside a layout.
  - **An action or a fragment is given its id by whoever publishes it**, as a shipped one has one: `server.defaults(who).save([{ kind: 'action', id: 'promo', body }])`. One without an id is refused (`moss: a published action is given its id by whoever publishes it: name it.`), and so is one under `generated.`. The charter grants it by that id: a new id needs a grant, and one that is a shipped action's or fragment's replaces the build's for everybody until it is reset.
  - **A read vex wrote is published under its fingerprint**, `save([{ kind: 'read', id: '<fingerprint>' }])`, and is answered to everybody, nobody signed in included, after what the caller saved themselves. One under the fingerprint of a shipped entry is refused. A generated action anybody saves may replay it.
  - **Checked as a person's save is, as the publisher, and then as a manifest.** An action's `fn:` calls are ones the publisher's roles grant and its reads ones they may replay; then the whole set in force is verified as a set handed over is, and a holder whose roles do not grant a call refuses the publish: `Publish refused — actions call functions the app does not have, or that their holders’ charter does not grant:`.
  - **A default that no longer passes under a new build is left out, and the build's copies stand**, with a line said once per read of the rows: `[moss] what is published for everybody is left out, and the build’s copies stand: …`.
  - `publishedArtifacts(saved, publisher)` of the running manifest takes who publishes, for the roles and reads a publish is held to; `server.defaults` resolves them from the publisher's principal.

- Updated dependencies [edd3271]
- Updated dependencies [f461b98]
- Updated dependencies [2076f80]
- Updated dependencies [cdc89cc]
- Updated dependencies [37422bf]
- Updated dependencies [63b9ab5]
- Updated dependencies [6a62604]
- Updated dependencies [c952ab0]
- Updated dependencies [6680ad6]
- Updated dependencies [6680ad6]
- Updated dependencies [1c78d6d]
  - @niscorp/moss@0.8.0
  - @niscorp/cli@0.8.0
  - @niscorp/nova@0.5.0
  - @niscorp/loom@0.5.0
  - @niscorp/signal@0.1.5
  - @niscorp/vex@0.4.1
  - @niscorp/cortex@0.1.4

## 0.7.0

### Minor Changes

- e9b987e: Moss holds an app's entries itself, in memory, and copies none into `vex_cache`. `server.replaceEntries(source, entries)` hands a set of entries over while a server runs. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-12: an app that runs a vex engine of its own over `runtime.cache` gives that engine the entries it replays (`seedCache(cache, entries)`), and an app that wrote an entry into that table for moss to serve hands it over with `server.replaceEntries(source, entries)`.
  - **Where a fingerprint resolves.** The entries an app ships are read from the build at every boot and held by the running manifest, compiled as vex replays them. The engine asks it first, and the cache table (`vex_cache`, or what `runtime.cache` hands over) only for what vex wrote itself while the app runs, such as a query `session.answerIntent` wrote. A boot still refuses an entry vex cannot run.
  - **Nothing is copied into the cache table, and a row in it that no request wrote is not replayed.** Until now every entry was written there at each boot, and a replay resolved in the table. Moss now answers from the table only for a row vex wrote for a request (it carries that request's hash). The rows an earlier release wrote stay where they are and are answered from no longer: an entry the app stopped shipping is refused (`cache_miss`), where it went on answering before. Moss deletes none of them.
  - **`server.replaceEntries(source, entries)`** is new, and is to entries what `server.replaceActions` is to actions: a named set, replaced whole, checked before it is taken (the schema the manifest's entries are read by, vex's authoring lint for a write, the reach it declares), frozen, and this process's alone. An entry of a set is replayed in place of one the app shipped under the same fingerprint.
  - **The list of fingerprints** a feature or a discovery is told of holds the entries in force and the queries vex wrote. An app whose `runtime.cache` could not list its rows (vex's tiered cache) was told of none; it is told of the entries in force now.
  - **`nisc migrate`** is as it was. Its pass for an entry that already did not fit before a run asks the cache table for a copy of that entry. Moss writes no such copy from this release on, so in a database only moss writes to, an entry first shipped from now on gets no pass. A copy an earlier release wrote, or one the app writes itself for an engine of its own, still gives one.
  - **What a discovery says of an entry of the app.** `createdAt` is when this process compiled it, and `lastUsedAt` is not said: a replay of an entry moss holds stamps nothing. Both came from the row in the table before.
  - **The refusal for a set that is not the caller's** says `the set "…"` where it said `the set of actions "…"`: a set holds entries too.
  - The CLI and `@niscorp/nisc` change in the moss they bring; `AGENTS.md` says where entries are held.

- fc96c47: `functions(session)` returns a list of `FunctionDefinition`, `{ id, description, execute }`, and `session.functions()` lists each function a session may call with its description.

  ```ts
  functions: (session) => [
    {
      id: 'notes.archive',
      description: 'Archives one of the person’s notes. Send { id }.',
      execute: async ({ id }, signal) => archive(session, id, signal),
    },
  ],
  ```

  - **`id`** is what the charter's `functions` and every `fn:` endpoint name. **`execute`** is what an `fn:` endpoint calls, `(data, signal) => Promise<unknown>`, as a handler in the map was. **`description`** says what it does and what to send, for the model that writes a call to it: `session.functions()` answers `[{ id: 'notes.archive', description: '…' }]`.
  - **Two functions under one id are refused** when a shell is built: `moss: functions(session) returned "auth.leave" twice.`
  - **A map of handlers by id still works, and is deprecated.** The first shell a process builds says once what to change, read off what that session was given: `[moss] functions(session) returned a map of handlers, which is deprecated: return a list of { id, description, execute }.`, or, for a list, `[moss] functions with no description: auth.leave. Give each a description.` An empty description counts as none; such a function, and one given by a map, is listed by its id alone.
  - `FunctionDefinition` is exported, for a helper that returns some of an app's functions.

  For whoever upgrades an app, person or agent: turn the map into a list, one `{ id, description, execute }` for each handler, the id being its key; a helper that returns part of the map returns part of the list, and the parts are joined with `[...a, ...b]`. Write each description as what the function does and what to send.

- 9e6a7c3: The charter decides which of an app's functions a principal may call. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-14: give every role of the charter a `functions` part, the functions its actions call, or `functions: ['*']` to keep calling all of them; a role written as a list (`member: ['home', 'settings']`) becomes `member: { actions: ['home', 'settings'], functions: [...] }`.
  - **A shell holds only the functions its principal's roles grant** (`functions`, beside `actions`, `data` and `layouts`, with the same globs, `extends` and `deny`). A role with no `functions` may call none. Before, every shell held every function. A living shell follows the roles an adopt answers, as its actions do.
  - **The boot is refused, with the list of what to grant**, where a role on its own, a combination people wear, or `public` holds an action (or the shells ship a fragment) that calls a function its grants miss: `"member" hold "chrome.topbar", which calls "auth.leave": their functions do not grant it`. A name with a template in it is decided when it is called.
  - **`'*'` is said at boot**: `role "member" allows every function ('*'): the generated actions of the people who hold it, or a role that extends it, may call any it does not deny`.
  - **A grant that names no function** (a typo) is said at the first shell a process builds, with a deny that matches nothing and a function no role grants: the names of the app's functions are known once `functions(session)` has run, and are read as that first session's.
  - **A generated action or fragment may call a function its owner's roles grant**, named written out; one they do not grant is refused when it is saved and left out when a shell is built. `session.functions()` lists the functions a session may call, `{ id, description? }`, for the model that writes one.
  - `@niscorp/charter` has the `functions` section, and `verifyCharter` checks it where a `functions` universe is handed in.

  For whoever upgrades an app, person or agent: boot it. The refusal lists, per role combination, each function an action calls that the charter does not grant. Add those names to the `functions` of the role that holds the action, or `['*']` to the roles whose people may call everything. This is the app's permissions table: write it deliberately, and do not generate it.

- b7fabdb: Moss keeps every action's layout in the shell's layout store, under `action/<id>`. A layout that changes now reaches a screen that is already open. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-12 (`action/`) and 2026-10-13 (`frame`, `canvas/`): a manifest's `layoutStore` declares no name beginning with `action/` or `canvas/` and not the name `frame`, no action's layout and no layout variant names one of those by ref, and code that takes the whole shell (`unverifiedShell(session)`) to read an action's layout off a definition reads it from the layout store (`shell.layoutStore.get('action/<id>')`).
  - **An open screen follows a layout that changed, with its data kept.** A set of actions handed over with `server.replaceActions` used to reach only a screen opened afterwards: an instance that was open kept the layout it was opened with. What an open instance still keeps is the rest of its definition (its data's shape, its endpoints, its triggers).
  - **Where the layout is kept does not show to an app.** An app writes an action's layout in its definition as before. `server.actions()` answers it as written, and so does a definition read off a session's shell (`session.shell.getRuntime(id).definition`), with the layout the screen is drawn with now in place. Inside nova's own shell, which `unverifiedShell(session)` hands out, the definition names its layout by `{ ref: 'action/<id>' }` and the store holds the layout, or the layout variant the person's roles hold. An action with no layout, or one whose `layout` is the name of a stored layout, is handed over as it is.
  - **A session's shell hands out its layout store to read.** `set` and `delete` on `session.shell.layoutStore` throw, as `setLayout` does. They went through before.
  - **`action/` is moss's in a layout store.** A manifest whose `layoutStore` declares a name beginning with it, in the app's shell or in a page, refuses the boot and says where. So does an action's layout or a layout variant that names one, at boot and when a set of actions is handed over: a layout cannot be drawn inside itself.
  - **The layout of an action that leaves a shell is taken out of its store.**
  - **The shell's own layout and a canvas's are kept in the store too**, under `frame` and `canvas/<id>`, and the shell draws each by that name. An app writes `layout` and a canvas's `actionLayout` as before, and a screen is drawn as before; one that is the name of a stored layout is handed over as it is. A manifest whose `layoutStore` declares `frame`, or a name beginning with `canvas/`, in the app's shell or in a page, refuses the boot and says where. So does an action's layout or a layout variant that names one of them, at boot and when a set of actions is handed over. A layout is named by a node that is `{ ref }` and nothing else: a `ref` a component carries, on its node or in its props, names none.
  - **Whether a page can still do something is read through every ref.** A layout a screen names by `{ ref }` is read where the store holds it, so a two-way bound field in a stored layout the app names itself makes its page live. It was missed before, and such a page was reported as a file.
  - The CLI and `@niscorp/nisc` change in the moss they bring.

### Patch Changes

- 4dc982a: Moss keeps what was generated while the app runs for the person who saved it (a layout, an action, a fragment), and a layout an app publishes for everybody.
  - **`session.artifacts`, on the session an app's functions are handed.** `save`, `list`, `history`, `restore` and `reset`. A layout is saved for the action it is for (`{ kind: 'layout', body: { ref: 'action/<id>', layout, use? } }`). It is the session's principal's alone, gets its id from moss, and is drawn on their screens while it is marked `use: true`; their open screens follow at once, with their data kept. Who may save is the charter's: the function that calls it is the app's, and the charter says who holds the action that calls that function. A session nobody is signed in to saves nothing.
  - **A row is its principal's, and vex keeps it so.** Moss reads and writes the two tables as the caller, under one row rule: a caller reads and writes only the rows whose `principal` is their `userId`, and a row they insert or update carries it. No call names whose rows are meant. The same rule is part of the policy an app's charter compiles to, so a role that is granted the tables, by name or by a wildcard, reaches its own rows there and nobody else's. A row of `artifact_saves` is moss's alone to make: an app's entry that inserts or updates one is refused. An app's `behaviors` that name `artifacts` or `artifact_saves` refuse the boot.
  - **`server.defaults(publisher)`, on the server: what is published for everybody.** The same five calls and the same body. A published layout is drawn for everybody who holds its action; every living shell adopts it at once, and every other process follows the generation pointer, which a publish moves. It is kept as the rows of one principal no caller is (`*`), under the same row rule, with who published in `created_by`. No session can publish: only the app's own server code reaches the call, and the charter says who holds the action that makes it. One read of what is published answers every shell a process builds: a boot makes it, and the first shell after a publish there or a move of the pointer makes it again.
  - **`session.artifacts` also keeps an action and a fragment** (`kind: 'action'`, `kind: 'fragment'`). Moss gives the id, `generated.` and a uuid; a body that names another is refused. It is its owner's alone: it is in the shells built for them and in nobody else's, and in no catalog. What it defines replays reads and calls the functions its owner's roles grant: each endpoint is a `POST` to the app's vex route naming one fingerprint of a read the app ships or was handed and its owner may replay, or of a read vex wrote that its owner saved, or an `fn:` endpoint to a function its owner's roles grant (see the charter's `functions`); a write, a query a model wrote that nobody saved and every other address are refused, and so is a generated action that opens an action its owner does not hold. Moss checks the artifact; once it is in a shell it is an action or a fragment like any other, on nova's channels and in nova's merge of a fragment into the action it is wrapped around. It is checked at the save and at every shell, and one that no longer passes is left out with a line. `session.actions`, and the `actions` the `inputs` and `seeds` hooks are handed, are the ids the shell was built with, so they hold a principal's generated actions too.
  - **`session.draft`, on the same session: what is being generated in one shell, before it is saved.** `put` takes what `save` takes, runs the same check with the draft laid over what is in force and against what that one shell can draw, and answers when that shell has it, so a function puts an action and opens it on its next line. `list`, `remove` and `discard`; each put or removal is a numbered step, and `show(step)` has the shell show the draft as it was after it; `save` is one save of all of it under the ids it had. A draft is in no other shell, is saved nowhere, and is gone when its shell is.
  - **An id beginning with `generated.` is moss's to give.** A boot and `replaceActions` refuse an action under one, and the manifest's parse refuses a shell's fragment under one.
  - **No caller's `userId` is `*`, and no caller's scope carries `artifactSavedBy`.** For one whose sign-in or `scope` says either, no shell is built and `/api/vex` answers 500.
  - **Under an action's ref a shell draws**, the first of these there is: the person's own layout marked in use, the layout variant their roles hold, the published layout marked in use, the build's.
  - **Every save is a version, and moss changes and deletes none.** Going back to a version is a new save that holds a copy of it; a reset is a new save that says none is in force, and the layout under it is drawn again.
  - **A layout is checked when it is saved and when a shell is built**: its shape, that the action it is for has a layout of its own and is held by whom it is saved for, its components against what the app's shells have, that it names no ref moss keeps a layout under (`action/…`, `canvas/…`, `frame`), and what nova's audit finds of its action with the layout in place and not of the action as it is built. A save is refused with a sentence. A saved layout that no longer passes is left out with a line in the log, and what is under it is drawn.
  - **Two tables, in migration `nisc.moss/5`: `artifact_saves` and `artifacts`.** A deployment that boots with `migrations: 'verify'` runs `nisc migrate` first, as for every migration. An app whose database already has a table by either name renames its own before it takes this release.
  - **The fabric carries one more message, `adopt`**: it names a principal and tells a process to bring the shells it holds for them level. A process that runs an earlier release drops it as a message it does not know, as it drops every such message.
  - **The layouts of the app's own shell are saved the same way: its own under `ref: 'frame'`, a canvas's under `ref: 'canvas/<id>'`**, by a session for its principal and by `server.defaults` for everybody. The app's own shell draws the person's own in use, else the published one, else the one its manifest declares; their open screen follows at once. A page draws the layout it declares. A shell manifest with no `layout`, or a canvas with no `actionLayout` of its own, has none to take the place of, and a save for it is refused. It is checked as a layout for an action is, against the components of the app's own shell and without nova's audit. A frame that leaves a canvas of the shell out is saved as it is: that canvas is drawn nowhere.
  - **A canvas that only a layout's slot draws goes when the slot goes.** Nova gives a shell a canvas when something is first pushed onto it. Where a layout in force for a principal holds a canvas slot with a written-out `canvasId` for a canvas their shell's manifest does not declare, and then no layout does (the saved layout was reset, the action left the shell), an open shell loses that canvas with what is mounted on it. It stayed before, drawn nowhere. The canvases a manifest declares are never taken out, and moss gives a shell none.
  - **A read vex wrote is kept the same way** (`{ kind: 'read', id: 'fp_…' }`, no body): moss takes the query and the Prism config of its mapping from vex's table. It is answered to the person who saved it and to nobody else (never to a caller nobody is signed in for), held to vex's limits as a query vex wrote is, it survives a schema change that does not touch what it reads, and their generated actions may replay it. One whose query no longer runs is left out with a line, with the generated actions that replay it. Moss's data layer hands vex's table only what vex wrote for a request: a saved read vex replays is not copied into it.
  - Not built yet: publishing an action, a fragment or a read; a layout of a page's shell.
  - The CLI and `@niscorp/nisc` change in the moss they bring. `AGENTS.md` gains rule 7b: how a layout, an action or a fragment generated while the app runs is saved or kept in a draft, how a layout is published for everybody, and that the charter decides who may do either.

- c7c4f9b: A nova shell keeps actions and fragments in one registry. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-13: `shell.registerFragment` is gone, and an action and a fragment no longer share an id.
  - **`shell.registerAction(definition)` takes an action or a fragment**, told apart by the fragment's `kind: 'fragment'`, and **`shell.removeAction(id)` takes either out**. There was no call to take a fragment out. Taken out, a fragment is unknown to a later `with: [...]`; an instance that was opened with it keeps the definition it was composed into, and `back` skips a position that was opened with it, as it skips one it cannot put back.
  - **A fragment handed to `createShell` is validated**, as an action is: one that does not parse throws `DefinitionValidationError` at construction. Only `registerFragment` validated one before.
  - **An id names an action or a fragment, never both.** `createShell` and `registerAction` throw `DefinitionValidationError` for an id that is already the other kind's.
  - Opening a fragment by itself still throws `UnknownActionError`, and a `with: [...]` that names an action still throws `UnknownFragmentError`. `ShellConfig` keeps `actions` and `fragments`.
  - **Moss:** a fragment that is no longer answered for a principal is taken out of their open shell, as an action is. A boot, and a set of actions handed over, refuse an action under the id of a fragment a shell ships. On a session's own shell, `registerAction` (refused there as before) is the one call that would take a fragment.

  **What to change:** `shell.registerFragment(fragment)` becomes `shell.registerAction(fragment)`. Give an action and a fragment that share an id two ids.

- Updated dependencies [0a7beae]
- Updated dependencies [e9b987e]
- Updated dependencies [fc96c47]
- Updated dependencies [9e6a7c3]
- Updated dependencies [b7fabdb]
- Updated dependencies [4dc982a]
- Updated dependencies [c7c4f9b]
- Updated dependencies [4068f98]
  - @niscorp/moss@0.7.0
  - @niscorp/cli@0.7.0
  - @niscorp/charter@0.1.4
  - @niscorp/nova@0.4.0
  - @niscorp/loom@0.4.0
  - @niscorp/vex@0.4.0

## 0.6.1

### Patch Changes

- Updated dependencies [1dcccd7]
- Updated dependencies [a4ccf0e]
- Updated dependencies [c8cbc05]
- Updated dependencies [d6b2c4a]
- Updated dependencies [037d26c]
- Updated dependencies [f55fcbe]
- Updated dependencies [89adcc3]
- Updated dependencies [a8b7133]
- Updated dependencies [2e73b96]
- Updated dependencies [9b7ccbe]
- Updated dependencies [f62ee50]
- Updated dependencies [b4d24e9]
- Updated dependencies [bf6496f]
  - @niscorp/cortex@0.1.4
  - @niscorp/loom@0.3.1
  - @niscorp/nova@0.3.1
  - @niscorp/prism@0.3.1
  - @niscorp/signal@0.1.4
  - @niscorp/strata@0.1.7
  - @niscorp/tide@0.1.7
  - @niscorp/vex@0.3.1

## 0.6.0

### Minor Changes

- `server.invalidateTenant(tag)` is `server.invalidateTag(tag)`. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-12: call `server.invalidateTag(tag)` where the app called `server.invalidateTenant(tag)`.
  - It forgets every identity record that carries one cache tag (`IdentityRecord.tag`). The field named the mechanism and the method named one use of it, a tenant, which moss does not know. The method is named for what it takes. It does what it did.
  - The signal it sends the other processes of a deployment is `invalidate-tag`, where it was `invalidate-tenant`. Processes on the old and the new release do not hear each other's during a rolling deploy: a record forgotten in one is forgotten in the other when it is next resolved again (`sessionRevalidateMs`).
  - Nothing else of moss changes, and the CLI and `@niscorp/nisc` change only in the moss they bring.

### Patch Changes

- Updated dependencies
  - @niscorp/moss@0.6.0
  - @niscorp/cli@0.6.0

## 0.5.0

### Minor Changes

- 0b25acc: Moss is rebuilt as modules, and its public API is what an app is meant to call. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-09: import only what `@niscorp/moss` still exports (the list is `packages/moss/api.txt`); the changes an app has to make are listed below, one per part.

  Moss had grown to twenty-eight files flat in `src/`, one of them a single function of 1,345 lines, and it exported 135 names of which 71 were imported by nothing outside the package. `docs/plans/moss-refactor.md` says how moss is built now; the audit is in that file's history.

  **How to read this.** The parts are in eight groups, in the order an app meets them: (1) what is imported from where, (2) the manifest, (3) the session and who is calling, (4) integrations, (5) a write and tide, (6) the socket and the shells, (7) pages and the Node entry, (8) the terminal. Each part says what changed and what an app writes instead, and a part that asks nothing of an app says so. The last part, "What an app changes", is the list to work down.

  **(1) WHAT IS IMPORTED FROM WHERE**

  **The main entry exports 30 names, not 135. All eighteen entries together export 90, where fourteen exported 185.**

  106 names left the main entry and one arrived (`verifyApp`). Every name that left is in this table, with what to write instead. A name stays where it is the one way to do something an app is meant to do, or the type of something an app writes; a second way to what the server answers, a part of something exported whole, and a type that only names what an exported function takes or answers and that nothing imports, left.

  | Was imported from `@niscorp/moss`                                                                                            | Write instead                                                                                                                                                                                                                                                                                                                                               |
  | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `createAssertionSigner`                                                                                                      | the same name, from `@niscorp/moss/integrations`                                                                                                                                                                                                                                                                                                            |
  | the type `StorePress`                                                                                                        | nothing to import. A host copies a listing's images itself, in `extension.prepare` ("What a host with a store takes over", below)                                                                                                                                                                                                                           |
  | `integrationOfAction(actionId)`                                                                                              | `integrations.integrationOfAction(actionId)`, on the object `createIntegrations` answers                                                                                                                                                                                                                                                                    |
  | the type `CallIntegration`                                                                                                   | `Integrations['callIntegration']`, with `Integrations` from `@niscorp/moss/integrations`                                                                                                                                                                                                                                                                    |
  | `createTideStore`, `TIDE_SEQUENCE`, `TIDE_TABLES`, `TIDE_DDL`, the type `TideStoreOptions`                                   | the same name, from `@niscorp/tide/postgres`                                                                                                                                                                                                                                                                                                                |
  | `createTideDriver`, the types `TideDriver`, `TideDriverConfig`                                                               | the same name, from `@niscorp/tide`                                                                                                                                                                                                                                                                                                                         |
  | the type `FactIntake`                                                                                                        | `Pick<Tide, 'ingest'>`, with `Tide` from `@niscorp/tide`: what `tide` in `createTideFacts` answers                                                                                                                                                                                                                                                          |
  | `integrationByKey(pool, key)`                                                                                                | `integrations.integrationByKey(key)`, on the object `createIntegrations` answers ("Integrations are a feature", below)                                                                                                                                                                                                                                      |
  | `listAttachments(pool, hostAction)`, `listPlacements(pool)`                                                                  | `integrations.listIntegrations()`: every registered integration with its stored `extension`, where the host's own vocabulary keeps what is attached and placed ("A bundle is nisc's own fields and `extension`", below)                                                                                                                                     |
  | `callIntegrationWith`                                                                                                        | `integrations.callIntegration(id, path, init)`                                                                                                                                                                                                                                                                                                              |
  | `listIntegrations(pool)`, the type `IntegrationRow`                                                                          | `GET /operator/integrations` with the operator key answers `{ integrations }`                                                                                                                                                                                                                                                                               |
  | `describePlacements`                                                                                                         | nothing to import. The sentence is the host's to write, from its own vocabulary: in `extension.prepare`, kept with the rest of the extension                                                                                                                                                                                                                |
  | `buildContract`, `contractAsMarkdown`, the type `Contract`                                                                   | `GET /api/integrations/contract`, and the same with `?format=md`                                                                                                                                                                                                                                                                                            |
  | `runIntake`, `copyPress`, `initIntegrations`, the types `Bundle`, `IntakeContext`, `IntakeResult`, `PressResult`             | nothing to call. Registering an integration (`POST /operator/integrations`) runs intake, and `createServer` and `migrateTables` create the tables                                                                                                                                                                                                           |
  | `mintIntegrationKey`, `hashIntegrationKey`                                                                                   | nothing to call. A key is minted when an integration is registered and answered once; `integrations.integrationByKey(key)` says whose a key is                                                                                                                                                                                                              |
  | `verifyAssertion`, the type `Assertion`                                                                                      | an integration's service verifies an assertion itself. The token is `<body>.<signature>`, both base64url; the signature is ed25519 over the body's bytes, under the key `GET /api/integrations/verify-key` answers (SPKI DER, base64); the body is JSON, `{ integration, principal, scope, iat, exp }`                                                      |
  | the type `AssertionSigner`                                                                                                   | `ReturnType<typeof createAssertionSigner>`                                                                                                                                                                                                                                                                                                                  |
  | `resolveCatalog(app, principal)`                                                                                             | `(await server.catalogOf(principal)).ids`                                                                                                                                                                                                                                                                                                                   |
  | `resolveCatalogForRoles(app, roles, installed)`, `filterInstalled`                                                           | `(await server.catalogOf(principal)).ids`, for a principal who holds those roles: the server resolves their roles and their installs the way a request does. There is no asking by roles and a list of installs the caller wrote down                                                                                                                       |
  | the type `Catalog`                                                                                                           | `Awaited<ReturnType<MossServer['catalogOf']>>`                                                                                                                                                                                                                                                                                                              |
  | `resolvePolicyForRoles(app, grants, roles)`                                                                                  | `server.policyForRoles(roles)`                                                                                                                                                                                                                                                                                                                              |
  | `resolvePolicyAtReach`                                                                                                       | nothing to call. The routes and `server.executeAs` serve an entry at the reach it declares: replay the entry                                                                                                                                                                                                                                                |
  | `resolveRoles(app, principal)`                                                                                               | `(await server.identity(principal)).roles`                                                                                                                                                                                                                                                                                                                  |
  | `resolvePolicy(app, grants, principal)`                                                                                      | `server.policyForRoles((await server.identity(principal)).roles)`                                                                                                                                                                                                                                                                                           |
  | `resolveVariants(app, principal)`, `resolveVariantsForRoles(app, roles)`                                                     | nothing to call. The shell a server builds for somebody has the variant they hold in place of each action's layout, and `server.charterReport()` and `verifyApp` say whether the variants are coherent                                                                                                                                                      |
  | `auditClosure`, `wearableOf`, `verifyVariants`                                                                               | `server.charterReport()` for what a server is serving, `verifyApp(app, grants)` where there is no server                                                                                                                                                                                                                                                    |
  | `loadIntegrationActions`                                                                                                     | `server.actions()`                                                                                                                                                                                                                                                                                                                                          |
  | `memoKeyOf(app, principal)`                                                                                                  | nothing to call: it was the key of memos nothing outside the server can address. To learn whether two principals are served the same application, compare `(await server.catalogOf(principal)).hash`                                                                                                                                                        |
  | `createShellHost`, the types `ShellSession`, `ShellOpening`, `ShellReport`                                                   | `server.shells`, and `server.page(path)?.host` for a page. The types are `Awaited<ReturnType<ShellHost['session']>>`, `Parameters<ShellHost['session']>[2]` and `ReturnType<ShellHost['list']>[number]`                                                                                                                                                     |
  | `shellNeedOf`, the type `ShellNeed`                                                                                          | `live` and `why` on what `shells.snapshot(token, principal)` answers; for a build, on each result of `exportDocuments`                                                                                                                                                                                                                                      |
  | `createSocket`, the types `SocketAccept`, `SocketContext`                                                                    | `server.socket`, whose type is `MossServer['socket']`                                                                                                                                                                                                                                                                                                       |
  | the type `ClientMessage`                                                                                                     | not exported. The six messages a terminal sends are listed under "A message on the socket", below                                                                                                                                                                                                                                                           |
  | `PROTOCOL`, `CLOSE_INVALID_TOKEN`, `CLOSE_SIGNED_OUT`, `offerToken`, the types `ServerMessage`, `Connection`                 | the same name, from `@niscorp/moss/protocol`: `import { PROTOCOL, offerToken } from '@niscorp/moss/protocol'`. It is for code that speaks the wire itself (a client written by hand, a check that opens a socket, a transport other than `@niscorp/moss/node`); a terminal on `@niscorp/moss/client` and an app served by `nisc` or `serve` need none of it |
  | `CLOSE_SHELL_FAILED`                                                                                                         | the number, `4500`                                                                                                                                                                                                                                                                                                                                          |
  | `createDataLayer`, the type `DataLayer`                                                                                      | nothing to call: `createServer` stands the data layer up. `server.executeAs` replays an entry as a charter role, and `session.answerIntent` runs a query written for an intent                                                                                                                                                                              |
  | `createGeneration`, `GENERATION_DDL`, `DEFAULT_GENERATION_POLL_MS`, the type `Generation`                                    | nothing to call: the counter is the server's, and `server.generation()` is gone. `server.refresh()` and `server.replaceActions` move it. Its table is part of `MOSS_SEQUENCE`, and it is polled every `runtime.sessionRevalidateMs` (60 seconds when unset)                                                                                                 |
  | `createIdentityCache`, `DEFAULT_IDENTITY_MAX`, `DEFAULT_IDENTITY_IDLE_MS`, the types `IdentityCache`, `IdentityCacheContext` | declare `identity` on the manifest. The limits are `runtime.identityMax` (10,000 when unset) and `runtime.identityIdleMs` (30 minutes); `server.invalidateIdentity`, `server.invalidateTenant` and `server.identities` are the rest                                                                                                                         |
  | the type `IdentityReport`                                                                                                    | `ReturnType<NonNullable<MossServer['identities']>['list']>[number]`                                                                                                                                                                                                                                                                                         |
  | `DEFAULT_IDLE_MS`, `DEFAULT_REVALIDATE_MS`                                                                                   | the settings they were the defaults of: `runtime.shellIdleMs` (30 minutes when unset), `runtime.sessionRevalidateMs` (60 seconds)                                                                                                                                                                                                                           |
  | `devSession`                                                                                                                 | `session: 'dev-open'` ("The dev verifier is not exported", below)                                                                                                                                                                                                                                                                                           |
  | `sessionVerifierOf(runtime)`                                                                                                 | `server.principalOf(token)`, from outside the verifier: it asks whatever `runtime.session` is                                                                                                                                                                                                                                                               |
  | the type `SessionVerifier`                                                                                                   | `Exclude<NiscRuntime['session'], string>`                                                                                                                                                                                                                                                                                                                   |
  | `revokeSession(pool, token)`                                                                                                 | `revokeAllFor(pool, principal)`, or `session.revoke()` in a function: both sign the principal out everywhere. No exported call deletes one token and leaves the principal's others                                                                                                                                                                          |
  | `SESSIONS_SEQUENCE`, `initSessions(pool)`                                                                                    | nothing to call. With `session: 'sessions'`, `createServer` and `migrateTables` make the table, in the one ledgered run                                                                                                                                                                                                                                     |
  | `sessionOf(pool, token)`                                                                                                     | with `session: 'sessions'`, `server.principalOf(token)`: that deployment's verifier is this lookup. Nothing to call from inside a verifier of the app's own: see "Moss's stored sessions are what `session: 'sessions'` verifies with", in group 3                                                                                                          |
  | `wireFabric`, the types `Fabric`, `FabricSignal`, `FabricMessage`, `FabricApply`                                             | set `runtime.fabric`. Its type is `NonNullable<NiscRuntime['fabric']>`, and a message is what its `publish` is handed                                                                                                                                                                                                                                       |
  | `emitterOf`, `spanClock`, the types `Emit`, `SpanClock`                                                                      | nothing to call. A sink goes in `runtime.telemetry` (`Telemetry`), and moss catches what it throws                                                                                                                                                                                                                                                          |
  | `mintWrites`                                                                                                                 | name `createTideFacts(...)` in `features` ("Tide's hosting is tide's", below)                                                                                                                                                                                                                                                                               |
  | `SNAPSHOT_ELEMENT_ID`, `embedSnapshot(snapshot, principal, path?)`                                                           | `readDocumentSnapshot()` reads the element and `renderDocument` writes it, in the page it draws. Its id is `nisc-snapshot`                                                                                                                                                                                                                                  |
  | `documentHeaders(principal)`                                                                                                 | `(await renderDocument(config)).headers`                                                                                                                                                                                                                                                                                                                    |
  | `tokenFromCookie(header, key?)`                                                                                              | nothing to call. No route of an app answers to the session cookie: `renderDocument` reads it to choose whose screen to draw, the socket's upgrade reads it, and a sign-in the app answers sets it with `sessionCookies`                                                                                                                                     |
  | `createPageRouter(pages)`, the types `PageRouter`, `PageMatch`                                                               | `server.page(path)`: the page a path leads to, its host and the input its path carries                                                                                                                                                                                                                                                                      |
  | the type `TablesReport`                                                                                                      | `Awaited<ReturnType<typeof migrateTables>>`                                                                                                                                                                                                                                                                                                                 |

  Where the right column says there is nothing to call and an app did call it, say which and why in an issue: the answer is a call that is meant to be public, not the name coming back.

  **Integrations are a feature: `@niscorp/moss/integrations`, named in `features`.**
  - Integrations (services that add screens: registration and approval, the proxy, webhooks, the integration key) are not part of moss's core any more. They ship from an entry point of their own, and an app that uses them creates the feature and names it in its manifest:

    ```ts
    import { createIntegrations } from '@niscorp/moss/integrations';

    const integrations = createIntegrations({ integrationActor, extension });
    const app = defineApp({ charter, actions, features: [integrations] });
    ```

  - **Nine fields leave `NiscApp`.** One is configuration of `createIntegrations`, under the name it had: `integrationActor`. Seven named one product's vocabulary and are no option of anything: `attachable`, `menuSlots`, `assistantTools`, `publishChecks`, `editorRegions`, `placementNames`, `storePress`. What a host says with them it says in its own `extension` ("What a host with a store takes over", below). The ninth, `installedIntegrations`, was deprecated and never called, and is gone. A manifest that still names one of the nine is refused at boot, as any field the type does not have is: `(the manifest): Unrecognized key: "menuSlots"`.
  - `NiscApp.features` is new. The server starts each feature, in order, once its core stands and before anything is served. `Feature` and `FeatureSeams` are not exported: the two features are moss's own, and an app cannot write one.
  - **An app that does not name the feature has no integrations.** None of `/api/integrations/*`, `/integrations/:id/*` and `/operator/integrations` is served, an `ik_` key is read as a session token and refused as one (`invalid_token`), and no integration's actions are loaded. `integrations` and `integration_actions` are still created, because `nisc.moss` made them and still does; no row of them is read, written or served. The stored actions used to be brought to the running code's grammars at every boot, whatever the app named: the feature has that done when it starts, and a row written by newer code refuses the boot of an app that names the feature, as it did of every app.
  - **`installed` narrows what somebody holds only where the feature is named.** The install list an app's `identity.resolve` answers (`installed`) took every `ext.<audience>.<integration>.<name>` action out of what a principal holds where that integration is not in their list, in every app. The rule is the integrations feature's, and it is laid when the feature starts. An app that ships actions under `ext.…` ids of its own, answers `installed`, and names no feature serves those actions to everybody the charter grants them, whatever `installed` says. Such an app names the feature, `features: [createIntegrations()]`, which brings the rule back with the rest. No lab app ships such an id without the feature.
  - **Each call that moved is on the object `createIntegrations` returned**, and takes no pool: `integrations.callIntegration(id, path, init)` (`MossServer.callIntegration` is gone), `integrations.integrationByKey(key)`, `integrations.integrationOfAction(id)`; and one is new, `integrations.listIntegrations()`. They work once `createServer` has answered. Before that the three that read rows reject with a sentence that says so.
  - New from the entry: `createIntegrations` and the types `Integrations`, `IntegrationsConfig`, `ExtensionConfig`, `ExtensionContext` and `RegisteredIntegration`.
  - `app.actions` is what the app shipped, and stays it. Moss wrote the integrations' actions into that record; it no longer does. Code that read them there reads `server.actions()`.

  **Tide's hosting is tide's: the store and the driver ship from tide, and the write-fact bridge is a feature, `@niscorp/moss/tide`.**
  - Moss held a Postgres store that implements tide's store contract, and a driver that paces tide. They are tide's storage and tide's pacing, and every moss app installed `@niscorp/tide` because of them. Both are in tide now (the tide changeset), under the names they had, and each is called as it was: `createTideStore(runtime.pool)` takes the pool it took.
  - **The tables are the ones the database has.** `TIDE_SEQUENCE` is the same sequence under the same id, `nisc.moss.tide`, with the same migrations in the same order. A deployment that ran it finds nothing pending.
  - **`@niscorp/tide` is an optional peer of moss.** An app that runs no tide does not install it, and nothing in moss's main entry imports it. An app that uses `@niscorp/tide/postgres` has `@niscorp/strata` installed, which every moss app does.
  - **`NiscApp.facts` is gone: minting a write into tide is a feature.** An app that did it creates the feature and names it in its manifest:

    ```ts
    import { createTideFacts } from '@niscorp/moss/tide';

    const app = defineApp({
      charter,
      actions,
      features: [createTideFacts({ tide: () => driver, identity, chain })],
    });
    ```

    `tide`, `identity` and `chain` are the three functions `facts` held, under the names they had, and each is asked what it was asked. A manifest that still names `facts` is refused at boot: `(the manifest): Unrecognized key: "facts"`.

  - **An app that does not name the feature mints nothing.** No write becomes a fact, and a reflex with a `write` trigger is never woken by one.
  - A write is told to the features that hear writes, in the order the app named them, and then to `reactions`. That is the order it was told in while the bridge was part of the server.
  - New from `@niscorp/moss/tide`: `createTideFacts`, and the type `TideFactsConfig`.

  **The client and terminal entries export what an app calls: six names leave.**
  - `@niscorp/moss/client` loses `SNAPSHOT_ELEMENT_ID` and the type `WireTokenStore`. The id is read by `readDocumentSnapshot()` and written by `renderDocument` (main entry): call those. The type is `WireEnv['tokens']`.
  - `@niscorp/moss/terminal/react` loses `registerWireSlots` and the type `WireSlotOptions`. `reactTarget`, `renderSnapshot` (`/terminal/react/server`) and `inkTarget` register the wire slots on the registry they are handed: call one of those. A kit that wants its own element around a canvas wraps the slot moss registered, read back with `registry.get('CanvasSlot')` once the target is made, as lyceum's does.
  - `@niscorp/moss/terminal/vue` loses `registerWireSlots` and `terminalFrame`: `vueTarget` and `renderSnapshot` (`/terminal/vue/server`) are the two things they were for.
  - Nothing in this repository imported any of the six.

  **(2) THE MANIFEST**

  **The manifest is parsed and frozen when it is handed over.**
  - `createServer(app, runtime)` parses the manifest before anything else uses it, and a manifest that does not parse refuses the boot with `The manifest does not parse — refusing to serve:` and one line for each place that does not fit (`actions.home: Unrecognized key: "tittle"`, `shell.inputs: expected a function`). It used to be used as it stood: a definition nova refuses was found when a shell that holds it was built, for whoever connected first, and a seam that was not a function when it was first called.
  - An action, a fragment and a layout are read by nova's schemas, an entry's `dsl` and `mutation` by vex's, its `mapping` by Prism's, `grammars` by strata's. Every other data field is held to the shape `NiscApp` gives it, and a code seam to being a function.
  - A field the type does not have is refused, on the manifest itself, on the shell or a page, on a canvas, a layout variant, an entry, a reaction, `identity` and `phraseKeys`. The compiler already refuses one written in place; one that arrived through a spread or a cast used to be carried and ignored. An app that kept something of its own there keeps it beside the manifest. A component's contract (`shell.components`) and a resource written as an object may still carry more than moss names.
  - An app whose manifest is typed as `NiscApp`, with no cast and no extra field on the way, has nothing to change for the parse.
  - Then `createServer` freezes the manifest, every level of it, in place. Once it has returned, an edit throws a `TypeError` where it is written: `app.actions.x = …`, `delete app.actions.x`, `app.actions = …`, `app.charter.role = …`, `app.entries.push(…)`, a write to a definition, a layout node, a canvas or a variant. A function and an instance of a class (a zod schema a kit handed over as a component's props) are not frozen and not looked inside. Before `createServer` is called nothing is frozen: `defineApp` returns its argument, and an app may go on assembling it.
  - An edit to the charter, the behaviors or the layout variants used to be half served: it reached whoever was resolved next and nobody already resolved, and no check had seen it until a `refresh`. An entry added to `app.entries` after boot was never seeded.
  - **What an app does instead.** Actions that arrive while it runs are handed over as a set, with `server.replaceActions` (next part). A charter, a layout variant, an entry, a behavior and the shell do not change while a server runs: they change in the manifest the next server is created with.
  - An object the app shares between its manifest and its own code is frozen for both: code that wrote to one writes to a copy of its own. The checks of the five lab apps (lyceum, lyra, atrium, relay, encore) ran against the frozen manifest and none of them hit one, in the app, in moss or in nova.

  **`server.replaceActions(source, actions)`: an app hands over the actions it loads from rows.**
  - New. An app that loads actions from its own tables hands them over: `server.replaceActions('bundles', actions)`. The name is the app's; handing the same name over again puts the new set in place of the old, so an action it no longer names leaves. The actions in force are what the app shipped, then each set. **A set has one writer.** Each feature the app names keeps a set of its own under its own name (`'integrations'` is the integrations feature's, read from its tables), and only that feature replaces it: `server.replaceActions` throws for a feature's name, saying whose the set is; and two features of one name refuse the boot. An app names its own sets anything else.
  - What the app would then consist of is verified first, and every definition of the set is read by nova's schema before that. Refused, the call throws and nothing changed: not the actions being served, not what any role holds, not the record that was handed in. The sentence is the one `refresh` throws, or `Refresh refused — actions nova does not read:` with the action and what is wrong with it. Accepted, it does what `refresh` does in the process it was called in: memos are dropped and every living shell adopts; and the set is frozen, so it is changed by handing over another of the same name.
  - **The set is handed to one process, and no other process is handed it.** The call moves the generation pointer, and every other process on the same database follows the pointer within one poll (`sessionRevalidateMs`, 60 seconds when unset): it reads again each set of actions it has a loader for, runs the same check over what it would then serve, drops what it derived, and has its living shells adopt. That is all the pointer carries. A set that reached a process through `replaceActions` alone is in that process's memory: every other process reaches the same generation and goes on serving the set of that name it was last handed itself, or none.
  - **An app that runs several processes hands the set to each of them.** A set handed to `server.replaceActions` is that process's. The app calls it in each of its processes itself, on a signal of its own; each call moves the pointer once more, and the others drop what they derived and adopt again. The integrations feature's set, `'integrations'`, is the one that crosses processes: it is kept in rows and read through a loader within one poll.
  - Editing `app.actions` and calling `refresh()` is gone. The edit throws, and `refresh` ships nothing: it verifies what is in force again, drops what was derived from it and has living shells adopt, which is what a changed role or install needs.
  - An app whose sets are `ActionDefinition`s nova reads has nothing more to change. One that handed over a definition with a field nova does not have corrects the definition: it used to be served, and was found when a shell that holds it was built.

  **A server answers what somebody holds, which actions are in force, and what a set of roles may read.**
  - New on `MossServer`: `catalogOf(principal)` answers `{ ids, hash }` from the actions in force; `actions()` is the actions in force, by id; `policyForRoles(roles)` is the vex policy a request by somebody holding exactly those roles is served under. There is no dry run of `replaceActions` (`server.verifyActions` is not on the server): `server.replaceActions` throws with the reason when a set is refused and leaves what is in force unchanged, and `verifyApp` verifies a manifest without a server.
  - New in the main entry: `verifyApp(app, grants)`, the check boot runs for an app that is not booted. Its report is `{ errors, said, charter }` (its type is `ReturnType<typeof verifyApp>`). `errors[].check` is one of `'actions'`, `'charter'`, `'reach'`, `'variants'`. `report.charter` is what `verifyCharter` answered, closure issues included, and `report.errors.filter((error) => error.check === 'variants')` is what `verifyVariants` returned.
  - These are what the functions they replace should have been. `resolveCatalog` read `assignments` and nothing else, so in an app that resolves people through `identity` it answered as `public` for everybody the assignments did not name; the server resolves who somebody is the way a request does. `resolvePolicyForRoles` compiled from whatever manifest and whatever list of grants it was handed, so a check that wrote the grants down itself read a policy no request was served under; the server compiles from the charter and the `behaviors` in force, over every table the database has. What `policyForRoles` answers is compiled for the asking and is the caller's own: nothing done to it reaches a request.
  - **`resolveRoles`, `resolvePolicy` and `resolveVariants` are gone too.** Each read `assignments` and nothing else, so for an app that resolves people through `identity` each answered as `public` for everybody: a wrong answer, handed to whoever picked that way beside `server.identity` and `server.policyForRoles`. Who somebody is, is asked of the server, which resolves them the way a request does; a check that has no server boots one, as the checks of the lab apps do.
  - Code running in a session that wants what its own caller holds asks `GET /catalog` over the session's wire, as before.

  **`refresh` runs the check boot runs.**
  - `refresh()` ran a shorter copy of the boot check: the charter and the layout variants. It is now the same verification as boot's, entries' `reach` included. It verifies what is in force, and what is in force was verified when it was taken, so an app sees no difference.
  - A boot that is refused prints the chains of steps that never end before it throws. It printed them only when the charter had passed.
  - **Where an app's entries are held, as before.** In two places while a server runs. The running manifest holds the list the app shipped and is their source: the boot check reads it, and a shell is told of the reads on its screens from it. The list is copied once, at boot, into the cache vex replays from (`vex_cache`, or the cache `runtime.cache` hands over), and the cache is what runs them: a request's fingerprint resolves there, and the manifest is not asked. The cache also holds what the list does not: a query `session.answerIntent` wrote while the app runs, and any row it held before this boot, because seeding writes each entry of the list and takes none out. None of that moved in this release, and an app has nothing to change.
  - **A boot the check refuses has seeded no entry.** The app's entries were written into `vex_cache` before the check ran, so a manifest that was refused had already written its rows. They are seeded once the check has passed, by the same seeding, into the same table. A manifest that fails both the check and vex's lint of a write (`Mutation seed "…" fails the authoring lint`) is refused with the check's sentence, where it was refused with the lint's; corrected, the next boot says the other. An app that boots has nothing to change.

  **The generation counter is read and moved through vex, and a change another process made is followed, or tried again.**
  - Every process polls one row, `moss_generation`, to learn that another changed what the app consists of. It was read and moved by statements sent to the pool: the last SQL in moss with no reason to be outside vex. It is two entries of moss's own now, replayed in process under a policy that admits that one table. No route serves them, and no charter has to grant them. A role granted a data wildcard still denies `moss_generation.*` (AGENTS.md, rule 10a).
  - A move is a compare and a set. Vex's write grammar sets a column to a value and reads none, so it cannot add one: the counter is read, and the next number is written where the counter is still what was read. Where it is not, another process moved it in that instant, and it is read again. A counter that could not be moved after five tries in a row is logged (`[moss:generation] could not move the pointer`). A row somebody deleted used to be moved without a word, and nothing was moved.
  - The counter is moved through `runtime.db`, the client every write is replayed on. It was `runtime.pool`. An app whose `db` and `pool` reach one database, which is every app there is, sees no difference. No span is emitted for the counter's reads and moves, as none was.
  - When the pointer moves, a process reads again the sets of actions it has a loader for (the integrations feature's, kept in rows). A set it was handed with no loader stays what it was handed ("`server.replaceActions`", above). When that reading failed (the database out of reach for a moment, a set this process refuses), the move was counted as seen all the same: the process went on serving what it had until the pointer moved again, and its log said the pointer `could not be read`, which it had been. A move is counted as seen once it has been followed. One that could not be is logged as that (`the generation pointer moved (3 → 4) and this process could not follow it: …`), and is tried again at the next poll (`sessionRevalidateMs`), and the one after, until it is. It is logged when it is news, not at every poll: when it first fails, again when the pointer has moved on or the reload fails another way, and once when it is followed (`followed the generation pointer to 4, after 12 looks that failed`).
  - A process that moves the pointer itself counted the number its own move landed on as seen. When another process had moved the pointer first and no poll had come between, what the other one changed was never read here. Its own move is counted as seen only when nothing else is waiting to be followed; otherwise the next poll follows both.- An app has nothing to change.

  **A page whose path names one parameter twice refuses the boot.**
  - `path: '/docs/:id/versions/:id'` was accepted, and the canvas its parameters go to was handed one `id`: the later segment's. The first was matched and lost. `createServer` refuses it now: `moss: page "…" names the parameter ":id" twice in "…" — give each parameter of a path its own name.`
  - An app with such a path names the second parameter something else. No lab app has one.

  **(3) THE SESSION, AND WHO IS CALLING**

  **`FunctionSession` carries no `runtime` and no `policy`.**
  - The session an app's `functions` and `onSession` are handed loses two fields. `runtime` was the whole environment: the database pool, the operator key, the signing seed. `policy` was the object the routes enforce for everybody holding those roles. Code that runs for one person was handed what reaches every person's rows, and the one object whose edit would change what the routes allow. A session now says who is calling (`principal`, `roles`, `identity`, `actions`), lends `wire`, `grant`, `revoke`, `recordRun`, and one call that is new.
  - **New: `session.answerIntent(writers, asked)`**, for an app that lets a model write a query. `writers` is vex's two seams, `{ generateDsl, mapToShape }`; `asked` is `{ intent, shape, context? }`. The query is written, compiled and run under the policy and the scope values the routes serve the session's principal under, resolved when it is asked, and kept in the cache the routes replay from: `answer.meta.cache.fingerprint` replays over `session.wire` afterwards. It rejects with what vex throws (`code: 'unsatisfiable'`, `'scope_denied'`). Moss keeps one engine for each `writers` object, so hand over the same object each time.
  - **What an app calls instead.**
    - It built a second vex engine from `session.runtime.pool` and `session.runtime.cache` and executed with `scopePolicy: session.policy` → `await session.answerIntent({ generateDsl, mapToShape }, { intent, shape })`. Moss builds that engine over its own adapter and cache, with the app's `behaviors` and `runtime.vexConfig`, and hands neither out.
    - It read `session.policy` to know what the caller may read (which feeds, which stored queries to offer) → `server.policyForRoles(session.roles)`.
    - It read `session.runtime` for its own database (minting a session for somebody else, a sync, a raw statement of the deployment's own) → the runtime the app created and handed to `createServer`, closed over where the app builds its manifest. Moss does not hand it back.
  - A read or a write as the caller is `session.wire`, as before.

  **The shell a session hands out refuses the nine members that change what a shell is made of.**
  - `registerAction`, `removeAction`, `registerFragment`, `addCanvas`, `removeCanvas`, `setCanvasLayout`, `setLayout`, `setPhrases` and `dispose` throw on `session.shell` and on the `shell` of what `server.shells.session(…)` answers. An action, a fragment, a canvas, a layout and the phrases reach a shell through moss, which verifies them and decides who holds them; added on the shell directly they are not verified, are in nobody's catalog and are gone when the shell is rebuilt. Reads, navigation, `dispatch`, `publish` and the observers work as before, and the type is still nova's `Shell`.
  - **What an app writes instead.** Code that does it anyway takes the whole shell, and says so in its imports: `import { unverifiedShell } from '@niscorp/moss/unverified'`, then `unverifiedShell(session).registerAction(definition)`.

  **Moss's stored sessions are what `session: 'sessions'` verifies with, and `mintSession` and `revokeAllFor` are for that deployment.**
  - Of the stored credential the main entry keeps two calls, `mintSession(pool, principal, ttlMs)` and `revokeAllFor(pool, principal)`. `sessionOf`, `revokeSession`, `initSessions` and `SESSIONS_SEQUENCE` left. The table is made by `createServer` and by `migrateTables` under `session: 'sessions'`, and only then; the lookup is that deployment's verifier.
  - **An app whose `session` is a function of its own that read moss's stored sessions** (`session: (token) => sessionOf(pool, token)` with a check of its own around it, and `initSessions(pool)` to make the table) has no call left to do that with, and `server.principalOf(token)` is not one: it asks the app's own verifier, which would be asking itself. It chooses one of the two. With `session: 'sessions'`, moss verifies, and the app's own check moves to where it belongs: `revokeAllFor(pool, principal)` at the moment somebody is to be signed out everywhere, or `identity.resolve` answering `{ roles: ['public'], scope: {} }` for somebody who may hold nothing. Or it keeps its verifier and its own credential with it: its own table or signed token, minted and revoked by the app, and neither `mintSession` nor `revokeAllFor`. No app in this repository did this.

  **The dev verifier is not exported, and a verifier of the app's own is named at boot.**
  - `devSession` is gone from the main entry. It trusts any token that carries a `sub`, and passed as `session: devSession` it booted without the line `session: 'dev-open'` prints. An app that imported it sets `session: 'dev-open'`, which is the same verifier and says so at boot. A check that wrapped it to make a token expire keeps a map of the tokens it issued instead. `mintDevToken` stays.
  - A `session` that is a function prints one line at boot: `[moss] session: a function the app supplied (name) decides who a token is.` Nothing about the verifier changes, and an app has nothing to do.

  **The record `identity.resolve` answers is read by a schema.**
  - `roles` is a list of strings, `scope` an object, `installed` (when there) a list of strings, `tag` (when there) a string. A record that does not fit is refused with a sentence that names the field, and nothing is held for that principal: a request whose principal resolves to such a record is answered `500` `identity_failed` (next part). It used to be carried on as it was, and failed later, somewhere else, or not at all.
  - What is inside `scope` is not looked at, and a field moss does not name stays on the record the `scope` hook is handed.
  - An app whose `resolve` returns an `IdentityRecord` has nothing to change.

  **A failure to find out who is calling is `500 identity_failed`, and is logged. It was `401`, and silent.**
  - Every HTTP request is identified once, at the door. A token the verifier says is nobody's is a failed sign-in, and is answered `401` `invalid_token`, as before.
  - Anything that _threw_ while the server found out who is calling was answered `401` `no_identity` too, with nothing in the log: the database being down, the app's `identity.resolve` throwing, an identity record that does not parse. A client that drops its session on a `401` dropped it over a fault of the server's. It is answered `500` `{ error: 'identity_failed', message: 'The server could not find out who is calling. Why is in its log, not here.' }` now, and the error is logged. None of its text is sent.
  - The same answer where the throw used to reach Hono's own handler and came back as the text `Internal Server Error`: a `session` verifier that throws, and a feature's credential (an integration key) that cannot be read or whose principal cannot be resolved.
  - **`no_identity` is gone.** An app whose `identity.resolve` throws for a principal it does not know answers a record for nobody instead (`{ roles: ['public'], scope: {} }`), as lyra and lyceum do, or has its `session` verifier answer `null` for the token. Code that matched on `401` `no_identity` matches on `500` `identity_failed`.
  - The socket is as it was: a session that cannot be opened is `session_failed` and a `4500` close.

  **`runtime.identityMax` of zero or less refuses the boot.**
  - With an `identity` seam declared, `identityMax: 0` (or less) used to boot and then hang the process on the first sign-in: making room in a cache that has none never ended. `createServer` now refuses it with a sentence that names the setting. Give it 1 or more, or leave it unset for the default of 10,000.

  **An identity that is forgotten stays forgotten.**
  - `invalidateIdentity`, `invalidateTenant` and `refresh` forget what moss holds of a principal. A record that was being resolved while one of them ran used to be held when it landed, so a role change or an install made at that moment was not seen until the record expired by itself (`sessionRevalidateMs`). It is now handed to whoever was waiting for it and not held. An app has nothing to change.

  **What a fabric's transport hands over is read by a schema.**
  - `runtime.fabric` carries three signals between the processes of one deployment. What its `subscribe` handed back was used as the type said it was: a message from another process, off a wire that is the host's, was switched on unread, and a `principal` that was not a string reached the identity cache as it came. It is parsed now: the object moss published, with exactly its fields. What does not parse is dropped, and the first one is logged with what was wrong with it and nothing it carried (`[moss:fabric] the transport handed over what is not a message…`).
  - The applier `subscribe` is handed takes `unknown` where it took a `FabricMessage`: a transport passes on what `JSON.parse` answered and casts nothing. A transport typed against the old applier still compiles.
  - **A transport that hands the message over as it was published has nothing to change.** One that handed over the text it received parses it first; one that added a field of its own to moss's message carries that field beside the message, not in it.

  **(4) INTEGRATIONS**

  **Integrations read and write through vex, and a feature is handed no pool.**
  - Every statement integrations ran on `integrations` and `integration_actions` is a vex entry now, replayed in process. The audit counted 28 statements in moss with no reason to be outside vex, 24 of them on those two tables; none is left (the generation counter's four went last), and `pnpm check:raw-sql` holds the count at zero.
  - The entries are the feature's own. They are seeded into a cache no route serves, so `/api/vex` answers `cache_miss` for one of them whatever the charter grants whoever asks, and they run under a policy that admits the feature's tables and nothing else. A data grant on `integrations` opens no approval and no registration: those stay behind the operator key.
  - A feature is handed no pool: it hands its reads and writes over as vex entries and replays them in process.
  - A feature names the tables that are its own and the strata sequences that make them. The server migrates the sequences in the one ledgered run, after moss's own and before `runtime.tables`, and `migrateTables` (`nisc migrate`) runs them too.
  - **A feature's own entries reach the tables it named on itself, and no other.** They run outside the charter, under a policy that admits those tables alone, so which tables they are is read off the feature before it runs and is not something it says when it hands entries over. An entry that reads or writes any other table refuses the hand-over, and with it the boot: `moss: the feature "…" handed over an entry that reads or writes a table that is not its own: "…"`. What an app's table holds, a feature reads as the app does: through the app's entries, under the charter.
  - `runtime.vexConfig.entities`, a list of the tables the app's engine is to know, says nothing about these entries: a feature's own, and the generation counter's (group 2), read the tables that are theirs off the database whatever the list names, and know no other. An app that sets the list has nothing to change.
  - No two features of an app share a name. `integrations` and `integration_actions` are made by `nisc.moss`, where every deployment's ledger has them, and are the integrations feature's: it names both.
  - Each feature is started with seams made for it, and what they reach is that feature's. Every feature was handed one and the same object.
  - **A telemetry sink is told of the registry's reads and writes.** Each replay of one of the feature's own entries emits a `vex.execute` span, as a request's replay does and one `executeAs` makes: its `fingerprint` is the entry's (`integrations/list`, `integrations/by-key`, …) and `hasPrincipal` is `false`. The statements they replaced emitted none. Counted in one process, by the entries each path replays: an operator's list of integrations is two spans, a request that carries an integration key is one, and the boot of an app that names the feature is one. A sink that counts `vex.execute` spans, or alerts on their rate, tells these apart by a `fingerprint` that starts with `integrations/`. The generation counter's reads and moves emit none.
  - What a caller sees: `last_import_at` is the server's clock where it was the database's. Nothing to change.

  **A bundle is nisc's own fields and `extension`.**
  - A bundle had sixteen top-level fields. Five are nisc's own artifacts, and moss reads them as it did: `integration`, `grants`, `grammar`, `actions`, `phrasebook`. Eleven were one product's vocabulary (`meta`, `capabilities`, `offers`, `needs`, `attachments`, `placements`, `settings`, `configuration`, `documents`, `assistants`) or served it (`frames`, next part), and are no field of a bundle. A package does not own a closed vocabulary for what is open: the app that has a store, documents and assistants defines them.
  - **One field is new: `extension`.** Whatever the host app's own vocabulary is; moss does not read inside it. The app says what it may be when it creates the feature:

    ```ts
    createIntegrations({
      integrationActor,
      extension: {
        schema, // a Zod schema: what a bundle's `extension` may be
        check, // (extension, bundle) => string[]: the reasons the app refuses it
        prepare, // (extension, bundle) => extension: once at import, before the row is written
        contract, // a plain value the app tells vendors about its vocabulary
      },
    });
    ```

    Only `schema` is required. `check` and `prepare` are handed what moss knows of the bundle: `{ integration, url, actions, fingerprints, layoutMisfits }` (its id, where its service lives, its action definitions, the fingerprints the app serves, and the host's answer about a layout). `createIntegrations` is generic in what the schema answers, so what the app reads back is typed by its own schema.

  - **A top-level key that is not a field of a bundle refuses it**, with a sentence that names the key: `"meta" is not a field of a bundle. What belongs to the host app’s own vocabulary goes under `extension`.` **Every vendor's bundle changes shape**: what it said in the ten fields it says under `extension`, in the shape its host's schema reads. An app that supplies no `extension` takes no bundle that carries one.
  - Intake holds a bundle to what it did for the fields that stay (its actions' namespace, endpoints, layouts and chains of steps), then reads `extension` with the app's schema and runs the app's `check`. Reasons from all of them are reported together, as before.
  - **`integrations.listIntegrations()` is the one read**, in place of `listAttachments` and `listPlacements`: every registered integration as `{ id, status, url, extension }`, the extension read by the app's schema. A host builds its placements, its listing and anything else from that. An app's own vex entry reads `integrations.extension` as any column.
  - **The operator's list** (`GET /operator/integrations`) answers `id`, `url`, `status`, `requestedActions`, `requestedData`, `approvedData`, `extension`, `lastImportAt`, `lastError`, `actionCount`. `title`, `tagline`, `adds`, `settingsAction`, `offers`, `needs`, `capabilities`, `configuration`, `documents` and `assistants` are gone from it: a pane that showed them reads them off `extension`.
  - **The contract** (`GET /api/integrations/contract`) no longer carries `attachable` and `menuSlots`, and its Markdown has no section on where screens appear. It carries the app's `extension.contract` under `extension`, as the app handed it over.
  - **A preview is no longer a path the proxy forwards.** The reach of an integration is what its actions' endpoints declare. An endpoint a host's own vocabulary names (the preview of an attachment) the host calls itself, with `integrations.callIntegration(id, path, { principal, body })`, which signs the call as the person looking and is not held to reach.

  **Frames are gone.**
  - A frame was a vendor's own page shown in an iframe through moss: the `frames` field of a bundle, `POST /api/integrations/frame`, `GET /integrations/:id/frame/:token` and `POST /integrations/:id/frame/:token/:call`. All four are gone, and `/integrations/<id>/frame/` is a path of the integration's like any other.
  - An app that wants a vendor's page inside its UI mounts a route of its own (`routes(server)` in `nisc.config.ts`), decides there who may open it, and fetches the page with `integrations.callIntegration`. Moss does not need to know.

  **What a host with a store takes over.**

  Everything below left moss. The last commit that still has all of it is `41fc8942` (`packages/moss/src/integrations/`: `bundle.ts`, `intake.ts`, `press.ts`, `placements.ts`, `reach.ts`, `registry.ts`, `entries.ts`, `contract.ts`), for a host that lifts it into its own `extension`.
  - **Bundle fields**, with their schemas (`bundle.ts`): `meta` (`title`, `tagline`, `description`, `story`, `highlights`, `press`); `capabilities` (`{ id, title }`, the id rule); `offers`; `needs`; `attachments` (action id → host action, or `{ to, preview }`); `placements` (action id → menu hub); `settings`; `configuration` (the four closed kinds `toggle`, `number`, `pick`, `line`, each with a default, and their coherence rules); `documents` (the field vocabulary, section types with fragments, the fixed and open section models, regions, checks, the publish path); `assistants` (instructions, grounding, tools, blocks with fragments, starters, what it applies to).
  - **Options of `createIntegrations`**: `attachable`, `menuSlots`, `assistantTools`, `publishChecks`, `editorRegions`, `placementNames`, `storePress`, `pressMaxBytes`. They are the host's own values now, read by its own `check` and `prepare`.
  - **On what `createIntegrations` returns**: `listAttachments(hostAction)` and `listPlacements()`. A host derives both from `listIntegrations()`.
  - **Checks** (`intake.ts`, the host's `check` now): an attachment names an action of the bundle and a host action that offers a seat, and its preview is under the integration's own prefix; a placement names an action of the bundle and a hub the host offers; a press path is under the integration's own prefix and not under `hook/`; no two capabilities share an id; `settings` is an action of the bundle; a document's id is its own, its capability is one the bundle declares, its publish path is under the integration's own prefix, its regions are actions of the bundle or regions the host offers, its checks are ones the host offers, its section types and field keys are not repeated, a `pick` has two options, a `list` is in no section, its fragments fit the kit, a fixed section's type is in the registry and what it extends is a sibling; an assistant's id is its own, it applies to a document or a screen of the bundle, its grounding names fingerprints the app serves, its tools are ones the host offers, and its blocks hold the same rules as a section's fields and fragments. `bundle.actions`, `bundle.fingerprints` and `bundle.layoutMisfits` are what a `check` needs of moss for them.
  - **Helpers**: `copyPress` (`press.ts`: each press image fetched once from the vendor's service with a timeout and a bound on its bytes, refused unless it is an image, handed to `storePress`, the bundle refused whole when one fails), which is a host's `prepare` now; and `describePlacements` (`placements.ts`: the sentence that says what appears where, in the host's words).
  - **The proxy's reach for a preview** (`reach.ts`): a preview was forwarded for whoever held the attached action. A host makes the call itself, with `callIntegration`.
  - **Columns**: of `integrations`, `title`, `tagline`, `description`, `story`, `highlights`, `press`, `adds`, `settings_action`, `offers`, `needs`, `capabilities`, `configuration`, `documents`, `assistants` and `frames`; of `integration_actions`, `attach_to`, `preview` and `place_in`. One column holds what replaced them, `integrations.extension`.
  - **The contract's** `attachable` and `menuSlots`, and the Markdown that explained them: a host says them in `extension.contract`.

  **Registering an integration is one transaction, and an approval is verified before it is written.**
  - A bundle's row, its actions and the hash of its key landed as separate statements. One that failed part-way left a row that said one thing over actions that said another, or over none. They are one transaction now: a bundle lands whole, or the import before it is still there, whole.
  - **`runtime.db` has to have `transaction`.** Landing a bundle is a vex batch, and a batch needs a client that can transact, as any batch an app writes does. A `db` that cannot answers `500` (`Batch mutations require a transactional client.`) to a registration. `createPglitePool` has one; a pool an app wraps itself gives `transaction` as it gives `query`.
  - Approving wrote the approval, handed the actions to the running manifest, and wrote the row back when that was refused. A process that died between the two writes left an approved row the next boot refused. The route now asks first whether the app could be served with what the integration shipped, and writes only then. A refused approval answers the same `422` with the same reason.
  - An approval that is refused when it is asked about no longer leaves its reason in `last_error` (`lastError` in the operator's list): nothing is written. A pane that read why an approval was refused off the list reads it off the answer.
  - Asking first makes a refusal after the write rare, and something else can still change what the app consists of between the question and the hand-over. An approval that was written and that the app then does not take is taken back, as it always was: the row is pending again with the reason in `last_error`, and the answer is the same `422`.
  - Importing a bundle again for an approved integration asks the same question, and was answered by putting the bundle's actions into the running manifest and taking them out again when the check threw: a refusal dropped every identity record and every compiled policy twice and moved the generation pointer twice, in every process. The bundle is verified as a candidate now, and the running app is not touched. The answer is the same `422`, and an import that is accepted moves the pointer once.

  **Two registrations of one new integration at once are answered one key, and it is the key that works.**
  - Registering asks how the integration stands, mints a key when it holds none, and lands the bundle with the key's hash. Two registrations of one new integration in the same moment (an operator's tool that retries while the first call is still out, two operators) were both told it holds no key, both minted one, and the later landing wrote its hash over the earlier one's. Both were answered `200` with a `key`, and one of the two keys was nobody's from the start. Found by running the routes from two connections of a real Postgres: 200 rounds, 200 dead keys.
  - The key's hash is written where the row holds none, in the same transaction as the bundle, and the registration reads off what was written whether its key is the one that was kept. The one whose key was kept is answered it. The other is answered as any import after the first is: `200`, its bundle landed, and no `key`.
  - **A tool that registers reads `key` from the answer that carries one**, as it did, and does not expect one from every answer to a first registration it sent twice. Nothing else to change.

  **No call out to an integration waits for ever.**
  - New on `createIntegrations`: `outboundTimeoutMs`, default `30000` (nova's default wait for an endpoint's reply). It is a whole number of milliseconds from 1 to 2^31 − 1; anything else (`Infinity`, `0`, a fraction) throws where `createIntegrations` is called.
  - **The sentence put under a call that failed with none names no product.** It was `The <id> add-on is not answering right now. The rest of the studio is unaffected.` It is `The <id> integration is not answering right now. The rest of the app is unaffected.` A check that reads the old sentence off a screen reads the new one.
  - **The `integration.call` span says which integration under `integration`.** The attribute was `addon`. A sink or a dashboard that reads `attributes.addon` reads `attributes.integration`.
  - Every call out is given up on when it has taken `outboundTimeoutMs`, its answer and its body together: a screen's call through the proxy, a vendor's webhook, `callIntegration`, the bundle fetched at registration, and the operator's probe. It reads as a service that is unreachable: `502` from the proxy, the webhook and a registration whose bundle did not arrive; `callIntegration` rejects; the probe answers `status: 0`. None had a timeout, and a service that never answered held the call for as long as the process lived.
  - **An integration that takes longer than thirty seconds to answer, or whose answer streams for longer, is cut.** Set `outboundTimeoutMs` to what the slowest one needs. A longer `timeoutMs` on the integration's own action is not enough by itself: the shorter of the two ends the call.

  **Two migrations of `nisc.moss` arrive with this release, and one takes columns out.**
  - `nisc.moss` gains its third migration (next part) and its fourth. The fourth adds `integrations.extension` and drops the columns that held one product's vocabulary: `title`, `tagline`, `description`, `story`, `highlights`, `press`, `adds`, `settings_action`, `offers`, `needs`, `capabilities`, `configuration`, `documents`, `assistants` and `frames` of `integrations`; `attach_to`, `preview` and `place_in` of `integration_actions`.
  - A deployment that boots with `migrations: 'verify'` runs `nisc migrate` before it starts on this release, as for any release that adds a migration. With the default, `'apply'`, the server applies both when it boots.
  - **An integration registered before keeps its row, its key, its grants, its reach, its phrases and its actions, and loses what the dropped columns held** until it is imported again in the new shape (`POST /operator/integrations` with the same `{ id, url }`): its listing, where its screens were placed, its settings screen. Its `extension` is null until then, and `listIntegrations()` answers it `undefined`.
  - **An app's own vex entry that selects one of the dropped columns** (a store that read `integrations.title`) selects `integrations.extension` and reads the value out of it.

  **An integration's id is a name, and the hash of its key is its own.**
  - An id is lower-case letters, digits and hyphens, and starts with a letter: what the paths (`/integrations/<id>/…`) and the action names (`ext.<audience>.<id>.<name>`) already assumed. `POST /operator/integrations` with any other id answers `400` and fetches nothing; a bundle that calls itself anything else is refused at intake.
  - An integration that was registered earlier under an id that does not fit goes on being served. It cannot be imported again under that id: remove it and register it under one that fits.
  - The third migration of `nisc.moss` is a unique index on `integrations.key_hash` where it is not null. No two integrations hold the hash of one key. Moss mints a key from 32 random bytes and never wrote one hash to two rows; two rows somebody gave the same hash by hand refuse the migration, and one of them is cleared first.

  **A signing seed that cannot be a key refuses the boot.**
  - **The signing seed is the integrations feature's own setting: `createIntegrations({ signingSeed })`.** It was `runtime.signingSeed`, the deployment's, and reached the feature as a seam, so every feature an app named was handed the private half of the key assertions are signed with. `NiscRuntime` has no `signingSeed` any more, and nothing a feature is started with carries one. An app that set it moves the value from the runtime to where it creates the feature; a runtime that still names it is refused by the compiler where it is written in place, and is otherwise carried and ignored, which signs with a key made at boot. Lyra is changed here: `LYRA_SIGNING_SEED` is read where the feature is created.
  - The seed makes the keypair assertions are signed with the same in every process and across restarts. It is 32 bytes, as base64. One that decoded to fewer was dropped without a word and a random key was generated in its place: two processes given the same seed signed with different keys, each refused what the other had signed, and an integration holding the public half of one refused every call from the other. Nothing said why.
  - A seed that is given and decodes to fewer than 32 bytes throws now, when the signer is made: for a server that names the integrations feature, while it boots; for `createAssertionSigner(seed)` called directly, at the call. `moss: the signing seed decodes to 13 bytes, and a signing key is 32. Give 32 random bytes as base64 (\`signingSeed\` of \`createIntegrations\`), or give none: …` The sentence says the seed's length and never the seed.
  - No seed is as it was: absent, or the empty string, generates a key that is kept nowhere. A seed longer than 32 bytes is its first 32, as it was.
  - **An app whose seed is shorter than 32 bytes gives one that is 32** (`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`), or removes it. Such an app was already signing with a random key: every integration that holds its public key reads the new one from `GET /api/integrations/verify-key`, once, and it stays put from then on.

  **The contract lists the fingerprints its caller may replay.**
  - `GET /api/integrations/contract` listed every fingerprint the app serves under `fingerprints`, whoever asked: it compiled the caller's policy and then kept every entry. It lists the reads and writes the caller's own policy can touch now, as vex's discovery does for that policy.
  - **Asked with no credential, it lists what `public` may replay.** An integration's author asks with the integration's key and `x-nisc-acts-for`, and reads what the integration's actor reaches.
  - Intake is as it was: it admits an endpoint that names any fingerprint the app serves. Whether a call is served was, and is, decided by the caller's policy when it is made.

  **Three answers of the integration routes differ at the edges.**
  - A stored action definition that nova's schema refuses is left out of what is served, with a line in the log. It used to be served as it stood.
  - A route body that is JSON and not an object (`null`) reads as an empty body. The route used to answer `500`.
  - A component whose `propsSchema` cannot convert itself to JSON Schema is listed in the contract by its name and description. The contract route used to answer `500`.

  **(5) A WRITE, AND TIDE**

  **A lane that throws on a write no longer keeps the other from hearing of it.**
  - A committed write is told to the features that hear writes (`createTideFacts`) and then to the reactions (`app.reactions`). When the fact lane threw (its `tide()`, `identity(scope)` or `chain` throwing on a scope the app did not expect) no reaction heard of that write, and the throw went to vex. Each is told on its own now: the throw is logged (`[moss:writes] …`) and the reactions run.
  - A reaction that throws was already kept from the next reaction, and still is. An app has nothing to change.

  **`x-tide-depth` is read as digits, not with `Number()`.**
  - A write through vex may name its place in a chain of effects in two headers, `x-tide-cause` and `x-tide-depth`, which the `chain` gate of `createTideFacts` then decides whether to believe. The feature reads them itself; the core's routes used to. The depth was read with `Number()`: an empty header was depth `0`, the start of a chain, and so `0x2` was 2, `1e1` was 10 and thirty nines a depth no whole number holds. A depth is digits and nothing else now, and a number that is exact. Anything else is no position: `chain` is not asked and the write is heard with none.
  - A caller that writes the header as `String(depth)` has nothing to change; lyra's does.

  **(6) THE SOCKET AND THE SHELLS**

  **A message on the socket is read whole, by a schema, or not at all.**
  - The server parses what a terminal sends. A message with a field the protocol does not name used to be routed with that field ignored; it is now answered `invalid_message` and nothing of it is acted on.
  - A terminal built on `@niscorp/moss/client` sends no such message, and has nothing to change. A terminal written by hand sends exactly one of `{ type: 'event', canvas, event }`, `{ type: 'publish', channel, payload? }`, `{ type: 'popTo', canvas, instance }`, `{ type: 'back' }`, `{ type: 'resync' }`, `{ type: 'reset' }`, and nothing beside those fields.
  - `invalid_message` is one sentence for every message that cannot be read. An event whose `event` is not an object used to get a sentence of its own, with its `canvas` on the reply; it gets the same answer as the rest.
  - The terminal (`@niscorp/moss/client`) parses what the server sends, and the screen a drawn page carries. A message it cannot read is named by its type in the console and dropped: a tree holding something that is not one of nova's four nodes, or a node with a field nova's node does not have, used to be handed to the kit and is now not shown. An app has nothing to change.
  - `readDocumentSnapshot` answers `undefined` for a snapshot that does not parse whole. It used to drop a `seed`, `path` or `live` of the wrong type and start from the rest.
  - The terminal now runs zod in the page. Zod was already a peer every app installs; a page whose content security policy forbids `eval` may see zod's one probe for it reported, and sets `z.config({ jitless: true })` in its entry to skip the probe.

  **The address of an upgrade is read by a schema, and a protocol is digits.**
  - What a terminal writes in the address it connects to (`protocol`, `key`, `seed`, `path`, `delta`, `sealed`, `leave`) was read where each was used, each with a test of its own. One schema reads them now, where the handshake begins. What each accepts is what it accepted, with one difference.
  - `protocol` was read with `Number()`: `0x2`, `2.0`, `2e0` and ` 2` were all protocol 2, and a terminal that wrote one was served. A protocol is digits and nothing else. Anything else is answered `client_too_old` and closed `4426`, as `banana` always was.
  - A terminal built on `@niscorp/moss/client` writes the number, and has nothing to change.

  **An event a terminal sends is read by nova's schema before a shell is handed it.**
  - The socket holds `event` to being an object and no more; the shell it is dispatched into took whatever arrived. It is now parsed by nova's `NovaEventSchema` first: one of `ui:click`, `ui:submit`, `ui:input`, `ui:focus`, `ui:blur`, `ui:model`, `ui:key`, `ui:drop`, with `ref`, `payload`, `origin` (and `key` on `ui:key`) and no other field. One that does not parse is dropped, as an event naming an instance that is not on its canvas is.
  - A terminal built on `@niscorp/moss/client` and one of nova's adapters sends nothing else, and has nothing to change. A terminal written by hand that added a field of its own to an event, or sent a type nova does not define, used to have it dispatched; it sends nova's event.
  - **An event tagged with a canvas the shell does not have is dropped.** A terminal tags an event with the canvas it drew it in, and the shell holds what the event says of itself to that canvas. For a canvas id the shell does not have there was nothing to hold it to, so the event was dispatched with no origin, which nova delivers to every instance of the shell: one message naming a canvas that is not there pressed a button on every screen that had one of that `ref`. The same holds for `session.dispatch(canvas, event)` called in process. A terminal built on `@niscorp/moss/client` has nothing to change. One written by hand that named a canvas of its own invention, to reach every screen at once, tags an event with the canvas it came from; and to tell every screen something, it publishes on a channel (`{ type: 'publish', channel, payload? }`), which every action that listens hears.

  **Shells for nobody signed in have a limit: `runtime.anonymousShellMax`, default 1,000.**
  - Somebody signed in has one shell, however many terminals they open. Nobody signed in has one for each connection, and opening a connection takes no account and no token: nothing limited how many were alive, so the memory of the process was anybody's to fill.
  - New: `runtime.anonymousShellMax`, how many shells for nobody may be alive at once. A connection over it is sent `{ type: 'error', code: 'at_capacity', message: 'This server is serving as many terminals with nobody signed in as it is set to. Try again in a moment.' }` and closed with the new close code `4503`. No shell is built for it. Somebody signed in is served whatever the count is.
  - **The default is 1,000, from a measurement.** Lyceum's real boot, 2,000 connections for nobody opened through `server.socket` and held, the heap read after a forced collection before and after: 52.5 KB of heap for each (about 110 KB resident); 26.7 KB for an app of one canvas and one action. The Node transport holds about 260 KB resident more for each connection while compression is on. A thousand fit a process given 512 MB.
  - **An app with a public screen that more than a thousand visitors have open at once sets `anonymousShellMax`** to what its memory carries (`Infinity` is no limit, as before). A page of the manifest that is not live opens no socket and takes no place.
  - **It is one count for everybody with nobody signed in, in one process, and it bounds memory.** It is not a limit for each visitor: one client that holds that many connections has every place, and every other visitor with nobody signed in is refused until one closes. Moss does not know a visitor's address (behind a proxy it is the proxy's), so a deployment that faces the internet limits the connections one address may hold at its proxy or load balancer, on `/socket`. `DOCS.md` says this under the setting.
  - A terminal built on `@niscorp/moss/client` has nothing to change: it logs the `error`, and reconnects with its usual backoff, as after any close that is not `4401` or `4403`. The backoff grows for as long as it is refused ("A connection the server refuses is tried again more slowly each time", in group 8). A terminal written by hand treats `4503` as a close to retry later, and later each time, and keeps its token.

  **A failure on the socket stays one terminal's, and its text stays on the server.**
  - A message the server reads and then throws on used to let the throw out into the transport's listener, where Node ends the process and every session with it. It is now logged, and the terminal is sent an `error` with the code `message_failed`; the connection stays open.
  - A session the server could not open used to send the terminal the error's own text, which can name a host, a table or a database user. The `session_failed` error now says only that the session was refused, and the error is in the server's log. It still names the definitions that failed validation, when that is the cause.
  - A handshake that failed (the verifier threw, what somebody holds could not be asked, their shell could not be built) emitted no span: with the verifier down, upgrades did not turn into errors on whatever reads `runtime.telemetry`, they stopped being counted. It emits one `socket.upgrade` span now, `status: 'error'`, with `hasPrincipal` as far as the handshake got. A sink that counts `socket.upgrade` spans by status gains a value.
  - An app has nothing to change.

  **A living shell holds what its principal holds now, and nothing that left.**
  - When what the app consists of changes (`replaceActions`, `refresh`, an integration approved or removed, a change another process made), every living shell adopts. It used to register what was held and never take anything away: an action that was removed, or that its principal was no longer granted, stayed mounted and pushable in every shell that had it, until that shell was rebuilt. It is now removed from the shell: its instances are unmounted, it leaves the history `back` walks, and a push of it fails as for any action the principal does not hold.
  - **Every living shell is every one the server built that has not ended**: the shell the app keeps for each signed-in person, the shell built for each connection of nobody signed in, and the shell a page builds for each connection, signed in or not. The last two used to keep what they were built with for as long as they lived, so a page somebody had open, and a visitor's screen, went on offering an action that had left. A change reaches every living shell of every host: the app's own, and each page's. A shell built to draw one document (`snapshot`) is read and ended, and adopts nothing.
  - **A host holds a shell that is not kept until it ends**, which is how a change reaches it. It ends when its last terminal leaves, and the host holds nothing of it from then on. The socket does that for every connection it opens. Code that opens such a session in process and attaches nothing (`server.shells.session(null, null)`, `server.page(path).host.session(…)` in a check or a tool) ends it with `session.detach(connection)`, as the socket does for a connection that closed early; left alone, it used to be collected once nothing referenced it, and is now held for as long as the server is. A check that runs and exits has nothing to change.
  - **`server.invalidateIdentity(principal)` resets every living shell of that principal**: the one the app keeps for them, and the shell a page built for each connection of theirs. It reset the kept one alone, so a page they had open went on as who they had been. `reset(principal)` on a page's host answered `false` and did nothing; it rebuilds each of their shells on that host, carrying its terminal across, and answers `true`.
  - A shell whose principal could not be resolved during an adopt used to end the walk, and every shell after it kept the old application. It is logged and keeps what it held; the rest adopt.
  - A shell that was being built while the app changed adopts when its build lands, and so does one a reset was replacing: the replacement is built from what its principal held when the reset began, and used to take the shell's place holding that. After two changes a shell holds what the later one left its principal with, whichever of the two is answered first. A change waits for no other change and for no build: a principal whose shell never finishes building (an `inputs` that never answers) keeps nobody else from adopting, as before.
  - **Each living shell adopts on its own.** After a change the living shells were asked one after another what their principal holds now, each after the one before it had been answered, as in 0.4.0: a principal for whom that is never answered (an app's `identity` that hangs for them) held every shell after theirs for that change. No shell waits for another now. What an app notices: a change asks about every living shell in the same moment, so an app's `identity`, and the read of its assignments, run for every signed-in principal whose record is not held at once, where they ran one after another. Who a principal is, is asked once for all of their shells and remembered, as before.
  - An action a living shell gains may mention a component no layout mentioned before: it is registered when the shell adopts. The component names a shell is built with are read off the actions in force each time they change, and were read once, when the server started.
  - An app has nothing to change. One that relied on a revoked screen staying open until the next sign-in no longer sees it.

  **A shell host has no `adopt` and no `stop`: both are the server's.**
  - `ShellHost` (`server.shells`, and `server.page(path).host`) loses two members. `adopt()` brought the living shells of that one host level with what their principals hold; `server.refresh()` does it for every host, the app's and each page's, so the member was a second way that left the other hosts on the old application. `stop()` stopped one host's idle sweep and was kept "for hosts that outlive their server"; a host is made by a server and by nothing else now, and `server.close()` stops every host's sweep with everything else the server started.
  - **What an app writes instead.** `server.shells.adopt()` → `server.refresh()`, which also verifies what is in force again, drops what was derived from it, and tells the other processes. `server.shells.stop()` → `server.close()`, which also stops the socket's revalidation, the identity cache's sweep and the generation poll: a check that called `server.socket.stop()` and `server.shells?.stop()` so that its process could end calls `server.close()` once (encore's boot and relay's expiry check are changed here).

  **A nudge reaches every living shell of a principal, and so does what a reaction delivers.**
  - `server.nudge(principal, channel)` and a reaction's `deliver(principal, channel, payload?)` published onto the shell the app keeps for that principal, and onto no other: an action on a page they had open, listening on that channel, heard nothing. Both reach every living shell of theirs now: the kept one, and the shell a page built for each connection they have to it. Between processes it is as it was: every other process is told the channel, with no payload, and tells the shells it holds.
  - **What each is for.** `server.nudge` tells somebody's screens that something changed, in whichever host and whichever process they live; it carries no payload and answers nothing. `server.shells.deliver(principal, channel, payload?)` puts a message with a payload into the shell the app's own host keeps for somebody, in this process alone, and answers whether there was one; it is as it was. Where code called `server.shells.deliver(principal, channel)` with no payload to say "this changed", `server.nudge(principal, channel)` says it to every screen they have, and to every process.
  - `deliver` on a page's host (`server.page(path).host.deliver(…)`) answered `false` and did nothing, because a page's host keeps no shell. It publishes into each shell that host built for the principal, and answers whether there was one.
  - An app has nothing to change. A page's action that listens on a channel the app nudges, or a reaction delivers on, now hears it.

  **One shell for a principal, one reset of it at a time, and the canvases it has are its own.**
  - Two first arrivals for one principal in the same moment (a drawn page's read and its socket, two tabs) each built a shell. The second took the first's place and the first was never disposed: its `functions` and `onSession` code ran for as long as the process did. One is built, and both are handed it. `functions` and `onSession` are called once for it.
  - **A build that takes longer than `runtime.endpointTimeoutMs` fails** (30 seconds when unset). The setting bounded a screen's endpoint call, and bounds the build of a shell too. A build runs the app's code: `identity`, the shell's `inputs`, `phrases`. Where one of those never answered for one call, the build never ended. Now it fails when the time is up: a terminal that waited on it is told and its socket closes `4500`, a page that was being drawn for them is served undrawn, and the next connection builds afresh. If the app's code answers after that, the build stops there: none of `functions`, `onSession` and `seeds` is called for it, and no shell is made. **What an app notices:** an app whose `identity`, `inputs` or `phrases` takes longer than the timeout for somebody gets no shell for them, where it got one late. It raises `runtime.endpointTimeoutMs`, which is also how long a screen's endpoint call waits.
  - Resets that overlapped (`server.invalidateIdentity` twice, or with a terminal's own `reset`) could leave every terminal attached to a shell that was no longer the principal's: nothing they pressed arrived. A shell's resets run in turn. A reset whose build throws or runs out of time is logged and leaves the shell that stood, and the reset after it goes ahead.
  - A page's shell that was reset lost the parameters of its path and the instance ids its page was drawn with. It is rebuilt with what it was opened with.
  - A canvas a shell gained while it ran (`shell.addCanvas`, or a push to a canvas its manifest does not list) was never sent to a terminal: the host walked the manifest's list. It is rendered, sent, attached to and read by a snapshot like the ones the shell was built with. A canvas that was removed is sent empty once, and no longer handed to a terminal that attaches later.
  - An app has nothing to change.

  **A shell is attached to what it uses of a connection.**
  - `server.shells.session(…)` answers a session whose `attach`, `detach` and `resync` took the transport's `Connection`. They take what a shell uses of one: `{ send, close, seal? }`. A `Connection` is one of those, so a transport and a check that pass a connection have nothing to change. An object literal written in place with `onMessage` or `onClose` beside them is refused by the compiler, as any literal with a member its type does not have: the shell never called either, and they are dropped (encore's check is changed here).

  **A connection that closed before its session was ready leaves nothing attached, and a live connection's credential is asked about by one pass at a time.**
  - Opening a session waits twice: for what somebody holds, then for their shell to be built. A terminal that left in between (a tab closed while its shell was built, a reconnect that gave up) was attached to the shell all the same, and on Node nothing detached it afterwards: `ws` tells a close to whoever is listening when it happens, and the socket started listening after the second wait. A signed-in person's shell then counted a terminal that was not there and was never swept as idle (`runtime.shellIdleMs`); a shell built for nobody was never disposed. The close is heard before either wait now. A connection that closed while its catalog was asked is not handed to a shell host; one that closed while its shell was built is not attached, and the shell idles, or is disposed, at once.
  - A transport's `onClose` is called once for a connection, where it was called up to three times.
  - Every `sessionRevalidateMs` the socket asks `session` about each signed-in connection, one after another. The timer started the next pass whether or not that one had finished, so a verifier that took longer than the interval was asked by two passes at once, then three. A pass that is due while one is still asking is skipped now.
  - A verifier that throws leaves the connection open, as before. That it threw was dropped without a word; it is logged, once for a pass, with how many connections could not be asked about and the first error.
  - A connection whose transport throws when it is told its session expired stayed in the list, so every later pass threw at the same place: no connection after it was asked about again, and the throw was an unhandled rejection. It is forgotten first, closed even if it cannot be told, and what it threw is logged.
  - An app and a transport have nothing to change.

  **(7) PAGES, AND THE NODE ENTRY**

  **A document's `root` is any empty element, and one with no place for a screen is not reported as drawn.**
  - `renderDocument` put the screen into the root by looking for `></div>` in it. A `root` that was another element (`<main id="app"></main>`) was written back as it was, with the snapshot beside it and no screen in it, and the page was reported `drawn: true`: the terminal started from a screen that was not in the page. The screen goes inside any root that is an empty element now, an opening tag and at once its closing tag.
  - A `root` with no inside (an opening tag alone, an element that holds something, one closed in its own tag) is answered as a template that does not hold the root always was: the template as it is, `drawn: false`, and one line in the log that names the root.
  - An app that passes no `root`, or one that is an empty `div`, sees no difference.

  **`DocumentConfig.server` is the three things a document asks.**
  - `renderDocument` and `exportDocuments` took a `MossServer` and called `principalOf`, `page` and `shells` on it. `server` is typed as those three now, and of each shell host as `snapshot` alone. A `MossServer` is one of them: a caller that passes its server has nothing to change, and a check that stood a server up to draw a page can hand over the three.

  **`serve` stops what it started.**
  - `serve(app, runtime)` (`@niscorp/moss/node`) makes an HTTP listener and a websocket transport and returns the server and neither of them. `server.close()` stopped moss's timers and left the port bound and every terminal connected, and nothing else could reach either. `close()` on the server `serve` returns now stops all three: moss's own timers, then every connection (closed `1001`), then the listener.
  - `attachSocket(…)` answers `{ close }` where it answered nothing: `close()` ends every connection the transport opened (`1001`) and takes no more. A host that ignores what it answers has nothing to change.
  - An app that called `server.close()` on a server from `serve` and went on using the port has to stop doing one of the two. `createServer`'s own `close` is as it was.

  **A boot that fails stops what it started.**
  - `createServer` starts timers before it has a server to return: the identity cache's sweep, and one idle sweep for the app's shell host and each page's. When a step after them refused the boot (a feature that throws when it is started, a page whose path the router refuses), they went on running, and nothing was returned to stop them by. Every timer is `unref`'d, so a process that exits on a failed boot never saw it; a process that boots again in place (the dev plugin on every edit, a host that retries) kept two more intervals, and what they hold, for each failed boot.
  - A boot that throws stops everything it had started, and then throws what it threw. `close()` on a server that did boot runs the same list.
  - An app has nothing to change.

  **An interval Node cannot hold is off, and an operator gate that returns nothing goes on to the key check.**
  - `runtime.sessionRevalidateMs` is handed to a timer in two places: the poll of the generation pointer, and the pass that asks about each live connection's session. Node holds a timer's delay in 31 bits and cuts a longer one to 1 ms. So `Infinity` made the pointer be read without pause, and an interval above 2^31 − 1 ms (24.8 days) did that to both. Either is off now, as `0` is. **A deployment that set `Infinity` to mean "never" gets never.**
  - `runtime.operatorGate` may return nothing: its type says so, and it was documented as falling through to moss's key check. A gate that returned nothing without calling `next()` was answered `500`. It goes on to the key check now. A gate that returns a `Response` refuses, and one that awaits `next()` sees the outcome, as before.
  - An app has nothing to change.

  **The two settings of the transport hold wherever a server's socket is attached: `runtime.socketMaxMessageBytes`, `runtime.socketCompression`.**
  - New: `runtime.socketMaxMessageBytes`, the largest message a connection may send. It could be said to `attachSocket` (`maxMessageBytes`) and not to the runtime. Unset, the limit is the transport's 256 KiB, as before.
  - `runtime.socketCompression` was read by `serve` and by nothing else: `nisc start` and the dev plugin attach the socket themselves and are not handed the runtime, so under those two a deployment that turned compression off was served compressed. The server reads both settings now, once, and the socket it hands out (`server.socket`) carries them to whichever transport is handed it. They hold under `serve`, `nisc start`, the dev plugin, and a host that calls `attachSocket(httpServer, server.socket)`.
  - **A deployment that set `socketCompression` and runs under `nisc start` or `nisc dev` gets what it set**, where it got compression on. Nothing to change, unless the setting was left there by mistake.
  - `attachSocket`'s `options` are for a host that means otherwise, and for an accept of its own that says nothing: a setting named there wins, and one that is not named stays what the socket says. A host that passed `{ compression: runtime.socketCompression }` itself deletes the argument.
  - **In the dev plugin, the connections of an app that an edit replaced are closed (`1001`).** The plugin kept one transport for as long as vite ran, and a terminal that was connected when an edit re-booted the app stayed attached to the server that had been let go. There is one transport for each app that is booted now, set as that app's runtime says and retired with it: a page is reloaded as before, and a terminal that is not a page (a console) connects again, to the app that is booted. An upgrade that meets an app that did not boot is answered `503`, where it was opened and closed with `1011`.

  **The dev sign-in answers this machine only.**
  - `/dev/as/<who>` (the dev plugin's `signIn`, `dev.signIn` in `nisc.config.ts`) puts a session for whoever the address names in the browser that asks. It asked nothing about where the request came from: with vite listening on a network (`vite --host`), every device on that network could sign in as anybody.
  - It answers a request whose socket ends on this machine: `127.0.0.0/8`, `::1`, or either written as an IPv4-mapped IPv6 address. Any other is answered `403` with a sentence that says why, and the app's `signIn` is not called. What a header says of where a request came from (`X-Forwarded-For`) is not read.
  - New on `mossDev`: `signInFromNetwork: true` answers it to every device that can reach the dev server, for trying a signed-in screen on a phone on a network you trust.
  - **A developer who opened `/dev/as/<who>` from a second device** sets `signInFromNetwork: true` where the app adds `mossDev` itself, or `dev.signInFromNetwork: true` in `nisc.config.ts` under `nisc dev`.
  - **New in `nisc.config.ts`, for `nisc dev`: `dev.signInFromNetwork`, `dev.watch`, `dev.owned`.** The command made the dev plugin with none of its options, so an app under `nisc dev` could not say which changed files re-boot it, or that a route of its own outside moss's prefixes goes to the app server and not to vite. All three are handed to the plugin as they are, and read when the command starts.
  - A dev server behind a proxy on the same machine sees every request as the proxy's, which is this machine: the check cannot tell those apart, and a proxy that listens on a network is its owner's to close.

  **(8) THE TERMINAL**

  **Every render target is told the connection's status, the same way.**
  - After a connection dropped, the last screen stayed up and nothing on it said so. The wire has always known (`wire.status()`), and told whoever subscribed; but what a target renders against had no status on it, so the React, Vue and DOM targets were never told, and the tty and ink targets were told only where the host remembered to pass `status: wire.status`.
  - `TerminalApi`, what a target renders against, gains `status(): WireStatus` beside `frame()` and `canvasTree()`. The conductor (`createTerminal`, `mountTerminal`) fills it from its wire, and a change of status is an `update` like a change of a tree, as it already was.
  - **`ttyTarget` and `inkTarget` take no `status`.** They read it from what they render against. An app deletes the line: `ttyTarget({ input, output, status: wire.status })` → `ttyTarget({ input, output })`, and the same for `inkTarget`. What they print is what they printed. (relay's `tty.ts`, `ink.ts` and ink check, and lyceum's ssh door, are changed here.)
  - **The React, Vue and DOM targets say the status on their root element**, as `data-wire-status="connecting | open | closed | incompatible | static"`, from the moment they mount until they are destroyed, and draw nothing for it. What a lost connection looks like is the app's: its stylesheet (`[data-wire-status='closed'] …`), or a component of its kit that reads the status where the target provides what it renders against, `useContext(TerminalApiContext)?.status()` in React and `inject(TerminalApiKey)?.status()` in Vue, and is drawn again when it changes.
  - A page drawn on the server (`renderSnapshot` of each target) is drawn with the status its terminal starts in, so a kit component that draws the status draws the same thing on both sides and the page is adopted: `static` for a snapshot that says `live: false` (no socket is opened for it), `connecting` for every other.
  - **A target of an app's own** is handed the status and may read it; one that hands what it renders against on to a moss target has nothing to change (lyceum's does). **Code that builds a `TerminalApi` by hand** to drive a target directly (a test) adds `status: () => 'open'`.

  **The wire holds one socket at a time.**
  - `wire.reset()` on a socket that is not open connects again. Pressed while a connect was still in flight (the reset key held down on a slow network, a reset straight after the page loads), the socket it was waiting on was left as it was, with the wire still listening to it. Both opened: two sockets wrote one snapshot, a sign-out or a drop heard on either was taken for the connection's, and the first to close scheduled a third. The wire lets go of the socket it had before it makes another: it is no longer listened to, and it is closed.
  - A wire whose status is `incompatible` stops retrying, and `reset()` is the way to try again once the server has been updated. A connection made that way kept the mark of the one before it: when it later dropped for any reason, the status read `incompatible` again and nothing retried. Whether the two ends can speak is found out for each connection now.
  - An app has nothing to change.

  **A connection the server refuses is tried again more slowly each time.**
  - The wire waits before it connects again: half a second to a second at first, twice as long after each failure, up to thirty seconds. It forgot that count whenever a socket opened. A server opens a connection before it refuses one, because a refusal is a message and a close code: `4503` when there is no place left for a shell for nobody, `4500` when it could not open the session. So a terminal that was refused each time connected again every half second to a second, for as long as it was refused, and each of those connects had the server do the refusing again.
  - The count is forgotten when a connection is served its first frame, which is the first thing a shell sends whatever attaches to it. A connection that drops after that is tried again after the first, short wait, as before.
  - An app has nothing to change. A terminal that connects where the server serves it no shell (a path that is no page, in an app that declares no shell) is never served a frame: after each drop it waits longer, up to the thirty seconds.

  **In the full-screen terminal, digits that arrive together are the number they spell, and `onQuit` is the terminal ending.**
  - `inkTarget` acts on a typed number: `12` clicks what is marked `[12]`. It read one digit for each key it was handed, and two keys pressed in turn can be handed over as one (a slow link, an ssh session, a paste): those were dropped, and nothing happened. They are read as the number they spell.
  - `onQuit` was called whenever the ink app unmounted, so a host that destroyed the terminal itself (`terminal.destroy()`, a swap to another target) was told that somebody quit. A handler that ends the process ended it on a swap. `onQuit` is not called for a destroy now, as `ttyTarget`'s never was. A host that relied on `onQuit` to clean up after its own `destroy()` does that cleanup where it calls `destroy()`. relay and lyceum did not rely on it.
  - A component of the kit that throws while ink draws it ends the ink app, and ink says so by rejecting. Nothing handled that: the rejection reached the process, and Node ends a process on a rejection nobody handles, with every other terminal in it (a host that serves terminals over ssh has one for each person). It is logged (`[moss/ink] the terminal ended on an error:`) and reported through `onQuit` now, like a quit: that terminal ends, and the process and the others go on.

  **WHAT AN APP CHANGES**

  In this order. An app that uses no integrations and no tide skips steps 3 and 4, and one whose terminal is built on `@niscorp/moss/client` and moss's targets skips step 10.
  1. **Move the packages together.** `@niscorp/moss`, `@niscorp/nisc`, `@niscorp/cli` and `create-nisc` are one breaking release; `@niscorp/tide` moves with them for an app that runs tide, because the store and the driver are in it now.
  2. **Let the compiler list the imports.** Every name that left `@niscorp/moss` is in the table at the top, with what to write instead. A hand-written client or a check that opens a socket takes `PROTOCOL`, `CLOSE_INVALID_TOKEN`, `CLOSE_SIGNED_OUT`, `offerToken`, `ServerMessage` and `Connection` from `@niscorp/moss/protocol`.
  3. **Integrations.** Create the feature (`createIntegrations({...})`), move `integrationActor` off the manifest into it, name it in `features`, and call `integrationByKey` and `callIntegration` on it. Write the app's own vocabulary as `extension` (a schema, and the checks and helpers lifted from "What a host with a store takes over"), have each vendor's bundle say it under `extension`, and read placements, attachments and listings off `listIntegrations()` or off `integrations.extension` in an entry of the app's own. Where a screen framed a vendor's page, mount a route of the app's own for it. Import each integration again after the first start, so its row holds an extension. Check that `runtime.db` has `transaction`. Set `outboundTimeoutMs` if an integration answers in more than thirty seconds. Move `runtime.signingSeed` to `createIntegrations({ signingSeed })`, and give it 32 bytes as base64, or none: a shorter one refuses the boot.
  4. **Tide.** Import the store from `@niscorp/tide/postgres` and the driver from `@niscorp/tide`. Replace `facts: { tide, identity, chain }` with `createTideFacts({ tide, identity, chain })` in `features`.
  5. **The manifest.** Remove any field `NiscApp` does not have. Replace `server.shells.adopt()` with `server.refresh()`, and `server.shells.stop()` with `server.close()`. Where code edited the manifest after `createServer` (most often `app.actions`, then `refresh()`), hand the actions over with `server.replaceActions(name, actions)`, and read the actions in force from `server.actions()`. Where the app runs several processes, hand the set to each of them: a set handed to `server.replaceActions` is that process's. Hand no set over under a feature's name: it is that feature's.
  6. **Functions.** Replace `session.runtime` with the runtime the app created, `session.policy` with `server.policyForRoles(session.roles)`, and an engine built from the two with `session.answerIntent(writers, asked)`. Where a function calls `registerAction`, `removeAction`, `registerFragment`, `addCanvas`, `removeCanvas`, `setCanvasLayout`, `setLayout`, `setPhrases` or `dispose` on `session.shell`, take the whole shell: `unverifiedShell(session)`, from `@niscorp/moss/unverified`.
  7. **Who is calling.** Replace `session: devSession` with `session: 'dev-open'`. Call `mintSession` and `revokeAllFor` only where `session` is `'sessions'`; a verifier of the app's own that read moss's stored sessions becomes `session: 'sessions'`, or keeps a credential of its own. An app that names no integrations feature, ships `ext.…` actions of its own and relied on `installed` to narrow them, names the feature. Have `identity.resolve` answer `{ roles: ['public'], scope: {} }` for a principal it does not know, where it threw. Where code matched `401` `no_identity`, match `500` `identity_failed`. Give `runtime.identityMax` 1 or more, or leave it unset. Where a deployment has a `runtime.fabric`, have its transport hand `apply` the object that was published, parsed, with nothing added to it.
  8. **Checks.** Replace `resolveCatalog` and `resolveCatalogForRoles` with `server.catalogOf(principal)`, `resolvePolicyForRoles` and `resolvePolicy` with `server.policyForRoles(roles)`, and `resolveRoles` with `(await server.identity(principal)).roles`; replace a boot check put together by hand with `server.charterReport()` or `verifyApp(app, grants)`. `server.verifyActions` and `server.generation()` are gone: `server.replaceActions` throws with the reason when a set is refused and changes nothing, and the counter is the server's.
  9. **The terminal.** Delete `status: wire.status` from `ttyTarget` and `inkTarget`. Add `status: () => 'open'` where a test builds a `TerminalApi` by hand. Style `[data-wire-status='closed']` if a lost connection should show.
  10. **A terminal written by hand.** Send the six messages with exactly their fields, and nova's events with exactly theirs, each tagged with a canvas the shell has; treat a `4503` close as one to retry later, and later each time.
  11. **Telemetry.** A sink that counts `vex.execute` spans leaves out, or counts apart, the ones whose `fingerprint` starts with `integrations/`: the registry's reads and writes are spans now.
  12. **Before the first start.** A deployment that boots with `migrations: 'verify'` runs `nisc migrate`: `nisc.moss` has a third and a fourth migration, and the fourth drops columns. A page that more than a thousand visitors have open at once, none signed in, sets `runtime.anonymousShellMax`. A host that calls `server.close()` on what `serve` answered expects the port to be let go. A host that passed `runtime.socketCompression` to `attachSocket` itself deletes the argument: the server's socket carries it.
  13. **In development.** `/dev/as/<who>` answers this machine only: set `signInFromNetwork: true` on `mossDev` to open it to other devices. A terminal that is not a page is closed (`1001`) when an edit re-boots the app, and connects again.

### Patch Changes

- Updated dependencies [de2a757]
- Updated dependencies [0b25acc]
- Updated dependencies [de2a757]
- Updated dependencies [7fb8322]
  - @niscorp/charter@0.1.3
  - @niscorp/moss@0.5.0
  - @niscorp/cli@0.5.0
  - @niscorp/strata@0.1.6
  - @niscorp/tide@0.1.6

## 0.4.0

### Minor Changes

- f834f3f: `evaluate` checks a config object once and only evaluates it after that; `prismTransform` is gone. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-09: replace `prismTransform` with `evaluate` (`transform: evaluate`), and pass limits as `{ limits: … }`.

  Prism had three ways to run a config, and the one a host was told to hand to its seam (`prismTransform`) was the one that reported worst, while the hosts on a hot path each wrapped `evaluate`, which checked the config on every call. There are two now, with one job each.

  **`evaluate(config, source, options?)`** — for a config a program holds.
  - The first time it is handed a config object it checks it and keeps its tree; the second time it prepares the tree as `compile` would; from then on a call only evaluates. Four fields picked and renamed, the same config object again: 3.5 µs before, 0.4 µs now. A nested choice on two fields: 18 µs before, 0.7 µs now. A config that is a new object on every call costs what it did.
  - It is kept **by the object**: a config changed in place after its first call is not read again. Hand over a new object.
  - Both arguments are `unknown`, so it is what a host's transform seam takes: `createTide({ transform: evaluate })`, `createUpgrader(grammars, { transform: evaluate })`.
  - The third argument is `{ limits?, check? }`. Limits were the third argument themselves: `evaluate(config, source, { maxSteps: 100 })` is now `evaluate(config, source, { limits: { maxSteps: 100 } })`.
  - `check: 'always'` is for writing a config, for tests and for tools: nothing is kept, the config is checked on every call, and the source must be plain JSON (a source holding `undefined`, a function, a `Date` or a non-finite number is refused with `E_TYPE`).
  - An invalid config is a `PrismError` (`E_SCHEMA`) naming the part that is wrong, however deep the config. `prismTransform` threw zod's own error, and a `RangeError` for a config nested far past the limit.

  `evaluateSafe` takes the same arguments.

  **`compile` and `execute`** — for a config that is stored. Unchanged.

  **`prismTransform` is removed**, from `@niscorp/prism` and from `@niscorp/prism/migrations`. What it added over `evaluate` was a check that the source is plain JSON; that check is now `check: 'always'`, and a seam's source is taken as it is.

  **moss, nova, vex, loom, nisc, create-nisc and the cli move with it.** Each has Prism as a peer or a dependency, or has one of those that do, and a Prism at 0.3 is outside the range their last versions accept: an app takes them together. Nothing in vex, loom or the cli changed beyond that range.

  moss's shell and nova's `$prism` binding called `evaluate` on every use and so paid the check each time: an endpoint's request and response under moss, and a `$prism` value on each draw and for each row of a list, are 8 to 45 times faster for the configs measured. tide's and strata's documentation name `evaluate` where they named `prismTransform`.

  **What to change**
  - `import { prismTransform } from '@niscorp/prism'` or `'@niscorp/prism/migrations'` → `import { evaluate } from '@niscorp/prism'`, and `transform: prismTransform` → `transform: evaluate`. Every app made by `create-nisc` has this in `src/dev/strata.ts`; the app's typecheck and `npm run strata` both stop on that line until it is changed.
  - A third argument of limits becomes `{ limits: … }`.
  - A wrapper that parsed the config before calling `evaluate` (`evaluate(ConfigSchema.parse(config), …)`) makes a new object on every call and so is checked on every call: hand `evaluate` the config itself.
  - Code that changes a config object in place and evaluates it again must hand over a new object, or pass `{ check: 'always' }`.
  - A host that relied on `prismTransform` refusing a source that is not plain JSON checks it itself, or passes `{ check: 'always' }`.

### Patch Changes

- Updated dependencies [023bcf9]
- Updated dependencies [1db6df4]
- Updated dependencies [6d098e4]
- Updated dependencies [8b4d97e]
- Updated dependencies [f834f3f]
- Updated dependencies [b084e30]
- Updated dependencies [663d724]
- Updated dependencies [6512d91]
- Updated dependencies [7d682b9]
- Updated dependencies [d2e9d22]
- Updated dependencies [e0e8abc]
- Updated dependencies [7fe1135]
  - @niscorp/prism@0.3.0
  - @niscorp/moss@0.4.0
  - @niscorp/nova@0.3.0
  - @niscorp/vex@0.3.0
  - @niscorp/loom@0.3.0
  - @niscorp/cli@0.4.0
  - @niscorp/tide@0.1.5
  - @niscorp/strata@0.1.5

## 0.3.3

### Patch Changes

- 78a563f: A new app's terminal entry is `browserEnv()`, and AGENTS.md rule 12 says where a session is kept: in the browser's own cookie, which no script can read — not in `localStorage`, and not in a cookie copy.

  The rule used to tell an app that draws its pages on the server to keep a script-readable copy of the session token in a cookie (`browserEnv({ cookie: true })`) and to have every sign-in handoff store that copy too. moss now keeps the session itself, where the page cannot reach it, so the rule says the opposite: nothing in an app stores a token, and a sign-in the app answers over HTTP sets the session cookie on its response (`sessionCookies(request, token)`) and hands the page nothing. D5 and check 6d follow.

  **What to change:** nothing in an app that exists — `browserEnv({ cookie: true })` still compiles, and the option does nothing now.

- 9a30cfc: `AGENTS.md` no longer calls one lab app the exemplar. "Layout of an app" describes one arrangement and then says which apps to read: lyceum for a moss server app, nisc-website and moccadroid-website for an app with its own shell; atrium, lyra and relay are older, and are read for a surface they target, not as a model. `fable` and `mythos` are no longer called the reference degrade apps. And a working pattern says what a rebuilt server shell holds: what the app reads from rows as it builds — `inputs`, `seeds`, an action's mount hook — and nothing else, so a screen a person opened that no row describes is gone after a deploy, a restart or an idle spell.

  **What to change:** nothing.

- fc50d20: `AGENTS.md` says where files go. Rule 9a: file pickers live in the kit; a file never goes over the socket; the app saves it wherever it wants. The review pass's "no `fetch` outside the endpoint layer" gains its one exception, to send a file. No code changed.

  A picker that puts a file in its model value sends it over the socket as base64, and the tree brings it back on every render of that canvas. Measured against a moss server: one 15 MB file was 20 MB up and 100 MB down across five renders. Sent by the picker to a route the app mounts on its server, or to a system the app already has, the same file put nothing on the socket.

  moss gains a test and nothing else: a route an app adds to the built server reads who is asking, as moss's own surfaces do.

  **What to change:** nothing for the rule itself. But this release also limits a message a terminal sends to 256 KB (the moss entry on the socket's message limit), so a picker that emits a file's bytes as its model value now works only for a file under about 190 KB: send the file from the picker, as rule 9a says, or raise the limit where the app attaches the socket.

- 64d3765: AGENTS.md: `nisc migrate`, where an app deployed with it puts its tables, and where the rows it needs to start are written.

  The toolbox row for `cli` names the command. Rule 17 gains two sentences. An app deployed with `nisc migrate` hands its `<app>.app` sequence to moss (`runtime.tables`, with `TIDE_SEQUENCE` when it keeps tide's tables), and the function that opens its runtime migrates and seeds nothing: what it changes itself is changed before the step can check it. And rows an app needs in order to start are written by a migration step, in the same transaction as its tables; a seed that runs at start is for development and demos.

  **What to change:** nothing.

- 9311312: AGENTS.md: every list states its `limit`, and a parent and its children are one batch.

  The worked `todos/open` entry stated no `limit`, so the guide's own example was a list the engine would stop at 100 rows. It states one now, and "Using Vex" says why: a seeded entry reads at most the `limit` it states, and a list without one gets the default.

  "Using Vex" also gains the batch form for a write that creates a parent and its children: `{ $returned: 'table.column' }` reads the row an earlier statement of the same batch wrote, and the bullet says what the reply of such a batch looks like.

  **What to change:** nothing.

- Updated dependencies [7f8d202]
- Updated dependencies [8abbb96]
- Updated dependencies [78a563f]
- Updated dependencies [51dc5ce]
- Updated dependencies [da42472]
- Updated dependencies [a91b5db]
- Updated dependencies [812c464]
- Updated dependencies [770f754]
- Updated dependencies [61a4060]
- Updated dependencies [8012cd8]
- Updated dependencies [10875eb]
- Updated dependencies [fc50d20]
- Updated dependencies [2b5fd83]
- Updated dependencies [1e5ad2d]
- Updated dependencies [2011951]
- Updated dependencies [2c57a38]
- Updated dependencies [2d20daf]
- Updated dependencies [b711c38]
- Updated dependencies [3d8518c]
- Updated dependencies [b711c38]
- Updated dependencies [1903342]
  - @niscorp/nova@0.2.2
  - @niscorp/prism@0.2.2
  - @niscorp/strata@0.1.4
  - @niscorp/cli@0.3.2
  - @niscorp/moss@0.3.3
  - @niscorp/vex@0.2.3

## 0.3.2

### Patch Changes

- 6ab6f2b: `AGENTS.md` rule 10 says every charter defines a role named `public`. It is what a request with no session, and a signed-in principal with no assignment, resolve to; the name is fixed, and `public: []` grants nothing. Boot does not check for it: without it those requests fail with `Unknown role "public"`.

  **What to change:** nothing, for a charter that has the role.

- bd3184d: An upgrade keeps a document's stamp entries for grammars the upgrader was not given.

  `upgrade` handed back the upgrader's own stamp, and `upgradeStore` wrote it over the row's. A row stamped `{ "acme.forms": 0, "acme.prices": 1 }`, upgraded by code that was given `acme.forms` only, was written back stamped `{ "acme.forms": 1 }`: its record of `acme.prices` was gone. Code that has that grammar then read the row as never migrated and ran `acme.prices/1` over it a second time — a price already in cents, multiplied again.

  The stamp now handed back, and written, is the upgrader's own plus the document's entries for any grammar it was not given, as they were. Nothing new is refused, and nothing else is written differently: for a document whose stamp names only the upgrader's grammars, `upgrade` returns `upgrader.stamp` itself, as before. `upgrader.stamp`, `behind`, the lock file and every ledger checksum are untouched.

  `TOO_NEW` is, as it always was, about the grammars the code was given — a stamp entry for one it was not given is neither ahead nor behind. The README, DESIGN and rule 19 of `@niscorp/nisc`'s `AGENTS.md` said "on any grammar"; they now say "on any grammar the code was given".

  **What to change:** nothing.

- Updated dependencies [2756aa7]
- Updated dependencies [0b5a7d6]
- Updated dependencies [4abbfcc]
- Updated dependencies [a02a031]
- Updated dependencies [d5c9d58]
- Updated dependencies [fa3f038]
- Updated dependencies [659b81e]
- Updated dependencies [3029c34]
- Updated dependencies [a7d4de4]
- Updated dependencies [f70d461]
- Updated dependencies [a7d4de4]
- Updated dependencies [979b3e3]
- Updated dependencies [63445cb]
- Updated dependencies [8973c15]
- Updated dependencies [ce21cf7]
- Updated dependencies [5923e38]
- Updated dependencies [2815107]
- Updated dependencies [885bc1e]
- Updated dependencies [f9f1b26]
- Updated dependencies [e3e0ff2]
- Updated dependencies [ed9d7f4]
- Updated dependencies [18182d7]
- Updated dependencies [bd3184d]
- Updated dependencies [bab7b2c]
- Updated dependencies [eef9cd9]
- Updated dependencies [e9ad028]
- Updated dependencies [1dfab19]
- Updated dependencies [008b5e8]
  - @niscorp/cortex@0.1.3
  - @niscorp/loom@0.2.2
  - @niscorp/moss@0.3.2
  - @niscorp/signal@0.1.3
  - @niscorp/solid@0.1.2
  - @niscorp/strata@0.1.3
  - @niscorp/tide@0.1.4
  - @niscorp/vex@0.2.2

## 0.3.1

### Patch Changes

- 353b3c3: `@niscorp/nova/examples` — the reference as data. `NOVA_EXAMPLES` is 42 examples, in six groups (`NOVA_EXAMPLE_GROUPS`): the layout grammar (12), actions at work (7), endpoints (5), composition with fragments (5), shells (8) and i18n (5).

  An example is a small app, what is done to it, and what it must then say: `{ id, group, title, description, action | shell, fragments?, layouts?, replies?, fetches?, phrases?, phraseKeys?, stage?, presses, expected }`. `action` is one action alone on one canvas (an example of the layout grammar is an action with no triggers); `shell` is several actions on several canvases. `replies` and `fetches` say what its endpoints are answered, so an example comes to the same thing wherever it is run. `presses` is what is done: a press, something typed, or the host changing the language. `expected` is every piece of text the screen then holds (its text, and what stands in props at a prose key), the one action's data, which actions stand on each canvas, and what was sent to each URL.

  Every id an example brings begins with its own, so a host can hold all of them in one shell. The examples a host puts on its stage name only the plain components every kit has (`Stack`, `Text`, `Button`, `Input`) and nova's two slots, with no prop about looks, so whoever shows them draws them with its own kit. An example with `stage: false` (the five on i18n) is shown as what it comes to. The package's tests run each one and hold it to its `expected`.

  Not in it: the adapters' own seams (`slotWrapper`), the look of nova's default components, and the harvest functions of `@niscorp/nova/i18n`, which are called, not mounted.

  **What to change:** nothing.

- 259a6f7: `@niscorp/prism/examples` — the reference as data. `PRISM_EXAMPLES` is 82 examples (`{ id, group, title, description, op?, source, config, expected }`): one for each of the 73 operators, named by the operator, then nine configs of several operators working together. `PRISM_EXAMPLE_GROUPS` names the groups they come in — the reference's own (Core, Arrays, Math, …), in its order. The package's tests evaluate each example against its `expected`, and fail when an operator has no example of its own or has two, so whatever shows them shows what the installed version does. `OP_KEYS`, the grammar's operator names in its own order, is now exported from the main entry. STYLE_GUIDE.md gains "Examples": a change to what a package does changes its examples in the same commit.
- Updated dependencies [06d1531]
- Updated dependencies [fe30458]
- Updated dependencies [353b3c3]
- Updated dependencies [7222c7d]
- Updated dependencies [c8982c2]
- Updated dependencies [1e6d55d]
- Updated dependencies [259a6f7]
- Updated dependencies [f801cc9]
- Updated dependencies [fc31d1d]
- Updated dependencies [18626f8]
- Updated dependencies [d2f0357]
- Updated dependencies [5c70059]
  - @niscorp/cortex@0.1.2
  - @niscorp/charter@0.1.2
  - @niscorp/cli@0.3.1
  - @niscorp/loom@0.2.1
  - @niscorp/moss@0.3.1
  - @niscorp/nova@0.2.1
  - @niscorp/prism@0.2.1
  - @niscorp/signal@0.1.2
  - @niscorp/solid@0.1.1
  - @niscorp/strata@0.1.2
  - @niscorp/tide@0.1.3
  - @niscorp/vex@0.2.1

## 0.3.0

### Minor Changes

- f1cec45: A Prism config that validates no longer names an op Prism does not have. `validate` accepted `{ card: { $fetch: … } }` and `{ $eval: "…" }`: the plain-object branch refused only the names of ops that exist, so any other `$` key passed as a template key. Such a config could be stored — an endpoint request, a vex mapping, a strata migration — and then failed every time it was evaluated (`E_NODE_SHAPE`, "Unsupported node shape").

  A key that starts with `$` is now an op's name and nothing else. The template branch refuses every `$` key — the rule the evaluator already held — so `validate` reports it with the key and where it is (`card.$fetch: Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.`), and `evaluate` and `compile` fail with `E_SCHEMA` before anything runs. An op's name used as a template key keeps its own message. `E_NODE_SHAPE` is left for a tree that never went through the schema: an IR handed to `execute`. Adding an op no longer takes a key away from templates.
  - **prism** — the change, and a grammar narrowing: `nisc.prism` 2, a marker with no document step (a key that never evaluated has nothing to be rewritten to). `$` keys that are data are untouched: a `$const` payload, `$with` names, `$renameKeys` and `$fromEntries` keys. The JSON Schema's template key pattern is `^(?!\$)` instead of a list of every op.
  - **nova, vex, moss, loom, cli, nisc** — no change of their own. They depend on prism and are released with it, so the set installs together; the configs they hand to prism (endpoint `request` and `response`, `$prism` bindings, vex mappings) are held to the same rule.
  - **create-nisc** — the templates' sources are recorded at `nisc.prism` 2.

  **What to change:** in a config with a `$`-prefixed key that is not a Prism op, remove the key — or put the object in `$const` if it is literal data. An app that keeps a `strata.lock.json` runs `pnpm strata upgrade`, then `pnpm strata verify`; there is nothing to edit unless it has such a config. Everything else: nothing.

  BREAKING — approved by moccadroid, 2026-10-04: a config with a `$`-prefixed key that is not a Prism op no longer validates, compiles or evaluates — also where evaluation never reached the key (an untaken `$case` branch, a short-circuited `$or`, a `$map` body over an empty array), which used to work. A vex seed mapping with one fails when it is seeded, at boot, instead of on each replay. Code that matched `E_NODE_SHAPE` from `evaluate` gets `E_SCHEMA`. The `@niscorp` packages that depend on prism move with it, so an app moves them together (`@niscorp/nisc` 0.3.0).

### Patch Changes

- de6d980: A fix for the last fix: `nova:head` is the document's `<head>`, and holds what a head holds. 0.1.4 gave it five props (`title`, `description`, `image`, `kind`, `structured`) and wrote tags from them, which closed a head to whatever nova had been taught: no `og:image:alt`, no `og:type` but two, no whole address inside structured data. That was wrong, and it is replaced, not extended. The maintainer withdrew 0.1.4's props on 2026-10-04; this ships as a patch on that decision.

  **What to change** (only an app that used 0.1.4's props): a `nova:head` node no longer takes props. Write its children instead — `nova:title`, `nova:meta`, `nova:link`, `nova:script` — each with the element's attributes as its props. `{ title: X }` becomes `{ component: 'nova:title', children: X }`; `description` becomes `nova:meta` with `name: 'description'`; `image` and `kind` become `nova:meta` with `property: 'og:image'` and `property: 'og:type'`; `structured` becomes `nova:script` with `type: 'application/ld+json'` and `data`. `og:title` and `og:description` are no longer written from the title and description: say them if they are wanted. An address is written as given — a picture's is not made whole from `site`. Code that called `headOf`, `placeHead` or `createTitleKeeper`, or read `head` off `renderDocument`'s result or a route report, takes the new shapes below.
  - **nova** — a head's children are the elements a head holds, named as HTML names them, and **a child's props are that element's attributes, written as given**: nova keeps no list of them, so any `name`, `property` or `rel` can be said. Nothing in a head is drawn on the screen and no name has to be registered. With more than one head on a screen they are read in the order the screen is drawn, and an element that says the same thing as an earlier one (the title, a `<meta>` of that name or property, the canonical address) takes its place; anything else stands beside its like. What runs or styles is refused, left out and named: a script a browser would execute (`nova:script` is a data block — a JSON `type`, never a `src`), a stylesheet, `http-equiv`, a handler attribute. `headOf(api)` returns `{ elements, actions, refused }`. In `@niscorp/nova/document`, `placeHead(html, elements, { site, path })` writes them — an element takes the place of the tag that said the same thing, where it stood; what it wrote is marked `data-nova-head`, and a tag that gave way is kept inert in a `<template data-nova-own>` — and `createHeadKeeper(document)` replaces `createTitleKeeper`: the whole head follows the screen in the page, and the document's own tags come back when the screen stops saying them. Removed: the five props, the `Head` and `HeadProps` types, `createTitleKeeper`.
  - **cli** — `build`, `export` and `start` write each path's head from those elements. A head that holds what it may not fails the path, like any other check. `site` still gives every path its own canonical address and `og:url`; it no longer touches a picture's address.
  - **moss** — `renderDocument` and `exportDocuments` do the same from the snapshot (`head` on the result is `{ elements, actions, refused }`; a refusal is logged and left out), and the terminal keeps the whole head off the wire.
  - **create-nisc** — the two own-shell templates write their welcome screen's head this way.

  **Where a script goes:** in the app's own `index.html`, which holds anything and from which every page is written, or in the kit component that needs it. A layout is data and does not carry one.

- Updated dependencies [de6d980]
- Updated dependencies [f1cec45]
  - @niscorp/nova@0.2.0
  - @niscorp/moss@0.3.0
  - @niscorp/cli@0.3.0
  - @niscorp/prism@0.2.0
  - @niscorp/vex@0.2.0
  - @niscorp/loom@0.2.0

## 0.2.4

### Patch Changes

- af903c6: A page's head is its screen's own. `nisc export` wrote every path with the built `index.html`'s `<head>`, so a site with more than one page shipped each of them under the front page's title, description, preview card and canonical address.

  What a screen says about itself is now a node in a layout: nova's `nova:head`, with `title`, `description`, `image`, `kind` and `structured` bound to the action's data like any other node's props. It draws nothing — no adapter builds an element for it, no registry has to hold it, and a component is never handed one as a child — and it rides in the render tree, so it reaches a shell in the page, a snapshot a server drew and the trees on a wire alike. `headOf(api)` reads it off any of them; with more than one on the screen the last one speaks.
  - **nova** — `HEAD_NAME`, `HeadPropsSchema`, `HEAD_META`, `headOf`, `isHeadNode`; and `@niscorp/nova/document`: `placeHead` writes a head into an HTML document (the tag that said the same thing is replaced, a missing one is added before `</head>`, everything else is left as it was; values are escaped) and `createTitleKeeper` keeps a tab's title on it. The DOM, React and Vue adapters keep the title on the head as the screen moves, and give the page's own back when the screen has none.
  - **cli** — `build`, `export` and `start` write each path's document with its screen's head. "Same twice" also fails a boot that says a different head the second time, and the route table says whose head each path goes out with once an app has one. New config field `site`: the address the site is served at. With it every path says its own canonical address (`<link rel="canonical">`, `og:url`) and a head's picture gets a whole address; a build with several paths, a canonical tag in `index.html` and no `site` says so.
  - **moss** — `renderDocument` and `exportDocuments` do the same from the snapshot (`site` on the config, `head` on the result), and the terminal keeps the tab's title off the wire for every render target.
  - **create-nisc** — the two own-shell templates say their welcome screen's head.

  **What to change:** nothing. An app with no `nova:head` node and no `site` is built, served and drawn exactly as before. An app that rewrote its exported files to give each page a head can delete that step: put the node in the layout and set `site`.

- Updated dependencies [af903c6]
  - @niscorp/nova@0.1.4
  - @niscorp/moss@0.2.4
  - @niscorp/cli@0.2.3

## 0.2.3

### Patch Changes

- 80e1ee8: Documentation: the packages are live, and releases are compatible. `STYLE_GUIDE.md` gains "The packages are live" — a release does not break an app that works on the one before it; what should go is deprecated and stays; a breaking change is a last resort that needs the maintainer's approval before it is written — and `AGENTS.md` points every agent changing nisc itself to it. The status lines that said "pre-1.0, breaking changes expected" (nova), "API is pre-1.0 and moves" (moss) and "everything else may move" (tide) now say the same. moss's deprecated `installedIntegrations` is no longer described as scheduled for removal: it stays on the type. The style guide's Node floor is corrected to 22.12, what every package's `engines` already says. No code changes.
- Updated dependencies [48da7db]
- Updated dependencies [8a04243]
- Updated dependencies [8a04243]
- Updated dependencies [80e1ee8]
  - @niscorp/moss@0.2.3
  - @niscorp/cli@0.2.2
  - @niscorp/nova@0.1.3
  - @niscorp/tide@0.1.2

## 0.2.2

### Patch Changes

- Updated dependencies [b67a125]
- Updated dependencies [633d0d1]
- Updated dependencies [45d6731]
- Updated dependencies [633d0d1]
- Updated dependencies [45d6731]
- Updated dependencies [45d6731]
- Updated dependencies [45d6731]
  - @niscorp/charter@0.1.1
  - @niscorp/cli@0.2.1
  - @niscorp/cortex@0.1.1
  - @niscorp/loom@0.1.1
  - @niscorp/prism@0.1.2
  - @niscorp/signal@0.1.1
  - @niscorp/strata@0.1.1
  - @niscorp/moss@0.2.2
  - @niscorp/nova@0.1.2
  - @niscorp/tide@0.1.1
  - @niscorp/vex@0.1.1

## 0.2.1

### Patch Changes

- Updated dependencies [2548e43]
  - @niscorp/moss@0.2.1

## 0.2.0

### Minor Changes

- 3a9866e: `@niscorp/moss/vite` — `mossDev({ app })`, the app server inside vite's dev process: loaded through vite so an edit re-boots it (the old server answers until the new one is up, then is let go with its timers), the socket attached once and delegating to whichever server is current, `/` and every page's path answered with its first screen drawn into vite's transformed index.html, moss's paths answered by the app server, and a dev-only `/dev/as/<who>` when the app can mint a token. `vite` is an optional peer. `MOSS_PATHS` is exported from `@niscorp/moss/node`.
- a768f3b: `@niscorp/nisc` carries the rulebook: `AGENTS.md` and `STYLE_GUIDE.md` ship in the package, so an app reads the rules for the nisc version it has installed (`node_modules/@niscorp/nisc/AGENTS.md`). The repository's root files are links to them.

### Patch Changes

- Updated dependencies [3a9866e]
- Updated dependencies [3a9866e]
- Updated dependencies [534eb4b]
  - @niscorp/cli@0.2.0
  - @niscorp/moss@0.2.0
  - @niscorp/nova@0.1.1
  - @niscorp/prism@0.1.1
