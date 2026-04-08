// ═══════════════════════════════════════════════════════════
// JSON Types
// ═══════════════════════════════════════════════════════════

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

// ═══════════════════════════════════════════════════════════
// Evaluation Context
// ═══════════════════════════════════════════════════════════

export type EvalContext = {
  readonly source: JsonObject;
  readonly vars: Record<string, JsonValue>;
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
