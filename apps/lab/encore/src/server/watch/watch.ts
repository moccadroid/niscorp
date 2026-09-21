import { z } from 'zod';
import type { ActionDefinition, FetchFn, Shell } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { ATTENTION_STRIP_ID } from '@encore/app/actions/frame/attention-strip.action';
import { CLOCK_CHANNEL } from '@encore/app/actions/frame/director-deck.action';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import { CARD_SPAN, TILE_SPAN, tileOf } from '@encore/app/canvas-placement';
import type { EventStoryInput } from '@encore/server/intent/story';
import { RAISED_FRAGMENT } from '@encore/app/shell/fragments/raised.fragment';
import { clockNow, feedGates, feedIncidents, feedScans, feedZoneCounts, labelsSince } from '@encore/app/vex/watch.entries';
import type { FestivalClock } from '@encore/lib/festival-clock';
import { DaySchema } from '@encore/lib/festival-clock';
import type { Decider } from '@encore/server/decider/decider';
import { readCandidates } from '@encore/server/intent/candidates';
import { canRead } from '@encore/server/intent/context-packs';
import { decideQuestions } from '@encore/server/intent/decide';
import { EVENT_AUDIENCE, EVENT_INTERRUPT, EVENT_URGENCY, deriveQuestions } from '@encore/server/intent/derive';
import { referencedTables } from '@encore/server/intent/input-contract';
import { FILL_AT, MOUNT_AT, UNMOUNT_AT, inputOf, probabilityOf } from '@encore/server/intent/resolve';
import type { Ceiling } from './ceiling';
import { GateRows, IncidentRows, ScanRows, ZoneCountRows, eventsFrom, withoutBand } from './events';
import type { FeedEvent, FeedRows } from './events';

// ═══════════════════════════════════════════════════════════
// THE ROOM WATCHES — one of these per live session (DESIGN.md § The room
// watches).
//
//   a write lands → moss says { table, op, count } and nothing else
//     → `notify(table)`                     this file, per session
//        coalesce → RE-READ what changed, over THIS session's wire, under THIS
//        session's policy → merge by kind and place → for each thing that
//        happened, THE SAME PASS a sentence gets — derive → decide → resolve →
//        reconcile — with the EVENT as the state, onto `attention` and nothing
//        else.
//
// EVERYTHING HERE IS THE LOOP'S OTHER HALF, and keeps the loop's law: it places
// cards. It never writes — a label is the operator's click, through the raised
// card's own endpoint — and it never notifies, toggles or sends. `law-check`
// reads this directory too.
//
// PERMISSION IS EXISTENCE, FOR EVENTS TOO. A feed this principal's policy cannot
// read is never re-read, so an event in it never becomes a state, a question or
// a card. No line here knows who the liaison is.
//
// COALESCING IS THE PACER'S IDEA AGAIN: single-flight, with whatever landed
// while a batch was out folded into the next — by kind and place, so a storm of
// scans is one state. A ceiling shared by every session bounds event passes per
// second; the trace says when it bit. A SENTENCE IS NEVER BEHIND ANY OF THIS: it
// has its own pacer, and the decider serves both at once.
//
// RAISING HAS HYSTERESIS, LIKE MOUNTING, and for the same reason — a calibrated
// model has a middling opinion about nearly everything, so "is this worth the
// operator's eyes" sits near a line more often than it sits at zero. A cause
// goes up at INTERRUPT_AT and stays until it falls under INTERRUPT_LEAVE_AT.
// ═══════════════════════════════════════════════════════════

export const INTERRUPT_AT = 0.7;
export const INTERRUPT_LEAVE_AT = 0.5;
// How many raised cards are SHOWN. Never how many may be raised: the rest fold
// into a counted line, are on the rail, and come up as room is made.
export const ATTENTION_SHOWN = 4;
// The agent says one line about an event only when Jev called it critical and
// was this sure of the pick — and then at most this often.
export const BRIEF_CONFIDENCE_AT = 0.6;
export const BRIEF_EVERY_MS = 10_000;
// COALESCING, LIKE KEYSTROKES: a batch is read once the feeds have been quiet
// for a beat, or this long after the first write of it — whichever is first.
// A scanner does not write once; it writes three hundred times in a minute.
export const EVENT_QUIET_MS = 120;
export const EVENT_CEILING_MS = 500;

const ATTENTION_CANVAS = 'attention';
const STRIP_CANVAS = 'watch';
const WATCH_ORIGIN = 'watch';
const URGENCY_WORDS = ['routine', 'warning', 'critical'] as const;
const URGENCY_TONES = ['mute', 'warn', 'alert'] as const;
const FRAME_TONES = ['calm', 'elevated', 'critical'] as const;

export type Raised = {
  cause: string;
  actionId: string;
  input: Record<string, unknown>;
  event: FeedEvent;
  urgency: number;
  // The numbers of the pass that raised it — what a label is stored with.
  probabilities: Record<string, number>;
  order: number;
  at: string;
  instanceId: string | undefined;
};

// EVERY EVENT IS EXACTLY ONE OF FOUR THINGS, so the strip's line adds up:
// `raised` (a card went up), `nothing` (asked, or gone, with no card to show for
// it), `alreadyUp` (its card was up and stays up), `left` (its card came down —
// the cause closed, or fell back under the line). A dismissal is a click, not
// an event, and is counted apart.
export type WatchStats = { rows: number; events: number; passes: number; raised: number; nothing: number; alreadyUp: number; left: number; dismissed: number; deferred: number; deferredMs: number; briefs: number; briefsSkipped: number };

// A cause that is up, as the agent is handed it: where, what kind of thing, how
// bad, the reading in full, and since when.
export type StandingCause = { place: string; kind: string; band: string; reading: string; since: string };

export type BriefRequest = { event: FeedEvent; standing: readonly StandingCause[]; screen: { canvas: string; card: string; aimedAt: Record<string, unknown> }[]; clock: FestivalClock };

export type WatchDeps = {
  session: FunctionSession;
  decider: Decider;
  definitions: Record<string, ActionDefinition>;
  // THIS session's clock: advanced here when the row is, read by both speeds.
  clock: FestivalClock;
  ceiling: Ceiling;
  now: () => number;
  // The flagged event, as a turn: "18:42 · Food Court 96% — raised".
  recordEvent: (line: string, detail: Record<string, unknown>) => void;
  // The louder of the sentence's tone and this one's is the frame's.
  setEventTone: (tone: (typeof FRAME_TONES)[number]) => void;
  isOperatorRunOut: () => boolean;
  // How many causes are up, after every batch — what "is the room idle?" reads.
  onRaised: (count: number) => void;
  // The clock row moved: cards that follow it are re-aimed (watch/reload.ts).
  onClock: (from: FestivalClock, to: FestivalClock) => void;
  // One line from the agent, or undefined (no agent, aborted, failed).
  brief: (request: BriefRequest, abort: AbortSignal) => Promise<string | undefined>;
  // One call per event pass that reached Jev: what x-ray's story is told from.
  onEventPass?: (told: Omit<EventStoryInput, 'count' | 'names'>) => void;
};

export type Watcher = {
  notify: (table: string) => void;
  // An operator run starts: a brief in flight gives way.
  yieldToOperator: () => void;
  idle: () => Promise<void>;
  stats: () => WatchStats;
  raised: () => readonly Raised[];
};

const FEEDS = [
  { table: 'zone_counts', entry: feedZoneCounts },
  { table: 'incidents', entry: feedIncidents },
  { table: 'gates', entry: feedGates },
  { table: 'gate_scans', entry: feedScans },
] as const;

const Rev = z.array(z.object({ rev: z.number() }).loose());
const Clock = z.object({ day: DaySchema, minute: z.number() });
const Labels = z.array(z.object({ seq: z.number(), verdict: z.string(), cause: z.string() }).loose());

const timeOf = (minute: number): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const tablesOf = (entry: (typeof FEEDS)[number]['entry']): string[] => entry.dsl.from.flatMap((source) => (typeof source === 'string' ? [source] : []));

export const createWatcher = (deps: WatchDeps): Watcher => {
  const { session } = deps;
  const post = (wire: FetchFn, fingerprint: string, context: Record<string, unknown>): ReturnType<FetchFn> =>
    wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });

  // Only what this principal holds AND the room could place: a view, never a
  // form. An event does not open a form for anybody.
  const granted = new Set(session.actions);
  const views = Object.values(deps.definitions).filter((definition) => granted.has(definition.id) && CANVAS_PLACEMENT[definition.id] !== undefined && CANVAS_PLACEMENT[definition.id] !== 'doing');
  const tables = referencedTables(views);
  const canShow = granted.has(ATTENTION_STRIP_ID);
  // The feeds this policy can read, every table of each. The rest do not exist.
  const feeds = FEEDS.filter((feed) => tablesOf(feed.entry).every((table) => canRead(session.policy, table)));

  const cursors = new Map<string, number>();
  let labelCursor = 0;
  const dirty = new Set<string>();
  const raised = new Map<string, Raised>();
  // Causes the operator dismissed, with the band they were dismissed at: held
  // down until the cause changes band or leaves — a dismissal means "I have seen
  // THIS", not "never tell me about the Food Court again".
  const dismissed = new Map<string, string>();
  const stats: WatchStats = { rows: 0, events: 0, passes: 0, raised: 0, nothing: 0, alreadyUp: 0, left: 0, dismissed: 0, deferred: 0, deferredMs: 0, briefs: 0, briefsSkipped: 0 };
  let order = 0;
  let running: Promise<void> | undefined;
  let lastBriefAt = Number.NEGATIVE_INFINITY;
  let briefing: { controller: AbortController; done: Promise<void> } | undefined;
  let briefLine = '';
  // The causes that were standing when the brief was written. It is a sentence
  // ABOUT them: when any of them leaves, it is about a situation that no longer
  // exists, and it comes down — the next critical event writes a fresh one.
  let briefOver: ReadonlySet<string> = new Set();

  // WHERE "NOW" IS. Read once, at the start, with cursor 0: the newest row's
  // `rev` is the cursor, and nothing already in the database is news.
  const started: Promise<void> = (async () => {
    for (const feed of feeds) {
      const response = await post(session.wire, feed.entry.fingerprint, { after: 0 });
      const rows = response.ok ? Rev.safeParse(await response.json()) : undefined;
      cursors.set(feed.table, rows?.success === true ? (rows.data[0]?.rev ?? 0) : 0);
    }
  })().catch((error: unknown) => console.error('[encore/watch] could not find the start of the feeds:', error));

  // ─── the screen ────────────────────────────────────────────

  const mergeInto = (shell: Shell, canvas: string, actionId: string, patch: Record<string, unknown>): void => {
    const instanceId = shell.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId)?.id;
    const runtime = instanceId === undefined ? undefined : shell.getRuntime(instanceId);
    if (runtime !== undefined) runtime.setData({ ...runtime.getData(), ...patch });
  };

  // A raised card carries a sentence and two buttons over its body, so it is
  // never narrower than `regular`, whatever the card under it would be.
  const chromeOf = (entry: Raised): Record<string, unknown> => ({
    ...tileOf(entry.actionId),
    ...(CARD_SPAN[entry.actionId] === 'compact' ? { [TILE_SPAN]: 'regular' } : {}),
    cause: entry.cause,
    raisedCard: entry.actionId,
    causeLine: withoutBand(entry.event),
    raisedAt: entry.at,
    raisedBand: URGENCY_WORDS[entry.urgency] ?? 'routine',
    raisedTone: URGENCY_TONES[entry.urgency] ?? 'mute',
    raisedBy: `jev ${(entry.probabilities[`action/${entry.actionId}`] ?? 0).toFixed(2)}`,
    raisedWith: JSON.stringify(entry.probabilities),
  });

  // ONE CANVAS, AND ONLY THAT CANVAS. The most urgent few are shown; a cause
  // that is folded is still raised, still on the rail, and comes up the moment
  // there is room.
  const render = (): void => {
    if (!canShow) return;
    const shell = session.shell;
    const ranked = [...raised.values()].sort((a, b) => b.urgency - a.urgency || b.order - a.order);
    const shown = ranked.slice(0, ATTENTION_SHOWN);
    for (const entry of ranked.slice(ATTENTION_SHOWN)) {
      if (entry.instanceId !== undefined) shell.removeInstance(ATTENTION_CANVAS, entry.instanceId);
      entry.instanceId = undefined;
    }
    for (const entry of shown) {
      const runtime = entry.instanceId === undefined ? undefined : shell.getRuntime(entry.instanceId);
      const isAimedElsewhere = runtime !== undefined && Object.entries(entry.input).some(([key, value]) => JSON.stringify(runtime.getData()[key]) !== JSON.stringify(value));
      if (runtime !== undefined && !isAimedElsewhere) {
        runtime.setData({ ...runtime.getData(), ...chromeOf(entry) });
        continue;
      }
      if (entry.instanceId !== undefined) shell.removeInstance(ATTENTION_CANVAS, entry.instanceId);
      entry.instanceId = shell.push(ATTENTION_CANVAS, entry.actionId, { ...entry.input, ...chromeOf(entry) }, [RAISED_FRAGMENT], { origin: WATCH_ORIGIN });
    }

    const loudest = ranked.reduce((most, entry) => Math.max(most, entry.urgency), 0);
    deps.setEventTone(FRAME_TONES[loudest] ?? 'calm');
    deps.onRaised(ranked.length);
    const folded = ranked.length - shown.length;
    mergeInto(shell, STRIP_CANVAS, ATTENTION_STRIP_ID, {
      events: stats.events,
      raised: stats.raised,
      showing: shown.length,
      folded,
      // Four numbers that ADD UP to the first: every event is one of them.
      say: `${stats.events} event${stats.events === 1 ? '' : 's'} · ${stats.raised} raised · ${stats.nothing} nothing · ${stats.alreadyUp} already up · ${stats.left} left`,
      foldedSay: folded === 0 ? '' : `+${folded} more raised, not shown: ${ranked.slice(ATTENTION_SHOWN).map((entry) => entry.event.short).join(' · ')}`,
      ceilingSay: stats.deferred === 0 ? '' : `ceiling held ${stats.deferred} pass${stats.deferred === 1 ? '' : 'es'} back, ${Math.round(stats.deferredMs)} ms in all`,
      brief: briefLine,
      rows: stats.rows,
      passes: stats.passes,
    });
  };

  // True when there was a card to take down.
  const comeDown = (cause: string): boolean => {
    const entry = raised.get(cause);
    if (entry === undefined) return false;
    if (entry.instanceId !== undefined && canShow) session.shell.removeInstance(ATTENTION_CANVAS, entry.instanceId);
    raised.delete(cause);
    if (briefOver.has(cause)) {
      briefLine = '';
      briefOver = new Set();
    }
    return true;
  };

  // ─── the agent's one line ──────────────────────────────────

  const maybeBrief = (event: FeedEvent, urgency: number, confidence: number): void => {
    if (urgency < 2 || confidence < BRIEF_CONFIDENCE_AT) return;
    // THE OPERATOR'S RUN COMES FIRST, and a brief is not worth a queue: one that
    // cannot go now is not sent later about a moment that has passed.
    if (deps.isOperatorRunOut() || briefing !== undefined || deps.now() - lastBriefAt < BRIEF_EVERY_MS) {
      stats.briefsSkipped += 1;
      return;
    }
    lastBriefAt = deps.now();
    const controller = new AbortController();
    // EVERY cause that is up, not only the one that tipped it: the line worth
    // writing is about how they compound.
    const standing = [...raised.values()].map((entry): StandingCause => ({ place: entry.event.place, kind: entry.event.kind, band: URGENCY_WORDS[entry.urgency] ?? 'routine', reading: entry.event.line, since: entry.at }));
    const over = new Set(raised.keys());
    const screen = [...raised.values()].map((entry) => ({ canvas: ATTENTION_CANVAS, card: entry.actionId, aimedAt: entry.input }));
    const done = deps
      .brief({ event, standing, screen, clock: { ...deps.clock } }, controller.signal)
      .then((line) => {
        if (line === undefined || controller.signal.aborted) return;
        stats.briefs += 1;
        // Written over causes that have ALL stood until now — or it is already
        // about something that is over.
        if ([...over].every((cause) => raised.has(cause))) {
          briefLine = line;
          briefOver = over;
        }
        render();
      })
      .catch((error: unknown) => console.error('[encore/watch] a brief failed:', error))
      .finally(() => {
        briefing = undefined;
      });
    briefing = { controller, done };
  };

  // ─── one event, one pass ───────────────────────────────────

  const pass = async (event: FeedEvent): Promise<void> => {
    stats.events += 1;
    // A cause that has LEFT takes its card with it; nobody is asked.
    if (event.gone) {
      dismissed.delete(event.key);
      if (comeDown(event.key)) stats.left += 1;
      else stats.nothing += 1;
      return;
    }
    const waited = await deps.ceiling.take();
    if (waited > 0) {
      stats.deferred += 1;
      stats.deferredMs += waited;
    }

    const candidates = await readCandidates(session.wire, tables, event.tokens);
    const derived = deriveQuestions(views, candidates, [], 'event');
    // THE EVENT IS THE STATE — as labels, exactly as a sentence is.
    const state = { line: event.line, heard: { kind: event.kind, place: event.place, band: event.band, time: deps.clock.time } };
    const decided = await decideQuestions(deps.decider, state, derived.questions);
    stats.passes += 1;

    const interrupt = probabilityOf(decided.answers[EVENT_INTERRUPT]);
    const urgencyAnswer = decided.answers[EVENT_URGENCY];
    const urgency = urgencyAnswer?.kind === 'score' ? Math.min(2, Math.max(0, urgencyAnswer.level)) : 0;
    const confidence = urgencyAnswer?.kind === 'score' ? urgencyAnswer.confidence : 0;
    const audience = decided.answers[EVENT_AUDIENCE];
    const standing = raised.get(event.key);

    // THE SAME BANDS A SENTENCE'S CARDS GET, and the best card that clears them
    // and can be aimed. `line` is never a draft here: nobody typed it.
    const filling = { line: '', answers: decided.answers, parsed: { tokens: event.tokens, day: deps.clock.day, hour: deps.clock.hour }, clock: deps.clock };
    const best = derived.plans
      .map((plan) => ({ plan, p: probabilityOf(decided.answers[plan.question]), input: inputOf(plan, filling) }))
      .filter((entry) => (standing?.actionId === entry.plan.actionId ? entry.p > UNMOUNT_AT : entry.p >= MOUNT_AT) && entry.plan.required.every((key) => entry.input[key] !== undefined))
      .sort((a, b) => b.p - a.p)[0];

    // A dismissal stands until the cause changes band.
    if (dismissed.get(event.key) !== event.band) dismissed.delete(event.key);
    const isWorthEyes = standing === undefined ? interrupt >= INTERRUPT_AT : interrupt > INTERRUPT_LEAVE_AT;

    // X-RAY'S STORY OF THIS PASS (intent/story.ts): what Jev was asked and said.
    const tell = (outcome: string): void =>
      deps.onEventPass?.({
        line: withoutBand(event),
        heard: [event.place, event.kind, event.band],
        decideMs: decided.durationMs,
        questionCount: decided.questionCount,
        scored: derived.plans.map((plan) => ({ id: plan.actionId, p: Math.round(probabilityOf(decided.answers[plan.question]) * 1000) / 1000 })),
        interrupt,
        interruptLine: standing === undefined ? INTERRUPT_AT : INTERRUPT_LEAVE_AT,
        urgency: URGENCY_WORDS[urgency] ?? 'routine',
        outcome,
      });

    if (!isWorthEyes || best === undefined || dismissed.has(event.key)) {
      // MOST EVENTS ANSWER "NOTHING", AND THAT IS THE PRODUCT.
      const left = comeDown(event.key);
      if (left) stats.left += 1;
      else stats.nothing += 1;
      tell(left ? 'Took its card down: no longer worth a pair of eyes.' : dismissed.has(event.key) ? 'Raised nothing: the operator dismissed this cause, and it has not changed band since.' : !isWorthEyes ? 'Raised nothing: below the line. Most events end here, and that is the product.' : 'Raised nothing: no card it was sure of could be aimed.');
      return;
    }

    const probabilities = {
      [EVENT_INTERRUPT]: Math.round(interrupt * 1000) / 1000,
      [EVENT_URGENCY]: Math.round(confidence * 1000) / 1000,
      [EVENT_AUDIENCE]: audience?.kind === 'choice' ? Math.round(audience.p * 1000) / 1000 : 0,
      [`action/${best.plan.actionId}`]: Math.round(best.p * 1000) / 1000,
    };
    const isNew = standing === undefined;
    order += 1;
    raised.set(event.key, { cause: event.key, actionId: best.plan.actionId, input: best.input, event, urgency, probabilities, order: standing?.order ?? order, at: standing?.at ?? deps.clock.time, instanceId: standing?.actionId === best.plan.actionId ? standing.instanceId : undefined });
    if (standing !== undefined && standing.actionId !== best.plan.actionId && standing.instanceId !== undefined && canShow) session.shell.removeInstance(ATTENTION_CANVAS, standing.instanceId);
    if (!isNew) stats.alreadyUp += 1;
    if (isNew) {
      stats.raised += 1;
      // A FLAGGED EVENT IS A TURN, so "what did I miss?" is answerable.
      deps.recordEvent(`${deps.clock.time} · ${event.short} — raised`, { rail: `${event.short} — raised (${URGENCY_WORDS[urgency] ?? 'routine'})`, cause: event.key, card: best.plan.actionId, line: event.line, audience: audience?.kind === 'choice' && audience.p >= FILL_AT ? audience.choice : 'none', probabilities });
    }
    tell(isNew ? `Raised “${deps.definitions[best.plan.actionId]?.title ?? best.plan.actionId}” — ${best.p.toFixed(2)} — on the attention strip.` : 'Already up: its card was updated in place.');
    maybeBrief(event, urgency, confidence);
  };

  // ─── re-reading what changed ───────────────────────────────

  const reread = async (changed: ReadonlySet<string>): Promise<FeedRows> => {
    const rows: FeedRows = { zoneCounts: [], incidents: [], gates: [], scans: [] };
    for (const feed of feeds) {
      if (!changed.has(feed.table)) continue;
      const response = await post(session.wire, feed.entry.fingerprint, { after: cursors.get(feed.table) ?? 0 });
      if (!response.ok) continue;
      const body: unknown = await response.json();
      const revs = Rev.safeParse(body);
      if (!revs.success || revs.data.length === 0) continue;
      cursors.set(feed.table, revs.data[0]?.rev ?? 0);
      stats.rows += revs.data.length;
      // Newest first off the wire; oldest first into the merge, so later wins.
      if (feed.table === 'zone_counts') rows.zoneCounts = [...(ZoneCountRows.safeParse(body).data ?? [])].reverse();
      if (feed.table === 'incidents') rows.incidents = [...(IncidentRows.safeParse(body).data ?? [])].reverse();
      if (feed.table === 'gates') rows.gates = [...(GateRows.safeParse(body).data ?? [])].reverse();
      if (feed.table === 'gate_scans') rows.scans = [...(ScanRows.safeParse(body).data ?? [])].reverse();
    }
    return rows;
  };

  const readClock = async (): Promise<void> => {
    const response = await post(session.wire, clockNow.fingerprint, {});
    const clock = response.ok ? Clock.safeParse(await response.json()) : undefined;
    if (clock?.success !== true) return;
    const from = { ...deps.clock };
    Object.assign(deps.clock, { day: clock.data.day, hour: Math.floor(clock.data.minute / 60), time: timeOf(clock.data.minute) });
    // A raised card that was aimed at "the hour it is" is aimed at THIS hour now
    // — remembered here first, or the next render would take the card's new hour
    // for a different aim and re-open it.
    for (const entry of raised.values()) {
      if (entry.input['hour'] === from.hour) entry.input = { ...entry.input, hour: deps.clock.hour };
      if (entry.input['day'] === from.day) entry.input = { ...entry.input, day: deps.clock.day };
    }
    deps.onClock(from, { ...deps.clock });
    session.shell.publish(CLOCK_CHANNEL);
  };

  // THE OPERATOR'S CLICKS, read back like any other feed: a dismissal takes the
  // card down and holds its cause down; a keep is only a label.
  const readLabels = async (): Promise<void> => {
    const response = await post(session.wire, labelsSince.fingerprint, { after: labelCursor });
    const labels = response.ok ? Labels.safeParse(await response.json()) : undefined;
    if (labels?.success !== true) return;
    for (const label of labels.data) {
      labelCursor = Math.max(labelCursor, label.seq);
      const entry = raised.get(label.cause);
      if (label.verdict !== 'dismissed' || entry === undefined) continue;
      dismissed.set(label.cause, entry.event.band);
      if (comeDown(label.cause)) stats.dismissed += 1;
    }
  };

  let lastNotifiedAt = 0;
  const quiet = async (): Promise<void> => {
    const began = performance.now();
    while (performance.now() - lastNotifiedAt < EVENT_QUIET_MS && performance.now() - began < EVENT_CEILING_MS) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(5, EVENT_QUIET_MS - (performance.now() - lastNotifiedAt))));
    }
  };

  const drain = async (): Promise<void> => {
    await started;
    while (dirty.size > 0) {
      await quiet();
      const changed = new Set(dirty);
      dirty.clear();
      if (changed.has('festival_clock')) await readClock();
      if (changed.has('attention_labels')) await readLabels();
      const events = eventsFrom(await reread(changed), deps.clock);
      for (const event of events) await pass(event);
      render();
    }
  };

  const watcher: Watcher = {
    notify: (table) => {
      dirty.add(table);
      lastNotifiedAt = performance.now();
      if (running !== undefined) return;
      running = drain()
        .catch((error: unknown) => console.error('[encore/watch] an event batch failed and was skipped:', error))
        .finally(() => {
          running = undefined;
          // Something landed in the last instant of the batch.
          if (dirty.size > 0) {
            const next = [...dirty][0];
            if (next !== undefined) queueMicrotask(() => watcher.notify(next));
          }
        });
    },
    yieldToOperator: () => briefing?.controller.abort(),
    idle: async () => {
      await started;
      while (running !== undefined || briefing !== undefined) {
        await running;
        await briefing?.done;
      }
    },
    stats: () => ({ ...stats }),
    raised: () => [...raised.values()],
  };
  return watcher;
};
