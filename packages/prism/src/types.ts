export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

import type { Budget } from './engine/budget';

export type EvalContext = {
  readonly source: JsonValue;
  readonly vars: Record<string, JsonValue>;
  // Ops extend a context by spreading it, so every nested evaluation spends
  // the same budget.
  readonly budget?: Budget;
  // The tree being evaluated is kept and run again, so a `$const` is handed
  // out as a copy: a caller that changes a result must not change the next one.
  readonly kept?: boolean;
};

// Passed to every op: an op importing the evaluator would be a circular import.
export type EvaluateFn = (node: unknown, context: EvalContext) => JsonValue;

export type Result<T> = { ok: true; data: T } | { ok: false; error: Error };

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

export type ValidationIssue = {
  path: (string | number)[];
  message: string;
};

export type ValidationResult =
  | { ok: true; data: unknown }
  | { ok: false; issues: ValidationIssue[] };
