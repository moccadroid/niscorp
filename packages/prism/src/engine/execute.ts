import type { JsonValue, JsonObject, CompiledIr } from '../types';
import { evaluateNode } from './evaluate';
import { rehydrate } from './optimize';
import { createBudget, measure, type Limits } from './budget';

// Cores whose runtime annotations are known present. An IR fresh from
// compile() has them; one read back from storage (a jsonb row, a file) has
// lost them — they are non-enumerable by design — and would run every node
// through the evaluator's discriminant chain. The first execute of each core
// object restores them once; every later execute of that object is the fast
// path. Keyed weakly, so a dropped IR is not kept alive.
const hydrated = new WeakSet<object>();

export const execute = (ir: CompiledIr, source: JsonObject, limits?: Partial<Limits>): JsonValue => {
  // `ir.tables.paths` is not read here. It used to prime the path cache, and
  // rehydrate already puts each $ref's parsed path on the $ref itself. The
  // table also lists what is not a path: compile gathers it from every object
  // with a `$ref` key, a constant's data and a binding's name included, and
  // parsing those refused a config that never reads them.
  const { core } = ir;
  if (typeof core === 'object' && core !== null && !hydrated.has(core)) {
    rehydrate(core);
    hydrated.add(core);
  }

  // Evaluate the already-desugared core directly (no validation, no desugaring)
  const budget = createBudget(limits);
  const result = evaluateNode(core, { source, vars: {}, budget });
  measure(result, budget);
  return result;
};
