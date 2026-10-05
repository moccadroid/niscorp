// ═══════════════════════════════════════════════════════════
// @niscorp/prism — JSON Transformation Engine
// ═══════════════════════════════════════════════════════════

// Evaluation
export { evaluate, evaluateSafe } from './engine/evaluate';
// …in the shape a host's transform seam takes: `(config, source) => unknown`
export { prismTransform } from './engine/transform';

// Compilation
export { compile } from './engine/compile';
export { execute } from './engine/execute';
export { DEFAULT_LIMITS } from './engine/budget';
export type { Limits } from './engine/budget';

// Validation
export { validate } from './engine/validate';

// Documentation
export { getConfigJsonSchema, getNodeJsonSchema, getProfileJsonSchema } from './engine/documentation';
export type { JsonSchemaTarget } from './engine/documentation';

// Schemas
export { NodeSchema, OP_KEYS } from './schemas/node.schema';
export { ConfigSchema } from './schemas/config.schema';
export type { Config } from './schemas/config.schema';
export { MAPPING_OPS } from './schemas/profiles';
export type { OpKey } from './schemas/profiles';

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
