# PLAN — mira

Made 2026-10-20 by `npm create nisc`, on nisc 0.8.1. This is the record AGENTS.md's interview asks for ("Before any code"). The walkthrough asked what shapes the files; everything else is **open**, and an open decision blocks the build that depends on it until it is answered by the user or delegated by name. A blanket "go" delegates nothing.

## Decision points

| | Tier | |
|---|---|---|
| D1 Posture | answered | **A moss server app.** The shell runs on the server, one per person; the browser is a canvas terminal over a socket. The charter is enforced there: a principal reaches only the actions and the data it is granted. |
| D2 Environment | derived · **open for deployment** | **Postgres when `DATABASE_URL` is set** (`docker compose up -d` stands one up on this machine), else PGlite, an in-memory Postgres that starts empty every boot; the checks always run on PGlite (`src/server/runtime.ts`). The tables are `runtime.tables`: moss applies them at boot, and `nisc migrate` applies them as a deploy step. Open: where a deployment runs. |
| D3 Reads | answered | **Vex entries**, read by an action by its fingerprint (`/api/vex`), under the person's policy (`src/app/vex/`). |
| D4 Writes | answered | **Vex mutation entries**, posted to `/api/vex` by a form the person saves, never by the model. |
| D5 Routing | derived · **partly open** | The first screen is drawn on the server, for whoever the browser's session cookie says, and adopted by the terminal; a page drawn for somebody is theirs alone (`private, no-store`). The one route of the app's own is `/login`, where a mailed link is redeemed (`routes` in `nisc.config.ts`). Open: which paths are **pages** rather than the app, and whether the app's shell state syncs to the address bar. |
| D6 Who answers a message | answered | Jev reads the message and the open screen (`TYPESAFE_API_KEY`), then gpt-oss-120b on Groq composes the screen as a cortex agent (`GROQ_API_KEY`), with what Jev picked as a hint. Without a TypeSafe key there is no Jev pass. Jev may take 2 s and the model 8 s; past that, the model answers alone, or the line says it could not be reached and the screen stays as it is. Measured against the real models on the tour's 16 test messages, before the tour was removed: 30/32 right with Jev, 31/32 without, and about 200 ms slower with it. |
| D7 What a screen is made of | answered | Canvases: an action the model may place (`placeable`, in `src/app/action-catalog.ts`), opened with an input its schema takes, and why it is there; or words. Up to six, on the areas `a`–`f`; the screens in the dock are canvases too (`src/app/screens.ts`). |
| D8 History | derived · **open** | The answers one shell was given, kept while it lives; a reload starts again. An answer keeps what the person did on it when it is left — a count, a step ticked, a pick — as a browser keeps a page's form, so going back shows it as they left it. Open: whether a person's answers outlive the shell, and memory beyond that. |
| D9 Layout swaps | answered | **Through `session.draft`, where moss checks it.** An answer's arrangement goes into the frame's `answers` region as the whole frame with the arrangement in it: one layout in the shell's draft, taken again for each answer, kept nowhere (`src/server/compose/index.ts`). Only somebody signed in asks, and every signed-in session has a draft. |
| D10 What keeps a canvas in place | answered | **The model answers by area.** It names only the areas that change — a canvas moved from another area, a new one, words, or nothing — and an area it leaves out stays as it is, the same canvas: a card filled in never moves the others. |
| D11 Jev's "still wanted?" | answered | **Not asked.** On ten follow-ups Jev was right 8 of 14 times, and with its answer the model dropped what was open. |
| D12 What a card written onto a screen keeps | derived | **Nothing of what was there.** A canvas the model or a screen writes holds its whole input: what it leaves out is its action's default, so a checklist written where another was shows none of its ticks, and a new quick check opens unpicked. A canvas an answer leaves alone keeps what the person did to it. |
| D13 Who gets in | answered | **Invite only, by a link mailed through Resend** (`RESEND_API_KEY`; without it the link is written to the server's log). The owner is the address in `MIRA_OWNER`, let in when the app starts; the owner invites everybody else from the People screen, and a person the owner invites is always a member. A link works once, within 15 minutes; a session lasts 30 days (`src/server/identity/`). Nobody signed in holds the sign-in card and nothing else. |

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
2. **Scaffold** — done: the frame, the message loop, the dock, and their checks.
3. **Data** — per D2/D3, your tables in `src/db/schema.ts`, your reads in `src/app/vex/`.
4. **Actions** — your own, small: one purpose each, a description that says what it shows, an `input` schema for what the model fills in; the ones the model may place in `placeable`, each granted in the charter.
5. **Screens** — the ones a person will want in the dock, each its canvases; the first the one the app opens on.
6. **Writes** — per D4; a form an answer opens, filled in by the model, saved by the person.
7. **Checks** — a check for each feature in `src/dev/`, beside `compose-check.ts`, which runs the loop offline.
