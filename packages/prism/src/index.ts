// ═══════════════════════════════════════════════════════════
// @niscorp/prism — JSON Transformation Engine
// ═══════════════════════════════════════════════════════════

// Evaluation
export { evaluate, evaluateSafe } from './engine/evaluate';

// Compilation
export { compile } from './engine/compile';
export { execute } from './engine/execute';

// Validation
export { validate } from './engine/validate';

// Documentation
export { getConfigJsonSchema, getNodeJsonSchema } from './engine/documentation';
export type { JsonSchemaTarget } from './engine/documentation';

// Schemas
export { NodeSchema } from './schemas/node.schema';
export { ConfigSchema } from './schemas/config.schema';
export type { Config } from './schemas/config.schema';

// Types
export type {
  JsonPrimitive,
  JsonValue,
  JsonObject,
  EvalContext,
  Result,
  CompileOptions,
  CompiledIr,
  OptimizationStats,
  ValidationResult,
  ValidationIssue,
} from './types';

// Errors
export { PrismError, ErrorCode } from './errors';
export type { PrismErrorContext } from './errors';
