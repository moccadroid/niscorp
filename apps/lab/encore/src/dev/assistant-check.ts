// THE ASSISTANT — the slow speed, end to end.
//
// Jev answers yes/no per card, per field, per pack. THE ASSISTANT RUNS ON EVERY
// FINISHED SENTENCE — a quiet line, or Enter — and on nothing else; it is handed
// the same state each time under one prompt and one contract, in which everything
// is optional, an empty answer included. (This file replaces handoff-check, most
// of which proved rules that no longer exist: routes, the computed fallback, the
// question-mark rule, the demotion line, signatures, per-mode behaviour. Their
// assertions were deleted with them, not reshaped.)
//
// Driven through a real shell with the SCRIPTED model: cortex's loop, prompt
// assembly, tools, partials, envelope validation and correction, signal's real
// openai-compatible adapter, streaming and abort are all live — only the words a
// model would have produced are scripted.
//
//   a. WHEN: never mid-typing; once per finished sentence; again on Enter
//   b. an empty answer shows nothing, and the cards are the turn
//   c. words stream at most every 120 ms; what it is handed
//   d. the thread; the prompt is static → thread → this turn → the line
//   e. the two read tools — allowed, refused BEFORE the wire, capped
//   f. it adds and aims; it closes nothing
//   g. words for a form — and a field a person touched is never overwritten
//   h. steps wait behind their chips
//   i. a changed line aborts the run
//   j. admission rejects WHOLE; a rejected attempt is corrected inside the run
//   k. the operator ends a thread; nothing else does
//   l. the narrower principal
//   m. every run is recorded and traced; no run writes a row but the thread
//   n. with no assistant, nothing runs and the cards are still turns
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { estimateTokens } from '@niscorp/cortex';
import type { ToolContext, ToolDefinition } from '@niscorp/cortex';
import type { FetchFn } from '@niscorp/nova';
import { deepDecodeJsonish } from '@niscorp/signal';
import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import { ENTRIES } from '@encore/app/vex';
import { encoreAgent } from '@encore/server/agent/agent';
import { defaultScript } from '@encore/server/agent/fake-llm';
import type { FakeAgentControls, SeenRequest } from '@encore/server/agent/fake-llm';
import { PREDECISIONS_HEADING, predecisionsIn } from '@encore/server/agent/predecisions';
import type { Predecisions } from '@encore/server/agent/predecisions';
import { QUERY_MAX_ROWS, createReadTools, readableQueries } from '@encore/server/agent/tools';
import { ANSWER_WRITE_MS, HANDOFF_IDLE_MS } from '@encore/server/intent/assist';
import { CARDS_ONLY } from '@encore/server/intent/thread';
import { STORM_PLAN_STEPS, cardData, createReporter, createWorld, mounted, planOf, settle } from './world-factory';

const GOING_ON = "what's going on?";
const MOVE = 'move the headliner to the tent at 9';
const FREE = 'is the tent free then?';
const WARN = 'warn everyone about the storm at 9';
const PLAN_ABOUT = 'storm at 9 what should we do with the headliner';
const STATIC_BLOCKS = 6;

const { check, report } = createReporter();

const waitFor = async (what: () => boolean, withinMs: number): Promise<boolean> => {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    if (what()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return what();
};

// The pre-decisions a request carried, read back out of it.
const handedIn = (request: SeenRequest | undefined): Predecisions | undefined => (request?.messages ?? []).flatMap((message) => predecisionsIn(message.content) ?? []).at(-1);

const RowsSchema = z.object({ rows: z.array(z.unknown()), note: z.string().optional() });
const RefusedSchema = z.object({ refused: z.string() });
const ListedSchema = z.object({ queries: z.array(z.object({ fingerprint: z.string(), returns: z.string(), context: z.array(z.string()) })) });

const toolContext = (): ToolContext => ({ runId: 'check', agentId: 'check', agentPath: ['check'], signal: new AbortController().signal, forward: () => {} });

const toolNamed = (tools: readonly ToolDefinition[], name: string): ToolDefinition => {
  const tool = tools.find((candidate) => candidate.config.name === name);
  if (tool === undefined) throw new Error(`assistant-check: no tool named ${name}`);
  return tool;
};

// The blocks of an assembled prompt, by what they are.
const blocksOf = (messages: readonly { role: string; content: string }[]): { block: string; chars: number; tokens: number }[] => {
  const blockAt = messages.findIndex((message) => message.content.startsWith(PREDECISIONS_HEADING));
  // With no thread yet, the first non-system message is the line itself.
  const firstTurn = Math.min(blockAt, messages.findIndex((message) => message.role !== 'system'));
  const staticNames = ['instructions', 'tool guides', 'the contract (JSON Schema)', 'finish protocol', 'theRoom', 'howToAnswer'];
  const sized = (block: string, slice: readonly { role: string; content: string }[]): { block: string; chars: number; tokens: number } => ({
    block,
    chars: slice.reduce((sum, message) => sum + message.content.length, 0),
    tokens: estimateTokens(slice.map((message) => ({ role: 'system', content: message.content }))),
  });
  const thread = messages.slice(firstTurn, -2);
  return [...messages.slice(0, firstTurn).map((message, index) => sized(staticNames[index] ?? `static ${index}`, [message])), sized(`thread (${thread.length} messages)`, thread), sized('pre-decisions', messages.slice(-2, -1)), sized('the line', messages.slice(-1))];
};

const printBlocks = (title: string, messages: readonly { role: string; content: string }[]): void => {
  const blocks = blocksOf(messages);
  console.log(`\n       ${title}`);
  for (const block of blocks) console.log(`         ${block.block.padEnd(30)} ${String(block.chars).padStart(6)} chars  ~${String(block.tokens).padStart(5)} tokens`);
  console.log(`         ${'TOTAL'.padEnd(30)} ${String(blocks.reduce((sum, block) => sum + block.chars, 0)).padStart(6)} chars  ~${String(blocks.reduce((sum, block) => sum + block.tokens, 0)).padStart(5)} tokens`);
};

const NOTHING = (): { answer: { response: string; data: Record<string, never> } } => ({ answer: { response: '', data: {} } });

const main = async (): Promise<void> => {
  const controls: FakeAgentControls = { latencyMs: 0, chunkMs: 0, seen: [] };
  const traceDir = await mkdtemp(join(tmpdir(), 'encore-trace-'));
  const world = await createWorld({ agent: { kind: 'fake', fake: controls }, traceDir });
  const OP = OPERATOR_PRINCIPAL;
  const shell = await world.login(OP);
  await settle();
  const countsBefore = await world.tableCounts();

  const loop = world.booted.intent.of(OP);
  const answerCard = (): Record<string, unknown> => cardData(shell, 'assist', 'assist.answer');
  const body = (): unknown => cardData(shell, 'doing', 'push.compose')['body'];
  const stepsOn = (card: Record<string, unknown>): unknown[] => (Array.isArray(card['steps']) ? card['steps'] : []);
  const railEntries = (): unknown[] => { const entries = cardData(shell, 'rail', 'assist.rail')['entries']; return Array.isArray(entries) ? entries : []; };
  const lastRun = (principal = OP): ReturnType<typeof world.runsOf>[number] | undefined => world.runsOf(principal).at(-1);
  const threadRows = async (principal = OP): Promise<Record<string, unknown>[]> => world.sql('SELECT seq, role, body, detail FROM agent_turns WHERE principal = $1 ORDER BY seq', [principal]);
  const currentThread = async (): Promise<Record<string, unknown>[]> => {
    const rows = await threadRows();
    return rows.slice(rows.map((row) => row['role'] === 'break').lastIndexOf(true) + 1);
  };
  const instancesOn = (canvas: string): string => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => `${item.definitionId}#${item.id}`).join();
  const headliner = String((await world.sql(`SELECT id FROM acts WHERE billing = 'headliner'`))[0]?.['id'] ?? '');

  // ═══ a. when it runs ═════════════════════════════════════
  controls.script = NOTHING;
  for (let length = 1; length <= MOVE.length; length += 1) {
    world.keystroke(OP, MOVE.slice(0, length));
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
  check(`NEVER MID-TYPING: ${MOVE.length} keystrokes, ${world.passesOf(OP).length} passes already landed — and the assistant has not been called`, world.passesOf(OP).length >= 1 && world.runsOf(OP).length === 0 && controls.seen.length === 0 && mounted(shell, 'assist').length === 0);
  await world.settled(OP);
  const moveRun = lastRun();
  check(`THE LINE WENT QUIET, so the sentence is finished and it ran — once (${world.runsOf(OP).length} run, started by ${moveRun?.startedBy}, for "${moveRun?.text}")`, world.runsOf(OP).length === 1 && moveRun?.startedBy === 'idle' && moveRun.text === MOVE && moveRun.status === 'landed');
  check('...whatever Jev made of it: this one the cards answer by themselves — the form is up and aimed — and nothing was asked of Jev about that', cardData(shell, 'doing', 'slot.swap')['actId'] === headliner && !(world.passesOf(OP).at(-1)?.questionNames ?? []).some((name) => name.startsWith('handoff/')));
  await new Promise((resolve) => setTimeout(resolve, HANDOFF_IDLE_MS + 300));
  await world.settled(OP);
  check('ONCE PER FINISHED SENTENCE: the line stays quiet, passes still land, and it is not run again', world.runsOf(OP).length === 1);

  // ═══ b. nothing to say ═══════════════════════════════════
  check('AN EMPTY ANSWER SHOWS NOTHING: the run landed with no words, and there is no answer card', moveRun?.answer === '' && mounted(shell, 'assist').length === 0 && cardData(shell, 'maybe', 'intent.options')['links']?.toString() === '');
  const pressed = Date.now();
  world.dispatchOn(OP, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  const enterRan = await waitFor(() => world.runsOf(OP).length === 2 && lastRun()?.status !== 'running', 1500);
  check(`ENTER RUNS IT NOW (${Date.now() - pressed} ms, under the ${HANDOFF_IDLE_MS} ms quiet) — a person asked, so an answered sentence is asked again`, enterRan && lastRun()?.startedBy === 'enter' && Date.now() - pressed < HANDOFF_IDLE_MS);
  await world.settled(OP);
  controls.script = undefined;

  // ═══ c. words, streamed; and what it was handed ══════════
  const runningWrites: number[] = [];
  let lastWritten = '';
  shell.onDataChange(({ instanceId, data }) => {
    const card = shell.getState().canvases['assist']?.stack.find((item) => item.id === instanceId);
    const written = JSON.stringify([data['status'], data['say'], data['answer'], data['lookups']]);
    if (card === undefined || written === lastWritten) return;
    lastWritten = written;
    if (data['status'] === 'running') runningWrites.push(performance.now());
  });
  await loop?.newThread();
  controls.seen.length = 0;
  controls.chunkMs = 45;
  await world.typeLine(OP, GOING_ON);
  const goingPass = world.passesOf(OP).at(-1);
  check(`Jev opens the overview in the pass (${mounted(shell, 'nearby').join(', ')}), and says yes to the facts: ${goingPass?.handoff.packs.map((pack) => `${pack.id} ${pack.p}`).join(', ')}`, mounted(shell, 'nearby').includes('situation.now') && goingPass?.handoff.packs.some((pack) => pack.id === 'situation') === true && mounted(shell, 'assist').length === 0);
  await world.settled(OP);
  const goingRun = lastRun();
  check(`the run landed (${goingRun?.status}, ${goingRun?.modelSteps} model step)`, goingRun?.status === 'landed' && goingRun.startedBy === 'idle' && goingRun.modelSteps === 1);
  check(`the answer is on the card, in words: "${String(answerCard()['answer']).slice(0, 80)}…"`, answerCard()['status'] === 'landed' && String(answerCard()['answer']).includes('situation.openIncidents') && answerCard()['answer'] === goingRun?.answer);
  check('an answer in words names no canvas, so it moved no card: the overview is where Jev put it', goingRun?.canvasesNamed.length === 0 && goingRun.cardsMounted.length === 0 && mounted(shell, 'nearby').includes('situation.now'));
  const gaps = (goingRun?.answerWrites ?? []).slice(1).map((at, index) => at - (goingRun?.answerWrites[index] ?? 0));
  check(`the answer STREAMED: ${goingRun?.answerWrites.length} writes for 8 chunks at 45 ms…`, (goingRun?.answerWrites.length ?? 0) >= 2 && (goingRun?.answerWrites.length ?? 99) < 8);
  check(`...never more than one per ${ANSWER_WRITE_MS} ms (gaps: ${gaps.map((gap) => Math.round(gap)).join(', ')} ms)`, gaps.length > 0 && gaps.every((gap) => gap >= ANSWER_WRITE_MS));
  check(`...and those were the ONLY writes a run made to the card while it was out (${runningWrites.length} seen by the shell: the run starting + ${goingRun?.answerWrites.length})`, runningWrites.length === (goingRun?.answerWrites.length ?? 0) + 1);
  const goingRequest = controls.seen.at(-1);
  const goingHanded = handedIn(goingRequest);
  check('it was handed the sentence and the rows of the packs Jev said yes to', goingHanded?.sentence === GOING_ON && Object.keys(goingHanded.facts).includes('situation') && JSON.stringify(goingHanded.facts['situation']).includes('openIncidents'));
  check(`...SCREEN says what is up (${goingHanded?.screen.map((card) => card.card).join(', ')})`, goingHanded?.screen.some((card) => card.card === 'situation.now' && card.canvas === 'nearby') === true);
  check(`...and a NARROWED catalog, ONE LINE EACH, not JSON Schema (${goingHanded?.actions.length} of ${Object.keys(CANVAS_PLACEMENT).length})`, (goingHanded?.actions.length ?? 99) <= 8 && goingHanded?.actions.every((line) => !line.includes('"properties"') && !line.includes('\n')) === true);
  check('...and NOTHING about a mode or a route: the state is the same shape every time', goingHanded !== undefined && !('mode' in goingHanded) && !(goingRequest?.messages ?? []).some((message) => /"(mode|route)":/.test(message.content)));
  check('Groq’s settings ride every request: temperature 0, reasoning effort default', goingRequest?.params['temperature'] === 0 && goingRequest.params['reasoning_effort'] === 'default');
  check(`...two tools, both reads, and no exit tool — the envelope rides the content channel (${goingRun?.strategy})`, goingRequest?.tools.join() === 'list_queries,query' && goingRun?.strategy === 'emit');
  check('...with token counts from the provider’s usage frame, and said to be', (goingRun?.inputTokens ?? 0) > 0 && (goingRun?.outputTokens ?? 0) > 0 && goingRun?.usageReported === true);
  controls.chunkMs = 0;
  printBlocks(`assembled prompt — "${GOING_ON}" (no thread yet)`, goingRequest?.messages ?? []);
  await world.typeLine(OP, '');
  await world.settled(OP);
  await loop?.newThread();

  // ═══ d. the thread ═══════════════════════════════════════
  controls.script = NOTHING;
  await world.typeLine(OP, MOVE);
  await world.settled(OP);
  controls.script = (turn) => (turn.line === FREE ? { answer: { response: `The Tent is free from 22:45. Earlier here: ${turn.thread.length} message(s).`, data: {} } } : NOTHING());
  await world.typeLine(OP, FREE);
  await world.settled(OP);
  controls.script = undefined;
  const afterMove = await currentThread();
  const cardsOnly = afterMove.find((row) => String(row['body']).startsWith(CARDS_ONLY));
  check(`a sentence the assistant had nothing to add to is a TURN all the same — what the cards amounted to, as one compact line: "${String(cardsOnly?.['body']).slice(0, 110)}…"`, String(cardsOnly?.['body']).startsWith(CARDS_ONLY) && String(cardsOnly?.['body']).includes('slot.swap') && String(cardsOnly?.['body']).includes(headliner));
  check('...and the rail says it in the operator’s terms, with nothing about a route', String(cardsOnly?.['detail']).includes('"rail":"moved Nova Kestrel') && !String(cardsOnly?.['detail']).includes('"route"'));
  const freeRun = lastRun();
  const freeFirst = controls.seen.at(-1);
  check('THE RUN’S INPUT CONTAINS THE EARLIER TURN: the sentence, and what came of it', freeFirst?.messages.some((message) => message.role === 'user' && message.content === MOVE) === true && freeFirst.messages.some((message) => message.role === 'assistant' && message.content.startsWith(CARDS_ONLY)));
  check(`...and the assistant used it: "${String(answerCard()['answer'])}"`, String(answerCard()['answer']).includes('Earlier here: 2 message(s)'));
  check('the operator’s line was stored BEFORE the run, the answer after it landed', afterMove.map((row) => row['role']).join() === 'operator,agent,operator,agent' && afterMove[2]?.['body'] === FREE && afterMove[3]?.['body'] === freeRun?.answer);
  check(`the rail lists the EARLIER turns, read from those rows — not the exchange being shown (${railEntries().length})`, railEntries().length === 1 && JSON.stringify(railEntries()).includes(MOVE) && !JSON.stringify(railEntries()).includes(FREE));

  const session = world.booted.intent.sessionOf(OP);
  const llm = world.booted.agent.llm;
  const input = loop?.lastAgentInput();
  if (session === undefined || llm === undefined || input === undefined) throw new Error('assistant-check: no session, model or run input to preview');
  const tools = createReadTools({ wire: session.wire, policy: session.policy, entries: ENTRIES });
  const preview = await encoreAgent.preview(input.input, { llm, tools, deps: {} });
  const roles = preview.messages.map((message) => message.role);
  const firstTurn = roles.findIndex((role) => role !== 'system');
  const contentOf = (index: number): string => { const content = preview.messages.at(index)?.content; return typeof content === 'string' ? content : ''; };
  check(`preview(): ${firstTurn} static blocks FIRST, all system — ONE prompt, with no block that varies by turn (${preview.messages.length} messages, ~${preview.estimatedTokens} tokens, ${preview.strategy})`, firstTurn === STATIC_BLOCKS && roles.slice(0, firstTurn).every((role) => role === 'system') && contentOf(0).startsWith('You are the second, slower mind'));
  check('...then THE THREAD, as the conversation it was', roles.slice(firstTurn, -2).join() === 'user,assistant' && contentOf(firstTurn) === MOVE);
  check('...then THIS SENTENCE’S PRE-DECISIONS, as a system message', roles.at(-2) === 'system' && contentOf(-2).startsWith(PREDECISIONS_HEADING));
  check('...then the operator’s line, last', roles.at(-1) === 'user' && contentOf(-1) === FREE);
  check('...and it IS what the run sent: the preview and the request are the same messages', JSON.stringify(preview.messages.map((message) => message.content)) === JSON.stringify(freeFirst?.messages.map((message) => message.content)));
  check('the static blocks are byte-identical to the previous sentence’s — the prefix a provider caches', JSON.stringify(goingRequest?.messages.slice(0, STATIC_BLOCKS)) === JSON.stringify(freeFirst?.messages.slice(0, STATIC_BLOCKS)));

  const jevBodies = world.booted.decider.fakeSeen?.() ?? [];
  const JevRequest = z.object({ state: z.object({ line: z.string(), heard: z.record(z.string(), z.unknown()) }).strict() }).loose();
  const jevParsed = JevRequest.safeParse(JSON.parse(jevBodies.at(-1) ?? '{}'));
  check('JEV IS NEVER HANDED HISTORY: its state is the line and what the parser heard in it — those two keys, nothing else', jevParsed.success && jevParsed.data.state.line === FREE);
  check('...and no request it was sent for this sentence mentions the last one, or the thread', jevBodies.filter((text) => text.includes('"line":"is the tent')).length > 0 && jevBodies.filter((text) => text.includes('"line":"is the tent')).every((text) => !text.includes('headliner to the tent') && !text.includes(CARDS_ONLY)));
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ e. the two read tools ═══════════════════════════════
  let wireCalls = 0;
  const countingWire: FetchFn = (url, init) => {
    wireCalls += 1;
    return session.wire(url, init);
  };
  const opTools = createReadTools({ wire: countingWire, policy: session.policy, entries: ENTRIES });
  const listed = ListedSchema.parse(await toolNamed(opTools, 'list_queries').config.execute({}, toolContext()));
  const mutations = ENTRIES.flatMap((entry) => ('mutation' in entry ? [entry.fingerprint] : []));
  check(`list_queries: ${listed.queries.length} readable fingerprints, each with what it returns and the context it needs — without a request`, listed.queries.length > 10 && listed.queries.every((query) => query.returns !== '') && listed.queries.find((query) => query.fingerprint === 'lineup/forDay')?.context.join() === 'day,stageId' && wireCalls === 0);
  check(`...and never a mutation (${mutations.join(', ')})`, mutations.length >= 4 && mutations.every((fingerprint) => !listed.queries.some((query) => query.fingerprint === fingerprint)));
  const lineup = RowsSchema.safeParse(await toolNamed(opTools, 'query').config.execute({ fingerprint: 'lineup/forDay', context: { day: 'sat' } }, toolContext()));
  check(`query replays an allowed fingerprint over the session’s wire, as the operator (${lineup.success ? lineup.data.rows.length : 0} rows, ${wireCalls} request)`, lineup.success && lineup.data.rows.length > 0 && wireCalls === 1);
  const swapRefusal = RefusedSchema.safeParse(await toolNamed(opTools, 'query').config.execute({ fingerprint: 'slots/swap', context: { actId: headliner } }, toolContext()));
  check(`a MUTATION is refused before the wire: "${swapRefusal.success ? swapRefusal.data.refused.slice(0, 60) : ''}…"`, swapRefusal.success && swapRefusal.data.refused.includes('changes data') && wireCalls === 1);
  const madeUp = RefusedSchema.safeParse(await toolNamed(opTools, 'query').config.execute({ fingerprint: 'acts/everything', context: null }, toolContext()));
  check('a fingerprint that does not exist is refused before the wire, and told where to look', madeUp.success && madeUp.data.refused.includes('list_queries') && wireCalls === 1);
  // `context` is an OBJECT in the tool's own schema: cortex validates the call
  // against it before `execute` runs — a failure goes back to the model as the
  // tool's answer, and never reaches the wire. A model that stringifies nested
  // args is rescued by the decode cortex applies first (loop.ts), not here.
  const queryInput = toolNamed(opTools, 'query').config.input;
  check('a context that is not a JSON object fails the tool’s own schema — it never reaches execute, so never the wire', !queryInput.safeParse({ fingerprint: 'lineup/forDay', context: 'day=sat' }).success && wireCalls === 1);
  check('...while the SAME object stringified (as gpt-oss sends nested args) validates once cortex has decoded it', queryInput.safeParse(deepDecodeJsonish({ fingerprint: 'lineup/forDay', context: '{"day":"sat"}' })).success);
  const manyRows: FetchFn = async () => ({ ok: true, status: 200, json: async () => Array.from({ length: 300 }, (_, index) => ({ id: index })), text: async () => '' });
  const cappedRows = RowsSchema.parse(await toolNamed(createReadTools({ wire: manyRows, policy: session.policy, entries: ENTRIES }), 'query').config.execute({ fingerprint: 'lineup/forDay', context: { day: 'sat' } }, toolContext()));
  check(`the answer is CAPPED (${cappedRows.rows.length} of 300 rows), and says what it left out`, cappedRows.rows.length === QUERY_MAX_ROWS && String(cappedRows.note).includes('260'));

  // ═══ f. it adds and aims; it closes nothing ══════════════
  controls.script = () => ({ answer: { response: 'The storm is the thing to tell people about.', data: { canvases: { when: [], doing: [{ actionId: 'push.compose', input: { audience: 'everyone' } }] } } } });
  const STORM_ASK = 'what is going on with the storm at 9?';
  await world.typeLine(OP, STORM_ASK);
  const nearbyBefore = instancesOn('nearby');
  const whenBefore = [...mounted(shell, 'when')].sort().join();
  check(`Jev arranged the room first: when ${mounted(shell, 'when').join(', ')} · nearby ${mounted(shell, 'nearby').join(', ')}`, mounted(shell, 'when').includes('weather.radar') && mounted(shell, 'nearby').length > 0 && !mounted(shell, 'doing').includes('push.compose'));
  await world.settled(OP);
  const namedRun = lastRun();
  check(`the answer landed naming two canvases (${namedRun?.canvasesNamed.join(', ')})`, namedRun?.status === 'landed' && [...namedRun.canvasesNamed].sort().join() === 'doing,when');
  check('...naming `when` with NOTHING in it closes nothing: what Jev mounted there still stands, through the pass that followed too', [...mounted(shell, 'when')].sort().join() === whenBefore && (namedRun?.cardsClosed ?? []).length === 0);
  const pushInstance = shell.getState().canvases['doing']?.stack.find((item) => item.definitionId === 'push.compose');
  check(`...\`doing\` got the form, opened with what the answer gave it, tagged "${String(cardData(shell, 'doing', 'push.compose')['placedBy'])}"`, pushInstance !== undefined && shell.originOf(pushInstance.id) === 'assist' && cardData(shell, 'doing', 'push.compose')['audience'] === 'everyone' && cardData(shell, 'doing', 'push.compose')['placedBy'] === 'scripted');
  check('A CANVAS IT DID NOT NAME WAS NOT TOUCHED: `nearby` holds the very same instances', instancesOn('nearby') === nearbyBefore && nearbyBefore !== '');
  await world.typeLine(OP, 'bar sales today');
  check('a new sentence lets go of all of it: nothing pinned, nothing the answer gave a card remembered', loop?.holding().pinned.length === 0 && loop.holding().given.length === 0);
  await world.typeLine(OP, '');
  await world.settled(OP);
  controls.script = undefined;

  // ═══ g. words for a form ═════════════════════════════════
  controls.seen.length = 0;
  await world.typeLine(OP, WARN);
  check(`the pass mounts the push form at once (${mounted(shell, 'doing').join(', ')}), its body the operator’s own sentence — Jev writes no strings — and no assistant has been called`, mounted(shell, 'doing').includes('push.compose') && body() === WARN && controls.seen.length === 0);
  await world.settled(OP);
  const warnRun = lastRun();
  check(`the body is now AUTHORED text: "${String(body())}"`, warnRun?.status === 'landed' && typeof body() === 'string' && body() !== WARN && String(body()).includes('21:00') && String(body()).includes('festival crew'));
  check('...written by the run, into that one field — and it named no canvas', warnRun?.fieldsWritten.join() === 'push.compose.body' && warnRun.cardsMounted.length === 0 && warnRun.canvasesNamed.length === 0);
  check(`the card says so, and that the words are theirs to edit: "${String(answerCard()['plain'])}"`, answerCard()['status'] === 'landed' && String(answerCard()['answer'] ?? '') !== '' && String(answerCard()['plain']).startsWith('Edit the words freely'));
  const handed = handedIn(controls.seen.at(-1));
  check('it was handed the sentence, what the parser heard, and which written fields exist on screen, what each is for, and what it held', handed?.sentence === WARN && handed.heard['time'] === '21:00' && handed.writable.length === 1 && handed.writable[0]?.card === 'push.compose' && handed.writable[0]?.field === 'body' && handed.writable[0]?.holds === WARN);
  await world.typeLine(OP, '');

  // Edited before the run starts: the field is not even offered.
  controls.latencyMs = 400;
  controls.seen.length = 0;
  const runsBeforeEdit = world.runsOf(OP).length;
  await world.typeLine(OP, WARN);
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'body', payload: 'MY OWN WORDS' }, 'push.compose');
  await settle(2);
  check('the operator edits the body before the run starts', body() === 'MY OWN WORDS' && world.runsOf(OP).length === runsBeforeEdit);
  await world.settled(OP);
  check(`the run landed (${lastRun()?.status}) and did NOT overwrite it`, lastRun()?.status === 'landed' && body() === 'MY OWN WORDS' && lastRun()?.fieldsWritten.length === 0);
  check('...because a touched field is not offered to the assistant at all', handedIn(controls.seen.at(-1))?.writable.length === 0);
  await world.typeLine(OP, '');

  // Edited MID-RUN: offered, written for — and the write is dropped at the door.
  controls.seen.length = 0;
  await world.typeLine(OP, WARN);
  const midRun = await waitFor(() => lastRun()?.status === 'running' && controls.seen.length > 0, HANDOFF_IDLE_MS + 1500);
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'body', payload: 'TYPED WHILE IT RAN' }, 'push.compose');
  await world.settled(OP);
  check('edited while the run was out: offered, authored — and still not overwritten', midRun && handedIn(controls.seen.at(-1))?.writable.length === 1 && lastRun()?.status === 'landed' && body() === 'TYPED WHILE IT RAN' && lastRun()?.fieldsWritten.length === 0);
  await world.typeLine(OP, '');
  check('clearing the line takes the answer card with it', mounted(shell, 'assist').length === 0);

  // ═══ h. steps ════════════════════════════════════════════
  controls.latencyMs = 0;
  controls.script = planOf(STORM_PLAN_STEPS);
  await world.typeLine(OP, PLAN_ABOUT);
  await world.settled(OP);
  controls.script = undefined;
  const planRun = lastRun();
  check(`steps land as chips on the card (${planRun?.planSteps}), with the one line an operator needs: "${String(answerCard()['plain'])}"`, planRun?.status === 'landed' && planRun.planSteps === 3 && stepsOn(answerCard()).length === 3 && String(answerCard()['plain']).startsWith('Press a step'));
  check('steps mount nothing by themselves: their forms wait behind them', planRun?.cardsMounted.length === 0 && planRun.canvasesNamed.length === 0 && mounted(shell, 'doing').length === 0);
  const swapStep = stepsOn(answerCard()).findIndex((step) => JSON.stringify(step).includes('Move a set'));
  world.dispatchOn(OP, 'assist', { type: 'ui:click', ref: 'step', payload: swapStep });
  await world.settled(OP);
  const swap = cardData(shell, 'doing', 'slot.swap');
  const swapInstance = shell.getState().canvases['doing']?.stack.find((item) => item.definitionId === 'slot.swap');
  check('pressing the step mounts that form, prefilled, placed by the same map and stamped as the assistant’s', swapInstance !== undefined && swap['actId'] === headliner && shell.originOf(swapInstance.id) === 'assist' && swap['placedBy'] === `scripted · step ${swapStep + 1}`);
  check('...and it SURVIVES the pass that followed — the loop adopted it — beside what was there', mounted(shell, 'doing').includes('slot.swap') && JSON.stringify(answerCard()['steps']).includes('"opened":true') && !JSON.stringify(answerCard()['steps']).includes('"done":true') && mounted(shell, 'when').includes('weather.radar'));
  check('nothing was submitted: the headliner is where she was', (await world.sql(`SELECT stage_id FROM slots WHERE act_id = $1`, [headliner]))[0]?.['stage_id'] === 'stage_main');
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ i. a changed line aborts it ═════════════════════════
  controls.latencyMs = 1500;
  await world.typeLine(OP, WARN);
  const running = await waitFor(() => lastRun()?.status === 'running', HANDOFF_IDLE_MS + 1500);
  const abortedRun = lastRun()?.run;
  check('a run is out, and the card says so', running && mounted(shell, 'assist').join() === 'assist.answer' && answerCard()['status'] === 'running');
  const rowsBeforeAbort = (await threadRows()).length;
  world.keystroke(OP, `${WARN} p`);
  await settle(2);
  const torn = world.runsOf(OP).find((record) => record.run === abortedRun);
  check(`A RUN BELONGS TO THE TEXT IT STARTED WITH: one more character tears it down mid-request (${torn?.status}: ${torn?.reason}) — and the card goes with it, at once`, torn?.status === 'aborted' && mounted(shell, 'assist').length === 0);
  await world.typeLine(OP, 'w');
  await new Promise((resolve) => setTimeout(resolve, 1800));
  await world.settled(OP);
  const after = world.runsOf(OP).find((record) => record.run === abortedRun);
  check('...and long after its latency it has written nothing and mounted nothing', after?.status === 'aborted' && after.fieldsWritten.length === 0 && after.cardsMounted.length === 0);
  check('ABORTED IS AN OUTCOME: the question stays in the thread, and no partial answer joins it', (await threadRows()).length === rowsBeforeAbort && (await threadRows()).at(-1)?.['role'] === 'operator' && (await threadRows()).at(-1)?.['body'] === WARN);
  check('...and what it spent was still recorded, as aborted', world.booted.spent().some((spent) => spent.label === 'sentence:aborted' && spent.outcome === 'failed'));
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ j. admission rejects whole ══════════════════════════
  controls.latencyMs = 0;
  controls.script = () => ({ answer: { response: 'One good field, one invented row.', data: { fields: [{ card: 'push.compose', field: 'body', text: 'SHOULD NEVER LAND' }], canvases: { doing: [{ actionId: 'slot.swap', input: { actId: 'act_made_up' } }] } } } });
  await world.typeLine(OP, WARN);
  await world.settled(OP);
  check(`a row id nobody handed it fails the run (${lastRun()?.status}, after ${lastRun()?.outputRetries} corrections): ${String(lastRun()?.reason).slice(0, 90)}…`, lastRun()?.status === 'failed' && String(lastRun()?.reason).includes('actId'));
  check('...WHOLE: the valid field beside it was not written', body() === WARN && lastRun()?.fieldsWritten.length === 0);
  check(`...nothing was mounted, and the card says so in one plain sentence: "${String(answerCard()['plain'])}"`, !mounted(shell, 'doing').includes('slot.swap') && answerCard()['status'] === 'failed' && String(answerCard()['plain']).startsWith('That did not work') && answerCard()['answer'] === '');
  controls.script = () => ({ answer: { response: 'An action nobody offered.', data: { canvases: { doing: [{ actionId: 'gate.toggle', input: {} }] } } } });
  const storedBeforeEnter = (await threadRows()).filter((row) => row['role'] === 'operator' && row['body'] === WARN).length;
  world.dispatchOn(OP, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  await settle(4);
  await world.settled(OP);
  check('an action outside what it was offered fails the run, and mounts nothing', lastRun()?.startedBy === 'enter' && lastRun()?.status === 'failed' && String(lastRun()?.reason).includes('gate.toggle') && mounted(shell, 'doing').join() === 'push.compose');
  check('...and asking the SAME sentence again is one question: its line is not stored twice', (await threadRows()).filter((row) => row['role'] === 'operator' && row['body'] === WARN).length === storedBeforeEnter);
  controls.script = (turn) => (turn.corrections.length === 0 ? { answer: { response: 'BAD ATTEMPT — opening a form for an act nobody offered.', data: { canvases: { doing: [{ actionId: 'slot.swap', input: { actId: 'act_made_up' } }] } } } } : defaultScript(turn));
  world.dispatchOn(OP, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  await settle(4);
  await world.settled(OP);
  check(`a rejected attempt is CORRECTED inside the run — the model is told why, tools still warm (${lastRun()?.status}, ${lastRun()?.outputRetries} correction, ${lastRun()?.modelSteps} model steps)`, lastRun()?.status === 'landed' && lastRun()?.outputRetries === 1 && lastRun()?.modelSteps === 2);
  check('...and the correction quoted the admission rule’s own reason', controls.seen.at(-1)?.messages.some((message) => message.role === 'system' && message.content.startsWith('Your output was invalid') && message.content.includes('actId')) === true);
  check('...the rejected attempt is DISCARDED: not on the card, not in the thread', !String(answerCard()['answer']).includes('BAD ATTEMPT') && String(answerCard()['answer']).startsWith('Drafted') && !(await threadRows()).some((row) => String(row['body']).includes('BAD ATTEMPT')));
  controls.script = undefined;
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ k. a new thread ═════════════════════════════════════
  await world.typeLine(OP, GOING_ON);
  await world.settled(OP);
  const breaksBefore = (await threadRows()).filter((row) => row['role'] === 'break').length;
  check(`the thread never reset by itself: this run carried ${lastRun()?.threadMessages} messages of it, and the rail lists ${railEntries().length} earlier turns`, (lastRun()?.threadMessages ?? 0) >= 6 && railEntries().length >= 4);
  world.dispatchOn(OP, 'rail', { type: 'ui:click', ref: 'newThread' });
  await settle(8);
  await world.settled(OP);
  check('the operator presses "new thread": a row, like every other write — and the rail is reloaded from the rows: empty', (await threadRows()).filter((row) => row['role'] === 'break').length === breaksBefore + 1 && railEntries().length === 0);
  await world.typeLine(OP, '');
  await world.typeLine(OP, FREE);
  await world.settled(OP);
  check('the next run starts from nothing — and the old turns are still rows, only no longer this conversation', lastRun()?.status === 'landed' && lastRun()?.threadMessages === 0 && (await threadRows()).length > 10);
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ l. the narrower principal ═══════════════════════════
  const liaison = await world.login(LIAISON_PRINCIPAL);
  await settle();
  controls.seen.length = 0;
  await world.typeLine(LIAISON_PRINCIPAL, GOING_ON);
  await world.settled(LIAISON_PRINCIPAL);
  const liaisonRun = lastRun(LIAISON_PRINCIPAL);
  const liaisonAsked = new Set(world.passesOf(LIAISON_PRINCIPAL).flatMap((pass) => pass.questionNames));
  check(`the liaison’s run landed (${liaisonRun?.status}) over THEIR catalog: ${liaisonRun?.narrowed.join(', ')}`, liaisonRun?.status === 'landed' && liaisonRun.narrowed.length > 0 && !liaisonRun.narrowed.includes('slot.swap'));
  check('the narrowed catalog handed to the assistant never contains what they do not hold', controls.seen.length > 0 && controls.seen.every((request) => (handedIn(request)?.actions ?? []).every((line) => !['slot.swap', 'set.delay', 'act.card', 'lineup.timeline', 'situation.now', 'incident.feed'].some((id) => line.startsWith(`${id} `)))));
  check('context they cannot read was never a question — the overview and the incident log least of all', liaisonAsked.has('context/sales') && liaisonAsked.has('context/attendance') && !['context/lineup', 'context/weather', 'context/capacities', 'context/situation', 'context/incidents'].some((name) => liaisonAsked.has(name)));
  check('THEIR thread is theirs: not one of the operator’s many turns reached their assistant', liaisonRun?.threadMessages === 0 && (await threadRows(LIAISON_PRINCIPAL)).every((row) => row['body'] !== WARN && row['body'] !== MOVE));
  controls.script = () => ({ answer: { response: 'Move the headliner.', data: { steps: [{ say: 'Move the headliner', actionId: 'slot.swap', input: {} }] } } });
  world.dispatchOn(LIAISON_PRINCIPAL, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  await waitFor(() => lastRun(LIAISON_PRINCIPAL)?.run !== liaisonRun?.run && lastRun(LIAISON_PRINCIPAL)?.status !== 'running', 1500);
  await world.settled(LIAISON_PRINCIPAL);
  check('an assistant that ASKS for the swap on their behalf is rejected by their admission rule', lastRun(LIAISON_PRINCIPAL)?.status === 'failed' && !mounted(liaison, 'doing').includes('slot.swap'));
  controls.script = undefined;

  const liaisonSession = world.booted.intent.sessionOf(LIAISON_PRINCIPAL);
  if (liaisonSession === undefined) throw new Error('assistant-check: the liaison has no session');
  let liaisonWire = 0;
  const liaisonTools = createReadTools({ wire: (url, init) => { liaisonWire += 1; return liaisonSession.wire(url, init); }, policy: liaisonSession.policy, entries: ENTRIES });
  const liaisonListed = readableQueries({ policy: liaisonSession.policy, entries: ENTRIES }).map((query) => query.fingerprint);
  check(`the liaison’s allow-set DERIVES from their policy: ${liaisonListed.length} reads against the operator’s ${listed.queries.length}`, liaisonListed.length > 0 && liaisonListed.length < listed.queries.length && !liaisonListed.includes('lineup/forDay'));
  const liaisonLineup = RefusedSchema.safeParse(await toolNamed(liaisonTools, 'query').config.execute({ fingerprint: 'lineup/forDay', context: { day: 'sat' } }, toolContext()));
  check('...the running order is refused to them BEFORE the wire — never asked of the engine at all', liaisonLineup.success && liaisonWire === 0);
  const liaisonSales = RowsSchema.safeParse(await toolNamed(liaisonTools, 'query').config.execute({ fingerprint: 'sales/dayTotals', context: { day: 'sat' } }, toolContext()));
  check('...and what they may read, they read', liaisonSales.success && liaisonSales.data.rows.length > 0 && liaisonWire === 1);

  // ═══ m. every run was recorded; every run left a trace ═══
  const allRuns = [...world.runsOf(OP), ...world.runsOf(LIAISON_PRINCIPAL)];
  const spent = world.booted.spent();
  check(`EVERY run reached the manifest’s \`runs\` sink, on every branch (${spent.length} of ${allRuns.length}: ${[...new Set(spent.map((run) => run.label))].join(', ')})`, spent.length === allRuns.length && ['sentence:landed', 'sentence:aborted', 'sentence:failed'].every((label) => spent.some((run) => run.label === label)));
  check('...stamped by moss with who and which shell', spent.every((run) => run.principal !== null && run.shellId !== '' && run.agentId === 'encore.agent'));
  const traceFiles = await readdir(traceDir);
  const TraceSchema = z.object({ runId: z.string(), status: z.string(), prompt: z.array(z.unknown()).min(STATIC_BLOCKS + 2), events: z.array(z.object({ type: z.string() }).loose()).min(3), rawReply: z.array(z.string()), transcript: z.array(z.unknown()) }).loose();
  const firstTrace = TraceSchema.safeParse(JSON.parse(await readFile(join(traceDir, traceFiles.sort()[0] ?? ''), 'utf8')));
  check(`ENCORE_TRACE_DIR holds one JSON per run that reached the model (${traceFiles.length} files): the assembled prompt, every event, the raw reply`, traceFiles.length > 10 && traceFiles.length <= allRuns.length && firstTrace.success && firstTrace.data.events.some((event) => event.type === 'run-end'));
  const countsAfter = await world.tableCounts();
  const grew = Object.keys(countsAfter).filter((table) => countsAfter[table] !== countsBefore[table]);
  check(`no run in this suite wrote a row anywhere but the thread (${allRuns.length} runs; tables that changed: ${grew.join(', ')})`, grew.join() === 'agent_turns');
  console.log(`\n       model steps per run, this suite: ${allRuns.map((run) => run.modelSteps).join(' ')}  (${allRuns.length} runs, ${allRuns.reduce((sum, run) => sum + run.modelSteps, 0)} steps)`);

  // ═══ n. no assistant ═════════════════════════════════════
  const off = await createWorld({ agent: { kind: 'off' } });
  const offShell = await off.login(OP);
  await settle();
  await off.typeLine(OP, WARN);
  off.dispatchOn(OP, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  await new Promise((resolve) => setTimeout(resolve, HANDOFF_IDLE_MS + 400));
  await off.settled(OP);
  check('with no assistant nothing runs — not on a quiet line, not on Enter — and no answer card is mounted', off.runsOf(OP).length === 0 && mounted(offShell, 'assist').length === 0 && off.booted.spent().length === 0);
  check('...and the form keeps the operator’s own sentence', cardData(offShell, 'doing', 'push.compose')['body'] === WARN);
  await off.typeLine(OP, GOING_ON);
  await off.settled(OP);
  await off.typeLine(OP, '');
  await off.settled(OP);
  const offRows = await off.sql('SELECT role, body, detail FROM agent_turns WHERE principal = $1 ORDER BY seq', [OP]);
  check(`TURNS ARE STILL RECORDED with nobody to read them (${offRows.map((row) => row['role']).join(', ')})`, offRows.map((row) => row['role']).join() === 'operator,jev,operator,jev' && offRows[0]?.['body'] === WARN && offRows[2]?.['body'] === GOING_ON);

  await rm(traceDir, { recursive: true, force: true });
  await report('assistant-check', [world, off]);
};

void main();
