# Reviewing a nisc application

For an agent asked to review an app built on nisc. It is made to be run on its own: read this, the app's `PLAN.md` and its own `AGENTS.md`, and the app. Open the rulebook (`AGENTS.md`, beside this file) and a package's docs only where a finding needs a rule's exact words. Rule numbers here are the rulebook's.

A review answers one question: **does the app do what it does as data, or did code grow where data belongs?** An app can pass every one of its own checks and still fail that: its checks test what it does, not how it does it. Every finding under "What to look for" was found in an app whose checks were all green.

**Review early and often.** Run a review after each step of the order of work (the rulebook's "Order of work"), not only at the end: a drift found after the data layer is one read moved; found after the actions, it is every screen built on it. An app made by `npm create nisc` ships the reviewer as a Claude Code agent, `.claude/agents/nisc-reviewer.md`.

## How to run it

1. **The gates.** The app's typecheck and its check suite (`npm run typecheck`, `npm run check`), which runs its shape check (`src/dev/shape-check.ts`) beside its own checks. An app without one is a finding: copy it from a new app (`npm create nisc`). Read what its `functions` and `allow` say, too: an allowance with a weak reason is a finding the gate cannot see. A red gate is the first finding; a boot refusal is a finding, not an environment problem. Then take the counts in "Measure first": they say where to read.
2. **Read in this order:** the charter, the entries, three actions of different kinds (a list, a form, a screen only some roles hold), the server's functions, the kit. The order follows where a fault costs most.
3. **Go through the checklist,** then **what to look for**.
4. **Verify before you report.** A finding is a hypothesis until the code shows it: open the file and quote the line.
5. **Never adjust a check to make a finding go away.** A check that has to change is rewritten to protect what it protected (the rulebook's failure mode 4).

## Measure first

These numbers are not rules. They say where a design has drifted. In the lab apps vex replays outnumber function calls: lyceum 55 to 37, lyra 149 to 24, atrium 103 to 11. The shape check prints the first two.

| Count | How | Drift when |
|---|---|---|
| `fn:` endpoints against vex replays | `grep -rhoE "\bfn: *'" src/app` and `grep -rhoE "url: *'/api/[a-z/]*vex'" src/app` | functions outnumber replays |
| entries with a `mapping` | `grep -rn "mapping:" src/app/vex` | none, while the server formats |
| formatting outside Prism | `grep -rn "Intl\.\|toLocale" src/server src/app src/ui` | any |
| `executeAs` inside `functions(session)` | read each: is the role it names wider than the person's? | a person's read served by a machine role |
| roles read in code | `grep -rn "session.roles\|principal.roles" src/server` | any outside where a principal is resolved |
| the address and the DOM in the kit | `grep -rn "location\.\|history\.\|querySelector" src/ui` | any outside a declared routing adapter |
| files read into data | `grep -rn "FileReader\|readAsDataURL" src/ui` | any |

## The checklist

1. Typecheck passes; every dev check passes; the manifest boots — moss refuses an incoherent charter.
2. No renderer code (JSX, a tty kit) outside `ui/` and the entry point. `server/document.ts` hands the kit's registry to moss to draw a page with; it imports the kit and contains no renderer code of its own. No `fetch` outside the endpoint layer, except to send a file (rule 9a). No formatting (`Intl`, `toLocaleString`, date libs) outside Prism transforms.
3. Every action an opener loads with input declares it in the definition's `input`, and the declared fields are a subset of the action's `data` keys (rule 14).
4. Every displayer of an entity stays current after a write: its read is `refresh: 'reactive'`, or the write's success path emits a change channel the displayer listens to.
5. No component name contains a domain noun; no component imports shell, action, or data code (rule 2).
6. No layout or component branches on roles or capability data (rule 11) — per-principal difference is existence or a served variant.
   - **a.** Every artifact the manifest carries is pure JSON and parses its schema — a function, a `Date`, an `undefined`, or a class instance in an artifact is a code file masquerading as data. The manifest's declared code fields (`scope`, `identity`, `phrases`, `functions`, `onSession`, `runs`, `reconcilers`, a reaction's `run`, `features`, and the shell's `inputs` and `seeds` hooks) are the only exceptions; they live outside the artifact tree and are validated by running, not by this check. Moss reads the manifest by a schema when it is handed to `createServer` and refuses to boot on one that does not parse, a code field that is not a function included; this check finds it before a boot does.
   - **b.** Session code sits in the seam that describes it (rule 7a): no handler registered on `functions` that nothing calls. Tenancy resolves through `scope` and engine-side behaviors, never from a request field.
   - **c.** No role holding a data wildcard reaches the engine's tables, and the charter check resolves against the universe boot does (rule 10a).
   - **d.** Where pages are drawn on the server: a check opens the drawn page with the real wire and target and the terminal adopts it with nothing said (rule 2a), at every window width the kit distinguishes; a page drawn for somebody goes out `private, no-store`; and every sign-in the app answers over HTTP sets the session cookie on its response and hands the page nothing (rule 12).
7. Style guide bans (rule 16): `any`, `enum`, classes, default exports, `function` declarations, type assertions and non-null `!` — read by the compiler, not by grep, which cannot tell negation from assertion. Declared shim exceptions are honored.
8. Decision points: each of D1–D5 is recorded in the app's `PLAN.md` with its tier — answered, delegated by name, or derived — never assumed silently.
9. Versions (rules 17–20): `pnpm check:grammars` and `pnpm check:sources` pass; no DDL outside a sequence; no edited migration, snapshot, early-stamp corpus file or hand-moved lock.

## What to look for

**The data path (the thesis; rules 5, 7, 9, 10).** A read is a vex entry replayed by the action that shows it, under the person's own policy. A function is the escape hatch: mail, signing, files, push, a model, parsing an upload, what lives in the person's shell rather than in rows, a write that may touch only some columns, a refusal no row rule or mutation `where` can say. For each function an action calls, ask what it does that an entry cannot. A function that replays entries and reshapes their rows is a read in disguise, and it costs three things at once:

- **policy:** it runs as whatever role it names, so the charter's grants and reach for the person gate nothing. Find each machine role a person's function uses, and what it reaches that the person should not (*a teacher reading every class's attendance through a function that runs as the doorkeeper*);
- **freshness:** a `refresh: 'reactive'` entry behind a function answers once; nothing follows it;
- **formatting:** its words are built in TypeScript, where Prism cannot check them.

**Formatting (rule 9).** Dates, times, counts, money and sentences built from data are Prism, in an entry's `mapping` or an endpoint's `response`. The app's "today" is in the reads' scope (the `scope` seam), never a wall-clock read.

**Per-principal UI (rule 11).** A flag a function computes from the person's roles (`canChange`, `isStaff`) that a layout branches on is a conditional. It is existence (an action only some hold) or a served variant.

**`src/app` is data (checklist 6a).** Every export there is a value that serializes. A function exported from `src/app` that runs while the app runs — a layout builder called per request, a helper the server imports — is code in the artifact tree, even if everything the manifest carries passes the purity check. A builder run once as its module loads is allowed but is not row-ready: note it, as minor.

**The kit (rules 1, 2, 2a, 4, 9a).** Components are domain-blind and configured: no domain word in a component's name or in the names of its tones and sizes; no app logic deciding what happens next; no reading another component's elements; no module-level state carrying coordination between components; no file sent over the socket; no address read to choose what an action shows.

**Writes (rule 8, D4).** Identity is the session's. An id from the request names a subject only where the caller's role may act on others; check that the function checks it, or that the entry's reach does.

**HTTP routes (rules 9a, 12).** List every route the app mounts. Legitimate: sign-in redemption, pairing, sending and serving files. A GET that writes, a route that answers to the session cookie for anything but a file, or data that should go over the socket is a finding.

**Boundaries (rule 13).** What enters from outside is parsed, `.strict()` where it is external input. A `looseObject` on a function's input is acceptable when the function is handed a whole card's data; on a form or a route it is not.

**Versions and startup (rules 17, 20).** DDL only in a strata sequence, appended; rows an app needs to start are a migration step, not a boot-time write; timers doing scheduled work belong in tide.

**The app's own documents.** `AGENTS.md` and `PLAN.md` say how the app works. Read one of their claims against the code for every part you review. A document that describes a design the code has left is a finding — the next agent builds on it — and so is code kept alive only by the checks.

## Report

```
Verdict: one paragraph — how far the app is from what nisc intends, and the one change that moves it most.
Strong: …   Medium: …   Minor: …   Done right: …
Each: [rule] file:line — evidence — cost.
```

Rank by cost: **strong** is the thesis or a security boundary (who sees what they should not), **medium** a rule broken locally (what goes stale, what cannot be checked), **minor** style. Say briefly what is done right. A change that makes the app less declarative, less validated, or less observable is wrong even if it works.
