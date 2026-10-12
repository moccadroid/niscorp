import type { ActionDefinition } from '@niscorp/nova';
import type { Question } from '@niscorp/signal';
import type { FunctionSession } from '@niscorp/moss';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import { CONTEXT_PACKS } from '@encore/app/vex/context-packs';
import type { FestivalClock } from '@encore/lib/festival-clock';
import type { Decider } from '@encore/server/decider/decider';
import type { AgentLlm } from '@encore/server/agent/llm';
import { parseLine } from './parse';
import { readCandidates } from './candidates';
import { deriveQuestions } from './derive';
import { decideQuestions } from './decide';
import type { DecideState } from './decide';
import { supersede, supersededNotes } from './supersede';
import { resolveScreen } from './resolve';
import { clearScreen, mountedActions, reconcileScreen, writeHeard, writeStory, writeTrace, writeTraceWarm } from './reconcile';
import { referencedTables } from './input-contract';
import { readablePacks } from './context-packs';
import { createPacer, systemClock } from './pacer';
import type { PacerClock } from './pacer';
import { heardTags } from './heard';
import { anchorAfter, continues } from './continuation';
import { createTouchTracker } from './touched';
import { createAssist } from './assist';
import { createWatcher } from '@encore/server/watch/watch';
import type { Watcher } from '@encore/server/watch/watch';
import type { Ceiling } from '@encore/server/watch/ceiling';
import { createReloader } from '@encore/server/watch/reload';
import type { Reloader } from '@encore/server/watch/reload';
import { ENTRIES } from '@encore/app/vex';
import type { ScopePolicy } from '@niscorp/vex';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';
import { STORIES_KEPT, eventStory, sentenceStory, withRun } from './story';
import type { Story, StoryNames } from './story';
import { admit } from './admission';
import type { RailEntry } from './thread';
import type { Message } from '@niscorp/signal';
import type { Answer, CandidateSets, Entity, Parsed, PassRecord, RunRecord } from './intent.types';

// `session.shell` throws until the shell finishes building, and the loop is constructed
// mid-build: nothing here touches it before a terminal is attached.

export type IntentDeps = {
  decider: Decider;
  agent: AgentLlm;
  traceDir?: string;
  clock: FestivalClock;
  definitions: Record<string, ActionDefinition>;
  ceiling: Ceiling;
  now?: () => number;
  policyFor: (roles: readonly string[]) => ScopePolicy;
  pacerClock?: PacerClock;
  onPass?: (principal: string | null, record: PassRecord) => void;
  onRun?: (principal: string | null, record: RunRecord) => void;
  onDecided?: (principal: string | null, decided: DecidedPass) => void;
};

export type DecidedPass = { text: string; questions: Record<string, Question>; answers: Record<string, Answer> };

export type IntentLoop = {
  submit: (text: string) => number;
  promote: (actionId: string) => number;
  runNow: () => string;
  openStep: (index: number) => string;
  newThread: () => Promise<string>;
  earlierTurns: () => Promise<RailEntry[]>;
  lastAgentInput: () => { input: Message[] } | undefined;
  warm: () => string;
  idle: () => Promise<void>;
  settled: () => Promise<void>;
  passes: () => readonly PassRecord[];
  runs: () => readonly RunRecord[];
  holding: () => { pinned: string[]; given: string[]; anchor: string };
  notifyFeed: (table: string) => void;
  watching: () => Watcher;
  reloading: () => Reloader;
  stepStory: (command: string) => string;
  stories: () => readonly Story[];
};

const KEPT_PASSES = 50;

const heardOf = (parsed: Parsed): Record<string, string | number> => ({
  ...(parsed.time !== undefined ? { time: parsed.time } : {}),
  ...(parsed.day !== undefined ? { day: parsed.day } : {}),
  ...(parsed.minutes !== undefined ? { minutes: parsed.minutes } : {}),
  ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
});

export const createIntentLoop = (session: FunctionSession, deps: IntentDeps): IntentLoop => {
  // Per session, and mutated in place by the watcher: both speeds read the same object.
  const clock: FestivalClock = { ...deps.clock };
  const TONES = ['calm', 'elevated', 'critical'] as const;
  let sentenceTone: (typeof TONES)[number] = 'calm';
  let eventTone: (typeof TONES)[number] = 'calm';
  const IDLE = 'Nothing needs attention right now. Say what is happening.';
  let raisedCount = 0;
  const writeIdle = (): void => {
    const shell = session.shell;
    const isIdle = lastText.trim() === '' && raisedCount === 0 && mountedActions(shell).size === 0;
    const instance = shell.getState().canvases['maybe']?.stack.find((item) => item.definitionId === 'intent.options');
    const runtime = instance === undefined ? undefined : shell.getRuntime(instance.id);
    const idle = isIdle ? IDLE : '';
    if (runtime !== undefined && runtime.getData()['idle'] !== idle) runtime.setData({ ...runtime.getData(), idle });
  };
  const packNouns = Object.fromEntries(CONTEXT_PACKS.map((pack) => [pack.id, pack.noun]));
  const names = (): StoryNames => ({ titles, packs: packNouns });
  const stories: { story: Story; record?: PassRecord }[] = [];
  let pinnedStory: string | undefined;
  let lastWarm = '';
  let eventCount = 0;
  const showStory = (): string => {
    const found = pinnedStory === undefined ? -1 : stories.findIndex((entry) => entry.story.key === pinnedStory);
    if (found < 0) pinnedStory = undefined;
    const index = found < 0 ? stories.length - 1 : found;
    const position = stories.length === 0 ? '' : `${index + 1} of ${stories.length}`;
    writeStory(session.shell, { story: stories[index]?.story ?? {}, storyPosition: position, hasEarlier: index > 0, hasLater: index >= 0 && index < stories.length - 1, following: pinnedStory === undefined });
    return position;
  };
  const keepStory = (story: Story, record?: PassRecord): void => {
    stories.push({ story, ...(record === undefined ? {} : { record }) });
    if (stories.length > STORIES_KEPT) stories.shift();
    showStory();
  };
  const stepStory = (command: string): string => {
    const at = pinnedStory === undefined ? stories.length - 1 : stories.findIndex((entry) => entry.story.key === pinnedStory);
    const to = command === 'earlier' ? Math.max(0, at - 1) : command === 'later' ? at + 1 : stories.length - 1;
    pinnedStory = to >= stories.length - 1 ? undefined : stories[to]?.story.key;
    return showStory();
  };
  const attachRun = (run: RunRecord): void => {
    const entry = [...stories].reverse().find((held) => held.record !== undefined && held.record.text === run.text);
    if (entry?.record === undefined) return;
    entry.story = withRun(entry.story, entry.record, run, names());
    showStory();
  };

  const writeFrameTone = (): void => {
    const louder = TONES[Math.max(TONES.indexOf(sentenceTone), TONES.indexOf(eventTone))] ?? 'calm';
    const instance = session.shell.getState().canvases['line']?.stack.find((item) => item.definitionId === 'intent.line');
    const runtime = instance === undefined ? undefined : session.shell.getRuntime(instance.id);
    if (runtime !== undefined && runtime.getData()['tone'] !== louder) runtime.setData({ ...runtime.getData(), tone: louder });
  };
  // In catalog order, not the alphabetical order moss resolves ids in: questions are derived
  // and ties are kept in this order.
  const granted = new Set(session.actions);
  const held = Object.values(deps.definitions).filter((definition) => granted.has(definition.id) && CANVAS_PLACEMENT[definition.id] !== undefined);
  const tables = referencedTables(held);
  const titles = Object.fromEntries(held.map((definition) => [definition.id, definition.title ?? definition.id]));
  const policy = deps.policyFor(session.roles);
  const packs = readablePacks(policy, CONTEXT_PACKS);

  const records: PassRecord[] = [];
  const pinned = new Set<string>();
  const given: Record<string, Record<string, unknown>> = {};
  const placers: Record<string, string> = {};
  const whys: Record<string, string> = {};
  let lastCandidates: CandidateSets = {};
  const touched = createTouchTracker();
  let passCount = 0;
  let lastText = '';
  let anchor = '';
  let sentenceAt = 0;
  let earnedAt = -1;
  let clearedAt = 0;
  let confirmed: readonly Entity[] = [];

  const isWorthAPass = (text: string): boolean => parseLine(text, clock).tokens.length > 0;

  const run = async (text: string, generation: number, waitedMs: number): Promise<void> => {
    if (text.trim() === '') return;
    const started = performance.now();

    const parsed = parseLine(text, clock);
    const afterParse = performance.now();

    const corrected = supersede(text, await readCandidates(session.wire, tables, parsed.tokens));
    const candidates = corrected.candidates;
    const afterCandidates = performance.now();

    if (clearedAt <= generation) writeHeard(session.shell, heardTags(parsed, candidates, undefined, confirmed));

    const derived = deriveQuestions(held, candidates, packs);
    const afterDerive = performance.now();

    // Only labels leave the process on this path, never a row.
    const state: DecideState = { line: text, heard: heardOf(parsed), ...(corrected.superseded.length === 0 ? {} : { superseded: supersededNotes(corrected.superseded) }) };
    const decided = await decideQuestions(deps.decider, state, derived.questions);
    const afterDecide = performance.now();
    deps.onDecided?.(session.principal, { text, questions: derived.questions, answers: decided.answers });

    const shell = session.shell;
    touched.watch(shell);
    lastCandidates = candidates;
    // Hysteresis belongs to a sentence: on the first pass of a new one no card counts as up, or
    // a model that scores everything above the unmount line would never take the old cards down.
    const staying = earnedAt === sentenceAt ? mountedActions(shell) : new Set<string>();
    const resolved = resolveScreen({ line: text, derived, answers: decided.answers, parsed, clock: clock, mounted: staying, pinned, titles, given, placers, whys, candidates });
    const afterResolve = performance.now();

    const applied = clearedAt <= generation;
    const notes = applied ? reconcileScreen(shell, resolved, deps.definitions, touched) : ['dropped: the line was cleared while this pass was out'];
    if (applied && generation >= sentenceAt) earnedAt = sentenceAt;
    if (applied) {
      sentenceTone = resolved.tone;
      writeFrameTone();
    }
    if (applied) {
      confirmed = resolved.handoff.entities;
      writeHeard(shell, heardTags(parsed, candidates, confirmed));
    }
    const finished = performance.now();

    passCount += 1;
    const record: PassRecord = {
      pass: passCount,
      generation,
      text,
      questionCount: decided.questionCount,
      questionNames: Object.keys(derived.questions),
      requestBytes: decided.requestBytes,
      lanes: {
        parse: afterParse - started,
        candidates: afterCandidates - afterParse,
        derive: afterDerive - afterCandidates,
        decide: afterDecide - afterDerive,
        resolve: afterResolve - afterDecide,
        reconcile: finished - afterResolve,
      },
      totalMs: finished - started,
      waitedMs,
      sentAt: started,
      landedAt: finished,
      reusedConnection: decided.reusedConnection,
      top: resolved.top,
      decider: `${deps.decider.id} · ${decided.model}`,
      calibrated: decided.calibrated,
      applied,
      held: resolved.held,
      tone: resolved.tone,
      notes: [...supersededNotes(corrected.superseded).map((note) => `heard: ${note}`), ...notes],
      superseded: corrected.superseded,
      handoff: resolved.handoff,
    };
    records.push(record);
    if (records.length > KEPT_PASSES) records.shift();

    if (applied && generation >= sentenceAt) assist.onPass({ text, parsed, candidates, handoff: resolved.handoff, held: resolved.held });
    writeTrace(shell, record, assist.traceRows());
    keepStory(sentenceStory({ record, heard: heardTags(parsed, candidates, applied ? resolved.handoff.entities : undefined), scored: resolved.scored, names: names(), warm: lastWarm }), record);
    deps.onPass?.(session.principal, record);
  };

  const pacer = createPacer({
    run,
    onError: (error) => console.error('[encore/intent] a pass failed and was skipped:', error),
    clock: deps.pacerClock ?? systemClock,
  });

  const assist = createAssist({
    session,
    policy,
    agent: deps.agent,
    ...(deps.traceDir !== undefined ? { traceDir: deps.traceDir } : {}),
    clock: clock,
    definitions: deps.definitions,
    packs,
    touched,
    adopt: (actionId, input, placedBy, why) => {
      whys[actionId] = why;
      pinned.add(actionId);
      given[actionId] = { ...(given[actionId] ?? {}), ...input };
      placers[actionId] = placedBy;
    },
    onRunStart: () => watcher.yieldToOperator(),
    repass: () => {
      pacer.submit(lastText, { now: true });
    },
    onRun: (principal, run) => {
      attachRun(run);
      deps.onRun?.(principal, run);
    },
  });

  const reloader = createReloader({
    session,
    definitions: deps.definitions,
    entries: ENTRIES,
    sentenceCanvases: QUESTION_CANVASES,
    eventCanvases: ['attention'],
    saidInSentence: () => {
      const said = parseLine(lastText, clock);
      return new Set([...(said.day !== undefined ? ['day'] : []), ...(said.hour !== undefined ? ['hour'] : []), ...(said.time !== undefined ? ['time'] : [])]);
    },
    isTouched: (instanceId, key) => touched.isTouched(instanceId, key),
    willWrite: (instanceId, input) => touched.willWrite(instanceId, input),
  });

  const watcher = createWatcher({
    session,
    policy,
    decider: deps.decider,
    definitions: deps.definitions,
    clock,
    ceiling: deps.ceiling,
    now: deps.now ?? Date.now,
    recordEvent: (line, detail) => assist.recordEvent(line, detail),
    setEventTone: (tone) => {
      eventTone = tone;
      writeFrameTone();
    },
    isOperatorRunOut: () => assist.isRunOut(),
    onClock: (from, to) => reloader.clockMoved(from, to),
    onRaised: (count) => {
      raisedCount = count;
      writeIdle();
    },
    brief: (request, abort) => assist.brief(request, abort),
    onEventPass: (told) => {
      eventCount += 1;
      keepStory(eventStory({ ...told, count: eventCount, names: names() }));
    },
  });

  // Asked several times over: a landing run sets off a pass, and a pass can arm a handoff.
  const settled = async (): Promise<void> => {
    const SETTLE_ROUNDS = 8;
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
      await pacer.idle();
      await assist.idle();
      await watcher.idle();
      await reloader.idle();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  };

  const forgetSentence = (why: string): void => {
    confirmed = [];
    pinned.clear();
    for (const key of Object.keys(given)) delete given[key];
    for (const key of Object.keys(placers)) delete placers[key];
    for (const key of Object.keys(whys)) delete whys[key];
    assist.onClear(why);
    touched.reset();
  };

  return {
    submit: (text) => {
      const isEmpty = text.trim() === '';
      // A new sentence drops everything held but not the screen: the pass on the new text takes
      // down what Jev no longer wants.
      const isNewSentence = !isEmpty && !continues(anchor, text);
      anchor = isEmpty ? '' : anchorAfter(anchor, text);
      lastText = text;
      writeIdle();
      assist.onKeystroke(text);
      // Too short to decide about: the screen clears, but what the sentence holds survives a retype.
      const isWorth = !isEmpty && isWorthAPass(text);
      const generation = isWorth ? pacer.submit(text) : pacer.cancel();
      if (!isWorth && !isEmpty) {
        clearedAt = generation;
        assist.onNothingAsked();
        clearScreen(session.shell);
        sentenceTone = 'calm';
        writeFrameTone();
        writeHeard(session.shell, heardTags(parseLine(text, clock), {}));
      }
      if (isNewSentence) {
        sentenceAt = generation;
        forgetSentence('A different sentence was typed over this one.');
      }
      if (isEmpty) {
        clearedAt = generation;
        sentenceAt = generation;
        forgetSentence('The line was cleared.');
        clearScreen(session.shell);
        writeIdle();
        sentenceTone = 'calm';
        writeFrameTone();
      }
      return generation;
    },
    promote: (actionId) => {
      // A terminal can send any string as the id, so a click goes through the admission rule.
      const admitted = admit({ allowed: new Set(Object.keys(titles)), definitions: deps.definitions, candidates: lastCandidates }, actionId, {}, { partial: true });
      if (admitted.ok) {
        pinned.add(admitted.actionId);
        placers[admitted.actionId] = 'you';
        whys[admitted.actionId] = 'You opened this.';
      }
      return pacer.submit(lastText, { now: true });
    },
    warm: () => {
      void deps.decider.warm().then((result) => {
        lastWarm = result.outcome === 'fresh' ? 'already warm' : `${result.outcome}, ${Math.round(result.ms)} ms`;
        writeTraceWarm(session.shell, result);
      });
      return 'warming';
    },
    runNow: () => {
      if (lastText.trim() === '') return 'nothing to run';
      // Enter may beat the pass for the last keystroke, and the run is for a landed pass.
      void pacer.idle().then(() => assist.runNow());
      return assist.enabled ? 'started' : 'off';
    },
    openStep: (index) => assist.openStep(index),
    newThread: () => assist.newThread(),
    earlierTurns: () => assist.earlierTurns(),
    lastAgentInput: () => assist.lastInput(),
    idle: pacer.idle,
    settled,
    passes: () => records,
    runs: () => assist.runs(),
    holding: () => ({ pinned: [...pinned], given: Object.keys(given), anchor }),
    notifyFeed: (table) => {
      reloader.tableChanged(table);
      watcher.notify(table);
    },
    watching: () => watcher,
    reloading: () => reloader,
    stepStory,
    stories: () => stories.map((entry) => entry.story),
  };
};
