// ═══════════════════════════════════════════════════════════
// Zod union issues that TEACH — for schemas whose unions can't be
// value-discriminated (nova's verb-keyed steps, node-or-string layout
// leaves). Zod reports "Invalid input" at the union node; the model
// needs "steps.0.call: expected string, received object".
//
// ONE ranking rule, no additions without a fixture: a branch that
// rejects the ROOT by type (never understood the value's shape) is
// disqualified before one that rejects it for unrecognized keys
// (right shape, stray key); survivors tie-break on fewest issues.
// ═══════════════════════════════════════════════════════════

export type SchemaIssue = { code?: string; path: PropertyKey[]; message: string; errors?: SchemaIssue[][] };

const rootScore = (branch: SchemaIssue[]): number => {
  let score = 0;
  for (const issue of branch) {
    if (issue.path.length !== 0) continue;
    // Wrong TYPE at root disqualifies hardest; unrecognized keys are a
    // near-match complaint; anything else at root sits between.
    score += issue.code === 'invalid_type' ? 100 : issue.code === 'unrecognized_keys' ? 1 : 10;
  }
  return score;
};

const pickBranch = (branches: SchemaIssue[][]): SchemaIssue[] =>
  branches.reduce((best, branch) => {
    const byRoot = rootScore(branch) - rootScore(best);
    if (byRoot !== 0) return byRoot < 0 ? branch : best;
    return branch.length < best.length ? branch : best;
  });

export const flattenSchemaIssues = (issues: SchemaIssue[], prefix: PropertyKey[] = []): SchemaIssue[] =>
  issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code !== 'invalid_union' || !issue.errors || issue.errors.length === 0) return [{ ...issue, path }];
    return flattenSchemaIssues(pickBranch(issue.errors), path);
  });
