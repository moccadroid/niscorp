import { z } from 'zod';
import { reconcileCanvas } from '@niscorp/nova';
import type { ActionDefinition, Shell } from '@niscorp/nova';
import type { FunctionSession, RunTurn } from '@niscorp/moss';
import type { Message } from '@niscorp/signal';
import { ASSIST_ANSWER_ID, THREAD_CHANNEL } from '@encore/app/actions/frame/assist-answer.action';
import { CANVAS_PLACEMENT, QUESTION_CANVASES, tileOf } from '@encore/app/canvas-placement';
import { NOT_SUBMITTED, RAIL_PHRASES, SUBMITTED } from '@encore/app/rail-phrases';
import { CITE_KEY, PLACED_BY, PLACED_FRAGMENT, WHY, keptAcrossReopen } from '@encore/app/shell/fragments/placed.fragment';
import { ENTRIES } from '@encore/app/vex';
import type { ScopePolicy } from '@niscorp/vex';
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
import { harvestRefs, harvestRows, readPacks } from './context-packs';
import type { HarvestedRow } from './context-packs';
import { inputContractOf } from './input-contract';
import { CARDS_ONLY, createThread } from './thread';
import type { RailEntry, RememberedRow } from './thread';
import type { TouchTracker } from './touched';
import type { BriefRequest } from '@encore/server/watch/watch';
import type { CandidateSets, Handoff, HeldCard, Parsed, RunRecord, RunStatus } from './intent.types';

export const HANDOFF_IDLE_MS = 700;

// Publishing per model event triples the wall clock and starves the stream into provider rejections.
export const ANSWER_WRITE_MS = 120;

export const ASSIST_ORIGIN = 'assist';
const ASSIST_ACTION = ASSIST_ANSWER_ID;
const ASSIST_CANVAS = 'assist';
const INTENT_ORIGIN = 'intent';
const AGENT_ID = encoreAgent.agentId;

const STATUS_TONE: Record<RunStatus, string> = { running: 'accent', landed: 'good', aborted: 'warn', failed: 'alert' };

export type PassContext = {
  text: string;
  parsed: Parsed;
  candidates: CandidateSets;
  handoff: Handoff;
  held: readonly HeldCard[];
};

export type AssistDeps = {
  session: FunctionSession;
  policy: ScopePolicy;
  agent: AgentLlm;
  clock: FestivalClock;
  definitions: Record<string, ActionDefinition>;
  packs: readonly ContextPack[];
  touched: TouchTracker;
  traceDir?: string;
  adopt: (actionId: string, input: Record<string, unknown>, placedBy: string, why: string) => void;
  repass: () => void;
  onRun?: (principal: string | null, record: RunRecord) => void;
  onRunStart?: () => void;
};

export type Assist = {
  enabled: boolean;
  onKeystroke: (text: string) => void;
  onPass: (context: PassContext) => void;
  onNothingAsked: () => void;
  onClear: (why: string) => void;
  runNow: () => string;
  openStep: (index: number) => string;
  newThread: () => Promise<string>;
  earlierTurns: () => Promise<RailEntry[]>;
  idle: () => Promise<void>;
  runs: () => readonly RunRecord[];
  lastInput: () => { input: Message[] } | undefined;
  recordEvent: (line: string, detail: Record<string, unknown>) => void;
  isRunOut: () => boolean;
  brief: (request: BriefRequest, abort: AbortSignal) => Promise<string | undefined>;
  traceRows: () => { label: string; value: string | number }[];
};

type Landed = { text: string; steps: { say: string; card: AdmittedCard }[]; opened: Set<number>; done: Set<number> };
type Active = { id: number; controller: AbortController; record: RunRecord };
type SayDetail = { steps?: number; fields?: number; reason?: string; read?: string[]; lookedUp?: number; ms?: number };

const StepIndexSchema = z.number().int().min(0);

const AIMED_MAX_CHARS = 80;

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
  const enabled = agent.llm !== undefined && session.actions.includes(ASSIST_ACTION);
  const thread = createThread(session.wire);

  const records: RunRecord[] = [];
  let sentenceFrom = 0;
  let answeredText = '';
  let latest: PassContext | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Active | undefined;
  let landed: Landed | undefined;
  let runCount = 0;
  let hasReported = false;
  let settledAlone: PassContext | undefined;
  let storedLine = '';
  let lastInput: { input: Message[] } | undefined;
  let authoredFrom: { text: string; siblings: string } | undefined;
  let reauthorTimer: ReturnType<typeof setTimeout> | undefined;
  const submitted = new Set<string>();
  let watching: Shell | undefined;
  let lastTable: CandidateSets = {};
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

  const instanceOf = (shell: Shell, canvas: string, actionId: string): string | undefined => shell.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId)?.id;

  const mergeInto = (canvas: string, actionId: string, patch: Record<string, unknown>): void => {
    const shell = session.shell;
    const instanceId = instanceOf(shell, canvas, actionId);
    const runtime = instanceId === undefined ? undefined : shell.getRuntime(instanceId);
    if (runtime !== undefined) runtime.setData({ ...runtime.getData(), ...patch });
  };

  const writeNextSteps = (card: Record<string, unknown>): void => {
    const links = Array.isArray(card['followUps']) ? card['followUps'] : [];
    const steps = Array.isArray(card['steps']) ? card['steps'] : [];
    mergeInto('maybe', 'intent.options', { links, stepsUp: steps.length > 0 });
  };

  const showCard = (patch: Record<string, unknown>): void => {
    const shell = session.shell;
    if (instanceOf(shell, ASSIST_CANVAS, ASSIST_ACTION) === undefined) reconcileCanvas(shell, ASSIST_CANVAS, [{ actionId: ASSIST_ACTION }], { origin: INTENT_ORIGIN, own: 'canvas' });
    mergeInto(ASSIST_CANVAS, ASSIST_ACTION, patch);
    if ('followUps' in patch || 'steps' in patch) writeNextSteps(patch);
  };

  const hideCard = (): void => {
    reconcileCanvas(session.shell, ASSIST_CANVAS, [], { origin: INTENT_ORIGIN, own: 'canvas' });
    writeNextSteps({});
  };

  const sayFor = (status: RunStatus, detail: SayDetail): string => {
    if (status === 'running') return 'Answering…';
    if (status === 'landed') {
      const read = detail.read ?? [];
      const from = read.length === 0 ? 'from the conversation alone' : `read ${read.length === 1 ? read[0] : `${read.slice(0, -1).join(', ')} and ${read.at(-1)}`}`;
      return `${from}${(detail.lookedUp ?? 0) === 0 ? '' : ` · looked up ${detail.lookedUp} more`} · ${((detail.ms ?? 0) / 1000).toFixed(1)} s`;
    }
    if (status === 'failed') return `That did not work, and nothing was changed: ${detail.reason ?? 'unknown'}`;
    return '';
  };

  const plainFor = (status: RunStatus, detail: SayDetail): string => {
    if (status === 'failed') return 'That did not work, and nothing was changed. Say it another way, or press Enter to try again.';
    if (status !== 'landed') return '';
    if ((detail.steps ?? 0) > 0) return 'Press a step to open its form, filled in. Nothing is submitted for you.';
    return (detail.fields ?? 0) > 0 ? 'Edit the words freely — they will not be written over.' : '';
  };

  const cardFor = (status: RunStatus, extra: Record<string, unknown> = {}, detail: SayDetail = {}): Record<string, unknown> => ({
    status,
    statusTone: STATUS_TONE[status],
    by: agent.label,
    say: sayFor(status, detail),
    plain: plainFor(status, detail),
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
      { label: 'started by', value: last.startedBy },
      { label: 'run ms', value: Math.round(last.ms) },
      { label: 'model steps', value: last.modelSteps },
      { label: 'tokens in/out', value: `${last.inputTokens}/${last.outputTokens}${last.usageReported ? '' : ' (estimated)'}` },
      { label: 'prompt chars', value: `${last.promptChars} (this turn ${last.predecisionChars}, thread ${last.threadMessages} msg)` },
      { label: 'packs sent', value: last.packsSent.join(', ') || 'none' },
      { label: 'looked up', value: last.lookups.join(' · ') || 'nothing' },
      { label: 'canvases named', value: last.canvasesNamed.join(', ') || 'none' },
    ];
  };

  const writeTraceRun = (): void => mergeInto('trace', 'intent.trace', { run: traceRows() });

  const publish = (record: RunRecord): void => {
    writeTraceRun();
    deps.onRun?.(session.principal, { ...record, answerWrites: [...record.answerWrites] });
  };

  const threadChanged = (): void => session.shell.publish(THREAD_CHANNEL);

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
        return [{ canvas, card: item.definitionId, aimedAt: data['saved'] === true ? { ...aimedAt, submitted: true } : aimedAt }];
      }),
    );
  };

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

  const nameOf = (id: string): string => {
    const rows = [...Object.values(latest?.candidates ?? {}).flat(), ...Object.values(lastTable).flat()];
    return (rows.find((row) => row.id === id)?.label ?? id).split(' — ')[0] ?? id;
  };

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

  const siblingsNow = (): string => JSON.stringify(screenNow().map((card) => [card.card, Object.fromEntries(Object.entries(card.aimedAt).filter(([key]) => !writableKeys(card.card).has(key)))]));
  const writableKeys = (card: string): ReadonlySet<string> => {
    const definition = deps.definitions[card];
    return new Set(definition === undefined ? [] : inputContractOf(definition).fields.flatMap((field) => (field.write === true ? [field.name] : [])));
  };

  const aimedWords = (aimedAt: Record<string, unknown>): string => {
    const words = Object.entries(aimedAt).map(([key, value]) => (key === 'submitted' ? 'SUBMITTED' : `${key}=${String(value)}`));
    return words.length === 0 ? '' : ` (${words.join(', ')})`;
  };

  // Stored when the sentence is left: only by then does the screen say what was submitted.
  const storeSettledAlone = (): void => {
    const context = settledAlone;
    settledAlone = undefined;
    if (context === undefined) return;
    const rows = resolvedRows(context.handoff.entities);
    if (context.text !== storedLine) void thread.append('operator', context.text, { run: false, rows });
    storedLine = context.text;
    void thread.append('jev', `${CARDS_ONLY} ${screenWords(rows)}`, { resolved: rows, rows, screen: screenNow(), rail: railOfScreen() }).then(threadChanged);
  };

  const screenWords = (rows: Predecisions['resolved'] = []): string => {
    const screen = screenNow();
    const openedWords = screen.length === 0 ? 'Nothing was opened.' : `Opened ${screen.map((card) => `${card.card}${aimedWords(card.aimedAt)}`).join('; ')}.`;
    return `${openedWords}${rows.length === 0 ? '' : ` Rows named: ${rows.map((row) => `${row.label} [${row.table}:${row.id}]`).join('; ')}.`}`;
  };

  // `standing` cards are named with no input, so reconcile leaves them exactly as they are.
  const reconcileTo = (canvas: string, cards: readonly AdmittedCard[], standing: readonly string[], placedBy: string, why: string): void => {
    const shell = session.shell;
    const described = cards.map((card) => {
      const existing = instanceOf(shell, canvas, card.actionId);
      const input = { ...card.input, ...tileOf(card.actionId, canvas), [PLACED_BY]: placedBy, [CITE_KEY]: card.actionId, [WHY]: why };
      const writing = existing === undefined ? input : { ...touched.untouched(existing, input), ...keptAcrossReopen(shell.getRuntime(existing)?.getData() ?? {}) };
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
      deps.adopt(card.actionId, card.input, placedBy, why);
    });
  };

  const openBeside = (card: AdmittedCard, placedBy: string, why: string): void => {
    const standing = (session.shell.getState().canvases[card.canvas]?.stack ?? []).map((item) => item.definitionId).filter((id) => id !== card.actionId);
    reconcileTo(card.canvas, [card], standing, placedBy, why);
  };

  const apply = (answer: Extract<ReturnType<typeof admitAnswer>, { ok: true }>, record: RunRecord, aimedBy?: (card: AdmittedCard) => { why: string; told: string } | undefined): void => {
    const shell = session.shell;
    for (const entry of answer.fields) {
      const canvas = CANVAS_PLACEMENT[entry.card];
      const instanceId = canvas === undefined ? undefined : instanceOf(shell, canvas, entry.card);
      if (instanceId === undefined || touched.isTouched(instanceId, entry.field)) continue;
      touched.willWrite(instanceId, { [entry.field]: entry.text });
      touched.markAuthored(instanceId, [entry.field]);
      const runtime = shell.getRuntime(instanceId);
      if (runtime === undefined) continue;
      runtime.setData({ ...runtime.getData(), [entry.field]: entry.text });
      record.fieldsWritten.push(`${entry.card}.${entry.field}`);
    }

    // Only Jev closes: an omission from the slow model's list is too weak a signal to take a card down.
    for (const [canvas, cards] of Object.entries(answer.canvases)) {
      record.canvasesNamed.push(canvas);
      for (const card of cards) {
        const aimedWith = aimedBy?.(card);
        if (aimedWith !== undefined) record.cardsAimed.push(aimedWith.told);
        reconcileTo(canvas, [card], (shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.definitionId).filter((id) => id !== card.actionId), agent.label, aimedWith?.why ?? 'Added by the assistant as evidence for its answer.');
      }
      record.cardsMounted.push(...cards.map((card) => card.actionId));
    }
    if (record.canvasesNamed.length > 0) deps.repass();
  };

  // moss has two outcomes and a run has three: the third rides the label.
  const recordSpend = (record: RunRecord, outcome: AgentRunOutcome | undefined): void => {
    session.recordRun({
      agentId: AGENT_ID,
      agentPath: [AGENT_ID],
      label: `sentence:${record.status}`,
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
    hasReported = false;
    hideCard();
    publish(record);
    settleIfIdle();
  };

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
    if (active !== undefined) {
      if (active.record.text === context.text) return;
      abort('The line changed.');
    }

    const { handoff } = context;
    runCount += 1;
    const record: RunRecord = {
      run: runCount,
      text: context.text,
      startedBy,
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
      refused: [],
      answer: '',
      claims: 0,
      claimsDropped: [],
      followUps: [],
      answerWrites: [],
      planSteps: 0,
      canvasesNamed: [],
      cardsMounted: [],
      cardsAimed: [],
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
    settledAlone = undefined;
    showCard(cardFor('running'));
    publish(record);

    const isCurrent = (): boolean => active === run;
    const writer = createCardWriter(record, isCurrent);
    const droppedEarly = (): void => recordSpend(record, undefined);

    // The window is read before the line is stored, or the line would be both the run's last
    // message and its last turn of history. Stored before the run, it survives a failed reply.
    const window = await thread.window();
    const remembered = await thread.remembered();
    const asked = [...(await thread.asked()), context.text];
    if (context.text !== storedLine) {
      storedLine = context.text;
      await thread.append('operator', context.text, { run: true, rows: resolvedRows(handoff.entities) });
      threadChanged();
    }
    if (!isCurrent()) return droppedEarly();

    const wanted = deps.packs.filter((pack) => handoff.packs.some((entry) => entry.id === pack.id));
    const facts = await readPacks(session.wire, wanted, context.parsed, deps.clock);
    if (!isCurrent()) return droppedEarly();
    record.packsSent = Object.keys(facts);
    const reading = wanted.filter((pack) => facts[pack.id] !== undefined).map((pack) => pack.noun);
    if (reading.length > 0) writer.push({ say: `Reading ${reading.length === 1 ? reading[0] : `${reading.slice(0, -1).join(', ')} and ${reading.at(-1)}`}…` });

    const handed = harvestRefs(wanted, facts);
    const table = mergeRows(context.candidates, [...remembered, ...handed]);
    lastTable = table;

    const unaimed = context.held.filter((card) => card.needs.length > 0 && deps.definitions[card.id] !== undefined);
    const mayOpen = [...new Set([...handoff.narrowed, ...unaimed.map((card) => card.id)])];
    const narrowed = mayOpen.flatMap((id) => (deps.definitions[id] === undefined ? [] : [deps.definitions[id]]));
    const writable = writableNow();
    const predecisions: Predecisions = {
      sentence: context.text,
      heard: heardOf(context.parsed),
      now: { day: deps.clock.day, time: deps.clock.time },
      resolved: resolvedRows(handoff.entities),
      rows: rowLines(table),
      actions: narrowed.map(actionLine),
      facts,
      screen: screenNow(),
      writable,
      wanted: unaimed.map((card) => `${card.id} — wanted ${card.p.toFixed(2)} — needs: ${card.needs.map((need) => need.noun).join(', ')}`),
      asked,
    };
    // A function: citations are admitted against the screen as it is when they are checked.
    const lookedUpRows: HarvestedRow[] = [];
    const answerContext = (): AnswerContext => ({ allowed: new Set(mayOpen), definitions: deps.definitions, candidates: mergeRows(table, lookedUpRows), writable, onScreen: new Set(screenNow().map((card) => card.card)), rowsOn, asked });
    const request = { thread: window, predecisions, line: context.text };
    lastInput = { input: runInput(request) };
    record.threadMessages = window.length;
    record.predecisionChars = (lastInput.input.at(-2)?.content ?? '').length;

    const looked: string[] = [];
    const outcome = await runAgent({
      ...request,
      llm,
      tools: createReadTools({ wire: session.wire, policy: deps.policy, entries: ENTRIES, onRows: (rows) => lookedUpRows.push(...harvestRows(rows)) }),
      abort: controller.signal,
      refusals: (data, response) => {
        const verdict = admitAnswer(answerContext(), data, response);
        if (!verdict.ok) record.refused.push(verdict.reasons.join('; '));
        return verdict.ok ? [] : verdict.reasons;
      },
      onAnswer: (soFar) => writer.push({ answer: soFar, segments: streamingSegments(soFar) }),
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

    if (!isCurrent()) {
      publish(record);
      return recordSpend(record, outcome);
    }
    active = undefined;

    const data = outcome.data ?? {};
    const verdict = outcome.status === 'landed' ? admitAnswer(answerContext(), data, outcome.response) : undefined;
    if (outcome.status === 'landed' && verdict !== undefined && verdict.ok) {
      record.status = 'landed';
      record.answer = outcome.response;
      record.planSteps = verdict.steps.length;
      landed = { text: context.text, steps: verdict.steps, opened: new Set(), done: new Set() };
      const sources = new Map([...handed, ...lookedUpRows].map((row) => [`${row.table}:${row.id}`, row]));
      apply(verdict, record, (card) => {
        const need = unaimed.find((held) => held.id === card.actionId)?.needs.find((entry) => entry.table !== undefined && typeof card.input[entry.key] === 'string');
        const row = need === undefined ? undefined : sources.get(`${need.table}:${String(card.input[need.key])}`);
        if (need === undefined || row === undefined) return undefined;
        const name = row.label.split(' — ')[0] ?? row.label;
        return { why: `Opened because you said “${context.text.trim()}” — the assistant picked ${name} from ${row.from}.`, told: `“${deps.definitions[card.actionId]?.title ?? card.actionId}” at ${name}, from ${row.from} — Jev wanted it and could not aim it` };
      });
      // Citations are admitted again, against the screen the answer just made.
      const cited = admitAnswer(answerContext(), data, outcome.response);
      const claims = cited.ok ? cited.claims : verdict.claims;
      const notes = cited.ok ? cited.notes : verdict.notes;
      record.claims = claims.length;
      record.claimsDropped = notes;
      record.followUps = verdict.followUps;
      const hasWords = outcome.response.trim() !== '';
      if (hasWords || verdict.steps.length > 0 || verdict.followUps.length > 0) {
        showCard(
          cardFor(
            'landed',
            { answer: outcome.response, segments: segmentsOf(outcome.response, claims), landed: true, lookups: outcome.lookups.join(' · '), notes: notes.join(' · '), steps: stepsShown(), followUps: verdict.followUps.map((text) => ({ text })) },
            { steps: verdict.steps.length, fields: record.fieldsWritten.length, read: wanted.filter((pack) => facts[pack.id] !== undefined).map((pack) => pack.noun), lookedUp: outcome.lookups.length, ms: outcome.ms },
          ),
        );
      } else {
        hasReported = false;
        hideCard();
      }
      authoredFrom = record.fieldsWritten.length > 0 ? { text: context.text, siblings: siblingsNow() } : undefined;
      await thread.append('agent', hasWords ? outcome.response : `${CARDS_ONLY} ${screenWords()}`, { canvases: record.canvasesNamed, cards: record.cardsMounted, closed: record.cardsClosed, fields: record.fieldsWritten, steps: verdict.steps.map((step) => step.say), lookups: outcome.lookups, followUps: verdict.followUps, rows: handed.slice(0, REMEMBERED_MAX), ...(hasWords ? {} : { rail: railOfScreen() }) });
      threadChanged();
    } else if (outcome.status === 'aborted') {
      record.status = 'aborted';
      record.reason = outcome.reason;
      hasReported = false;
      hideCard();
    } else {
      record.status = 'failed';
      record.reason = verdict !== undefined && !verdict.ok ? `The answer named something the room cannot open: ${verdict.reasons.join('; ')}` : outcome.reason;
      showCard(cardFor('failed', { reason: record.reason, lookups: outcome.lookups.join(' · ') }, { reason: record.reason }));
    }
    if (record.status !== 'aborted') answeredText = context.text;
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
          answeredText = failedRun.record.text;
          showCard(cardFor('failed', { reason: failedRun.record.reason }, { reason: failedRun.record.reason }));
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

  const onSubmitted = (actionId: string, data: Record<string, unknown>): void => {
    const phrase = `${phraseFor(actionId, data) ?? deps.definitions[actionId]?.title ?? actionId} · ${SUBMITTED}`;
    void thread.append('did', phrase, { rail: phrase, action: actionId }).then(threadChanged);
    if (landed === undefined) return;
    const at = landed.steps.findIndex((step, index) => step.card.actionId === actionId && landed?.done.has(index) !== true);
    if (at < 0) return;
    landed.done.add(at);
    mergeInto(ASSIST_CANVAS, ASSIST_ACTION, { steps: stepsShown(), progress: `${landed.done.size} of ${landed.steps.length}` });
  };

  const reauthor = (): void => {
    reauthorTimer = undefined;
    const written = authoredFrom;
    if (written !== undefined && active === undefined && latest?.text === written.text && siblingsNow() !== written.siblings) launch('idle');
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

  const onFinished = (context: PassContext): void => {
    if (enabled) launch('idle');
    else settledAlone = context;
  };

  return {
    enabled,
    onKeystroke: (text) => {
      disarm();
      if (active !== undefined && active.record.text !== text) abort('The line changed.');
    },

    onPass: (context) => {
      latest = context;
      watch();
      disarm();
      if (active !== undefined && active.record.text !== context.text) abort('The line changed.');
      // A landing sets off a pass on the same text: it must not start a second run.
      if (active === undefined && context.text !== answeredText) {
        timer = setTimeout(() => {
          timer = undefined;
          onFinished(context);
          settleIfIdle();
        }, HANDOFF_IDLE_MS);
      }
      settleIfIdle();
    },

    onNothingAsked: () => {
      disarm();
      latest = undefined;
      abort('The sentence stopped asking for anything.');
      settleIfIdle();
    },

    onClear: (why) => {
      disarm();
      abort(why);
      storeSettledAlone();
      latest = undefined;
      landed = undefined;
      answeredText = '';
      hasReported = false;
      storedLine = '';
      authoredFrom = undefined;
      if (reauthorTimer !== undefined) clearTimeout(reauthorTimer);
      reauthorTimer = undefined;
      submitted.clear();
      sentenceFrom = records.length;
      if (enabled) hideCard();
      threadChanged();
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
      storeSettledAlone();
      await thread.append('break', '');
      storedLine = '';
      threadChanged();
      return 'a new thread';
    },

    earlierTurns: async () => {
      const entries = await thread.entries();
      const current = storedLine === '' ? -1 : entries.findIndex((entry) => entry.line === storedLine && entry.by !== 'pressed');
      return current < 0 ? entries : entries.filter((_, index) => index !== current);
    },

    idle: async () => {
      if (timer !== undefined || reauthorTimer !== undefined || active !== undefined || draining.size > 0) await new Promise<void>((resolve) => waiters.push(resolve));
      await thread.flushed();
    },
    recordEvent: (line, detail) => {
      void thread.append('event', line, detail).then(threadChanged);
    },
    isRunOut: () => active !== undefined,
    brief: async (request, abort) => {
      const llm = agent.llm;
      if (!enabled || llm === undefined) return undefined;
      const predecisions: Predecisions = { sentence: request.event.line, heard: {}, now: { day: request.clock.day, time: request.clock.time }, resolved: [], rows: {}, actions: [], facts: { standing: request.standing }, screen: request.screen, writable: [], wanted: [], asked: [] };
      const nothing: AnswerContext = { allowed: new Set(), definitions: deps.definitions, candidates: {}, writable: [] };
      const outcome = await runAgent({
        llm,
        thread: [],
        predecisions,
        // The line is the whole situation, not only what tipped it: a model answers its
        // last message, and one that names a single cause gets a brief about that cause.
        line: `JUST NOW: ${request.event.line}\nSTANDING, all at once: ${request.standing.map((cause) => `${cause.place} — ${cause.reading} (since ${cause.since})`).join(' | ')}`,
        tools: [],
        abort,
        refusals: (data, response) => {
          const verdict = admitAnswer(nothing, data, response);
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
