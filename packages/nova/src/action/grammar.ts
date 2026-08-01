import { OPS } from './mutations/ops';
import type { Mutation, Step } from './schemas';

// What a step list WRITES, derived from the op registry.
//
// Three places needed this and each kept its own copy of the op names: the
// runtime (which steps are mutations), the audit (which data paths a definition
// fills), and anything reflecting over a definition. `OPS` is already the single
// source of truth for operations, so it is the source of truth here too — adding
// an op stays a one-line change in ops/index.ts.

// Every mutation op's key. Derived, so it cannot drift from the ops themselves.
export const MUTATION_KEYS: readonly string[] = [...new Set(OPS.map((op) => op.key))];

// Each op's own discrimination. `push` and `pop` are the interesting ones: as a
// string they name a data path (a mutation), as anything else they are the
// navigation effect.
const MATCHERS = OPS.map((op) => op.match ?? ((step: Record<string, unknown>) => op.key in step));

export const isMutationStep = (step: Step): step is Mutation => MATCHERS.some((match) => match(step as unknown as Record<string, unknown>));

// Every data path a step list writes, at any depth. `call` branches nest their
// own steps, so one trigger can load and then set.
export const mutationPaths = (steps: unknown): string[] => {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const step = node as Record<string, unknown>;
    if (isMutationStep(step as unknown as Step)) {
      for (const key of MUTATION_KEYS) {
        const value = step[key];
        if (typeof value === 'string') found.push(value);
      }
    }
    walk(step['onSuccess']);
    walk(step['onError']);
  };
  walk(steps);
  return found;
};

// `openIssue.issue_id` and `openIssue` are one key: both point the card at an
// issue. Every reading below compares at this level.
export const rootOf = (path: string): string => path.split('.')[0] ?? path;
