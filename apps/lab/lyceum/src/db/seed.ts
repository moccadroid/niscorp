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
  { slideId: 'slide.title', title: 'nisc', tools: ['assistant.thread'], notes: ['[Ask everyone to join] Scan the code, or type the address.', 'This talk is an app, and it is running right now, on one server.', 'The projector, my controller and your phones are all the same app.', 'On a laptop? Open the same address and keep devtools open. I will ask you to check things.', 'Got a terminal? The SSH command on the screen works too.', 'When you join, you choose a name: tap one, or type your own.', 'Everything you see is in one folder. You get the link at the end.'] },
  { slideId: 'stage.register', title: 'Everyone who has joined', tools: [], notes: ['Everyone who joined is a row. You are on this list.', 'You chose these names. One you typed yourself was checked before it went up here.', '[Wait until most people are in]'] },
  { slideId: 'slide.timer', title: 'First, a timer.', tools: ['assistant.thread'], notes: ['One thing before I start: a timer for this talk.', '[Share the controller screen]', '[Type: "Show the last slide in 30 minutes"]', 'What comes back is not a timer. It is a document: when it fires, and what it does.', '[Read it out, press Save, stop sharing]', 'I will come back to this at the end.'] },
  { slideId: 'slide.origin', title: 'GPT-3 could not write a React app.', tools: [], notes: ['This started in 2020, with GPT-3.', 'I wanted it to build UI. It could not write a working React app.', 'It could fill in a JSON schema. Most of the time.', 'And JSON can be checked, before anything runs.', 'So the question was: what if the UI is the JSON?'] },
  { slideId: 'slide.problem', title: 'Models write code faster than anyone can review it.', tools: [], notes: ['Today models write code just fine.', 'The problem: they write more of it than anyone can review.', 'One answer: make the output small enough for a person to read.', 'Lowdefy does that: config instead of code, so a human can review it.', 'That still needs a person to read every change.'] },
  { slideId: 'slide.answer', title: 'Make it something a program can check.', tools: [], notes: ['Our answer: do not make it readable. Make it checkable.', 'Every part of the app is a document with a schema.', 'A model writes the document. A program checks it. A runtime runs it.', 'Code only lives at the edges: drawing, data access, setup, tests.', 'It starts with the UI.'] },
  { slideId: 'slide.nova', title: 'Nova', tools: [], notes: ['This is Nova. It is the UI part.', 'A screen is made of actions.', 'An action is JSON: its data, where the data comes from, what a tap does, and a layout.', 'A model writes it, a schema checks it, Nova runs it.', 'Nova does not draw. A renderer does. That comes back in a minute.'] },
  { slideId: 'slide.data', title: 'An action', tools: [], notes: ['This is a question form. It is not on your phone yet: one comes later in this talk, from outside this app.', 'data: your draft, and whether it was sent.', 'layout: the form on the right — drawn on this slide from that same JSON.', 'Tap Send: the trigger on the button runs the steps in send.', 'Those steps call the endpoint named send. A write, by name. No fetch, no handler code.'] },
  { slideId: 'slide.xray', title: 'Your screen is data.', tools: ['tools.xray'], notes: ['[Give everyone the X-ray]', 'The X-ray is on your phone now. Switch it on.', 'That is your screen, as data: every action on it, and each one’s data.', 'Nothing on it is code. You can read all of it — so can a program, or a model.', 'Tap around, then look again. Take a minute.', '[Take it back]'] },
  { slideId: 'slide.clearance', title: 'Three of you just got a button.', tools: ['tools.button'], notes: ['[Give the button to three people]', 'Three of you just got a button. If it is you: raise your hand.', 'Turn your volume up and press it.', 'Everyone else: it is not hidden from you. It was never sent to you.', 'Laptops: search the websocket frames for it. It is not there.', 'Who gets which action is decided per person, on the server. No code changed.', '[Take it back]'] },
  { slideId: 'slide.looks', title: 'The server sends data. Your phone draws it.', tools: ['tools.look', 'tools.renderers'], notes: ['So far everything was drawn by one small DOM renderer.', '[Phones: React] Your phones are drawn by React now. Same trees, same stylesheet. The corner says React.', 'Laptops: inspect the root element. React has put its container on it.', '[Stage: Vue] The projector is Vue. Your phones are still React — the same trees, two frameworks, at the same time.', 'What changed on the server is one row: which renderer draws which screen.', '[All three back to DOM]', '[Terminal] The same trees, in a terminal. The command is on the screen — go on, connect.'] },
  { slideId: 'slide.compare', title: 'Isn’t this json-render?', tools: [], notes: ['If you have seen json-render from Vercel, or Google’s A2UI: yes, same direction.', 'They are good. A model writes JSON, a renderer draws it.', 'Two differences matter, and they are why Nova could do what you just saw.'] },
  { slideId: 'slide.behaviour', title: 'What a button does', tools: [], notes: ['In json-render, a button calls a function in your app. Code, written by hand.', 'In Nova, what a button does is data too: set this value, call that endpoint.', 'So a model can write the behaviour, and a schema checks it before it runs.'] },
  { slideId: 'slide.state', title: 'Where the state lives', tools: [], notes: ['In json-render, state lives in your app’s store: Redux, Zustand.', 'In Nova, each action keeps its own state.', 'So an action does not care where it runs: a browser, a server, a terminal.', 'That is why the shell can run on the server, one per person — and why the X-ray, the button and the looks just worked.'] },
  { slideId: 'slide.census', title: 'Is JSON enough for a real app?', tools: [], notes: ['The usual objection: JSON is fine for a demo, not for a real app.', 'This app is the slides, the projector, my controller, your phones, SSH, an assistant, timers.', 'Half of it is data.', 'The code is in three places: the renderers, the endpoints, the setup. Each is a third the size of the data.', 'Counted from the source this server runs, right now. Comments do not count.'] },

  // ── the worst a model can write ──
  { slideId: 'slide.worst', title: 'What is the worst a model can write?', tools: [], notes: ['so far: a model writes documents', 'claim: passes the schema → can’t leak, crash, run forever', 'worst case: wrong', 'we tested it'] },
  { slideId: 'slide.broke', title: 'We tried to break it.', tools: [], notes: ['attacked with valid documents only', 'leak: held — other URLs, forbidden tables, other ids refused', 'crash: 2 holes — layout 20,000 deep · doubling loop, out of memory', 'run forever: broke'] },
  { slideId: 'slide.loop', title: 'Three lines froze the server.', tools: [], notes: ['listens for x, sends x', 'froze the server for everyone', 'now: loops found by reading the actions, before they run', 'boot: warning · integration install: refused', 'only possible because the grammar is closed', 'limits: 64 hops · 1,024 per chain · 256 levels · timeouts'] },
  { slideId: 'slide.review', title: 'Review the result, not the code.', tools: [], notes: ['models write these without anyone reading them first', 'checked document: can be wrong — can’t leak, crash, run forever', 'wrong → tests catch it', 'generated code → somebody has to read it'] },
  { slideId: 'slide.install', title: 'Installing someone else’s screen.', tools: ['tools.integrations'], notes: ['Acme: questions for the speaker — not part of this app', 'bundle = a file on GitHub, data only', '[Install the broken one] → refused: the loop, found by reading', '[Install Acme] → passes → pending', '[Approve] → on your phones + my controller', 'nobody here read Acme’s code'] },

  // ── the rest of nisc, and the end ──
  { slideId: 'slide.moss', title: 'Your screen runs on the server.', tools: [], notes: ['Moss: one server runs all of this', 'shell = your actions + their data, one per person', 'phone gets: what to draw', 'phone sends: what you pressed', 'not given → never leaves the server', 'laptops: look at the websocket frames'] },
  { slideId: 'slide.charter', title: 'Who gets what is one document.', tools: [], notes: ['charter: who gets what, one document', 'role = action patterns + data patterns', 'member = all of you', 'clock = the timer’s role → moves the slide, nothing else', 'a model’s timer can’t reach further', 'giving an action = a row, no deploy'] },
  { slideId: 'slide.twice', title: 'Enforced in two places.', tools: [], notes: ['charter enforces nothing → compiles to 2 checks', '1 · shell: not granted = never sent', '2 · engine: which tables, which rows', 'your question: stamped from your session → you read your own', 'no field for someone else’s id', 'usually: route guards + component checks + RLS → here 1 document'] },
  { slideId: 'slide.vex', title: 'A query is a document too.', tools: [], notes: ['Vex: this one = the joined count, top of the screen', 'intent + shape + query', 'screen sends the name only — no SQL', 'reactive: answers again when someone joins', 'your policy: applied in the engine, every run', 'reshaping = Prism, stored with it'] },
  { slideId: 'slide.words', title: 'Asked in words.', tools: ['assistant.thread'], notes: ['[ask your assistant: how many people joined?]', 'small model picks: asked before? which shape?', 'asked before → replayed, no model', 'new → bigger model writes it, under your policy, stored', 'past your policy → refused, with why', 'the model compiles once, doesn’t interpret every time'] },
  { slideId: 'slide.water', title: '18,000 cups of water.', tools: [], notes: ['2025: Taco Bell AI drive-through took 18,000 waters', '2024: McDonald’s + IBM, 260 McNuggets → test ended', 'not the model’s fault: it was allowed to act'] },
  { slideId: 'slide.press', title: 'It cannot press Send.', tools: ['tools.order'], notes: ['assistant reads your screen — data, like the X-ray', 'opens an action, filled in', 'cannot press', '[give everyone the order form]', 'ask it for 18,000 cups of water → form opens, filled in', 'you don’t press Send'] },
  { slideId: 'slide.tide', title: 'The timer from the start is a row.', tools: [], notes: ['back to the timer', 'the row as stored: when · what · runs as', 'runs as clock — saving stamped it, not the model', 'no model running now', 'in the database → survives a restart'] },
  { slideId: 'slide.once', title: 'Automations without an agent loop', tools: [], notes: ['other way: an agent with a skill (OpenClaw)', 'reads its instructions every run, a model decides', 'tokens every run, different every run', 'here: a model wrote it once, I read it, saved it', 'runs with no model, same every time'] },
  { slideId: 'slide.strata', title: 'A grammar change is a migration.', tools: [], notes: ['everything is a document → what happens when nisc changes?', 'tables have migrations → grammars too', 'grammar change without a migration → check refuses', 'stored documents carry their version → upgraded when read', 'newer than the reader → refused', 'this file: versions this source is written in'] },
  { slideId: 'slide.end', title: 'It is all in one folder.', tools: [], notes: ['[if the timer put this up] that was the timer — ran as clock, no model', 'UI, queries, policy, automations: documents a program checks', 'all of it: one folder, this app', 'open source — scan the code — not on npm yet', 'questions: Acme, on your phone'] },
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
