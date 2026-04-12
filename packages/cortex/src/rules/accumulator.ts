// ═══════════════════════════════════════════════════════════
// Accumulator — declarative watchers over bus events
// ═══════════════════════════════════════════════════════════
//
// Each accumulator watches a bus topic and maintains a value
// using one of three aggregation strategies:
//   - count:  increments on every matching event
//   - sum:    adds a numeric field from each event's payload
//   - latest: stores the most recent value of a payload field
//
// Accumulators are the "watch" half of a rule. The condition
// evaluator reads accumulated values via the scope.

import type { BusEvent, Unsubscribe, Bus } from '../types';
import type { RuleDefinition } from './rule.schema';

// ───────────────────────────────────────────────────────────
// Types — derived from Zod schema, not hand-written
// ───────────────────────────────────────────────────────────

// WatchDefs is the type of the `watch` field from RuleDefinitionSchema.
// Derived, not duplicated, so it's guaranteed to match.
export type WatchDefs = RuleDefinition['watch'];
export type AccumulatorDef = WatchDefs[string];

export type AccumulatorState = {
  values: () => Record<string, unknown>;
  reset: () => void;
};

// ───────────────────────────────────────────────────────────
// Field resolution on event payloads
// ───────────────────────────────────────────────────────────

const resolveField = (payload: unknown, field: string): unknown => {
  if (payload === null || payload === undefined) return undefined;
  const segments = field.split('.');
  let current: unknown = payload;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
};

// ───────────────────────────────────────────────────────────
// Factory: attach accumulators to a bus for a workflow
// ───────────────────────────────────────────────────────────

export const attachAccumulators = (
  bus: Bus,
  defs: WatchDefs,
): { state: AccumulatorState; unsub: Unsubscribe } => {
  const store = new Map<string, unknown>();
  const unsubs: Unsubscribe[] = [];

  // Initialize all accumulators to their zero value.
  for (const [name, def] of Object.entries(defs)) {
    if (def.aggregate === 'count' || def.aggregate === 'sum') {
      store.set(name, 0);
    } else {
      store.set(name, undefined);
    }
  }

  for (const [name, def] of Object.entries(defs)) {
    const handler = (event: BusEvent): void => {
      if (def.aggregate === 'count') {
        store.set(name, ((store.get(name) as number) ?? 0) + 1);
      } else if (def.aggregate === 'sum') {
        const raw = resolveField(event.payload, def.field);
        const num = typeof raw === 'number' ? raw : 0;
        store.set(name, ((store.get(name) as number) ?? 0) + num);
      } else {
        // latest
        store.set(name, resolveField(event.payload, def.field));
      }
    };
    unsubs.push(bus.on(def.event, handler));
  }

  const state: AccumulatorState = {
    values: () => Object.fromEntries(store.entries()),
    reset: () => {
      for (const [name, def] of Object.entries(defs)) {
        if (def.aggregate === 'count' || def.aggregate === 'sum') {
          store.set(name, 0);
        } else {
          store.set(name, undefined);
        }
      }
    },
  };

  const unsub = (): void => {
    for (const u of unsubs) u();
  };

  return { state, unsub };
};
