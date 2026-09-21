// THE TWO-SPEEDS CHECK — Jev decides; an agent with a thread answers, writes
// and plans.
//
// Driven through a real shell with the SCRIPTED agent model (`ENCORE_AGENT=fake`
// in effect): cortex's loop, prompt assembly, tools, solid partials, envelope
// validation and correction, and signal's genuine openai-compatible adapter,
// streaming and abort are all live — only the words a model would have produced
// are scripted. The claims, in the order DESIGN.md makes them:
//
//   a. "what's going on?" — Jev alone opens the overview, the answer card rides
//      the same pass, the words stream in at most every 120 ms
//   b. the thread — a sentence Jev handled alone is a turn; a follow-up is
//      answered with it in hand; the prompt is static → thread → this turn →
//      the line; Jev is handed no history
//   c. the two read tools — allowed, refused BEFORE the wire, capped, narrower
//      for the narrower principal
//   d. only a canvas the answer names is reconciled
//   e. the contract rejects WHOLE; a rejected attempt never reaches the card
//   f. a run is abortable, a pass is not — and the same question is left alone
//   g. the operator ends a thread; nothing else does
//   i. slice 1b's write and plan, ported: touched fields are never overwritten
//   j. off is not absent: routed, traced, recorded — never run
//
// (h, the law, is its own file: law-check.)
//
// The default script never misbehaves, so (d) and (e) swap in scripts that do.
// The agent is never stubbed: every run below went through `encoreAgent.run()`.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { estimateTokens } from '@niscorp/cortex';
import type { ToolContext, ToolDefinition } from '@niscorp/cortex';
import type { FetchFn } from '@niscorp/nova';
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
import { cardData, createReporter, createWorld, mounted, settle } from './world-factory';

const GOING_ON = "what's going on?";
const MOVE = 'move the headliner to the tent at 9';
const FREE = 'is the tent free then?';
const SAME_AGAIN = 'do that for them too please';
const WARN = 'warn everyone about the storm at 9';
const PLAN = 'storm at 9 what should we do';
const PLAN_ABOUT = 'storm at 9 what should we do with the headliner';

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
  if (tool === undefined) throw new Error(`handoff-check: no tool named ${name}`);
  return tool;
};

// The blocks of an assembled prompt, by what they are.
const blocksOf = (messages: readonly { role: string; content: string }[]): { block: string; chars: number; tokens: number }[] => {
  const blockAt = messages.findIndex((message) => message.content.startsWith(PREDECISIONS_HEADING));
  // With no thread yet, the first non-system message is the line itself.
  const firstTurn = Math.min(blockAt, messages.findIndex((message) => message.role !== 'system'));
  const staticNames = ['instructions', 'tool guides', 'the contract (JSON Schema)', 'finish protocol', 'theRoom', 'howToAnswer', 'thisTurnIs'];
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
  // (Slice 2a moved the conversation off the answer card and onto the RAIL —
  // `assist.rail`, one folded line per turn, newest first. The assertions below
  // that read "the card's turns" read the rail's entries instead; what they
  // claim is unchanged: earlier turns, from rows, never the exchange on show.)
  const railEntries = (): unknown[] => { const entries = cardData(shell, 'rail', 'assist.rail')['entries']; return Array.isArray(entries) ? entries : []; };
  const lastRun = (principal = OP): ReturnType<typeof world.runsOf>[number] | undefined => world.runsOf(principal).at(-1);
  const threadRows = async (principal = OP): Promise<Record<string, unknown>[]> => world.sql('SELECT seq, role, body, detail FROM agent_turns WHERE principal = $1 ORDER BY seq', [principal]);
  // The conversation in force: everything after the last break.
  const currentThread = async (): Promise<Record<string, unknown>[]> => {
    const rows = await threadRows();
    return rows.slice(rows.map((row) => row['role'] === 'break').lastIndexOf(true) + 1);
  };
  const instancesOn = (canvas: string): string => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => `${item.definitionId}#${item.id}`).join();
  const headliner = String((await world.sql(`SELECT id FROM acts WHERE billing = 'headliner'`))[0]?.['id'] ?? '');

  // ═══ a. "what's going on?" ═══════════════════════════════
  // Every write to the card while a run is out, as the shell saw it.
  // (What the RUN writes: the words, the state, the lookups. The card's own
  // reload of its conversation is the card's, through its declared endpoint.)
  const runningWrites: number[] = [];
  let lastWritten = '';
  shell.onDataChange(({ instanceId, data }) => {
    const card = shell.getState().canvases['assist']?.stack.find((item) => item.id === instanceId);
    const written = JSON.stringify([data['status'], data['say'], data['answer'], data['lookups']]);
    if (card === undefined || written === lastWritten) return;
    lastWritten = written;
    if (data['status'] === 'running') runningWrites.push(performance.now());
  });

  controls.chunkMs = 45;
  await world.typeLine(OP, GOING_ON);
  const goingPass = world.passesOf(OP).at(-1);
  check(`JEV ALONE opens the overview, in the pass (${mounted(shell, 'nearby').join(', ')}) — no agent has been called`, mounted(shell, 'nearby').includes('situation.now') && world.runsOf(OP).length === 0 && controls.seen.length === 0);
  check(`...placed by Jev, and saying so: "${String(cardData(shell, 'nearby', 'situation.now')['placedBy'])}"`, String(cardData(shell, 'nearby', 'situation.now')['placedBy']).startsWith('jev 0.'));
  check('...and THE SAME PASS mounts assist.answer, pending', mounted(shell, 'assist').join() === 'assist.answer' && answerCard()['status'] === 'pending' && answerCard()['mode'] === 'ask');
  check(`...which says what it is waiting for: "${String(answerCard()['say'])}"`, String(answerCard()['say']).includes('about to answer'));
  check(`the route was Jev’s decision, in that pass: ${goingPass?.handoff.route} ${goingPass?.handoff.routeP} (${goingPass?.handoff.routedBy}), complete ${goingPass?.handoff.completeP}`, goingPass?.handoff.route === 'ask' && goingPass.handoff.routedBy === 'jev' && goingPass.handoff.completeP >= 0.6);
  check(`...and Jev chose the facts: ${goingPass?.handoff.packs.map((pack) => pack.id).join(', ')}`, goingPass?.handoff.packs.some((pack) => pack.id === 'situation') === true);

  await world.settled(OP);
  const goingRun = lastRun();
  check(`after the line went quiet the run landed (${goingRun?.status}, started by ${goingRun?.startedBy}, ${goingRun?.modelSteps} model step)`, goingRun?.status === 'landed' && goingRun.startedBy === 'idle' && goingRun.mode === 'ask' && goingRun.modelSteps === 1);
  check(`the answer is on the card, in words: "${String(answerCard()['answer']).slice(0, 80)}…"`, answerCard()['status'] === 'landed' && String(answerCard()['answer']).includes('situation.openIncidents') && answerCard()['answer'] === goingRun?.answer);
  // (Restated in slice 2a: "Done." is not a status. The line now says what was
  // read and how long it took, in the operator's terms.)
  check(`...and says what happened, in the operator’s terms: "${String(answerCard()['say'])}"`, String(answerCard()['say']).startsWith('read the situation') && / · \d+\.\d s$/.test(String(answerCard()['say'])) && !String(answerCard()['say']).includes('Done'));
  check('an answer in words names no canvas, so it moved no card: the overview is where Jev put it', goingRun?.canvasesNamed.length === 0 && goingRun.cardsMounted.length === 0 && mounted(shell, 'nearby').includes('situation.now'));
  const gaps = (goingRun?.answerWrites ?? []).slice(1).map((at, index) => at - (goingRun?.answerWrites[index] ?? 0));
  check(`the answer STREAMED: ${goingRun?.answerWrites.length} writes for 8 chunks at 45 ms…`, (goingRun?.answerWrites.length ?? 0) >= 2 && (goingRun?.answerWrites.length ?? 99) < 8);
  check(`...never more than one per ${ANSWER_WRITE_MS} ms (gaps: ${gaps.map((gap) => Math.round(gap)).join(', ')} ms)`, gaps.length > 0 && gaps.every((gap) => gap >= ANSWER_WRITE_MS));
  check(`...and those were the ONLY writes a run made to the card while it was out (${runningWrites.length} seen by the shell: the run starting + ${goingRun?.answerWrites.length})`, runningWrites.length === (goingRun?.answerWrites.length ?? 0) + 1);
  const goingRequest = controls.seen.at(-1);
  const goingHanded = handedIn(goingRequest);
  check('the agent was handed the sentence, the facts Jev chose — and the rows the overview card shows', goingHanded?.sentence === GOING_ON && goingHanded.mode === 'ask' && Object.keys(goingHanded.facts).includes('situation') && JSON.stringify(goingHanded.facts['situation']).includes('openIncidents'));
  check(`...SCREEN says what is up (${goingHanded?.screen.map((card) => card.card).join(', ')})`, goingHanded?.screen.some((card) => card.card === 'situation.now' && card.canvas === 'nearby') === true);
  check(`...and a NARROWED catalog, ONE LINE EACH, not JSON Schema (${goingHanded?.actions.length} of ${Object.keys(CANVAS_PLACEMENT).length})`, (goingHanded?.actions.length ?? 99) <= 6 && goingHanded?.actions.every((line) => !line.includes('"properties"') && !line.includes('\n')) === true && goingHanded?.actions.some((line) => line.startsWith('situation.now [nearby] Right now — ')) === true);
  check('Groq’s settings ride every request: temperature 0, reasoning effort medium', goingRequest?.params['temperature'] === 0 && goingRequest.params['reasoning_effort'] === 'medium');
  check(`...two tools, both reads, and no exit tool — the envelope rides the content channel (${goingRun?.strategy})`, goingRequest?.tools.join() === 'list_queries,query' && goingRun?.strategy === 'emit');
  controls.chunkMs = 0;

  const trace = cardData(shell, 'trace', 'intent.trace');
  const traceText = JSON.stringify([trace['handoff'], trace['run']]);
  check('the trace shows BOTH clocks: the pass…', typeof trace['totalMs'] === 'number' && typeof trace['questions'] === 'number' && traceText.includes('"route"') && traceText.includes('ask'));
  check('...and the run: provider, model, status, ms, steps, tokens, packs', ['landed', 'fake', 'encore-scripted-2', 'run ms', 'model steps', 'tokens in/out', 'packs sent', 'situation'].every((word) => traceText.includes(word)));
  check('...with token counts from the provider’s usage frame, and said to be', (goingRun?.inputTokens ?? 0) > 0 && (goingRun?.outputTokens ?? 0) > 0 && goingRun?.usageReported === true);
  printBlocks(`assembled prompt — "${GOING_ON}" (no thread yet)`, goingRequest?.messages ?? []);

  // FIX: a new sentence is a new room, and the trace is about the sentence on
  // the line. The last sentence's run row used to stay up.
  await world.typeLine(OP, 'bar sales today');
  check('a new sentence clears the previous sentence’s run row from the trace', JSON.stringify(cardData(shell, 'trace', 'intent.trace')['run']) === JSON.stringify([{ label: 'run', value: 'none yet' }]));
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ g (first half). a thread is ended by the operator ═══
  // Done here so the thread below starts clean, and asserted properly in (g).
  await loop?.newThread();

  // ═══ b. the thread ═══════════════════════════════════════
  const runsBeforeMove = world.runsOf(OP).length;
  const stepsBeforeMove = controls.seen.length;
  await world.typeLine(OP, MOVE);
  await world.settled(OP);
  const movePass = world.passesOf(OP).at(-1);
  check(`"${MOVE}" is Jev’s alone: route ${movePass?.handoff.route}, the form up and aimed, no answer card`, movePass?.handoff.route === 'direct' && cardData(shell, 'doing', 'slot.swap')['actId'] === headliner && mounted(shell, 'assist').length === 0);
  check('...it SETTLED, and no run was started for it', world.runsOf(OP).length === runsBeforeMove && controls.seen.length === stepsBeforeMove);

  await world.typeLine(OP, FREE);
  const freePass = world.passesOf(OP).at(-1);
  await world.settled(OP);
  const afterMove = await threadRows();
  const moveTurn = afterMove.filter((row) => row['body'] === MOVE);
  const cardsOnly = afterMove.find((row) => row['role'] === 'jev');
  check('leaving that sentence made it a TURN — recorded with no run', moveTurn.length === 1 && moveTurn[0]?.['role'] === 'operator' && String(moveTurn[0]?.['detail']).includes('"run":false'));
  check(`...with what the fast speed made of it, as one compact line: "${String(cardsOnly?.['body']).slice(0, 110)}…"`, String(cardsOnly?.['body']).startsWith(CARDS_ONLY) && String(cardsOnly?.['body']).includes('slot.swap') && String(cardsOnly?.['body']).includes(headliner) && String(cardsOnly?.['body']).includes('time=21:00'));
  check('...the route, the rows it resolved and what each card was aimed at, as data', String(cardsOnly?.['detail']).includes('"route":"direct"') && String(cardsOnly?.['detail']).includes(headliner) && String(cardsOnly?.['detail']).includes('"aimedAt"'));

  const freeRun = lastRun();
  const freeRequest = controls.seen.at(-1);
  const freeFirst = controls.seen.at(-2);
  check(`"${FREE}" is a question (route ${freePass?.handoff.route}) and ran: ${freeRun?.status}, ${freeRun?.modelSteps} model steps`, freePass?.handoff.route === 'ask' && freeRun?.status === 'landed' && freeRun.modelSteps === 2);
  check('THE RUN’S INPUT CONTAINS THE EARLIER TURN: the sentence Jev handled alone, and what came of it', freeFirst?.messages.some((message) => message.role === 'user' && message.content === MOVE) === true && freeFirst.messages.some((message) => message.role === 'assistant' && message.content.startsWith(CARDS_ONLY) && message.content.includes('slot.swap')) === true && freeRun?.threadMessages === 2);
  check(`...and the agent used it: "${String(answerCard()['answer']).slice(-90)}"`, String(answerCard()['answer']).includes('Earlier in this conversation: 2 message(s)'));
  const conversation = await currentThread();
  check('the operator’s line was stored BEFORE the run, the answer after it landed', conversation.map((row) => row['role']).join() === 'operator,jev,operator,agent' && conversation[2]?.['body'] === FREE && conversation[3]?.['body'] === freeRun?.answer && String(conversation[2]?.['detail']).includes('"run":true'));
  check(`the rail lists the EARLIER turns, read from those rows — not the exchange being shown (${railEntries().length})`, railEntries().length === 1 && JSON.stringify(railEntries()).includes(MOVE) && !JSON.stringify(railEntries()).includes(FREE));

  // (Restated 2026-09-21, the surface: what was looked up is LAYER THREE, so the
  // card's rendering is read with x-ray on; the rail is the app's and is read as is.)
  await world.xray(OP);
  const servedCard = world.servedTo(OP).filter((message) => message.includes('"definitionId":"assist.answer"')).at(-1) ?? '';
  await world.xray(OP);
  const servedRail = world.servedTo(OP).filter((message) => message.includes('"definitionId":"assist.rail"')).at(-1) ?? '';
  check('...and that is what the terminal was SERVED: the earlier turn and the one control that ends a thread on the rail, the answer and what was looked up on the card', servedRail.includes(MOVE) && servedRail.includes('"label":"new thread"') && servedCard.includes('looked up') && servedCard.includes('lineup/forDay'));

  // The prompt, asserted with `agent.preview()` — same assembly as a run.
  const session = world.booted.intent.sessionOf(OP);
  const llm = world.booted.agent.llm;
  const input = loop?.lastAgentInput();
  if (session === undefined || llm === undefined || input === undefined) throw new Error('handoff-check: no session, model or run input to preview');
  const tools = createReadTools({ wire: session.wire, policy: session.policy, entries: ENTRIES });
  const preview = await encoreAgent.preview(input.input, { llm, tools, deps: { mode: input.mode } });
  const roles = preview.messages.map((message) => message.role);
  const firstTurn = roles.findIndex((role) => role !== 'system');
  const contentOf = (index: number): string => { const content = preview.messages.at(index)?.content; return typeof content === 'string' ? content : ''; };
  check(`preview(): ${firstTurn} static blocks FIRST, all system (${preview.messages.length} messages, ~${preview.estimatedTokens} tokens, ${preview.strategy})`, firstTurn === 7 && roles.slice(0, firstTurn).every((role) => role === 'system') && contentOf(0).startsWith('You are the second, slower mind') && contentOf(1).startsWith('TOOL GUIDES') && contentOf(3).startsWith('FINISH PROTOCOL') && contentOf(6).startsWith('THIS TURN:'));
  check('...then THE THREAD, as the conversation it was', roles.slice(firstTurn, -2).join() === 'user,assistant' && contentOf(firstTurn) === MOVE);
  check('...then THIS TURN’S PRE-DECISIONS, as a system message', roles.at(-2) === 'system' && contentOf(-2).startsWith(PREDECISIONS_HEADING));
  check('...then the operator’s line, last', roles.at(-1) === 'user' && contentOf(-1) === FREE);
  check('...and it IS what the run sent: the preview and the first request are the same messages', JSON.stringify(preview.messages.map((message) => message.content)) === JSON.stringify(freeFirst?.messages.map((message) => message.content)));
  check('the static blocks are byte-identical to the previous turn’s — the prefix a provider caches', JSON.stringify(goingRequest?.messages.slice(0, 7)) === JSON.stringify(freeFirst?.messages.slice(0, 7)));

  // Jev is handed one sentence and nothing before it.
  const jevBodies = world.booted.decider.fakeSeen?.() ?? [];
  const lastJev = jevBodies.at(-1) ?? '';
  const JevRequest = z.object({ state: z.object({ line: z.string(), heard: z.record(z.string(), z.unknown()) }).strict() }).loose();
  const jevParsed = JevRequest.safeParse(JSON.parse(lastJev));
  check('JEV IS NEVER HANDED HISTORY: its state is the line and what the parser heard in it — those two keys, nothing else', jevParsed.success && jevParsed.data.state.line === FREE);
  check('...and no request it was sent for this sentence mentions the last one, or the thread', jevBodies.filter((text) => text.includes('"line":"is the tent')).length > 0 && jevBodies.filter((text) => text.includes('"line":"is the tent')).every((text) => !text.includes('headliner to the tent') && !text.includes(CARDS_ONLY) && !text.includes('agent_turns')));

  // A follow-up Jev can make nothing of: the COMPUTED route.
  await world.typeLine(OP, SAME_AGAIN);
  const samePass = world.passesOf(OP).at(-1);
  check(`"${SAME_AGAIN}" — Jev recognises nothing (${Object.values(mounted(shell, 'doing')).length + mounted(shell, 'nearby').length} cards) and says direct; the route is COMPUTED: ${samePass?.handoff.route} (${samePass?.handoff.routedBy}: ${samePass?.handoff.computedWhy})`, samePass?.handoff.route === 'ask' && samePass.handoff.routedBy === 'computed' && samePass.handoff.computedWhy !== '');
  check('...and the same pass promises an answer for it', answerCard()['status'] === 'pending' && answerCard()['mode'] === 'ask');
  check('...so the empty room does not also say "nothing answers that": an answer is on its way', cardData(shell, 'maybe', 'intent.options')['say'] === '');
  await world.settled(OP);
  check(`...which the agent gives with the whole conversation in hand (${lastRun()?.threadMessages} messages of thread, routed by ${lastRun()?.routedBy})`, lastRun()?.status === 'landed' && lastRun()?.routedBy === 'computed' && lastRun()?.threadMessages === 4);
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ c. the two read tools ═══════════════════════════════
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
  const lineup = RowsSchema.safeParse(await toolNamed(opTools, 'query').config.execute({ fingerprint: 'lineup/forDay', context: '{"day":"sat"}' }, toolContext()));
  check(`query replays an allowed fingerprint over the session’s wire, as the operator (${lineup.success ? lineup.data.rows.length : 0} rows, ${wireCalls} request)`, lineup.success && lineup.data.rows.length > 0 && wireCalls === 1);
  const swapRefusal = RefusedSchema.safeParse(await toolNamed(opTools, 'query').config.execute({ fingerprint: 'slots/swap', context: `{"actId":"${headliner}"}` }, toolContext()));
  check(`a MUTATION is refused before the wire: "${swapRefusal.success ? swapRefusal.data.refused.slice(0, 60) : ''}…"`, swapRefusal.success && swapRefusal.data.refused.includes('changes data') && wireCalls === 1);
  const madeUp = RefusedSchema.safeParse(await toolNamed(opTools, 'query').config.execute({ fingerprint: 'acts/everything', context: null }, toolContext()));
  check('a fingerprint that does not exist is refused before the wire, and told where to look', madeUp.success && madeUp.data.refused.includes('list_queries') && wireCalls === 1);
  const badContext = RefusedSchema.safeParse(await toolNamed(opTools, 'query').config.execute({ fingerprint: 'lineup/forDay', context: 'day=sat' }, toolContext()));
  check('a context that is not a JSON object is refused before the wire — the refusal is the tool’s ANSWER, not a throw', badContext.success && wireCalls === 1);
  const manyRows: FetchFn = async () => ({ ok: true, status: 200, json: async () => Array.from({ length: 300 }, (_, index) => ({ id: index })), text: async () => '' });
  const cappedRows = RowsSchema.parse(await toolNamed(createReadTools({ wire: manyRows, policy: session.policy, entries: ENTRIES }), 'query').config.execute({ fingerprint: 'lineup/forDay', context: '{"day":"sat"}' }, toolContext()));
  check(`the answer is CAPPED (${cappedRows.rows.length} of 300 rows), and says what it left out`, cappedRows.rows.length === QUERY_MAX_ROWS && String(cappedRows.note).includes('260'));

  // ═══ d. only a canvas the answer names ═══════════════════
  // Jev puts the radar on `when` and the overview on `nearby`. The scripted
  // answer names `when` (empty: close what is there) and `doing` (one form) —
  // and says nothing about `nearby`.
  controls.script = () => ({
    answer: {
      response: 'The storm is the thing to tell people about. I cleared the radar and opened the push form.',
      data: { canvases: { when: [], doing: [{ actionId: 'push.compose', input: { audience: 'everyone' } }] } },
    },
  });
  const STORM_ASK = 'what is going on with the storm at 9?';
  await world.typeLine(OP, STORM_ASK);
  const nearbyBefore = instancesOn('nearby');
  const aboutBefore = instancesOn('about');
  check(`Jev arranged the room first: when ${mounted(shell, 'when').join(', ')} · nearby ${mounted(shell, 'nearby').join(', ')}`, mounted(shell, 'when').includes('weather.radar') && mounted(shell, 'nearby').length > 0 && !mounted(shell, 'doing').includes('push.compose'));
  await world.settled(OP);
  const namedRun = lastRun();
  check(`the answer landed naming two canvases (${namedRun?.canvasesNamed.join(', ')})`, namedRun?.status === 'landed' && [...namedRun.canvasesNamed].sort().join() === 'doing,when');
  // Restated 2026-09-21 from the real model. These two used to assert atrium's
  // rule — a named canvas's omissions come down and are held down. With two
  // placers that let 120b close the running order Jev had at 0.88 while citing
  // it. The agent adds and aims; only Jev closes.
  check('...naming `when` with NOTHING in it closes nothing: what Jev mounted there still stands', [...mounted(shell, 'when')].sort().join() === 'lineup.timeline,weather.radar' && (namedRun?.cardsClosed ?? []).length === 0);
  // (Restated 2026-09-21, scene 4: the sentence loop's `suppressed` list was removed
  // as dead code once "the agent adds and aims; only Jev closes" landed — nothing
  // could populate it. What it stood for is asserted by what is ON SCREEN after
  // the pass that followed: both of Jev's cards, still up.)
  check('...and nothing is held down against Jev’s judgement afterwards: the pass that followed kept both of its cards', [...mounted(shell, 'when')].sort().join() === 'lineup.timeline,weather.radar');
  const pushInstance = shell.getState().canvases['doing']?.stack.find((item) => item.definitionId === 'push.compose');
  check(`...\`doing\` got the form, opened with what the answer gave it, tagged "${String(cardData(shell, 'doing', 'push.compose')['placedBy'])}"`, pushInstance !== undefined && shell.originOf(pushInstance.id) === 'assist' && cardData(shell, 'doing', 'push.compose')['audience'] === 'everyone' && cardData(shell, 'doing', 'push.compose')['placedBy'] === 'scripted');
  check('A CANVAS IT DID NOT NAME WAS NOT TOUCHED: `nearby` and `about` hold the very same instances', instancesOn('nearby') === nearbyBefore && nearbyBefore !== '' && instancesOn('about') === aboutBefore);
  await world.typeLine(OP, `${STORM_ASK} `);
  await world.typeLine(OP, 'bar sales today');
  check('a new sentence lets go of all of it: nothing pinned, nothing the answer gave a card remembered', loop?.holding().pinned.length === 0 && loop.holding().given.length === 0); // (restated 2026-09-21 with the line above: `suppressed` no longer exists; `given` is the other thing a sentence holds)
  await world.typeLine(OP, '');
  await world.settled(OP);
  controls.script = undefined;

  // ═══ i. slice 1b, ported: WRITE ══════════════════════════
  controls.seen.length = 0;
  await world.typeLine(OP, WARN);
  const warnPass = world.passesOf(OP).at(-1);
  check(`the pass mounts the push form at once (${mounted(shell, 'doing').join(', ')})`, mounted(shell, 'doing').includes('push.compose'));
  check('...its body the operator’s own sentence — Jev writes no strings', body() === WARN);
  check('...and THE SAME PASS mounts assist.answer, pending, to write', mounted(shell, 'assist').join() === 'assist.answer' && answerCard()['status'] === 'pending' && answerCard()['mode'] === 'write');
  check(`...which says what it is waiting for: "${String(answerCard()['say'])}"`, String(answerCard()['say']).includes('write the words'));
  check('...before any agent has been called', controls.seen.length === 0);
  check(`the handoff was Jev’s decision, in that pass: route ${warnPass?.handoff.route} ${warnPass?.handoff.routeP}, complete ${warnPass?.handoff.completeP}`, warnPass?.handoff.route === 'write' && (warnPass?.handoff.completeP ?? 0) >= 0.6);
  check('...asked as questions beside the cards — no second decide()', ['handoff/route', 'handoff/complete', 'context/situation', 'context/incidents', 'context/attendance', 'context/lineup', 'context/weather', 'context/capacities', 'context/sales'].every((name) => warnPass?.questionNames.includes(name) === true));
  check(`...and Jev chose the context: ${warnPass?.handoff.packs.map((pack) => pack.id).join(', ')}`, warnPass?.handoff.packs.some((pack) => pack.id === 'weather') === true && warnPass?.handoff.packs.some((pack) => pack.id === 'sales') === false);

  await world.settled(OP);
  const warnRun = lastRun();
  check(`after the line went quiet the run landed (${warnRun?.status}, started by ${warnRun?.startedBy})`, warnRun?.status === 'landed' && warnRun.startedBy === 'idle' && warnRun.mode === 'write');
  check(`the body is now AUTHORED text: "${String(body())}"`, typeof body() === 'string' && body() !== WARN && String(body()).includes('21:00') && String(body()).includes('festival crew'));
  check('...written by the run, into that one field — and it named no canvas', warnRun?.fieldsWritten.join() === 'push.compose.body' && warnRun.cardsMounted.length === 0 && warnRun.canvasesNamed.length === 0);
  check('the card says landed, with the agent’s words to the operator', answerCard()['status'] === 'landed' && String(answerCard()['answer'] ?? '') !== '');
  check(`...and says what happened in plain words: "${String(answerCard()['say'])}"`, String(answerCard()['say']).startsWith('wrote 1 field') && String(answerCard()['say']).includes('read ') && String(answerCard()['say']).includes('I will not write over you'));

  const handed = handedIn(controls.seen.at(-1));
  check('the agent was handed the sentence and what the parser heard', handed?.sentence === WARN && handed.heard['time'] === '21:00' && handed.mode === 'write');
  check(`...the rows of the packs Jev said yes to, and only those (${Object.keys(handed?.facts ?? {}).join(', ')})`, Object.keys(handed?.facts ?? {}).includes('weather') && !Object.keys(handed?.facts ?? {}).includes('sales') && JSON.stringify(handed?.facts['weather']).includes('storm'));
  check('...and which written fields exist on screen, what each is for, and what it held', handed?.writable.length === 1 && handed.writable[0]?.card === 'push.compose' && handed.writable[0]?.field === 'body' && handed.writable[0]?.holds === WARN && handed.writable[0]?.for.includes('attendees'));

  // A later pass must not put the raw sentence back over the written message,
  // and the same question is not run twice.
  // ("please", not "now": since `attendance.now` joined the catalog, "now" is a
  // word that moves Jev's narrowed list — a genuinely different handoff, and a
  // genuinely new run. The claim here is about the SAME handoff.)
  const runsAfterWarn = world.runsOf(OP).length;
  await world.typeLine(OP, `${WARN} please`);
  await world.settled(OP);
  check('a later pass leaves the authored body alone', String(body()).includes('festival crew'));
  check('...and the same handoff is not run again', world.runsOf(OP).length === runsAfterWarn);
  await world.typeLine(OP, '');

  // ── touched fields ──
  // Edited while the run is still only PENDING: the field is not even offered.
  controls.latencyMs = 400;
  controls.seen.length = 0;
  const runsBeforeEdit = world.runsOf(OP).length;
  await world.typeLine(OP, WARN);
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'body', payload: 'MY OWN WORDS' }, 'push.compose');
  await settle(2);
  check('the operator edits the body before the run starts', body() === 'MY OWN WORDS' && world.runsOf(OP).length === runsBeforeEdit);
  await world.settled(OP);
  check(`the run landed (${lastRun()?.status}) and did NOT overwrite it`, lastRun()?.status === 'landed' && body() === 'MY OWN WORDS' && lastRun()?.fieldsWritten.length === 0);
  check('...because a touched field is not offered to the agent at all', handedIn(controls.seen.at(-1))?.writable.length === 0);
  await world.typeLine(OP, `${WARN} please`);
  await world.settled(OP);
  check('a later PASS does not overwrite it either — Slice 1’s debt, paid', body() === 'MY OWN WORDS');
  await world.typeLine(OP, '');

  // Edited MID-RUN: the field was offered, the run wrote for it, and the write
  // is dropped at the door.
  controls.seen.length = 0;
  await world.typeLine(OP, WARN);
  const midRun = await waitFor(() => lastRun()?.status === 'running' && controls.seen.length > 0, HANDOFF_IDLE_MS + 1500);
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'body', payload: 'TYPED WHILE IT RAN' }, 'push.compose');
  await world.settled(OP);
  check('edited while the run was out: offered, authored — and still not overwritten', midRun && handedIn(controls.seen.at(-1))?.writable.length === 1 && lastRun()?.status === 'landed' && body() === 'TYPED WHILE IT RAN' && lastRun()?.fieldsWritten.length === 0);
  await world.typeLine(OP, '');
  check('clearing the line takes the agent’s card with it', mounted(shell, 'assist').length === 0);

  // ═══ i. slice 1b, ported: PLAN ═══════════════════════════
  controls.latencyMs = 0;
  const runsBeforePlan = world.runsOf(OP).length;
  await world.typeLine(OP, PLAN);
  check(`"${PLAN}" → assist.answer in the same pass, as a plan`, answerCard()['status'] === 'pending' && answerCard()['mode'] === 'plan' && world.runsOf(OP).length === runsBeforePlan);
  check('...and the fast speed landed its own card meanwhile', mounted(shell, 'when').includes('weather.radar'));
  await world.settled(OP);
  const planRun = lastRun();
  const steps = stepsOn(answerCard());
  check(`the plan landed with ${planRun?.planSteps} steps, as chips on the card`, planRun?.status === 'landed' && (planRun?.planSteps ?? 0) >= 2 && steps.length === planRun?.planSteps);
  check('a plan mounts nothing by itself: its forms wait behind their steps', planRun?.cardsMounted.length === 0 && planRun.canvasesNamed.length === 0 && mounted(shell, 'doing').length === 0);

  await world.typeLine(OP, PLAN_ABOUT);
  await world.settled(OP);
  const aboutRun = lastRun();
  const aboutHanded = handedIn(controls.seen.at(-1));
  check('naming the headliner is a DIFFERENT question: a new run, with the row Jev resolved', aboutRun?.run !== planRun?.run && aboutRun?.status === 'landed' && aboutHanded?.resolved.some((row) => row.id === headliner) === true);
  const swapStep = stepsOn(answerCard()).findIndex((step) => JSON.stringify(step).includes('Move a set'));
  check(`every step points at an action from the narrowed list (${aboutRun?.narrowed.join(', ')})`, swapStep >= 0 && ['slot.swap', 'set.delay', 'push.compose'].every((id) => aboutRun?.narrowed.includes(id) === true));

  world.dispatchOn(OP, 'assist', { type: 'ui:click', ref: 'step', payload: swapStep });
  await world.settled(OP);
  const swap = cardData(shell, 'doing', 'slot.swap');
  const swapInstance = shell.getState().canvases['doing']?.stack.find((item) => item.definitionId === 'slot.swap');
  check('pressing the step mounts that form', swapInstance !== undefined);
  check('...prefilled with a row id from Jev’s candidates, and the parsed time', swap['actId'] === headliner && swap['time'] === '21:00');
  check('...placed by the same map, stamped as the agent’s', swapInstance !== undefined && shell.originOf(swapInstance.id) === 'assist');
  check(`...and TAGGED with who put it there: "${String(swap['placedBy'])}"`, swap['placedBy'] === `scripted · step ${swapStep + 1}` && String(cardData(shell, 'when', 'weather.radar')['placedBy']).startsWith('jev 0.'));
  check('...and it SURVIVES the pass that followed — the loop adopted it', mounted(shell, 'doing').includes('slot.swap') && JSON.stringify(answerCard()['steps']).includes('"opened":true') && !JSON.stringify(answerCard()['steps']).includes('"done":true')); // (slice 2a: a step is OPENED by its chip and DONE only when a person presses that form's button)
  check('...beside what was there: a step JOINS its canvas, it does not describe it', mounted(shell, 'when').includes('weather.radar'));
  check('nothing was submitted: the headliner is where she was', (await world.sql(`SELECT stage_id FROM slots WHERE act_id = $1`, [headliner]))[0]?.['stage_id'] === 'stage_main');
  await world.typeLine(OP, '');

  // ═══ f. abortable ════════════════════════════════════════
  controls.latencyMs = 1500;
  await world.typeLine(OP, WARN);
  const running = await waitFor(() => lastRun()?.status === 'running', HANDOFF_IDLE_MS + 1500);
  const abortedRun = lastRun()?.run;
  await world.typeLine(OP, `${WARN} please`);
  check('the same question, retyped a little, is LEFT RUNNING', running && lastRun()?.run === abortedRun && lastRun()?.status === 'running');

  // The sentence is BACKSPACED away under the run — still the same sentence by
  // the continuation rule (the line is a prefix of it), so the card stays; but
  // what is left asks for nothing, the handoff's signature has moved, and the
  // run is torn down. This is where an operator reads that it was dropped.
  const rowsBeforeAbort = (await threadRows()).length;
  await world.typeLine(OP, 'w');
  const torn = world.runsOf(OP).find((record) => record.run === abortedRun);
  check(`a sentence that stops asking tears the run down mid-request (${torn?.status}: ${torn?.reason})`, torn?.status === 'aborted' && answerCard()['status'] === 'aborted');
  check(`...and the card says so AT ONCE, in plain words: "${String(answerCard()['say'])}"`, String(answerCard()['say']).startsWith('Dropped') && String(answerCard()['say']).includes('sentence changed') && answerCard()['answer'] === '');
  await new Promise((resolve) => setTimeout(resolve, 1800));
  await world.settled(OP);
  const after = world.runsOf(OP).find((record) => record.run === abortedRun);
  check('...and long after its latency it has written nothing and mounted nothing', after?.status === 'aborted' && after.fieldsWritten.length === 0 && after.cardsMounted.length === 0 && world.runsOf(OP).at(-1)?.run === abortedRun);
  check('ABORTED IS AN OUTCOME: the question stays in the thread, and no partial answer joins it', (await threadRows()).length === rowsBeforeAbort && (await threadRows()).at(-1)?.['role'] === 'operator' && (await threadRows()).at(-1)?.['body'] === WARN);
  check('...and what it spent was still recorded, as aborted', world.booted.spent().some((spent) => spent.label === 'write:aborted' && spent.outcome === 'failed'));

  // TYPED OVER mid-run: a different sentence altogether. The run is aborted
  // the same way — and this time the card goes with it, because the room it
  // was reporting on is no longer the room (continuation.ts; typeover-check
  // covers the whole of that story).
  await world.typeLine(OP, WARN);
  const rerunning = await waitFor(() => lastRun()?.run !== abortedRun && lastRun()?.status === 'running', HANDOFF_IDLE_MS + 1500);
  const typedOver = lastRun()?.run;
  await world.typeLine(OP, 'bar sales today');
  const dropped = world.runsOf(OP).find((record) => record.run === typedOver);
  check(`a different sentence typed over it aborts the run too (${dropped?.status}), and takes the card away`, rerunning && dropped?.status === 'aborted' && mounted(shell, 'assist').length === 0);
  check('...while the pass that replaced it landed as passes always do', mounted(shell, 'nearby').includes('sales.chart') && !mounted(shell, 'doing').includes('push.compose'));
  await new Promise((resolve) => setTimeout(resolve, 1800));
  check('...and the aborted run never lands late', world.runsOf(OP).find((record) => record.run === typedOver)?.fieldsWritten.length === 0 && mounted(shell, 'assist').length === 0);
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ e. the contract rejects whole ═══════════════════════
  controls.latencyMs = 0;
  controls.script = () => ({
    answer: {
      response: 'One good field, one invented row.',
      data: { fields: [{ card: 'push.compose', field: 'body', text: 'SHOULD NEVER LAND' }], canvases: { doing: [{ actionId: 'slot.swap', input: { actId: 'act_made_up' } }] } },
    },
  });
  await world.typeLine(OP, WARN);
  await world.settled(OP);
  check(`a row id outside Jev’s candidates fails the run (${lastRun()?.status}, after ${lastRun()?.outputRetries} corrections): ${String(lastRun()?.reason).slice(0, 90)}…`, lastRun()?.status === 'failed' && String(lastRun()?.reason).includes('actId') && lastRun()?.outputRetries === 2);
  check('...WHOLE: the valid field beside it was not written', body() === WARN && lastRun()?.fieldsWritten.length === 0);
  check('...nothing was mounted, and the card says failed and why', !mounted(shell, 'doing').includes('slot.swap') && answerCard()['status'] === 'failed' && String(answerCard()['reason'] ?? '') !== '' && String(answerCard()['say']).startsWith('That did not work'));
  check('...the rejected attempts’ words never stayed on the card', answerCard()['answer'] === '');

  // Enter re-runs a failed question at once — no idle gate, no route needed.
  controls.script = () => ({ answer: { response: 'An action nobody offered.', data: { canvases: { doing: [{ actionId: 'gate.toggle', input: {} }] } } } });
  const beforeEnter = world.runsOf(OP).length;
  const storedBeforeEnter = (await threadRows()).filter((row) => row['role'] === 'operator' && row['body'] === WARN).length;
  const pressed = Date.now();
  world.dispatchOn(OP, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  const enterRan = await waitFor(() => world.runsOf(OP).length > beforeEnter && lastRun()?.status !== 'running', 1500);
  check(`Enter starts a run immediately (${Date.now() - pressed} ms, under the ${HANDOFF_IDLE_MS} ms idle gate)`, enterRan && lastRun()?.startedBy === 'enter' && Date.now() - pressed < HANDOFF_IDLE_MS);
  check('an action outside the narrowed list fails the run, and mounts nothing', lastRun()?.status === 'failed' && String(lastRun()?.reason).includes('gate.toggle') && mounted(shell, 'doing').join() === 'push.compose');
  await world.settled(OP);
  check('...and asking the SAME sentence again is one question: its line is not stored twice', (await threadRows()).filter((row) => row['role'] === 'operator' && row['body'] === WARN).length === storedBeforeEnter);

  controls.script = () => ({ answer: { data: { steps: [] } } });
  world.dispatchOn(OP, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  await world.settled(OP);
  check(`an envelope with no \`response\` is no answer (${lastRun()?.status}): ${String(lastRun()?.reason).slice(0, 80)}`, lastRun()?.status === 'failed' && String(lastRun()?.reason).includes('response'));

  // A rejected attempt, then a good one: the first never reaches the card.
  controls.script = (turn) =>
    turn.corrections.length === 0
      ? { answer: { response: 'BAD ATTEMPT — opening a form for an act nobody offered.', data: { canvases: { doing: [{ actionId: 'slot.swap', input: { actId: 'act_made_up' } }] } } } }
      : defaultScript(turn);
  world.dispatchOn(OP, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  await world.settled(OP);
  check(`a rejected attempt is CORRECTED inside the run — the model is told why, tools still warm (${lastRun()?.status}, ${lastRun()?.outputRetries} correction, ${lastRun()?.modelSteps} model steps)`, lastRun()?.status === 'landed' && lastRun()?.outputRetries === 1 && lastRun()?.modelSteps === 2);
  check('...and the correction quoted the admission rule’s own reason', controls.seen.at(-1)?.messages.some((message) => message.role === 'system' && message.content.startsWith('Your output was invalid') && message.content.includes('actId')) === true);
  check('...the rejected attempt is DISCARDED: not on the card, not in the thread', !String(answerCard()['answer']).includes('BAD ATTEMPT') && String(answerCard()['answer']).startsWith('Drafted') && !(await threadRows()).some((row) => String(row['body']).includes('BAD ATTEMPT')));
  controls.script = undefined;
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ g. a new thread ═════════════════════════════════════
  await world.typeLine(OP, GOING_ON);
  await world.settled(OP);
  check(`the thread never reset by itself: this run carried ${lastRun()?.threadMessages} messages of it, and the rail lists ${railEntries().length} earlier turns`, (lastRun()?.threadMessages ?? 0) >= 6 && railEntries().length >= 4);
  check('...a new sentence, a cleared line, an aborted run, a failed one — none of them ended it', (await threadRows()).filter((row) => row['role'] === 'break').length === 1);
  world.dispatchOn(OP, 'rail', { type: 'ui:click', ref: 'newThread' });
  await settle(8);
  await world.settled(OP);
  check('the operator presses "new thread": a row, like every other write', (await threadRows()).filter((row) => row['role'] === 'break').length === 2);
  check('...and the rail is reloaded from the rows: empty', railEntries().length === 0);
  await world.typeLine(OP, '');
  await world.typeLine(OP, FREE);
  await world.settled(OP);
  check('the next run starts from nothing — and the old turns are still rows, only no longer this conversation', lastRun()?.status === 'landed' && lastRun()?.threadMessages === 0 && (await threadRows()).length > 10);
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ── measured: a follow-up with a five-turn thread ──
  for (const sentence of [MOVE, GOING_ON, 'bar sales today', WARN]) {
    await world.typeLine(OP, sentence);
    await world.settled(OP);
  }
  await world.typeLine(OP, FREE);
  await world.settled(OP);
  const fiveTurns = controls.seen.at(-2);
  check(`a follow-up over a five-turn thread (${lastRun()?.threadMessages} messages) still fits one prompt`, lastRun()?.status === 'landed' && (lastRun()?.threadMessages ?? 0) >= 9);
  printBlocks(`assembled prompt — "${FREE}" after five turns`, fiveTurns?.messages ?? []);
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ the narrower principal ══════════════════════════════
  const liaison = await world.login(LIAISON_PRINCIPAL);
  await settle();
  controls.seen.length = 0;
  await world.typeLine(LIAISON_PRINCIPAL, PLAN);
  await world.settled(LIAISON_PRINCIPAL);
  const liaisonRun = lastRun(LIAISON_PRINCIPAL);
  const liaisonAsked = new Set(world.passesOf(LIAISON_PRINCIPAL).flatMap((pass) => pass.questionNames));
  check(`the liaison’s plan landed (${liaisonRun?.status}) over THEIR catalog: ${liaisonRun?.narrowed.join(', ')}`, liaisonRun?.status === 'landed' && liaisonRun.narrowed.length > 0 && !liaisonRun.narrowed.includes('slot.swap'));
  check('the narrowed catalog handed to the agent never contains what they do not hold', controls.seen.length > 0 && controls.seen.every((request) => (handedIn(request)?.actions ?? []).every((line) => !['slot.swap', 'set.delay', 'act.card', 'lineup.timeline', 'weather.radar', 'situation.now', 'incident.feed'].some((id) => line.startsWith(`${id} `)))));
  check('...and no step of their plan is for it', !JSON.stringify(cardData(liaison, 'assist', 'assist.answer')['steps'] ?? []).includes('Move a set'));
  check('context they cannot read was never a question — the overview and the incident log least of all', liaisonAsked.has('context/sales') && liaisonAsked.has('context/attendance') && !['context/lineup', 'context/weather', 'context/capacities', 'context/situation', 'context/incidents'].some((name) => liaisonAsked.has(name)));
  check('THEIR thread is theirs: two rows of their own, and not one of the operator’s many turns reached their agent', (await threadRows(LIAISON_PRINCIPAL)).map((row) => row['role']).join() === 'operator,agent' && liaisonRun?.threadMessages === 0 && controls.seen.every((request) => !request.messages.some((message) => message.content === MOVE || message.content === GOING_ON)));
  controls.script = () => ({ answer: { response: 'Move the headliner.', data: { steps: [{ say: 'Move the headliner', actionId: 'slot.swap', input: {} }] } } });
  world.dispatchOn(LIAISON_PRINCIPAL, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  await waitFor(() => lastRun(LIAISON_PRINCIPAL)?.run !== liaisonRun?.run && lastRun(LIAISON_PRINCIPAL)?.status !== 'running', 1500);
  await world.settled(LIAISON_PRINCIPAL);
  check('an agent that ASKS for the swap on their behalf is rejected by their admission rule', lastRun(LIAISON_PRINCIPAL)?.status === 'failed' && !mounted(liaison, 'doing').includes('slot.swap'));
  controls.script = undefined;

  // (c, second half) their read tools are narrower too.
  const liaisonSession = world.booted.intent.sessionOf(LIAISON_PRINCIPAL);
  if (liaisonSession === undefined) throw new Error('handoff-check: the liaison has no session');
  let liaisonWire = 0;
  const liaisonTools = createReadTools({ wire: (url, init) => { liaisonWire += 1; return liaisonSession.wire(url, init); }, policy: liaisonSession.policy, entries: ENTRIES });
  const liaisonListed = readableQueries({ policy: liaisonSession.policy, entries: ENTRIES }).map((query) => query.fingerprint);
  check(`the liaison’s allow-set DERIVES from their policy: ${liaisonListed.length} reads against the operator’s ${listed.queries.length} (${liaisonListed.join(', ')})`, liaisonListed.length > 0 && liaisonListed.length < listed.queries.length && liaisonListed.includes('sales/dayTotals') && liaisonListed.includes('attendance/byZone') && !liaisonListed.includes('lineup/forDay') && !liaisonListed.includes('incidents/open'));
  const liaisonLineup = RefusedSchema.safeParse(await toolNamed(liaisonTools, 'query').config.execute({ fingerprint: 'lineup/forDay', context: '{"day":"sat"}' }, toolContext()));
  check('...the running order is refused to them BEFORE the wire — never asked of the engine at all', liaisonLineup.success && liaisonWire === 0);
  const liaisonSales = RowsSchema.safeParse(await toolNamed(liaisonTools, 'query').config.execute({ fingerprint: 'sales/dayTotals', context: '{"day":"sat"}' }, toolContext()));
  check('...and what they may read, they read', liaisonSales.success && liaisonSales.data.rows.length > 0 && liaisonWire === 1);

  // ═══ every run was recorded; every run left a trace ══════
  const allRuns = [...world.runsOf(OP), ...world.runsOf(LIAISON_PRINCIPAL)];
  const spent = world.booted.spent();
  check(`EVERY run reached the manifest’s \`runs\` sink, on every branch (${spent.length} of ${allRuns.length}: ${[...new Set(spent.map((run) => run.label))].join(', ')})`, spent.length === allRuns.length && ['ask:landed', 'write:landed', 'plan:landed', 'write:aborted', 'write:failed'].every((label) => spent.some((run) => run.label === label)));
  check('...stamped by moss with who and which shell, carrying the whole exchange', spent.every((run) => run.principal !== null && run.shellId !== '' && run.agentId === 'encore.agent') && spent.filter((run) => run.outcome === 'ok').every((run) => (run.turns?.length ?? 0) > 8 && run.response !== undefined));
  const traceFiles = await readdir(traceDir);
  const TraceSchema = z.object({ runId: z.string(), status: z.string(), prompt: z.array(z.unknown()).min(9), events: z.array(z.object({ type: z.string() }).loose()).min(3), rawReply: z.array(z.string()), transcript: z.array(z.unknown()) }).loose();
  const firstTrace = TraceSchema.safeParse(JSON.parse(await readFile(join(traceDir, traceFiles.sort()[0] ?? ''), 'utf8')));
  check(`ENCORE_TRACE_DIR holds one JSON per run that reached the model (${traceFiles.length} files): the assembled prompt, every event, the raw reply`, traceFiles.length > 10 && traceFiles.length <= allRuns.length && firstTrace.success && firstTrace.data.events.some((event) => event.type === 'run-end') && firstTrace.data.rawReply.join('').includes('"response"'));

  // THE LAW, measured: across every run above, the only table that grew is
  // the thread.
  const countsAfter = await world.tableCounts();
  const grew = Object.keys(countsAfter).filter((table) => countsAfter[table] !== countsBefore[table]);
  check(`no run in this suite wrote a row anywhere but the thread (${allRuns.length} runs; tables that changed: ${grew.join(', ')})`, grew.join() === 'agent_turns');

  console.log(`\n       model steps per run, this suite: ${allRuns.map((run) => run.modelSteps).join(' ')}  (${allRuns.length} runs, ${allRuns.reduce((sum, run) => sum + run.modelSteps, 0)} steps)`);

  // ═══ j. off is not absent ════════════════════════════════
  const off = await createWorld({ agent: { kind: 'off' } });
  const offShell = await off.login(OP);
  await settle();
  await off.typeLine(OP, WARN);
  off.dispatchOn(OP, 'line', { type: 'ui:key', key: 'Enter', ref: 'line' });
  await new Promise((resolve) => setTimeout(resolve, HANDOFF_IDLE_MS + 400));
  await off.settled(OP);
  const offPass = off.passesOf(OP).at(-1);
  check('with the agent off the route is still DECIDED…', offPass?.handoff.route === 'write' && offPass.questionNames.includes('handoff/route') && offPass.questionNames.includes('context/weather'));
  check('...and traced, so the room says what it would have handed off', JSON.stringify(cardData(offShell, 'trace', 'intent.trace')['handoff']).includes('write') && JSON.stringify(cardData(offShell, 'trace', 'intent.trace')['run']).includes('off'));
  check('...but no run starts — not on idle, not on Enter — and no assist.answer is mounted', off.runsOf(OP).length === 0 && mounted(offShell, 'assist').length === 0 && off.booted.spent().length === 0);
  check('...and the form keeps the operator’s own sentence', cardData(offShell, 'doing', 'push.compose')['body'] === WARN);
  await off.typeLine(OP, GOING_ON);
  await off.settled(OP);
  await off.typeLine(OP, '');
  await off.settled(OP);
  const offRows = await off.sql('SELECT role, body, detail FROM agent_turns WHERE principal = $1 ORDER BY seq', [OP]);
  check(`TURNS ARE STILL RECORDED with no agent to read them (${offRows.map((row) => row['role']).join(', ')})`, offRows.map((row) => row['role']).join() === 'operator,jev,operator,jev' && offRows[0]?.['body'] === WARN && offRows[2]?.['body'] === GOING_ON);
  check(`...each saying which way it was routed, and that nothing answered: "${String(offRows[3]?.['body']).slice(-80)}"`, String(offRows[1]?.['detail']).includes('"route":"write"') && String(offRows[3]?.['detail']).includes('"route":"ask"') && String(offRows[3]?.['body']).includes('no agent was running'));

  // The traces were this check's own, in a directory it made.
  await rm(traceDir, { recursive: true, force: true });
  await report('handoff-check', [world, off]);
};

void main();
