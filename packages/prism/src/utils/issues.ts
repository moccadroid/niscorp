import type { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Which of a config's errors to show.
//
// A Prism node is a union of ~80 branches, so a typo three levels deep in a
// `$map` body surfaced as ONE issue at the root — "Invalid input", path [] —
// carrying every branch's reasons. The branch worth reporting is the one the
// config actually meant, and that is the one that got furthest into the value
// before failing: `{ $get: { pathh } }` fails the `$get` branch at `$get`,
// while every other branch fails at the root. So: at every union, follow the
// branch whose issues reach deepest, and report its issues with full paths.
// ═══════════════════════════════════════════════════════════

export type Explained = { path: (string | number)[]; message: string };

type Issue = z.core.$ZodIssue;

const segmentsOf = (path: readonly PropertyKey[]): (string | number)[] =>
  path.map((p) => (typeof p === 'number' ? p : String(p)));

const explainOne = (issue: Issue, prefix: (string | number)[]): Explained[] => {
  const here = [...prefix, ...segmentsOf(issue.path)];
  // A record key that failed its own schema: say what the key schema said.
  if (issue.code === 'invalid_key') return [{ path: here, message: issue.issues[0]?.message ?? issue.message }];
  if (issue.code !== 'invalid_union' || issue.errors.length === 0) return [{ path: here, message: issue.message }];
  let best: Explained[] = [];
  let bestDepth = -1;
  for (const branch of issue.errors) {
    const explained = branch.flatMap((i) => explainOne(i, here));
    const depth = Math.max(...explained.map((e) => e.path.length));
    // Deeper wins; on a tie, fewer complaints is the closer match.
    if (depth > bestDepth || (depth === bestDepth && explained.length < best.length)) {
      best = explained;
      bestDepth = depth;
    }
  }
  // Nothing got past the union itself: no branch is a better story than the union's own.
  return bestDepth <= here.length ? [{ path: here, message: 'Not a Prism node: no op matches, and it is not a plain value.' }] : best;
};

export const explainIssues = (issues: readonly Issue[]): Explained[] => issues.flatMap((i) => explainOne(i, []));
