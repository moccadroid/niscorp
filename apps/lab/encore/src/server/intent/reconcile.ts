import { reconcileCanvas } from '@niscorp/nova';
import { mountInputKeys } from '@niscorp/nova/reflect';
import { keptAcrossReopen } from '@encore/app/shell/fragments/placed.fragment';
import type { ActionDefinition, Shell } from '@niscorp/nova';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';
import type { TouchTracker } from './touched';
import type { WarmOutcome } from '@encore/server/decider/decider';
import type { HeardTag } from './heard';
import type { Chip, PassRecord, Resolved } from './intent.types';

// LANE 6 — RECONCILE. The desired screen, made true.
//
// `reconcileCanvas` is nova's declarative verb: say what should be on a canvas
// and it works out close, write-in-place, re-mount or push. Handing it
// `definitionOf` switches on the re-aim rule — an input the card's own mount
// load reads (an act id) re-mounts the card, anything else is written in place
// — so a form does not blink while the sentence that fills it is still being
// typed, and a record card never shows one act under another's id.
//
// Every write below is synchronous and lands in one tick, and moss renders at
// flush time: five canvases, the chips, the tone and the trace leave as ONE
// frame however many calls it took to describe them.

export const INTENT_ORIGIN = 'intent';

const instanceOf = (shell: Shell, canvasId: string, actionId: string): string | undefined =>
  shell.getState().canvases[canvasId]?.stack.find((item) => item.definitionId === actionId)?.id;

// `setData` REPLACES the record, so every write here is a merge over what is
// already there — the line's `text` in particular is being typed into while
// the tone beside it is being written.
const mergeInto = (shell: Shell, canvasId: string, actionId: string, patch: Record<string, unknown>): void => {
  const instanceId = instanceOf(shell, canvasId, actionId);
  const runtime = instanceId === undefined ? undefined : shell.getRuntime(instanceId);
  if (runtime === undefined) return;
  runtime.setData({ ...runtime.getData(), ...patch });
};

// What the loop has on the question canvases right now — the set hysteresis is
// measured against.
export const mountedActions = (shell: Shell): Set<string> => {
  const state = shell.getState();
  return new Set(QUESTION_CANVASES.flatMap((canvas) => (state.canvases[canvas]?.stack ?? []).map((item) => item.definitionId)));
};

// AN EMPTY ROOM SAYS IT IS EMPTY. A pass that lands and mounts nothing used to
// leave a blank screen, which reads as "broken" or "still thinking" and is
// neither. So the two states with nothing on the canvases are said out loud:
// nothing at all, and nothing but guesses. With a card up the room speaks for
// itself and this says nothing.
export const NOTHING_ANSWERS = 'Nothing in the room answers that yet.';
export const ONLY_GUESSES = 'Nothing is sure enough to open by itself. These are guesses — click one to open it.';

// `answerComing`: the sentence was routed to the agent and there is an agent to
// take it. "Nothing in the room answers that yet" beside a card that says
// "about to answer" would be the room contradicting itself — an empty room with
// an answer on the way says nothing. Guesses are still guesses.
const roomSays = (mountedCount: number, chipCount: number, answerComing: boolean): string => {
  if (mountedCount > 0) return '';
  if (chipCount === 0) return answerComing ? '' : NOTHING_ANSWERS;
  return ONLY_GUESSES;
};

export const reconcileScreen = (shell: Shell, resolved: Resolved, definitions: Record<string, ActionDefinition>, touched: TouchTracker, answerComing = false): string[] => {
  const notes: string[] = [];
  for (const canvas of QUESTION_CANVASES) {
    // A CARD ALREADY UP is written only where nobody else has been: keys a
    // person touched and keys the text model authored are dropped from what
    // this pass wants to write, BEFORE reconcile sees them — so a touched
    // mount key cannot even trigger a re-aim. What survives is recorded as
    // the loop's own write before it is made (touched.ts: order is the trick).
    const desired = (resolved.desired[canvas] ?? []).map((entry) => {
      const instanceId = instanceOf(shell, canvas, entry.actionId);
      if (instanceId === undefined) return entry;
      // ...AND ONLY WHERE IT WOULD CHANGE SOMETHING. nova re-opens a card when
      // an input its mount load reads is among the keys being written — whether
      // or not the value moved. So a pass that repeats `actId` beside a new
      // `placedBy` would re-mount the form on every keystroke: a flicker, a lost
      // hand edit, and a new instance id for a card nobody re-aimed. A key that
      // already holds the value is not a write.
      //
      // UNLESS THE CARD REALLY IS BEING RE-AIMED — a mount key whose value did
      // move. Then nova re-opens it with exactly the input it is handed, so it
      // is handed all of it: a card re-opened with only what changed comes back
      // without its tag, its key, or its day.
      const holds = shell.getRuntime(instanceId)?.getData() ?? {};
      const wanted = touched.withoutAuthored(instanceId, touched.untouched(instanceId, entry.input ?? {}));
      const moved = Object.fromEntries(Object.entries(wanted).filter(([key, value]) => JSON.stringify(holds[key]) !== JSON.stringify(value)));
      const definition = definitions[entry.actionId];
      const reopens = definition !== undefined && Object.keys(moved).some((key) => mountInputKeys(definition).has(key));
      // ...and with what a PERSON did to the card's chrome: an open "why?" stays open.
      const input = reopens ? { ...wanted, ...keptAcrossReopen(holds) } : moved;
      touched.willWrite(instanceId, input);
      return { ...entry, input };
    });

    // `own: 'canvas'` — these regions are the loop's outright. The slow path
    // lands its cards here too, but only ones the loop has pinned, so they are
    // in `desired` like any other.
    const result = reconcileCanvas(shell, canvas, desired, {
      origin: INTENT_ORIGIN,
      own: 'canvas',
      definitionOf: (actionId) => definitions[actionId],
    });
    for (const note of result.notes) notes.push(`${canvas}: ${note}`);

    // Whatever is NEW — pushed, or re-mounted by a re-aim — is adopted: what it
    // was seeded with is what "untouched" means for it from here on.
    for (const entry of desired) {
      const instanceId = instanceOf(shell, canvas, entry.actionId);
      const definition = definitions[entry.actionId];
      if (instanceId !== undefined && definition !== undefined) touched.adopt(instanceId, definition, entry.input ?? {});
    }
  }
  mergeInto(shell, 'maybe', 'intent.options', { chips: resolved.chips, suggested: resolved.suggested, say: roomSays(mountedActions(shell).size, resolved.chips.length, answerComing) });
  mergeInto(shell, 'line', 'intent.line', { tone: resolved.tone });
  return notes;
};

// An empty line is an empty room, at once — not after a pass.
export const clearScreen = (shell: Shell): void => {
  for (const canvas of QUESTION_CANVASES) reconcileCanvas(shell, canvas, [], { origin: INTENT_ORIGIN, own: 'canvas' });
  const none: Chip[] = [];
  // Cleared is not "nothing answers that": nothing was asked.
  mergeInto(shell, 'maybe', 'intent.options', { chips: none, suggested: none, say: '' });
  mergeInto(shell, 'line', 'intent.line', { tone: 'calm', heard: [] });
};

// What was heard in the sentence, onto the line itself (heard.ts).
export const writeHeard = (shell: Shell, heard: readonly HeardTag[]): void => {
  mergeInto(shell, 'line', 'intent.line', { heard });
};

// The pre-warm, traced: errors are swallowed where they happen, and said here.
export const writeTraceWarm = (shell: Shell, warm: WarmOutcome): void => {
  mergeInto(shell, 'trace', 'intent.trace', { warm: warm.outcome === 'fresh' ? 'already warm' : `${warm.outcome} ${Math.round(warm.ms)} ms` });
};

const round = (ms: number): number => Math.round(ms * 10) / 10;

// X-RAY'S STORY (story.ts), onto the panel: the one the panel is showing, and
// where it sits among the ones kept.
export const writeStory = (shell: Shell, patch: Record<string, unknown>): void => mergeInto(shell, 'trace', 'intent.trace', patch);

export const writeTrace = (shell: Shell, record: PassRecord, run: readonly { label: string; value: string | number }[]): void => {
  mergeInto(shell, 'trace', 'intent.trace', {
    pass: record.pass,
    text: record.text,
    questions: record.questionCount,
    bytes: record.requestBytes,
    decider: record.decider,
    calibrated: record.calibrated,
    totalMs: round(record.totalMs),
    waitedMs: round(record.waitedMs),
    connection: record.reusedConnection ? 'reused' : 'new',
    lanes: Object.entries(record.lanes).map(([label, ms]) => ({ label, value: round(ms) })),
    top: record.top,
    // What Jev decided about the SLOW path in this same pass.
    handoff: [
      { label: 'route', value: `${record.handoff.route} ${record.handoff.routeP}` },
      { label: 'complete', value: record.handoff.completeP },
      { label: 'packs', value: record.handoff.packs.map((pack) => pack.id).join(', ') || 'none' },
      { label: 'narrowed', value: record.handoff.narrowed.length },
    ],
    run,
  });
};
