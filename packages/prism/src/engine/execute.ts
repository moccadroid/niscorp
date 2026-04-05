import type { JsonValue, JsonObject, CompiledIr } from '../types';
import { evaluateNode } from './evaluate';
import { primeJsonPathCache } from '../utils/jsonpath';

export const execute = (ir: CompiledIr, source: JsonObject): JsonValue => {
  // Prime the JSONPath cache with paths from compilation
  if (ir.tables.paths.length > 0) {
    primeJsonPathCache(ir.tables.paths);
  }

  // Evaluate the already-desugared core directly (no validation, no desugaring)
  return evaluateNode(ir.core, { source, vars: {} });
};
