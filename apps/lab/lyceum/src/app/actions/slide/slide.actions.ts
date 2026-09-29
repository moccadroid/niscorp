import type { ActionDefinition, EndpointConfig } from '@niscorp/nova';
import { departmentsAll, inquiryByDepartment, memberCounts } from '@lyceum/app/vex/member.entries';
import { queriesTally } from '@lyceum/app/vex/query.entries';
import {
  assignmentLayout,
  beatLayout,
  censusLayout,
  clearanceLayout,
  codeLayout,
  figuresLayout,
  liveLayout,
  mapLayout,
  pointsLayout,
  querySlideLayout,
  statementLayout,
  titleLayout,
} from './slide.layouts';

// THE SLIDES. Each is an action only the stage is granted; the deck (`slides`
// rows) decides which is on screen and in what order, and which tool the
// speaker's controller shows alongside. A slide's words are its data; its
// layout is one of a few shapes. The words are provisional — the talk's text
// is written with the story.
//
// `pending` is what SHOULD happen on a slide and is not built yet. It is drawn
// hatched on the projector, so a walk through the deck shows every missing
// beat; it empties as each is built.

const read = (fingerprint: string, target: string): EndpointConfig => ({ url: '/api/vex', method: 'POST', request: { fingerprint, context: {} }, target });
const say = (...texts: string[]): { text: string }[] => texts.map((text) => ({ text }));
const code = (...lines: string[]): string => lines.join('\n');
const COUNTS = { joined: 0, assigned: 0, unassigned: 0 };
// Where people open the room — the deployment's, handed out by the server.
const ADDRESS = { url: '', host: '' };

// A slide that only says something: its words are its data, nothing to load.
const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, tag: '', pending: '', ...data },
  layout,
  triggers: [],
});

// ── 0 · the cold open ──

export const titleSlide: ActionDefinition = {
  id: 'slide.title',
  title: 'The talk is an application',
  data: {
    kicker: 'The Ministry — tonight',
    title: 'The talk is an application',
    lines: ['Everything you will see tonight is running — not a recording, not a mock-up.', 'Take your phone out.'],
    counts: COUNTS,
    address: ADDRESS,
  },
  layout: titleLayout,
  endpoints: { counts: read(memberCounts.fingerprint, 'counts'), address: { fn: 'room.address', target: 'address' } },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'address' }] },
  triggers: [],
};

export const terminalSlide = still('slide.terminal', 'The same app, in a terminal', codeLayout, {
  kicker: 'Nobody wrote this screen',
  file: 'a terminal, beside the slides',
  code: code('$ ssh -p 2222 lyceum.moccadroid.com', '', '  THE MINISTRY', '  ─────────────', '  [1] Step in'),
  marked: [1],
  lines: say(
    'The door your phone showed, in a terminal: any user name, no password. Step in and you are somebody, with the same tabs, each pressed by its number.',
    'Not a second app. The terminal opens its own connection to the same server and draws the same trees with a third kit.',
  ),
  tag: 'One app · no screen written for the phone · none for the terminal',
  pending: "The deployed server's door is not on port 22 yet: the VPS's own sshd moves off it first (PLAN, To build 7). The screen shown here is a sketch.",
});

export const timerSlide = still('slide.timer', 'Remember this timer', beatLayout, {
  kicker: 'Before anything is explained',
  lines: say(
    'The speaker asks their assistant for the end of the talk. What comes back is not a promise — it is a document, to read before it is saved.',
    'We come back to it at the end.',
  ),
  steps: [
    { n: '1', text: 'The speaker asks: "Show the last slide in 30 minutes."' },
    { n: '2', text: 'The assistant answers with a tide reflex — a draft, and a Save button.' },
    { n: '3', text: 'The speaker reads it, and presses Save.' },
    { n: '4', text: 'The controller counts down to its due time.' },
  ],
  pending: "The room watches this on the controller — today by the speaker sharing their screen, outside lyceum. The projector has no view of the controller's assistant.",
});

// ── 1 · the problem ──

export const problemSlide = still('slide.problem', 'Code is the least checkable thing a model can write', pointsLayout, {
  kicker: 'Why',
  points: [
    { label: 'Before it runs', text: 'You cannot validate it. You find out by running it.' },
    { label: 'Policy', text: 'You cannot filter it by who is asking.' },
    { label: 'Replay', text: 'You cannot replay a decision it made. It decides again, every time.' },
    { label: 'Upgrades', text: 'You cannot migrate it when the framework moves.' },
    { label: 'Agents', text: 'An agent cannot read it as state. It reads your source, or a screenshot.' },
  ],
  lines: say('Models are getting good at writing code. The code is still the problem.'),
});

export const thesisSlide = still('slide.thesis', 'Code lives in five places', pointsLayout, {
  kicker: 'The claim',
  points: [
    { label: '1 · Renderers', text: 'Primitives: props in, events out. The only code that draws.' },
    { label: '2 · Endpoints', text: 'Real data access, behind a URL or a registered function.' },
    { label: '3 · Setup', text: 'The manifest, the registry, the boot.' },
    { label: '4 · Authored data', text: 'Written in TypeScript for the types; JSON as it runs.' },
    { label: '5 · Checks', text: 'Scripts that drive the real app and assert.' },
  ],
  lines: say('Everything else is a document in a closed grammar: a schema at the boundary, a runtime to run it. A small model can write those — and a program can check what it wrote.'),
});

// The app's size, counted from its own source by the server as the slide
// mounts — never typed in, so never stale.
export const censusSlide: ActionDefinition = {
  id: 'slide.census',
  title: 'Is JSON enough for a real app?',
  data: {
    kicker: 'The objection, answered by this app',
    title: 'Is JSON enough for a real app?',
    census: { data: 0, code: 0, share: 0, checks: 0, checkLines: 0 },
  },
  layout: censusLayout,
  endpoints: { census: { fn: 'room.census', target: 'census' } },
  lifecycle: { mount: [{ call: 'census' }] },
  triggers: [],
};

// ── 2 · nova ──

export const dataSlide = still('slide.data', 'The screen is a document', codeLayout, {
  kicker: 'Nova',
  file: 'app/actions/member/card.action.ts',
  code: code(
    'export const cardAction: ActionDefinition = {',
    "  id: 'member.card',",
    "  data: { me: { name: '', title: '', … }, tab: false, strip: false },",
    '  input: z.toJSONSchema(z.object({',
    "    tab: z.boolean().optional().describe('Render as a tab …'),",
    "    strip: z.boolean().optional().describe('Render as one line …'),",
    '  })),',
    "  layout: { if: '$.tab', then: TAB_BUTTON,",
    "            else: { if: '$.strip', then: cardStripLayout, else: cardLayout } },",
    '  endpoints: {',
    "    load: { url: '/api/vex', method: 'POST', target: 'me',",
    "            request: { fingerprint: 'members/me', context: {} } },",
    '  },',
    "  lifecycle: { mount: [{ call: 'load' }] },",
    '};',
  ),
  marked: [8, 9, 12],
  lines: say(
    'The ID card on your phone is this object: data, endpoints, a layout, triggers. One action, three sizes — the card, the strip across the top, the tab.',
    'No component knows who you are. The query behind it is a document too.',
  ),
  tag: 'A screen is JSON · A query is JSON · A permission is JSON',
});

export const shellSlide = still('slide.shell', 'Events go up, trees come down', pointsLayout, {
  kicker: 'Nova, held by moss',
  points: [
    { label: 'Shell', text: 'One per person, held on the server.' },
    { label: 'Canvases', text: 'The regions of a screen: a stack of cards, or a tray.' },
    { label: 'Actions', text: 'Data, endpoints, triggers, a layout.' },
    { label: 'Up', text: 'Events: a press, a field typed in.' },
    { label: 'Down', text: 'Render trees. The client is a terminal.' },
  ],
  lines: say('The core never learns what draws it. A browser, a terminal, a line of text: each is a kit over the same tree.'),
});

export const looksSlide = still('slide.looks', 'One row, and every screen repaints', codeLayout, {
  kicker: 'Look at your phone',
  file: 'ui/target.ts — the whole switch, abridged',
  code: code(
    'const paint = (): void => {',
    "  const look = lookIn(api.canvasTree('look')) ?? 'poster';",
    "  style.disabled = look !== 'poster';",
    '  views[look].render();',
    '};',
  ),
  marked: [2, 4],
  lines: say(
    'The speaker writes one row. Every screen in the room swaps its kit — the poster for plain HTML — and the tree it paints does not change.',
    'Open devtools: nothing was sent to switch.',
  ),
  tag: 'Four kits over one grammar · poster · plain · ink (SSH) · text',
});

export const screenSlide = still('slide.screen', 'The assistant sees your screen as data', beatLayout, {
  kicker: 'The fourth kit',
  lines: say(
    'The text kit draws the same tree as words. That is what your assistant is handed each turn: exactly what the charter put on your screen.',
    'Not a screenshot. Not a scraped DOM.',
  ),
  steps: [
    { n: '1', text: 'A phone in the room, on the projector.' },
    { n: '2', text: 'Beside it, the same tree as the text kit draws it.' },
    { n: '3', text: 'Its owner asks their assistant what is on their screen. It answers from that.' },
  ],
  pending: 'The stage cannot show a phone and its text-kit drawing side by side yet, and the controller cannot pick a phone to show.',
});

// ── 3 · charter ──

// Assignment: the four departments, each with its mark and its count so far,
// filling as the speaker assigns the room.
export const assignmentSlide: ActionDefinition = {
  id: 'slide.assignment',
  title: 'Assignment',
  data: {
    kicker: 'Look at your phone',
    title: 'Assignment',
    lines: ['Your department is a role. Being assigned is one row changing — and your phone changes with it.'],
    departments: [],
    tally: [],
    counts: COUNTS,
  },
  layout: assignmentLayout,
  endpoints: {
    departments: read(departmentsAll.fingerprint, 'departments'),
    tally: read(inquiryByDepartment.fingerprint, 'tally'),
    counts: read(memberCounts.fingerprint, 'counts'),
  },
  lifecycle: { mount: [{ call: 'departments' }, { call: 'tally' }, { call: 'counts' }] },
  triggers: [],
};

// Clearance: what each department's role is granted, in plain words — and so
// what exists on its phones.
export const clearanceSlide: ActionDefinition = {
  id: 'slide.clearance',
  title: 'If you can’t use it, it isn’t there',
  data: {
    kicker: 'Compare with your neighbour',
    title: 'If you can’t use it, it isn’t there',
    lines: ['An action your role is not granted is never sent to your phone. Not hidden, not disabled — it does not exist for you.'],
    departments: [],
    pending: "Today the four departments differ by one tab each. Each needs more actions of its own before neighbours' phones differ at arm's length (PLAN, To build 8).",
  },
  layout: clearanceLayout,
  endpoints: { departments: read(departmentsAll.fingerprint, 'departments') },
  lifecycle: { mount: [{ call: 'departments' }] },
  triggers: [],
};

export const charterSlide = still('slide.charter', 'Policy is a document that compiles twice', codeLayout, {
  kicker: 'Charter',
  file: 'app/charter/charter.ts, abridged',
  code: code(
    "member:  { actions: ['member.*', 'query.*', 'questions.*', 'assistant.*'],",
    "           data: ['members.read', 'departments.read', …] },",
    '',
    "records: { extends: ['member'], actions: ['records.*'] },",
    "forms:   { extends: ['member'], actions: ['forms.*'],",
    "           data: ['members.write.update'], scoping: 'personal' },",
    '',
    "clock:   { data: ['deck.write.update'] },",
  ),
  marked: [5, 6],
  lines: say(
    'Roles select actions and data verbs with globs. It compiles into which actions exist in your shell, and into the scope policy on every query you run — generated ones included.',
    'The charter never enforces anything itself. Moss refuses to boot an incoherent one.',
  ),
  tag: 'Written once · never edited during the talk · every change on stage is a row',
});

export const stampedSlide = still('slide.stamped', 'A request cannot say who you are', codeLayout, {
  kicker: 'Charter, row by row',
  file: 'app/vex/behaviors.ts',
  code: code(
    'members: {',
    "  default:  { insert: [{ set: 'member_id', to: 'userId' }] },",
    "  personal: { insert: [{ set: 'member_id', to: 'userId' }],",
    "              update: [{ match: 'member_id', to: 'userId' }] },",
    '},',
  ),
  marked: [2, 4],
  lines: say(
    'Identity is stamped by the engine from the session. There is no field in a request to forge.',
    'The charter says Forms may update members. This says which member: their own — for every query they replay, not only the one written for them.',
  ),
  tag: 'The objection: "the client can send someone else\'s id." It has nowhere to put it.',
});

// ── 4 · vex ──

// Live: the room counted as it changes. Nobody tells this slide anything —
// its reads answer again whenever somebody steps in or is assigned.
export const liveSlide: ActionDefinition = {
  id: 'slide.live',
  title: 'Nobody announced anything',
  data: {
    kicker: 'Watch the numbers',
    title: 'Nobody announced anything',
    lines: ['Every screen that shows the room follows it on its own — no channel, no listener. The query knows what it reads.'],
    counts: COUNTS,
  },
  layout: liveLayout,
  endpoints: { counts: read(memberCounts.fingerprint, 'counts') },
  lifecycle: { mount: [{ call: 'counts' }] },
  triggers: [],
};

export const entrySlide = still('slide.entry', 'A query is a document', codeLayout, {
  kicker: 'Vex',
  file: 'app/vex/member.entries.ts, abridged',
  code: code(
    'export const memberMe: SeedEntry = {',
    "  fingerprint: 'members/me',",
    "  refresh: 'reactive',",
    "  intent: 'The signed-in member: their ID card and their department',",
    "  shape: { member_id: '', name: '', title: '', department_name: '', … },",
    '  dsl: {',
    "    from: ['members', 'departments'],",
    "    fields: ['members.name', 'members.title', { field: 'departments.name', as: 'department_name' }, …],",
    "    filter: { eq: ['members.member_id', { $scope: 'userId' }] },",
    '  },',
    '};',
  ),
  marked: [2, 3, 9],
  lines: say(
    'A fingerprint, an intent, a shape and a DSL — never SQL. The card asks for it by fingerprint alone.',
    "`reactive` is why the counts moved: vex knows what each query reads, and every write passes through vex. `$scope` is who you are, bound by the engine.",
  ),
});

export const pipelineSlide = still('slide.pipeline', 'The model is a compiler that runs once', pointsLayout, {
  kicker: 'Queries from words',
  points: [
    { label: '1 · Intent', text: 'What you want, in words — handed over by your assistant.' },
    { label: '2 · Shape', text: 'One of four: a list, one number, counts per group, people.' },
    { label: '3 · DSL', text: 'Written by a model, in a closed grammar. Never SQL.' },
    { label: '4 · Policy', text: 'Compiled under your scope. The model never sees it.' },
    { label: '5 · Fingerprint', text: 'Cached — and replayed, with no model, every time after.' },
  ],
  lines: say('Not an interpreter that runs on every request.'),
});

export const routingSlide = still('slide.routing', 'A small model that only chooses', figuresLayout, {
  kicker: 'Is there a query for this already?',
  figures: [
    { label: 'routing probes right, over three runs', value: '48/48' },
    { label: 'a decision', value: '~250 ms' },
    { label: '"new", for the identical question — before the fix', value: '0.94' },
  ],
  lines: say(
    'Jev (TypeSafe) never writes a query. In one call it decides two things: does an earlier request want the same information — and what shape does this answer take?',
    'Both fixes were structure, not prompting. The earlier questions go in the state, not the options. And a replay must agree with the shape: "How many in Archive?" is not "…in each department?"',
  ),
});

// Queries from words: everybody's, counted as they are answered — replayed
// from a stored query, written new by a model, or refused. A reactive read:
// the numbers climb while the room queries.
export const querySlide: ActionDefinition = {
  id: 'slide.query',
  title: 'The room asks the records',
  data: {
    kicker: 'On your phone: your assistant',
    title: 'The room asks the records',
    lines: [
      'Ask your assistant about the room. It hands vex an intent; Jev picks the shape, and whether a stored query already answers it. A model writes a new one only when none does — under your clearance, never past it.',
      'Watch the first number climb.',
    ],
    tally: { replayed: 0, generated: 0, refused: 0 },
  },
  layout: querySlideLayout,
  endpoints: { tally: read(queriesTally.fingerprint, 'tally') },
  lifecycle: { mount: [{ call: 'tally' }] },
  triggers: [],
};

export const refusalSlide = still('slide.refusal', 'Somebody asked for the login links', beatLayout, {
  kicker: 'The refusal is the point',
  lines: say(
    'A generation runs as the person asking. The model is shown only the tables they may read, and whatever it writes is compiled under the same policy.',
    'There is no prompt that says "do not show login links". There is no table to show.',
  ),
  steps: [
    { n: '1', text: 'Somebody asks their assistant for the login links.' },
    { n: '2', text: 'The query writer is never shown login_links.' },
    { n: '3', text: 'The answer says why: "That reaches records your clearance does not cover."' },
    { n: '4', text: 'The wall counts it under Refused.' },
  ],
  pending: 'Only the count reaches the wall. The speaker cannot put a refusal and its reason on the projector yet — and anything a person wrote passes moderation first.',
});

export const modelsSlide = still('slide.models', 'Not a frontier model', figuresLayout, {
  kicker: 'What runs this',
  figures: [
    { label: 'generated queries right — gpt-oss-120b, reasoning low', value: '30/36' },
    { label: 'prompt time, on a cached prefix', value: '1.1 → 0.03 s' },
    { label: 'tokens a minute, shared by the whole room', value: '250k' },
  ],
  lines: say(
    'Every agent here runs on an open 120b model on Groq; the routing on Jev, smaller still. A narrow problem, a precise grammar and the right context are what make them enough.',
    'Every generation starts with the same instructions and grammar, so the room shares one warm prefix — and every replay costs no model at all.',
  ),
});

// ── 5 · prism ──

export const prismSlide = still('slide.prism', 'Transforms are data too', codeLayout, {
  kicker: 'Prism',
  file: 'app/actions/forms/rename.prism.ts',
  code: code(
    'export const renamePrism = {',
    '  fingerprint: memberRename.fingerprint,',
    "  context: { memberId: { $ref: '$.me.member_id' },",
    "             name: { $ref: '$.draft' } },",
    '};',
  ),
  marked: [3],
  lines: say(
    'Every request body and every result is shaped by a document over a document — no code strings, no formatter in a component. Here a form\'s draft becomes a rename.',
    'It says which member. It does not decide.',
  ),
  tag: "The engine's personal reach is what makes it yours, whatever this says",
});

// ── 6 · the assistant ──

export const assistantSlide = still('slide.assistant', 'Everything it knows is data', pointsLayout, {
  kicker: 'The assistant',
  points: [
    { label: 'The person', text: 'What their grants say about them, and their ID card, read as them.' },
    { label: 'Now', text: 'The time, and where the talk is.' },
    { label: 'Their screen', text: 'The tree moss sends their phone, drawn as words.' },
    { label: 'Their actions', text: "Each one's input schema — what it can pre-fill." },
    { label: 'The conversation', text: 'The last five turns.' },
  ],
  lines: say('One prompt, the same for everybody, says how it behaves. What differs per person is knowledge, assembled every turn.'),
});

export const declarationsSlide = still('slide.declarations', 'The charter builds each assistant', codeLayout, {
  kicker: 'The assistant, as data',
  file: 'app/assistant/assistants.ts, abridged',
  code: code(
    '{',
    "  id: 'controller',",
    "  context: 'They are the speaker, on the controller that runs the talk.',",
    "  grounding: [{ as: 'The deck, in order', fingerprint: 'slides/deck', … }],",
    "  tools: ['automate', 'open'],",
    "  applies: { screen: 'speaker.console' },",
    '},',
  ),
  marked: [5, 6],
  lines: say(
    'A declaration applies to whoever holds its action. The speaker\'s assistant can automate because the speaker holds the console — there is no second list of who gets what.',
    'Its grounding reads run as the person, under their policy.',
  ),
});

export const proposesSlide = still('slide.proposes', 'It never acts', figuresLayout, {
  kicker: 'Open · query · automate',
  figures: [
    { label: 'assistant probes, on what it proposed', value: '18/18' },
    { label: 'host tools — the only code', value: 3 },
    { label: 'actions it can offer that you do not hold', value: 0 },
  ],
  lines: say(
    'It proposes: an action you hold, pre-filled, as a button. You press it, and it runs through your endpoints, under your policy. The worst a prompt injection gets is a button for something you could already do.',
    'Measured weak spot: its reply text. "saved: false" was once reported as "saved" — the tool result now says NOT saved and NOT running.',
  ),
});

// ── 7 · tide ──

export const reflexSlide = still('slide.reflex', 'The timer is a row', codeLayout, {
  kicker: 'Tide — back to the first minute',
  file: 'a row in timers: what Save stored',
  code: code(
    '{',
    "  id: 'timer-…',",
    "  intent: 'Show the last slide in 30 minutes',",
    "  on: { clock: { at: '…T19:35:00', tz: 'Europe/Vienna' } },",
    "  as: 'clock',",
    "  effect: { name: 'deck.show', input: { slideId: 'slide.end' } },",
    '}',
  ),
  marked: [4, 6],
  lines: say(
    'The model wrote "30 minutes". Save anchored it, to the second, at the press, and stored a reflex. A restart loads the same instant.',
    'A skill-based agent re-reads its instructions every run to find out there is nothing to do. This one was written once, and runs without a model.',
  ),
  pending: 'The stage shows a sketch of a reflex, not the one the speaker saved.',
});

export const clockSlide = still('slide.clock', 'Whatever the model wrote, this is all it can reach', codeLayout, {
  kicker: 'Who a timer runs as',
  file: 'charter.ts · server/timing.ts',
  code: code(
    '// everything the clock may do',
    "clock: { data: ['deck.write.update'] },",
    '',
    '// whatever the document said',
    "return { ...reflex, as: 'clock' };",
  ),
  marked: [2, 5],
  lines: say(
    'Every timer runs as the clock: a principal whose whole charter is one verb. Its effect is its own vex write, through the same door as anybody\'s.',
    'The stage follows it like any other deck move.',
  ),
});

export const measuredSlide = still('slide.measured', 'Measured, bad runs included', figuresLayout, {
  kicker: 'How we know',
  figures: [
    { label: 'timer requests written right', value: '225/240' },
    { label: 'correcting an unsaved draft', value: '1/12' },
    { label: 'scores voided for a leaked probe', value: 2 },
  ],
  lines: say(
    'Probes are written before a run and never rewritten to pass. A fix goes into a grammar\'s descriptions or a tool\'s contract, not into a bigger model.',
    "A package prompt once carried lyceum's own probe as its lesson. Both scores it inflated are kept, marked void — and a rule was written.",
  ),
});

// ── 8 · strata ──

export const strataSlide = still('slide.strata', 'When the grammar changes, documents migrate', codeLayout, {
  kicker: 'Strata',
  file: 'app/grammars.ts, abridged',
  code: code(
    'export const LYCEUM_KIT: Sequence = {',
    "  id: 'lyceum.kit',",
    '  migrations: [',
    "    { description: 'Sheet: a narrow arrangement for phones …', steps: [] },",
    "    { description: 'Countdown: the time left until an instant', steps: [] },",
    "    { description: 'Look: which kit paints the screen', steps: [] },",
    '    …',
    '  ],',
    '};',
  ),
  marked: [2],
  lines: say(
    'Tables are ledgered sequences. Grammars are too — even this app\'s own component props. An addition is a marker; a rename is a migration whose steps rewrite every layout that uses it.',
    'kit-check refuses a kit change the sequence does not record. Because what is migrated is data, the migration is checked.',
  ),
});

// ── 9 · how it holds ──

export const checksSlide = still('slide.checks', 'Every check boots the real app', pointsLayout, {
  kicker: 'Every feature ships a check',
  points: [
    { label: 'The real app', text: 'Each check boots the manifest, headless, and drives it over a real socket.' },
    { label: 'Its own database', text: 'A fresh one per check — the order of the suite means nothing.' },
    { label: 'A real client', text: 'ssh-check drives a real SSH client: in, stepped in, each tab by number, out.' },
    { label: 'Models', text: 'A deterministic stand-in writes real DSL; pnpm models measures the real ones.' },
  ],
  lines: say('pnpm check. Each prints one line per assertion and fails on any.'),
});

export const mapSlide = still('slide.map', 'One platform, three kinds of surprise', mapLayout, {
  kicker: 'What you saw',
  rows: [
    { easy: 'A new renderer is a kit — four, over one grammar', only: 'An agent sees your screen as the data it is', proven: 'Model-written queries in production, refused live' },
    { easy: 'Live screens with no pub/sub: reactive reads', only: 'Absent, not hidden: an ungranted action is never sent', proven: 'A model-written automation that cannot overreach' },
    { easy: "Each person's assistant, from grants they already have", only: 'One charter compiles the UI, the queries and the assistant', proven: 'JSON screens for a whole app, every file checked' },
    { easy: 'Replay instead of regenerate: fingerprints and Jev', only: 'A grammar change is a data migration', proven: 'Open, mid-size models are enough — measured' },
  ],
});

export const endSlide: ActionDefinition = {
  id: 'slide.end',
  title: 'It is all in the folder',
  data: {
    kicker: 'apps/lab/lyceum',
    title: 'It is all in the folder',
    points: [
      { label: 'Live', text: 'Everything you saw tonight was running, on this server, as you watched.' },
      { label: 'Data', text: 'Every screen, query and permission is a file you can read.' },
      { label: 'Yours', text: 'Open it. Change a slide. It is the same thing the room just used.' },
    ],
  },
  layout: statementLayout,
  triggers: [],
};

export const SLIDE_ACTIONS: readonly ActionDefinition[] = [
  titleSlide,
  terminalSlide,
  timerSlide,
  problemSlide,
  thesisSlide,
  censusSlide,
  dataSlide,
  shellSlide,
  looksSlide,
  screenSlide,
  assignmentSlide,
  clearanceSlide,
  charterSlide,
  stampedSlide,
  liveSlide,
  entrySlide,
  pipelineSlide,
  routingSlide,
  querySlide,
  refusalSlide,
  modelsSlide,
  prismSlide,
  assistantSlide,
  declarationsSlide,
  proposesSlide,
  reflexSlide,
  clockSlide,
  measuredSlide,
  strataSlide,
  checksSlide,
  mapSlide,
  endSlide,
];
