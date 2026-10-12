import { OPS } from './mutations/ops';
import type { Mutation, Step } from './schemas';

export const MUTATION_KEYS: readonly string[] = [...new Set(OPS.map((op) => op.key))];

const MATCHERS = OPS.map((op) => op.match ?? ((step: Record<string, unknown>) => op.key in step));

export const isMutationStep = (step: Step): step is Mutation => MATCHERS.some((match) => match(step as unknown as Record<string, unknown>));

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

export const rootOf = (path: string): string => path.split('.')[0] ?? path;
