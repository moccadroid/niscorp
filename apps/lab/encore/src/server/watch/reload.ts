import type { ActionDefinition } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { RELOAD_CHANNEL, tablesReadBy } from '@encore/app/reload-on-write';
import type { FestivalClock } from '@encore/lib/festival-clock';
import { inputContractOf } from '@encore/server/intent/input-contract';

// ═══════════════════════════════════════════════════════════
// A WRITE LANDED → the cards that show those rows re-read. One of these per
// live session (app/reload-on-write.ts says which tables a card reads, and
// composes the trigger that does the re-reading).
//
// IT ASKS CARDS TO RE-READ; IT READS NOTHING ITSELF. The reaction carried no
// rows and this passes none on: a card's reload is the card's own endpoint,
// over the session's own wire, under the session's own policy.
//
// THROTTLED PER CARD. The leading write reloads at once — a number under an
// alert must not be half a second old for no reason — and whatever else lands
// inside RELOAD_EVERY_MS becomes ONE more reload at the end of it. A scanner
// writing three hundred rows a minute cannot thrash the room: at most two
// reloads a second per card, however hard the feeds fire. (And `gate_scans`
// itself reloads nothing at all: no card reads it.)
//
// THE CLOCK IS A ROW TOO, and a card that follows it follows THE ROW. A field
// declared `fallback: 'now'` that nobody set — not the sentence, not a person's
// hand — holds "whatever time it is", and keeps meaning that when the director
// advances the clock: it is re-aimed IN PLACE (same instance) and re-read. A
// card the sentence aimed at "at 9" holds 21 because somebody said so, and does
// not drift.
// ═══════════════════════════════════════════════════════════

export const RELOAD_EVERY_MS = 500;

export type ReloadDeps = {
  session: FunctionSession;
  definitions: Record<string, ActionDefinition>;
  entries: readonly (SeedEntry | SeedMutation)[];
  // Canvases a SENTENCE arranges, and canvases EVENTS arrange. On the first, a
  // clock field the sentence spoke to ("at 9", "tomorrow") is somebody's; on the
  // second nobody typed anything, so every clock field is the clock's.
  sentenceCanvases: readonly string[];
  eventCanvases: readonly string[];
  // The kinds of time the sentence on the line said out loud: 'day', 'hour',
  // 'time'. Empty when it said none.
  saidInSentence: () => ReadonlySet<string>;
  // A person's hand has been on this key of this instance.
  isTouched: (instanceId: string, key: string) => boolean;
  // Record a write before making it, so it is not mistaken for a person's.
  willWrite: (instanceId: string, input: Record<string, unknown>) => void;
};

export type Reloader = {
  tableChanged: (table: string) => void;
  clockMoved: (from: FestivalClock, to: FestivalClock) => void;
  idle: () => Promise<void>;
  // How many reloads were published, per action — what a check measures.
  published: () => Record<string, number>;
};

const clockValue = (parse: string | undefined, clock: FestivalClock): string | number | undefined => (parse === 'day' ? clock.day : parse === 'hour' ? clock.hour : parse === 'time' ? clock.time : undefined);

export const createReloader = (deps: ReloadDeps): Reloader => {
  const { session } = deps;
  const readers = new Map<string, string[]>();
  for (const definition of Object.values(deps.definitions)) for (const table of tablesReadBy(definition, deps.entries)) readers.set(table, [...(readers.get(table) ?? []), definition.id]);

  const lastAt = new Map<string, number>();
  const trailing = new Map<string, ReturnType<typeof setTimeout>>();
  const counts: Record<string, number> = {};

  const isUp = (actionId: string): boolean => Object.values(session.shell.getState().canvases).some((canvas) => canvas.stack.some((item) => item.definitionId === actionId));

  const publish = (actionId: string): void => {
    lastAt.set(actionId, performance.now());
    counts[actionId] = (counts[actionId] ?? 0) + 1;
    session.shell.publish(RELOAD_CHANNEL(actionId));
  };

  const reload = (actionId: string): void => {
    if (!isUp(actionId) || trailing.has(actionId)) return;
    const wait = (lastAt.get(actionId) ?? Number.NEGATIVE_INFINITY) + RELOAD_EVERY_MS - performance.now();
    if (wait <= 0) return publish(actionId);
    trailing.set(
      actionId,
      setTimeout(() => {
        trailing.delete(actionId);
        if (isUp(actionId)) publish(actionId);
      }, wait),
    );
  };

  return {
    tableChanged: (table) => {
      for (const actionId of readers.get(table) ?? []) reload(actionId);
    },

    clockMoved: (from, to) => {
      const shell = session.shell;
      const said = deps.saidInSentence();
      // Every card is re-aimed BEFORE any is asked to re-read: a reload is one
      // message per action, and two gauges must both hold the new hour by then.
      const toReload = new Set<string>();
      for (const canvasId of [...deps.sentenceCanvases, ...deps.eventCanvases]) {
        const isSentences = deps.sentenceCanvases.includes(canvasId);
        for (const item of shell.getState().canvases[canvasId]?.stack ?? []) {
          const definition = deps.definitions[item.definitionId];
          const runtime = shell.getRuntime(item.id);
          if (definition === undefined || runtime === undefined) continue;
          const data = runtime.getData();
          const moved: Record<string, unknown> = {};
          for (const field of inputContractOf(definition).fields) {
            if (field.fallback !== 'now' || deps.isTouched(item.id, field.name) || (isSentences && said.has(field.parse ?? ''))) continue;
            const was = clockValue(field.parse, from);
            const now = clockValue(field.parse, to);
            // It held what the clock said, and the clock says something else.
            if (was !== undefined && now !== undefined && data[field.name] === was && was !== now) moved[field.name] = now;
          }
          if (Object.keys(moved).length === 0) continue;
          deps.willWrite(item.id, moved);
          runtime.setData({ ...runtime.getData(), ...moved });
          toReload.add(item.definitionId);
        }
      }
      for (const actionId of toReload) reload(actionId);
    },

    idle: async () => {
      while (trailing.size > 0) await new Promise<void>((resolve) => setTimeout(resolve, 25));
    },
    published: () => ({ ...counts }),
  };
};
