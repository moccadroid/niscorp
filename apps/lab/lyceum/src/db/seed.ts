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
//   · THE TALK'S STATE — the room, the grants, which slide is on screen — is
//     left alone. A restart must not reset the talk.
import { TALK_ROOM } from '@lyceum/app/vex/room.entries';

// The principals that are not people, and the role each wears. Their sessions
// are minted by whoever runs the talk (dev: /dev/as/<principal>).
export const STAFF: readonly { principal: string; role: string }[] = [
  { principal: 'speaker', role: 'speaker' },
  { principal: 'stage', role: 'stage' },
  // The kit's kitchen sink — every piece of the look on one screen.
  { principal: 'kit', role: 'kit' },
  // The Ministry's registry, which issues ID cards (server/card-issuing.ts).
  { principal: 'registry', role: 'registry' },
  // The talk's clock, which saved timers run as (server/timing.ts).
  { principal: 'clock', role: 'clock' },
];

// The deck, in order. Each slide id is an action the stage is granted, each
// tool id one the speaker is granted — `deck-check` asserts both. The tools are
// what the controller shows while that slide is up, stacked in this order. The words are
// provisional: the talk's text is written with the story.
export const SLIDES: readonly { slideId: string; title: string; tools: readonly string[]; notes: readonly string[] }[] = [
  // ── the opening: where it started, the problem, our answer, and Nova ──
  { slideId: 'slide.title', title: 'nisc', tools: ['assistant.thread'], notes: ['[Ask everyone to join] Scan the code, or type the address.', 'This talk is an app, and it is running right now, on one server.', 'The projector, my controller and your phones are all the same app.', 'On a laptop? Open the same address and keep devtools open. I will ask you to check things.', 'Got a terminal? The SSH command on the screen works too.', 'When you join, a model writes you a profile. Watch it appear.', 'Everything you see tonight is in one folder. You get the link at the end.'] },
  { slideId: 'stage.register', title: 'Everyone who has joined', tools: [], notes: ['Everyone who joined is a row. You are on this list.', 'The title and the line about you were written by a model as you joined.', 'It streams in, and what you see is valid at every step — never half a JSON object.', '[Wait until most people are in]'] },
  { slideId: 'slide.timer', title: 'First, a timer.', tools: ['assistant.thread'], notes: ['One thing before I start: a timer for this talk.', '[Share the controller screen]', '[Type: "Show the last slide in 30 minutes"]', 'What comes back is not a timer. It is a document: when it fires, and what it does.', '[Read it out, press Save, stop sharing]', 'I will come back to this at the end.'] },
  { slideId: 'slide.origin', title: 'GPT-3 could not write a React app.', tools: [], notes: ['This started in 2020, with GPT-3.', 'I wanted it to build UI. It could not write a working React app.', 'It could fill in a JSON schema. Most of the time.', 'And JSON can be checked, before anything runs.', 'So the question was: what if the UI is the JSON?'] },
  { slideId: 'slide.problem', title: 'Models write code faster than anyone can review it.', tools: [], notes: ['Today models write code just fine.', 'The problem: they write more of it than anyone can review.', 'One answer: make the output small enough for a person to read.', 'Lowdefy does that: config instead of code, so a human can review it.', 'That still needs a person to read every change.'] },
  { slideId: 'slide.answer', title: 'Make it something a program can check.', tools: [], notes: ['Our answer: do not make it readable. Make it checkable.', 'Every part of the app is a document with a schema.', 'A model writes the document. A program checks it. A runtime runs it.', 'Code only lives at the edges: drawing, data access, setup, tests.', 'It starts with the UI.'] },
  { slideId: 'slide.nova', title: 'Nova', tools: [], notes: ['This is Nova. It is the UI part.', 'A screen is made of actions.', 'An action is JSON: its data, where the data comes from, what a tap does, and a layout.', 'A model writes it, a schema checks it, Nova runs it.', 'Nova does not draw. A renderer does. That comes back in a minute.'] },
  { slideId: 'slide.data', title: 'An action', tools: [], notes: ['This is the question form on your phone, under Q&A.', 'data: your draft, and whether it was sent.', 'layout: the form on the right — drawn on this slide from that same JSON.', 'Tap Send: the trigger on the button runs the steps in send.', 'Those steps call the endpoint named send. A write, by name. No fetch, no handler code.'] },
  { slideId: 'slide.xray', title: 'Your screen is data.', tools: ['tools.xray'], notes: ['[Give everyone the X-ray]', 'You have a big blue button. Press it.', 'That is your screen, as data: every action on it, and each one’s data.', 'Nothing on it is code. You can read all of it — so can a program, or a model.', 'Tap around, then look again. Take a minute.', '[Take it back]'] },
  { slideId: 'slide.clearance', title: 'Three of you just got a button.', tools: ['tools.button'], notes: ['[Give the button to three people]', 'Three of you just got a button. If it is you: raise your hand.', 'Turn your volume up and press it.', 'Everyone else: it is not hidden from you. It was never sent to you.', 'Laptops: search the websocket frames for it. It is not there.', 'Who gets which action is decided per person, on the server. No code changed.', '[Take it back]'] },
  { slideId: 'slide.looks', title: 'The server sends data. Your phone draws it.', tools: ['tools.look', 'tools.renderers'], notes: ['[Switch the look to plain HTML]', 'Your phones just lost their stylesheet. Same data, drawn by different components.', 'Nothing was sent to you except one value. Laptops: check.', '[Switch back]', '[Terminal] The same data, in a terminal. The command is on the screen — go on, connect.'] },
  { slideId: 'slide.compare', title: 'Isn’t this json-render?', tools: [], notes: ['If you have seen json-render from Vercel, or Google’s A2UI: yes, same direction.', 'They are good. A model writes JSON, a renderer draws it.', 'Two differences matter, and they are why Nova could do what you just saw.'] },
  { slideId: 'slide.behaviour', title: 'What a button does', tools: [], notes: ['In json-render, a button calls a function in your app. Code, written by hand.', 'In Nova, what a button does is data too: set this value, call that endpoint.', 'So a model can write the behaviour, and a schema checks it before it runs.'] },
  { slideId: 'slide.state', title: 'Where the state lives', tools: [], notes: ['In json-render, state lives in your app’s store: Redux, Zustand.', 'In Nova, each action keeps its own state.', 'So an action does not care where it runs: a browser, a server, a terminal.', 'That is why the shell can run on the server, one per person — and why the X-ray, the button and the looks just worked.'] },
  { slideId: 'slide.census', title: 'Is JSON enough for a real app?', tools: [], notes: ['The usual objection: JSON is fine for a demo, not for a real app.', 'This app is the slides, the projector, my controller, your phones, SSH, an assistant, timers.', 'Half of it is data.', 'The code is in three places: the renderers, the endpoints, the setup. Each is a third the size of the data.', 'Counted from the source this server runs, right now. Comments do not count.'] },

  // ── the worst a model can write ──
  { slideId: 'slide.worst', title: 'What is the worst a model can write?', tools: [], notes: ['Everything so far was a model writing documents. So: what is the worst one can write?', 'Our claim: a document that passes the schema cannot leak, cannot crash the app, cannot explode. The worst it can be is wrong.', 'We did not want to put that on a slide untested.'] },
  { slideId: 'slide.broke', title: 'We tried to break it.', tools: [], notes: ['We attacked it with valid data only: documents that pass every schema.', 'Leaking held. URLs that point elsewhere, tables it may not read, someone else’s id: all refused.', 'Crashing: two holes. A layout nested 20,000 deep broke the parser. A loop that doubled every turn ran out of memory.', 'Exploding broke badly.'] },
  { slideId: 'slide.loop', title: 'Three lines froze the server.', tools: [], notes: ['This action listens for x and sends x. That is all.', 'It froze the whole server — for everyone, not just the phone that ran it.', 'Now a program finds every loop like this by reading the actions, before anything runs: a warning at boot, refused when an integration is installed.', 'That works because the grammar is closed. You cannot read code for loops this way.', 'Where reading cannot see, there are limits: 64 hops deep, 1,024 per chain, 256 levels per document, a timeout on every endpoint and every query.', 'Tide already worked like this. Everything else does now too.'] },
  { slideId: 'slide.review', title: 'Review the result, not the code.', tools: [], notes: ['So a model can write these documents without anyone reading them first.', 'The worst a checked document can be is wrong. Wrong is what testing is for.', 'Try that with generated code.'] },

  // ── the rest of nisc, and the end ──
  { slideId: 'slide.moss', title: 'Your shell runs on the server.', tools: [], notes: ['Everything tonight runs on one server. That is Moss.', 'Each of you has a shell there: your actions, and their data.', 'Your phone gets what to draw. It sends back what you pressed. Nothing else.', 'That is why only three phones got the button: what you were not given never left the server.', 'Laptops: look at the websocket frames. It is the tree to draw, nothing more.'] },
  { slideId: 'slide.charter', title: 'Who gets what is one document.', tools: [], notes: ['Who gets what is one document: the charter.', 'A role lists the actions it may have and the data it may touch, as patterns.', 'member is all of you.', 'clock is the role the timer runs as. It can move the slide. Nothing else.', 'Whatever a model writes into a timer, that is all it can ever reach.', 'Giving someone an action is a row. No deploy.'] },
  { slideId: 'slide.twice', title: 'Checked in two places.', tools: [], notes: ['The charter itself enforces nothing. It compiles into two checks.', 'One: your shell. An action you are not granted does not exist there. Not hidden, not disabled. Never sent.', 'Two: every query, inside the engine. Which tables, and which rows.', 'A question is stamped with who sent it, from your session. You read only your own.', 'A request has no field for someone else’s id. There is nothing to forge.', 'Usually that is route guards, component checks and row-level security: three places, three rule sets. Here it is one document.'] },
  { slideId: 'slide.vex', title: 'A query is a document too.', tools: [], notes: ['A query is a document too. This one is the joined count at the top of the screen.', 'It says what it is for, the shape of the answer, and the query.', 'The screen sends only its name. Not the query, not SQL.', 'reactive: when someone joins, it answers again, on every screen showing it. Nobody announces it.', 'Your policy is applied inside the engine, on every run. Whoever wrote the query never sees it.', 'Where rows need reshaping, that is Prism: a function written as data, stored with the query.'] },
  { slideId: 'slide.words', title: 'Asked in words.', tools: ['assistant.thread'], notes: ['Your assistant can query in words. Try it: ask it how many people joined.', 'A small model only picks: was this asked before, and what shape is the answer?', 'Asked before: the stored query runs again. No model writes anything.', 'New: a bigger model writes a query under your policy. Checked, run, and stored.', 'If it reaches past your policy, it is refused, and you are told why.', 'The model is a compiler that runs once, not an interpreter that runs every time.'] },
  { slideId: 'slide.water', title: '18,000 cups of water.', tools: [], notes: ['In 2025, someone ordered 18,000 cups of water at a Taco Bell drive-through run by an AI. It took the order.', 'In 2024, McDonald’s ended its AI drive-through test with IBM, after a video of it adding 260 McNuggets to one order.', 'The model was not the problem. It was allowed to act on its own.'] },
  { slideId: 'slide.press', title: 'It prepares. You press.', tools: ['tools.order'], notes: ['Your assistant reads your screen. It is data, like the X-ray showed you.', 'It can open an action on your screen, filled in.', 'It cannot press anything. Send is yours.', '[Give everyone the order form]', 'Ask your assistant for 18,000 cups of water.', 'It opens the order, filled in. You see 18,000. You do not press Send.', 'A second, small model could check what it prepared before you see it. The same idea: a document, checked.'] },
  { slideId: 'slide.tide', title: 'The timer from the start is a row.', tools: [], notes: ['Back to the timer from the start.', 'This is it, as it is stored: when it fires, what it does, and who it runs as.', 'It runs as clock. The model did not pick that: saving stamped it.', 'No model is running now. Nothing reads this every minute.', 'It is in the database. A restart does not lose it.'] },
  { slideId: 'slide.once', title: 'Automations without an agent loop', tools: [], notes: ['The other way to do this is an agent with a skill: OpenClaw, for example.', 'It reads its instructions every time it runs, and a model decides what to do. Every run costs tokens, and every run can go differently.', 'Here a model wrote the automation once. I read it and saved it. From then on it runs with no model.', 'It does the same thing every time, and you can read what it will do before it does it.'] },
  { slideId: 'slide.strata', title: 'A grammar change is a migration.', tools: [], notes: ['Everything is a document. So what happens to all of them when nisc changes?', 'Tables have migrations. Here, grammars do too.', 'Change what an action or a layout may say, and you add a migration. Without one, the check refuses the change.', 'Every stored document carries the version it was written at. It is upgraded when it is read.', 'A document newer than its reader is refused, never guessed at.', 'This file says which versions this app is written in. It only moves after a check has upgraded the source.'] },
  { slideId: 'slide.end', title: 'It is all in one folder.', tools: [], notes: ['[If the timer put this slide up] That was the timer from the start. It ran as clock, with no model.', 'The UI, the queries, the policy, the automations: each one a document a program can check.', 'Everything you saw tonight is in one folder: this app.', 'Questions: send them on your phone, under Q&A.'] },
];

// The deck the entries read (app/vex/deck.entries.ts).
export const DECK_ID = TALK_DECK;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const slideIds = SLIDES.map((slide) => quote(slide.slideId)).join(', ');

export const buildSeedSql = (): string =>
  [
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
    // The room row: seeded once; its look is the talk's state, like the deck's.
    `INSERT INTO room (room_id) VALUES (${quote(TALK_ROOM)}) ON CONFLICT DO NOTHING;`,
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
