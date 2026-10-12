import type { z } from 'zod';

export type Explained = { path: (string | number)[]; message: string };

type Issue = z.core.$ZodIssue;

const segmentsOf = (path: readonly PropertyKey[]): (string | number)[] =>
  path.map((p) => (typeof p === 'number' ? p : String(p)));

const explainOne = (issue: Issue, prefix: (string | number)[]): Explained[] => {
  const here = [...prefix, ...segmentsOf(issue.path)];
  if (issue.code === 'invalid_key') return [{ path: here, message: issue.issues[0]?.message ?? issue.message }];
  if (issue.code !== 'invalid_union' || issue.errors.length === 0) return [{ path: here, message: issue.message }];
  let best: Explained[] = [];
  let bestDepth = -1;
  for (const branch of issue.errors) {
    const explained = branch.flatMap((i) => explainOne(i, here));
    const depth = Math.max(...explained.map((e) => e.path.length));
    // The branch that got furthest into the value is the one the config meant;
    // on a tie, fewer complaints is the closer match.
    if (depth > bestDepth || (depth === bestDepth && explained.length < best.length)) {
      best = explained;
      bestDepth = depth;
    }
  }
  return bestDepth <= here.length ? [{ path: here, message: 'Not a Prism node: no op matches, and it is not a plain value.' }] : best;
};

export const explainIssues = (issues: readonly Issue[]): Explained[] => issues.flatMap((i) => explainOne(i, []));
