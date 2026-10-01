import { TALK_DECK } from '@lyceum/app/vex/deck.entries';

// What exists before anybody walks in: the principals that are not people,
// and the deck. Everything else is written by the audience.
//
// Run on every boot, against an empty database or a live one, and it treats
// the two kinds of row differently:
//
//   · AUTHORED rows — the slides, their order, their tools and notes —
//     CONVERGE: whatever this file says is what the database has, the way vex's
//     seed path converges its entries. Editing the deck here and restarting is
//     enough; there is no migration to write.
//   · THE TALK'S STATE — the renderers, the grants, which slide is on screen — is
//     left alone. A restart must not reset the talk.

// The principals that are not people, and the role each wears. Their sessions
// are minted by whoever runs the talk (dev: /dev/as/<principal>).
export const STAFF: readonly { principal: string; role: string }[] = [
  { principal: 'speaker', role: 'speaker' },
  { principal: 'stage', role: 'stage' },
  // The kit's kitchen sink — every piece of the look on one screen.
  { principal: 'kit', role: 'kit' },
  // The moderator, which judges names and questions (server/moderation.ts).
  { principal: 'moderator', role: 'moderator' },
  // The talk's clock, which saved timers run as (server/timing.ts).
  { principal: 'clock', role: 'clock' },
];

// The deck, in order. Each slide id is an action the stage is granted, each
// tool id one the speaker is granted — `deck-check` asserts both. The tools are
// what the controller shows while that slide is up, stacked in this order. The words are
// provisional: the talk's text is written with the story.
export const SLIDES: readonly { slideId: string; title: string; tools: readonly string[]; notes: readonly string[] }[] = [
  // ── the opening: where it started, the problem, our answer, and Nova ──
  { slideId: 'slide.title', title: 'nisc', tools: [], notes: ['[join: scan the code or type the address]', 'this talk is an app, running now, on one server', 'projector + my controller + your phones = one app', 'laptops: open the address, devtools open', 'terminal: the SSH command works too', 'join: pick a name or type one'] },
  { slideId: 'stage.register', title: 'Everyone who has joined', tools: [], notes: ['each name = a row in the database', 'names you typed: a model checked them first', '[wait until most people are in]'] },
  { slideId: 'slide.timer', title: 'First, a timer.', tools: ['assistant.thread'], notes: ['[share the controller screen]', '[type: "Show the last slide in 30 minutes"]', 'the answer is a document: when it fires, what it does', '[read it out, press Save, stop sharing]', 'back to this at the end'] },
  { slideId: 'slide.origin', title: 'GPT-3 could not write a React app.', tools: [], notes: ['2020, GPT-3', 'wanted it to build UI → no working React app', 'it could fill in a JSON schema, mostly', 'JSON can be checked before it runs', '→ what if the UI is JSON?'] },
  { slideId: 'slide.problem', title: 'Models write code faster than anyone can review it.', tools: [], notes: ['models write more code than anyone can review', 'every change still needs a person'] },
  { slideId: 'slide.answer', title: 'A program checks it. Not a person.', tools: [], notes: ['every part of the app = a JSON document + a schema', 'model writes it → program checks it → runtime runs it', 'code only in: renderers, endpoints, setup, tests', 'starts with the UI'] },
  { slideId: 'slide.nova', title: 'Nova', tools: [], notes: ['Nova = the UI part', 'a screen = a set of actions', 'action = JSON: its data, where data comes from, what a tap does, its layout', 'model writes it, schema checks it, Nova runs it', 'Nova doesn’t draw — a renderer does (slide 11)'] },
  { slideId: 'slide.data', title: 'An action', tools: [], notes: ['data: the draft, and whether it was sent', 'right: drawn here from the same JSON', 'tap Send → trigger on "send_btn" → steps → endpoint "post_question"', 'no fetch, no handler code', 'not on your phone — Acme’s comes later'] },
  { slideId: 'slide.xray', title: 'Your screen, as JSON.', tools: ['tools.xray'], notes: ['[give everyone the X-ray]', 'switch it on', 'every action outlined, with its id', 'tap an id → that action’s JSON', 'no code in it: a person, a program or a model can read it', '[take it back]'] },
  { slideId: 'slide.clearance', title: 'Three of you just got a button.', tools: ['tools.button'], notes: ['[give 3 people the button]', 'hands up if you have it', 'volume up, press it', 'everyone else: it was never sent to you', 'laptops: it’s not in your websocket frames', '[take it back]'] },
  { slideId: 'slide.looks', title: 'One screen, any renderer.', tools: ['tools.look'], notes: ['so far: one small DOM renderer', '[phones → React] same JSON, same CSS; its column lights up', 'laptops: inspect the root element', '[projector → Vue] two frameworks at once', 'on the server: one row changed', '[all back to DOM]'] },
  { slideId: 'slide.terminal', title: 'The same app, in a terminal.', tools: ['tools.renderers'], notes: ['same app, same JSON, drawn as text', 'type the command — you join like on your phone', 'its own kit draws the same JSON as text'] },
  { slideId: 'slide.compare', title: 'Isn’t this json-render?', tools: [], notes: ['json-render (Vercel), A2UI (Google): same direction', 'model writes JSON, a renderer draws it', '2 differences → why the demos just worked'] },
  { slideId: 'slide.parts', title: 'json-render ≈ Nova. Nova is one part of nisc.', tools: [], notes: ['json-render: the screen as JSON — about what Nova does', 'more renderers than us; shadcn kit as an option', 'past the screen: Next.js and your code', 'nisc: the rest is JSON too — a part each', 'A2UI: a protocol for an agent to send UI — a different job', 'next: how much of this app that is'] },
  { slideId: 'slide.census', title: 'Is JSON enough for a real app?', tools: [], notes: ['objection: JSON is fine for demos, not real apps', 'this app: slides, projector, controller, phones, SSH, assistant, timers', 'about half of it is JSON data', 'the code: renderers, endpoints, setup', 'counted live from the source, comments excluded'] },

  // ── the worst a model can write ──
  { slideId: 'slide.worst', title: 'What is the worst a model can write?', tools: [], notes: ['so far: a model writes documents', 'claim: passes the schema → can’t leak data, crash the server, run forever', 'worst case: it’s wrong', 'we tested it'] },
  { slideId: 'slide.broke', title: 'We tried to break it.', tools: [], notes: ['attacked with valid documents only', 'leak: nothing leaked — other URLs, forbidden tables, other ids refused', 'crash: 2 bugs — layout 20,000 deep · doubling loop, out of memory', 'run forever: froze the server'] },
  { slideId: 'slide.loop', title: 'This froze the server.', tools: [], notes: ['it listens for x, sends x → forever', 'froze the server for everyone', 'now a program reads every action and finds these before they run', 'at boot: warning · at install: refused', 'possible because the grammar is closed', 'limits: 64 hops · 1,024 steps per chain · 256 levels · timeouts'] },
  { slideId: 'slide.review', title: 'Review the result, not the code.', tools: [], notes: ['models write these, nobody reads them first', 'passes the schema: can be wrong — can’t leak, crash, run forever', 'wrong → tests catch it', 'Lowdefy: same problem — config small enough for a person to read', 'ours: a program checks it, nobody has to read it'] },
  { slideId: 'slide.install', title: 'Installing Acme’s Q&A', tools: ['tools.integrations'], notes: ['Acme: questions for the speaker — not part of this app', 'a JSON file on GitHub, no code', '[Install the broken one] → refused: it has a loop', '[Install Acme] → passes → waits for me', '[Approve] → on your phones + my controller', 'nobody here read Acme’s file'] },

  // ── the rest of nisc, and the end ──
  { slideId: 'slide.moss', title: 'Your screen runs on the server.', tools: [], notes: ['Moss: the server running all of this', 'per person: your actions + their data = your "shell"', 'phone gets: what to draw', 'phone sends: what you pressed', 'not given to you → never sent', 'laptops: look at the websocket frames'] },
  { slideId: 'slide.charter', title: 'Who gets what: one file.', tools: [], notes: ['charter: roles → which actions, which data', 'member = all of you', 'clock = the role the timer runs as', 'clock can move the slide, nothing else', 'whatever a model writes into a timer: that’s all it can do', 'giving someone an action = a database row, no deploy'] },
  { slideId: 'slide.twice', title: 'Enforced twice.', tools: [], notes: ['the charter itself enforces nothing → compiled into 2 checks', '1 · server: actions you’re not given are never sent', '2 · every query: which tables, which rows', 'your question: stamped from your session → you read only yours', 'no field for someone else’s id', 'usually: route guards + component checks + RLS → here 1 file'] },
  { slideId: 'slide.vex', title: 'Queries are JSON too.', tools: [], notes: ['Vex: this is the joined count at the top of the screen', 'stored: what it’s for, the shape of the answer, the query', 'the screen sends only its name — no SQL', 'reactive: someone joins → it answers again, everywhere', 'your permissions: applied inside the engine, every run', 'reshaping the rows = Prism, stored with it'] },
  { slideId: 'slide.words', title: 'Asked in words.', tools: ['assistant.thread'], notes: ['[ask your assistant: how many people joined?]', 'small model picks: asked before? which shape?', 'asked before → the stored query runs, no model', 'new → a bigger model writes it, under your permissions, stored', 'not allowed → refused, with why', 'a model writes each query once; after that, no model'] },
  { slideId: 'slide.water', title: '18,000 cups of water.', tools: [], notes: ['2025: someone ordered 18,000 waters from Taco Bell’s drive-through AI', 'it stalled, staff stepped in; Taco Bell slowed the rollout', '2024: McDonald’s ended its IBM AI test — 260 McNuggets on one order', 'the AI acted on the order, no check in between'] },
  { slideId: 'slide.press', title: 'It can’t press Send.', tools: ['tools.order'], notes: ['assistant reads your screen — JSON, like the X-ray', 'it opens a form, filled in', 'it can’t press anything', '[give everyone the order form]', 'ask it for 18,000 cups of water → form opens, filled in', 'you don’t press Send'] },
  { slideId: 'slide.tide', title: 'The timer is a row.', tools: [], notes: ['back to the timer from slide 3', 'the row as stored: when, what it does, who it runs as', 'runs as clock — Save stamped that, not the model', 'no model running now', 'in the database → survives a restart'] },
  { slideId: 'slide.once', title: 'No agent loop.', tools: [], notes: ['other way: an agent with a skill (OpenClaw)', 'every run: a model reads the instructions, decides', 'tokens every run, different every run', 'here: a model wrote it once, I read it, saved it', 'runs with no model, same every time'] },
  { slideId: 'slide.strata', title: 'Grammars get migrations.', tools: [], notes: ['everything is a document → what happens when nisc changes?', 'tables have migrations → grammars too', 'grammar change without a migration → the check refuses it', 'stored documents carry their version → upgraded when read', 'newer than the reader → refused', 'this file: which versions this app is written in'] },
  { slideId: 'slide.end', title: 'It’s all in one folder.', tools: [], notes: ['[if the timer put this up] that was the timer — ran as clock, no model', 'the whole app: one folder', 'open source — scan the code — not on npm yet', 'questions: in Acme, on your phone'] },
];

// The deck the entries read (app/vex/deck.entries.ts).
export const DECK_ID = TALK_DECK;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const slideIds = SLIDES.map((slide) => quote(slide.slideId)).join(', ');

export const buildSeedSql = (): string =>
  [
    // The ID cards' registry is gone (the moderator took its place): its grant
    // goes from databases seeded before.
    `DELETE FROM grants WHERE principal = 'registry';`,
    ...STAFF.map((staff) => `INSERT INTO grants (principal, role) VALUES (${quote(staff.principal)}, ${quote(staff.role)}) ON CONFLICT DO NOTHING;`),

    // Slides: the deck converges to SLIDES. Positions are unique, so a reorder
    // would collide with itself mid-way; every existing position is first moved
    // out of the way (negative), then each authored slide is written to its own.
    `UPDATE slides SET position = -1 - position WHERE position >= 0;`,
    ...SLIDES.map(
      (slide, position) =>
        `INSERT INTO slides (slide_id, position, title) VALUES (${quote(slide.slideId)}, ${position}, ${quote(slide.title)})
         ON CONFLICT (slide_id) DO UPDATE SET position = EXCLUDED.position, title = EXCLUDED.title;`,
    ),
    // The deck row is the talk's state: seeded once, never reset by a restart —
    // unless the slide it names was taken out of the deck, when it goes back to
    // the first one rather than point at nothing.
    `INSERT INTO deck (deck_id, slide_id) VALUES (${quote(DECK_ID)}, ${quote(SLIDES[0]?.slideId ?? '')}) ON CONFLICT DO NOTHING;`,
    `UPDATE deck SET slide_id = ${quote(SLIDES[0]?.slideId ?? '')} WHERE slide_id NOT IN (${slideIds});`,
    `DELETE FROM slides WHERE slide_id NOT IN (${slideIds});`,
    // The tools and the notes converge to SLIDES too: replaced whole, every boot.
    `DELETE FROM slide_tools;`,
    ...SLIDES.flatMap((slide) =>
      slide.tools.map((tool, position) => `INSERT INTO slide_tools (slide_id, position, tool_id) VALUES (${quote(slide.slideId)}, ${position}, ${quote(tool)});`),
    ),
    `DELETE FROM slide_notes;`,
    ...SLIDES.flatMap((slide) =>
      slide.notes.map((note, position) => `INSERT INTO slide_notes (slide_id, position, note) VALUES (${quote(slide.slideId)}, ${position}, ${quote(note)});`),
    ),
  ].join('\n');
