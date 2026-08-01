import type { ActionDefinition } from '../action';
import { mountInputKeys } from '../reflect/grammar';
import type { Shell } from './types';

// Make a canvas equal a desired list.
//
// nova's other navigation verbs are imperative — push, pop, replace,
// removeInstance — and describe a screen as a sequence of edits to one nobody
// holds a picture of. Every caller that produces a whole desired state (a
// server-driven layout, a restored workspace, an agent's answer) then has to
// diff it by hand, and each of them writes the same four bugs: duplicates,
// forgetting to close, closing what somebody else opened, and re-aiming a card
// whose data no longer matches its id.
//
// This is the declarative verb. The caller says what should be there; nova works
// out push, write or replace.
//
//   OWNERSHIP  `own` decides what the caller may move — see below.
//   RE-AIM     writing an input key that the surface's own mount-time load reads
//              would leave the previous record's data on screen under a new id,
//              so those re-mount instead of being written.

export type Desired = {
  actionId: string;
  input?: Record<string, unknown>;
  // Fragments to compose, as `push` takes them.
  with?: string[];
};

export type ReconcileOptions = {
  // Stamped on everything this call pushes. Required whichever `own` is in
  // force: it is how a later call, a telemetry reader or an audit answers "who
  // put this here".
  origin: string;
  // Resolves an action id to its definition, for the re-aim rule. Without it,
  // every change to a live card is written in place.
  definitionOf?: (actionId: string) => ActionDefinition | undefined;
  // WHAT THIS CALL MAY MOVE.
  //
  //   'pushed' (default) — only instances carrying `origin`. Anything else on
  //                        the canvas is left exactly as it is: the safe reading
  //                        for a caller that SHARES a canvas with a person.
  //   'canvas'           — every instance on the canvas, whoever pushed it. For
  //                        a caller that OWNS the canvas outright.
  //
  // "Only what I pushed" is authorship, not ownership, and the two come apart
  // wherever a person and an agent work the same column: an agent granted a
  // canvas cannot write into or take down a record the person opened onto it,
  // while its complete-state answer says it has.
  own?: 'pushed' | 'canvas';
};

export type ReconcileResult = {
  changed: boolean;
  // What moved, in order, for a caller that wants to log or trace it.
  notes: string[];
};

const differs = (before: Record<string, unknown>, input: Record<string, unknown>): boolean =>
  Object.entries(input).some(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value));

export const reconcileCanvas = (shell: Shell, canvasId: string, desired: readonly Desired[], options: ReconcileOptions): ReconcileResult => {
  const { origin, definitionOf } = options;
  // Asked once, so the close scope and the write scope cannot drift apart: a
  // caller allowed to take a card down is allowed to write into it.
  const ownsCanvas = options.own === 'canvas';
  const notes: string[] = [];
  let changed = false;

  if (shell.getState().canvases[canvasId] === undefined) return { changed: false, notes: [`no canvas "${canvasId}"`] };

  // A canvas is a set, not a bag: one instance per action id.
  const wanted: Desired[] = [];
  for (const entry of desired) if (!wanted.some((other) => other.actionId === entry.actionId)) wanted.push(entry);

  const mine = (shell.getState().canvases[canvasId]?.stack ?? []).filter((item) => ownsCanvas || shell.originOf(item.id) === origin);
  for (const item of mine) {
    if (wanted.some((entry) => entry.actionId === item.definitionId)) continue;
    shell.removeInstance(canvasId, item.id);
    changed = true;
    notes.push(`closed ${item.definitionId}`);
  }

  for (const entry of wanted) {
    const input = entry.input ?? {};
    const existing = (shell.getState().canvases[canvasId]?.stack ?? []).find((item) => item.definitionId === entry.actionId);

    if (existing !== undefined && !ownsCanvas && shell.originOf(existing.id) !== origin) {
      notes.push(`left ${entry.actionId}: not mine`);
      continue;
    }

    if (existing !== undefined) {
      const runtime = shell.getRuntime(existing.id);
      const before = runtime?.getData() ?? {};
      if (runtime === undefined || Object.keys(input).length === 0 || !differs(before, input)) continue;

      const definition = definitionOf?.(entry.actionId);
      const reAims = definition !== undefined && Object.keys(input).some((key) => mountInputKeys(definition).has(key));
      if (!reAims) {
        runtime.setData({ ...before, ...input });
        changed = true;
        notes.push(`set ${Object.keys(input).join(', ')} on ${entry.actionId}`);
        continue;
      }
      shell.removeInstance(canvasId, existing.id);
      notes.push(`re-opened ${entry.actionId}`);
    }

    shell.push(canvasId, entry.actionId, input, entry.with, { origin });
    changed = true;
    notes.push(`placed ${entry.actionId}`);
  }

  return { changed, notes };
};
