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
  // ── 0 · the cold open: nothing explained yet ──
  { slideId: 'slide.title', title: 'The talk is an application', tools: ['assistant.thread'], notes: ['Say hello; say it is running, not a recording', 'Ask everyone to take their phone out and scan the code', 'Explain nothing yet'] },
  { slideId: 'stage.register', title: 'The register', tools: [], notes: ['The names arriving are rows', 'Each ID card is being written by a model as they watch: qwen on Groq, streamed; solid keeps every partial card valid', 'Nobody has a department yet'] },
  { slideId: 'slide.terminal', title: 'The same app, in a terminal', tools: ['tools.terminal'], notes: ['Open a terminal, ssh in, step in, press a tab by its number', 'Same door, same tabs, same server — a third kit over the same trees', 'Say it: nobody wrote a screen for the phone, and none for this'] },
  { slideId: 'slide.timer', title: 'Remember this timer', tools: ['assistant.thread'], notes: ['Share the controller', 'Ask: "Show the last slide in 30 minutes" — rehearsed words, nothing else', 'Read the document aloud before Save: a trigger, an effect, no "as"', 'Save; point at the countdown. "We come back to this."'] },

  // ── 1 · the problem ──
  { slideId: 'slide.problem', title: 'Code is the least checkable thing a model can write', tools: [], notes: ['This room writes code with models every day — no need to sell that', 'Go down the five: validate, policy, replay, migrate, read as state', 'Each is something you can do to a document and cannot do to code'] },
  { slideId: 'slide.thesis', title: 'Code lives in five places', tools: [], notes: ['The five places, fast', 'Everything else: a closed grammar, a Zod schema at the boundary, a runtime', 'The claim for models: a narrow problem and a precise grammar is what makes a small one enough'] },
  { slideId: 'slide.census', title: 'Is JSON enough for a real app?', tools: [], notes: ['The objection everybody has: JSON UIs hit a wall', 'Answer with this app: about half its lines are data in app/, every file parsed against its schema', 'The numbers are counted from the source the server runs, without comments — read them off the wall'] },

  // ── 2 · nova ──
  { slideId: 'slide.data', title: 'The screen is a document', tools: [], notes: ['The card on their phone is this object', 'Point at the layout: one action, three sizes', 'Point at the endpoint: a fingerprint, not a fetch'] },
  { slideId: 'slide.shell', title: 'Events go up, trees come down', tools: [], notes: ['One shell per person, on the server', 'Canvases host actions; actions render layouts', 'The client is a terminal — that is why the SSH door was cheap'] },
  { slideId: 'slide.looks', title: 'One row, and every screen repaints', tools: ['tools.look'], notes: ['Switch to plain — the whole room repaints', 'Laptops: open devtools, nothing was sent', 'Switch back', 'Four kits, one grammar: poster, plain, ink, text'] },
  { slideId: 'slide.screen', title: 'The assistant sees your screen as data', tools: ['tools.screen'], notes: ['The fourth kit draws the tree as words', 'That is the assistant’s view: only what the charter put on the screen', 'Not a screenshot, not a scraped DOM'] },

  // ── 3 · charter ──
  { slideId: 'slide.assignment', title: 'Assignment', tools: ['tools.assignment', 'tools.tally'], notes: ['Tell the room to watch their phones', 'Press Assign the room', 'One row changes per person — the phone follows without a reload'] },
  { slideId: 'slide.clearance', title: 'If you can’t use it, it isn’t there', tools: ['tools.assignment'], notes: ['Ask people to compare phones with a neighbour', 'Different departments, different tools — the rest was never sent', 'Not hidden, not disabled: it does not exist for them'] },
  { slideId: 'slide.charter', title: 'Policy is a document that compiles twice', tools: [], notes: ['Roles select actions and data verbs by glob', 'Compiles twice: which actions exist in a shell, and the scope policy on every query', 'The charter never enforces; moss refuses to boot an incoherent one'] },
  { slideId: 'slide.stamped', title: 'A request cannot say who you are', tools: [], notes: ['The objection: the client can forge an id', 'It has no field to put one in — the engine stamps it from the session', 'Forms may update members; this says which member'] },

  // ── 4 · vex ──
  { slideId: 'slide.live', title: 'Nobody announced anything', tools: [], notes: ['Watch the numbers move as people act', 'No channel, no listener — the query knows what it reads', 'This is a reactive vex read'] },
  { slideId: 'slide.entry', title: 'A query is a document', tools: [], notes: ['The card’s read, whole', 'refresh: reactive — why the numbers moved', '$scope: who you are, bound by the engine, never sent'] },
  { slideId: 'slide.pipeline', title: 'The model is a compiler that runs once', tools: [], notes: ['Intent and shape in; a DSL, never SQL', 'Compiled under a policy the model never sees', 'Cached under a fingerprint — every one like it after is a replay, no model'] },
  { slideId: 'slide.routing', title: 'A small model that only chooses', tools: [], notes: ['Jev never writes; it chooses — same information as an earlier request? which shape?', '48/48 over three runs, about 250 ms a decision', 'Earlier questions in the option text: 0.94 "new" for the identical question. In the state: certain', 'The shape guard: "How many in Archive?" matched the per-department counts at 0.73 — it wants one number'] },
  { slideId: 'slide.query', title: 'The room asks the records', tools: [], notes: ['Tell the room: ask your assistant about the room — watch it open the vex query it ran', 'Watch the counts: replayed climbs, written-by-a-model stays low', 'The requests never go on the wall — people wrote them'] },
  { slideId: 'slide.refusal', title: 'Somebody asked for the login links', tools: ['tools.refusal'], notes: ['Somebody will have asked — point at Refused', 'There is no prompt saying no. The table was never shown to the model', 'Generation runs as the asker; the engine compiles under the same policy'] },
  { slideId: 'slide.models', title: 'Not a frontier model', tools: [], notes: ['gpt-oss-120b on Groq at reasoning low; qwen writes the ID cards; Jev routes', 'Groq caches the prompt prefix: 1.1 s to 0.03 s — the room shares one', 'Narrow problems, precise grammars: that is the argument, not the model'] },

  // ── 5 · prism ──
  { slideId: 'slide.prism', title: 'Transforms are data too', tools: [], notes: ['Every body and every result is shaped by a Prism config', 'No code strings, no formatting in components', 'It says which member; the engine decides'] },

  // ── 6 · the assistant ──
  { slideId: 'slide.assistant', title: 'Everything it knows is data', tools: [], notes: ['Five sections, assembled every turn', 'One prompt for everybody: behaviour. Per person: knowledge', 'Their actions come with their input schemas — that is what it can pre-fill'] },
  { slideId: 'slide.declarations', title: 'The charter builds each assistant', tools: [], notes: ['A declaration applies to whoever holds its action', 'The speaker’s can automate because the speaker holds the console', 'Grounding reads run as the person'] },
  { slideId: 'slide.proposes', title: 'It never acts', tools: [], notes: ['open offers an enum of exactly your actions; query opens a result; automate is the speaker’s', 'Anything that changes something waits for a press', '18/18 on proposals; the reply text is the weak spot — say so'] },

  // ── 7 · tide ──
  { slideId: 'slide.reflex', title: 'The timer is a row', tools: ['tools.reflex'], notes: ['Back to the first minute', 'The draft said 30 minutes; Save anchored it to the second', 'A skill agent re-reads its instructions to learn there is nothing to do; this runs without a model'] },
  { slideId: 'slide.clock', title: 'Whatever the model wrote, this is all it can reach', tools: [], notes: ['The clock holds one verb: deck.write.update', 'The host stamps as: clock, whatever the document said', 'Its effect is its own vex write, through the same door'] },
  { slideId: 'slide.measured', title: 'Measured, bad runs included', tools: [], notes: ['225/240 on clean timer requests; 1/12 correcting a draft — show both', 'Probes written before a run, never rewritten to pass', 'The leak: a package prompt carried lyceum’s probe; two scores voided and kept'] },

  // ── 8 · strata ──
  { slideId: 'slide.strata', title: 'When the grammar changes, documents migrate', tools: [], notes: ['If everything is JSON, what happens when nisc changes?', 'Grammars are ledgered sequences — even this app’s component props', 'strata upgrade writes the expected JSON; verify holds the edit to it'] },

  // ── 9 · how it holds, and the close ──
  { slideId: 'slide.checks', title: 'Every check boots the real app', tools: [], notes: ['Each check boots the real manifest over its own database', 'ssh-check drives a real SSH client', 'The fake model writes real DSL, so the engine and the policy are real'] },
  { slideId: 'slide.map', title: 'One platform, three kinds of surprise', tools: ['tools.fire'], notes: ['Easy, only here, sounds fishy — read one row of each', 'One charter, one tree, one engine under all of it', 'If the timer will not land in time, fire it now'] },
  { slideId: 'slide.end', title: 'It is all in the folder', tools: ['tools.questions'], notes: ['The timer moved the deck here — nobody pressed Next', 'It is all in the folder: apps/lab/lyceum', 'Thank them; take questions'] },
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
