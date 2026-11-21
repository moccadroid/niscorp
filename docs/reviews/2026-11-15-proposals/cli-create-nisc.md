# Fix proposals — packages/cli, packages/create-nisc, packages/nisc (the rulebook)

Written against `review-fix/all-check` (39c246ab). Nothing was changed, built or committed there. Every confirmation below was run on the scratch apps of the third review (their installed `@niscorp/cli` dist is byte-identical to the worktree's `packages/cli/dist`), copied into `scratchpad/proposals/cli-create-nisc/` with their `node_modules` linked, or with the worktree's own built `create-nisc` bin writing into that folder. The probe scripts, logs and the prototype split of AGENTS.md are in that folder.

"Breaking" below means the owner's definition: anything that works today could stop working or give a different result. Every proposal says what changes for a working app, user or CI job; where that is not "nothing", it says so in a line starting **Owner to confirm:**.

Item ids: **U** = "Left unbuilt or partly fixed", **R2** = second review, **R3** = third review (cli), **R3-C** = third review (create-nisc), **R3-D** = third review (nisc docs), each numbered in the order of `open-cli-create-nisc.md`.

## What changed in this revision

After an independent check (probes in `scratchpad/proposal-check/cli-create-nisc/`):

- **P1** reworked: the default `out/` is emptied exactly as today; only a folder named with `--out` keeps what an export did not write. Leftovers are named on every run, not once (the first version wrongly said they stay once). Removal and copy go by real location, so a link inside the folder is never written through (the checker's junction case). The record moved outside the folder, so no exported path is published. All three costs are stated.
- **P2**: a repeated flag keeps first-wins. The owner line now also names a deploy step that passes `--port` or `--skip-bundle` to `migrate`, `-h` going from exit 1 to 0, and CI jobs that fail on stderr.
- **P3** reworked: no character list. The export is written into a fresh folder first, and the system itself refuses what it cannot make (`about.` and `con` export on Windows 11 as today).
- **P9**: the second reading runs outside the `try`; it is compared with today's findings by rule, file and name (lyceum: 0 new lines, not 18) and respects `allow`; it adds 0.9 s on lyceum. The README choice goes to the owner.
- **P17**: a production `npm start` was run on scratch apps with the change (both 200).
- **P19** narrowed: an empty line is no longer appended when a key is left empty; a typed key is appended as today, so the case the checker named keeps today's result.
- **P26** re-measured with all the text it promises, and the per-step pointers written into the order of work: 31,168 bytes. That is only with "Before working around a limitation" moved out (with it in, about 33.3 kB). The dangling "Using Vex" pointers are fixed. Rule 18's statement names kit props. ACTIONS.md is read at the Kit step. STYLE_GUIDE's "Modules" and "Build" stay where they are.
- Counts updated.

## Table

| Item | What | Proposal | Status |
|---|---|---|---|
| U1 | `export --out` empties any folder but the four refused ones | P1 | needs owner decision |
| U2 | `export --allow-live` writes paths that could not be drawn, exit 0 | P4 | proposal |
| U3 | a flag's value is taken whatever comes next (`--out --allow-live`) | P2 | proposal |
| U4 | cli text uses the banned word | P10 | proposal |
| U5 | `.gitignore` or `.env` that is a folder gives a raw EISDIR | P13 | proposal |
| U6 | create-nisc's `test/cli.test.ts` runs a stale `dist` | P14 | proposal |
| U7 | `all-checks.ts` runner in three templates | P15 | proposal (no change) |
| U8 | create-nisc README `env` row omits `hint?` | P16 | proposal |
| U9 | `check:packages` leaves `%TEMP%\nisc-pack-*` | — | already fixed |
| U10 | AGENTS.md ~10.6k words / 615 lines | P26 | needs owner decision |
| U11 | rule 10a lists no tide tables | P27 | needs owner decision |
| U12 | client-degrade prewarm vs vex `seedCache` | P29 | proposal |
| U13 | rule 16 "Deps via `pnpm add` only" vs npm apps | P28 | needs owner decision |
| U14 | STYLE_GUIDE ships package mechanics to app authors; CHANGING_A_PACKAGE ships | P26 | needs owner decision |
| U15 | nisc-website and moccadroid-website removed (private) | P31 | needs owner decision |
| U16 | measure the rewrite with agent builds | P32 | needs owner decision |
| R2-1 | unknown flags ignored (`migrate --dry-run` migrates); unknown command says nothing | P2 | needs owner decision |
| R2-2 | compression cache keyed without the query: Bob gets Alice's body; never cleared | P8 | proposal |
| R2-3 | `fileOf` lets `/..\..\escape` out of the folder on Windows | P3 | proposal |
| R2-4 | shape check misses six spellings; `<const>[...]` wrongly flagged | P9 | proposal |
| R2-5a | malformed address → 500 (own-shell `nisc start`) | P6 | proposal |
| R2-5b | `PORT=` empty → any free port | P7 | proposal |
| R2-6 | model-first `ask` description says `Send { text }`, schema needs `{ asked }` | P22 | proposal |
| R2-7 | model-first charter grants `ask` to `public` — anyone spends the key | P23 | proposal |
| R2-8a | agents-section names `place`; "four places … seven", then 8 steps | P22 | proposal |
| R2-8b | caret ranges beside an exact-pinning `@niscorp/nisc` | P25 | proposal (no change) |
| R2-8c | `@niscorp/tide` in every moss app | P24 | proposal |
| R2-9 | AGENTS.md: config needed "only if pages are drawn…"; check/dev refuse without it | P12 | proposal |
| R2-10 | root AGENTS.md / STYLE_GUIDE.md are symlinks (a path line on Windows) | P29 | proposal |
| R3-1 | = U1 | P1 | needs owner decision |
| R3-2 | = R2-1 (`--port=18799`, `--out=site` ignored too) | P2 | needs owner decision |
| R3-3 | = U2 | P4 | proposal |
| R3-4 | `nisc migrate` on an in-memory database says "applied 9", status says "9 pending" | P5 | proposal |
| R3-5 | `/a:b` on Windows: folder emptied, raw stack, half-written | P3 | proposal |
| R3-6 | = R2-5a | P6 | proposal |
| R3-7 | = R2-4 | P9 | proposal |
| R3-8 | `nisc check` refuses without nisc.config.ts | P12 | proposal |
| R3-9a | = R2-5b | P7 | proposal |
| R3-9b | `nisc biuld` prints usage, never says the command was unknown | P2 | proposal |
| R3-10 | cli `src/` has 10 files at the top | P11 | proposal |
| R3-C1 | `@niscorp/cli` is a devDependency; a production install cannot `npm start` | P17 | proposal |
| R3-C2 | `.env` read from the current folder, not the app's | P18 | proposal |
| R3-C3 | `GROQ_API_KEY = sk-…` not recognised; an empty line is appended that hides it | P19 | proposal |
| R3-C4 | "Next" prints `cd with space\app` unquoted | P20 | proposal |
| R3-C5 | classic apps carry the model-first kit components | P21 | proposal (no change) |
| R3-D1 | = R2-9 | P12 | proposal |
| R3-D2 | no data write verb named; `todos.update` boots and fails silently | P29 | proposal |
| R3-D3 | = R2-10 | P29 | proposal |
| R3-D4 | `createAppShell(deps)` exported by no package | P29 | proposal |
| R3-D5 | the class rule said three ways | P30 | needs owner decision |
| R3-D6 | "Nothing flat" not followed by cli, create-nisc | P11 | proposal |
| R3-D7 | `[0]` in Prism, `.0` in a binding; the wrong one draws empty | P29 | proposal |

**Counts.** 52 rows, 44 distinct items once the eight rows marked "=" are taken as their originals. 1 already fixed (U9). 32 proposal sections: 21 proposals (18 change nothing for a working app, user or CI job; P3, P8 and P9 each touch a case nobody could rely on, said in an `Owner to confirm` line), 3 that change nothing at all (P15, P21, P25), and 8 that need an owner decision (P1, P2, P26, P27, P28, P30, P31, P32).

### U9 — already fixed

`node scripts/check-packages.mts` in the worktree, run to the end: `270/270 passed`, exit 0; `ls %TEMP%\nisc-pack*` before and after: none; `git status` after: clean. The script empties its scratch folder in a `finally` (`scripts/check-packages.mts:266`). Only a run killed from outside leaves it, as any temp folder.

---

## P1 — The default folder is emptied as today; a folder named with `--out` loses only what an export wrote there

**Problem.** `nisc export` empties its folder whole (`commands.ts:128`, `rmSync(out, recursive)`), and its safety is a list of four refused folders (`refuseOut`, `commands.ts:144`). Confirmed: `--out ../victim` with `.git/HEAD` and `notes.txt` → both gone, exit 0 (`t1.log`). `--out src` or a gh-pages checkout is the same.

**Root cause.** The command cannot tell the export's own files from anyone else's, so its protection can only ever be a list of folders it knows. No list is ever complete.

**Why there is no fully compatible fix.** Today a folder ends up exactly the export, whatever was in it. "A folder that only ever had exports in it, plus a file another step added" and "a folder that was never an export's" look the same on disk, so no rule protects the second without changing the result for the first. The position below keeps today's result where the command chose the folder itself, and changes it only where the user named one.

**Design.**
1. **The default folder** — `<root>/out`, compared by real location, so `--out out` is it too — is emptied exactly as today (`rmSync` removes a link inside it as a link and does not follow it). No record. Result unchanged.
2. **A folder named with `--out`** that is not the default:
   - The command keeps a record of what its last export wrote there, outside the folder: `<root>/node_modules/.cache/nisc/exports.json`, keyed by the folder's real location.
   - Before writing, each listed file is removed, then folders the removal left empty. Each removal is checked by real location (`lstat`, `realpath`): a link is removed as a link and never followed, and anything whose real location is outside the folder is skipped and named.
   - A link that sits where the export writes is removed as a link before the copy, as today's emptying does, so nothing is ever written through it: the checker's case (`jt.mjs`: `cpSync` wrote `vendor/a.js` through a junction into a folder outside, and removing it deleted it there) cannot happen.
   - **Every** export names, in one line, how many files the folder has that it did not write, and the first few: "left in ../site, not written by this export: .git, notes.txt, about/index.html". Every run, not once, so nothing is left without a word.
3. The four existing refusals stay. Everything is first written into a fresh folder (P3), so a refused path never touches the folder.

**What changes.** Nothing for the default folder. For a folder named with `--out`:
**Owner to confirm:** (a) files the old release wrote there (a page of a path removed since, old hashed assets) are never removed by the command — they are named on every export until someone deletes them, and deleting the folder once ends it; (b) files another step puts in that folder survive the next export — a staging-only `robots.txt` that today's emptying removes would ship to production; (c) the record lives outside the folder, so a fresh checkout (CI) of a committed `--out` folder (`--out docs` for GitHub Pages) has none: nothing in it is removed and its leftovers are named each run. A record inside the folder would survive checkouts but would publish every exported path, including database-row paths nothing links to; it is not proposed.

**Test (fails today).** `--out ../victim` with `.git/HEAD` and `notes.txt` → both still there and named, `index.html` and `assets/` written. `--out ../site` with a junction `vendor` pointing outside, and a dist with `vendor/a.js` → nothing written or removed outside. `--out ../site` exported with `/` and `/about`, then with `/` only → `about/index.html` removed. Guard (passes today and after): the default `out/` with a stray file → emptied.

**Size.** ~60 lines in the export module, ~70 lines of test. **New mechanism: yes** — the record, outside the folder, for `--out` folders only.

---

## P2 — One table of the flags each command reads

**Problem.** `cli.ts` reads flags by looking for them (`args.includes`, `valueAfter`) and never looks at what is left. Confirmed: `nisc migrate --dry-run` → "nisc: applied 9" (migrated); `export --out=site` → wrote `out/`; `export --out --allow-live` → wrote a folder named `--allow-live`; `nisc biuld` → usage, exit 1, no line saying why; `nisc -h` → exit 1 (`t2.log`, `t3.log`).

**Root cause.** There is no table of the flags each command knows, so nothing can say that an argument was not read.

**Design.**
1. One table in the command's code: each flag, whether it takes a value, which commands read it (`--root` all; `--out`, `--allow-live` export; `--skip-bundle` build, export; `--port` dev, start; `--check`, `--status`, `--allow-removal` migrate). The parsing reads from it, in place of `valueAfter` and `includes`. A flag given twice keeps today's reading: the first one counts.
2. Every argument is then one of: a flag this command reads, the value after a value flag, or **not read**. Not read is named on stderr before the command does anything: `nisc: build does not read --verbose — it is ignored`; `--out=site` → `nisc: --out=site is not read; write --out site`; a value flag followed by a flag → `nisc: --out is followed by --allow-live, a flag; the folder is named "--allow-live"` (and `--allow-live` still counts, as today).
3. The command then runs exactly as today — with one exception: **`nisc migrate` stops before opening the runtime** when any argument is not read, exit 1: `nisc: migrate does not read --dry-run. It reads --check, --status, --allow-removal, --root. Nothing was opened or changed.` It is the one command that changes a real database (its README says so), and a wrong spelling there cannot be undone.
4. An unknown command gets one line before the usage: `nisc: there is no command "biuld"`. Exit 1 as today. `-h` prints the usage and exits 0, like `--help`.

**What changes.** Every command that works today still runs and exits as it does (`nisc build --verbose` exits 0 today and still does), with a warning line on stderr added.
**Owner to confirm:** (a) `nisc migrate` with an argument it does not read exits 1 where today it migrates and exits 0 — a deploy step written as `nisc migrate --yes`, or a generic step that hands every command the same `--port` or `--skip-bundle`, would stop the deploy (the running version keeps serving, per the README); (b) `nisc -h` goes from exit 1 to exit 0; (c) a CI job that fails on any output to stderr would fail on the new warning lines.

**Test (fails today).** `nisc migrate --dry-run` on the cli's migrate fixture → exit 1, the sentence, and `--status` afterwards shows nothing applied. `nisc build --skip-bundle --verbose` → the warning on stderr, exit 0. `nisc biuld` → the line, exit 1. `nisc -h` → exit 0. `--out a --out b` → writes to `a`, as today.

**Size.** ~50 lines replacing ~10 in `cli.ts`; ~40 lines of test. **New mechanism: yes** — the flag table (it replaces the scattered reads).

---

## P3 — An export is written whole into a fresh folder first, and moved into place only if every file was made

**Problem.** `fileOf` (`routes.ts:20`) refuses `..` only between `/`, and nothing checks the file the platform will make; and the folder is emptied before the first page is written. Confirmed on Windows: paths `/` and `/z\..\..\..\escape` with `--out ../site1/sub/deep` wrote `site1/escape/index.html`, outside the folder, exit 0 (`t5.log`). `/a:b` emptied `site2`, wrote `/`, then died with a raw `ENOENT … mkdir 'site2\a:b'` stack, exit 1 (`t6.log`). `paths` may come from database rows.

**Root cause.** The check reads the path's spelling, not the file the platform makes of it, and the writing starts after the folder is already emptied — so a path that fails halfway leaves half a site.

**Design.**
1. The export first writes everything — the copy of `dist/` and one `index.html` per path — into a fresh folder inside the export's folder (`<out>/.nisc-export-<random>/`). A fresh folder has no links in it, so a path's file is checked as written: after the platform's own `join`, it must be inside that fresh folder, or the path is refused.
2. Which names are refused is the system's own answer, not a list: a write the system refuses (Windows: `a:b`) fails in the fresh folder. Names Windows 11 accepts (`about.`, `about `, `con`, per the checker's `rn\`) export as they do today.
3. On any refusal: the fresh folder is removed, nothing else was touched, and the command says `nisc: the path "/a:b" cannot be written here (ENOENT). Nothing was written.` exit 1.
4. Only when every file was made is the folder cleared (P1: the default emptied, an `--out` folder's listed files removed) and the files moved up into it, file by file (a rename on the same volume), and the fresh folder removed. `fileOf`, which is exported, is not changed.

**What changes.** Every export that succeeds today writes the same files. On Windows, `/a:b` already fails; it now fails with a sentence and an untouched folder.
**Owner to confirm:** on Windows a path that today writes outside the export's folder (exit 0) is refused (exit 1). Nobody can rely on a file landing outside `--out`.

**Test (fails today).** On Windows: paths `/` and `/a:b` → exit 1, the sentence, the folder exactly as before. Paths with `\..\` → exit 1, nothing outside. On every platform (guards that pass today and after): `/a:b` on a POSIX system writes `a:b/index.html`; `/about.` on Windows 11 exports.

**Size.** ~35 lines. **New mechanism: yes, small** — the fresh folder the export is written into first (P1 uses it too).

---

## P4 — `export --allow-live` says which paths were not drawn

**Problem.** A path that could not be drawn is counted with the live ones (`commands.ts:166`, `route.live || !route.drawn`): without `--allow-live` the command suggests `--allow-live` for it; with it, the undrawn template is written and the command exits 0, where `nisc build` exits 1 on the same app. Confirmed with a draw that throws: build exit 1, export says "With a server beside the files they still work: `nisc export --allow-live`", export `--allow-live` exit 0 (`t7`–`t9.log`).

**Design.** Keep the write and the exit code. Split the two lists in what is said:
- without `--allow-live`: paths that want a server are named as today; paths that could not be drawn are named on their own line — "could not be drawn (see the table): it would go out as the template, empty until its terminal connects" — and `--allow-live` is suggested only for the first list;
- with `--allow-live`: after writing, `nisc: / could not be drawn — written as the template; it shows nothing until its terminal connects.`

**What changes.** Nothing but printed lines; exit codes and files are today's. (Failing the export like `build` would change exit 0 to 1 for a case that passes today; that would need the owner's yes, and is not proposed.)

**Test (fails today).** A moss app whose `draw` throws: `export` names `/` as not drawn and does not suggest `--allow-live` for it; `export --allow-live` prints the "could not be drawn" line; exit codes 1 and 0 as now.

**Size.** ~12 lines. **New mechanism: no.**

---

## P5 — `nisc migrate` says when the database starts empty every time

**Problem.** On a create-nisc app (PGlite in memory, `migrations: 'apply'`), `nisc migrate` prints "nisc: applied 9"; `nisc migrate --status` straight after prints "9 pending". Confirmed on the moss-react copy.

**Design.** When the runtime it opened says `migrations: 'apply'` (the documented mark of a database that starts empty every time), `migrate`, `--check` and `--status` print first: `nisc: this runtime's database starts empty every time (migrations: 'apply') — what is applied here is gone when the command ends. A real database is migrated by pointing runtime at it.` Then everything as today.

**What changes.** One printed line; nothing else.

**Test (fails today).** `nisc migrate` on a create-nisc moss app prints the line; exit 0 as now.

**Size.** ~4 lines. **New mechanism: no.**

---

## P6 — An address that does not decode is a 400 on an own-shell app

**Problem.** `shellSite` (`shell-site.ts:216`) calls `decodeURIComponent` unguarded and `statSync` on a name with NUL. Confirmed: `GET /%E0%A4%A`, `/a%00b`, `/%` → 500, nothing logged (`serve-probe.mjs`). A moss app answers them 200.

**Design.** A path that does not decode, or decodes to a NUL, is answered `400` with `not a path` before any file is looked up.

**What changes.** A case that fails today (500) fails as a 400. Nothing else.

**Test (fails today).** `nisc start` on a page app: those three addresses → 400.

**Size.** ~6 lines. **New mechanism: no.**

---

## P7 — `PORT=` empty is said

**Problem.** `portOf('')` is `Number('') = 0`, so `PORT=` gives any free port with no word (`commands.ts:198`). Confirmed: `PORT="" -> http://localhost:56985`.

**Design.** When `PORT` is set and empty, `nisc start` prints `nisc: PORT is set but empty, read as 0: any free port. Unset it for 8787.` The port is today's.

**What changes.** One printed line. (Taking empty as unset would move such a server to 8787: a different result; not proposed.)

**Test (fails today).** `PORT= nisc start` prints the line.

**Size.** ~3 lines. **New mechanism: no.**

---

## P8 — The compression cache goes

**Problem.** `withCompression` (`site.ts:114–145`) remembers every compressed answer marked `immutable`, keyed by encoding, path and `last-modified` — not the query — and never forgets one. Confirmed with an app route `/thumb` answering `immutable` by `?user=`: `?user=alice`, then `?user=bob` → Bob got "thumbnail of alice" (`cache-probe.mjs`). It reaches an app's own routes under `nisc start`.

**Root cause.** Its comment assumes only the build's `/assets/` files are `immutable`; an app's own route can say so too, and the cache cannot tell them apart.

**Design.** Delete the cache (the `remembered` map and the two branches that use it). Every answer is compressed as it streams, as every non-`immutable` answer already is. Measured cost: brotli quality 5 on the 371 kB bundle of the moss-react app takes 5.5 ms, the 5 kB stylesheet 0.5 ms — once per browser, since those files are then kept a year.

**What changes.** Bytes on the wire are the same; a repeated asset answer is streamed (no `content-length`) instead of sent whole, and costs that CPU again.
**Owner to confirm:** an answer that today can be another person's is now always the request's own; nobody can rely on the first.

**Test (fails today).** `nisc start` with the `/thumb` route: Alice's and Bob's answers each name their own user.

**Size.** −15 lines. **New mechanism: no** (one removed).

---

## P9 — The shape check also reads what each name refers to

**Problem.** The source rules match spellings on the syntax tree (`shape/source.ts:59–73`), and `data` reads named imports only (`shape/app-data.ts:33–44`). Confirmed in the moss-react copy, all passing today: `const { roles } = session` (moss's `FunctionSession`); `const { NumberFormat } = Intl`; `new globalThis.Intl.DateTimeFormat`; `const { pathname } = window.location`; `window['document'].querySelector`; `import * as helpers from '../app/…'`, a re-export and a dynamic import of a function in `src/app`. And `<const>['a', 'b']` fails rule 16 as "a <T> assertion".

**Root cause.** A rule is a spelling, so every other spelling of the same reach passes.

**Design.** The check already builds a TypeScript program with a type checker for `data`. A second reading walks the same files with it and finds each rule by what a name refers to:
- formatting: any reference to the global `Intl` (declared in the default library), whatever the spelling;
- roles: any `roles` property declared in `@niscorp/moss`'s types, read by access, element access or destructuring;
- address: any expression of type `Location`, and `pushState`/`replaceState` on a `History`, in `src/ui/`;
- dom: `querySelector` and its kin on a value of type `Document`, in `src/ui/`;
- data: any name outside `src/app` and `src/dev` whose declaration is a function in `src/app` (not the manifest's factory), through a namespace import, a re-export or a dynamic import.

How it reports, so that nothing that passes today can fail:
- The rules that fail stay exactly as they are.
- A finding of the second reading is printed only when today's reading has no finding for the same rule, file and name (lyceum: the prototype finds 18 `data` lines where today's rule reports the import lines of the same two names in the same five files — compared by file and name, those are 0 new lines), and only when the app's `allow` does not excuse that file for that rule.
- What is left is printed as `[info]` — the line kind the check already prints for what fails on nothing — with `file:line` and the rule.
- The second reading runs outside the `try` that turns an error into "[fail] the source is read": if it throws, it prints one `[info]` line saying it could not run, and the exit code is today's.
- `<const>` is treated as `as const` is.

A prototype (`shape-proto.mjs`) finds all eight probes; on the model-first app it finds nothing. On lyceum it adds 0.9 s (the checker's measurement) to a check that already builds the program.

**What changes.** No app that passes today fails. New `[info]` lines where an app reaches past a rule by another spelling.
**Owner to confirm:** (a) the cli README's table says the check "fails on" these reaches; it would then have to say which spellings fail and that other spellings are reported, not failed — or the `[info]` lines become failures, which would fail apps that pass today and needs your yes; (b) an app whose `allow` excuses a file only because of a `<const>` assertion would see that allowance fail as "allows nothing in that file". No app in the repository has one.

**Test (fails today).** The shape test fixture with the eight spellings → eight `[info]` lines naming the right files and lines, exit code 0; the same fixture with an `allow` for one file → that file's line is not printed; a fixture where today's `data` rule already fails → no extra `[info]` line for the same name; `<const>[...]` → rule 16 passes.

**Size.** ~90 lines, ~50 lines of test. **New mechanism: yes** — a second reading (no new output kind, no new configuration).

---

## P10 — The banned word goes from the cli, create-nisc and the rulebook

**Problem.** The owner's word ban (the four-letter word for keeping something, in any form) is broken in printed messages and docs. Messages: `commands.ts:159` ("N of M paths did not …"), `shell-site.ts:189` (the legend line `✗ not written: a check did not …`, printed on every own-shell build, success included). Docs and code: cli README lines 101, 124, 131, 163, 166, 224, 233, 272, 347, 459; `commands.ts:65`; `project.ts:49`; `site.ts:113`; create-nisc README 53, 98, 155; create-nisc `cli.ts:104–107`, `generate.ts:203`; templates `nisc-reviewer.md:10`, `kit.tsx:6`, `kit.ts:7`, `guide.actions.ts:58/87/89`, `screens.ts:34`, `compose/index.ts:30/31/85`; STYLE_GUIDE 121, 173, 179, 181, 182, 184; REVIEW 12, 41, 57.

**Design.** Plain replacements by meaning: a check "failed"; a file or folder "has" or "contains"; something "is true by construction"; a variable for the person's granted actions is `granted`. The cli test titled with the word (`shell-site.test.ts:78`) is renamed with the message.

**What changes.** Two printed sentences change wording. Nothing in the repository reads them (searched: only that test title); exit codes and files are today's.

**Test (fails today).** A search for the word in all its forms over the files above returns nothing; the shell-site test asserts the new legend line.

**Size.** ~45 one-line edits. **New mechanism: no.**

---

## P11 — cli and create-nisc are made of modules, and checked as such

**Problem.** CHANGING_A_PACKAGE rules 1 and 6 ("One door", "Nothing flat: only `index.ts` sits at the top of `src/`"): cli has 10 files there, create-nisc 5. Nothing says they are exempt.

**Root cause.** `check:modules` covers moss only, so nothing fails when a package is flat. STYLE_GUIDE scopes the rule to "a package that has more than one concern"; cli (build and export, serving, dev, migrate, the shape check, the command line) and create-nisc (catalog, generate, documents, command line) each have several.

**Design.** Move code only, in its own commit (rule: a commit moves code or changes behaviour, never both):
- cli: `command/` (today's `cli.ts`, with P2's table), `project/`, `build/` (build, export, `routes.ts`, `stylesheet.ts`, `adopt.ts`), `serve/` (start, `site.ts`, `shell-site.ts`), `dev/`, `migrate/`, `shape/` (exists); `index.ts` stays the public entry with today's exports.
- create-nisc: `command/` (`cli.ts`, `set.ts`), `generate/` (`generate.ts`, `docs.ts`), `catalog/` (exists).
- tsup entry names stay `cli`, `index`, `shape`, so `dist/` file names, `bin/` and `exports` are unchanged. Both packages get a `PACKAGES` entry in `scripts/check-modules.mts`.

**What changes.** Nothing for any user: same commands, same exports, same `dist/` names (`check:api` and `check:packages` prove it).
Owner to confirm (not part of this proposal): nine more packages are flat (charter 6 files, signal 8, solid 10, strata 8, tide 6, vex 6, prism 3, cortex 2, loom 2). Each is its own case, against its own package.

**Test (fails today).** `pnpm check:modules` with cli and create-nisc in `PACKAGES` fails on today's tree.

**Size.** ~16 file moves, ~20 lines in the gate's table. **New mechanism: no.**

---

## P12 — The rulebook says every `nisc` command reads nisc.config.ts

**Problem.** AGENTS.md:551–552: nisc.config.ts is needed "only if its pages are drawn on the server or built to files". `nisc check` and `nisc dev` refuse without it (confirmed: `nisc check` with the config moved aside → "nisc: no nisc.config.ts in … ", exit 1).

**Design.** The doc changes, not the command: "what the app tells the `nisc` command — how it boots, how a screen is drawn. Every `nisc` command reads it." Every app create-nisc makes has one, and an app without one can run its suite as `tsx src/dev/all-checks.ts`.

**What changes.** Nothing.

**Test.** None runs; a text change. (An agent build, P32, is what would show it.)

**Size.** 1 line. **New mechanism: no.**

---

## P13 — A folder where create-nisc must read or write a file is named, not crashed on

**Problem.** `.gitignore/` or `.env/` as a folder in the target → `EISDIR: illegal operation on a directory, read`, exit 1 (confirmed). `addTo` reads them before the collision check knows about them (`generate.ts:211`).

**Design.** The collision check also covers every file create-nisc reads or writes (`.gitignore`, and `.env` when an item asks for keys): a folder at that name is listed as `.gitignore (a folder, where the app needs a file)`, and nothing is written — the same refusal a file in the way of a folder gets today. A kept `README.md` is neither read nor written, so it is not affected.

**What changes.** A case that fails today fails with the existing refusal.

**Test (fails today).** A target with a `.gitignore` folder → exit 1, the line naming it, nothing written.

**Size.** ~8 lines. **New mechanism: no.**

---

## P14 — create-nisc's tests build before they run

**Problem.** `test/cli.test.ts` spawns `bin/create-nisc.js`, which runs `dist/`. Run alone (`vitest`, or `pnpm --filter create-nisc test`), it tests whatever was built last. Turbo's `test` depends on `build`, so CI is right; a local run is not. Running `src/cli.ts` through tsx is not possible: `testedSet()` reads `__NISC_SET__`, which only the build writes in (`set.ts`).

**Design.** A `vitest.config.ts` with a `globalSetup` that runs the package's `tsup` once before the suite (loom and cortex already have a vitest config).

**What changes.** A test run takes the build's time first (about 1–2 s). Nothing for users.

**Test (fails today).** Change a printed sentence in `src/cli.ts`, run `vitest run` without building → the test sees the new sentence.

**Size.** ~12 lines. **New mechanism: yes, small** — a test setup file.

---

## P15 — The checks runner stays one file per app (no change)

The three `all-checks.ts` share an 8-line loop and differ in their list of checks. In an app it is one file, the app's own, and the app adds to its list. Moving the loop into `base/files/` would add a file to every app; moving it into `nisc check` would change what that command does. Neither is worth it. **What changes:** nothing.

---

## P16 — The create-nisc README names an option's `hint`

`env` row: `{ choose, message, options: [{ value, label, hint?, keys? }] }` — `hint` is read (`catalog/items.ts:88`) and shown in the question (`cli.ts:152`). **What changes:** nothing. **Test:** none (text). **Size:** 1 line. **New mechanism:** no.

---

## P17 — What `nisc start` loads is a dependency of a new app

**Problem.** `@niscorp/cli` is a devDependency (`templates/base/item.json:15`) while `start` is `nisc start`; the third review's production-only install has no `nisc` in `node_modules/.bin` (`apps/prodapp`). A host that drops dev dependencies cannot start the app. The same is true of `jsdom` for an own-shell DOM app: its `nisc.config.ts` imports it at the top (`dom/with/page/nisc.config.ts:1`), and it is a devDependency (`page/item.json`).

**Design.** The rule for the templates: `@niscorp/cli` and whatever `nisc.config.ts` imports are dependencies.
- `base/item.json`: `@niscorp/cli` to `dependencies`.
- `page/item.json` drops `jsdom`; `dom/with/page` adds it to `dependencies`; `react/with/page` adds it to `devDependencies` (its build's adoption check needs it, its `start` does not).
- cli README: `pnpm add @niscorp/cli`, with one sentence: a dependency when `nisc start` serves the app.
- `scripts/check-create.mts`: for one moss app and the own-shell DOM app, after the build, a production-only install and `npm start`, then one request to `/`.

**Shown working.** Copies of the moss-react and page-dom apps (built `dist/` included) with exactly those manifest changes, `pnpm install --prod` from the same tarballs: `nisc` is in `node_modules/.bin`, and `vite` and `typescript` are not installed. `npm start`, then `GET /` → moss-react 200 (7,833 bytes, the root drawn), page-dom 200 (6,794 bytes) (`cli-create-nisc/prod/`, `npm-start-probe.mjs`).

**What changes.** Apps made from now on. Existing apps are untouched; the README sentence tells their owners what to move if they deploy with a production-only install.

**Test (fails today).** The check-create step: `'nisc' is not recognized`.

**Size.** 4 manifest lines, 1 README line, ~25 lines in check-create (adds CI time: two installs). **New mechanism: no** (a step in an existing check).

---

## P18 — A model-first app reads its own `.env`

**Problem.** `src/server/boot.ts:13` and `src/dev/live-ask.ts:37` read `.env` from the current folder. `nisc build --root model-react` from the parent printed "GROQ_API_KEY is empty in .env" while it was set.

**Design.** Both read `fileURLToPath(new URL('../../.env', import.meta.url))` — the app's root, wherever the command is run from.

**What changes.** Apps made from now on. Run from the app's folder, the same file is read as today.

**Test (fails today).** A made model-first app with the key in `.env`; `nisc build --root <app>` from its parent → no "is empty" line.

**Size.** 2 lines. **New mechanism: no.**

---

## P19 — create-nisc no longer writes an empty key that hides one the user has

**Problem.** `generate.ts:220–221` treats a key as present only if a line starts with `NAME=`. A `.env` with `GROQ_API_KEY = sk-real` gained `GROQ_API_KEY=` (confirmed); Node reads both (spaces allowed, `export ` allowed) and the last wins, so the key is hidden (`node -e process.loadEnvFile` → `""`).

**Design.** One change, at the one place it goes wrong: when no value was given for a key (left empty in the walkthrough, or not in the environment) and the file already sets it in any form Node reads (`^\s*(export\s+)?NAME\s*=`), nothing is appended. When a value was given, the command does exactly what it does today.

**What changes.** Only the case that hides a key: an existing `GROQ_API_KEY = old` with the key left empty no longer gains an empty line. The case the checker named keeps today's result: an existing `GROQ_API_KEY = old` with a new key typed → the new line is appended and wins, as today. (Today an existing `GROQ_API_KEY=old`, no spaces, with a new key typed keeps the old key and appends nothing; that difference between the two spellings stays, as it is today. Making both take the typed key would change the second; not proposed.)

**Test (fails today).** A target whose `.env` has `GROQ_API_KEY = sk-x`, and one with `export GROQ_API_KEY=sk-x`, key left empty → `.env` unchanged. Guard (passes today and after): `GROQ_API_KEY = old` with `sk-new` given → `GROQ_API_KEY=sk-new` appended.

**Size.** 3 lines. **New mechanism: no.**

---

## P20 — The "Next" lines quote a folder with a space

`cli.ts:166` prints `cd with space\app`. A folder whose name has a space or a shell character is printed in double quotes: `cd "with space\app"` (works in cmd, PowerShell and POSIX shells). **What changes:** printed text, only for such names. **Test (fails today):** making `"with space/app"` prints `cd "with space`. **Size:** 2 lines. **New mechanism:** no.

---

## P21 — The kit stays one kit (no change)

A classic app gets `Card`, `Grid`, `Input`, `Check`, `Code`, `Points`, `Steps` — domain-blind primitives it reaches for at the order of work's step 3 — and `Frame`, `Dock`, `Talk`, `Prompt` (about 20 lines) that only model-first uses. Taking those four out needs two registries per renderer (one with them, one without, through `with/`), each kept in step by hand. That costs more than 20 lines of unused components. **What changes:** nothing.

---

## P22 — The model-first template's words match its code

- `compose/index.ts:91`: the `ask` description says `Send { text }`; the schema is `{ asked }` (`AskSchema`, line 18). It becomes `Send { asked: <the message> }`. The model reads that description (rule 7).
- `agents-section.md`: "`place` and `said` in `src/server/compose/index.ts` are where it goes" — nothing is named `place`; it becomes "`begin` and `said`". "It lives in four places and is named in seven" before eight steps becomes "It lives in four places (step 1) and is named in seven files and the two documents (steps 2–8)".

**What changes.** Apps made from now on. **Test:** the template's compose check asserts the `ask` description names `asked` (fails today). **Size:** 3 lines. **New mechanism:** no.

---

## P23 — A model-first app's documents say who may spend the key

**Problem.** The charter grants `ask` to `public` (`charter/charter.ts`); deployed, anybody who reaches the app spends the owner's Groq key, without limit. PLAN.md and AGENTS.md say nothing.

**Design.** The template keeps working as it does (it has no sign-in, so `public` is the only way to try it). Its PLAN.md gains an open item under deployment — "Who may ask the model: today everyone (`public`, `src/app/charter/charter.ts`), so anybody who can reach the deployed app spends your Groq key, with no limit. Before deploying: sign-in and a role that may ask, or a limit in `ask`." — and the agents-section's "Deploying" bullet says the same in one sentence.

**What changes.** Apps made from now on; two lines of their documents.

**Test (fails today).** create-nisc's generate test: a model-first PLAN.md names `ask` and `public` among its open items.

**Size.** 2 lines. **New mechanism:** no.

---

## P24 — A new moss app does not depend on tide

`templates/moss/item.json` adds `@niscorp/tide` to every moss app; no template file imports it (searched), and moss declares it an optional peer. The line goes; an app that wants tide adds it (rule 16). **What changes:** apps made from now on have one dependency fewer. **Test:** `check:create` makes, builds and serves every kind without it (it would fail if anything imported tide). **Size:** 1 line. **New mechanism:** no.

## P25 — Caret ranges stay (no change)

Every `@niscorp` dependency of a new app is `^<version>`, `@niscorp/nisc` included; nisc pins its members exactly and is released whenever any member is, so a fresh install resolves the same set nisc pins. Only updating one package alone can put the app's moss ahead of the rulebook it reads, and `npm update` updates both. The create-nisc README already says this. **What changes:** nothing.

---

## P26 — AGENTS.md: one file read in full, and files beside it the order of work names

**Problem.** AGENTS.md is 615 lines, 10,617 words, 64,882 bytes; an app's own AGENTS.md tells an agent to read all of it. STYLE_GUIDE.md (18.7 kB), which rule 16 makes an app follow "in full", carries sections that bind only packages.

**Which limits apply where.** Codex truncates the `AGENTS.md` files it finds in the project tree at 32 KiB (32,768 bytes): that is the app's own `AGENTS.md` (23 lines today — fine) and, in the nisc repository, the root `AGENTS.md`, which is the rulebook itself. The rulebook in `node_modules` is read by a file tool when the app's AGENTS.md points to it, so for it the cost is attention, not truncation. Claude Code's "under 200 lines" is for `CLAUDE.md`, loaded every session. The skills pattern — a core under 500 lines, reference files read when a task needs them — is the shape proposed here.

**Design.** Text moves; no rule's words change except pointers and the merges named below. All files sit in `packages/nisc/` and ship (`files: ["*.md"]`).

| File | What moves into it (AGENTS.md lines today) | The order of work names it at |
|---|---|---|
| `AGENTS.md` | stays: a head with a table of the files below, the thesis, decision points D1–D5, the interview, the toolbox, rules 1–16 (7b's first three bullets and rule 12 whole), rules 17–20 as their statements, order of work, verification | read in full, first |
| `ACTIONS.md` | "A worked trio" (327–411) and "Working patterns" (470–491) | step 3, Kit — so "what a lost connection looks like is the kit's" is read before the kit |
| `VEX.md` | "Using Vex" (413–468) but its client-degrade bullets | step 4 |
| `VERSIONS.md` | rules 17–20 in full (296–325) | step 4, and every table or grammar change |
| `GENERATED.md` | rule 7b's five parts (174–213) | step 6, before saving what a person or a model makes |
| `PAGES.md` | the bullets of rules 2a, 4a and 11b (117–119, 130–135, 257–260) | step 3, when pages are drawn on the server or written to files |
| `APP_LAYOUT.md` | "Layout of an app" (506–567) | step 2 |
| `DEGRADE.md` | "The client-degrade path" (569–586) and the degrade bullets of "Using Vex" (454–457) | step 1, when D1 is the degrade |
| `WORKAROUNDS.md` | "Before working around a limitation" (493–504) | a line in AGENTS.md: before concluding nisc cannot do something |

- The order of work in AGENTS.md says, in each step, which file to read (written into the prototype, steps 1–4 and 6).
- Every pointer to a section that moved names its file: the two `see "Using Vex"` in the core, ACTIONS.md's `"Using Vex" below`, DEGRADE's `see "Using Vex"`, and REVIEW.md's "the rulebook's failure mode 4" (now `WORKAROUNDS.md`, item 4).
- Rule 18's statement in the core gains the grammars its first bullet names — "nova's actions and layouts, Prism's config, vex's entries, and an app kit's component props alike" — so that a kit's props being a grammar is read before step 3, not only in VERSIONS.md.
- STYLE_GUIDE.md: "The packages are live", "Package prompts serve every app" and "Examples" move to CHANGING_A_PACKAGE.md — each already says it binds packages only (−4.2 kB, to about 14.5 kB). "Modules" and "Build" stay: rule 16 applies STYLE_GUIDE to apps in full, so moving them would stop "a module has one door", the size limits and "every dep must earn its place" from binding apps — that is the owner's to decide and is not proposed. CHANGING_A_PACKAGE.md keeps shipping: AGENTS.md points readers there.

**Measured on a prototype** (`cli-create-nisc/split2/`, made by `split2.mjs` from the real file, with P27, P28 and P29's text and the per-step pointers in it): AGENTS.md **300 lines (199 with text), 31,168 bytes** — 1,600 bytes under 32 KiB. ACTIONS 8.4 kB, VEX 5.9, GENERATED 5.1, VERSIONS 4.1, APP_LAYOUT 5.9, DEGRADE 3.6, PAGES 2.4, WORKAROUNDS 2.3.
**32 KiB is not reachable while "Before working around a limitation" stays in the core:** with it, the same set is about 33.3 kB. That section is guidance, not a numbered rule, but every agent reads it today; moving it is in the owner line below.

**The size gate.** `check:packages` gains one line that fails when `packages/nisc/AGENTS.md` passes 32,768 bytes. On today's file it fails (64,882); on the prototype set it passes.

**What an app's own AGENTS.md then says** (create-nisc `docs.ts`): "The rules it is built by are `node_modules/@niscorp/nisc/AGENTS.md`. Read it in full before changing anything here; its order of work names, at each step, the file beside it to read before that step. `STYLE_GUIDE.md`, beside it, applies to the code." (The rulebook's steps, not PLAN.md's: a model-first PLAN.md has different steps.) The reviewer agent is unchanged: it reads REVIEW.md, and rule numbers do not move.

**What changes.** No code. An app made before the split keeps a sentence saying "read all of it", and the AGENTS.md it reads names the rest.
**Owner to confirm:** (a) an agent now reads eight parts of the rulebook only when a step reaches them — a rule could be missed by an agent that skips the order of work's pointers; (b) moving "Before working around a limitation" out of the file read in full, which is what brings it under 32 KiB; (c) the size line in `check:packages` (a new gate); (d) separately and additive: Claude Code reads `CLAUDE.md`, not `AGENTS.md`, and a new app has none — a one-line `CLAUDE.md` containing `@AGENTS.md` would make Claude Code load it.

**Test.** `check:packages` fails on today's AGENTS.md with the size line added, and passes on the split set. Whether agents build better is P32.

**Size.** 8 new files (text moved), ~25 lines of new map and pointers, 1 sentence in `docs.ts`, 1 line in `check:packages`. **New mechanism: yes** — files read at a step, and a size gate.

---

## P27 — Rule 10a names tide's tables

**Problem.** Rule 10a lists the engine's tables a `*.read` role must deny; an app that keeps tide's tables (`TIDE_SEQUENCE` in `runtime.tables`) has four more — `tide_fact`, `tide_run`, `tide_work`, `tide_reflex_state` (`packages/tide/src`, their `CREATE TABLE`s) — and a wildcard reaches them. Moss enforces no such list; the rule is the only guard.

**Design.** Rule 10a's first bullet adds: "and, when the app keeps tide's tables, `tide_fact`, `tide_run`, `tide_work`, `tide_reflex_state` — a role that is to read tide's ledger is granted it by name."

**What changes.** No code. An app that keeps tide's tables and grants `*.read` is told to deny four more.
**Owner to confirm:** this adds to what an app must deny; the toolbox says tide's ledger "is read through vex like any table", which this keeps, by name.

**Test.** None (text).

**Size.** 1 line. **New mechanism:** no.

---

## P28 — Rule 16's dependency line

**Problem.** Rule 16: "Deps via `pnpm add` only." An app made with `npm create nisc` under npm is told `npm install` and `npm run dev` by create-nisc itself.

**Design.** "Dependencies are added with the package manager's own command (`pnpm add`, `npm install <name>`), never by editing package.json by hand."

**What changes.** No code.
**Owner to confirm:** whether "pnpm" was the rule (then create-nisc should say pnpm to everybody) or the add-command was (then this wording).

**Size.** 1 line. **New mechanism:** no.

---

## P29 — Rulebook wording that is wrong today

Each a text change; no rule's substance changes. Test for all: none runs (text); P32 is what would show their effect.

1. **`/STYLE_GUIDE.md` (R2-10, R3-D3).** The repository root's AGENTS.md and STYLE_GUIDE.md are git symlinks (mode 120000); on Windows with `core.symlinks` off they are one-line files containing a path (this checkout's root AGENTS.md is the 23-byte line `packages/nisc/AGENTS.md`). AGENTS.md:5 and :287 and CHANGING_A_PACKAGE.md:3 and :27 send readers to `/STYLE_GUIDE.md`. They become "`STYLE_GUIDE.md`, beside this file" — true in the repository and in `node_modules` — and AGENTS.md:3 drops its mapping of that path. The symlinks stay.
2. **Write verbs (R3-D2).** Rule 10's `data` universe says `table.verb`: it gains "(the verbs: `read`, `write.insert`, `write.update`, `write.delete` — `todos.write.update`, not `todos.update`)", from vex's `SCOPE_VERBS`. The worked trio's `setDone` call gains an `onError` that sets an `error` key its layout shows, so a refused write is seen. That `todos.update` boots at all is charter's or moss's to refuse — a case for those packages, not proposed here.
3. **`createAppShell(deps)` (R3-D4).** AGENTS.md:491 and :575 name a function no package exports (it is mythos's). They become "the app's own boot (`boot()` in an app `npm create nisc` makes; mythos's `createAppShell`)".
4. **Path spellings (R3-D7).** Rule 5 gains: "Prism's `$ref` indexes as `$.rows[0].title`; a layout binding, a trigger's `set … from` and an `@event` path index with a dot, `$.rows.0.title` (nova splits on `.`). The wrong spelling reads nothing and draws empty, with no error." A warning in nova on a bracket in a binding would be nova's case.
5. **Prewarm (U12).** "Using Vex", the client-degrade bullet gains: "vex's `seedCache(cache, entries)` compiles each mapping (the identity where there is none) and writes it `protected: true`, but it neither stamps the schema fingerprint nor refuses two entries of one fingerprint (the later replaces the earlier), so a degrade app writes its rows itself, as mythos's `src/vex/prewarm.ts` does." The two missing pieces in `seedCache` would be vex's case.

**What changes.** Nothing but text. **Size.** ~10 lines. **New mechanism:** no.

---

## P30 — The class rule for packages, said once

**Problem.** CHANGING_A_PACKAGE.md:9 applies rule 16 "in full" to packages, and rule 16 bans classes; STYLE_GUIDE.md:258 asks packages for custom error classes; the lint lets `Error` subclasses through ("an Error subclass is the one exception", `eslint.config.mjs:71`); eight packages ship them.

**Design.** CHANGING_A_PACKAGE.md:9 becomes: "`AGENTS.md` rule 16 applies in full, but for one class: a domain error is an `Error` subclass (`STYLE_GUIDE.md`, "Error Handling") — the one the lint lets through."

**What changes.** No code; the text says what the lint already enforces.
**Owner to confirm:** this writes the exception into the rule for packages; the alternative — no classes in packages at all — would change eight packages.

**Size.** 1 line. **New mechanism:** no.

---

## P31 — The two private sites (owner decision)

**Problem.** The owner's notes name nisc-website and moccadroid-website as current reference apps; AGENTS.md no longer names them because they are private on GitHub and answer 404 to any reader but the owner. AGENTS.md ships to strangers on npm and is the root AGENTS.md of the public repository.

**Position.** AGENTS.md names only apps its reader can open. Recommended: make the two repositories public, then add one line each under "Apps to read", saying what each is the reference for. Until then nothing shipped names them, and the owner's own sessions keep pointing at them from the owner's notes.

**What changes.** Nothing until the owner decides. **Size.** 2 lines once public. **New mechanism:** no.

---

## P32 — Measure the rulebook change with agent builds (owner decision)

**Design.** One brief — the third review's `todo` app built by following AGENTS.md — built by the same model from a fresh `npm create nisc` app against two rulebooks: today's (0.9.4) and the split one (P26 with P29), each installed from a packed tarball. A first run of one build per rulebook, read by hand, before more. Then three builds per rulebook. The yardstick, fixed before the first run: (1) typecheck and `npm run check` green; (2) a fresh reviewer subagent that is not told which rulebook was used runs REVIEW.md on each app and reports findings by severity; (3) which rulebook files the builder opened, from its tool log; (4) tokens and wall time. Results reported against today's numbers.

**What changes.** Nothing; it measures. **Owner to confirm:** the spend — the time and tokens of the first two builds are reported before the other six start.

**Size.** No code; a run plan. **New mechanism:** no.

---

## Notes for whoever builds these

- P1 builds on P3 (the export is written into a fresh folder before anything is removed) and is easiest after P11 (the export becomes its own module).
- P2, P5 and P7 change the same command code as P11 moves; P11 first (it moves code only).
- P26 and P29 touch the same text; P29 first, then P26 measures the result.
