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
| D6 Who answers a message | answered | Jev picks the prepared answers that fit (`TYPESAFE_API_KEY`); gpt-oss-120b on Groq fills them in (`GROQ_API_KEY`). Without Jev the chat model picks too, slower and with no probabilities. |
| D7 What a screen is made of | answered · **open: the answers** | Prepared answers (`src/app/answers.ts`) placed on four areas, and screens of them (`src/app/screens.ts`) in the bar’s menu. Which answers and screens there are follows the data. |
| D8 History | derived · **open** | The answers one shell was given, kept while it lives; a reload starts again. Open: whether a person's answers outlive the shell, and memory beyond that. |
| D9 Embeddings | answered · **open: memory** | `EMBEDDINGS` in `.env`; they narrow the prepared answers to the 255 nearest a message when there are more. |

## Answered when it was made

- **Who leads:** a model. A message is answered with a screen: Jev picks the prepared answers that fit (`src/app/answers.ts`), gpt-oss-120b fills in what the message says, and the plan is placed on the four areas. The keys are in `.env`.
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
2. **Scaffold** — done: the frame, the message loop, seven actions, five prepared answers and three screens over hello-world rows, and their checks.
3. **Data** — per D2/D3: your tables in `src/db/schema.ts`, your reads and writes in `src/app/vex/`; the greetings go.
4. **Prepared answers and screens** — one answer for each thing a person will want to see: an action, its input, and what it shows, in words a model can match a message to; and the screens that put them together, the first the one the app opens on.
5. **Actions** — your own, small: one purpose each, a description that says what it shows, an `input` for what an answer fills in.
6. **Writes** — per D4; a form an answer opens, filled in by the model, saved by the person.
7. **Checks** — every prepared answer has a message in `src/dev/compose-check.ts` that must reach it.
