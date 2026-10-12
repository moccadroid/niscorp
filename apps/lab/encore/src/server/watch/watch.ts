import { z } from 'zod';
import type { ActionDefinition, FetchFn, Shell } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import type { ScopePolicy } from '@niscorp/vex';
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
import { YES_AT, inputOf, probabilityOf } from '@encore/server/intent/resolve';
import type { Ceiling } from './ceiling';
import { GateRows, IncidentRows, ScanRows, ZoneCountRows, eventsFrom, withoutBand } from './events';
import type { FeedEvent, FeedRows } from './events';

export const ATTENTION_SHOWN = 4;
export const BRIEF_EVERY_MS = 10_000;
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
  probabilities: Record<string, number>;
  order: number;
  at: string;
  instanceId: string | undefined;
};

// Every event is exactly one of `raised`, `nothing`, `alreadyUp` and `left`, so the
// strip's line adds up. A dismissal is a click, not an event, and is counted apart.
export type WatchStats = { rows: number; events: number; passes: number; raised: number; nothing: number; alreadyUp: number; left: number; dismissed: number; deferred: number; deferredMs: number; briefs: number; briefsSkipped: number };

export type StandingCause = { place: string; kind: string; band: string; reading: string; since: string };

export type BriefRequest = { event: FeedEvent; standing: readonly StandingCause[]; screen: { canvas: string; card: string; aimedAt: Record<string, unknown> }[]; clock: FestivalClock };

export type WatchDeps = {
  session: FunctionSession;
  policy: ScopePolicy;
  decider: Decider;
  definitions: Record<string, ActionDefinition>;
  clock: FestivalClock;
  ceiling: Ceiling;
  now: () => number;
  recordEvent: (line: string, detail: Record<string, unknown>) => void;
  setEventTone: (tone: (typeof FRAME_TONES)[number]) => void;
  isOperatorRunOut: () => boolean;
  onRaised: (count: number) => void;
  onClock: (from: FestivalClock, to: FestivalClock) => void;
  brief: (request: BriefRequest, abort: AbortSignal) => Promise<string | undefined>;
  onEventPass?: (told: Omit<EventStoryInput, 'count' | 'names'>) => void;
};

export type Watcher = {
  notify: (table: string) => void;
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

  // A view, never a form: an event does not open a form for anybody.
  const granted = new Set(session.actions);
  const views = Object.values(deps.definitions).filter((definition) => granted.has(definition.id) && CANVAS_PLACEMENT[definition.id] !== undefined && CANVAS_PLACEMENT[definition.id] !== 'doing');
  const tables = referencedTables(views);
  const canShow = granted.has(ATTENTION_STRIP_ID);
  const feeds = FEEDS.filter((feed) => tablesOf(feed.entry).every((table) => canRead(deps.policy, table)));

  const cursors = new Map<string, number>();
  let labelCursor = 0;
  const dirty = new Set<string>();
  const raised = new Map<string, Raised>();
  // Cause → the band it was dismissed at: it stays down until the band changes or the cause leaves.
  const dismissed = new Map<string, string>();
  const stats: WatchStats = { rows: 0, events: 0, passes: 0, raised: 0, nothing: 0, alreadyUp: 0, left: 0, dismissed: 0, deferred: 0, deferredMs: 0, briefs: 0, briefsSkipped: 0 };
  let order = 0;
  let running: Promise<void> | undefined;
  let lastBriefAt = Number.NEGATIVE_INFINITY;
  let briefing: { controller: AbortController; done: Promise<void> } | undefined;
  let briefLine = '';
  let briefOver: ReadonlySet<string> = new Set();

  const started: Promise<void> = (async () => {
    for (const feed of feeds) {
      const response = await post(session.wire, feed.entry.fingerprint, { after: 0 });
      const rows = response.ok ? Rev.safeParse(await response.json()) : undefined;
      cursors.set(feed.table, rows?.success === true ? (rows.data[0]?.rev ?? 0) : 0);
    }
  })().catch((error: unknown) => console.error('[encore/watch] could not find the start of the feeds:', error));

  const mergeInto = (shell: Shell, canvas: string, actionId: string, patch: Record<string, unknown>): void => {
    const instanceId = shell.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId)?.id;
    const runtime = instanceId === undefined ? undefined : shell.getRuntime(instanceId);
    if (runtime !== undefined) runtime.setData({ ...runtime.getData(), ...patch });
  };

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
      say: `${stats.events} event${stats.events === 1 ? '' : 's'} · ${stats.raised} raised · ${stats.nothing} nothing · ${stats.alreadyUp} already up · ${stats.left} left`,
      foldedSay: folded === 0 ? '' : `+${folded} more raised, not shown: ${ranked.slice(ATTENTION_SHOWN).map((entry) => entry.event.short).join(' · ')}`,
      ceilingSay: stats.deferred === 0 ? '' : `ceiling held ${stats.deferred} pass${stats.deferred === 1 ? '' : 'es'} back, ${Math.round(stats.deferredMs)} ms in all`,
      brief: briefLine,
      rows: stats.rows,
      passes: stats.passes,
    });
  };

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

  const maybeBrief = (event: FeedEvent, urgency: number, confidence: number): void => {
    if (urgency < 2 || confidence < YES_AT) return;
    // A brief that cannot go now is skipped, not queued: later it would be about a moment that passed.
    if (deps.isOperatorRunOut() || briefing !== undefined || deps.now() - lastBriefAt < BRIEF_EVERY_MS) {
      stats.briefsSkipped += 1;
      return;
    }
    lastBriefAt = deps.now();
    const controller = new AbortController();
    const standing = [...raised.values()].map((entry): StandingCause => ({ place: entry.event.place, kind: entry.event.kind, band: URGENCY_WORDS[entry.urgency] ?? 'routine', reading: entry.event.line, since: entry.at }));
    const over = new Set(raised.keys());
    const screen = [...raised.values()].map((entry) => ({ canvas: ATTENTION_CANVAS, card: entry.actionId, aimedAt: entry.input }));
    const done = deps
      .brief({ event, standing, screen, clock: { ...deps.clock } }, controller.signal)
      .then((line) => {
        if (line === undefined || controller.signal.aborted) return;
        stats.briefs += 1;
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

  const pass = async (event: FeedEvent): Promise<void> => {
    stats.events += 1;
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
    const state = { line: event.line, heard: { kind: event.kind, place: event.place, band: event.band, time: deps.clock.time } };
    const decided = await decideQuestions(deps.decider, state, derived.questions);
    stats.passes += 1;

    const interrupt = probabilityOf(decided.answers[EVENT_INTERRUPT]);
    const urgencyAnswer = decided.answers[EVENT_URGENCY];
    const urgency = urgencyAnswer?.kind === 'score' ? Math.min(2, Math.max(0, urgencyAnswer.level)) : 0;
    const confidence = urgencyAnswer?.kind === 'score' ? urgencyAnswer.confidence : 0;
    const audience = decided.answers[EVENT_AUDIENCE];
    const standing = raised.get(event.key);

    const filling = { line: '', answers: decided.answers, parsed: { tokens: event.tokens, day: deps.clock.day, hour: deps.clock.hour }, clock: deps.clock };
    const best = derived.plans
      .map((plan) => ({ plan, p: probabilityOf(decided.answers[plan.question]), input: inputOf(plan, filling) }))
      .filter((entry) => entry.p >= YES_AT && entry.plan.required.every((key) => entry.input[key] !== undefined))
      .sort((a, b) => b.p - a.p)[0];

    if (dismissed.get(event.key) !== event.band) dismissed.delete(event.key);
    const isWorthEyes = interrupt >= YES_AT;

    const tell = (outcome: string): void =>
      deps.onEventPass?.({
        line: withoutBand(event),
        heard: [event.place, event.kind, event.band],
        decideMs: decided.durationMs,
        questionCount: decided.questionCount,
        scored: derived.plans.map((plan) => ({ id: plan.actionId, p: Math.round(probabilityOf(decided.answers[plan.question]) * 1000) / 1000 })),
        interrupt,
        interruptLine: YES_AT,
        urgency: URGENCY_WORDS[urgency] ?? 'routine',
        outcome,
      });

    if (!isWorthEyes || best === undefined || dismissed.has(event.key)) {
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
      deps.recordEvent(`${deps.clock.time} · ${event.short} — raised`, { rail: `${event.short} — raised (${URGENCY_WORDS[urgency] ?? 'routine'})`, cause: event.key, card: best.plan.actionId, line: event.line, audience: audience?.kind === 'choice' && audience.p >= YES_AT ? audience.choice : 'none', probabilities });
    }
    tell(isNew ? `Raised “${deps.definitions[best.plan.actionId]?.title ?? best.plan.actionId}” — ${best.p.toFixed(2)} — on the attention strip.` : 'Already up: its card was updated in place.');
    maybeBrief(event, urgency, confidence);
  };

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
      // Newest first off the wire, oldest first into the merge, so that later wins.
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
    // A raised card aimed at "the hour it is" is re-aimed here first, or the next render
    // would take the card's new hour for a different aim and re-open it.
    for (const entry of raised.values()) {
      if (entry.input['hour'] === from.hour) entry.input = { ...entry.input, hour: deps.clock.hour };
      if (entry.input['day'] === from.day) entry.input = { ...entry.input, day: deps.clock.day };
    }
    deps.onClock(from, { ...deps.clock });
    session.shell.publish(CLOCK_CHANNEL);
  };

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
          // A write can land between the batch's last look at `dirty` and this line.
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
