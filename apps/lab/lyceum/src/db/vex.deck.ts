import type { Slide } from './talks';

// THE VEX TALK — twenty minutes on one package, told the way the essay tells
// it: a model fills in a form, the engine writes the statement, the answer is
// stored under a name and replayed by anyone under their own rights. Data
// alone: the slides are actions in app/actions/slide/vex.actions.ts.
//
// In order. Notes are terse cues; actions in [brackets]. A slide shown in
// steps says how many parts it has.
export const VEX_SLIDES: readonly Slide[] = [
  { slideId: 'slide.sixtools', title: 'Vex', tools: [], notes: ['[join: scan the code or type the address]', 'twenty minutes, one package', 'a model fills in a form, not a statement', 'join: pick a name or type one'] },
  { slideId: 'slide.joined', title: 'Everyone who has joined', tools: [], notes: ['each name = a row in the database', 'the room is the database today', '[wait until most people are in]'] },
  { slideId: 'slide.sql', title: 'I write SQL. Somebody has to read it.', tools: [], notes: ['a query is a program: read it or run it', 'read: you need SQL as well as the model', 'run: checks the cases you thought of', 'nobody hands the model the connection'] },
  {
    slideId: 'slide.request',
    title: 'The question, and the shape of the answer.',
    tools: ['tools.step'],
    parts: 3,
    notes: ['intent: words', '[step] shape: an example of the answer', '"" string, 0 number, list of one = list', '[step] that is the whole request', 'no query written, no endpoint written'],
  },
  {
    slideId: 'slide.document',
    title: 'A document in a fixed grammar. Not a statement.',
    tools: [],
    notes: ['one of this app’s own entries, as written', 'the statement: compiled live, now', 'the JOIN: from the schema (foreign key) — not in the document', 'the caller’s rows: a charter rule, on every run', 'no SELECT *, no offset, no raw expression'],
  },
  {
    slideId: 'slide.shown',
    title: 'Three things. Never the database.',
    tools: ['tools.step'],
    parts: 3,
    notes: ['1 · the tables this caller may read — read off the charter', 'not readable = not in the schema = "not found"', '[step] 2 · the grammar’s own descriptions ARE the rules', '[step] 3 · one line about the caller: a column and a name', 'never a value'],
  },
  { slideId: 'slide.tools', title: 'Six tools. None takes SQL.', tools: [], notes: ['look at the data, test a draft, give up', 'testQuery: validate, compile, run with limit 5, show the statement', 'every tool runs through the engine AS the caller', 'no way to run as nobody'] },
  {
    slideId: 'slide.writer',
    title: 'Watch it write one.',
    tools: ['tools.ask'],
    notes: ['[ask: Who were the last three to join?]', 'a question about the room: the stage replays it on the next slide', 'shown: the tables I may read + one line about me', 'a test fails → the engine’s own message → fixed', 'finishes only with a draft that passed', 'stored under a name: replayed from now on', '[Shape · timeline] → [ask the same again] → same words, another shape: a new stored query, and the mapping agent writes the mapping', 'ask it again: stored mapping, one model'],
  },
  {
    slideId: 'slide.name',
    title: 'Stored under a name. Replayed by anyone.',
    tools: ['tools.asker'],
    notes: ['the stage replays it: the stage’s rows', '[give everybody the ask]', 'ask it in your own words: replayed, no model', 'the tally: asked before / new / not allowed', 'the rule runs after the document is read, before the statement'],
  },
  {
    slideId: 'slide.value',
    title: 'A value in the request is a parameter.',
    tools: ['tools.search'],
    notes: ['[search: part of a name]', 'the value binds as $1 — never in the statement’s text', '[send it without q]', 'empty, and the key it missed: the contract, from the first attempt'],
  },
  {
    slideId: 'slide.locked',
    title: 'Seeded, locked, nothing generated.',
    tools: [],
    notes: ['this app: every read and write an entry, written by hand', 'the endpoint is locked: intent + shape → refused, live', 'the model path is one endpoint, same rules, stored like everything else', 'writes: five operations, never generated — a person presses'],
  },
  { slideId: 'slide.folder', title: 'It’s all in one folder.', tools: [], notes: ['everything you saw ran here', 'apps/lab/lyceum', 'nisc.dev'] },
];
