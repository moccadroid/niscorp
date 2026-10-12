import type { JsonValue, JsonObject, CompiledIr } from '../types';
import { evaluateNode } from './evaluate';
import { rehydrate } from './optimize';
import { createBudget, measure, type Limits } from './budget';

const hydrated = new WeakSet<object>();

export const execute = (ir: CompiledIr, source: JsonObject, limits?: Partial<Limits>): JsonValue => {
  // `ir.tables.paths` is not read: compile gathers it from every object with a
  // `$ref` key, a constant's data and a binding's name included, and parsing
  // those would refuse a config that never reads them.
  const { core } = ir;
  if (typeof core === 'object' && core !== null && !hydrated.has(core)) {
    rehydrate(core);
    hydrated.add(core);
  }

  const budget = createBudget(limits);
  const result = evaluateNode(core, { source, vars: {}, budget });
  measure(result, budget);
  return result;
};
