import type { JsonValue } from '../types';
import { PrismError, ErrorCode } from '../errors';

// ═══════════════════════════════════════════════════════════
// WHAT ONE EVALUATION MAY COST. A config is small; what it makes need not
// be. Measured, each under 160 characters of config:
//
//   · a $reduce whose body joins the accumulator with itself doubles a
//     string per item — 26 items made 134M characters (284MB of heap);
//   · the same doubling of an ARRAY ([acc, acc]) shares its halves, so it is
//     built in 10ms — and serializing it (sending it anywhere) took 800ms at
//     24 items and never finished at 40;
//   · three $maps nested over 200 items evaluated 8M nodes.
//
// So three limits, each for a shape the others cannot see. WORK: nodes
// evaluated — nested maps. LENGTH: any one string — string doubling, stopped
// before the next doubling is allocated. SIZE: the values a result holds as
// it would be sent, shared parts counted every time they appear — the array
// doubling, which evaluates only a handful of nodes. Sizes are memoized per
// object, so measuring costs what building did.
//
// WHERE each is checked. Steps and string length at every node — a counter
// and a length read. Size only where a value can be reused into something
// bigger than the config — a $reduce accumulator, fed back each item, and a
// $with binding, read any number of times — and on the result. Measuring
// every object cost an ordinary 1000-row mapping 30%; this costs it about 8%
// (1.49ms → 1.62ms), most of it the one walk of the result.
//
// The defaults are far past any mapping anybody writes (a vex read is at
// most 1000 rows) and far short of what hurts a server.
// ═══════════════════════════════════════════════════════════

export type Limits = {
  // Nodes evaluated in one evaluation.
  maxSteps: number;
  // Characters in any one string a node produces.
  maxStringLength: number;
  // Values (scalars, array items, object fields) in any one result, shared
  // parts counted where they appear.
  maxValues: number;
};

export const DEFAULT_LIMITS: Limits = { maxSteps: 1_000_000, maxStringLength: 1_000_000, maxValues: 1_000_000 };

export type Budget = {
  readonly limits: Limits;
  steps: number;
  readonly sizes: WeakMap<object, number>;
};

export const createBudget = (limits?: Partial<Limits>): Budget => ({ limits: { ...DEFAULT_LIMITS, ...limits }, steps: 0, sizes: new WeakMap() });

const refuse = (what: string, limit: number): never => {
  throw new PrismError(`Evaluation stopped: ${what} (limit ${limit})`, ErrorCode.BUDGET, { details: { limit } });
};

export const spendStep = (budget: Budget): void => {
  budget.steps += 1;
  if (budget.steps > budget.limits.maxSteps) refuse('it evaluated too many nodes', budget.limits.maxSteps);
};

// The values `value` holds, as serialized — memoized per object, so a shared
// part is walked once and counted every time it appears.
const sizeOf = (value: JsonValue, budget: Budget): number => {
  if (value === null || typeof value !== 'object') return 1;
  const known = budget.sizes.get(value);
  if (known !== undefined) return known;
  let size = 1;
  for (const inner of Array.isArray(value) ? value : Object.values(value)) {
    size += sizeOf(inner, budget);
    if (size > budget.limits.maxValues) break;
  }
  budget.sizes.set(value, size);
  return size;
};

// Every node's output: a string's length, which is free to read.
export const measureString = (value: JsonValue, budget: Budget): void => {
  if (typeof value === 'string' && value.length > budget.limits.maxStringLength) refuse(`a string of ${value.length} characters`, budget.limits.maxStringLength);
};

// A value that can be reused into something bigger, and the result: its size.
export const measure = (value: JsonValue, budget: Budget | undefined): void => {
  if (budget === undefined) return;
  measureString(value, budget);
  if (value !== null && typeof value === 'object' && sizeOf(value, budget) > budget.limits.maxValues) {
    refuse('a result holding too many values', budget.limits.maxValues);
  }
};
