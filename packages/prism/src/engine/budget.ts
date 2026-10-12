import type { JsonValue } from '../types';
import { PrismError, ErrorCode } from '../errors';

// Three limits, each for a shape the others cannot see. Steps are nodes
// evaluated: nested maps. String length: a `$reduce` that joins its accumulator
// with itself. Values are counted as serialized, a shared part every time it
// appears: a `$reduce` to [acc, acc] evaluates few nodes and shares its halves.
export type Limits = {
  maxSteps: number;
  maxStringLength: number;
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

export const measureString = (value: JsonValue, budget: Budget): void => {
  if (typeof value === 'string' && value.length > budget.limits.maxStringLength) refuse(`a string of ${value.length} characters`, budget.limits.maxStringLength);
};

export const measure = (value: JsonValue, budget: Budget | undefined): void => {
  if (budget === undefined) return;
  measureString(value, budget);
  if (value !== null && typeof value === 'object' && sizeOf(value, budget) > budget.limits.maxValues) {
    refuse('a result holding too many values', budget.limits.maxValues);
  }
};
