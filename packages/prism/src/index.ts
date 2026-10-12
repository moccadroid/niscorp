export { evaluate, evaluateSafe } from './engine/evaluate';
export type { EvaluateOptions } from './engine/evaluate';

export { compile } from './engine/compile';
export { execute } from './engine/execute';
export { DEFAULT_LIMITS } from './engine/budget';
export type { Limits } from './engine/budget';

export { validate } from './engine/validate';

export { getConfigJsonSchema, getNodeJsonSchema, getProfileJsonSchema } from './engine/documentation';
export type { JsonSchemaTarget } from './engine/documentation';

export { NodeSchema, OP_KEYS } from './schemas/node.schema';
export { ConfigSchema } from './schemas/config.schema';
export type { Config } from './schemas/config.schema';
export { MAPPING_OPS } from './schemas/profiles';
export type { OpKey } from './schemas/profiles';

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

export { PrismError, ErrorCode } from './errors';
export type { PrismErrorContext } from './errors';
