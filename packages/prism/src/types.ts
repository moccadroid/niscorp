// ═══════════════════════════════════════════════════════════
// JSON Types
// ═══════════════════════════════════════════════════════════

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

// ═══════════════════════════════════════════════════════════
// Evaluation Context
// ═══════════════════════════════════════════════════════════

import type { Budget } from './engine/budget';

export type EvalContext = {
  // The binding root for `$ref` paths — any JSON value. `$` resolves to it as-is
  // (object, array, or scalar); `getByPath` walks from there. Not forced to an
  // object: a transform over an array/scalar reply binds `$` directly.
  readonly source: JsonValue;
  readonly vars: Record<string, JsonValue>;
  // What this evaluation may still cost (engine/budget.ts). Ops extend a
  // context by spreading it, so every nested evaluation spends the same one.
  readonly budget?: Budget;
  // The tree being evaluated is kept and run again (engine/transform.ts), so
  // a `$const` is handed out as a copy: a caller that changes a result must
  // not change the next one.
  readonly kept?: boolean;
};

// ═══════════════════════════════════════════════════════════
// Evaluate Function (passed to ops to avoid circular imports)
// ═══════════════════════════════════════════════════════════

export type EvaluateFn = (node: unknown, context: EvalContext) => JsonValue;

// ═══════════════════════════════════════════════════════════
// Result Type
// ═══════════════════════════════════════════════════════════

export type Result<T> = { ok: true; data: T } | { ok: false; error: Error };

// ═══════════════════════════════════════════════════════════
// Compilation Types
// ═══════════════════════════════════════════════════════════

export type CompileOptions = {
  name?: string;
  version?: string;
};

export type OptimizationStats = {
  refsInlined: number;
  handlersAttached: number;
  constantsFolded: number;
};

export type CompiledIr = {
  irVersion: 1;
  compiler: { name: string; version: string };
  meta: {
    name?: string;
    createdAt: string;
    fingerprint: string;
    stats: {
      nodeCount: number;
      opCount: Record<string, number>;
      maxDepth: number;
      optimizations: OptimizationStats;
    };
  };
  tables: {
    paths: string[];
    strings: string[];
  };
  core: unknown;
};

// ═══════════════════════════════════════════════════════════
// Validation Types
// ═══════════════════════════════════════════════════════════

export type ValidationIssue = {
  path: (string | number)[];
  message: string;
};

export type ValidationResult =
  | { ok: true; data: unknown }
  | { ok: false; issues: ValidationIssue[] };
