import type { ActionDefinition, Shell } from '@niscorp/nova';
import { inputContractOf } from './input-contract';

// WHAT A PERSON HAS TOUCHED, NEITHER SPEED OVERWRITES.
//
// Slice 1's debt: every pass wrote its inputs over whatever was on the form, so
// an operator who corrected the to-stage by hand watched the next keystroke put
// it back. With a second, slower writer in the room the debt would have
// doubled. It is paid here, once, for both.
//
// nova has no notion of who wrote a value, and this does not ask it for one.
// The tracker simply remembers what THE LOOP last wrote into each input key of
// each instance, and listens to `shell.onDataChange`: a key whose value is no
// longer what the loop wrote was changed by somebody else. That somebody is a
// person at a field — or the card's own mount load correcting a guess with a
// row (the swap form's from-stage), which deserves exactly the same deference.
// Either way the key is left alone until the line is cleared.
//
// ORDER IS THE WHOLE TRICK. A write is recorded BEFORE it is made, so the
// change event the write itself causes finds the value it expected and marks
// nothing. Only input keys are watched: `loading`, loaded rows and the rest of
// a card's data change constantly and belong to nobody.

export type TouchTracker = {
  // Call before the loop writes `input` into an instance.
  willWrite: (instanceId: string, input: Record<string, unknown>) => void;
  // Call once a new instance exists: everything it was seeded with, and the
  // definition's defaults for the rest, is what "untouched" means for it.
  adopt: (instanceId: string, definition: ActionDefinition, seeded: Record<string, unknown>) => void;
  // `input` without the keys a person has touched.
  untouched: (instanceId: string, input: Record<string, unknown>) => Record<string, unknown>;
  isTouched: (instanceId: string, key: string) => boolean;
  // The slow path authored this key. The FAST path then leaves it alone too —
  // a later pass must not put the raw sentence back over a written message —
  // but the slow path may write it again.
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
    // The shell does not exist when the loop is constructed, and a reset
    // replaces it — so the subscription is taken lazily, per shell.
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
      // UNDER what is already recorded, never over it. A card that outlives a
      // sentence (the tracker is reset, the card is still wanted) has to get a
      // baseline for the keys the loop never wrote — or a hand edit to one of
      // them would go unnoticed — without forgetting what the loop did write.
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
