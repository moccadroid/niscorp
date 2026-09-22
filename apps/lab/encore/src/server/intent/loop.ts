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
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';
import { STORIES_KEPT, eventStory, sentenceStory, withRun } from './story';
import type { Story, StoryNames } from './story';
import { admit } from './admission';
import type { RailEntry } from './thread';
import type { Message } from '@niscorp/signal';
import type { Answer, CandidateSets, Entity, Parsed, PassRecord, RunRecord } from './intent.types';

// ═══════════════════════════════════════════════════════════
// THE LOOP, for one session — both speeds of it.
//
//   keystroke → encore.intent (returns at once)
//     parse → candidates → derive → decide → resolve → reconcile     the pass
//                                              └→ handoff → assist    the run
//
// THE PASS is Jev's: milliseconds, never aborted, always lands. THE RUN is the
// agent's: seconds, abortable, and started only when the pass itself said the
// sentence needs words or reasoning — or left Jev with nothing (assist.ts).
// They share one sentence, one set of candidate rows, one admission rule and
// one rule about what a person has touched — and nothing else: the pass never
// waits on the run.
//
// JEV IS HANDED ONE SENTENCE AND NOTHING BEFORE IT. The agent has a thread; the
// pass has none and wants none — it is a pure function of the line, which is
// what makes it cacheable, replayable and checkable (DESIGN.md § The thread).
// The only state sent is built in `run` below, from `text` and what the parser
// read in it.
//
// One of these exists per living shell. It closes over the session, so every
// read it makes is the caller's read and every question it derives is from the
// caller's catalog — there is no shared state between two people's rooms, and
// nothing here could leak one into the other.
//
// `session.shell` throws until the shell finishes building, and this is
// constructed mid-build: it is touched only inside `submit`, `promote`, a pass
// and a run, all of which can only happen once a terminal is attached.
// ═══════════════════════════════════════════════════════════

export type IntentDeps = {
  decider: Decider;
  agent: AgentLlm;
  // Where ENCORE_TRACE_DIR points, if anywhere.
  traceDir?: string;
  clock: FestivalClock;
  definitions: Record<string, ActionDefinition>;
  // The ceiling on event passes per second, shared by every session.
  ceiling: Ceiling;
  // Wall-clock milliseconds, for the brief's rate limit. Absent = Date.now; a
  // check that has to cross ten seconds hands in its own.
  now?: () => number;
  // The pacer's clock. Absent = the system's; a check that wants to watch the
  // debounce without sleeping hands in its own.
  pacerClock?: PacerClock;
  // For whoever is measuring: every pass and every run, as it completes.
  onPass?: (principal: string | null, record: PassRecord) => void;
  onRun?: (principal: string | null, record: RunRecord) => void;
  // What was asked and what came back, whole. A pass record keeps the numbers;
  // tuning a description against a real model needs the answers themselves.
  onDecided?: (principal: string | null, decided: DecidedPass) => void;
};

export type DecidedPass = { text: string; questions: Record<string, Question>; answers: Record<string, Answer> };

export type IntentLoop = {
  submit: (text: string) => number;
  promote: (actionId: string) => number;
  // Enter: start the agent now, whatever Jev thought of the sentence.
  runNow: () => string;
  openStep: (index: number) => string;
  // The operator's "new thread" control, and the rows the answer card lists.
  newThread: () => Promise<string>;
  earlierTurns: () => Promise<RailEntry[]>;
  lastAgentInput: () => { input: Message[] } | undefined;
  // The line took focus: somebody is about to type. Open the connection now.
  warm: () => string;
  // The fast path at rest: no pass running or waiting.
  idle: () => Promise<void>;
  // BOTH at rest: no pass, no armed handoff, no run — and no pass a landing
  // run set off in turn.
  settled: () => Promise<void>;
  passes: () => readonly PassRecord[];
  runs: () => readonly RunRecord[];
  // What the loop is holding for the sentence on the line — for a check that
  // has to prove a new sentence left none of it behind.
  holding: () => { pinned: string[]; given: string[]; anchor: string };
  // THE ROOM THAT WATCHES (server/watch): told that a table was written.
  notifyFeed: (table: string) => void;
  watching: () => Watcher;
  reloading: () => Reloader;
  // X-RAY'S STEPPER: 'earlier' · 'later' · 'latest'. Returns "3 of 14".
  stepStory: (command: string) => string;
  stories: () => readonly Story[];
};

// Enough history to read a typing burst back; not a log.
const KEPT_PASSES = 50;

const heardOf = (parsed: Parsed): Record<string, string | number> => ({
  ...(parsed.time !== undefined ? { time: parsed.time } : {}),
  ...(parsed.day !== undefined ? { day: parsed.day } : {}),
  ...(parsed.minutes !== undefined ? { minutes: parsed.minutes } : {}),
  ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
});

export const createIntentLoop = (session: FunctionSession, deps: IntentDeps): IntentLoop => {
  // THIS SESSION'S CLOCK. It was a constant; it is a row now, advanced by whoever
  // feeds the festival, and re-read under this session's own policy by its
  // watcher — so it is a per-session object, mutated in place, and both speeds
  // read the same one. Until something advances it, it is what boot pinned.
  const clock: FestivalClock = { ...deps.clock };
  // THE FRAME'S TONE IS THE LOUDER OF TWO: what the sentence describes, and what
  // the festival is doing. The second decays by itself when its cause leaves.
  const TONES = ['calm', 'elevated', 'critical'] as const;
  let sentenceTone: (typeof TONES)[number] = 'calm';
  let eventTone: (typeof TONES)[number] = 'calm';
  // AN IDLE ROOM SAYS SO: no sentence, no card, nothing raised.
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
  // X-RAY'S STORIES. One per pass and one per event pass, the last few kept, so a
  // run that landed is not overwritten by the next keystroke's pass: the panel
  // FOLLOWS the newest until somebody steps back, and then stays where they put
  // it. X-ray itself is the panel being open — its own data, flipped by its own
  // trigger; the loop does not know and the app's cards are never told.
  const packNouns = Object.fromEntries(CONTEXT_PACKS.map((pack) => [pack.id, pack.noun]));
  // (`titles` is the session's catalog, resolved further down.)
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
  // A RUN BELONGS TO ITS TEXT: it is told on the newest story of that sentence —
  // and it lands there even if the panel is looking elsewhere.
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
  // THE CATALOG IS THE SESSION'S. `session.actions` is ring 1, resolved by
  // moss — ids only, so they are joined against the definitions here. The
  // filter on placement is what keeps furniture out: `intent.line` is held,
  // and is never a question.
  //
  // In CATALOG order, not the alphabetical order moss resolves ids in: it is
  // the order questions are derived in and the order ties keep when the slow
  // path's catalog is narrowed to Jev's top few, and "as authored" is a better
  // tie-break than "as spelled".
  const granted = new Set(session.actions);
  const held = Object.values(deps.definitions).filter((definition) => granted.has(definition.id) && CANVAS_PLACEMENT[definition.id] !== undefined);
  const tables = referencedTables(held);
  const titles = Object.fromEntries(held.map((definition) => [definition.id, definition.title ?? definition.id]));
  // The context packs this principal may even be asked about: the ones their
  // own compiled policy can read.
  const packs = readablePacks(session.policy, CONTEXT_PACKS);

  const records: PassRecord[] = [];
  const pinned = new Set<string>();
  // What the slow path opened cards with, by action id (resolve.ts `given`).
  const given: Record<string, Record<string, unknown>> = {};
  // WHO PUT A CARD UP, when it was not Jev: `you` for a chip the operator
  // clicked, the text model's name and step for a card a plan opened. Every
  // card's header says one of these or `jev 0.89` (resolve.ts).
  const placers: Record<string, string> = {};
  // ...and the same in plain words, for a card's own "why?".
  const whys: Record<string, string> = {};
  // The rows of the last landed pass — what a clicked chip is admitted against.
  let lastCandidates: CandidateSets = {};
  const touched = createTouchTracker();
  let passCount = 0;
  let lastText = '';
  // The furthest the sentence on the line has been typed (continuation.ts).
  let anchor = '';
  // The generation at which the current sentence began. A pass started under
  // the PREVIOUS sentence still lands — passes always do — but it has no say in
  // the slow path: it is about words that are no longer on the line.
  let sentenceAt = 0;
  // The sentence (by its `sentenceAt`) whose passes have put the current cards up:
  // what unmount hysteresis is allowed to remember.
  let earnedAt = -1;
  // The generation of the most recent clear. A pass started before it answers
  // a sentence that is no longer on the line, and must not repopulate a room
  // the operator just emptied.
  let clearedAt = 0;
  // The rows the last landed pass confirmed — what keeps a tag from blinking
  // back to a guess while the next pass is out (heard.ts).
  let confirmed: readonly Entity[] = [];

  // IS THERE ANYTHING TO DECIDE? The parser drops tokens shorter than three
  // characters, so a line with none left ("s", "st", "at 9") gives retrieval
  // nothing to find and the model nothing to match: a pass on it is a round
  // trip to be told nothing. It is not sent.
  const isWorthAPass = (text: string): boolean => parseLine(text, clock).tokens.length > 0;

  const run = async (text: string, generation: number, waitedMs: number): Promise<void> => {
    if (text.trim() === '') return;
    const started = performance.now();

    const parsed = parseLine(text, clock);
    const afterParse = performance.now();

    // A CORRECTION IS READ HERE, not judged later: a row the sentence took back
    // leaves the candidate sets before a question is derived from them, so it is
    // not something any model can pick (supersede.ts).
    const corrected = supersede(text, await readCandidates(session.wire, tables, parsed.tokens));
    const candidates = corrected.candidates;
    const afterCandidates = performance.now();

    // THE INSTANT LANE. Parsing and retrieval are local and took ~10 ms; the
    // decision is a network away. What was HEARD — the values read, the rows
    // matched — goes on the line now, as matches and labelled as such, so the
    // operator sees they were understood a third of a second before the room
    // moves. The pass below confirms them or drops them.
    if (clearedAt <= generation) writeHeard(session.shell, heardTags(parsed, candidates, undefined, confirmed));

    const derived = deriveQuestions(held, candidates, packs);
    const afterDerive = performance.now();

    // ONLY LABELS LEAVE THE PROCESS: the line, what the parser heard in it,
    // action and pack descriptions, candidate labels. No row ever does — not
    // on this path. (The slow path sends the rows of the packs Jev chose.)
    const state: DecideState = { line: text, heard: heardOf(parsed), ...(corrected.superseded.length === 0 ? {} : { superseded: supersededNotes(corrected.superseded) }) };
    const decided = await decideQuestions(deps.decider, state, derived.questions);
    const afterDecide = performance.now();
    deps.onDecided?.(session.principal, { text, questions: derived.questions, answers: decided.answers });

    const shell = session.shell;
    touched.watch(shell);
    lastCandidates = candidates;
    // HYSTERESIS BELONGS TO A SENTENCE. It exists so a card does not flicker while
    // ONE sentence is being typed — not so that the last sentence's cards can sit
    // out the next one. With the unmount line at 0.35, a model that has a middling
    // opinion of everything (0.4, say) would never take a card down again: typed
    // over, the old room would simply stay. So the first pass of a new sentence
    // gives nothing the benefit of being up — every card re-earns the mount line,
    // and one that does keeps its instance, untouched.
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
    // Jev has spoken: a matched row it picked is CONFIRMED, one it did not is
    // dropped. Parsed values stay — they were read, never judged.
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

    // The handoff is decided AFTER the cards are down and BEFORE the trace is
    // written, so the card announcing a run and the cards Jev placed leave in
    // the same frame, and the trace row already says `pending`.
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
      // Nobody typed this pass, so there is no burst to wait out.
      pacer.submit(lastText, { now: true });
    },
    onRun: (principal, run) => {
      attachRun(run);
      deps.onRun?.(principal, run);
    },
  });

  // A WRITE LANDED: the cards showing those rows re-read (watch/reload.ts).
  const reloader = createReloader({
    session,
    definitions: deps.definitions,
    entries: ENTRIES,
    sentenceCanvases: QUESTION_CANVASES,
    eventCanvases: ['attention'],
    // What the sentence on the line said about time: those fields are its own.
    saidInSentence: () => {
      const said = parseLine(lastText, clock);
      return new Set([...(said.day !== undefined ? ['day'] : []), ...(said.hour !== undefined ? ['hour'] : []), ...(said.time !== undefined ? ['time'] : [])]);
    },
    isTouched: (instanceId, key) => touched.isTouched(instanceId, key),
    willWrite: (instanceId, input) => touched.willWrite(instanceId, input),
  });

  const watcher = createWatcher({
    session,
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

  // Both speeds at rest. A landing run sets off a pass, and a pass can arm a
  // handoff — so it is asked again until one full look finds nothing moving.
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

  // EVERYTHING HELD FOR A SENTENCE, let go. Pins, what the slow path opened
  // cards with, who placed what, what a person touched, the outcomes remembered
  // per handoff, any run in flight and the card that reports it — all of it is
  // a vote about one sentence, and goes when that sentence does.
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
      // A NEW SENTENCE IS A NEW ROOM — and nobody empties a line to start one:
      // they select it and type over it. So the test is not "is the line
      // empty" but "is this still the sentence the room was built for"
      // (continuation.ts). The first keystroke that breaks the relation is
      // treated exactly like a clear for everything HELD — and not at all for
      // the screen: the pass below runs on the new text as it always would,
      // and ordinary unmount hysteresis takes down whatever Jev no longer
      // wants now that nothing is pinning it up.
      const isNewSentence = !isEmpty && !continues(anchor, text);
      anchor = isEmpty ? '' : anchorAfter(anchor, text);
      lastText = text;
      // Gone at the first key; back when the line and the room are empty again.
      writeIdle();
      // A keystroke is the line not being idle: whatever handoff was armed is
      // disarmed, and the pass this starts will decide again.
      assist.onKeystroke(text);
      // A line with nothing to decide about is not sent — and whatever a longer
      // line put up comes down now, the way it does for an empty one: "st" is
      // not an intent, whether it was typed or backspaced to. What the
      // sentence HOLDS survives; it may be about to be retyped.
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
        // AN EMPTY LINE IS AN EMPTY ROOM, NOW — not after whatever pass is
        // out, and not after whatever run is.
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
      // A chip carries an action id back from a terminal, and a terminal can
      // send any string — so a click goes through the SAME admission rule as a
      // plan step and an agent's card (admission.ts). `partial`: a chip opens a
      // card with nothing, and Jev aims it on the pass this sets off.
      const admitted = admit({ allowed: new Set(Object.keys(titles)), definitions: deps.definitions, candidates: lastCandidates }, actionId, {}, { partial: true });
      if (admitted.ok) {
        pinned.add(admitted.actionId);
        placers[admitted.actionId] = 'you';
        whys[admitted.actionId] = 'You opened this.';
      }
      return pacer.submit(lastText, { now: true });
    },
    warm: () => {
      // Fire and forget: the focus event must not wait on a network.
      void deps.decider.warm().then((result) => {
        lastWarm = result.outcome === 'fresh' ? 'already warm' : `${result.outcome}, ${Math.round(result.ms)} ms`;
        writeTraceWarm(session.shell, result);
      });
      return 'warming';
    },
    runNow: () => {
      if (lastText.trim() === '') return 'nothing to run';
      // Enter may beat the pass for the last keystroke. The run is FOR a
      // landed pass, so it waits for the fast path — milliseconds — first.
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
    // Both halves hear it: the cards that show the table re-read at once, and
    // the watcher re-reads the feeds among them and asks Jev.
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
