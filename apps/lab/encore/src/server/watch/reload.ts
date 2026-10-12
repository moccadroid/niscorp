import type { ActionDefinition } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { RELOAD_CHANNEL, tablesReadBy } from '@encore/app/reload-on-write';
import type { FestivalClock } from '@encore/lib/festival-clock';
import { inputContractOf } from '@encore/server/intent/input-contract';

export const RELOAD_EVERY_MS = 500;

export type ReloadDeps = {
  session: FunctionSession;
  definitions: Record<string, ActionDefinition>;
  entries: readonly (SeedEntry | SeedMutation)[];
  sentenceCanvases: readonly string[];
  eventCanvases: readonly string[];
  saidInSentence: () => ReadonlySet<string>;
  isTouched: (instanceId: string, key: string) => boolean;
  willWrite: (instanceId: string, input: Record<string, unknown>) => void;
};

export type Reloader = {
  tableChanged: (table: string) => void;
  clockMoved: (from: FestivalClock, to: FestivalClock) => void;
  idle: () => Promise<void>;
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
      // Every card is re-aimed before any is asked to re-read: a reload is one message per
      // action, and two gauges must both hold the new hour by then.
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
