import { reconcileCanvas } from '@niscorp/nova';
import { mountInputKeys } from '@niscorp/nova/reflect';
import { keptAcrossReopen } from '@encore/app/shell/fragments/placed.fragment';
import type { ActionDefinition, Shell } from '@niscorp/nova';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';
import type { TouchTracker } from './touched';
import type { WarmOutcome } from '@encore/server/decider/decider';
import type { HeardTag } from './heard';
import type { Chip, PassRecord, Resolved } from './intent.types';

// Every write here is synchronous and lands in one tick, and moss renders at flush time:
// the canvases, the chips, the tone and the trace leave as one frame.

export const INTENT_ORIGIN = 'intent';

const instanceOf = (shell: Shell, canvasId: string, actionId: string): string | undefined =>
  shell.getState().canvases[canvasId]?.stack.find((item) => item.definitionId === actionId)?.id;

const mergeInto = (shell: Shell, canvasId: string, actionId: string, patch: Record<string, unknown>): void => {
  const instanceId = instanceOf(shell, canvasId, actionId);
  const runtime = instanceId === undefined ? undefined : shell.getRuntime(instanceId);
  if (runtime === undefined) return;
  runtime.setData({ ...runtime.getData(), ...patch });
};

export const mountedActions = (shell: Shell): Set<string> => {
  const state = shell.getState();
  return new Set(QUESTION_CANVASES.flatMap((canvas) => (state.canvases[canvas]?.stack ?? []).map((item) => item.definitionId)));
};

export const NOTHING_ANSWERS = 'Nothing in the room answers that yet.';
export const ONLY_GUESSES = 'Nothing is sure enough to open by itself. These are guesses — click one to open it.';

const roomSays = (mountedCount: number, chipCount: number): string => {
  if (mountedCount > 0) return '';
  return chipCount === 0 ? NOTHING_ANSWERS : ONLY_GUESSES;
};

export const reconcileScreen = (shell: Shell, resolved: Resolved, definitions: Record<string, ActionDefinition>, touched: TouchTracker): string[] => {
  const notes: string[] = [];
  for (const canvas of QUESTION_CANVASES) {
    const desired = (resolved.desired[canvas] ?? []).map((entry) => {
      const instanceId = instanceOf(shell, canvas, entry.actionId);
      if (instanceId === undefined) return entry;
      // nova re-opens a card when a key its mount load reads is among those written, moved or
      // not, so only moved keys are written. When a mount key did move, the card is re-opened
      // with exactly the input it is handed, so it is handed all of it.
      const holds = shell.getRuntime(instanceId)?.getData() ?? {};
      const wanted = touched.withoutAuthored(instanceId, touched.untouched(instanceId, entry.input ?? {}));
      const moved = Object.fromEntries(Object.entries(wanted).filter(([key, value]) => JSON.stringify(holds[key]) !== JSON.stringify(value)));
      const definition = definitions[entry.actionId];
      const reopens = definition !== undefined && Object.keys(moved).some((key) => mountInputKeys(definition).has(key));
      const input = reopens ? { ...wanted, ...keptAcrossReopen(holds) } : moved;
      touched.willWrite(instanceId, input);
      return { ...entry, input };
    });

    // The slow path's cards survive `own: 'canvas'` because the loop pins them into `desired`.
    const result = reconcileCanvas(shell, canvas, desired, {
      origin: INTENT_ORIGIN,
      own: 'canvas',
      definitionOf: (actionId) => definitions[actionId],
    });
    for (const note of result.notes) notes.push(`${canvas}: ${note}`);

    for (const entry of desired) {
      const instanceId = instanceOf(shell, canvas, entry.actionId);
      const definition = definitions[entry.actionId];
      if (instanceId !== undefined && definition !== undefined) touched.adopt(instanceId, definition, entry.input ?? {});
    }
  }
  mergeInto(shell, 'maybe', 'intent.options', { chips: resolved.chips, suggested: resolved.suggested, say: roomSays(mountedActions(shell).size, resolved.chips.length) });
  mergeInto(shell, 'line', 'intent.line', { tone: resolved.tone });
  return notes;
};

export const clearScreen = (shell: Shell): void => {
  for (const canvas of QUESTION_CANVASES) reconcileCanvas(shell, canvas, [], { origin: INTENT_ORIGIN, own: 'canvas' });
  const none: Chip[] = [];
  mergeInto(shell, 'maybe', 'intent.options', { chips: none, suggested: none, say: '' });
  mergeInto(shell, 'line', 'intent.line', { tone: 'calm', heard: [] });
};

export const writeHeard = (shell: Shell, heard: readonly HeardTag[]): void => {
  mergeInto(shell, 'line', 'intent.line', { heard });
};

export const writeTraceWarm = (shell: Shell, warm: WarmOutcome): void => {
  mergeInto(shell, 'trace', 'intent.trace', { warm: warm.outcome === 'fresh' ? 'already warm' : `${warm.outcome} ${Math.round(warm.ms)} ms` });
};

const round = (ms: number): number => Math.round(ms * 10) / 10;

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
    handoff: [
      { label: 'packs', value: record.handoff.packs.map((pack) => pack.id).join(', ') || 'none' },
      { label: 'narrowed', value: record.handoff.narrowed.length },
    ],
    run,
  });
};
