export type SchemaIssue = { code?: string; path: PropertyKey[]; message: string; errors?: SchemaIssue[][] };

const rootScore = (branch: SchemaIssue[]): number => {
  let score = 0;
  for (const issue of branch) {
    if (issue.path.length !== 0) continue;
    // A branch that rejects the root's type did not match the value's shape at
    // all; one that rejects only its keys nearly matched.
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
