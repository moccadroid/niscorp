import type { ActionDefinition, Shell } from '@niscorp/nova';
import { inputContractOf } from './input-contract';

// A key that no longer holds what the loop last wrote was changed by a person or by the card's
// own mount load. A write is recorded before it is made, so its own change event marks nothing.

export type TouchTracker = {
  willWrite: (instanceId: string, input: Record<string, unknown>) => void;
  adopt: (instanceId: string, definition: ActionDefinition, seeded: Record<string, unknown>) => void;
  untouched: (instanceId: string, input: Record<string, unknown>) => Record<string, unknown>;
  isTouched: (instanceId: string, key: string) => boolean;
  // The fast path leaves an authored key alone, or a later pass would put the raw sentence back.
  markAuthored: (instanceId: string, keys: readonly string[]) => void;
  withoutAuthored: (instanceId: string, input: Record<string, unknown>) => Record<string, unknown>;
  reset: () => void;
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export const createTouchTracker = (): TouchTracker & { watch: (shell: Shell) => void } => {
  const wrote = new Map<string, Record<string, unknown>>();
  const touched = new Map<string, Set<string>>();
  const authored = new Map<string, Set<string>>();
  let watching: Shell | undefined;

  const omit = (input: Record<string, unknown>, keys: ReadonlySet<string> | undefined): Record<string, unknown> =>
    keys === undefined || keys.size === 0 ? input : Object.fromEntries(Object.entries(input).filter(([key]) => !keys.has(key)));

  return {
    watch: (shell) => {
      if (watching === shell) return;
      watching = shell;
      shell.onDataChange(({ instanceId, data }) => {
        const expected = wrote.get(instanceId);
        if (expected === undefined) return;
        for (const [key, value] of Object.entries(expected)) {
          if (same(data[key], value)) continue;
          touched.set(instanceId, new Set([...(touched.get(instanceId) ?? []), key]));
        }
      });
    },
    willWrite: (instanceId, input) => {
      wrote.set(instanceId, { ...(wrote.get(instanceId) ?? {}), ...input });
    },
    adopt: (instanceId, definition, seeded) => {
      const defaults = definition.data ?? {};
      const baseline = Object.fromEntries(inputContractOf(definition).fields.map((field) => [field.name, field.name in seeded ? seeded[field.name] : defaults[field.name]]));
      // Under what is recorded, never over it: only the keys the loop never wrote get a baseline.
      wrote.set(instanceId, { ...baseline, ...(wrote.get(instanceId) ?? {}) });
    },
    untouched: (instanceId, input) => omit(input, touched.get(instanceId)),
    isTouched: (instanceId, key) => touched.get(instanceId)?.has(key) === true,
    markAuthored: (instanceId, keys) => {
      authored.set(instanceId, new Set([...(authored.get(instanceId) ?? []), ...keys]));
    },
    withoutAuthored: (instanceId, input) => omit(input, authored.get(instanceId)),
    reset: () => {
      wrote.clear();
      touched.clear();
      authored.clear();
    },
  };
};
