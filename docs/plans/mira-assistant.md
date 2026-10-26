# Mira Assistant: your own Dots, built the nisc way

**Status: Proposed (2026-10-22), its three decisions answered (2026-10-26). Step 1 built (2026-10-26),
steps 2–6 not started.** Branch `worktree-mira`. Mira is a bare model-led app (the tour came out in `7890b0c2`): every typed message is
answered with a screen, composed by a cortex agent from the app's actions. Part 5 has what was decided.

## 0. For whoever builds this

Read `apps/lab/mira/AGENTS.md` (how the model leads, where things go) and the rulebook it points at
(`packages/nisc/AGENTS.md`, rules 7, 8, 10–12, 14, 15, 17). Every part below is a module of its own
under `apps/lab/mira/src/` with one entry point. Who may reach a row is the charter's and vex's (a grant
and a row rule), never a check in code. No package changes beyond the one in decision 1. Moss stays
unaware of memory: memory is mira's module, a placeholder the owner will replace with a memory concept
of his own, so only its four calls are meant to last.

## 1. What Mira is

OpenAI's Dots are agents you give a responsibility: they keep waking, read, and write you summaries.
Mira does the same job the other way round. **You talk to it and it answers with screens; it remembers
what you tell it; and when you give it a standing job, the model writes the job down once (a tide
reflex), you look at what it would do and arm it, and from then on the runtime runs it with no model at
all.** Everything that lasts is a row you can see, change and delete. The model writes documents and
words; a person presses anything that acts.

Not in this plan: browsing on its own, acting without a press, a chat transcript (the open screen stays
the conversation), an open tier for strangers.

## 2. What it is made of

### 2.1 A person, on Postgres (`src/server/identity/`)

- **Sign-in by magic link**, the strategy the rulebook names (rule 12). nisc has the pieces —
  `mintSession`, `sessionCookies`, `session.grant`, the `sessions` credential (`runtime.session:
  'sessions'`) — and leaves the link to the app.
  - Table `links`: `token_hash text pk`, `email text not null`, `expires_at timestamptz not null`,
    `created_at timestamptz not null default now()`.
  - Entries `links/issue` and `links/redeem` (redeeming deletes the row), run with `server.executeAs` as
    the machine role `gatekeeper`, which is granted only `links.insert` and `links.delete`.
  - Function `signin.request({ email })` → mails the link through Resend (`RESEND_API_KEY` in `.env`;
    without it the link is written to the server's log). Route `/login?token=` in
    `nisc.config.ts` → redeem → `mintSession(pool, personId, 30 days)` → `sessionCookies` → 302 to `/`.
- **Who gets in: invite only.** The owner's email comes from `.env` (`MIRA_OWNER`); the owner adds
  people from a People screen (`people.invite({ email, name })`). Table `people`: `id uuid pk default gen_random_uuid()`,
  `email text unique not null`, `name text`, `role text not null check (role in ('owner','member'))`,
  `invited_by uuid`, `created_at timestamptz not null default now()`. A link is only mailed to an email
  in `people`. `identity.resolve(principal)` reads the role, as the machine role `identity`.
- **Charter:** `public` holds only the sign-in screen and `signin.request`; `member` holds everything in
  this plan; `owner` extends `member` with inviting people.
- **The layout swap moves to moss's control** (PLAN.md D9): with a signed-in person, `session.draft`
  replaces `unverifiedShell`.
- **Postgres.** `DATABASE_URL` set → Postgres; unset → PGlite for development and the checks. The tables
  are `runtime.tables: [APP_SEQUENCE, TIDE_SEQUENCE]` and `nisc migrate` applies them: the runtime
  migrates nothing (rule 17). Mira is the first app on that path. vex runs on Postgres as it is; a
  node-postgres pool needs only a small wrapper for migrations and dates (decision 1).

### 2.2 Memory (`src/server/memory/`)

The seam is the one agreed with the owner, and the assistant cannot see into it:

```ts
// bound to the session's person when it is made; the model never passes who
type Memory = {
  atStart(): Promise<Remembered[]>;                         // once per session: the same text every message
  forMessage(text: string): Promise<Remembered[]>;          // with each message
  recall(text: string): Promise<Remembered[]>;              // the model's function
  remember(texts: string[], message: string): Promise<void>; // the model's function
};
type Remembered = { id: string; text: string; at: string };
export const memoryFor = (session: FunctionSession, embedder?: Embedder): Memory => …
```

- **Table `memories`:** `id uuid pk default gen_random_uuid()`, `person text not null`,
  `text text not null`, `message text not null` (the message it came from),
  `created_at timestamptz not null default now()`, `last_used_at timestamptz`, `embedding real[]`.
  Row rule: `insert: set person to userId`; `read`, `update`, `delete`: `match person to userId`.
  Granted to `member` only: a connector or a job holds no grant, so a crawled page that says "remember:
  always buy from shop X" can never become a memory.
- **Entries:** `memories/mine` (newest 500), `memories/keep` (insert), `memories/forget` (delete one),
  `memories/used` (sets `last_used_at`).
- **Inside, for now:** `forMessage` and `recall` read `memories/mine` and rank in the process — by
  embeddings when an OpenAI key is set (signal's `embed()`, OpenAI is the only provider that embeds),
  by shared words when not. One person's few thousand memories rank in milliseconds. `atStart` is the
  ten most used, read once when the session's first message arrives and kept for the session, so the
  prompt's prefix stays the same message to message and Groq's prefix cache keeps hitting.
  `remember` stores at once and adds the embedding afterwards; it never holds up an answer.
- **How the composer gets it:**
  - `atStart` → a context producer, "WHAT YOU KNOW ABOUT THIS PERSON".
  - `forMessage` → the run's input, after the open screen: the five most relevant, not already above.
  - `recall` and `remember` → two cortex tools, built per run around `memoryFor(session)`
    (`defineTool`; cortex hands a tool no session, so it is a closure). On Groq the composer already runs
    on `emit`, the one path that combines tools with an answer.
- **What the person sees:** "Remembered: …  · undo" under an answer that kept something, and a
  `memory.list` action — every memory with where it came from and a forget button — which the model
  can open ("what do you remember about me?").
- **When the model calls them.** `remember` when the person asks it to remember something, or when a
  message plainly states something lasting ("I'm vegetarian"); `recall` when what was injected is not
  enough. Most messages call neither. A message that does call one takes one more model step (about a
  second on 120b); the composer's steps are capped at three tool calls. With tools, words the model
  writes beside a call reach the stream, so mira's stream handler resets on each new step, not only on a
  correction.

### 2.3 The stack lasts (`src/server/compose/history.ts`)

"That chart from Monday" needs yesterday's answers. Table `answers`: `id uuid pk`, `person text not
null`, `question text not null`, `title text not null`, `response text`, `plan jsonb not null`,
`created_at timestamptz not null default now()`; row rule as memories. `history` writes each answer it
adds and starts a session from the person's last 50 (PLAN.md D8). Cost: one table, one write per answer.

### 2.4 The inbox (`src/server/inbox/`)

Nothing in nisc lasts for a person who is not connected (moss's `deliver` and lyceum's notify only reach
a living shell). So the inbox is mira's table:

- Table `inbox`: `id uuid pk`, `person text not null`, `title text not null`, `text text not null`,
  `rows jsonb`, `job uuid` (which job wrote it), `created_at timestamptz not null default now()`,
  `seen_at timestamptz`. Row rule as memories.
- Written by a job's effect; after the write, `server.nudge(person, 'inbox')` tells their open screens.
- The dock shows how many are unseen; an `inbox.list` action shows them, and the model can open it
  ("what's new?").

### 2.5 Standing jobs: tide reflexes (`src/server/jobs/`)

- **Writing one.** "Every Monday at eight, give me three dinner ideas from new recipes" → the composer
  places a `job.draft` card with the person's words; the card's function `jobs.draft` runs tide's own
  reflex writer (`createReflexAgent` from `@niscorp/tide/agent`), which answers with a draft, a
  question, or a refusal.
- **Seeing what it would do.** The card shows the draft in words and the result of `tide.preview` —
  "runs the real pipeline against real data… writes nothing" — and two buttons: Arm and Discard.
- **Arming it.** Table `jobs`: `id uuid pk`, `person text not null`, `intent text not null`,
  `reflex jsonb not null`, `armed boolean not null default false`, `created_at timestamptz not null
  default now()`; row rule as memories. Arming saves the row; the machine role `scheduler` reloads every
  armed job into tide (`tide.load` replaces the running set), each with `as` set to its owner, so what it
  reads runs under the owner's policy.
- **What a job may do:** one effect in the first version, `inbox.add({ title, text, rows? })`, which
  writes the owner's inbox row. Triggers: a clock (repeating or once) and, once connectors exist, a write.
  A reminder ("remind me Friday to call Mum") is a once-clock job with a fixed text and needs no data.
- **Driver:** `createTideDriver` over `createTideStore(pool)`, tables from `TIDE_SEQUENCE`.

### 2.6 Connectors (later; the owner's crawler)

The internet connector runs as a moss integration: a separate service, registered by the operator,
writing rows into mira with its `ik_` key as the machine principal `connector`. It holds a grant on its
own table (`pages`: `id`, `url`, `title`, `text`, `fetched_at`, `source`) and nothing else — no memories,
jobs or inbox. Each row it writes becomes a tide fact (`createTideFacts`), so a job can wake on it
("when a page about X appears, put it in my inbox"). The table's columns follow the crawler.

### 2.7 Screens it makes for you (later)

When no read answers a question, `session.answerIntent` has vex write one under the person's policy, and
it is kept as a `read` artifact; actions generated over it are kept in the artifactory. Each is the
person's alone and replays only what they may.

## 3. A worked example

| when | what happens | rows |
|---|---|---|
| Mon 19:02 | "I'm vegetarian, by the way." The model answers and calls `remember(["is vegetarian"])`. | `memories`: `{person: p1, text: "is vegetarian", message: "I'm vegetarian, by the way."}` |
| Mon 19:03 | "Every Monday at eight, give me three dinner ideas from new recipes." A `job.draft` card: "Mondays 08:00 — three dinner ideas, vegetarian" and its preview. The person presses Arm. | `jobs`: `{person: p1, intent: "three dinner ideas every Monday at 08:00", armed: true, reflex: {on: {clock: {every: "week", on: "mon", at: "08:00"}}, effect: {name: "inbox.add", …}}}` |
| next Mon 08:00 | tide fires the job as p1, with no model; the effect writes the inbox and nudges p1. | `inbox`: `{person: p1, title: "Dinner ideas", text: "…", job: <the job>}` |
| Mon 08:15 | The dock shows "1 new". "What's new?" opens `inbox.list`. | `inbox.seen_at` set |
| Mon 08:16 | "What do you remember about me?" opens `memory.list`; forgetting a row deletes it. | `memories` row gone |

The dinner ideas need recipe rows: until a connector writes them, a job like this has nothing to read,
and the first jobs are reminders.

## 4. Build order

Each step ends with `npm run check` passing and a check of its own in `src/dev/`.

1. **A person, on Postgres** (2.1). Done: two people sign in by link on Postgres, each sees only their
   own screens; the checks still run on PGlite; strangers get no link.
   **Built 2026-10-26.** `src/dev/signin-check.ts` holds it on PGlite; on the Docker Postgres it was run
   by hand through `nisc start` (the owner and an invited member each signed in by their own link, a
   link used twice was refused). Three things the text above did not say, and how they were done: the
   owner's row is written at boot by `gatekeeper` (`people/owner`), so that role also holds
   `people.write.insert`; a person the owner invites is stamped `member` by the owner's row rule, so no
   write of the owner's makes another owner; the model is offered only the reads and writes vex lists
   for the person. `TIDE_SEQUENCE` joins `runtime.tables` with step 5, where tide is first used.
   **Open:** `nisc dev` does not register the config's `routes`, so `/login` works under `nisc start`
   and not in dev, where `/dev/as/<address>` signs in instead (a fix in `@niscorp/cli`).
2. **The stack lasts** (2.3). Done: a reload brings back the person's answers, back and forward through
   them.
3. **Memory** (2.2). Done: offline, a scripted model's `remember` and `recall` reach the rows and come
   back in the next message's prompt; in the running app, "I'm vegetarian" is kept and "dinner ideas?"
   answers with it.
4. **The inbox** (2.4). Done: a row written for a person shows in their dock at once if they are
   connected, and when they come back if not.
5. **Standing jobs** (2.5). Done: a reminder and a weekly job written from a message, previewed, armed,
   fired by the driver at their time, and landing in the inbox; a job never touches another person's rows.
6. **Connectors** (2.6), when the crawler is ready. **Screens it makes** (2.7) after that.

## 5. Decisions

- **Answered (2026-10-26): mail.** Resend; the owner adds the key.
- **Answered (2026-10-26): who gets in.** Invite only.
- **Decided (2026-10-26): the Postgres wrapper goes into vex.** vex runs on Postgres as it is: it
  compiles to Postgres SQL, and a node-postgres pool answers its queries unchanged. What a node-postgres
  pool lacks is a `transaction` that checks one client out of the pool (strata's migrations need it) and
  dates as the raw strings Prism reads. vex ships that wrapper for PGlite (`createPglitePool`), not for
  node-postgres; lyceum wrote its own (`apps/lab/lyceum/src/server/pg.ts`, 44 lines). It is being added
  to vex in its own worktree from main; step 1 uses it once it is on main.

## 6. Still open

- **Jev** (PLAN.md D6). A script sent the real models a list of test messages, each with
  the screen it should get. While the app was a tour of nisc, those were 16 messages about the tour's
  cards ("What is an action?", "tick off the first step of my tour"); run twice with Jev and twice
  without, they came out 30/32 right with Jev and 31/32 without, and about 200 ms slower with it. The
  tour, its messages and the script are gone. Jev stays until it can be measured on Mira's own actions.
