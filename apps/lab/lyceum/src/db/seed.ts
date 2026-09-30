import { TALK_DECK } from '@lyceum/app/vex/deck.entries';

// What exists before anybody walks in: the departments, the principals that
// are not people, and the deck. Everything else is written by the room.
//
// Run on every boot, against an empty database or a live one, and it treats
// the two kinds of row differently:
//
//   · AUTHORED rows — the departments' words, the slides and their order —
//     CONVERGE: whatever this file says is what the database has, the way vex's
//     seed path converges its entries. Editing the deck here and restarting is
//     enough; there is no migration to write.
//   · THE TALK'S STATE — the room, the grants, which slide is on screen — is
//     left alone. A restart must not reset the talk.
//
// Each department_id is also a charter role — assigning a person to a
// department IS giving them that role — and `assignment-check` asserts the two
// lists agree.
import { TALK_ROOM } from '@lyceum/app/vex/room.entries';

type Department = { departmentId: string; name: string; remit: string; mark: string; sigil: string };

// Four departments, four clearances — so four neighbours' phones show four
// different things.
export const DEPARTMENTS: readonly Department[] = [
  { departmentId: 'records', name: 'Records', remit: 'You can read the register: everybody in the room.', mark: 'stripes', sigil: 'triangle' },
  { departmentId: 'forms', name: 'Forms', remit: 'You can change your own record, and everybody sees it change.', mark: 'dots', sigil: 'circle' },
  { departmentId: 'inquiries', name: 'Inquiries', remit: 'You can put questions to the records and get answers back.', mark: 'bars', sigil: 'cross' },
  { departmentId: 'archive', name: 'Archive', remit: 'You can see the history: who arrived when, and where they went.', mark: 'checks', sigil: 'square' },
];

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
];

// The deck the entries read (app/vex/deck.entries.ts).
export const DECK_ID = TALK_DECK;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const slideIds = SLIDES.map((slide) => quote(slide.slideId)).join(', ');

export const buildSeedSql = (): string =>
  [
    // Departments: their words converge. None is ever deleted here — a
    // department has members, and a department_id is a charter role.
    ...DEPARTMENTS.map(
      (department, position) =>
        `INSERT INTO departments (department_id, name, remit, mark, sigil, position) VALUES (${quote(department.departmentId)}, ${quote(department.name)}, ${quote(department.remit)}, ${quote(department.mark)}, ${quote(department.sigil)}, ${position})
         ON CONFLICT (department_id) DO UPDATE SET name = EXCLUDED.name, remit = EXCLUDED.remit, mark = EXCLUDED.mark, sigil = EXCLUDED.sigil, position = EXCLUDED.position;`,
    ),
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
