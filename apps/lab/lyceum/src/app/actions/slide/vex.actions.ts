import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { ScopeBinding } from '@niscorp/vex';
import { createQueryTools } from '@niscorp/vex/agent';
import { stageRegisterAction } from '@lyceum/app/actions/stage/register.action';
import { searchTool } from '@lyceum/app/actions/tools/search.action';
import { CHARTER } from '@lyceum/app/charter/charter';
import { BEHAVIORS } from '@lyceum/app/vex/behaviors';
import { deckStep } from '@lyceum/app/vex/deck.entries';
import { questionsEvery } from '@lyceum/app/vex/question.entries';
import { queriesTally } from '@lyceum/app/vex/query.entries';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { ENTRIES } from '@lyceum/app/vex';
import { openingTitleLayout } from './opening.layouts';
import { endSlide } from './later.actions';
import { compactJson } from './compact';
import { documentLayout, lockedLayout, nameLayout, requestLayout, shownLayout, sqlLayout, toolsLayout, valueLayout, writerLayout } from './vex.layouts';

// THE VEX TALK'S SLIDES (db/vex.deck.ts): twenty minutes on one package, told
// the way the essay tells it. A slide is an action, and an action is in one
// talk, so the slides this talk shares with the nisc talk — the way in, the
// register, the close — are actions of their own over the same layouts, with
// this talk's words.
//
// Every number and every line of machine text here is read off the code or
// the running engine, never typed in: the shape is the router's own, the
// document is a stored entry as written, the statement is compiled when the
// slide mounts, the tables and the caller line are what the charter and the
// behaviors say, the tools are the agent's, the refusal is the endpoint's.

const code = (...lines: string[]): string => lines.join('\n');

// A slide with nothing to load: its words are its data.
const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, ...data },
  layout,
  triggers: [],
});

// A slide shown in steps reads the deck row's step (vex/deck.entries.ts).
const stepRead = { url: '/api/vex', method: 'POST', request: { fingerprint: deckStep.fingerprint, context: {} }, target: 'step' } as const;

export const vexTitleSlide: ActionDefinition = {
  id: 'slide.sixtools',
  title: 'Vex',
  data: { title: 'Vex', line: 'Six tools and no SQL.', address: { url: '', host: '', ssh: '' } },
  layout: openingTitleLayout,
  endpoints: { address: { fn: 'room.address', target: 'address' } },
  lifecycle: { mount: [{ call: 'address' }] },
  triggers: [],
};

// The register, as this talk's slide: everybody who joined, live.
export const vexRegisterSlide: ActionDefinition = { ...stageRegisterAction, id: 'slide.joined', title: 'Everyone who has joined' };

// The problem: the speaker's own SQL, and what happens to it.
export const sqlSlide = still('slide.sql', 'I write SQL. Somebody has to read it.', sqlLayout, {
  kicker: 'The problem',
  sql: code('SELECT m.name, COUNT(*) AS asked', 'FROM members m', 'JOIN questions q ON q.member_id = m.member_id', 'GROUP BY m.name', 'ORDER BY asked DESC', 'LIMIT 20'),
  outcomes: [
    { area: 'one', ink: 'paper', label: '1 · A person reads it', what: 'They need to know SQL at least as well as the model to catch what it got wrong.' },
    { area: 'two', ink: 'paper', label: '2 · A person runs it', what: 'They look at the rows. That checks the cases they thought of.' },
    { area: 'either', ink: 'signal', label: 'Either way', what: 'A program is handed to a person. Nobody hands the model the connection.' },
  ],
});

// The question the speaker asks on the writer slide, and the shape the router
// answers it in — the router's own (vex/query.shapes.ts): a list of people,
// for a question that asks for several. About the room, over members alone —
// the writer gets it every time (TALK.md §15, "Measured"), and the stage may
// replay it (slide.name). The same words are in the notes (db/vex.deck.ts)
// and in the rehearsal (dev/rehearse.ts).
const QUESTION = 'Who were the last three to join?';
const PEOPLE = QUERY_SHAPES.find((shape) => shape.kind === 'people')?.shape ?? null;
export const requestSlide: ActionDefinition = {
  id: 'slide.request',
  title: 'The question, and the shape of the answer.',
  data: {
    kicker: 'The request',
    title: 'The question, and the shape of the answer.',
    intentJson: JSON.stringify({ intent: QUESTION }, null, 2),
    shapeJson: JSON.stringify({ shape: PEOPLE }, null, 2),
    step: { step: 0 },
  },
  layout: requestLayout,
  endpoints: { step: stepRead },
  lifecycle: { mount: [{ call: 'step' }] },
  triggers: [],
};

// One of this app's own stored documents, as written, and the statement the
// engine compiles for it when the slide mounts (`room.compile`).
export const documentSlide: ActionDefinition = {
  id: 'slide.document',
  title: 'A document in a fixed grammar. Not a statement.',
  data: {
    kicker: 'What the model writes',
    title: 'A document in a fixed grammar. Not a statement.',
    file: 'question.entries.ts — questions/every, as written',
    code: compactJson(questionsEvery.dsl),
    dsl: questionsEvery.dsl,
    compiled: { sql: '', marked: [] },
  },
  layout: documentLayout,
  endpoints: { compile: { fn: 'room.compile', target: 'compiled' } },
  lifecycle: { mount: [{ call: 'compile' }] },
  triggers: [],
};

// What a member's generation is shown, read off the charter and the behaviors:
// the tables a member may read; the grammar's fields and how many instructions
// they carry (`room.grammar`); the caller's bound columns, as vex's agent is
// told them.
const MEMBER_ROLE = CHARTER.member;
const MEMBER_SELECTION = MEMBER_ROLE === undefined || Array.isArray(MEMBER_ROLE) ? undefined : MEMBER_ROLE.data;
const MEMBER_DATA: readonly string[] = Array.isArray(MEMBER_SELECTION) ? MEMBER_SELECTION : (MEMBER_SELECTION?.allow ?? []);
const MEMBER_TABLES = MEMBER_DATA.filter((verb) => verb.endsWith('.read')).map((verb) => verb.slice(0, -'.read'.length));
// A rule that stamps a column from a scope key: the binding the agent is told.
const StampSchema = z.object({ set: z.string(), to: z.string() });
const memberBindings: ScopeBinding[] = Object.entries(BEHAVIORS).flatMap(([table, reaches]) => {
  if (!MEMBER_TABLES.includes(table)) return [];
  const rules: unknown = 'default' in reaches ? reaches.default : reaches;
  const inserts = z.object({ insert: z.array(z.unknown()).optional() }).loose().safeParse(rules);
  return (inserts.success ? (inserts.data.insert ?? []) : []).flatMap((rule) => {
    const stamp = StampSchema.safeParse(rule);
    return stamp.success ? [{ entity: table, field: stamp.data.set, key: stamp.data.to }] : [];
  });
});
export const shownSlide: ActionDefinition = {
  id: 'slide.shown',
  title: 'Three things. Never the database.',
  data: {
    kicker: 'What the model is shown',
    title: 'Three things. Never the database.',
    tables: MEMBER_TABLES.join('\n'),
    grammar: { text: '', fields: 0, rules: 0 },
    // The bindings the agent is told about (`describeCaller` puts them in a
    // sentence): each bound column, and under it the token that stands for
    // the caller's value in a filter — the code, without the sentence.
    caller: memberBindings.map((binding) => `${binding.entity}.${binding.field}\n  { "$scope": "${binding.key}" }`).join('\n'),
    step: { step: 0 },
  },
  layout: shownLayout,
  endpoints: { grammar: { fn: 'room.grammar', target: 'grammar' }, step: stepRead },
  lifecycle: { mount: [{ call: 'grammar' }, { call: 'step' }] },
  triggers: [],
};

// The agent's tools, by name, as it is handed them. What each does is said.
const TOOLS = createQueryTools({ getSchema: () => undefined, read: async () => ({ rows: [], sql: '', warnings: [] }) })
  .map((tool) => tool.toolId)
  .join('\n');
export const toolsSlide = still('slide.tools', 'Six tools. None takes SQL.', toolsLayout, { kicker: 'The tools', tools: TOOLS });

// The speaker's question, as the engine sees it being answered: the trace the
// server keeps of the speaker's newest generation (server/generation), read
// on mount and again whenever the server says it changed. Nothing on it can
// be pressed; the question is asked on the controller (tools.ask).
// Until the server's trace arrives on mount (it carries the whole picture, unlit).
const NO_TRACE = { principal: '', intent: '', shapeKind: '', pipeline: { steps: [], detour: { from: 1, to: 2, off: true, steps: [] }, legend: [] }, document: { caption: '', text: '', lang: '', flag: 'highlight' }, outcome: { kind: 'none', title: 'Nothing asked yet.', said: '', fingerprint: '', sent: '' }, ms: 0 };
export const writerSlide: ActionDefinition = {
  id: 'slide.writer',
  title: 'Watch it write one.',
  data: { kicker: 'Live', title: 'Watch it write one.', trace: NO_TRACE },
  layout: writerLayout,
  endpoints: { generation: { fn: 'room.generation', target: 'trace' } },
  lifecycle: { mount: [{ call: 'generation' }] },
  triggers: [{ message: 'generation-changed', do: [{ call: 'generation' }] }],
};

// The speaker's stored query, replayed as the stage — its own rows — and the
// room's tally, live. The tally is read first: a replay the stage's policy
// refuses (a query over a table the stage may not read) must not stop it.
const followTrace = [{ call: 'generation', onSuccess: [{ call: 'replay' }] }];
export const nameSlide: ActionDefinition = {
  id: 'slide.name',
  title: 'Stored under a name. Replayed by anyone.',
  data: { kicker: 'The fingerprint', title: 'Stored under a name. Replayed by anyone.', trace: NO_TRACE, replayed: [], how: 'replayed', replayError: '', tally: { replayed: 0, generated: 0, refused: 0 } },
  layout: nameLayout,
  endpoints: {
    generation: { fn: 'room.generation', target: 'trace' },
    replay: { url: '/api/vex', method: 'POST', request: { fingerprint: { $ref: '$.trace.outcome.fingerprint' }, context: {} }, target: 'replayed', errorTarget: 'replayError' },
    tally: { url: '/api/vex', method: 'POST', request: { fingerprint: queriesTally.fingerprint, context: {} }, target: 'tally' },
  },
  lifecycle: { mount: [{ call: 'tally' }, ...followTrace] },
  triggers: [{ message: 'generation-changed', do: followTrace }],
};

// The speaker's search, mirrored from the controller (server/mirroring.ts).
export const valueSlide: ActionDefinition = {
  id: 'slide.value',
  title: 'A value in the request is a parameter.',
  data: { kicker: 'Values', title: 'A value in the request is a parameter.', action: searchTool.id, tool: { ...searchTool.data } },
  layout: valueLayout,
  endpoints: { mirror: { fn: 'speaker.mirror', target: 'tool' } },
  lifecycle: { mount: [{ call: 'mirror' }] },
  triggers: [{ message: 'speaker-mirror', do: [{ call: 'mirror' }] }],
};

// This app's own entries, counted; a request that asks the locked endpoint to
// generate, and what it answers; the write grammar's operations.
const PROBE = { intent: QUESTION, shape: PEOPLE, context: {} };
export const lockedSlide: ActionDefinition = {
  id: 'slide.locked',
  title: 'Seeded, locked, nothing generated.',
  data: {
    kicker: 'This app',
    title: 'Seeded, locked, nothing generated.',
    entries: ENTRIES.length,
    reads: ENTRIES.filter((entry) => 'dsl' in entry).length,
    writes: ENTRIES.filter((entry) => 'mutation' in entry).length,
    request: compactJson({ intent: PROBE.intent, shape: PROBE.shape }),
    probe: null,
    locked: { message: '' },
    ops: code('insert', 'insertEach', 'update', 'upsert', 'delete'),
  },
  layout: lockedLayout,
  endpoints: { probe: { url: '/api/vex', method: 'POST', request: PROBE, target: 'probe', errorTarget: 'locked' } },
  lifecycle: { mount: [{ call: 'probe' }] },
  triggers: [],
};

export const vexEndSlide: ActionDefinition = { ...endSlide, id: 'slide.folder' };

export const VEX_SLIDE_ACTIONS: readonly ActionDefinition[] = [vexTitleSlide, vexRegisterSlide, sqlSlide, requestSlide, documentSlide, shownSlide, toolsSlide, writerSlide, nameSlide, valueSlide, lockedSlide, vexEndSlide];
