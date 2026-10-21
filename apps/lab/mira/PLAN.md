# PLAN — mira

Made 2026-10-20 by `npm create nisc`, on nisc 0.8.1. This is the record AGENTS.md's interview asks for ("Before any code"). The walkthrough asked what shapes the files; everything else is **open**, and an open decision blocks the build that depends on it until it is answered by the user or delegated by name. A blanket "go" delegates nothing.

## Decision points

| | Tier | |
|---|---|---|
| D1 Posture | answered | **A moss server app.** The shell runs on the server, one per person; the browser is a canvas terminal over a socket. The charter is enforced there: a principal reaches only the actions and the data it is granted. |
| D2 Environment | derived · **open for deployment** | Development and the checks run on PGlite, an in-memory Postgres that starts empty every boot (`src/server/runtime.ts`). Open: the Postgres a deployment hands it, and where it runs. |
| D3 Reads | answered | **Vex entries.** An answer's action reads one by its fingerprint (`/api/vex`), under the person's policy, and again whenever what it read changes (`refresh: 'reactive'`). |
| D4 Writes | answered | **Vex mutation entries**, sent from a form an answer opened (`answers.write`) — by the person, never by the model. |
| D5 Routing | derived · **partly open** | The first screen is drawn on the server and adopted by the terminal — it costs nothing while nobody can sign in. Open: once sign-in exists, the browser keeps the session in a cookie no script can read, and the page is drawn for whoever it says (AGENTS.md rule 12) — a page drawn for somebody is theirs alone (`private, no-store`). Open: which paths are **pages** rather than the app, and whether the app's shell state syncs to the address bar. |
| D6 Who answers a message | answered | Jev reads the message and the open screen (`TYPESAFE_API_KEY`), then gpt-oss-120b on Groq composes the screen (`GROQ_API_KEY`), with what Jev picked as a hint. Without a TypeSafe key there is no Jev pass. Jev may take 2 s and the model 8 s; past that, the model answers alone, or the line says it could not be reached and the screen stays as it is. |
| D7 What a screen is made of | answered | Canvases: an action from the catalog (`src/server/compose/catalog.ts`: the actions the model may place, the reads they show, the writes a form saves through), opened with an input its schema takes, and why it is there. Up to six, on the areas `a`–`f`; the screens in the dock are canvases too (`src/app/screens.ts`). |
| D8 History | derived · **open** | The answers one shell was given, kept while it lives; a reload starts again. Open: whether a person's answers outlive the shell, and memory beyond that. |
| D10 Layout swaps | derived · **open: sign-in** | An answer’s arrangement is swapped into the frame’s `answers` region through moss’s unverified shell (`@niscorp/moss/unverified`, in `src/server/compose/index.ts`), because moss lets a session change a layout only through a draft, and a draft needs a signed-in person. **When the app has sign-in, the swap moves to `session.draft`, where moss checks it.** |
| D11 What keeps a canvas in place | answered (2026-10-21) | **The model answers by area.** It names only the areas that change — a canvas moved from another area, a new one, words, or nothing — and an area it leaves out stays as it is, the same canvas. Before, it answered with an ordered list that was laid into the areas from `a`: a form filled in from the overview moved every other canvas up an area, and the screen looked new. Measured on the cases asked of mira (`src/dev/live-ask.ts --runs=6`): 57/60. |
| D12 Jev's "still wanted?" | answered (2026-10-21) | **Not asked.** On ten follow-ups Jev was right 8 of 14 times, and with its answer the model dropped what was open. |

## Answered when it was made

- **Who leads:** a model. A message is answered with a screen: Jev reads the message and the open screen, gpt-oss-120b composes the screen from the app's actions, and the dock places it on the six areas. The keys are in `.env`.
- **What draws the screen:** React. The kit in `src/ui/` is where the look lives; a layout names components, never styles.

## The dial-in — open

- The entities, and how they relate — and what a person will ask about them.
- Expected scale.
- Who uses it: one person, or roles. More than one principal sketches its roles and charter now, not later.
- Memory: what the app keeps of a person between messages.
- Look and feel.
- Where it is deployed.
- What happens to the data long-term.

## Order of work

1. **The interview** — every open item above, answered or delegated by name. ← here
2. **Scaffold** — done: the frame, the message loop, seven actions, three screens over hello-world rows, and their checks.
3. **Data** — per D2/D3: your tables in `src/db/schema.ts`, your reads and writes in `src/app/vex/`; the greetings go.
4. **Screens** — the ones a person will want in the menu, each its canvases; the first the one the app opens on.
5. **Actions** — your own, small: one purpose each, a description that says what it shows, an `input` schema for what the model fills in; the ones the model may place go in the catalog.
6. **Writes** — per D4; a form an answer opens, filled in by the model, saved by the person.
7. **Checks** — `src/dev/compose-check.ts` runs the loop offline; `src/dev/live-ask.ts` asks the real models a run of messages and counts the right screens.
