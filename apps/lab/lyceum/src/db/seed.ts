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
  { slideId: 'slide.title', title: 'The talk is an application', tools: ['assistant.thread'], notes: ['Say hello; say it is running, not a recording', 'Ask everyone to take their phone out and scan the code', 'Wait for the register to fill before moving on'] },
  { slideId: 'stage.register', title: 'The register', tools: [], notes: ['Point at the names arriving — each one is a row', 'The model wrote the ID cards while they watched', 'Nobody has a department yet'] },
  { slideId: 'slide.data', title: 'Everything is data', tools: ['tools.look'], notes: ['Actions, layouts, queries, policy: all JSON with a schema', 'The code is only at the edges — a renderer, an endpoint, the boot', 'Show one file if there is time'] },
  { slideId: 'slide.assignment', title: 'Assignment', tools: ['tools.assignment', 'tools.tally'], notes: ['Tell the room to watch their phones', 'Press Assign the room', 'One row changes per person — the phone follows without a reload'] },
  { slideId: 'slide.clearance', title: 'If you can’t use it, it isn’t there', tools: ['tools.assignment'], notes: ['Ask people to compare phones with a neighbour', 'Different departments, different tools — the rest was never sent', 'Not hidden, not disabled: it does not exist for them'] },
  { slideId: 'slide.live', title: 'Nobody announced anything', tools: [], notes: ['Watch the numbers move as people act', 'No channel, no listener — the query knows what it reads', 'This is a reactive vex read'] },
  { slideId: 'slide.ask', title: 'Ask it anything', tools: [], notes: ['Tell the room: the last box on your phone — ask the records anything', 'Watch the counts: replayed climbs, written-by-a-model stays low', 'Somebody will ask for the login links — the refusal is the point'] },
  { slideId: 'slide.end', title: 'It is all in the folder', tools: [], notes: ['Everything was running on this server as they watched', 'It is all in the folder: apps/lab/lyceum', 'Thank them; take questions'] },
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
