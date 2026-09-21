import { z } from 'zod';
import { reconcileCanvas } from '@niscorp/nova';
import type { ActionDefinition, Shell } from '@niscorp/nova';
import type { FunctionSession, RunTurn } from '@niscorp/moss';
import type { Message } from '@niscorp/signal';
import { ASSIST_ANSWER_ID, THREAD_CHANNEL } from '@encore/app/actions/frame/assist-answer.action';
import { CANVAS_PLACEMENT, QUESTION_CANVASES } from '@encore/app/canvas-placement';
import { NOT_SUBMITTED, RAIL_PHRASES, SUBMITTED } from '@encore/app/rail-phrases';
import { CITE_KEY, PLACED_BY, PLACED_FRAGMENT, WHY } from '@encore/app/shell/fragments/placed.fragment';
import { ENTRIES } from '@encore/app/vex';
import type { ContextPack } from '@encore/app/vex/context-packs';
import type { FestivalClock } from '@encore/lib/festival-clock';
import { encoreAgent } from '@encore/server/agent/agent';
import type { AgentLlm } from '@encore/server/agent/llm';
import { resolvedRows, rowLines, actionLine } from '@encore/server/agent/predecisions';
import type { Predecisions } from '@encore/server/agent/predecisions';
import { runAgent, runInput } from '@encore/server/agent/run';
import type { AgentRunOutcome } from '@encore/server/agent/run';
import { createReadTools } from '@encore/server/agent/tools';
import { admitAnswer } from './admission';
import type { AdmittedCard, AnswerContext } from './admission';
import { segmentsOf, streamingSegments } from './answer-spans';
import { harvestRefs, readPacks } from './context-packs';
import { inputContractOf } from './input-contract';
import { runSummary } from './reconcile';
import { HANDOFF_AT } from './resolve';
import { CARDS_ONLY, createThread } from './thread';
import type { RailEntry, RememberedRow } from './thread';
import type { TouchTracker } from './touched';
import type { BriefRequest } from '@encore/server/watch/watch';
import type { AgentMode, CandidateSets, Handoff, Parsed, RunRecord, RunStatus } from './intent.types';

// ═══════════════════════════════════════════════════════════
// THE SLOW SPEED, for one session: the agent's manager.
//
// The fast speed decides and never waits; this is what happens to the sentences
// it could not finish — and the keeper of the thread for the ones it could. It
// owns five things:
//
//   WHEN    a sentence is SETTLED when the pacer is at rest, Jev called the
//           thought finished, and the line has been quiet for a beat since that
//           pass landed. A settled sentence routed `ask`, `write` or `plan`
//           starts a run; Enter starts one now, whatever Jev thought. Never
//           more than one run at a time.
//   WHAT    the agent is handed the thread, Jev's pre-decisions for this
//           sentence and the line (agent/run.ts) — and two read tools.
//   ABORT   a pass ALWAYS lands; a run does not. A newer pass whose handoff
//           signature differs — another route, other actions, other rows — has
//           changed what the run was FOR, and the run is torn down mid-request.
//           The card says so AT ONCE; the provider stream drains behind it.
//   APPLY   whole, or not at all, through the one admission rule. ONLY A CANVAS
//           THE ANSWER NAMES IS RECONCILED — to exactly the state it gave; every
//           other canvas stays as Jev arranged it. Words go into fields nobody
//           has touched. A plan's forms wait behind their steps. Nothing is
//           ever submitted.
//   THREAD  every settled sentence becomes a turn — including the ones Jev
//           handled alone, which is how the agent knows what was just done
//           (thread.ts).
//
// THE AGENT NEVER TOUCHES THE SHELL. Everything under src/server/agent/ is
// handed callbacks; every write to a screen is in THIS file, made by the loop,
// from an answer that was admitted first. `law-check` holds that line.
//
// Everything the operator can see of this is one card (`assist.answer`) and one
// row of the trace, both written from here.
// ═══════════════════════════════════════════════════════════

// How long the line must stay quiet, after a pass lands, before the sentence
// counts as settled. Long enough that a person pausing between words does not
// spend a run; short enough to read as "it noticed I stopped". THE constant.
export const HANDOFF_IDLE_MS = 700;

// THE ONE PLACE THIS NUMBER LIVES. A run writes to the card at most this often,
// whatever the model streams: relay measured what publishing per model event
// costs — three times the wall clock, and a stream starved into provider
// rejections (DESIGN.md § What was studied first). Midas's mechanism, at half
// its rate.
export const ANSWER_WRITE_MS = 120;

export const ASSIST_ORIGIN = 'assist';
const ASSIST_ACTION = ASSIST_ANSWER_ID;
const ASSIST_CANVAS = 'assist';
const INTENT_ORIGIN = 'intent';
const AGENT_ID = encoreAgent.agentId;

const STATUS_TONE: Record<RunStatus, string> = { pending: 'mute', running: 'accent', landed: 'good', aborted: 'warn', failed: 'alert', off: 'mute' };

// What the latest landed pass knew — the run's whole input, thread aside.
export type PassContext = {
  text: string;
  parsed: Parsed;
  candidates: CandidateSets;
  handoff: Handoff;
};

export type AssistDeps = {
  session: FunctionSession;
  agent: AgentLlm;
  clock: FestivalClock;
  definitions: Record<string, ActionDefinition>;
  // The packs this principal's policy can read (context-packs.ts).
  packs: readonly ContextPack[];
  touched: TouchTracker;
  // Where ENCORE_TRACE_DIR points, if anywhere (agent/trace-file.ts).
  traceDir?: string;
  // Hand a card to the fast speed: pin it, remember what it was opened with,
  // and let Jev fill the keys the agent left alone.
  adopt: (actionId: string, input: Record<string, unknown>, placedBy: string, why: string) => void;
  // Give cards back to the fast speed's judgement: unpin them and forget what
  // they were opened with.
  release: (actionIds: readonly string[]) => void;
  repass: () => void;
  onRun?: (principal: string | null, record: RunRecord) => void;
  // An operator's run is starting: whatever else is using the agent gives way.
  onRunStart?: () => void;
};

export type Assist = {
  enabled: boolean;
  onKeystroke: () => void;
  onPass: (context: PassContext) => void;
  // The line is still this sentence, but what is left of it asks for nothing —
  // backspaced to a letter or two, so no pass will be sent to say so. A run in
  // flight is for words that are gone; a promise of one is withdrawn.
  onNothingAsked: () => void;
  // The sentence is gone — emptied, or typed over (continuation.ts). `why` is
  // what an in-flight run is told it was dropped for.
  onClear: (why: string) => void;
  runNow: () => string;
  openStep: (index: number) => string;
  // The operator ends the thread. Nothing else ever does.
  newThread: () => Promise<string>;
  // The conversation BEFORE the exchange on the card, oldest first — rows, read
  // back through the wire every time.
  earlierTurns: () => Promise<RailEntry[]>;
  idle: () => Promise<void>;
  runs: () => readonly RunRecord[];
  // The messages the last run was started with — what a check hands to
  // `agent.preview()` to read the prompt that run sent.
  lastInput: () => { input: Message[]; mode: AgentMode } | undefined;
  recordEvent: (line: string, detail: Record<string, unknown>) => void;
  isRunOut: () => boolean;
  brief: (request: BriefRequest, abort: AbortSignal) => Promise<string | undefined>;
  traceRows: () => { label: string; value: string | number }[];
};

// A step is OPENED when its chip is pressed and DONE when a person presses that
// form's own button. Only the second ticks the plan.
type Landed = { signature: string; mode: AgentMode; steps: { say: string; card: AdmittedCard }[]; opened: Set<number>; done: Set<number> };
type Active = { id: number; controller: AbortController; record: RunRecord };
type SayDetail = { isComplete?: boolean; count?: number; reason?: string; read?: string[]; lookedUp?: number; ms?: number };

const StepIndexSchema = z.number().int().min(0);

const AIMED_MAX_CHARS = 80;

// How many of the rows a run was handed are kept on its turn for later turns to
// name. Enough for a day's running order; not a copy of the database.
const REMEMBERED_MAX = 40;

const turnsOf = (messages: readonly Message[]): RunTurn[] =>
  messages.map((message): RunTurn => {
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    if (message.role === 'assistant') return { role: 'assistant', content, ...(message.toolCalls !== undefined && message.toolCalls.length > 0 ? { calls: message.toolCalls.map((call) => ({ name: call.name, args: call.args })) } : {}) };
    if (message.role === 'tool') return { role: 'tool', content, ...(message.name !== undefined ? { name: message.name } : {}) };
    return { role: message.role, content };
  });

const charsOf = (messages: readonly Message[]): number => messages.reduce((sum, message) => sum + (typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length), 0);

export const createAssist = (deps: AssistDeps): Assist => {
  const { session, agent, touched } = deps;
  // Both halves are required: a model to run, and the card to say so on. A
  // principal whose charter withholds `assist.answer` simply has no agent.
  const enabled = agent.llm !== undefined && session.actions.includes(ASSIST_ACTION);
  const thread = createThread(session.wire);

  const records: RunRecord[] = [];
  // Runs before this index belong to sentences that are gone: the trace shows
  // the sentence on the line, not the last thing that ever ran.
  let sentenceFrom = 0;
  // How each signature's last run ended — a sentence that already has its
  // answer (or already failed) is not run again by merely being re-decided.
  const finished = new Map<string, RunStatus>();
  let latest: PassContext | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Active | undefined;
  let landed: Landed | undefined;
  let runCount = 0;
  // Has a run been started for the sentence on the line? Then the card is a
  // REPORT, and stays; before that it is only a promise, and can be withdrawn.
  let hasReported = false;
  // A sentence that settled with NO run — Jev alone, or no agent to hand it to.
  // It is a turn all the same, stored when the sentence is left: by then the
  // screen says what was opened, aimed and submitted, which at the moment of
  // settling it did not yet.
  let settledAlone: PassContext | undefined;
  // The sentence last stored as an operator turn — Enter twice is one question.
  let storedLine = '';
  let lastInput: { input: Message[]; mode: AgentMode } | undefined;
  // What the last landed WRITE was authored from, and the timer that notices it
  // has gone stale.
  let authoredFrom: { signature: string; siblings: string } | undefined;
  let reauthorTimer: ReturnType<typeof setTimeout> | undefined;
  // Form instances whose button has been pressed — so a press is recorded once.
  const submitted = new Set<string>();
  let watching: Shell | undefined;
  // The rows the last run could name (candidates, facts, thread) — kept for
  // wording a form that run opened.
  let lastTable: CandidateSets = {};
  // Cards this sentence's runs have opened — what `release` hands back.
  const opened = new Set<string>();
  // Runs still draining: an aborted run is reported at once and RECORDED when
  // its stream finally ends, because only then is what it spent known.
  const draining = new Set<Promise<void>>();
  let waiters: (() => void)[] = [];

  const settleIfIdle = (): void => {
    if (timer !== undefined || reauthorTimer !== undefined || active !== undefined || draining.size > 0) return;
    const resolvers = waiters;
    waiters = [];
    for (const resolve of resolvers) resolve();
  };

  const disarm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  // ─── the card and the trace ────────────────────────────────

  const instanceOf = (shell: Shell, canvas: string, actionId: string): string | undefined => shell.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId)?.id;

  const mergeInto = (canvas: string, actionId: string, patch: Record<string, unknown>): void => {
    const shell = session.shell;
    const instanceId = instanceOf(shell, canvas, actionId);
    const runtime = instanceId === undefined ? undefined : shell.getRuntime(instanceId);
    if (runtime !== undefined) runtime.setData({ ...runtime.getData(), ...patch });
  };

  const showCard = (patch: Record<string, unknown>): void => {
    const shell = session.shell;
    if (instanceOf(shell, ASSIST_CANVAS, ASSIST_ACTION) === undefined) reconcileCanvas(shell, ASSIST_CANVAS, [{ actionId: ASSIST_ACTION }], { origin: INTENT_ORIGIN, own: 'canvas' });
    mergeInto(ASSIST_CANVAS, ASSIST_ACTION, patch);
  };

  const hideCard = (): void => {
    reconcileCanvas(session.shell, ASSIST_CANVAS, [], { origin: INTENT_ORIGIN, own: 'canvas' });
  };

  // THE CARD SAYS WHAT IS HAPPENING, IN WORDS. A badge reading `pending` is a
  // state machine showing through; an operator wants to know whether to keep
  // typing, wait, or look elsewhere.
  const DOING: Record<AgentMode, string> = { ask: 'answer', write: 'write the words', plan: 'work out a plan' };

  const sayFor = (status: RunStatus, mode: AgentMode, detail: SayDetail): string => {
    if (status === 'pending') return detail.isComplete === true ? `That reads as finished — about to ${DOING[mode]}.` : `Waiting for you to finish the sentence, then I will ${DOING[mode]}. Enter starts now.`;
    if (status === 'running') return 'Answering…';
    // "DONE" IS NOT A STATUS. What happened, in the operator's terms: what was
    // read to say this, and how long it took — "read the running order and the
    // weather · 2.1 s". The badge already says it landed.
    if (status === 'landed') {
      const read = detail.read ?? [];
      const from = read.length === 0 ? 'from the conversation alone' : `read ${read.length === 1 ? read[0] : `${read.slice(0, -1).join(', ')} and ${read.at(-1)}`}`;
      const looked = (detail.lookedUp ?? 0) === 0 ? '' : ` · looked up ${detail.lookedUp} more`;
      const took = ` · ${((detail.ms ?? 0) / 1000).toFixed(1)} s`;
      if (mode === 'plan') return `${detail.count ?? 0} step(s), ${from}${looked}${took} — press one to open its form, filled in; nothing is submitted for you`;
      if (mode === 'write') return (detail.count ?? 0) === 0 ? `nothing on screen needed words, ${from}${took}` : `wrote ${detail.count ?? 0} field(s), ${from}${looked}${took} — edit them freely; I will not write over you`;
      return `${from}${looked}${took}`;
    }
    if (status === 'aborted') return 'Dropped — the sentence changed, so this was no longer what you were asking.';
    if (status === 'failed') return `That did not work, and nothing was changed: ${detail.reason ?? 'unknown'}`;
    return '';
  };

  // THE SAME, FOR THE APP (layer one): no timings, no counts, no reason in the
  // room's vocabulary. Empty where the answer speaks for itself.
  const plainFor = (status: RunStatus, mode: AgentMode, detail: SayDetail): string => {
    if (status === 'failed') return 'That did not work, and nothing was changed. Say it another way, or press Enter to try again.';
    if (status !== 'landed') return '';
    if (mode === 'plan') return (detail.count ?? 0) === 0 ? '' : 'Press a step to open its form, filled in. Nothing is submitted for you.';
    if (mode === 'write') return (detail.count ?? 0) === 0 ? 'Nothing on screen needed words.' : 'Edit the words freely — they will not be written over.';
    return '';
  };

  const cardFor = (status: RunStatus, mode: AgentMode, extra: Record<string, unknown> = {}, detail: SayDetail = {}): Record<string, unknown> => ({
    status,
    statusTone: STATUS_TONE[status],
    mode,
    by: agent.label,
    question: latest?.text ?? '',
    say: sayFor(status, mode, detail),
    plain: plainFor(status, mode, detail),
    answer: '',
    segments: [],
    landed: false,
    lookups: '',
    reason: '',
    notes: '',
    steps: [],
    progress: '',
    followUps: [],
    ...extra,
  });

  const traceRows = (): { label: string; value: string | number }[] => {
    if (!enabled) return [{ label: 'run', value: 'off' }];
    const last = records.slice(sentenceFrom).at(-1);
    if (last === undefined) return [{ label: 'run', value: 'none yet' }];
    return [
      { label: 'run', value: `${last.run} · ${last.status}` },
      { label: 'agent', value: `${last.provider} · ${last.model}` },
      { label: 'mode', value: `${last.mode} (${last.routedBy}, ${last.startedBy})` },
      { label: 'run ms', value: Math.round(last.ms) },
      { label: 'model steps', value: last.modelSteps },
      { label: 'tokens in/out', value: `${last.inputTokens}/${last.outputTokens}${last.usageReported ? '' : ' (estimated)'}` },
      { label: 'prompt chars', value: `${last.promptChars} (this turn ${last.predecisionChars}, thread ${last.threadMessages} msg)` },
      { label: 'packs sent', value: last.packsSent.join(', ') || 'none' },
      { label: 'looked up', value: last.lookups.join(' · ') || 'nothing' },
      { label: 'canvases named', value: last.canvasesNamed.join(', ') || 'none' },
    ];
  };

  const writeTraceRun = (): void => mergeInto('trace', 'intent.trace', { run: traceRows(), summary_run: runSummary(traceRows()) });

  const publish = (record: RunRecord): void => {
    writeTraceRun();
    deps.onRun?.(session.principal, { ...record, answerWrites: [...record.answerWrites] });
  };

  // The thread's rows changed: the card reloads them through its own endpoint.
  const threadChanged = (): void => session.shell.publish(THREAD_CHANNEL);

  // ─── what the agent is handed ──────────────────────────────

  // What is up right now, and what each card is aimed at — read off the live
  // data, so a field a person corrected by hand is reported as they left it.
  const screenNow = (): Predecisions['screen'] => {
    const shell = session.shell;
    const state = shell.getState();
    return QUESTION_CANVASES.flatMap((canvas) =>
      (state.canvases[canvas]?.stack ?? []).flatMap((item) => {
        const definition = deps.definitions[item.definitionId];
        if (definition === undefined) return [];
        const data = shell.getRuntime(item.id)?.getData() ?? {};
        const aimedAt = Object.fromEntries(
          inputContractOf(definition).fields.flatMap((field) => {
            const value = data[field.name];
            if (value === undefined || value === null || value === '') return [];
            return [[field.name, typeof value === 'string' && value.length > AIMED_MAX_CHARS ? `${value.slice(0, AIMED_MAX_CHARS)}…` : value]];
          }),
        );
        // A form somebody SUBMITTED is the most important fact on a screen.
        return [{ canvas, card: item.definitionId, aimedAt: data['saved'] === true ? { ...aimedAt, submitted: true } : aimedAt }];
      }),
    );
  };

  // Free-text fields the agent may author: `.meta({ write: true })`, on a card
  // that is on screen now, that no person has touched.
  const writableNow = (): Predecisions['writable'] => {
    const shell = session.shell;
    const state = shell.getState();
    return QUESTION_CANVASES.flatMap((canvas) =>
      (state.canvases[canvas]?.stack ?? []).flatMap((item) => {
        const definition = deps.definitions[item.definitionId];
        if (definition === undefined) return [];
        const data = shell.getRuntime(item.id)?.getData() ?? {};
        return inputContractOf(definition)
          .fields.filter((field) => field.write === true && !touched.isTouched(item.id, field.name))
          .map((field) => {
            const value = data[field.name];
            return { card: item.definitionId, field: field.name, for: field.description ?? field.name, holds: typeof value === 'string' ? value : '' };
          });
      }),
    );
  };

  const heardOf = (parsed: Parsed): Predecisions['heard'] => ({
    ...(parsed.time !== undefined ? { time: parsed.time } : {}),
    ...(parsed.hour !== undefined ? { hour: parsed.hour } : {}),
    ...(parsed.day !== undefined ? { day: parsed.day } : {}),
    ...(parsed.minutes !== undefined ? { minutes: parsed.minutes } : {}),
    ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
  });

  // ─── rows, and what cards amount to ────────────────────────

  // The row ids a card is showing, read off its live data: every string under a
  // key that names an id, anywhere in what it loaded. What a claim's `row` may
  // be when it is not one of the pass's own candidates.
  const idsIn = (value: unknown, found: Set<string>): void => {
    if (Array.isArray(value)) for (const item of value) idsIn(item, found);
    const record = z.record(z.string(), z.unknown()).safeParse(value);
    if (Array.isArray(value) || !record.success) return;
    for (const [key, inner] of Object.entries(record.data)) {
      if (typeof inner === 'string' && (key === 'id' || key.endsWith('_id') || key.endsWith('Id'))) found.add(inner);
      else idsIn(inner, found);
    }
  };

  const rowsOn = (card: string): ReadonlySet<string> => {
    const found = new Set<string>();
    const canvas = CANVAS_PLACEMENT[card];
    const instanceId = canvas === undefined ? undefined : instanceOf(session.shell, canvas, card);
    if (instanceId !== undefined) idsIn(session.shell.getRuntime(instanceId)?.getData() ?? {}, found);
    return found;
  };

  const mergeRows = (candidates: CandidateSets, extra: readonly RememberedRow[]): CandidateSets => {
    const merged: CandidateSets = Object.fromEntries(Object.entries(candidates).map(([table, rows]) => [table, [...rows]]));
    for (const row of extra) {
      const rows = merged[row.table] ?? [];
      if (!rows.some((held) => held.id === row.id)) merged[row.table] = [...rows, { id: row.id, label: row.label }];
    }
    return merged;
  };

  // A row's NAME, for a sentence a person reads: the label up to its dash. Looked
  // for among this pass's candidates, then among the rows the last run was
  // handed — a plan's form is about an act the FOLLOW-UP never retrieved.
  const nameOf = (id: string): string => {
    const rows = [...Object.values(latest?.candidates ?? {}).flat(), ...Object.values(lastTable).flat()];
    return (rows.find((row) => row.id === id)?.label ?? id).split(' — ')[0] ?? id;
  };

  // WHAT A CARD AMOUNTED TO, in the operator's terms (app/rail-phrases.ts).
  const phraseFor = (actionId: string, data: Record<string, unknown>): string | undefined => {
    const phrase = RAIL_PHRASES[actionId];
    const definition = deps.definitions[actionId];
    if (phrase === undefined || definition === undefined) return undefined;
    const refs = new Set(inputContractOf(definition).fields.flatMap((field) => (field.ref === undefined ? [] : [field.name])));
    return phrase.pieces
      .flatMap((piece) => {
        const key = /\{(\w+)\}/.exec(piece)?.[1];
        if (key === undefined) return [piece];
        const value = data[key];
        if (value === undefined || value === null || value === '') return [];
        return [piece.replace(`{${key}}`, refs.has(key) ? nameOf(String(value)) : String(value))];
      })
      .join('');
  };

  // The room, as a line of the rail: what the forms amount to, or else which
  // cards were opened.
  const railOfScreen = (): string => {
    const shell = session.shell;
    const cards = QUESTION_CANVASES.flatMap((canvas) => shell.getState().canvases[canvas]?.stack ?? []);
    const forms = cards.flatMap((item) => {
      const data = shell.getRuntime(item.id)?.getData() ?? {};
      const phrase = phraseFor(item.definitionId, data);
      return phrase === undefined ? [] : [`${phrase} · ${data['saved'] === true ? SUBMITTED : NOT_SUBMITTED}`];
    });
    if (forms.length > 0) return forms.join('; ');
    const titles = cards.map((item) => deps.definitions[item.definitionId]?.title ?? item.definitionId);
    return titles.length === 0 ? 'nothing opened' : `opened ${titles.join(', ')}`;
  };

  const stepsShown = (): { index: number; label: string; opened: boolean; done: boolean }[] =>
    (landed?.steps ?? []).map((step, index) => ({ index, label: step.say, opened: landed?.opened.has(index) === true, done: landed?.done.has(index) === true }));

  // The forms beside a written field, as the run saw them.
  const siblingsNow = (): string => JSON.stringify(screenNow().map((card) => [card.card, Object.fromEntries(Object.entries(card.aimedAt).filter(([key]) => !writableKeys(card.card).has(key)))]));
  const writableKeys = (card: string): ReadonlySet<string> => {
    const definition = deps.definitions[card];
    return new Set(definition === undefined ? [] : inputContractOf(definition).fields.flatMap((field) => (field.write === true ? [field.name] : [])));
  };

  // ─── the thread ────────────────────────────────────────────

  const aimedWords = (aimedAt: Record<string, unknown>): string => {
    const words = Object.entries(aimedAt).map(([key, value]) => (key === 'submitted' ? 'SUBMITTED' : `${key}=${String(value)}`));
    return words.length === 0 ? '' : ` (${words.join(', ')})`;
  };

  // A sentence Jev handled alone, as ONE compact line: what it opened, what
  // those cards were aimed at, which rows it took the sentence to name.
  const storeSettledAlone = (): void => {
    const context = settledAlone;
    settledAlone = undefined;
    if (context === undefined || context.text === storedLine) return;
    const screen = screenNow();
    const openedWords = screen.length === 0 ? 'Nothing was opened.' : `Opened ${screen.map((card) => `${card.card}${aimedWords(card.aimedAt)}`).join('; ')}.`;
    const rows = resolvedRows(context.handoff.entities);
    const rowWords = rows.length === 0 ? '' : ` Rows named: ${rows.map((row) => `${row.label} [${row.table}:${row.id}]`).join('; ')}.`;
    const unanswered = context.handoff.route === 'direct' ? '' : ` It was routed "${context.handoff.route}", and no agent was running, so it got no answer in words.`;
    void thread.append('operator', context.text, { route: context.handoff.route, routedBy: context.handoff.routedBy, run: false, rows });
    // `rail` is the same turn for a PERSON: "moved Nova Kestrel → The Tent,
    // 21:00 · not submitted". The body above it is the same turn for the agent.
    void thread.append('jev', `${CARDS_ONLY} ${openedWords}${rowWords}${unanswered}`, { route: context.handoff.route, resolved: rows, rows, screen, rail: railOfScreen() }).then(threadChanged);
  };

  // ─── applying a landed answer ──────────────────────────────

  // Bring ONE canvas to a described state: `cards` go up, or are re-aimed where
  // they already stand, tagged with who put them there; `standing` cards are
  // named with no input, so reconcile leaves them exactly as they are. The SAME
  // verb Jev's cards land through, and the same placement map.
  const reconcileTo = (canvas: string, cards: readonly AdmittedCard[], standing: readonly string[], placedBy: string, why: string): void => {
    const shell = session.shell;
    const described = cards.map((card) => {
      const existing = instanceOf(shell, canvas, card.actionId);
      // Tagged like every card in the room — but with the agent's name, not
      // Jev's probability: this card is here because an answer said so.
      const input = { ...card.input, [PLACED_BY]: placedBy, [CITE_KEY]: card.actionId, [WHY]: why };
      // A card already up is written only where nobody has been (touched.ts):
      // the write is recorded BEFORE it is made.
      const writing = existing === undefined ? input : touched.untouched(existing, input);
      if (existing !== undefined) touched.willWrite(existing, writing);
      return { actionId: card.actionId, input: writing, with: [PLACED_FRAGMENT] };
    });
    reconcileCanvas(shell, canvas, [...standing.map((actionId) => ({ actionId })), ...described], { origin: ASSIST_ORIGIN, own: 'canvas', definitionOf: (id) => deps.definitions[id] });

    cards.forEach((card, index) => {
      const instanceId = instanceOf(shell, canvas, card.actionId);
      const definition = deps.definitions[card.actionId];
      const writing = described[index]?.input ?? {};
      if (instanceId !== undefined && definition !== undefined) {
        touched.adopt(instanceId, definition, writing);
        touched.markAuthored(instanceId, Object.keys(writing));
      }
      // Handed to the fast speed: pinned, and Jev fills what the agent left.
      deps.adopt(card.actionId, card.input, placedBy, why);
      opened.add(card.actionId);
    });
  };

  // A plan step's card JOINS its canvas: what is there stays.
  const openBeside = (card: AdmittedCard, placedBy: string, why: string): void => {
    const standing = (session.shell.getState().canvases[card.canvas]?.stack ?? []).map((item) => item.definitionId).filter((id) => id !== card.actionId);
    reconcileTo(card.canvas, [card], standing, placedBy, why);
  };

  const apply = (answer: Extract<ReturnType<typeof admitAnswer>, { ok: true }>, record: RunRecord): void => {
    const shell = session.shell;
    for (const entry of answer.fields) {
      const canvas = CANVAS_PLACEMENT[entry.card];
      const instanceId = canvas === undefined ? undefined : instanceOf(shell, canvas, entry.card);
      // Touched since the run began: the person's words stand.
      if (instanceId === undefined || touched.isTouched(instanceId, entry.field)) continue;
      touched.willWrite(instanceId, { [entry.field]: entry.text });
      touched.markAuthored(instanceId, [entry.field]);
      const runtime = shell.getRuntime(instanceId);
      if (runtime === undefined) continue;
      runtime.setData({ ...runtime.getData(), [entry.field]: entry.text });
      record.fieldsWritten.push(`${entry.card}.${entry.field}`);
    }

    // ONLY A CANVAS THE ANSWER NAMES. Each is brought to exactly the state the
    // answer gave: what it listed goes up (or is re-aimed), what it left out
    // comes down — and is held down, or Jev would put it back a keystroke
    // later. Every other canvas is not read, not written, not mentioned.
    // THE AGENT ADDS AND AIMS; ONLY JEV CLOSES. The first version copied
    // atrium: what a named canvas's list left out came down, and was held down.
    // That is right where the agent is the only thing placing cards. Here there
    // are two placers, and on the real model it went wrong at once: asked how
    // the storm affects the lineup, 120b named `when: [weather.radar]` as
    // evidence — and so closed the running order Jev had at 0.88, in the same
    // answer that cited it ("a citation was dropped: lineup.timeline is not on
    // screen"). An omission from a slow model's list is far too weak a signal
    // to take down a card the fast model wants; what leaves the room is Jev's
    // call, on its hysteresis, 300 ms after the sentence changes.
    for (const [canvas, cards] of Object.entries(answer.canvases)) {
      record.canvasesNamed.push(canvas);
      const named = new Set(cards.map((card) => card.actionId));
      const standing = (shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.definitionId).filter((id) => !named.has(id));
      reconcileTo(canvas, cards, standing, agent.label, 'Added by the assistant as evidence for its answer.');
      record.cardsMounted.push(...cards.map((card) => card.actionId));
    }
    if (record.canvasesNamed.length > 0) deps.repass();
  };

  // ─── a run ─────────────────────────────────────────────────

  // THE MANIFEST'S `runs` SINK, ON EVERY BRANCH — landed, failed, aborted. A
  // stopped run still spent tokens, and recording only the successes
  // undercounts precisely when something is going wrong. moss has two outcomes
  // and a run has three, so the third rides the label (a gap — PLAN.md).
  const recordSpend = (record: RunRecord, outcome: AgentRunOutcome | undefined): void => {
    session.recordRun({
      agentId: AGENT_ID,
      agentPath: [AGENT_ID],
      label: `${record.mode}:${record.status}`,
      provider: record.provider,
      model: record.model,
      inputTokens: outcome?.inputTokens ?? 0,
      outputTokens: outcome?.outputTokens ?? 0,
      totalTokens: (outcome?.inputTokens ?? 0) + (outcome?.outputTokens ?? 0),
      reported: outcome?.usageReported ?? true,
      steps: outcome?.modelSteps ?? 0,
      elapsedMs: Math.round(outcome?.ms ?? record.ms),
      ...(outcome === undefined ? {} : { turns: turnsOf(outcome.transcript) }),
      ...(outcome !== undefined && outcome.status === 'landed' ? { response: outcome.response } : {}),
      outcome: record.status === 'landed' ? 'ok' : 'failed',
    });
  };

  const measure = (record: RunRecord, outcome: AgentRunOutcome): void => {
    record.ms = outcome.ms;
    record.modelSteps = outcome.modelSteps;
    record.outputRetries = outcome.outputRetries;
    record.strategy = outcome.strategy;
    record.inputTokens = outcome.inputTokens;
    record.outputTokens = outcome.outputTokens;
    record.usageReported = outcome.usageReported;
    record.promptChars = charsOf(outcome.prompt);
    record.lookups = [...outcome.lookups];
  };

  const abort = (reason: string): void => {
    if (active === undefined) return;
    const { controller, record } = active;
    active = undefined;
    record.status = 'aborted';
    record.reason = reason;
    controller.abort();
    finished.set(record.signature, 'aborted');
    // THE CARD SETTLES AT ONCE. The provider stream is still draining behind
    // this line; nobody should have to watch it do so.
    showCard(cardFor('aborted', record.mode, { reason }));
    publish(record);
    settleIfIdle();
  };
  // (`reason` is for the record and the trace; what the CARD says about an
  // abort is always the same plain sentence — see `sayFor`.)

  // Every write a RUN makes to the card goes through here, and so at most once
  // per ANSWER_WRITE_MS. Patches merge while they wait: the newest words win,
  // and a "looking something up" is never lost behind them. A patch that says
  // nothing new is not a write — solid reports a partial for every chunk, and
  // most of an envelope's chunks are not the answer.
  const createCardWriter = (record: RunRecord, isCurrent: () => boolean): { push: (patch: Record<string, unknown>) => void; cancel: () => void } => {
    let pending: Record<string, unknown> | undefined;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastAt = Number.NEGATIVE_INFINITY;
    const onCard = (): Record<string, unknown> => {
      const instanceId = instanceOf(session.shell, ASSIST_CANVAS, ASSIST_ACTION);
      return instanceId === undefined ? {} : (session.shell.getRuntime(instanceId)?.getData() ?? {});
    };
    const tick = (): void => {
      writeTimer = undefined;
      if (pending === undefined || !isCurrent()) return;
      const now = performance.now();
      const wait = lastAt + ANSWER_WRITE_MS - now;
      if (wait > 0) {
        writeTimer = setTimeout(tick, wait);
        return;
      }
      const patch = pending;
      pending = undefined;
      lastAt = now;
      record.answerWrites.push(now);
      mergeInto(ASSIST_CANVAS, ASSIST_ACTION, patch);
    };
    return {
      push: (patch) => {
        const shown = onCard();
        const fresh = Object.fromEntries(Object.entries({ ...(pending ?? {}), ...patch }).filter(([key, value]) => JSON.stringify(shown[key]) !== JSON.stringify(value)));
        pending = Object.keys(fresh).length === 0 ? undefined : fresh;
        if (pending !== undefined && writeTimer === undefined) tick();
      },
      // The attempt was rejected, or the run is over: what is waiting is void.
      cancel: () => {
        if (writeTimer !== undefined) clearTimeout(writeTimer);
        writeTimer = undefined;
        pending = undefined;
      },
    };
  };

  const start = async (startedBy: 'idle' | 'enter'): Promise<void> => {
    const context = latest;
    const llm = agent.llm;
    if (!enabled || llm === undefined || context === undefined || context.text.trim() === '') return;
    // ONE RUN PER SESSION. The same question already being answered is left
    // to finish; a different one replaces it.
    if (active !== undefined) {
      if (active.record.signature === context.handoff.signature) return;
      abort('A different sentence took over.');
    }

    const { handoff } = context;
    const mode: AgentMode = handoff.route === 'direct' ? handoff.preferred : handoff.route;
    runCount += 1;
    const record: RunRecord = {
      run: runCount,
      mode,
      startedBy,
      routedBy: handoff.route === 'direct' ? 'enter' : handoff.routedBy,
      signature: handoff.signature,
      status: 'running',
      reason: '',
      provider: agent.id,
      model: agent.model,
      ms: 0,
      inputTokens: 0,
      outputTokens: 0,
      usageReported: true,
      modelSteps: 0,
      outputRetries: 0,
      strategy: '',
      promptChars: 0,
      predecisionChars: 0,
      threadMessages: 0,
      packsSent: [],
      narrowed: handoff.narrowed,
      lookups: [],
      answer: '',
      claims: 0,
      claimsDropped: [],
      followUps: [],
      answerWrites: [],
      planSteps: 0,
      canvasesNamed: [],
      cardsMounted: [],
      cardsClosed: [],
      fieldsWritten: [],
    };
    const controller = new AbortController();
    const run: Active = { id: runCount, controller, record };
    active = run;
    deps.onRunStart?.();
    records.push(record);
    landed = undefined;
    hasReported = true;
    // This sentence is the agent's now; its turn is stored here, not on leave.
    settledAlone = undefined;
    showCard(cardFor('running', mode));
    publish(record);

    const isCurrent = (): boolean => active === run;
    // Every write this run makes to the card — the first included — is throttled.
    const writer = createCardWriter(record, isCurrent);
    // Torn down before a model was ever called: nothing was spent, and the
    // sink is told so rather than told nothing.
    const droppedEarly = (): void => recordSpend(record, undefined);

    // THE WINDOW IS READ BEFORE THE LINE IS STORED — the line is the run's last
    // message, and must not also be its last turn of history — and the line is
    // stored BEFORE the run, so a failed or aborted reply still leaves the
    // question behind (Midas turn.ts:96-102).
    const window = await thread.window();
    // ...and so is what the conversation has already put on the table.
    const remembered = await thread.remembered();
    if (context.text !== storedLine) {
      storedLine = context.text;
      await thread.append('operator', context.text, { route: handoff.route, routedBy: record.routedBy, run: true, rows: resolvedRows(handoff.entities) });
      threadChanged();
    }
    if (!isCurrent()) return droppedEarly();

    // The context Jev asked for, read now, under the caller's policy.
    const wanted = deps.packs.filter((pack) => handoff.packs.some((entry) => entry.id === pack.id));
    const facts = await readPacks(session.wire, wanted, context.parsed, deps.clock);
    if (!isCurrent()) return droppedEarly();
    record.packsSent = Object.keys(facts);
    // WHILE IT HAPPENS, in the operator's terms: what is being read.
    const reading = wanted.filter((pack) => facts[pack.id] !== undefined).map((pack) => pack.noun);
    if (reading.length > 0) writer.push({ say: `Reading ${reading.length === 1 ? reading[0] : `${reading.slice(0, -1).join(', ')} and ${reading.at(-1)}`}…` });

    // THE ROWS THIS ANSWER MAY NAME: the candidates Jev was offered for this
    // sentence, the rows the facts it is being handed are ABOUT, and the rows
    // earlier turns of this thread resolved or were handed. A follow-up — "what
    // are our options" — retrieves nothing, and the plan that answers it has to
    // be able to move the act the last answer was about. All of them were read
    // under this principal's policy; none is a row they could not see.
    const handed = harvestRefs(wanted, facts);
    const table = mergeRows(context.candidates, [...remembered, ...handed]);
    lastTable = table;

    const narrowed = handoff.narrowed.flatMap((id) => (deps.definitions[id] === undefined ? [] : [deps.definitions[id]]));
    const writable = writableNow();
    const predecisions: Predecisions = {
      mode,
      sentence: context.text,
      heard: heardOf(context.parsed),
      now: { day: deps.clock.day, time: deps.clock.time },
      resolved: resolvedRows(handoff.entities),
      rows: rowLines(table),
      actions: narrowed.map(actionLine),
      facts,
      screen: screenNow(),
      writable,
    };
    // WHAT THIS RUN MAY NAME: the few actions Jev narrowed the catalog to, the
    // candidate rows of this pass, the fields listed as writable. The same
    // context admits the answer inside the run (as a correction) and when it
    // lands (whole, or not at all).
    // Citations are admitted against the screen AS IT IS WHEN THEY ARE CHECKED —
    // inside the run and again at landing — so both are functions, not values.
    const answerContext = (): AnswerContext => ({ allowed: new Set(handoff.narrowed), definitions: deps.definitions, candidates: table, writable, onScreen: new Set(screenNow().map((card) => card.card)), rowsOn });
    const request = { thread: window, predecisions, line: context.text };
    lastInput = { input: runInput(request), mode };
    record.threadMessages = window.length;
    record.predecisionChars = (lastInput.input.at(-2)?.content ?? '').length;

    const looked: string[] = [];
    const outcome = await runAgent({
      ...request,
      llm,
      mode,
      tools: createReadTools({ wire: session.wire, policy: session.policy, entries: ENTRIES }),
      abort: controller.signal,
      refusals: (data) => {
        const verdict = admitAnswer(answerContext(), data);
        return verdict.ok ? [] : verdict.reasons;
      },
      onAnswer: (soFar) => writer.push({ answer: soFar, segments: streamingSegments(soFar) }),
      // A REJECTED ATTEMPT NEVER REACHES THE CARD as an answer: what streamed
      // of it is wiped, and the next attempt starts from nothing.
      onRetry: () => {
        writer.cancel();
        writer.push({ answer: '', segments: [], say: 'Still working — the first attempt was not good enough, trying again…' });
      },
      onLookup: (lookup) => {
        if (lookup.state === 'looked') looked.push(lookup.line);
        writer.push({ say: lookup.state === 'looking' ? 'Looking something up…' : 'Answering…', lookups: [...looked, ...(lookup.state === 'looking' ? [`${lookup.line} …`] : [])].join(' · ') });
      },
      ...(deps.traceDir !== undefined ? { trace: { dir: deps.traceDir, principal: session.principal, model: agent.model } } : {}),
    });
    writer.cancel();
    measure(record, outcome);

    // Torn down while it was out: `abort` already said so on the card, and
    // whatever came back is for a question nobody is asking any more. What it
    // SPENT is known only now.
    if (!isCurrent()) {
      publish(record);
      return recordSpend(record, outcome);
    }
    active = undefined;

    const verdict = outcome.status === 'landed' && outcome.data !== undefined ? admitAnswer(answerContext(), outcome.data, outcome.response) : undefined;
    if (outcome.status === 'landed' && verdict !== undefined && verdict.ok) {
      record.status = 'landed';
      record.answer = outcome.response;
      record.planSteps = verdict.steps.length;
      landed = { signature: record.signature, mode, steps: verdict.steps, opened: new Set(), done: new Set() };
      apply(verdict, record);
      // Citations are re-admitted against the screen the answer just MADE: a
      // card it placed is on screen now, and may be stood on.
      const cited = admitAnswer(answerContext(), outcome.data ?? {}, outcome.response);
      const claims = cited.ok ? cited.claims : verdict.claims;
      const notes = cited.ok ? cited.notes : verdict.notes;
      record.claims = claims.length;
      record.claimsDropped = notes;
      record.followUps = verdict.followUps;
      showCard(
        cardFor(
          'landed',
          mode,
          {
            answer: outcome.response,
            segments: segmentsOf(outcome.response, claims),
            landed: true,
            lookups: outcome.lookups.join(' · '),
            notes: notes.join(' · '),
            steps: stepsShown(),
            followUps: verdict.followUps.map((text) => ({ text })),
          },
          { count: mode === 'plan' ? verdict.steps.length : record.fieldsWritten.length, read: wanted.filter((pack) => facts[pack.id] !== undefined).map((pack) => pack.noun), lookedUp: outcome.lookups.length, ms: outcome.ms },
        ),
      );
      // What a WRITE was authored from: the forms beside the field. If a person
      // changes one of them, the words are stale (see `reauthor`).
      authoredFrom = mode === 'write' ? { signature: record.signature, siblings: siblingsNow() } : undefined;
      // The answer becomes a turn — with what it did to the screen, so a later
      // "do that for the support act too" knows what "that" was, and with the
      // rows it was handed, so a later turn may name them.
      await thread.append('agent', outcome.response, { mode, canvases: record.canvasesNamed, cards: record.cardsMounted, closed: record.cardsClosed, fields: record.fieldsWritten, steps: verdict.steps.map((step) => step.say), lookups: outcome.lookups, rows: handed.slice(0, REMEMBERED_MAX) });
      threadChanged();
    } else if (outcome.status === 'aborted') {
      // AN OUTCOME, NOT AN ERROR. The partial answer is not kept — not on the
      // card, not in the thread.
      record.status = 'aborted';
      record.reason = outcome.reason;
      showCard(cardFor('aborted', mode, { reason: record.reason }));
    } else {
      // REJECTED WHOLE: nothing above ran, so nothing was written or mounted.
      record.status = 'failed';
      record.reason = verdict !== undefined && !verdict.ok ? `The answer named something the room cannot open: ${verdict.reasons.join('; ')}` : outcome.reason;
      showCard(cardFor('failed', mode, { reason: record.reason, lookups: outcome.lookups.join(' · ') }, { reason: record.reason }));
    }
    finished.set(record.signature, record.status);
    publish(record);
    recordSpend(record, outcome);
  };

  const launch = (startedBy: 'idle' | 'enter'): void => {
    const running: Promise<void> = start(startedBy)
      .catch((error: unknown) => {
        console.error('[encore/assist] a run failed outside the agent:', error);
        const failedRun = active;
        active = undefined;
        if (failedRun !== undefined) {
          failedRun.record.status = 'failed';
          failedRun.record.reason = error instanceof Error ? error.message : String(error);
          finished.set(failedRun.record.signature, 'failed');
          showCard(cardFor('failed', failedRun.record.mode, { reason: failedRun.record.reason }, { reason: failedRun.record.reason }));
          publish(failedRun.record);
          recordSpend(failedRun.record, undefined);
        }
      })
      .finally(() => {
        draining.delete(running);
        settleIfIdle();
      });
    draining.add(running);
  };

  // ─── what a PERSON does to the room ────────────────────────

  // A BUTTON WAS PRESSED. The form says `saved`; the loop did not press it and
  // neither did the agent, so this is the one kind of turn nobody typed. It is
  // recorded for the rail and for the agent's next answer, and if the form was a
  // step of the plan on the card, the plan ticks.
  const onSubmitted = (actionId: string, data: Record<string, unknown>): void => {
    const phrase = `${phraseFor(actionId, data) ?? deps.definitions[actionId]?.title ?? actionId} · ${SUBMITTED}`;
    void thread.append('did', phrase, { rail: phrase, action: actionId }).then(threadChanged);
    if (landed === undefined) return;
    const at = landed.steps.findIndex((step, index) => step.card.actionId === actionId && landed?.done.has(index) !== true);
    if (at < 0) return;
    landed.done.add(at);
    mergeInto(ASSIST_CANVAS, ASSIST_ACTION, { steps: stepsShown(), progress: `${landed.done.size} of ${landed.steps.length}` });
  };

  // THE WORDS FOLLOW THE FORM THEY WERE WRITTEN FROM. A push drafted from "Nova
  // Kestrel → The Tent, 21:00" is wrong the moment somebody makes it 22:00 —
  // so when the forms beside a written field change, and the line is quiet, the
  // same question is asked again. A field the operator has typed in is not
  // offered to that run, and so is never written (touched.ts).
  const reauthor = (): void => {
    reauthorTimer = undefined;
    const written = authoredFrom;
    if (written !== undefined && active === undefined && latest?.handoff.signature === written.signature && siblingsNow() !== written.siblings) {
      finished.delete(written.signature);
      launch('idle');
    }
    settleIfIdle();
  };

  const watch = (): void => {
    const shell = session.shell;
    if (watching === shell) return;
    watching = shell;
    shell.onDataChange(({ instanceId, data }) => {
      const card = QUESTION_CANVASES.flatMap((canvas) => shell.getState().canvases[canvas]?.stack ?? []).find((item) => item.id === instanceId);
      if (card === undefined) return;
      if (data['saved'] === true && !submitted.has(instanceId)) {
        submitted.add(instanceId);
        onSubmitted(card.definitionId, data);
      }
      if (authoredFrom === undefined || active !== undefined) return;
      if (reauthorTimer !== undefined) clearTimeout(reauthorTimer);
      reauthorTimer = setTimeout(reauthor, HANDOFF_IDLE_MS);
    });
  };

  // The line has been quiet for a beat after a finished thought: SETTLED.
  const onSettled = (context: PassContext): void => {
    const answered = finished.get(context.handoff.signature);
    if (enabled && context.handoff.route !== 'direct') {
      if (answered !== 'landed' && answered !== 'failed') launch('idle');
      return;
    }
    // Jev alone — or a route with no agent to take it. A turn all the same.
    settledAlone = context;
  };

  return {
    enabled,
    // A keystroke is the line NOT being idle. The pass it starts will re-arm.
    onKeystroke: () => {
      disarm();
    },

    onPass: (context) => {
      latest = context;
      watch();
      disarm();
      const { handoff } = context;
      if (active !== undefined && active.record.signature !== handoff.signature) abort('The sentence changed what this was for.');

      const wanted = enabled && handoff.route !== 'direct';
      const answered = finished.get(handoff.signature);
      // THE SAME PASS that decided a handoff is coming puts the card up.
      if (wanted && active === undefined && answered !== 'landed' && answered !== 'failed') showCard(cardFor('pending', handoff.route === 'direct' ? handoff.preferred : handoff.route, {}, { isComplete: handoff.completeP >= HANDOFF_AT }));
      // Every route settles — a direct sentence is a turn too.
      if (handoff.completeP >= HANDOFF_AT) {
        timer = setTimeout(() => {
          timer = undefined;
          onSettled(context);
          settleIfIdle();
        }, HANDOFF_IDLE_MS);
      }
      // Cards are enough again and no run ever happened: the card was only a
      // promise, and the promise is withdrawn. A card that REPORTS something —
      // landed, aborted, failed — stays until the line is cleared.
      if (enabled && !wanted && active === undefined && !hasReported) hideCard();
      // An answer to a different question is not this sentence's answer.
      if (wanted && landed !== undefined && landed.signature !== handoff.signature) {
        landed = undefined;
        deps.release([...opened]);
        opened.clear();
      }
      settleIfIdle();
    },

    onNothingAsked: () => {
      disarm();
      latest = undefined;
      abort('The sentence stopped asking for anything.');
      if (enabled && !hasReported) hideCard();
      settleIfIdle();
    },

    onClear: (why) => {
      disarm();
      abort(why);
      // The sentence is being LEFT: if it settled without a run, this is when
      // it becomes a turn — while the screen still shows what came of it.
      storeSettledAlone();
      latest = undefined;
      landed = undefined;
      finished.clear();
      opened.clear();
      hasReported = false;
      storedLine = '';
      authoredFrom = undefined;
      if (reauthorTimer !== undefined) clearTimeout(reauthorTimer);
      reauthorTimer = undefined;
      submitted.clear();
      // The trace is about the sentence on the line. The last sentence's run is
      // history, and the thread is where history lives.
      sentenceFrom = records.length;
      if (enabled) hideCard();
      writeTraceRun();
      settleIfIdle();
    },

    runNow: () => {
      if (!enabled) return 'off';
      disarm();
      launch('enter');
      return 'started';
    },

    openStep: (index) => {
      const parsed = StepIndexSchema.safeParse(index);
      const step = parsed.success ? landed?.steps[parsed.data] : undefined;
      if (landed === undefined || step === undefined || !parsed.success) return 'no such step';
      openBeside(step.card, `${agent.label} · step ${parsed.data + 1}`, `You opened this from step ${parsed.data + 1} of the assistant’s plan.`);
      landed.opened.add(parsed.data);
      mergeInto(ASSIST_CANVAS, ASSIST_ACTION, { steps: stepsShown() });
      deps.repass();
      return step.card.actionId;
    },

    newThread: async () => {
      // A sentence waiting to become a turn belongs to the thread being ended.
      storeSettledAlone();
      await thread.append('break', '');
      storedLine = '';
      threadChanged();
      return 'a new thread';
    },

    earlierTurns: async () => {
      const entries = await thread.entries();
      // The exchange on the answer card is shown BY that card; the rail is what
      // came before it. Same rows, newest first, minus the line being answered.
      const current = storedLine === '' || !hasReported ? -1 : entries.findIndex((entry) => entry.line === storedLine && entry.by !== 'pressed');
      return current < 0 ? entries : entries.filter((_, index) => index !== current);
    },

    idle: async () => {
      if (timer !== undefined || reauthorTimer !== undefined || active !== undefined || draining.size > 0) await new Promise<void>((resolve) => waiters.push(resolve));
      await thread.flushed();
    },
    // ─── for the room that watches (server/watch) ──────────────
    // A flagged event is a turn like any other: a row, through the wire.
    recordEvent: (line, detail) => {
      void thread.append('event', line, detail).then(threadChanged);
    },
    isRunOut: () => active !== undefined,
    // ONE LINE about an event — the same agent, the same law, no tools, nothing
    // it may name. Recorded in the `runs` sink like every other run.
    brief: async (request, abort) => {
      const llm = agent.llm;
      if (!enabled || llm === undefined) return undefined;
      const predecisions: Predecisions = { mode: 'brief', sentence: request.event.line, heard: {}, now: { day: request.clock.day, time: request.clock.time }, resolved: [], rows: {}, actions: [], facts: { standing: request.standing }, screen: request.screen, writable: [] };
      const nothing: AnswerContext = { allowed: new Set(), definitions: deps.definitions, candidates: {}, writable: [] };
      const outcome = await runAgent({
        llm,
        mode: 'brief',
        thread: [],
        predecisions,
        // The line is the WHOLE situation, not only what tipped it: a model
        // answers its last message, and a brief about one cause is what it wrote
        // when that message named one cause.
        line: `JUST NOW: ${request.event.line}\nSTANDING, all at once: ${request.standing.map((cause) => `${cause.place} — ${cause.reading} (since ${cause.since})`).join(' | ')}`,
        tools: [],
        abort,
        refusals: (data) => {
          const verdict = admitAnswer(nothing, data);
          return verdict.ok ? [] : verdict.reasons;
        },
        onAnswer: () => {},
        onRetry: () => {},
        onLookup: () => {},
        ...(deps.traceDir !== undefined ? { trace: { dir: deps.traceDir, principal: session.principal, model: agent.model } } : {}),
      });
      session.recordRun({
        agentId: AGENT_ID,
        agentPath: [AGENT_ID],
        label: `brief:${outcome.status}`,
        provider: agent.id,
        model: agent.model,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        totalTokens: outcome.inputTokens + outcome.outputTokens,
        reported: outcome.usageReported,
        steps: outcome.modelSteps,
        elapsedMs: Math.round(outcome.ms),
        turns: turnsOf(outcome.transcript),
        ...(outcome.status === 'landed' ? { response: outcome.response } : {}),
        outcome: outcome.status === 'landed' ? 'ok' : 'failed',
      });
      return outcome.status === 'landed' && outcome.response.trim() !== '' ? outcome.response.trim() : undefined;
    },
    runs: () => records,
    lastInput: () => lastInput,
    traceRows,
  };
};
